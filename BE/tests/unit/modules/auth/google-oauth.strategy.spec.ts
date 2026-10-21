import { Profile } from 'passport-google-oauth20';
import passport from 'passport';

import { AuthRepository } from '@/modules/auth/auth.repository';
import { GoogleOauthStrategy } from '@/modules/auth/strategies/googleOauth.strategy';

jest.mock('passport', () => ({ __esModule: true, default: { use: jest.fn() } }));
jest.mock('@/configs/googleOauth.config', () => ({
	GoogleOauthConfig: { clientId: '', clientSecret: '', redirectUri: '' },
}));

describe('Google OAuth adapter', () => {
	function setup() {
		const repository = {
			connectGoogleAccount: jest.fn(async () => ({ userId: 'user-1' })),
		};
		const strategy = new GoogleOauthStrategy(repository as unknown as AuthRepository);
		return { strategy, repository, done: jest.fn() };
	}

	it('does not initialize an unconfigured provider during app import', () => {
		setup();
		expect(passport.use).not.toHaveBeenCalled();
	});

	it('rejects profiles without a verified provider email', async () => {
		const { strategy, repository, done } = setup();
		for (const emails of [[], [{ value: 'user@example.com', verified: false }]]) {
			await strategy.validate(
				'access',
				'refresh',
				{ id: 'google-1', emails } as Profile,
				done,
			);
			expect(done).toHaveBeenLastCalledWith(
				expect.objectContaining({ status: 400 }),
				false,
			);
		}
		expect(repository.connectGoogleAccount).not.toHaveBeenCalled();
	});

	it('maps a verified profile into the atomic account repository contract', async () => {
		const { strategy, repository, done } = setup();
		await strategy.validate(
			'access',
			'refresh',
			{
				id: 'google-1',
				displayName: 'Reader',
				emails: [{ value: 'reader@example.com', verified: true }],
				photos: [{ value: 'https://example.com/avatar.png' }],
			} as Profile,
			done,
		);
		expect(repository.connectGoogleAccount).toHaveBeenCalledWith({
			googleId: 'google-1',
			email: 'reader@example.com',
			name: 'Reader',
			avatar: 'https://example.com/avatar.png',
			accessToken: 'access',
			refreshToken: 'refresh',
		});
		expect(done).toHaveBeenCalledWith(null, {
			socialAccountInformation: { userId: 'user-1' },
		});
	});

	it('forwards provider/account failures through Passport callback', async () => {
		const { strategy, repository, done } = setup();
		const error = new Error('Account unavailable');
		repository.connectGoogleAccount.mockRejectedValueOnce(error);
		await strategy.validate(
			'access',
			'refresh',
			{
				id: 'google-1',
				displayName: 'Reader',
				emails: [{ value: 'reader@example.com', verified: true }],
			} as Profile,
			done,
		);
		expect(done).toHaveBeenCalledWith(error, false);
	});
});
