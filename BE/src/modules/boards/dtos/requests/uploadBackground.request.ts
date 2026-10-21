import z from 'zod';

const getBoardByIdRequestParams = z
	.object({
		boardId: z.string().uuid(),
	})
	.strict();

export const UploadBackgroundMultipartRequestSchema = z.object({
	background: z
		.string()
		.openapi({
			format: 'binary',
			description: 'Background image file',
		})
		.optional(),
});

export const UploadBackgroundRequestSchema = {
	params: getBoardByIdRequestParams,
	body: {
		description: 'Upload a background image for the board',
		content: {
			'multipart/form-data': {
				schema: UploadBackgroundMultipartRequestSchema,
			},
		},
	},
};
