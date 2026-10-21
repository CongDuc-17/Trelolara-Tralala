import { UsersService } from '@/modules/users/users.service';
import { UpdateProfileInput, UserProfile } from '@/modules/users/users.types';

const user: UserProfile = {
	id: 'user-1',
	email: 'reader@example.com',
	name: 'Reader',
	bio: null,
	address: null,
	avatar: 'https://res.cloudinary.com/test/image/upload/v1/TrelloLike_Avatars/old.png',
	verify: true,
	status: 'ACTIVE',
	createdAt: new Date('2026-01-01'),
	updatedAt: new Date('2026-01-02'),
	deletedAt: null,
};

function setup() {
	const repository = {
		findUser: jest.fn(async () => user as UserProfile | null),
		findUsers: jest.fn(async () => [[user], 21] as [UserProfile[], number]),
		updateUser: jest.fn(
			async (input: {
				userId: string;
				user: UpdateProfileInput & { avatar?: string };
			}) => ({ ...user, ...input.user }),
		),
	};
	const auth = { changePassword: jest.fn(async () => undefined) };
	const storage = {
		upload: jest.fn(async () => ({
			secure_url: 'https://example.com/new.png',
			public_id: 'TrelloLike_Avatars/new',
		})),
		delete: jest.fn(async () => undefined),
		extractPublicId: jest.fn(() => 'TrelloLike_Avatars/old' as string | null),
	};
	return {
		service: new UsersService(repository, auth, storage),
		repository,
		auth,
		storage,
	};
}

const file = { buffer: Buffer.from('image'), mimetype: 'image/png' };

describe('UsersService with isolated persistence, credentials and storage', () => {
	it('returns a plain page and keeps the current exact-name/status query', async () => {
		const { service, repository } = setup();
		const page = await service.getUsers(
			{ name: 'Reader', status: 'ACTIVE' },
			{ page: 2, limit: 10 },
		);
		expect(repository.findUsers).toHaveBeenCalledWith({
			name: 'Reader',
			status: 'ACTIVE',
			skip: 10,
			take: 10,
		});
		expect(page).toEqual({ items: [user], totalItems: 21, page: 2, limit: 10 });
		expect(page).not.toHaveProperty('success');
	});

	it('returns not-found rather than a nullable profile', async () => {
		const { service, repository } = setup();
		repository.findUser.mockResolvedValueOnce(null);
		await expect(
			service.getUserByUserId({ userId: user.id, status: 'ACTIVE' }),
		).rejects.toMatchObject({ status: 404 });
		expect(repository.findUser).toHaveBeenCalledWith({
			userId: user.id,
			userStatus: 'ACTIVE',
		});
	});

	it('updates only allowed, changed fields without mutating input or accepting profile privilege fields', async () => {
		const { service, repository } = setup();
		const input = {
			name: 'New name',
			email: user.email,
			bio: undefined,
			status: 'LOCKED',
			verify: false,
			id: 'another-user',
			avatar: 'untrusted-url',
		};
		const result = await service.updateMyInformation(input, user.id);
		expect(repository.updateUser).toHaveBeenCalledWith({
			userId: user.id,
			user: { name: 'New name' },
		});
		expect(input.avatar).toBe('untrusted-url');
		expect(result.status).toBe('ACTIVE');
	});

	it('rejects a profile without effective changes and does not contact storage', async () => {
		const { service, repository, storage } = setup();
		await expect(
			service.updateMyInformation({ name: user.name }, user.id),
		).rejects.toMatchObject({ status: 422 });
		expect(repository.updateUser).not.toHaveBeenCalled();
		expect(storage.upload).not.toHaveBeenCalled();
	});

	it('uploads, saves and only then deletes the previous avatar', async () => {
		const { service, repository, storage } = setup();
		await expect(
			service.updateMyInformation({}, user.id, file),
		).resolves.toMatchObject({ avatar: 'https://example.com/new.png' });
		expect(storage.upload).toHaveBeenCalledWith(
			file.buffer,
			file.mimetype,
			'TrelloLike_Avatars',
		);
		expect(repository.updateUser).toHaveBeenCalledWith({
			userId: user.id,
			user: { avatar: 'https://example.com/new.png' },
		});
		expect(storage.delete).toHaveBeenCalledWith('TrelloLike_Avatars/old');
		expect(storage.upload.mock.invocationCallOrder[0]).toBeLessThan(
			repository.updateUser.mock.invocationCallOrder[0],
		);
		expect(repository.updateUser.mock.invocationCallOrder[0]).toBeLessThan(
			storage.delete.mock.invocationCallOrder[0],
		);
	});

	it('rolls back only the new upload on a DB failure and preserves the original error', async () => {
		const { service, repository, storage } = setup();
		const failure = new Error('Database unavailable');
		repository.updateUser.mockRejectedValueOnce(failure);
		await expect(service.updateMyInformation({}, user.id, file)).rejects.toBe(
			failure,
		);
		expect(storage.delete.mock.calls).toEqual([['TrelloLike_Avatars/new']]);
	});

	it('maps duplicate email to conflict without hiding other DB failures', async () => {
		const { service, repository } = setup();
		repository.updateUser.mockRejectedValueOnce({ code: 'P2002' });
		await expect(
			service.updateMyInformation({ email: 'used@example.com' }, user.id),
		).rejects.toMatchObject({ status: 409 });
	});

	it('keeps a saved avatar when old-image cleanup fails after commit', async () => {
		const { service, storage } = setup();
		jest.spyOn(console, 'error').mockImplementation(() => undefined);
		storage.delete.mockRejectedValueOnce(new Error('Provider unavailable'));
		await expect(
			service.updateMyInformation({}, user.id, file),
		).resolves.toMatchObject({ avatar: 'https://example.com/new.png' });
		expect(storage.delete.mock.calls).toEqual([['TrelloLike_Avatars/old']]);
	});

	it('preserves a DB failure even when compensating cleanup fails', async () => {
		const { service, repository, storage } = setup();
		jest.spyOn(console, 'error').mockImplementation(() => undefined);
		const failure = new Error('Database unavailable');
		repository.updateUser.mockRejectedValueOnce(failure);
		storage.delete.mockRejectedValueOnce(new Error('Provider unavailable'));
		await expect(service.updateMyInformation({}, user.id, file)).rejects.toBe(
			failure,
		);
	});

	it('does not update the DB or delete any avatar when upload fails', async () => {
		const { service, repository, storage } = setup();
		const failure = new Error('Upload failed');
		storage.upload.mockRejectedValueOnce(failure);
		await expect(service.updateMyInformation({}, user.id, file)).rejects.toBe(
			failure,
		);
		expect(repository.updateUser).not.toHaveBeenCalled();
		expect(storage.delete).not.toHaveBeenCalled();
	});

	it('skips previous-avatar cleanup when it does not belong to managed storage', async () => {
		const { service, storage } = setup();
		storage.extractPublicId.mockReturnValueOnce(null);
		await service.updateMyInformation({}, user.id, file);
		expect(storage.delete).not.toHaveBeenCalled();
	});

	it('delegates password changes to the public Auth contract and keeps the user response', async () => {
		const { service, auth } = setup();
		await expect(service.updateMyPassword('new-password', user)).resolves.toEqual(
			user,
		);
		expect(auth.changePassword).toHaveBeenCalledWith(user.id, 'new-password');
	});

	it('propagates a failed password change instead of returning a successful profile', async () => {
		const { service, auth } = setup();
		const failure = new Error('Credential write failed');
		auth.changePassword.mockRejectedValueOnce(failure);
		await expect(service.updateMyPassword('new-password', user)).rejects.toBe(
			failure,
		);
	});
});
