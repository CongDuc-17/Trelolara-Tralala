import { createServer } from 'node:http';
import { createApp } from './app';
import { appEnv } from './configs/app.config';
import { prisma } from './modules/database';
import { createWebSocketServer, closeWebSocketServer } from './socket/socket.server';
import { startTokenCleanupScheduler, stopTokenCleanupScheduler } from './common/utils/tokenCleanup.util';

export function startServer() {
	const server = createServer(createApp());
	createWebSocketServer(server);
	startTokenCleanupScheduler();
	server.listen(appEnv.PORT, () => {
		console.log('Server listening on port ' + appEnv.PORT);
	});
	let stopping: Promise<void> | undefined;
	const stop = (): Promise<void> => stopping ??= (async () => {
		stopTokenCleanupScheduler();
		await closeWebSocketServer();
		await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
		await prisma.$disconnect();
	})();
	return { server, stop };
}

if (require.main === module) {
	const { stop } = startServer();
	for (const signal of ['SIGTERM', 'SIGINT'] as const) {
		process.once(signal, () => {
			void stop().catch(() => { process.exitCode = 1; });
		});
	}
}

