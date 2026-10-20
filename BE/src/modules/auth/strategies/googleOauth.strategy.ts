import passport from 'passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { StatusCodes } from 'http-status-codes';

import { AuthRepository } from '../auth.repository';

import { OptionalException } from '@/common/exceptions';
import { GoogleOauthConfig } from '@/configs/googleOauth.config';

export class GoogleOauthStrategy {
	constructor(private readonly authRepository = new AuthRepository()) {
		if (
			!GoogleOauthConfig.clientId ||
			!GoogleOauthConfig.clientSecret ||
			!GoogleOauthConfig.redirectUri
		)
			return;
		passport.use(
			'google',
			new Strategy(
				{
					clientID: GoogleOauthConfig.clientId,
					clientSecret: GoogleOauthConfig.clientSecret,
					callbackURL: GoogleOauthConfig.redirectUri,
					scope: ['email', 'profile'],
				},
				this.validate.bind(this),
			),
		);
	}

	async validate(
		accessToken: string,
		refreshToken: string,
		profile: Profile,
		done: VerifyCallback,
	): Promise<void> {
		try {
			const email = profile.emails?.[0];
			if (!email?.value || !email.verified) {
				throw new OptionalException(
					StatusCodes.BAD_REQUEST,
					'Google account must provide a verified email',
				);
			}
			const socialAccount = await this.authRepository.connectGoogleAccount({
				googleId: profile.id,
				email: email.value,
				name: profile.displayName,
				avatar: profile.photos?.[0]?.value,
				accessToken,
				refreshToken,
			});
			done(null, { socialAccountInformation: socialAccount });
		} catch (error) {
			done(
				error instanceof Error
					? error
					: new Error('Google authentication failed'),
				false,
			);
		}
	}
}
