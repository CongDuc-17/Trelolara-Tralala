import { prisma as database, type DatabaseClient } from '../database';
export class LabelsRepository {
	constructor(private readonly prismaService: DatabaseClient = database) {}

	async createLabel(data: { name: string; color: string; boardId: string }) {
		return this.prismaService.labels.create({
			data: {
				name: data.name,
				color: data.color,
				boardId: data.boardId,
			},
		});
	}

	async findLabel(name: string, color: string, boardId: string) {
		return this.prismaService.labels.count({
			where: {
				name: name,
				color: color,
				boardId: boardId,
			},
		});
	}

	async getLabelById(labelId: string) {
		return this.prismaService.labels.findUnique({
			where: {
				id: labelId,
			},
		});
	}
	async updateLabel(labelId: string, data: { name?: string; color?: string }) {
		return this.prismaService.labels.update({
			where: {
				id: labelId,
			},
			data: {
				name: data.name,
				color: data.color,
			},
		});
	}

	async deleteLabel(labelId: string) {
		await this.prismaService.cardLabels.deleteMany({
			where: {
				labelId: labelId,
			},
		});

		return this.prismaService.labels.delete({
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
