import z from 'zod';

import { ZodValidationSchema } from '@/common';
import { UserRoleEnum } from '@/common/enums/roles/userRole.enum';

export class RegisterRequestDto {
	email: string;
	password: string;
	name: string;
	role?: UserRoleEnum.USER;
}

export const registerRequestValidationSchema = {
	body: z.object({
		email: z.email(),
		password: z.string().min(8),
		name: z.string().min(2).max(100),
		role: z.literal(UserRoleEnum.USER).optional(),
	}),
} satisfies ZodValidationSchema;

export const registerRequestSchema = {
	body: {
		description: 'Create a new account',
		content: {
			'application/json': {
				schema: registerRequestValidationSchema.body!,
			},
		},
	},
};
