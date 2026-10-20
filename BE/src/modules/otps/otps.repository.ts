import type { otps } from '@prisma/client';
import { prisma, type DatabaseClient } from '../database';

export class OtpsRepository {
	constructor(private readonly client: DatabaseClient = prisma) {}

	findOtp(userId: string, client: DatabaseClient = this.client) {
		return client.otps.findUnique({ where: { userId } });
	}

	createOtp(
		userId: string,
		otp: string,
		expiresAt: Date,
		client: DatabaseClient = this.client,
	) {
		return client.otps.create({
			data: { userId, otp, expiresAt, attempts: 0 },
		});
	}

	async replaceExpiredOtp(
		record: otps,
		otp: string,
		expiresAt: Date,
		now: Date,
		client: DatabaseClient = this.client,
	): Promise<otps | null> {
		const result = await client.otps.updateMany({
			where: { id: record.id, expiresAt: { equals: record.expiresAt, lte: now } },
			data: { otp, expiresAt, attempts: 0 },
		});
		return result.count === 1 ? { ...record, otp, expiresAt, attempts: 0 } : null;
	}

	async incrementAttempts(
		record: otps,
		now: Date,
		maxAttempts: number,
		client: DatabaseClient = this.client,
	): Promise<void> {
		await client.otps.updateMany({
			where: {
				id: record.id,
				otp: record.otp,
				expiresAt: { equals: record.expiresAt, gt: now },
				attempts: { lt: maxAttempts },
			},
			data: { attempts: { increment: 1 } },
		});
	}

	async consumeOtp(
		record: otps,
		now: Date,
		maxAttempts: number,
		client: DatabaseClient = this.client,
	): Promise<boolean> {
		const result = await client.otps.deleteMany({
			where: {
				id: record.id,
				otp: record.otp,
				expiresAt: { equals: record.expiresAt, gt: now },
				attempts: { lt: maxAttempts },
			},
		});
		return result.count === 1;
	}

	async invalidateOtp(
		input: { userId: string; otp: string; expiresAt?: Date },
		client: DatabaseClient = this.client,
	): Promise<void> {
		await client.otps.deleteMany({
			where: {
				userId: input.userId,
				otp: input.otp,
				...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
			},
		});
	}
}
