import { HttpResponseBodySuccessDto, NotFoundException } from '@/common';
import { LabelsRepository } from './labels.repository';
import { Exception } from '@/common/exceptions/app-error';
import { BoardsRepository } from '../boards/boards.repository';
import { LabelResponseDto } from './dtos/responses';

export class LabelsService {
	constructor(
		private readonly labelsRepository = new LabelsRepository(),
		private readonly boardsRepository = new BoardsRepository(),
	) {}

	async createLabel(
		name: string,
		color: string,
		boardId: string,
	): Promise<HttpResponseBodySuccessDto<LabelResponseDto> | Exception> {
		const board = await this.boardsRepository.getBoardById(boardId);
		if (!board) {
			throw new NotFoundException('Board not found');
		}
		const existingLabel = await this.labelsRepository.findLabel(name, color, boardId);
		if (existingLabel > 0) {
			throw new Exception(
				400,
				'Label with the same name and color already exists in this board',
			);
		}

		const label = await this.labelsRepository.createLabel({ name, color, boardId });

		return {
			success: true,
			data: new LabelResponseDto({ ...label }),
		};
	}

	async updateLabel(
		labelId: string,
		name: string,
		color: string,
	): Promise<HttpResponseBodySuccessDto<LabelResponseDto> | Exception> {
		const existingLabel = await this.labelsRepository.getLabelById(labelId);

		if (!existingLabel) {
			throw new NotFoundException('Label not found');
		}

		// Nếu name và color giống với label hiện tại, không cần update
		if (existingLabel.name === name && existingLabel.color === color) {
			return {
				success: true,
				data: new LabelResponseDto({
					id: labelId,
					name: existingLabel.name,
					color: existingLabel.color,
					boardId: existingLabel.boardId,
				}),
			};
		}

		const duplicateLabel = await this.labelsRepository.findLabel(
			name,
			color,
			existingLabel.boardId,
		);
		if (duplicateLabel > 0) {
			throw new Exception(
				400,
				'Label with the same name and color already exists in this board',
			);
		}

		await this.labelsRepository.updateLabel(labelId, { name, color });
		return {
			success: true,
			data: new LabelResponseDto({
				id: labelId,
				name,
				color,
				boardId: existingLabel.boardId,
			}),
		};
	}

	async getLabelsByBoardId(boardId: string): Promise<LabelResponseDto[]> {
		const board = await this.boardsRepository.getBoardById(boardId);
		if (!board) {
			throw new NotFoundException('Board not found');
		}
		const labels = await this.labelsRepository.getLabelsByBoardId(boardId);
		return labels.map(
			(label) =>
				new LabelResponseDto({
					id: label.id,
					name: label.name,
					color: label.color,
					boardId: label.boardId,
				}),
		);
	}

	async deleteLabel(
		labelId: string,
	): Promise<HttpResponseBodySuccessDto<null> | Exception> {
		const existingLabel = await this.labelsRepository.getLabelById(labelId);
		if (!existingLabel) {
			throw new NotFoundException('Label not found');
		}
		await this.labelsRepository.deleteLabel(labelId);
		return {
			success: true,
			data: null,
		};
	}
}
