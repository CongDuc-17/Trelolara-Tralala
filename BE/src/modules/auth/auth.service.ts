import { compare, genSalt, hash } from 'bcrypt';
import { StatusCodes } from 'http-status-codes';

import { MailsService } from '../mails/mail.service';
import { OtpsService } from '../otps/otps.service';

import { AuthRepository } from './auth.repository';
import { AccountSummary, AuthAccount, AuthUser, SessionTokens } from './auth.types';

import {
	ConflictException,
	NotFoundException,
	OptionalException,
	UnauthorizedException,
} from '@/common/exceptions';
import {
	getTokenExpiry,
	signJWT,
	verifyAccessJWT,
	verifyRefreshJWT,
} from '@/common/utils/jwt.utils';
import { otpsConfig } from '@/configs/otps.config';
import { usersConfig } from '@/configs/users.config';

export class AuthService {
	constructor(
		private readonly authRepository = new AuthRepository(),
		private readonly otpsService = new OtpsService(),
		private readonly mailsService = new MailsService(),
	) {}

	async register(input: {
		email: string;
		password: string;
		name: string;
	}): Promise<AccountSummary> {
		if (await this.authRepository.findUser({ email: input.email }))
			throw new ConflictException('email');
		const salt = await genSalt(10);
		const password = await hash(input.password, salt);
		let account: AuthAccount;
		try {
			account = await this.authRepository.createRegisteredAccount({
				email: input.email,
				name: input.name,
				avatar: usersConfig.defaultAvatarUrl,
				password,
				salt,
			});
		} catch (error) {
			if (
				error &&
				typeof error === 'object' &&
				'code' in error &&
				error.code === 'P2002'
			)
				throw new ConflictException('email');
			throw error;
		}
		await this.sendOtp({ email: input.email });
		return this.summarizeAccount(account);
	}

	async login(input: { email: string; password: string }): Promise<SessionTokens> {
		const account = await this.authRepository.findAccount({ email: input.email });
		if (!account) throw new NotFoundException('email');
		return this.authRepository.inTransaction(async (repository) => {
			await repository.lockUser(account.userId);
			const current = await repository.findAccount({ email: input.email });
			if (!current) throw new NotFoundException('email');
			this.assertActiveUser(current.user);
			if (!(await compare(input.password, current.password)))
				throw new OptionalException(StatusCodes.UNAUTHORIZED, 'Invalid password');
			return this.issueTokens(repository, current.userId);
		});
	}

	loginWithGoogle(userId: string): Promise<SessionTokens> {
		return this.createSession(userId);
	}

	private createSession(userId: string): Promise<SessionTokens> {
		return this.authRepository.inTransaction(async (repository) => {
			await repository.lockUser(userId);
			this.assertActiveUser(await repository.findUser({ userId }));
			return this.issueTokens(repository, userId);
		});
	}

	private async issueTokens(
		repository: AuthRepository,
		userId: string,
	): Promise<SessionTokens> {
		const tokens = await signJWT({ userId });
		await repository.createSession(
			userId,
			tokens.refreshToken,
			getTokenExpiry(tokens.refreshToken),
		);
		return tokens;
	}

	async authenticateAccessToken(rawToken: string): Promise<AuthUser> {
		const payload = verifyAccessJWT(rawToken);
		const user = await this.authRepository.findUser({ userId: payload.userId });
		this.assertActiveUser(user);
		return user;
	}

	async refreshSession(rawRefreshToken: string): Promise<SessionTokens> {
		const payload = verifyRefreshJWT(rawRefreshToken);
		return this.authRepository.inTransaction(async (repository) => {
			await repository.lockUser(payload.userId);
			this.assertActiveUser(await repository.findUser({ userId: payload.userId }));
			const session = await repository.findSession(rawRefreshToken);
			if (
				!session ||
				session.userId !== payload.userId ||
				session.expiresAt.getTime() <= Date.now()
			)
				throw new UnauthorizedException('is invalid or revoked');
			if (!(await repository.consumeSession(payload.userId, rawRefreshToken)))
				throw new UnauthorizedException('is invalid or revoked');
			return this.issueTokens(repository, payload.userId);
		});
	}

	async sendOtp({ email }: { email: string }): Promise<void> {
		const user = await this.authRepository.findUser({ email });
		if (!user) throw new NotFoundException('email');
		const otp = await this.otpsService.generateOtp({ userId: user.id });
		try {
			const text = `Mã xác thực của bạn là "${otp.otp}". Nó có hiệu lực trong ${otpsConfig.otpExpiresIn} phút. Vui lòng không chia sẻ mã này với bất kỳ ai.`;
			const html = `
				<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
					<h2 style="color: #2b6cb0;">Xác thực tài khoản</h2>
					<p>Xin chào,</p>
					<p>Mã xác thực (OTP) của bạn là:</p>
					<div style="background-color: #edf2f7; padding: 12px 24px; font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #2d3748; text-align: center; border-radius: 6px; margin: 20px 0;">
						${otp.otp}
					</div>
					<p>Mã có hiệu lực trong <strong>${otpsConfig.otpExpiresIn} phút</strong>. Vui lòng không chia sẻ mã này với bất kỳ ai để bảo vệ tài khoản của bạn.</p>
					<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
					<p style="font-size: 12px; color: #718096;">Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.</p>
				</div>
			`.trim();
			await this.mailsService.sendEmail({
				recipients: user.email,
				subject: 'Mã xác thực',
				text,
				html,
			});
		} catch (error) {
			await this.otpsService.invalidateOtp({
				userId: user.id,
				otp: otp.otp,
				expiresAt: otp.expiresAt,
			});
			throw error;
		}
	}

	async verify(input: { email: string; otp: string }): Promise<AccountSummary> {
		const account = await this.authRepository.findAccount({
			email: input.email,
			userStatus: 'ACTIVE',
		});
		if (!account) throw new NotFoundException('account');
		if (account.user.verify)
			throw new OptionalException(
				StatusCodes.CONFLICT,
				'Account is already verified',
			);
		const result = await this.authRepository.inTransaction(
			async (repository, client) => {
				await repository.lockUser(account.userId);
				const current = await repository.findAccount({
					email: input.email,
					userStatus: 'ACTIVE',
				});
				if (!current) throw new NotFoundException('account');
				if (current.user.verify)
					throw new OptionalException(
						StatusCodes.CONFLICT,
						'Account is already verified',
					);
				if (
					!(await this.otpsService.verifyOtp(
						{ userId: current.userId, otp: input.otp },
						client,
					))
				)
					return null;
				const user = await repository.markVerified(current.userId);
				return this.summarizeAccount({ ...current, user });
			},
		);
		if (!result) throw new OptionalException(StatusCodes.BAD_REQUEST, 'Invalid OTP');
		return result;
	}

	async forgotPassword(input: {
		email: string;
		newPassword: string;
		otp: string;
	}): Promise<AccountSummary> {
		const account = await this.authRepository.findAccount({
			email: input.email,
			userStatus: 'ACTIVE',
		});
		if (!account) throw new NotFoundException('account');
		const salt = await genSalt(10);
		const password = await hash(input.newPassword, salt);
		const result = await this.authRepository.inTransaction(
			async (repository, client) => {
				await repository.lockUser(account.userId);
				const current = await repository.findAccount({
					email: input.email,
					userStatus: 'ACTIVE',
				});
				if (!current) throw new NotFoundException('account');
				if (
					!(await this.otpsService.verifyOtp(
						{ userId: current.userId, otp: input.otp },
						client,
					))
				)
					return null;
				const updated = await repository.updatePassword({
					userId: current.userId,
					salt,
					password,
				});
				await repository.revokeSessions(current.userId);
				return this.summarizeAccount(updated);
			},
		);
		if (!result) throw new OptionalException(StatusCodes.BAD_REQUEST, 'Invalid OTP');
		return result;
	}

	async logout(userId: string): Promise<void> {
		await this.authRepository.inTransaction(async (repository) => {
			await repository.lockUser(userId);
			await repository.revokeSessions(userId);
		});
	}

	async changePassword(userId: string, newPassword: string): Promise<void> {
		const salt = await genSalt(10);
		const password = await hash(newPassword, salt);
		await this.authRepository.inTransaction(async (repository) => {
			await repository.lockUser(userId);
			this.assertActiveUser(await repository.findUser({ userId }));
			await repository.upsertPassword({ userId, password, salt });
			await repository.revokeSessions(userId);
		});
	}

	private assertActiveUser(user: AuthUser | null): asserts user is AuthUser {
		if (!user || user.deletedAt)
			throw new UnauthorizedException('belongs to an unavailable account');
		if (user.status !== 'ACTIVE')
			throw new OptionalException(
				StatusCodes.FORBIDDEN,
				'Your account has been locked',
			);
		if (!user.verify)
			throw new OptionalException(
				StatusCodes.FORBIDDEN,
				'Your account has not been verified. Please verify your account before logging in.',
			);
	}

	private summarizeAccount(account: AuthAccount): AccountSummary {
		return {
			id: account.id,
			userId: account.userId,
			email: account.user.email,
			name: account.user.name,
			avatar: account.user.avatar ?? '',
			verify: account.user.verify,
			status: account.user.status,
		};
	}
}
