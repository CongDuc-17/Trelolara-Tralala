import { NextFunction, Request, Response } from 'express';
import { RolesService } from './roles.service';
export class RoleController {
	constructor(private readonly rolesService = new RolesService()) {}
	async getAllRoles(req: Request, res: Response, next: NextFunction) {
		try {
			const result = await this.rolesService.getAllRoles();
			return res.status(200).json({
				success: true,
				message: 'Roles retrieved successfully',
				data: result,
			});
		} catch (error) {
			next(error);
		}
	}
}
