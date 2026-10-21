import { CardsRepository } from '../cards/card.repository';
import { ChecklistItemsRepository } from '../checklistItems/checklistItems.repository';
import { ChecklistsRepository } from './checklists.repository';

import { Exception } from '@/common/exceptions/app-error';

import { HttpResponseBodySuccessDto } from '@/common/dtos/httpResponseBodySuccess.dto';
import { NotFoundException } from '@/common/exceptions/notFound.exception';
import { ChecklistResponseDto } from './dtos/responses/checklist.response';
export class ChecklistsService {
	constructor(
		private readonly checklistsRepository: ChecklistsRepository = new ChecklistsRepository(),
		private readonly checklistItemsRepository: ChecklistItemsRepository = new ChecklistItemsRepository(),
		private readonly cardsRepository: CardsRepository = new CardsRepository(),
	) {}

	async createChecklist(
		cardId: string,
		title: string,
	): Promise<Exception | HttpResponseBodySuccessDto<ChecklistResponseDto>> {
		const card = await this.cardsRepository.getCardById(cardId);
		if (!card) {
			throw new NotFoundException('Card not found');
		}
		const checklist = await this.checklistsRepository.createChecklist(cardId, title);
		return {
			success: true,
			data: new ChecklistResponseDto(checklist),
		};
	}

	async getChecklistById(
		checklistId: string,
	): Promise<Exception | HttpResponseBodySuccessDto<ChecklistResponseDto>> {
		const checklist = await this.checklistsRepository.getChecklistById(checklistId);
		if (!checklist) {
			throw new NotFoundException('Checklist not found');
		}
		return {
			success: true,
			data: new ChecklistResponseDto(checklist),
		};
	}

	async updateChecklistTitle(
		checklistID: string,
		title: string,
	): Promise<Exception | HttpResponseBodySuccessDto<ChecklistResponseDto>> {
		const checklist = await this.checklistsRepository.getChecklistById(checklistID);
		if (!checklist) {
			throw new NotFoundException('Checklist not found');
		}
		const updatedChecklist = await this.checklistsRepository.updateChecklistTitle(
			checklistID,
			title,
		);
		return {
			success: true,
			data: new ChecklistResponseDto(updatedChecklist),
		};
	}

	async deleteChecklist(
		checklistId: string,
	): Promise<Exception | HttpResponseBodySuccessDto<any>> {
		const checklist = await this.checklistsRepository.getChecklistById(checklistId);
		if (!checklist) {
			throw new NotFoundException('Checklist not found');
		}

		//xoa cac checklist item lien quan den checklist
		await this.checklistItemsRepository.deleteCheckListItemsByChecklistId(
			checklistId,
		);

		//xoa checklist
		await this.checklistsRepository.deleteChecklist(checklistId);
		return {
			success: true,
			data: null,
		};
	}
}
