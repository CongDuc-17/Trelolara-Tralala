import { ClientException } from '@/common/exceptions/app-error';
import { StatusCodes } from 'http-status-codes';

export class ConflictException extends ClientException {
	constructor(public readonly resource?: string) {
		super(StatusCodes.CONFLICT, `Resources already exist ${resource}`);
	}
}
