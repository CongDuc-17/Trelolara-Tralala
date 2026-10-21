import { z } from 'zod';

export const InvitationsResponseDtoSchema = z.object({
	id: z.uuid(),
	token: z.string(),
	email: z.string(),
	projectId: z.uuid().optional(),
	boardId: z.uuid().optional(),
	roleId: z.uuid(),
	inviterId: z.uuid(),
	type: z.enum(['EMAIL', 'LINK']),
	status: z.enum(['PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED']),
	expiresAt: z.date(),
	delivery: z.object({
		email: z.enum(['SENT', 'FAILED', 'NOT_APPLICABLE']),
		notification: z.enum(['SENT', 'FAILED', 'NOT_APPLICABLE']),
	}),
	shareUrl: z.url().optional(),
});
