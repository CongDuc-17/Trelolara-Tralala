import { ZodValidationSchema } from '@/common';
import { z } from 'zod';

const tokenRequestParams = z
	.object({
		token: z.string().min(1).max(512),
	})
	.strict();

export const TokenRequestValidationSchema: ZodValidationSchema = {
	params: tokenRequestParams,
};
export const TokenInvitationRequestSchema = {
	params: tokenRequestParams,
};
