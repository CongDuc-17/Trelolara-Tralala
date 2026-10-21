import { prisma as database, runInTransaction, type DatabaseClient } from '../database';

export class CommentsRepository {
	constructor(private readonly prismaService: DatabaseClient = database) {}

	inTransaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
		return runInTransaction(work, this.prismaService);
	}

	async createComment(
		{
			cardId,
			userId,
			content,
		}: {
			cardId: string;
			userId: string;
			content: string;
		},
		client: DatabaseClient = this.prismaService,
	) {
		return client.cardComments.create({
			data: {
				content,
				cardId,
				userId,
			},
			include: {
				user: true,
			},
		});
	}

	async updateComment(
		{ commentId, content }: { commentId: string; content: string },
		client: DatabaseClient = this.prismaService,
	) {
		return client.cardComments.update({
			where: {
				id: commentId,
			},
			data: {
				content,
				updatedAt: new Date(),
			},
			include: {
				user: true,
			},
		});
	}

	async getCommentsByCardId({ cardId }: { cardId: string }) {
		return this.prismaService.cardComments.findMany({
			where: {
				cardId,
			},
			include: {
				user: true,
			},
			orderBy: {
				createdAt: 'desc',
			},
		});
	}

	async getCommentById({ commentId }: { commentId: string }) {
		return this.prismaService.cardComments.findUnique({
			where: {
				id: commentId,
			},
			include: {
				user: true,
			},
		});
	}
}
