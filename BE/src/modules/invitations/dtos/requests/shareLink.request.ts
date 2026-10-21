import { z } from 'zod';
import { ZodValidationSchema } from '@/common';
const shareLinkBodyRequestSchema = z.object({
	roleId: z.uuid().optional(),
});

export const shareLinkForProjectRequestParams = z
	.object({
		projectId: z.string().uuid(),
	})
	.strict();

export const shareLinkForBoardRequestParams = z
	.object({
		boardId: z.string().uuid(),
	})
	.strict();

export const ShareLinkRequestValidationSchemaProject: ZodValidationSchema = {
	params: shareLinkForProjectRequestParams,
	body: shareLinkBodyRequestSchema,
};

export const ShareLinkRequestValidationSchemaBoard: ZodValidationSchema = {
	params: shareLinkForBoardRequestParams,
	body: shareLinkBodyRequestSchema,
};

export const ShareLinkRequestValidationSchema: ZodValidationSchema = {
	params: z.union([shareLinkForProjectRequestParams, shareLinkForBoardRequestParams]),
	body: shareLinkBodyRequestSchema,
};

export const ShareLinkRequestSchemaProject = {
	params: shareLinkForProjectRequestParams,
	body: {
		description: 'Share Link Body',
		content: {
			'application/json': {
				schema: shareLinkBodyRequestSchema,
			},
		},
	},
};

export const ShareLinkRequestSchemaBoard = {
	params: shareLinkForBoardRequestParams,
	body: {
		description: 'Share Link Body',
		content: {
			'application/json': {
				schema: shareLinkBodyRequestSchema,
			},
		},
	},
};
