import { checklistItems } from '@prisma/client';
import { prisma as database, type DatabaseClient } from '../database';

export class ChecklistItemsRepository {
	constructor(private readonly prismaService: DatabaseClient = database) {}

	async createChecklistItem(
		checklistId: string,
		title: string,
	): Promise<checklistItems> {
		return this.prismaService.checklistItems.create({
			data: {
				checklistId,
				title,
			},
		});
	}

	async getChecklistItemById(checklistItemId: string): Promise<checklistItems | null> {
		return this.prismaService.checklistItems.findUnique({
			where: {
				id: checklistItemId,
			},
		});
	}

	async getAllChecklistItemsByChecklistId(
		checklistId: string,
	): Promise<checklistItems[]> {
		return this.prismaService.checklistItems.findMany({
			where: {
				checklistId,
			},
			orderBy: {
				createdAt: 'asc',
			},
		});
	}

	async updateChecklistItem(
		checklistItemId: string,
		data: {
			title?: string;
			completed?: boolean;
		},
	): Promise<checklistItems> {
		// Chỉ build object với những field được truyền (không undefined)
		const updateData: any = {};
		if (data.title !== undefined) {
			updateData.title = data.title;
		}
		if (data.completed !== undefined) {
			updateData.completed = data.completed;
		}

		return this.prismaService.checklistItems.update({
			where: {
				id: checklistItemId,
			},
			data: updateData,
		});
	}

	async deleteChecklistItemById(checklistItemId: string): Promise<checklistItems> {
		return this.prismaService.checklistItems.delete({
			where: {
				id: checklistItemId,
			},
		});
	}

	async deleteCheckListItemsByChecklistId(checklistId: string): Promise<number> {
		const result = await this.prismaService.checklistItems.deleteMany({
			where: {
				checklistId,
			},
		});
		return result.count;
	}
}
