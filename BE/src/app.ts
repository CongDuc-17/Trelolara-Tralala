import 'reflect-metadata';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import passport from 'passport';

import { appEnv } from './configs/app.config';
import { Modules } from './modules';
import { openAPIRouter } from './swagger';
import { errorHandlerMiddleware, requestContextMiddleware, setCookieMiddleware } from './common';

export function createApp(): Express {
	const app = express();
	app.set('trust proxy', true);
	app.use(requestContextMiddleware);
	app.use(helmet());
	app.use(cors({ origin: appEnv.CORS_ORIGIN, credentials: true }));
	app.use(express.json());
	app.use(setCookieMiddleware);
	app.use(passport.initialize());
	app.use(morgan('combined', { skip: () => appEnv.NODE_ENV === 'test' }));
	app.use('/health-check', Modules.healthCheckRouter);
	app.use('/auth', Modules.authRouter);
	app.use('/users', Modules.usersRouter);
	app.use('/projects', Modules.projectsRouter);
	app.use('/boards', Modules.boardsRouter);
	app.use('/lists', Modules.listsRouter);
	app.use('/cards', Modules.cardsRouter);
	app.use('/labels', Modules.labelsRouter);
	app.use('/checklists', Modules.checklistsRouter);
	app.use('/checklist-items', Modules.checklistItemsRouter);
	app.use('/comments', Modules.commentsRouter);
	app.use('/invitations', Modules.invitationsRouter);
	app.use('/notifications', Modules.notificationsRouter);
	app.use('/roles', Modules.rolesRouter);
	app.use(openAPIRouter);
	app.use((_req, res) => { res.status(404).json({ success: false, message: 'Route not found' }); });
	app.use(errorHandlerMiddleware);
	return app;
}

