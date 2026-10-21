import 'reflect-metadata';
import { BoardsService } from '@/modules/boards/boards.service';
import { BoardsRepository } from '@/modules/boards/boards.repository';
import {
	deleteImageFromCloudinary,
	extractPublicIdFromUrl,
	uploadImageFromBuffer,
} from '@/common/utils/cloudinary.utils';

jest.mock('@/common/utils/cloudinary.utils', () => ({
	deleteImageFromCloudinary: jest.fn(),
	extractPublicIdFromUrl: jest.fn(),
	uploadImageFromBuffer: jest.fn(),
}));

describe('background cleanup compatibility with shared image storage', () => {
	const file = {
		buffer: Buffer.from('image'),
		mimetype: 'image/png',
	} as Express.Multer.File;
	const upload = {
		public_id: 'new-image',
		secure_url: 'https://new.example/image.png',
	};

	function setup() {
		const repository = {
			getBoardById: jest.fn().mockResolvedValue({
				id: 'board',
				name: 'Board',
				description: null,
				projectId: 'project',
				status: 'ACTIVE',
				deletedAt: null,
				background: 'https://old.example/image.png',
			}),
			updateBoard: jest.fn().mockResolvedValue({}),
			lockBoard: jest.fn(),
			getProject: jest
				.fn()
				.mockResolvedValue({ status: 'ACTIVE', deletedAt: null }),
			inTransaction: jest.fn(),
		};
		repository.inTransaction.mockImplementation((work) => work(repository, {}));
		repository.updateBoard.mockResolvedValue({
			id: 'board',
			projectId: 'project',
			name: 'Board',
			description: null,
			background: upload.secure_url,
		});
		jest.mocked(uploadImageFromBuffer).mockResolvedValue(
			upload as Awaited<ReturnType<typeof uploadImageFromBuffer>>,
		);
		jest.mocked(extractPublicIdFromUrl).mockReturnValue('old-image');
		jest.mocked(deleteImageFromCloudinary).mockResolvedValue(undefined);
		jest.spyOn(console, 'error').mockImplementation(() => undefined);
		return {
			repository,
			service: new BoardsService(repository as unknown as BoardsRepository),
		};
	}

	it('keeps the committed image when deleting the old image fails', async () => {
		const { service, repository } = setup();
		jest.mocked(deleteImageFromCloudinary).mockRejectedValueOnce(
			new Error('provider failure'),
		);
		await expect(service.uploadBackground('board', file)).resolves.toMatchObject({
			background: upload.secure_url,
		});
		expect(repository.updateBoard).toHaveBeenCalledWith('board', {
			background: upload.secure_url,
		});
		expect(deleteImageFromCloudinary).toHaveBeenCalledTimes(1);
		expect(deleteImageFromCloudinary).toHaveBeenCalledWith('old-image');
	});

	it('cleans up only the new image after a failed database write, even when cleanup also fails', async () => {
		const { service, repository } = setup();
		repository.updateBoard.mockRejectedValueOnce(new Error('database failure'));
		jest.mocked(deleteImageFromCloudinary).mockRejectedValueOnce(
			new Error('provider failure'),
		);
		await expect(service.uploadBackground('board', file)).rejects.toMatchObject({
			status: 500,
		});
		expect(deleteImageFromCloudinary).toHaveBeenCalledTimes(1);
		expect(deleteImageFromCloudinary).toHaveBeenCalledWith(upload.public_id);
	});
});
