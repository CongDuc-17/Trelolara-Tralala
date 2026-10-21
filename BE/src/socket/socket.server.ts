import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { AuthService } from '@/modules/auth/auth.service';
import { readCookie } from '@/modules/auth/auth.cookies';
import { getTokenExpiry } from '@/common/utils/jwt.utils';
import { z } from 'zod';
import { BoardRealtimeRepository } from './board-realtime.repository';
import { appEnv } from '@/configs/app.config';

type SocketEvent = { event: string; data: unknown };
type AuthenticatedSocket = WebSocket & {
	userId?: string;
	token?: string;
	expiresAt?: number;
	expiryTimer?: ReturnType<typeof setTimeout>;
	boards?: Map<string, { revision: string }>;
};
const userConnections = new Map<string, Set<AuthenticatedSocket>>();
let socketServer: WebSocketServer | undefined;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let polling: Promise<void> | undefined;
const subscriptionMessage = z.discriminatedUnion('event', [
	z.strictObject({
		event: z.literal('board:subscribe'),
		data: z.strictObject({ boardId: z.uuid() }),
	}),
	z.strictObject({
		event: z.literal('board:unsubscribe'),
		data: z.strictObject({ boardId: z.uuid() }),
	}),
]);

function removeConnection(socket: AuthenticatedSocket): void {
	clearTimeout(socket.expiryTimer);
	socket.boards?.clear();
	if (!socket.userId) return;
	const sockets = userConnections.get(socket.userId);
	sockets?.delete(socket);
	if (!sockets?.size) userConnections.delete(socket.userId);
}

function isOpen(socket: AuthenticatedSocket): boolean {
	if (socket.expiresAt !== undefined && socket.expiresAt <= Date.now()) {
		removeConnection(socket);
		socket.close(1008, 'Access token expired');
		return false;
	}
	return socket.readyState === WebSocket.OPEN;
}

function send(socket: AuthenticatedSocket, payload: SocketEvent): void {
	if (!isOpen(socket)) return;
	const disconnect = () => {
		removeConnection(socket);
		socket.terminate();
	};
	if (socket.bufferedAmount > 1024 * 1024) return disconnect();
	try {
		socket.send(JSON.stringify(payload), (error) => {
			if (error) disconnect();
		});
	} catch {
		disconnect();
	}
}

function expireConnection(socket: AuthenticatedSocket): void {
	if (!isOpen(socket)) return;
	socket.expiryTimer = setTimeout(
		() => expireConnection(socket),
		Math.min(socket.expiresAt! - Date.now(), 2147483647),
	);
	socket.expiryTimer.unref();
}

export function createWebSocketServer(
	server: HttpServer,
	boards = new BoardRealtimeRepository(),
): WebSocketServer {
	if (socketServer) throw new Error('WebSocket server is already running');
	const auth = new AuthService();
	socketServer = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
	const currentServer = socketServer;
	// shortcut: polling and connections serve one instance; use a shared transport when deploying multiple instances.
	const poll = async () => {
		for (const sockets of userConnections.values())
			for (const socket of sockets) {
				if (!isOpen(socket) || !socket.boards?.size) continue;
				try {
					await auth.authenticateAccessToken(socket.token!);
				} catch {
					removeConnection(socket);
					socket.close(1008, 'Unauthorized');
					continue;
				}
				for (const [boardId, subscription] of socket.boards) {
					try {
						const revision = await boards.snapshot(socket.userId!, boardId);
						if (
							socket.boards.get(boardId) !== subscription ||
							!isOpen(socket)
						)
							continue;
						if (revision === null) {
							socket.boards.delete(boardId);
							send(socket, {
								event: 'board:unsubscribed',
								data: { boardId, reason: 'forbidden' },
							});
						} else if (revision !== subscription.revision) {
							subscription.revision = revision;
							send(socket, {
								event: 'board:changed',
								data: { boardId, revision },
							});
						}
					} catch {
						console.warn('Board synchronization check failed');
					}
				}
			}
	};
	const tick = () => {
		polling = poll().finally(() => {
			polling = undefined;
			if (socketServer === currentServer) {
				pollTimer = setTimeout(tick, 1000);
				pollTimer.unref();
			}
		});
	};
	pollTimer = setTimeout(tick, 1000);
	pollTimer.unref();
	socketServer.on('connection', async (socket: AuthenticatedSocket, request) => {
		const remove = () => removeConnection(socket);
		socket.on('close', remove);
		socket.on('error', remove);
		try {
			const origins = Array.isArray(appEnv.CORS_ORIGIN)
				? appEnv.CORS_ORIGIN
				: [appEnv.CORS_ORIGIN];
			if (request.headers.origin && !origins.includes(request.headers.origin))
				return socket.close(1008, 'Origin not allowed');
			const url = new URL(request.url ?? '/', 'http://localhost');
			const token =
				readCookie(request, 'accessToken') ??
				url.searchParams.get('accessToken') ??
				url.searchParams.get('token');
			if (!token) return socket.close(1008, 'Unauthorized');
			const user = await auth.authenticateAccessToken(token);
			socket.expiresAt = getTokenExpiry(token).getTime();
			if (socket.readyState !== WebSocket.OPEN) return;
			socket.userId = user.id;
			socket.token = token;
			socket.boards = new Map();
			if (!isOpen(socket)) return;
			expireConnection(socket);
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
			let queued = Promise.resolve();
			let pending = 0;
			socket.on('message', (raw) => {
				if (!isOpen(socket)) return;
				if (++pending > 20) {
					removeConnection(socket);
					socket.close(1008, 'Too many messages');
					return;
				}
				queued = queued
					.then(async () => {
						if (!isOpen(socket)) return;
						let value: unknown;
						try {
							value = JSON.parse(raw.toString());
						} catch {
							send(socket, {
								event: 'error',
								data: { message: 'Invalid JSON message' },
							});
							return;
						}
						const parsed = subscriptionMessage.safeParse(value);
						if (!parsed.success) {
							send(socket, {
								event: 'error',
								data: { message: 'Invalid board subscription message' },
							});
							return;
						}
						const {
							event,
							data: { boardId },
						} = parsed.data;
						if (event === 'board:unsubscribe') {
							socket.boards!.delete(boardId);
							send(socket, {
								event: 'board:unsubscribed',
								data: { boardId },
							});
							return;
						}
						if (!socket.boards!.has(boardId) && socket.boards!.size >= 20) {
							send(socket, {
								event: 'error',
								data: { message: 'Board subscription limit reached' },
							});
							return;
						}
						try {
							await auth.authenticateAccessToken(token);
						} catch {
							removeConnection(socket);
							socket.close(1008, 'Unauthorized');
							return;
						}
						const revision = await boards.snapshot(user.id, boardId);
						if (!isOpen(socket)) return;
						if (revision === null) {
							socket.boards!.delete(boardId);
							send(socket, {
								event: 'board:unsubscribed',
								data: { boardId, reason: 'forbidden' },
							});
							return;
						}
						socket.boards!.set(boardId, { revision });
						send(socket, {
							event: 'board:subscribed',
							data: { boardId, revision, resyncRequired: true },
						});
					})
					.catch(() => {
						send(socket, {
							event: 'error',
							data: { message: 'Subscription check failed' },
						});
					})
					.finally(() => {
						pending--;
					});
			});
		} catch {
			socket.close(1008, 'Unauthorized');
		}
	});
	return socketServer;
}

export function sendToUser(userId: string, payload: SocketEvent): void {
	for (const socket of userConnections.get(userId) ?? []) {
		send(socket, payload);
	}
}

export function getWebSocketServer(): WebSocketServer {
	if (!socketServer) throw new Error('WebSocket server has not been initialized');
	return socketServer;
}

export async function closeWebSocketServer(): Promise<void> {
	const server = socketServer;
	socketServer = undefined;
	clearTimeout(pollTimer);
	for (const sockets of userConnections.values())
		for (const socket of sockets) clearTimeout(socket.expiryTimer);
	userConnections.clear();
	if (!server) return;
	for (const socket of server.clients) socket.terminate();
	await polling;
	await new Promise<void>((resolve) => server.close(() => resolve()));
}
