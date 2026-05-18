import { invitations } from './../../models/modelSchema/invitationsSchema';
import { UserStatusEnum } from '@prisma/client';
import { Exception } from '@tsed/exceptions';
import { genSalt, hash } from 'bcrypt';
import { StatusCodes } from 'http-status-codes';

import { Prisma } from '../database';
import { MailsService } from '../mails/mail.service';
import { OtpsService } from '../otps/otps.service';
import { UserInformationDto } from '../users/dtos';
import { UsersRepository } from '../users/users.repository';

import { AuthRepository } from './auth.repository';
import {
	AccountResponseDto,
	CheckLoginWithGoogleOauthRequestDto,
	ForgotPasswordRequestDto,
	LoginRequestDto,
	LoginResponseDto,
	RegisterRequestDto,
	SendOtpRequestDto,
	VerifyRequestDto,
} from './dtos';

import {
	ConflictException,
	HttpResponseBodySuccessDto,
	NotFoundException,
	OptionalException,
	signJWT,
} from '@/common';
import { cleanupExpiredTokens } from '@/common/utils/tokenCleanup.util';
import { otpsConfig, usersConfig } from '@/configs';

import { UserRoleEnum } from '@/common/enums/roles/userRole.enum';
import { RolesRepository } from '../roles/roles.repository';
import { UserRoleRepository } from '../userRole/userRole.repository';
import { InvitationsRepository } from '../invitations/invitation.repository';

export class AuthService {
	constructor(
		private readonly otpsService = new OtpsService(),
		private readonly mailsService = new MailsService(),
		private readonly authRepository = new AuthRepository(),
		private readonly usersRepository = new UsersRepository(),
		private readonly userRoleRepository = new UserRoleRepository(),
		private readonly rolesRepository = new RolesRepository(),
		private readonly invitationsRepository = new InvitationsRepository(),
	) {}

	async register(
		registerDto: RegisterRequestDto,
	): Promise<HttpResponseBodySuccessDto<AccountResponseDto> | Exception> {
		const user = await this.usersRepository.findUser({
			email: registerDto.email,
		});

		if (user) {
			throw new ConflictException('email');
		}

		const salt = await genSalt(10);
		const hashedPassword = await hash(registerDto.password, salt);

		const account: Prisma.accountsCreateInput = {
			salt: salt,
			password: hashedPassword,
			user: {
				create: {
					email: registerDto.email,
					name: registerDto.name,
					avatar: usersConfig.defaultAvatarUrl,
				},
			},
		};

		const newAccount = await this.authRepository.createAccount({ accounts: account });
		const desiredRoleName = registerDto.role ?? UserRoleEnum.USER;

		const role = await this.rolesRepository.findByName(desiredRoleName);
		if (role && newAccount.user?.id) {
			await this.userRoleRepository.assignUserRole(newAccount.user.id, role.id);
			console.log('OK');
		}

		await this.sendOtp({
			email: registerDto.email,
		});

		return {
			success: true,
			data: new AccountResponseDto(newAccount),
		};
	}

	async login(
		loginRequestDto: LoginRequestDto,
	): Promise<HttpResponseBodySuccessDto<LoginResponseDto> | Exception> {
		const account = await this.authRepository.findAccount({
			email: loginRequestDto.email,
		});

		if (!account) {
			throw new NotFoundException('email');
		}

		if (account.user?.status === UserStatusEnum.LOCKED) {
			throw new OptionalException(
				StatusCodes.FORBIDDEN,
				'Your account has been locked',
			);
		}

		if (account.user?.verify === false) {
			throw new OptionalException(
				StatusCodes.FORBIDDEN,
				'Your account has not been verified. Please verify your account before logging in.',
			);
		}
		const hashedPassword = await hash(loginRequestDto.password, account.salt);
		if (hashedPassword !== account.password) {
			throw new OptionalException(StatusCodes.UNAUTHORIZED, 'Invalid password');
		}

		const { accessToken, refreshToken } = await signJWT({
			userId: account.userId,
		});

		const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

		await this.authRepository.createToken({
			token: {
				refreshToken: refreshToken,
				user: {
					connect: {
						id: account.userId,
					},
				},
				expiresAt,
			},
		});

		return {
			success: true,
			data: {
				accessToken: accessToken,
				refreshToken: refreshToken,
			},
			cookies: {
				accessToken: accessToken,
				refreshToken: refreshToken,
			},
		};
	}

	async CheckLoginWithGoogleOauth(
		googleAuthData: CheckLoginWithGoogleOauthRequestDto,
	): Promise<HttpResponseBodySuccessDto<LoginResponseDto> | Exception> {
		const { socialAccountInformation } = googleAuthData;

		const { accessToken, refreshToken } = await signJWT({
			userId: socialAccountInformation.userId,
		});

		const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

		await this.authRepository.createToken({
			token: {
				refreshToken: refreshToken,
				user: {
					connect: {
						id: socialAccountInformation.userId,
					},
				},
				expiresAt,
			},
		});

		return {
			success: true,
			data: {
				accessToken: accessToken,
				refreshToken: refreshToken,
			},
			cookies: {
				accessToken: accessToken,
				refreshToken: refreshToken,
			},
		};
	}

	async refreshToken(
		myInformation: UserInformationDto,
	): Promise<HttpResponseBodySuccessDto<LoginResponseDto> | Exception> {
		// Cleanup expired tokens (on-demand)
		await cleanupExpiredTokens();

		const latestToken = await this.authRepository.getLatestToken(myInformation.id);

		if (latestToken) {
			const timeSinceCreation = Date.now() - latestToken.createdAt.getTime();
			const fiveMinutesInMs = 5 * 60 * 1000;

			if (timeSinceCreation < fiveMinutesInMs) {
				throw new OptionalException(
					StatusCodes.TOO_MANY_REQUESTS,
					'Refresh token too frequently. Please wait before requesting a new token.',
				);
			}
		}
		await this.authRepository.deleteToken(myInformation.id);
		const { accessToken, refreshToken } = await signJWT({
			userId: myInformation.id,
		});

		const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

		await this.authRepository.createToken({
			token: {
				refreshToken: refreshToken,
				user: {
					connect: {
						id: myInformation.id,
					},
				},
				expiresAt,
			},
		});

		return {
			success: true,
			data: {
				accessToken: accessToken,
				refreshToken: refreshToken,
			},
			cookies: {
				accessToken: accessToken,
				refreshToken: refreshToken,
			},
		};
	}

	async sendOtp(
		sendOtpRequestDto: SendOtpRequestDto,
	): Promise<HttpResponseBodySuccessDto<null> | Exception> {
		const { email } = sendOtpRequestDto;
		const user = await this.usersRepository.findUser({ email: email });
		if (!user) {
			throw new NotFoundException('email');
		}

		const otp = await this.otpsService.generateOtp({ userId: user.id });

		await this.mailsService.sendEmail({
			recipients: user.email,
			subject: 'Mã xác thực',
			html: `Mã xác thực của bạn là "${otp.otp}". Nó có hiệu lực trong ${otpsConfig.otpExpiresIn} phút. Vui lòng không chia sẻ mã này với bất kỳ ai.`,
		});

		return {
			success: true,
			data: null,
		};
	}

	async verify(
		verifyRequestDto: VerifyRequestDto,
	): Promise<HttpResponseBodySuccessDto<AccountResponseDto> | Exception> {
		const { email, otp } = verifyRequestDto;
		const account = await this.authRepository.findAccount({
			email: email,
			userStatus: UserStatusEnum.ACTIVE,
		});
		if (!account || !account.user) {
			throw new NotFoundException('account');
		}

		if (account.user.verify === true) {
			throw new OptionalException(
				StatusCodes.CONFLICT,
				'Account is already verified',
			);
		}

		const isValidOtp = await this.otpsService.verifyOtp({
			userId: account.userId,
			otp: otp,
		});
		if (!isValidOtp) {
			throw new OptionalException(StatusCodes.BAD_REQUEST, 'Invalid OTP');
		}

		await this.usersRepository.updateUser({
			userId: account.userId,
			user: {
				verify: true,
			},
		});

		const accountResponse = new AccountResponseDto(account);
		accountResponse.verify = true;

		const pendingInvites = await this.invitationsRepository.findPendingByEmail(
			accountResponse.email,
		);
		if (pendingInvites.length > 0) {
			await Promise.all(
				pendingInvites.map((invite) =>
					this.invitationsRepository.updateStatus(invite.id, 'ACCEPTED'),
				),
			);
		}

		return {
			success: true,
			data: accountResponse,
		};
	}

	async forgotPassword(
		forgotPasswordRequestDto: ForgotPasswordRequestDto,
	): Promise<HttpResponseBodySuccessDto<AccountResponseDto> | Exception> {
		const { email, newPassword, otp } = forgotPasswordRequestDto;
		const user = await this.usersRepository.findUser({ email: email });
		if (!user) {
			throw new NotFoundException('email');
		}

		const isValidOtp = await this.otpsService.verifyOtp({
			userId: user.id,
			otp: otp,
		});

		if (!isValidOtp) {
			throw new OptionalException(StatusCodes.BAD_REQUEST, 'Invalid OTP');
		}

		const salt = await genSalt(10);
		const hashedPassword = await hash(newPassword, salt);

		const account: AccountResponseDto = new AccountResponseDto(
			await this.authRepository.updatePassword({
				userId: user.id,
				salt: salt,
				password: hashedPassword,
			}),
		);

		return {
			success: true,
			data: account,
		};
	}

	async logout(
		myInformation: UserInformationDto,
	): Promise<HttpResponseBodySuccessDto<null> | Exception> {
		await this.authRepository.deleteToken(myInformation.id);

		return {
			success: true,
			data: null,
			cookies: {
				accessToken: '',
				refreshToken: '',
			},
		};
	}
}
