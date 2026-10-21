import { NotFoundException } from '@/common/exceptions';

import { Exception } from '@/common/exceptions/app-error';
import { HttpResponseBodySuccessDto } from '@/common/dtos/httpResponseBodySuccess.dto';
import { ChecklistItemsRepository } from './checklistItems.repository';
import { ChecklistsRepository } from '../checklists/checklists.repository';
import { ChecklistResponseDto } from '../checklists/dtos/responses';
import { ChecklistItemResponseDto } from './dtos/responses/checklistItem.response';

export class ChecklistItemsService {
	constructor(
		private checklistItemsRepository: ChecklistItemsRepository = new ChecklistItemsRepository(),
		private checklistsRepository: ChecklistsRepository = new ChecklistsRepository(),
	) {}

	async createChecklistItem(
		checklistId: string,
		title: string,
	): Promise<Exception | HttpResponseBodySuccessDto<ChecklistItemResponseDto>> {
		const checklist = await this.checklistsRepository.getChecklistById(checklistId);
		if (!checklist) {
			throw new NotFoundException('Checklist not found');
		}
		const checklistItem = await this.checklistItemsRepository.createChecklistItem(
			checklistId,
			title,
		);
		return {
			success: true,
			data: new ChecklistItemResponseDto({
				id: checklistItem.id,
				title: checklistItem.title,
				isCompleted: checklistItem.completed,
				checklistId: checklistItem.checklistId,
			}),
		};
	}

	async updateChecklistItem(
		checklistItemId: string,
		title?: string,
		completed?: boolean,
	): Promise<Exception | HttpResponseBodySuccessDto<ChecklistItemResponseDto>> {
		const checklistItem =
			await this.checklistItemsRepository.getChecklistItemById(checklistItemId);
		if (!checklistItem) {
			throw new NotFoundException('Checklist item not found');
		}
		const updatedChecklistItem =
			await this.checklistItemsRepository.updateChecklistItem(checklistItemId, {
				title,
				completed,
			});
		return {
			success: true,
			data: new ChecklistItemResponseDto({
				id: updatedChecklistItem.id,
				title: updatedChecklistItem.title,
				isCompleted: updatedChecklistItem.completed,
				checklistId: updatedChecklistItem.checklistId,
			}),
		};
	}

	async deleteChecklistItem(
		checklistItemId: string,
	): Promise<Exception | HttpResponseBodySuccessDto<any>> {
		const checklistItem =
			await this.checklistItemsRepository.getChecklistItemById(checklistItemId);
		if (!checklistItem) {
			throw new NotFoundException('Checklist item not found');
		}
		await this.checklistItemsRepository.deleteChecklistItemById(checklistItemId);
		return {
			success: true,
			data: null,
		};
	}
}
