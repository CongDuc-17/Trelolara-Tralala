import type { Prisma } from '@prisma/client';
import { OptionalException } from '@/common/exceptions';
import { prisma, type DatabaseClient } from '../database';
import { PermissionsRepository } from '../permissions/permissions.repository';
import type { CardSearchInput } from './card-search.schema';

export function cardFilterWhere(
	input: CardSearchInput,
	now: Date,
): Prisma.cardsWhereInput {
	const active = { status: 'ACTIVE', deletedAt: null } as const;
	const conditions: Prisma.cardsWhereInput[] = [
		{
			list: {
				board: {
					status: { not: 'DELETED' },
					project: { status: { not: 'DELETED' } },
				},
			},
		},
	];
	if (input.status === 'ACTIVE')
		conditions.push({
			...active,
			list: { ...active, board: { ...active, project: active } },
		});
	if (input.status === 'ARCHIVED')
		conditions.push({
			OR: [
				{ status: 'ARCHIVED' },
				{ list: { status: 'ARCHIVED' } },
				{ list: { board: { status: 'ARCHIVED' } } },
				{ list: { board: { project: { status: 'ARCHIVED' } } } },
			],
		});
	if (input.keyword)
		conditions.push({ title: { contains: input.keyword, mode: 'insensitive' } });
	if (input.memberIds)
		conditions.push({ cardMembers: { some: { userId: { in: input.memberIds } } } });
	if (input.labelIds)
		conditions.push({ cardLabels: { some: { labelId: { in: input.labelIds } } } });
	if (input.isComplete !== undefined) conditions.push({ isComplete: input.isComplete });
	if (input.due === 'none') conditions.push({ dueDate: null });
	if (input.due === 'overdue')
		conditions.push({ isComplete: false, dueDate: { lt: now } });
	if (input.due === 'soon')
		conditions.push({
			isComplete: false,
			dueDate: { gte: now, lte: new Date(now.getTime() + 86400000) },
		});
	return { AND: conditions };
}
export class CardSearchRepository {
	constructor(private readonly client: DatabaseClient = prisma) {}
	async search(
		actorId: string,
		input: CardSearchInput,
		boardId?: string,
		now = new Date(),
	) {
		const scope = await new PermissionsRepository(this.client).boardReadScope(
			actorId,
			'GET_CARD',
		);
		const where: Prisma.cardsWhereInput = {
			AND: [
				cardFilterWhere(input, now),
				{
					list: {
						board: { AND: [scope, ...(boardId ? [{ id: boardId }] : [])] },
					},
				},
				...(!boardId ? [{ cardMembers: { some: { userId: actorId } } }] : []),
			],
		};
		let after: Prisma.cardsWhereInput = {};
		if (input.cursor) {
			const cursor = await this.client.cards.findFirst({
				where: { AND: [where, { id: input.cursor }] },
				select: { id: true, createdAt: true },
			});
			if (!cursor)
				throw new OptionalException(
					422,
					'Cursor is outside the current card filter',
				);
			after = {
				OR: [
					{ createdAt: { lt: cursor.createdAt } },
					{ createdAt: cursor.createdAt, id: { lt: cursor.id } },
				],
			};
		}
		const rows = await this.client.cards.findMany({
			where: { AND: [where, after] },
			orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
			take: input.limit + 1,
			select: {
				id: true,
				title: true,
				description: true,
				dueDate: true,
				isComplete: true,
				reminderMinutesBefore: true,
				status: true,
				position: true,
				listId: true,
				createdAt: true,
				list: {
					select: {
						id: true,
						name: true,
						status: true,
						board: {
							select: {
								id: true,
								name: true,
								status: true,
								projectId: true,
								project: { select: { status: true } },
							},
						},
					},
				},
				cardMembers: {
					select: {
						userId: true,
						user: { select: { id: true, name: true, avatar: true } },
					},
				},
				cardLabels: {
					select: { label: { select: { id: true, name: true, color: true } } },
				},
				_count: { select: { attachments: true } },
			},
		});
		const items = rows.slice(0, input.limit);
		return {
			items,
			nextCursor: rows.length > input.limit ? items[items.length - 1].id : null,
		};
	}
}
