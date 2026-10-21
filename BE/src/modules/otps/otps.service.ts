import { randomInt } from 'node:crypto';
import type { otps } from '@prisma/client';
import type { DatabaseClient } from '../database';
import { OtpsRepository } from './otps.repository';
import { otpsConfig } from '@/configs/otps.config';

export class OtpCooldownError extends Error {
	readonly status = 409;

	constructor(seconds: number) {
		super(`OTP sẽ được cấp lại sau ${seconds} giây`);
		this.name = 'OtpCooldownError';
	}
}

export class OtpsService {
	constructor(
		private readonly repository = new OtpsRepository(),
		private readonly now: () => Date = () => new Date(),
		private readonly generateCode: () => string = () =>
			randomInt(100000, 1000000).toString(),
	) {}

	async generateOtp({ userId }: { userId: string }): Promise<otps> {
		const now = this.now();
		const existing = await this.repository.findOtp(userId);
		if (existing && existing.expiresAt > now) {
			throw new OtpCooldownError(
				Math.ceil((existing.expiresAt.getTime() - now.getTime()) / 1000),
			);
		}
		const code = this.generateCode();
		const expiresAt = new Date(now.getTime() + otpsConfig.otpExpiresIn * 60_000);
		if (existing) {
			const replacement = await this.repository.replaceExpiredOtp(
				existing,
				code,
				expiresAt,
				now,
			);
			if (!replacement) throw new OtpCooldownError(otpsConfig.otpExpiresIn * 60);
			return replacement;
		}
		try {
			return await this.repository.createOtp(userId, code, expiresAt);
		} catch (error) {
			if (
				error &&
				typeof error === 'object' &&
				'code' in error &&
				error.code === 'P2002'
			) {
				throw new OtpCooldownError(otpsConfig.otpExpiresIn * 60);
			}
			throw error;
		}
	}

	async verifyOtp(
		{ userId, otp }: { userId: string; otp: string },
		client?: DatabaseClient,
	): Promise<boolean> {
		const record = await this.repository.findOtp(userId, client);
		if (!record) return false;
		const now = this.now();
		if (record.expiresAt <= now) {
			await this.repository.invalidateOtp(
				{ userId, otp: record.otp, expiresAt: record.expiresAt },
				client,
			);
			return false;
		}
		if (record.attempts >= otpsConfig.maxAttempts) return false;
		if (record.otp !== otp) {
			await this.repository.incrementAttempts(
				record,
				now,
				otpsConfig.maxAttempts,
				client,
			);
			return false;
		}
		return this.repository.consumeOtp(record, now, otpsConfig.maxAttempts, client);
	}

	invalidateOtp(
		input: { userId: string; otp: string; expiresAt?: Date },
		client?: DatabaseClient,
	): Promise<void> {
		return this.repository.invalidateOtp(input, client);
	}
}

export { OtpsService as OtpService };
