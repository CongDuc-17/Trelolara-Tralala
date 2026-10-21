import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { CardSearchRepository } from '@/modules/cards/card-search.repository';
import { CardReminderRepository } from '@/modules/cardReminders/card-reminder.repository';
import { CardReminderService } from '@/modules/cardReminders/card-reminder.service';
import { rescheduleCardReminder } from '@/modules/cardReminders/card-reminder.schedule';
import { cardSearchQuery } from '@/modules/cards/card-search.schema';
import { BoardRealtimeRepository } from '@/socket/board-realtime.repository';

// Explicit opt-in only. Migrations must already be deployed to a disposable *_test database.
const integration =
	process.env.RUN_POSTGRES_INTEGRATION === '1' ? describe : describe.skip;
integration(
	'PostgreSQL card discovery, reminder locking and transactional board revisions',
	() => {
		let client: PrismaClient;
		const userId = randomUUID(),
			projectId = randomUUID(),
			boardId = randomUUID(),
			listId = randomUUID(),
			cardId = randomUUID(),
			roleId = randomUUID(),
			projectRoleId = randomUUID();
		const dueDate = new Date('2026-10-22T12:00:00Z');
		const now = new Date(dueDate.getTime() - 3600000);
		beforeAll(async () => {
			const url = process.env.TEST_DATABASE_URL;
			if (!url || !new URL(url).pathname.endsWith('_test'))
				throw new Error(
					'Provide TEST_DATABASE_URL for a disposable database ending in _test',
				);
			client = new PrismaClient({ datasourceUrl: url });
			await client.$transaction(async (tx) => {
				await tx.users.create({
					data: {
						id: userId,
						email: `${userId}@integration.invalid`,
						name: 'Integration assignee',
						verify: true,
					},
				});
				await tx.roles.create({ data: { id: roleId, name: `BOARD_${roleId}` } });
				await tx.roles.create({
					data: { id: projectRoleId, name: `PROJECT_${projectRoleId}` },
				});
				for (const name of ['GET_CARD', 'GET_BOARD']) {
					const permission = await tx.permissions.upsert({
						where: { name },
						create: { name },
						update: {},
					});
					await tx.rolesPermissions.create({
						data: { roleId, permissionId: permission.id },
					});
					await tx.rolesPermissions.create({
						data: { roleId: projectRoleId, permissionId: permission.id },
					});
				}
				await tx.projects.create({
					data: { id: projectId, name: 'Integration project' },
				});
				await tx.boards.create({
					data: { id: boardId, name: 'Integration board', projectId },
				});
				await tx.boardMembers.create({
					data: { userId, boardId, roleId, accepted: false },
				});
				await tx.lists.create({
					data: { id: listId, name: 'Integration list', boardId, position: 1 },
				});
				const card = await tx.cards.create({
					data: {
						id: cardId,
						title: 'Integration task',
						listId,
						position: 1,
						dueDate,
						reminderMinutesBefore: 60,
					},
				});
				await tx.cardMembers.create({ data: { userId, cardId } });
				await rescheduleCardReminder(tx, card);
			});
		});
		afterAll(async () => {
			if (!client) return;
			try {
				await client.$transaction(async (tx) => {
					await tx.notifications.deleteMany({ where: { userId } });
					await tx.cardMembers.deleteMany({ where: { cardId } });
					await tx.cards.deleteMany({ where: { id: cardId } });
					await tx.lists.deleteMany({ where: { id: listId } });
					await tx.boardMembers.deleteMany({ where: { boardId } });
					await tx.projectMembers.deleteMany({ where: { projectId } });
					await tx.boards.deleteMany({ where: { id: boardId } });
					await tx.projects.deleteMany({ where: { id: projectId } });
					await tx.rolesPermissions.deleteMany({
						where: { roleId: { in: [roleId, projectRoleId] } },
					});
					await tx.roles.deleteMany({
						where: { id: { in: [roleId, projectRoleId] } },
					});
					await tx.users.deleteMany({ where: { id: userId } });
					await tx.boardChanges.deleteMany({ where: { boardId } });
				});
			} finally {
				await client.$disconnect();
			}
		});
		it('keeps legacy membership access but excludes outsiders and archived ancestors from My work', async () => {
			const repository = new CardSearchRepository(client);
			expect(
				(await repository.search(userId, cardSearchQuery.parse({}))).items.map(
					(row) => row.id,
				),
			).toContain(cardId);
			expect(
				(
					await repository.search(
						randomUUID(),
						cardSearchQuery.parse({}),
						boardId,
					)
				).items,
			).toEqual([]);
			await client.projects.update({
				where: { id: projectId },
				data: { status: 'ARCHIVED', deletedAt: now },
			});
			expect(
				(await repository.search(userId, cardSearchQuery.parse({}))).items,
			).toEqual([]);
			expect(
				(
					await repository.search(
						userId,
						cardSearchQuery.parse({ status: 'ARCHIVED' }),
						boardId,
					)
				).items.map((row) => row.id),
			).toContain(cardId);
			await client.projects.update({
				where: { id: projectId },
				data: { status: 'ACTIVE', deletedAt: null },
			});
		});
		it('does not expose an uncommitted revision and rolls it back with the mutation', async () => {
			const before = await client.boardChanges.findUniqueOrThrow({
				where: { boardId },
			});
			await expect(
				client.$transaction(async (tx) => {
					await tx.cards.update({
						where: { id: cardId },
						data: { title: 'Rolled back' },
					});
					const inside = await tx.boardChanges.findUniqueOrThrow({
						where: { boardId },
					});
					expect(inside.revision > before.revision).toBe(true);
					expect(
						(
							await client.boardChanges.findUniqueOrThrow({
								where: { boardId },
							})
						).revision,
					).toBe(before.revision);
					throw new Error('force rollback');
				}),
			).rejects.toThrow('force rollback');
			expect(
				(await client.boardChanges.findUniqueOrThrow({ where: { boardId } }))
					.revision,
			).toBe(before.revision);
		});
		it('serializes independent reminder consumers under PostgreSQL row locks', async () => {
			const candidate = await client.cardReminders.findUniqueOrThrow({
				where: { cardId },
			});
			const a = new CardReminderService(new CardReminderRepository(client));
			const b = new CardReminderService(new CardReminderRepository(client));
			const results = await Promise.all([
				a.process(candidate, () => now),
				b.process(candidate, () => now),
			]);
			expect(results.map((rows) => rows.length).sort()).toEqual([0, 1]);
			expect(
				await client.notifications.count({
					where: { userId, type: 'CARD_DUE_SOON', entityId: cardId },
				}),
			).toBe(1);
		});
		it('inherits project grants and withdraws discovery/subscription when the remaining membership is removed', async () => {
			await client.projectMembers.create({
				data: { userId, projectId, roleId: projectRoleId, accepted: false },
			});
			await client.boardMembers.delete({
				where: { userId_boardId: { userId, boardId } },
			});
			const realtime = new BoardRealtimeRepository(client);
			expect(await realtime.snapshot(userId, boardId)).not.toBeNull();
			await client.projectMembers.delete({
				where: { projectId_userId: { userId, projectId } },
			});
			expect(await realtime.snapshot(userId, boardId)).toBeNull();
			expect(
				(
					await new CardSearchRepository(client).search(
						userId,
						cardSearchQuery.parse({}),
					)
				).items,
			).toEqual([]);
		});
	},
);
