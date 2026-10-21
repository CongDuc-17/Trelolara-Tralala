import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { AuthService } from '@/modules/auth/auth.service';
import { readCookie } from '@/modules/auth/auth.cookies';

type SocketEvent = { event: string; data: unknown };
type AuthenticatedSocket = WebSocket & { userId?: string };
const userConnections = new Map<string, Set<AuthenticatedSocket>>();
let socketServer: WebSocketServer | undefined;

function removeConnection(socket: AuthenticatedSocket): void {
	if (!socket.userId) return;
	const sockets = userConnections.get(socket.userId);
	sockets?.delete(socket);
	if (!sockets?.size) userConnections.delete(socket.userId);
}

export function createWebSocketServer(server: HttpServer): WebSocketServer {
	if (socketServer) throw new Error('WebSocket server is already running');
	const auth = new AuthService();
	socketServer = new WebSocketServer({ server, path: '/ws' });
	socketServer.on('connection', async (socket: AuthenticatedSocket, request) => {
		const remove = () => removeConnection(socket);
		socket.on('close', remove);
		socket.on('error', remove);
		try {
			const url = new URL(request.url ?? '/', 'http://localhost');
			const token =
				readCookie(request, 'accessToken') ??
				url.searchParams.get('accessToken') ??
				url.searchParams.get('token');
			if (!token) return socket.close(1008, 'Unauthorized');
			const user = await auth.authenticateAccessToken(token);
			if (socket.readyState !== WebSocket.OPEN) return;
			socket.userId = user.id;
			const sockets =
				userConnections.get(user.id) ?? new Set<AuthenticatedSocket>();
			sockets.add(socket);
			userConnections.set(user.id, sockets);
			socket.send(
				JSON.stringify({
					event: 'connection:success',
					data: { userId: user.id },
				}),
			);
			socket.on('message', (message) => {
				try {
					JSON.parse(message.toString());
				} catch {
					if (socket.readyState === WebSocket.OPEN) {
						socket.send(
							JSON.stringify({
								event: 'error',
								data: { message: 'Invalid JSON message' },
							}),
						);
					}
				}
			});
		} catch {
			socket.close(1008, 'Unauthorized');
		}
	});
	return socketServer;
}

export function sendToUser(userId: string, payload: SocketEvent): void {
	const message = JSON.stringify(payload);
	for (const socket of userConnections.get(userId) ?? []) {
		if (socket.readyState !== WebSocket.OPEN) continue;
		const disconnect = () => {
			removeConnection(socket);
			socket.terminate();
		};
		try {
			socket.send(message, (error) => {
				if (error) disconnect();
			});
		} catch {
			disconnect();
		}
	}
}

export function getWebSocketServer(): WebSocketServer {
	if (!socketServer) throw new Error('WebSocket server has not been initialized');
	return socketServer;
}

export async function closeWebSocketServer(): Promise<void> {
	const server = socketServer;
	socketServer = undefined;
	userConnections.clear();
	if (!server) return;
	for (const socket of server.clients) socket.terminate();
	await new Promise<void>((resolve) => server.close(() => resolve()));
}
