import type { Request, Response } from 'express';

export class HealthCheckController {
	start(_req: Request, res: Response): void {
		res.status(200).json({
			success: true,
			data: 'Service is running',
		});
	}
}
