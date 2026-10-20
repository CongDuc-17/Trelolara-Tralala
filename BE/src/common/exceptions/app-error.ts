export class AppError extends Error {
	constructor(public readonly status: number, message: string) {
		super(message);
		this.name = new.target.name;
	}
}

// Legacy modules keep their error contracts while migrating away from HTTP-shaped services.
export { AppError as Exception, AppError as HTTPException, AppError as ClientException, AppError as ServerException };

export class Forbidden extends AppError {
	constructor(message = 'Forbidden') { super(403, message); }
}

export class NotFound extends AppError {
	constructor(message = 'Resource not found') { super(404, message); }
}
