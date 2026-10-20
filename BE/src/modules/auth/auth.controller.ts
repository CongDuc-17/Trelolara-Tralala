import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import passport from 'passport';

import { UserInformationDto } from '../users/dtos';

import { clearAuthCookies, readCookie, setAuthCookies } from './auth.cookies';
import { AuthService } from './auth.service';
import { GoogleLoginPrincipal } from './auth.types';

import {
	NotFoundException,
	OptionalException,
	UnauthorizedException,
} from '@/common/exceptions';

export class AuthController {
	constructor(private readonly authService = new AuthService()) { }

	async register(req: Request, res: Response): Promise<Response> {
		const data = await this.authService.register(req.body);
		return res.status(StatusCodes.CREATED).json({ success: true, data });
	}

	async login(req: Request, res: Response): Promise<Response> {
		const tokens = await this.authService.login(req.body);
		setAuthCookies(res, tokens);
		return res.status(StatusCodes.OK).json({ success: true, data: tokens });
	}

	googleAuth = (req: Request, res: Response, next: NextFunction): void => {
		passport.authenticate('google', {
			scope: ['profile', 'email'],
			accessType: 'offline',
			prompt: 'consent',
		})(req, res, next);
	};

	googleCallback = (req: Request, res: Response, next: NextFunction): void => {
		passport.authenticate(
			'google',
			{
				session: false,
				failureRedirect: '/auth/google/login/failure',
			},
			async (error: Error | null, user: GoogleLoginPrincipal) => {
				try {
					if (error) return next(error);
					if (!user) throw new NotFoundException('user for google login');
					const tokens = await this.authService.loginWithGoogle(
						user.socialAccountInformation.userId,
					);
					setAuthCookies(res, tokens);
					res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
				} catch (callbackError) {
					next(callbackError);
				}
			},
		)(req, res, next);
	};

	authFailure = (): never => {
		throw new OptionalException(StatusCodes.UNAUTHORIZED, 'Authentication Failed');
	};

	async refreshToken(req: Request, res: Response): Promise<Response> {
		const rawRefreshToken = readCookie(req, 'refreshToken');
		if (!rawRefreshToken) throw new UnauthorizedException('is missing');
		const tokens = await this.authService.refreshSession(rawRefreshToken);
		setAuthCookies(res, tokens);
		return res.status(StatusCodes.CREATED).json({ success: true, data: tokens });
	}

	async sendOtp(req: Request, res: Response): Promise<Response> {
		await this.authService.sendOtp(req.body);
		return res.status(StatusCodes.OK).json({ success: true, data: null });
	}

	async verify(req: Request, res: Response): Promise<Response> {
		const data = await this.authService.verify(req.body);
		return res.status(StatusCodes.OK).json({ success: true, data });
	}

	async forgotPassword(req: Request, res: Response): Promise<Response> {
		const data = await this.authService.forgotPassword(req.body);
		clearAuthCookies(res);
		return res.status(StatusCodes.OK).json({ success: true, data });
	}

	async logout(req: Request, res: Response): Promise<Response> {
		const actor = req.user as UserInformationDto;
		await this.authService.logout(actor.id);
		clearAuthCookies(res);
		return res.status(StatusCodes.OK).json({ success: true, data: null });
	}
}
