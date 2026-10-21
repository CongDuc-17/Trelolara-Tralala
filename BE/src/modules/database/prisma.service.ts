import { Prisma, PrismaClient } from '@prisma/client';

export type DatabaseClient = PrismaClient | Prisma.TransactionClient;
export const prisma = new PrismaClient();

export function runInTransaction<T>(
	work: (transaction: Prisma.TransactionClient) => Promise<T>,
	client: DatabaseClient = prisma,
): Promise<T> {
	return '$transaction' in client ? client.$transaction(work) : work(client);
}
