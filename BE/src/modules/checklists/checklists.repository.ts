import { prisma as database, type DatabaseClient } from '../database';

export class ChecklistsRepository {
	constructor(private readonly prismaService: DatabaseClient = database) {}

	async createChecklist(cardId: string, title: string) {
		return this.prismaService.checklists.create({
			data: {
				title,
				cardId,
			},
		});
	}

	async getChecklistById(checklistId: string) {
		return this.prismaService.checklists.findUnique({
			where: {
				id: checklistId,
			},
			include: {
				checklistItems: true,
			},
		});
	}

	async updateChecklistTitle(checklistId: string, title: string) {
		return this.prismaService.checklists.update({
			where: {
				id: checklistId,
			},
			data: {
				title,
			},
		});
	}

	async deleteChecklist(checklistId: string) {
		await this.prismaService.checklistItems.deleteMany({
			where: {
				checklistId: checklistId,
			},
		});
		return this.prismaService.checklists.delete({
			where: {
				id: checklistId,
			},
		});
	}
}
