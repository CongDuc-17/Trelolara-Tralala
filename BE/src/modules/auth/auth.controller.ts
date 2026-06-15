import { Exception } from '@tsed/exceptions';
import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import passport from 'passport';

import { UserInformationDto } from '../users/dtos';

import { AuthService } from './auth.service';
import {
	AccountResponseDto,
	LoginRequestDto,
	LoginResponseDto,
	RegisterRequestDto,
	SendOtpRequestDto,
	VerifyRequestDto,
} from './dtos';
import { CheckLoginWithGoogleOauthRequestDto, ForgotPasswordRequestDto } from './dtos';

import {
	HttpResponseDto,
	InternalServerException,
	NotFoundException,
	OptionalException,
} from '@/common';
import { appEnv } from '@/configs';

export class AuthController {
	constructor(private readonly authService = new AuthService()) {}

	async register(req: Request): Promise<Response> {
		const registerDto = req.body as RegisterRequestDto;
		const result = await this.authService.register(registerDto);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().created<AccountResponseDto>(result);
	}

	async login(req: Request): Promise<Response> {
		const loginDto = req.body as LoginRequestDto;
		const result = await this.authService.login(loginDto);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<LoginResponseDto>(result);
	}

	// Redirect to Google OAuth
	googleAuth = (req: Request, res: Response, next: NextFunction) => {
		passport.authenticate('google', {
			scope: ['profile', 'email'], // Yêu cầu quyền lấy tên + email
			accessType: 'offline', // Yêu cầu refresh token
			prompt: 'consent', // Bắt user chọn tài khoản lần nữa
		})(req, res, next);
	};

	// Handle Google OAuth callback
	googleCallback = (
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<Response | Exception> | void => {
		passport.authenticate(
			'google',
			{
				session: false,
				failureRedirect: '/auth/google/login/failure',
			},
			async (
				err: Error | null,
				user: CheckLoginWithGoogleOauthRequestDto,
				_info: unknown,
			) => {
				if (err) {
					throw new InternalServerException();
				}

				if (!user) {
					throw new NotFoundException('user for google login');
				}

				const result = await this.authService.CheckLoginWithGoogleOauth(user);

				if (result instanceof Exception) {
					return new HttpResponseDto().exception(result);
				}

				const cookies = result.cookies ?? {};
				const isProduction = appEnv.NODE_ENV === 'production';
				Object.entries(cookies).forEach(([name, value]) => {
					res.cookie(name, String(value), {
						httpOnly: true,
						secure: isProduction,
						sameSite: isProduction ? 'none' : 'lax',
						path: '/',
					});
				});

				return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
			},
		)(req, res, next);
	};

	authFailure = (): Exception => {
		throw new OptionalException(StatusCodes.UNAUTHORIZED, 'Authentication Failed');
	};

	async refreshToken(req: Request): Promise<Response> {
		const myInformation = req.user as UserInformationDto;
		const result = await this.authService.refreshToken(myInformation);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().created<LoginResponseDto>(result);
	}

	async sendOtp(req: Request): Promise<Response> {
		const email = new SendOtpRequestDto(req.body);
		const result = await this.authService.sendOtp(email);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<null>(result);
	}

	async verify(req: Request): Promise<Response> {
		const verifyRequestDto = new VerifyRequestDto(req.body);
		const result = await this.authService.verify(verifyRequestDto);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<AccountResponseDto>(result);
	}

	async forgotPassword(req: Request): Promise<Response> {
		const forgotPasswordRequestDto = new ForgotPasswordRequestDto(req.body);
		const result = await this.authService.forgotPassword(forgotPasswordRequestDto);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<AccountResponseDto>(result);
	}
	async logout(req: Request): Promise<Response> {
		const myInformation = req.user as UserInformationDto;
		const result = await this.authService.logout(myInformation);
		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}
		return new HttpResponseDto().success<null>(result);
	}
}
