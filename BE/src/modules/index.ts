import { labels } from './../models/modelSchema/labelsSchema';
import { authRegistry, authRouter } from './auth/auth.router';
import { healthCheckRegistry, healthCheckRouter } from './healthCheck/healthCheck.router';
import { projectsRegistry, projectsRouter } from './projects/project.router';
import { usersRegistry, usersRouter } from './users/users.router';
import { boardsRegistry, boardsRouter } from './boards/boards.router';
import { listsRegistry, listsRouter } from './lists/list.router';
import { cardsRegistry, cardsRouter } from './cards/card.router';
import { invitationsRegistry, invitationsRouter } from './invitations/invitation.router';
import { labelsRegistry, labelsRouter } from './labels/labels.router';

import { checklistsRegistry, checklistsRouter } from './checklists/checklists.router';

import {
	checklistItemsRegistry,
	checklistItemsRouter,
} from './checklistItems/checklistItems.router';
import { rolesRegistry, rolesRouter } from './roles/role.router';
import {
	notificationsRegistry,
	notificationsRouter,
} from './notifications/notifications.router';
import { commentsRegistry, commentsRouter } from './comments/comments.router';
export const Registries = [
	healthCheckRegistry,
	authRegistry,
	usersRegistry,
	projectsRegistry,
	boardsRegistry,
	listsRegistry,
	cardsRegistry,
	labelsRegistry,
	checklistsRegistry,
	checklistItemsRegistry,
	commentsRegistry,
	invitationsRegistry,
	notificationsRegistry,
	rolesRegistry,
];

export const Modules = {
	healthCheckRouter,
	authRouter,
	usersRouter,
	projectsRouter,
	boardsRouter,
	listsRouter,
	cardsRouter,
	labelsRouter,
	checklistsRouter,
	checklistItemsRouter,
	commentsRouter,
	invitationsRouter,
	notificationsRouter,
	rolesRouter,
};
