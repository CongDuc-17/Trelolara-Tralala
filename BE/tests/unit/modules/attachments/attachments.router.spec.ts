import 'reflect-metadata';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import {
	attachmentsRouter,
	attachmentsRegistry,
} from '@/modules/attachments/attachments.router';
import { AttachmentsService } from '@/modules/attachments/attachments.service';
import { PermissionsRepository } from '@/modules/permissions/permissions.repository';
import { errorHandlerMiddleware } from '@/common/middlewares/errorHandler.middleware';
import { attachmentFile } from '../../../fixtures/attachment-files';

jest.mock('@/modules/attachments/attachments.service');
jest.mock('@/modules/database', () => ({ prisma: {} }));
jest.mock('@/common/middlewares/auth.middleware', () => {
	const actual = jest.requireActual<
		typeof import('@/common/middlewares/auth.middleware')
	>('@/common/middlewares/auth.middleware');
	actual.default.verifyAccessToken = (req, _res, next) => {
		req.user = { id: 'e81da272-2fbf-47fc-a1af-7cd510086071' };
		next();
	};
	return actual;
});
const id = 'e81da272-2fbf-47fc-a1af-7cd510086071';
let server: Server;
let url: string;
const upload = jest.mocked(AttachmentsService.prototype.upload);
const list = jest.mocked(AttachmentsService.prototype.list);
const download = jest.mocked(AttachmentsService.prototype.download);
const remove = jest.mocked(AttachmentsService.prototype.delete);

beforeAll(async () => {
	const app = express();
	app.use('/cards/:cardId/attachments', attachmentsRouter);
	app.use(errorHandlerMiddleware);
	server = createServer(app);
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/cards/${id}/attachments`;
});
afterAll(async () => {
	await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
	jest.spyOn(PermissionsRepository.prototype, 'findBoardId').mockResolvedValue(id);
	jest.spyOn(PermissionsRepository.prototype, 'findBoardProjectId').mockResolvedValue(
		id,
	);
	jest.spyOn(PermissionsRepository.prototype, 'listSystemRoles').mockResolvedValue([]);
	jest.spyOn(PermissionsRepository.prototype, 'listProjectRoles').mockResolvedValue([]);
	jest.spyOn(PermissionsRepository.prototype, 'listBoardRoles').mockResolvedValue([
		{ name: 'BOARD_MEMBER', permissions: ['GET_CARD', 'UPDATE_CARD', 'DELETE_CARD'] },
	]);
	jest.spyOn(PermissionsRepository.prototype, 'findBoardState').mockResolvedValue({
		status: 'ACTIVE',
		deletedAt: null,
		project: { status: 'ACTIVE', deletedAt: null },
	});
	jest.spyOn(PermissionsRepository.prototype, 'findListState').mockResolvedValue({
		status: 'ACTIVE',
		deletedAt: null,
	});
	jest.spyOn(PermissionsRepository.prototype, 'findCardState').mockResolvedValue({
		status: 'ACTIVE',
		deletedAt: null,
	});
	upload.mockResolvedValue({
		id,
		cardId: id,
		userId: id,
		fileName: 'sample.png',
		fileSize: 1,
		mimeType: 'image/png',
		createdAt: new Date(),
		downloadUrl: `${url}/${id}/download`,
	});
	list.mockResolvedValue([]);
	remove.mockResolvedValue(undefined);
	download.mockResolvedValue({
		url: 'https://provider.invalid/signed',
		expiresAt: new Date(),
	});
});
function multipart(field = 'file', bytes = attachmentFile().buffer): FormData {
	const form = new FormData();
	form.append(
		field,
		new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
		'sample.png',
	);
	return form;
}
describe('Attachment HTTP contract and multipart boundary', () => {
	it('parses one multipart file after auth/permission and returns 201', async () => {
		const response = await fetch(url, { method: 'POST', body: multipart() });
		expect(response.status).toBe(201);
		expect(await response.json()).toMatchObject({ success: true, data: { id } });
		expect(upload).toHaveBeenCalledWith(
			id,
			id,
			expect.objectContaining({
				buffer: attachmentFile().buffer,
				originalname: 'sample.png',
				mimetype: 'image/png',
			}),
		);
	});
	it('rejects an invalid ID before scope resolution or multipart processing', async () => {
		const response = await fetch(url.replace(id, 'bad'), {
			method: 'POST',
			body: 'invalid multipart',
		});
		expect(response.status).toBe(422);
		expect(PermissionsRepository.prototype.findBoardId).not.toHaveBeenCalled();
		expect(upload).not.toHaveBeenCalled();
	});
	it.each(['outsider', 'viewer'])(
		'rejects an %s before interpreting the upload body',
		async (role) => {
			jest.mocked(PermissionsRepository.prototype.listBoardRoles).mockResolvedValue(
				role === 'viewer'
					? [
							{
								name: 'BOARD_VIEWER',
								permissions: ['GET_CARD', 'UPDATE_CARD', 'DELETE_CARD'],
							},
						]
					: [],
			);
			const response = await fetch(url, {
				method: 'POST',
				body: 'invalid multipart',
			});
			expect(response.status).toBe(403);
			expect(upload).not.toHaveBeenCalled();
		},
	);
	it('allows viewer reads/downloads, blocks viewer deletion and does not cache signed downloads', async () => {
		jest.mocked(PermissionsRepository.prototype.listBoardRoles).mockResolvedValue([
			{ name: 'BOARD_VIEWER', permissions: ['GET_CARD', 'DELETE_CARD'] },
		]);
		const response = await fetch(url);
		expect(response.status).toBe(200);
		const downloaded = await fetch(`${url}/${id}/download`);
		expect(downloaded.status).toBe(200);
		expect(downloaded.headers.get('cache-control')).toBe('private, no-store');
		expect(await downloaded.json()).toMatchObject({
			success: true,
			data: { url: 'https://provider.invalid/signed' },
		});
		expect((await fetch(`${url}/${id}`, { method: 'DELETE' })).status).toBe(403);
	});
	it('blocks archived uploads but allows authorized reads and deletion', async () => {
		jest.mocked(PermissionsRepository.prototype.findBoardState).mockResolvedValue({
			status: 'ARCHIVED',
			deletedAt: null,
			project: { status: 'ARCHIVED', deletedAt: null },
		});
		expect((await fetch(url, { method: 'POST', body: multipart() })).status).toBe(
			409,
		);
		expect((await fetch(url)).status).toBe(200);
		const response = await fetch(`${url}/${id}`, { method: 'DELETE' });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true, data: null });
		expect(remove).toHaveBeenCalledWith(id, id, id);
	});
	it.each(['wrong-field', 'extra-field', 'two-files', 'too-large'])(
		'rejects %s before the upload use case',
		async (invalid) => {
			const form = multipart(
				invalid === 'wrong-field' ? 'avatar' : 'file',
				invalid === 'too-large' ? Buffer.alloc(10 * 1024 * 1024 + 1) : undefined,
			);
			if (invalid === 'extra-field') form.append('storagePublicId', 'foreign');
			if (invalid === 'two-files')
				form.append('file', new Blob(['second']), 'second.png');
			const response = await fetch(url, { method: 'POST', body: form });
			expect(response.status).toBe(invalid === 'too-large' ? 413 : 422);
			expect(upload).not.toHaveBeenCalled();
		},
	);
	it('registers all four endpoints with binary upload and download expiry metadata', () => {
		const document = new OpenApiGeneratorV3(
			attachmentsRegistry.definitions,
		).generateDocument({
			openapi: '3.0.0',
			info: { title: 'Attachments', version: '1' },
		});
		expect(
			document.paths['/cards/{cardId}/attachments']?.post?.responses['201'],
		).toBeDefined();
		expect(document.paths['/cards/{cardId}/attachments']?.get).toBeDefined();
		expect(
			document.paths['/cards/{cardId}/attachments/{attachmentId}/download']?.get,
		).toBeDefined();
		expect(
			document.paths['/cards/{cardId}/attachments/{attachmentId}']?.delete,
		).toBeDefined();
	});
});
