import 'reflect-metadata';

import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import passport from 'passport';

import { openAPIRouter } from './swagger';
import { Modules } from './modules';
import { appEnv } from './configs';
import {
	errorHandlerMiddleware,
	requestContextMiddleware,
	setCookieMiddleware,
} from './common';
import { startTokenCleanupScheduler } from './common/utils/tokenCleanup.util';
import { createServer } from 'http';
import { createWebSocketServer } from './socket/socket.server';
import { ProjectsScheduler } from './modules/projects/project.scheduler';

const app: Express = express();

app.use(express.json());
app.use(cors({ origin: appEnv.CORS_ORIGIN, credentials: true }));

// Set the application to trust the reverse proxy
app.set('trust proxy', true);

app.use(requestContextMiddleware);

app.use(setCookieMiddleware);

// Passport middleware
app.use(passport.initialize());

// Middlewares
app.use(helmet());
app.use(morgan('combined'));

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

app.use(errorHandlerMiddleware);

app.use(openAPIRouter);

const httpServer = createServer(app);

createWebSocketServer(httpServer);

startTokenCleanupScheduler(1);
// const projectsScheduler = new ProjectsScheduler();
// projectsScheduler.initCleanupJob();

httpServer.listen(appEnv.PORT, () => {
	const { NODE_ENV, HOST, PORT } = appEnv;
	console.log(`Server (${NODE_ENV}) running on port http://${HOST}:${PORT}/api`);
});
