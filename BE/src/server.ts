import { createServer } from 'node:http';
import { createApp } from './app';
import { appEnv } from './configs/app.config';
import { prisma } from './modules/database';
import { AttachmentCleanupWorker } from './modules/attachments/attachment-cleanup.worker';
import { CardReminderWorker } from './modules/cardReminders/card-reminder.worker';
import { createWebSocketServer, closeWebSocketServer } from './socket/socket.server';
import {
	startTokenCleanupScheduler,
	stopTokenCleanupScheduler,
} from './common/utils/tokenCleanup.util';

export function startServer() {
	const server = createServer(createApp());
	createWebSocketServer(server);
	startTokenCleanupScheduler();
	const attachmentCleanup = new AttachmentCleanupWorker();
	attachmentCleanup.start();
	const cardReminders = new CardReminderWorker();
	cardReminders.start();
	server.listen(appEnv.PORT, () => {
		console.log('Server listening on port ' + appEnv.PORT);
	});
	let stopping: Promise<void> | undefined;
	const stop = (): Promise<void> =>
		(stopping ??= (async () => {
			stopTokenCleanupScheduler();
			await closeWebSocketServer();
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
			await attachmentCleanup.stop();
			await cardReminders.stop();
			await prisma.$disconnect();
		})());
	return { server, stop };
}

if (require.main === module) {
	const { stop } = startServer();
	for (const signal of ['SIGTERM', 'SIGINT'] as const) {
		process.once(signal, () => {
			void stop().catch(() => {
				process.exitCode = 1;
			});
		});
	}
}
