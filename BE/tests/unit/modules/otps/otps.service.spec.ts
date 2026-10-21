import type { otps } from '@prisma/client';
import type { DatabaseClient } from '@/modules/database';
import { OtpsRepository } from '@/modules/otps/otps.repository';
import { OtpsService, OtpCooldownError } from '@/modules/otps/otps.service';
import { otpsConfig } from '@/configs/otps.config';

jest.mock('@/modules/database', () => ({ prisma: {} }));

const now = new Date('2026-10-20T08:00:00.000Z');
const expiry = new Date(now.getTime() + 5 * 60_000);

function makeRecord(overrides: Partial<otps> = {}): otps {
	return {
		id: 'otp-record',
		userId: 'user-1',
		otp: '123456',
		expiresAt: expiry,
		attempts: 0,
		...overrides,
	};
}

function setup(record: otps | null = null) {
	const model = {
		findUnique: jest.fn().mockResolvedValue(record),
		create: jest
			.fn()
			.mockImplementation(({ data }) =>
				Promise.resolve({ id: 'created-otp', ...data }),
			),
		updateMany: jest.fn().mockResolvedValue({ count: 1 }),
		deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
	};
	const client = { otps: model } as unknown as DatabaseClient;
	const repository = new OtpsRepository(client);
	const service = new OtpsService(repository, () => now);
	return { model, client, repository, service };
}

describe('OtpsService', () => {
	let previousTtl: string | undefined;
	beforeEach(() => {
		previousTtl = process.env.OTP_EXPIRES_IN;
		delete process.env.OTP_EXPIRES_IN;
	});
	afterEach(() => {
		if (previousTtl === undefined) delete process.env.OTP_EXPIRES_IN;
		else process.env.OTP_EXPIRES_IN = previousTtl;
	});

	it('creates six-digit codes with a five-minute expiry and fresh attempt counter', async () => {
		const { service, model } = setup();
		for (let index = 0; index < 100; index++) {
			const record = await service.generateOtp({ userId: 'user-1' });
			expect(record.otp).toMatch(/^[1-9]\d{5}$/);
			expect(record.expiresAt).toEqual(expiry);
			expect(record.attempts).toBe(0);
		}
		expect(model.create).toHaveBeenCalledTimes(100);
	});

	it('keeps a live code stable and throttles regeneration until it expires', async () => {
		const { service, model } = setup(makeRecord());
		await expect(service.generateOtp({ userId: 'user-1' })).rejects.toBeInstanceOf(
			OtpCooldownError,
		);
		expect(model.create).not.toHaveBeenCalled();
		expect(model.updateMany).not.toHaveBeenCalled();
	});

	it('replaces an expired code with a conditional write and resets attempts', async () => {
		const old = makeRecord({ expiresAt: now, attempts: 5 });
		const { repository, model } = setup(old);
		const service = new OtpsService(
			repository,
			() => now,
			() => '654321',
		);
		await expect(service.generateOtp({ userId: old.userId })).resolves.toMatchObject({
			otp: '654321',
			expiresAt: expiry,
			attempts: 0,
		});
		expect(model.updateMany).toHaveBeenCalledWith({
			where: { id: old.id, expiresAt: { equals: now, lte: now } },
			data: { otp: '654321', expiresAt: expiry, attempts: 0 },
		});
	});

	it('does not overwrite another request that already replaced an expired code', async () => {
		const { service, model } = setup(makeRecord({ expiresAt: now }));
		model.updateMany.mockResolvedValue({ count: 0 });
		await expect(service.generateOtp({ userId: 'user-1' })).rejects.toBeInstanceOf(
			OtpCooldownError,
		);
	});

	it('turns a concurrent create conflict into a cooldown without retrying an overwrite', async () => {
		const { service, model } = setup();
		model.create.mockRejectedValue({ code: 'P2002' });
		await expect(service.generateOtp({ userId: 'user-1' })).rejects.toBeInstanceOf(
			OtpCooldownError,
		);
		expect(model.updateMany).not.toHaveBeenCalled();
	});

	it('returns false for invalid OTP and persists an attempt using the supplied transaction', async () => {
		const { service, model } = setup();
		const transactionModel = {
			findUnique: jest.fn().mockResolvedValue(makeRecord()),
			updateMany: jest.fn().mockResolvedValue({ count: 1 }),
		};
		const transaction = { otps: transactionModel } as unknown as DatabaseClient;

		await expect(
			service.verifyOtp({ userId: 'user-1', otp: '999999' }, transaction),
		).resolves.toBe(false);
		expect(model.findUnique).not.toHaveBeenCalled();
		expect(transactionModel.updateMany).toHaveBeenCalledWith({
			where: {
				id: 'otp-record',
				otp: '123456',
				expiresAt: { equals: expiry, gt: now },
				attempts: { lt: 5 },
			},
			data: { attempts: { increment: 1 } },
		});
	});

	it('refuses a correct code after five failed attempts without removing its cooldown', async () => {
		const { service, model } = setup(makeRecord({ attempts: 5 }));
		await expect(
			service.verifyOtp({ userId: 'user-1', otp: '123456' }),
		).resolves.toBe(false);
		expect(model.deleteMany).not.toHaveBeenCalled();
		expect(model.updateMany).not.toHaveBeenCalled();
	});

	it('consumes a valid code only once even if another request read the same row', async () => {
		const { service, model } = setup(makeRecord());
		model.deleteMany
			.mockResolvedValueOnce({ count: 1 })
			.mockResolvedValueOnce({ count: 0 });
		const results = await Promise.all([
			service.verifyOtp({ userId: 'user-1', otp: '123456' }),
			service.verifyOtp({ userId: 'user-1', otp: '123456' }),
		]);
		expect(results).toEqual([true, false]);
		expect(model.deleteMany).toHaveBeenCalledWith({
			where: {
				id: 'otp-record',
				otp: '123456',
				expiresAt: { equals: expiry, gt: now },
				attempts: { lt: 5 },
			},
		});
	});

	it('consumes through the transaction client so the auth update can roll back with it', async () => {
		const { service, model } = setup();
		const transactionModel = {
			findUnique: jest.fn().mockResolvedValue(makeRecord()),
			deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
		};
		const transaction = { otps: transactionModel } as unknown as DatabaseClient;
		await expect(
			service.verifyOtp({ userId: 'user-1', otp: '123456' }, transaction),
		).resolves.toBe(true);
		expect(transactionModel.deleteMany).toHaveBeenCalledTimes(1);
		expect(model.deleteMany).not.toHaveBeenCalled();
	});

	it('rejects expiry at the exact boundary and cleans up only that issuance', async () => {
		const { service, model } = setup(makeRecord({ expiresAt: now }));
		await expect(
			service.verifyOtp({ userId: 'user-1', otp: '123456' }),
		).resolves.toBe(false);
		expect(model.deleteMany).toHaveBeenCalledWith({
			where: { userId: 'user-1', otp: '123456', expiresAt: now },
		});
	});

	it('invalidates only the undelivered code so mail failure does not block resend', async () => {
		const { service, model } = setup();
		let stored: otps | null = null;
		model.findUnique.mockImplementation(() => Promise.resolve(stored));
		model.create.mockImplementation(({ data }) => {
			stored = { id: 'created-otp', ...data };
			return Promise.resolve(stored);
		});
		model.deleteMany.mockImplementation(({ where }) => {
			if (stored && stored.otp === where.otp && stored.expiresAt === where.expiresAt) {
				stored = null;
				return Promise.resolve({ count: 1 });
			}
			return Promise.resolve({ count: 0 });
		});
		const generated = await service.generateOtp({ userId: 'user-1' });
		await expect(service.generateOtp({ userId: 'user-1' })).rejects.toBeInstanceOf(
			OtpCooldownError,
		);
		await service.invalidateOtp({
			userId: generated.userId,
			otp: generated.otp,
			expiresAt: generated.expiresAt,
		});
		expect(model.deleteMany).toHaveBeenCalledWith({
			where: { userId: generated.userId, otp: generated.otp, expiresAt: expiry },
		});
		await expect(service.generateOtp({ userId: 'user-1' })).resolves.toBeDefined();
	});

	it('does not remove a newer issuance when cleanup for an older mail send finishes', async () => {
		const { service, model } = setup();
		const newer = makeRecord({ otp: '654321' });
		model.deleteMany.mockImplementation(({ where }) =>
			Promise.resolve({ count: where.otp === newer.otp ? 1 : 0 }),
		);
		await service.invalidateOtp({
			userId: newer.userId,
			otp: '123456',
			expiresAt: expiry,
		});
		model.findUnique.mockResolvedValue(newer);
		await expect(
			service.generateOtp({ userId: newer.userId }),
		).rejects.toBeInstanceOf(OtpCooldownError);
	});

	it('returns false for a missing code without writing', async () => {
		const { service, model } = setup();
		await expect(
			service.verifyOtp({ userId: 'user-1', otp: '123456' }),
		).resolves.toBe(false);
		expect(model.updateMany).not.toHaveBeenCalled();
		expect(model.deleteMany).not.toHaveBeenCalled();
	});

	it('rejects invalid TTL configuration rather than silently using an unsafe value', () => {
		process.env.OTP_EXPIRES_IN = '-1';
		expect(() => otpsConfig.otpExpiresIn).toThrow('OTP_EXPIRES_IN');
	});
});
