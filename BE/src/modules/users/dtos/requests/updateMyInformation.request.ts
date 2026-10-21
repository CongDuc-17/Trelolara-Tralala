import z from 'zod';

import type { ZodValidationSchema } from '@/common/middlewares/validationRequest.middleware';

export class UpdateMyInformationRequestDto {
	name?: string;
	email?: string;
	bio?: string;
	address?: string;

	constructor(data: Partial<UpdateMyInformationRequestDto> = {}) {
		this.name = data.name;
		this.email = data.email;
		this.bio = data.bio;
		this.address = data.address;
	}
}

const emptyStringToUndefined = (val: unknown) => {
	if (typeof val === 'string' && val.trim() === '') {
		return undefined;
	}
	return val;
};

export const updateMyInformationRequestBody = z
	.object({
		name: z.preprocess(emptyStringToUndefined, z.string().optional()),
		email: z.preprocess(emptyStringToUndefined, z.string().email().optional()),
		bio: z.preprocess(emptyStringToUndefined, z.string().optional()),
		address: z.preprocess(emptyStringToUndefined, z.string().optional()),
		avatar: z.string().optional(),
	})
	.strict();

export const updateMyInformationRequestValidationSchema: ZodValidationSchema = {
	body: updateMyInformationRequestBody,
};

const swaggerMultipartSchema = z.object({
	name: z.string().optional(),
	email: z.string().email().optional(),
	bio: z.string().optional(),
	address: z.string().optional(),
	avatar: z
		.string()
		.openapi({
			format: 'binary',
			description: 'Optional avatar image file',
		})
		.optional(),
});

export const updateMyInformationRequestSchema = {
	body: {
		description: 'Update my information with optional avatar',
		content: {
			'multipart/form-data': {
				schema: swaggerMultipartSchema,
			},
		},
	},
};
