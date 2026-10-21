import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { autoBindUtil, validateRequestMiddleware } from '@/common';
import { OptionalException } from '@/common/exceptions';
import auth from '@/common/middlewares/auth.middleware';
import { CardPermissionEnum } from '@/common/enums/permissions';
import { createApiResponse } from '@/swagger/openAPIResponseBuilders';
import { AttachmentsController } from './attachments.controller';
import { MAX_ATTACHMENT_BYTES } from './attachments.types';

export const attachmentsRegistry = new OpenAPIRegistry();
export const attachmentsRouter = Router({ mergeParams: true });
const controller = new AttachmentsController();
autoBindUtil(controller);
const params = z.strictObject({ cardId: z.uuid() });
const attachmentParams = params.extend({ attachmentId: z.uuid() });
const attachment = z.object({
	id: z.uuid(),
	cardId: z.uuid(),
	userId: z.uuid(),
	fileName: z.string(),
	fileSize: z.number(),
	mimeType: z.string().nullable(),
	createdAt: z.date(),
	downloadUrl: z.string().nullable(),
});
const upload = multer({
	storage: multer.memoryStorage(),
	// Busboy emits partsLimit at the limit; files/fields still enforce one payload part.
	limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1, fields: 0, parts: 2 },
}).single('file');
export const uploadAttachmentMiddleware: RequestHandler = (req, res, next) => {
	if (!req.is('multipart/form-data'))
		return next(
			new OptionalException(415, 'Use multipart/form-data with one file field'),
		);
	upload(req, res, (error: unknown) => {
		if (error instanceof multer.MulterError)
			return next(
				new OptionalException(
					error.code === 'LIMIT_FILE_SIZE' ? 413 : 422,
					error.code === 'LIMIT_FILE_SIZE'
						? 'Attachment exceeds 10 MiB'
						: 'Exactly one file field and no text fields are allowed',
				),
			);
		if (error) return next(new OptionalException(422, 'Invalid multipart request'));
		next();
	});
};
attachmentsRegistry.registerPath({
	method: 'post',
	path: '/cards/{cardId}/attachments',
	tags: ['Attachments'],
	request: {
		params,
		body: {
			required: true,
			content: {
				'multipart/form-data': {
					schema: z.object({
						file: z.string().openapi({ type: 'string', format: 'binary' }),
					}),
				},
			},
		},
	},
	responses: createApiResponse(attachment, 'Attachment saved', 201),
});
attachmentsRouter.post(
	'/',
	auth.verifyAccessToken,
	validateRequestMiddleware({ params, query: z.strictObject({}) }),
	auth.verifyBoardPermission(CardPermissionEnum.UPDATE_CARD),
	auth.verifyCardLifecycle(),
	uploadAttachmentMiddleware,
	controller.upload,
);

attachmentsRegistry.registerPath({
	method: 'get',
	path: '/cards/{cardId}/attachments',
	tags: ['Attachments'],
	request: { params },
	responses: createApiResponse(attachment.array(), 'Attachments', 200),
});
attachmentsRouter.get(
	'/',
	auth.verifyAccessToken,
	validateRequestMiddleware({ params, query: z.strictObject({}) }),
	auth.verifyBoardPermission(CardPermissionEnum.GET_CARD),
	controller.list,
);

attachmentsRegistry.registerPath({
	method: 'get',
	path: '/cards/{cardId}/attachments/{attachmentId}/download',
	tags: ['Attachments'],
	request: { params: attachmentParams },
	responses: createApiResponse(
		z.object({ url: z.string(), expiresAt: z.date() }),
		'Download URL, valid for 60 seconds',
		200,
	),
});
attachmentsRouter.get(
	'/:attachmentId/download',
	auth.verifyAccessToken,
	validateRequestMiddleware({ params: attachmentParams, query: z.strictObject({}) }),
	auth.verifyBoardPermission(CardPermissionEnum.GET_CARD),
	controller.download,
);

attachmentsRegistry.registerPath({
	method: 'delete',
	path: '/cards/{cardId}/attachments/{attachmentId}',
	tags: ['Attachments'],
	request: { params: attachmentParams },
	responses: createApiResponse(null, 'Attachment deleted; storage cleanup queued', 200),
});
attachmentsRouter.delete(
	'/:attachmentId',
	auth.verifyAccessToken,
	validateRequestMiddleware({ params: attachmentParams }),
	auth.verifyBoardPermission(CardPermissionEnum.DELETE_CARD),
	controller.delete,
);
