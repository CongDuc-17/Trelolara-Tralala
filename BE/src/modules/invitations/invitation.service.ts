import { MailsService } from '../mails/mail.service';
import { BoardMembersRepository } from '../boardMembers/boardMember.repository';
import { roles } from '@prisma/client';
import { Exception } from '@/common/exceptions/app-error';

import { BoardsRepository } from '../boards/boards.repository';
import { UsersRepository } from '../users/users.repository';

import { ProjectsRepository } from '../projects/project.repository';
import { InvitationsRepository } from './invitation.repository';

import {
	ConflictException,
	HttpResponseBodySuccessDto,
	NotFoundException,
	ResponseStatus,
	ServiceResponse,
} from '@/common';
import { InvitationResponseDto } from './dtos/responses';
import { ProjectMembersRepository } from '../projectMembers/projectMember.repository';
import { RolesRepository } from '../roles/roles.repository';
import { StatusCodes } from 'http-status-codes/build/cjs/status-codes';
import { randomBytes } from 'crypto';
import { InvitationStatusEnum } from '@prisma/client';
import { startsWith } from 'zod';
import { NotificationsService } from '../notifications/notifications.service';

export class InvitationService {
	constructor(
		private readonly invitationRepository = new InvitationsRepository(),
		private readonly usersRepository = new UsersRepository(),
		private readonly projectMembersRepository = new ProjectMembersRepository(),
		private readonly boardMembersRepository = new BoardMembersRepository(),
		private readonly rolesRepository = new RolesRepository(),
		private readonly projectRepository = new ProjectsRepository(),
		private readonly boardsRepository = new BoardsRepository(),
		private readonly mailsService = new MailsService(),
		private readonly notificationService: NotificationsService = new NotificationsService(),
	) {}

	async inviteUserToProject(
		projectId: string,
		inviterId: string,
		email: string,
		roleId: string,
	): Promise<HttpResponseBodySuccessDto<InvitationResponseDto> | Exception> {
		const existingUser = await this.usersRepository.findUser({ email });
		const project = await this.projectRepository.getProjectById(projectId);
		if (!project) {
			throw new NotFoundException('Project not found');
		}
		const role = await this.rolesRepository.findById(roleId);
		if (!role) {
			throw new NotFoundException('Role not found');
		}
		if (!role.name.startsWith('PROJECT_')) {
			throw new ConflictException('Role is not a project role');
		}
		const actor = await this.usersRepository.findUser({ userId: inviterId });
		if (!actor) {
			throw new NotFoundException('Inviter not found');
		}
		if (existingUser) {
			const existingMember =
				await this.projectMembersRepository.isUserMemberOfProject(
					projectId,
					existingUser.id,
				);
			if (existingMember) {
				throw new ConflictException('User is already a member of the project ');
			}

			const newMember = await this.projectMembersRepository.assignUserRoleProject(
				projectId,
				existingUser.id,
				roleId,
			);

			// await this.mailsService.sendEmail({
			// 	recipients: [
			// 		{
			// 			address: email,
			// 			name: 'User',
			// 		},
			// 	],
			// 	subject: 'You have been added to a project',
			// 	html: `You have been added to a project ${project.title}. Please log in to your account to access the project.`,
			// });
			// notification logic can be added here
			await this.notificationService.notifyProjectInvited({
				recipientUserId: existingUser.id,
				actorId: inviterId,
				actorName: actor.name,
				projectId,
				projectName: project.name,
			});

			return {
				success: true,
				data: new InvitationResponseDto({
					...newMember,
					email,
					projectId,
					inviterId,
				}),
			};
		} else {
			const existingInvitation = await this.invitationRepository.findPendingByEmail(
				email,
				projectId,
				undefined,
			);

			if (existingInvitation.length > 0) {
				throw new ConflictException(
					'An invitation has already been sent to this email for the project hehe',
				);
			}

			const token = randomBytes(32).toString('hex');
			const expiresAt = new Date();
			expiresAt.setDate(expiresAt.getDate() + 7); // Invitation valid for 7 days

			const invitation = await this.invitationRepository.create({
				projectId,
				email,
				token,
				roleId,
				inviterId,
				expiresAt,
			});

			return {
				success: true,
				data: new InvitationResponseDto({
					token,
					email,
					projectId: invitation.projectId ?? undefined,
					boardId: invitation.boardId ?? undefined,
					roleId,
					inviterId,
				}),
			};
		}
	}

	async inviteUserToBoard(
		boardId: string,
		inviterId: string,
		email: string,
		roleId: string,
	): Promise<HttpResponseBodySuccessDto<InvitationResponseDto> | Exception> {
		const board = await this.boardsRepository.getBoardById(boardId);
		if (!board) {
			throw new NotFoundException('Board not found');
		}
		const role = await this.rolesRepository.findById(roleId);
		if (!role) {
			throw new NotFoundException('Role not found');
		}
		if (!role.name.startsWith('BOARD_')) {
			throw new ConflictException('Role is not a board role');
		}
		const actor = await this.usersRepository.findUser({ userId: inviterId });
		if (!actor) {
			throw new NotFoundException('Inviter not found');
		}

		const existingUser = await this.usersRepository.findUser({ email });

		if (existingUser) {
			const existingMember = await this.boardMembersRepository.isUserMemberOfBoard(
				boardId,
				existingUser.id,
			);
			if (existingMember) {
				throw new ConflictException('User is already a member of the board');
			}

			const newMember = await this.boardMembersRepository.assignUserRoleBoard(
				boardId,
				existingUser.id,
				roleId,
			);

			await this.notificationService.notifyBoardInvited({
				recipientUserId: existingUser.id,
				actorId: inviterId,
				actorName: actor.name,
				boardId,
				boardName: board.name,
			});
			return {
				success: true,
				data: new InvitationResponseDto({
					...newMember,
					email,
					boardId,
					inviterId,
				}),
			};
		} else {
			const existingInvitation = await this.invitationRepository.findPendingByEmail(
				email,
				undefined,
				boardId,
			);

			if (existingInvitation.length > 0) {
				throw new ConflictException(
					'An invitation has already been sent to this email for the board hehe',
				);
			}

			const token = randomBytes(32).toString('hex');
			const expiresAt = new Date();
			expiresAt.setDate(expiresAt.getDate() + 7); // Invitation valid for 7 days

			const invitation = await this.invitationRepository.create({
				boardId,
				email,
				token,
				roleId,
				inviterId,
				expiresAt,
			});
			// email sending logic can be added here
			// await this.mailsService.sendEmail({
			// 	recipients: [
			// 		{
			// 			address: email,
			// 			name: 'User',
			// 		},
			// 	],
			// 	subject: 'You are invited to join a board',
			// 	html: `You have been invited to join a board. Please use the following token to accept the invitation: <a href="http://localhost:5173/S-Group-Trello/register">Accept Invitation</a>. This invitation is valid until ${expiresAt.toDateString()}.`,
			// });
			return {
				success: true,
				data: new InvitationResponseDto({
					token,
					email,
					projectId: invitation.projectId ?? undefined,
					boardId: invitation.boardId ?? undefined,
					roleId,
					inviterId,
				}),
			};
		}
	}

	async createShareLinkForProject(
		projectId: string,
		inviterId: string,
		roleId: string,
	): Promise<HttpResponseBodySuccessDto<{ token: string; shareUrl: string }>> {
		const project = await this.projectRepository.getProjectById(projectId);
		if (!project) {
			throw new NotFoundException('Project not found');
		}

		const role = await this.rolesRepository.findById(roleId);
		if (!role || !role.name.startsWith('PROJECT_')) {
			throw new NotFoundException('Role not found or invalid');
		}

		const token = randomBytes(32).toString('hex');
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + 30); // Link valid 30 days

		const invitation = await this.invitationRepository.createShareLink({
			projectId,
			token,
			roleId,
			inviterId,
			expiresAt,
		});

		const shareUrl = `${process.env.FRONTEND_URL}/invite/projects/${token}`;

		return {
			success: true,
			data: {
				token,
				shareUrl,
			},
		};
	}

	async createShareLinkForBoard(
		boardId: string,
		inviterId: string,
		roleId: string,
	): Promise<HttpResponseBodySuccessDto<{ token: string; shareUrl: string }>> {
		const board = await this.boardsRepository.getBoardById(boardId);
		if (!board) {
			throw new NotFoundException('Board not found');
		}
		const role = await this.rolesRepository.findById(roleId);
		if (!role || !role.name.startsWith('BOARD_')) {
			throw new NotFoundException('Role not found or invalid');
		}
		const token = randomBytes(32).toString('hex');
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + 30); // Link valid 30 days
		const invitation = await this.invitationRepository.createShareLink({
			boardId,
			token,
			roleId,
			inviterId,
			expiresAt,
		});
		const shareUrl = `${process.env.FRONTEND_URL}/invite/boards/${token}`;
		return {
			success: true,
			data: {
				token,
				shareUrl,
			},
		};
	}

	async acceptInvitation(
		token: string,
		userId: string,
	): Promise<HttpResponseBodySuccessDto<string> | Exception> {
		const invitation = await this.invitationRepository.findByToken(token);
		if (!invitation) {
			throw new NotFoundException('Invalid or expired invitation token');
		}
		if (invitation.expiresAt < new Date()) {
			throw new ConflictException('Invitation token has expired');
		}
		if (
			invitation.status !== InvitationStatusEnum.PENDING &&
			invitation.status !== InvitationStatusEnum.ACCEPTED
		) {
			throw new ConflictException('Invitation already processed');
		}

		if (invitation.projectId) {
			const checkMember = await this.projectMembersRepository.isUserMemberOfProject(
				invitation.projectId,
				userId,
			);
			if (checkMember) {
				throw new ConflictException('User is already a member of the project');
			}
			await this.projectMembersRepository.assignUserRoleProject(
				invitation.projectId,
				userId,
				invitation.roleId,
			);
		} else if (invitation.boardId) {
			const checkMember = await this.boardMembersRepository.isUserMemberOfBoard(
				invitation.boardId,
				userId,
			);
			if (checkMember) {
				throw new ConflictException('User is already a member of the board');
			}
			await this.boardMembersRepository.assignUserRoleBoard(
				invitation.boardId,
				userId,
				invitation.roleId,
			);
		}

		await this.invitationRepository.updateStatus(
			invitation.id,
			InvitationStatusEnum.ACCEPTED,
		);

		return {
			success: true,
			data: 'Invitation accepted successfully',
		};
	}

	async rejectInvitation(
		token: string,
		userId: string,
	): Promise<HttpResponseBodySuccessDto<string> | Exception> {
		const invitation = await this.invitationRepository.findByToken(token);
		if (!invitation) {
			throw new NotFoundException('Invitation not found');
		}
		if (
			invitation.status !== InvitationStatusEnum.PENDING &&
			invitation.status !== InvitationStatusEnum.ACCEPTED
		) {
			throw new ConflictException('Invitation already processed');
		}
		if (invitation.createdBy !== userId) {
			throw new ConflictException('Only the inviter can reject the invitation');
		}

		await this.invitationRepository.deleteById(invitation.id);

		return {
			success: true,
			data: 'Invitation rejected successfully',
		};
	}

	async findPendingInvitationsByEmail(
		email: string,
	): Promise<HttpResponseBodySuccessDto<any> | null> {
		const invitations = await this.invitationRepository.findPendingByEmail(email);
		if (invitations.length === 0) {
			return null;
		}
		return {
			success: true,
			data: invitations,
		};
	}
}
