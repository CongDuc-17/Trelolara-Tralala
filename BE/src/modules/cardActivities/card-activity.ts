import type { Prisma } from '@prisma/client';
import { OptionalException } from '@/common/exceptions';
import type { DatabaseClient } from '../database';
import type { CardActivityEvent } from './cardActivities.types';

/** Caller owns the mutation transaction; this writer never delivers notifications. */
export async function recordCardActivity(
	client: DatabaseClient,
	event: CardActivityEvent,
): Promise<void> {
	if (!event.userId) throw new OptionalException(422, 'Activity actor is required');
	await client.cardActivity.create({
		data: {
			cardId: event.cardId,
			userId: event.userId,
			action: event.action,
			// Dates become UTC strings; Prisma JSON types stay inside persistence.
			metadata: JSON.parse(JSON.stringify(event.metadata)) as Prisma.InputJsonValue,
		},
	});
}
