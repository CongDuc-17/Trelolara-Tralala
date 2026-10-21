import { prisma } from '../../modules/database';

let cleanupInterval: NodeJS.Timeout | undefined;

export async function cleanupExpiredTokens(): Promise<void> {
	await prisma.tokens.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

export function startTokenCleanupScheduler(intervalHours = 1): void {
	if (!Number.isFinite(intervalHours) || intervalHours <= 0) throw new Error('Cleanup interval must be positive');
	if (cleanupInterval) return;
	cleanupInterval = setInterval(() => {
		void cleanupExpiredTokens().catch(() => console.error('Token cleanup failed'));
	}, intervalHours * 60 * 60 * 1000);
	cleanupInterval.unref();
}

export function stopTokenCleanupScheduler(): void {
	if (cleanupInterval) clearInterval(cleanupInterval);
	cleanupInterval = undefined;
}

