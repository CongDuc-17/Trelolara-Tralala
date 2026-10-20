import { Exception } from '@/common/exceptions/app-error';
import { Request, Response } from 'express';

import {
	GetNotificationsRequestDto,
	NotificationResponseDto,
	UnreadCountResponseDto,
} from './dtos';
import { NotificationsService } from './notifications.service';

import { HttpResponseDto, PaginationDto } from '@/common';
import { UserInformationDto } from '@/modules/users/dtos';

export class NotificationsController {
	constructor(
		private readonly notificationsService: NotificationsService = new NotificationsService(),
	) {}

	async getMyNotifications(req: Request): Promise<Response> {
		const user = req.user as UserInformationDto;
		const query = new GetNotificationsRequestDto(req.query);
		const pagination = new PaginationDto(req.query);

		const result = await this.notificationsService.getMyNotifications(
			user,
			query,
			pagination,
		);

		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}

		return new HttpResponseDto().success<NotificationResponseDto[]>(result);
	}

	async getMyUnreadCount(req: Request): Promise<Response> {
		const user = req.user as UserInformationDto;

		const result = await this.notificationsService.getMyUnreadCount(user);

		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}

		return new HttpResponseDto().success<UnreadCountResponseDto>(result);
	}

	async markAsRead(req: Request): Promise<Response> {
		const user = req.user as UserInformationDto;
		const { notificationId } = req.params as { notificationId: string };

		const result = await this.notificationsService.markAsRead(notificationId, user);

		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}

		return new HttpResponseDto().success<null>(result);
	}

	async markAllAsRead(req: Request): Promise<Response> {
		const user = req.user as UserInformationDto;

		const result = await this.notificationsService.markAllAsRead(user);

		if (result instanceof Exception) {
			return new HttpResponseDto().exception(result);
		}

		return new HttpResponseDto().success<null>(result);
	}
}
