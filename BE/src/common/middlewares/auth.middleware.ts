import type { Request, RequestHandler } from 'express';
import { z } from 'zod';

import { AuthService } from '@/modules/auth/auth.service';
import { readCookie } from '@/modules/auth/auth.cookies';
import {
	PermissionService,
	type ResourceAction,
} from '@/modules/permissions/permission.service';
import {
	OptionalException,
	UnauthorizedException,
	ForbiddenException,
	NotFoundException,
} from '../exceptions';
import { prisma } from '@/modules/database';

const resourceKeys = [
	'projectId',
	'boardId',
	'listId',
	'cardId',
	'checklistId',
	'checklistItemId',
	'labelId',
	'commentId',
] as const;

function getResource(
	req: Request,
): Partial<Record<(typeof resourceKeys)[number], string>> {
	const resource: Partial<Record<(typeof resourceKeys)[number], string>> = {};
	for (const key of resourceKeys) {
		const value = req.params[key];
		if (value === undefined) continue;
		if (typeof value !== 'string' || !z.uuid().safeParse(value).success)
			throw new OptionalException(422, 'Invalid ' + key);
		resource[key] = value;
	}
	return resource;
}

export class AuthMiddleware {
	constructor(
		private readonly auth = new AuthService(),
		private readonly permissions = new PermissionService(),
	) {}

	verifyAccessToken: RequestHandler = async (req, _res, next) => {
		try {
			const token = readCookie(req, 'accessToken');
			if (!token) throw new UnauthorizedException();
			req.user = await this.auth.authenticateAccessToken(token);
			next();
		} catch (error) {
			next(error);
		}
	};

	verifyProjectLifecycle(action: ResourceAction = 'write'): RequestHandler {
		return async (req, _res, next) => {
			try {
				await this.permissions.assertProjectLifecycle(getResource(req), action);
				next();
			} catch (error) {
				next(error);
			}
		};
	}

	verifyBoardLifecycle(action: ResourceAction = 'write'): RequestHandler {
		return async (req, _res, next) => {
			try {
				await this.permissions.assertBoardLifecycle(getResource(req), action);
				next();
			} catch (error) {
				next(error);
			}
		};
	}

	verifyListLifecycle(): RequestHandler {
		return async (req, _res, next) => {
			try {
				await this.permissions.assertListLifecycle(getResource(req));
				next();
			} catch (error) {
				next(error);
			}
		};
	}

	verifySystemPermission(...permissions: string[]): RequestHandler {
		return async (req, _res, next) => {
			try {
				if (!req.user?.id) throw new UnauthorizedException();
				if (
					!(await this.permissions.hasSystemPermission(
						req.user.id,
						permissions,
					))
				)
					throw new ForbiddenException();
				next();
			} catch (error) {
				next(error);
			}
		};
	}

	verifyProjectPermission(...permissions: string[]): RequestHandler {
		return async (req, _res, next) => {
			try {
				if (!req.user?.id) throw new UnauthorizedException();
				const resource = getResource(req);
				const projectId = await this.permissions.resolveProjectId(resource);
				if (!projectId) throw new NotFoundException('Project');
				if (
					!(await this.permissions.hasProjectPermission(
						req.user.id,
						projectId,
						permissions,
					))
				)
					throw new ForbiddenException();
				next();
			} catch (error) {
				next(error);
			}
		};
	}

	verifyBoardPermission(...permissions: string[]): RequestHandler {
		return async (req, _res, next) => {
			try {
				if (!req.user?.id) throw new UnauthorizedException();
				const resource = getResource(req);
				const boardId = await this.permissions.resolveBoardId(resource);
				if (!boardId) throw new NotFoundException('Board');
				if (
					!(await this.permissions.hasBoardPermission(
						req.user.id,
						boardId,
						permissions,
					))
				)
					throw new ForbiddenException();
				next();
			} catch (error) {
				next(error);
			}
		};
	}

	verifyInvitationRole(scope: 'project' | 'board'): RequestHandler {
		return async (req, _res, next) => {
			try {
				if (!req.user?.id) throw new UnauthorizedException();
				const roleId: unknown = req.body?.roleId;
				if (roleId === undefined) return next();
				if (typeof roleId !== 'string' || !z.uuid().safeParse(roleId).success)
					throw new OptionalException(422, 'Invalid roleId');
				const role = await prisma.roles.findUnique({ where: { id: roleId } });
				const prefix = scope.toUpperCase() + '_';
				if (
					!role ||
					role.status !== 'ACTIVE' ||
					role.deletedAt ||
					!role.name.startsWith(prefix)
				)
					throw new OptionalException(
						422,
						'Role does not belong to this scope',
					);
				if (role.name !== prefix + 'MEMBER' && role.name !== prefix + 'VIEWER') {
					const resource = getResource(req);
					const allowed =
						scope === 'project'
							? await this.permissions.hasProjectAdmin(
									req.user.id,
									resource.projectId!,
								)
							: await this.permissions.hasBoardAdmin(
									req.user.id,
									resource.boardId!,
								);
					if (!allowed) throw new ForbiddenException();
				}
				next();
			} catch (error) {
				next(error);
			}
		};
	}
}

export default new AuthMiddleware();
