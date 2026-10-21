import type { Request, Response } from 'express';

import { PaginationUtils } from '@/common/utils/pagination.utils';
import type { UserInformationDto } from '@/modules/users/dtos';

import { NotificationResponseDto, UnreadCountResponseDto } from './dtos';
import { NotificationsService } from './notifications.service';
import type { ListNotificationsInput } from './notifications.types';

export class NotificationsController {
	constructor(private readonly notificationsService = new NotificationsService()) {}

	async getMyNotifications(req: Request, res: Response): Promise<Response> {
		const actor = req.user as UserInformationDto;
		const query = res.locals.validated.query as ListNotificationsInput;
		const { items, total } = await this.notificationsService.getMyNotifications(
			actor.id,
			query,
		);
		const pagination = new PaginationUtils().extractSkipTakeFromPagination(query);
		return res.status(200).json({
			success: true,
			data: items.map((item) => new NotificationResponseDto(item)),
			pagination: pagination.convertPaginationResponseDtoFromTotalRecords(total),
		});
	}

	async getMyUnreadCount(req: Request, res: Response): Promise<Response> {
		const actor = req.user as UserInformationDto;
		const count = await this.notificationsService.getMyUnreadCount(actor.id);
		return res
			.status(200)
			.json({ success: true, data: new UnreadCountResponseDto(count) });
	}

	async markAsRead(req: Request, res: Response): Promise<Response> {
		const actor = req.user as UserInformationDto;
		const { notificationId } = res.locals.validated.params as {
			notificationId: string;
		};
		await this.notificationsService.markAsRead(notificationId, actor.id);
		return res.status(200).json({ success: true, data: null });
	}

	async markAllAsRead(req: Request, res: Response): Promise<Response> {
		const actor = req.user as UserInformationDto;
		await this.notificationsService.markAllAsRead(actor.id);
		return res.status(200).json({ success: true, data: null });
	}
}
