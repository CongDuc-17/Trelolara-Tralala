import { OptionalException } from '@/common/exceptions';
import { CardPermissionEnum } from '@/common/enums/permissions';
import type { DatabaseClient } from '../database';
import { PermissionService } from '../permissions/permission.service';
import { PermissionsRepository } from '../permissions/permissions.repository';
import type { CardActivityQuery, CardActivityRecord } from './cardActivities.types';

export class CardActivitiesRepository {
	canRead(userId: string, boardId: string, client: DatabaseClient): Promise<boolean> {
		return new PermissionService(
			new PermissionsRepository(client),
		).hasBoardPermission(userId, boardId, [CardPermissionEnum.GET_CARD]);
	}
	async list(
		cardId: string,
		query: CardActivityQuery,
		client: DatabaseClient,
	): Promise<CardActivityRecord[]> {
		const cursor = query.cursor
			? await client.cardActivity.findFirst({
					where: { id: query.cursor, cardId },
					select: { id: true, createdAt: true },
				})
			: null;
		if (query.cursor && !cursor)
			throw new OptionalException(422, 'Invalid activity cursor for this card');
		return client.cardActivity.findMany({
			where: {
				cardId,
				...(cursor
					? {
							OR: [
								{ createdAt: { lt: cursor.createdAt } },
								{ createdAt: cursor.createdAt, id: { lt: cursor.id } },
							],
						}
					: {}),
			},
			orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
			take: query.limit + 1,
			select: {
				id: true,
				cardId: true,
				userId: true,
				action: true,
				details: true,
				metadata: true,
				createdAt: true,
				user: { select: { id: true, name: true, avatar: true } },
			},
		});
	}
}
