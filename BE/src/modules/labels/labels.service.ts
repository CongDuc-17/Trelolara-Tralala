import {
	ConflictException,
	NotFoundException,
	OptionalException,
} from '@/common/exceptions';
import { LabelsRepository } from './labels.repository';
import { recordCardActivity } from '../cardActivities/card-activity';
import type { DatabaseClient } from '../database';
import type { LabelRecord, LabelUpdate } from './labels.types';

export class LabelsService {
	constructor(private readonly repository = new LabelsRepository()) {}
	createLabel(name: string, color: string, boardId: string): Promise<LabelRecord> {
		return this.repository.inTransaction(async (client) => {
			await this.requireBoard(boardId, client);
			try {
				return await this.repository.createLabel(
					{ name, color, boardId },
					client,
				);
			} catch (error) {
				this.rethrowConflict(error);
			}
		});
	}
	updateLabel(
		labelId: string,
		input: LabelUpdate,
		actorId: string,
	): Promise<LabelRecord> {
		return this.withLabel(labelId, async (label, client) => {
			if (input.name === undefined && input.color === undefined)
				throw new OptionalException(422, 'No fields to update');
			const changes: LabelUpdate = {};
			if (input.name !== undefined && input.name !== label.name)
				changes.name = input.name;
			if (input.color !== undefined && input.color !== label.color)
				changes.color = input.color;
			if (Object.keys(changes).length === 0) return label;
			try {
				const updated = await this.repository.updateLabel(
					labelId,
					changes,
					client,
				);
				const changedFields: ('name' | 'color')[] = [];
				if (changes.name !== undefined) changedFields.push('name');
				if (changes.color !== undefined) changedFields.push('color');
				for (const cardId of await this.repository.listCardIds(labelId, client))
					await recordCardActivity(client, {
						cardId,
						userId: actorId,
						action: 'label_updated',
						metadata: { labelId, changedFields },
					});
				return updated;
			} catch (error) {
				this.rethrowConflict(error);
			}
		});
	}
	async getLabelsByBoardId(boardId: string): Promise<LabelRecord[]> {
		if (!(await this.repository.getBoardState(boardId)))
			throw new NotFoundException('Board not found');
		return this.repository.getLabelsByBoardId(boardId);
	}
	async deleteLabel(labelId: string, actorId: string): Promise<void> {
		await this.withLabel(
			labelId,
			async (_label, client) => {
				const cardIds = await this.repository.listCardIds(labelId, client);
				await this.repository.deleteLabel(labelId, client);
				for (const cardId of cardIds)
					await recordCardActivity(client, {
						cardId,
						userId: actorId,
						action: 'label_removed',
						metadata: { labelId, reason: 'label_deleted' },
					});
			},
			false,
		);
	}
	private withLabel<T>(
		labelId: string,
		work: (label: LabelRecord, client: DatabaseClient) => Promise<T>,
		active = true,
	): Promise<T> {
		return this.repository.inTransaction(async (client) => {
			const initial = await this.repository.getLabelById(labelId, client);
			if (!initial) throw new NotFoundException('Label not found');
			await this.requireBoard(initial.boardId, client, active);
			const label = await this.repository.getLabelById(labelId, client);
			if (!label) throw new NotFoundException('Label not found');
			return work(label, client);
		});
	}
	private async requireBoard(
		boardId: string,
		client: DatabaseClient,
		active = true,
	): Promise<void> {
		await this.repository.lockBoard(boardId, client);
		const board = await this.repository.getBoardState(boardId, client);
		if (!board) throw new NotFoundException('Board not found');
		if (
			active &&
			(board.status !== 'ACTIVE' ||
				board.deletedAt ||
				board.project.status !== 'ACTIVE' ||
				board.project.deletedAt)
		)
			throw new OptionalException(409, 'Board or project is read-only');
	}
	private rethrowConflict(error: unknown): never {
		if (
			error &&
			typeof error === 'object' &&
			'code' in error &&
			error.code === 'P2002'
		)
			throw new ConflictException('Label name in this board');
		throw error;
	}
}
