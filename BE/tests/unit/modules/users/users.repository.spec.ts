import { UsersRepository } from '@/modules/users/users.repository';
import type { DatabaseClient } from '@/modules/database';

describe('Email verification belongs to the current address', () => {
	function setup() {
		let state = {
			email: 'old@example.com',
			verify: true,
			otp: 'old-code' as string | null,
		};
		const events: string[] = [];
		let fail = false;
		const root = {
			$transaction: jest.fn(
				async (work: (client: DatabaseClient) => Promise<unknown>) => {
					const draft = { ...state };
					const tx = {
						$queryRaw: jest.fn(async () => {
							events.push('lock');
							return [];
						}),
						users: {
							findUnique: jest.fn(async () => draft),
							update: jest.fn(
								async ({ data }: { data: Partial<typeof state> }) => {
									if (fail) throw new Error('Update failed');
									Object.assign(draft, data);
									events.push('update');
									return draft;
								},
							),
						},
						otps: {
							deleteMany: jest.fn(async () => {
								draft.otp = null;
								events.push('invalidate');
								return { count: 1 };
							}),
						},
					} as unknown as DatabaseClient;
					const result = await work(tx);
					state = draft;
					events.push('commit');
					return result;
				},
			),
		};
		return {
			repository: new UsersRepository(root as unknown as DatabaseClient),
			state: () => state,
			events,
			fail: () => {
				fail = true;
			},
		};
	}
	it('locks the user and atomically resets verification and deletes old OTP on an email change', async () => {
		const f = setup();
		await f.repository.updateUser({
			userId: 'user',
			user: { email: 'new@example.com' },
		});
		expect(f.state()).toEqual({ email: 'new@example.com', verify: false, otp: null });
		expect(f.events).toEqual(['lock', 'invalidate', 'update', 'commit']);
	});
	it('keeps verification when the persisted email is unchanged', async () => {
		const f = setup();
		await f.repository.updateUser({
			userId: 'user',
			user: { email: 'old@example.com' },
		});
		expect(f.state().verify).toBe(true);
		expect(f.events).not.toContain('invalidate');
	});
	it('rolls verification and OTP back with a failed profile write', async () => {
		const f = setup();
		f.fail();
		await expect(
			f.repository.updateUser({
				userId: 'user',
				user: { email: 'new@example.com' },
			}),
		).rejects.toThrow();
		expect(f.state()).toEqual({
			email: 'old@example.com',
			verify: true,
			otp: 'old-code',
		});
	});
});
