import { NotFoundException, OptionalException } from '@/common/exceptions';
import {
	calculateNewPosition,
	isPositionBetween,
} from '@/common/utils/calculateNewPosition';
import { ListsRepository } from './list.repository';
import type { ListRecord, ListStatus } from './lists.types';

export class ListsService {
	constructor(private readonly repository = new ListsRepository()) {}

	async getAllListsByBoardId(
		boardId: string,
		status?: ListStatus,
	): Promise<ListRecord[]> {
		if (!(await this.repository.getBoardState(boardId)))
			throw new NotFoundException('Board not found');
		return this.repository.getAllListsByBoardId(boardId, status);
	}

	createList(name: string, boardId: string): Promise<ListRecord> {
		return this.repository.inTransaction(async (repository) => {
			await repository.lockBoard(boardId);
			await this.requireActiveBoard(repository, boardId);
			const siblings = await repository.getActiveListsByBoardId(boardId);
			const position = await this.allocatePosition(
				repository,
				siblings,
				siblings.length,
			);
			return repository.createList(name, boardId, position);
		});
	}

	async moveList(
		listId: string,
		beforeListId?: string,
		afterListId?: string,
	): Promise<ListRecord> {
		if (
			beforeListId === listId ||
			afterListId === listId ||
			(beforeListId && beforeListId === afterListId)
		) {
			throw new OptionalException(
				422,
				'Neighbors must be distinct from each other and the moved list',
			);
		}
		return this.withLockedList(listId, async (repository, list) => {
			const siblings = (
				await repository.getActiveListsByBoardId(list.boardId)
			).filter((item) => item.id !== listId);
			const before =
				beforeListId === undefined
					? -1
					: siblings.findIndex((item) => item.id === beforeListId);
			const after =
				afterListId === undefined
					? -1
					: siblings.findIndex((item) => item.id === afterListId);
			if (
				(beforeListId !== undefined && before < 0) ||
				(afterListId !== undefined && after < 0)
			) {
				throw new OptionalException(
					422,
					'Neighbors must be active lists in the same board',
				);
			}
			if (before >= 0 && after >= 0 && before + 1 !== after)
				throw new OptionalException(
					422,
					'Neighbors must be adjacent and ordered',
				);
			const index = after >= 0 ? after : before >= 0 ? before + 1 : siblings.length;
			const position = await this.allocatePosition(repository, siblings, index);
			return repository.updateListPosition(listId, position);
		});
	}

	updateListName(name: string, listId: string): Promise<ListRecord> {
		return this.withLockedList(listId, (repository, list) =>
			list.name === name
				? Promise.resolve(list)
				: repository.updateListName(listId, name),
		);
	}

	archiveList(listId: string): Promise<ListRecord> {
		return this.withLockedList(listId, (repository) =>
			repository.archiveList(listId),
		);
	}

	restoreList(listId: string): Promise<ListRecord> {
		return this.withLockedList(
			listId,
			async (repository, list) => {
				await this.requireActiveBoard(repository, list.boardId);
				if (list.status !== 'ARCHIVED')
					throw new OptionalException(
						400,
						'Only archived lists can be restored',
					);
				return repository.restoreList(listId);
			},
			false,
		);
	}

	deleteList(listId: string): Promise<void> {
		return this.withLockedList(
			listId,
			(repository) => repository.deleteList(listId),
			false,
		);
	}

	private withLockedList<T>(
		listId: string,
		work: (repository: ListsRepository, list: ListRecord) => Promise<T>,
		active = true,
	): Promise<T> {
		return this.repository.inTransaction(async (repository) => {
			await repository.lockList(listId);
			const list = await repository.getListById(listId);
			if (!list) throw new NotFoundException('List not found');
			if (active) {
				await this.requireActiveBoard(repository, list.boardId);
				if (list.status !== 'ACTIVE' || list.deletedAt)
					throw new OptionalException(409, 'List is read-only');
			}
			return work(repository, list);
		});
	}

	private async requireActiveBoard(
		repository: ListsRepository,
		boardId: string,
	): Promise<void> {
		const board = await repository.getBoardState(boardId);
		if (!board) throw new NotFoundException('Board not found');
		if (board.project.status !== 'ACTIVE' || board.project.deletedAt)
			throw new OptionalException(409, 'Project is read-only');
		if (board.status !== 'ACTIVE' || board.deletedAt)
			throw new OptionalException(409, 'Board is read-only');
	}

	private async allocatePosition(
		repository: ListsRepository,
		siblings: ListRecord[],
		index: number,
	): Promise<number> {
		let position = calculateNewPosition(
			siblings[index - 1]?.position,
			siblings[index]?.position,
		);
		if (
			isPositionBetween(
				position,
				siblings[index - 1]?.position,
				siblings[index]?.position,
			)
		)
			return position;
		// A finite, strict gap is required; PostgreSQL Float positions need no uniqueness constraint.
		for (let i = 0; i < siblings.length; i++)
			await repository.updateListPosition(siblings[i].id, i + 1);
		position = calculateNewPosition(
			index > 0 ? index : undefined,
			index < siblings.length ? index + 1 : undefined,
		);
		return position;
	}
}
