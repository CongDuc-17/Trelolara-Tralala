import { prisma as database, runInTransaction, type DatabaseClient } from '../database';
import { BoardsRepository } from '../boards/boards.repository';
export class LabelsRepository {
	constructor(private readonly prismaService: DatabaseClient = database) {}

	inTransaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
		return runInTransaction(work, this.prismaService);
	}

	lockBoard(boardId: string, client: DatabaseClient): Promise<void> {
		return new BoardsRepository(client).lockBoard(boardId);
	}
	getBoardState(boardId: string, client: DatabaseClient = this.prismaService) {
		return client.boards.findUnique({
			where: { id: boardId },
			select: {
				status: true,
				deletedAt: true,
				project: { select: { status: true, deletedAt: true } },
			},
		});
	}

	async createLabel(
		data: { name: string; color: string; boardId: string },
		client: DatabaseClient = this.prismaService,
	) {
		return client.labels.create({
			data: {
				name: data.name,
				color: data.color,
				boardId: data.boardId,
			},
		});
	}

	async getLabelById(labelId: string, client: DatabaseClient = this.prismaService) {
		return client.labels.findUnique({
			where: {
				id: labelId,
			},
		});
	}
	async updateLabel(
		labelId: string,
		data: { name?: string; color?: string },
		client: DatabaseClient = this.prismaService,
	) {
		return client.labels.update({
			where: {
				id: labelId,
			},
			data,
		});
	}

	async deleteLabel(labelId: string, client: DatabaseClient = this.prismaService) {
		await client.cardLabels.deleteMany({
			where: {
				labelId: labelId,
			},
		});

		return client.labels.delete({
			where: {
				id: labelId,
			},
		});
	}

	async getLabelsByBoardId(boardId: string) {
		return this.prismaService.labels.findMany({
			where: {
				boardId: boardId,
			},
		});
	}
}
