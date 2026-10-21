import { EventEmitter } from 'node:events';
import type { Server as HttpServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer } from 'ws';
import { AuthService } from '@/modules/auth/auth.service';
import { getTokenExpiry } from '@/common/utils/jwt.utils';
import { BoardRealtimeRepository } from '@/socket/board-realtime.repository';
import {
	closeWebSocketServer,
	createWebSocketServer,
	getWebSocketServer,
	sendToUser,
} from '@/socket/socket.server';

jest.mock('ws', () => ({ WebSocket: { OPEN: 1 }, WebSocketServer: jest.fn() }));
jest.mock('@/modules/auth/auth.service', () => ({ AuthService: jest.fn() }));
jest.mock('@/common/utils/jwt.utils', () => ({ getTokenExpiry: jest.fn() }));

class FakeSocket extends EventEmitter {
	readyState = 1;
	bufferedAmount = 0;
	userId?: string;
	send = jest.fn();
	close = jest.fn(() => {
		this.readyState = 3;
		this.emit('close');
	});
	terminate = jest.fn(() => {
		this.readyState = 3;
		this.emit('close');
	});
}

describe('socket lifecycle and notification delivery', () => {
	let server: EventEmitter & { clients: Set<FakeSocket>; close: jest.Mock };
	let authenticate: jest.Mock;

	beforeEach(() => {
		jest.mocked(getTokenExpiry).mockImplementation(
			() => new Date(Date.now() + 900000),
		);
		server = Object.assign(new EventEmitter(), {
			clients: new Set<FakeSocket>(),
			close: jest.fn((done: () => void) => done()),
		});
		jest.mocked(WebSocketServer).mockImplementation(
			() => server as unknown as WebSocketServer,
		);
		authenticate = jest.fn().mockResolvedValue({ id: 'user' });
		jest.mocked(AuthService).mockImplementation(
			() => ({ authenticateAccessToken: authenticate }) as unknown as AuthService,
		);
	});

	afterEach(async () => {
		await closeWebSocketServer();
		jest.useRealTimers();
	});

	async function connect(
		socket: FakeSocket,
		request: Partial<IncomingMessage> = {
			url: '/ws?token=legacy-token',
			headers: {},
		},
	) {
		server.clients.add(socket);
		const listener = server.listeners('connection')[0] as (
			socket: FakeSocket,
			request: Partial<IncomingMessage>,
		) => Promise<void>;
		await listener(socket, request);
		socket.send.mockClear();
	}

	it('starts once, authenticates with the cookie, and clears connections on stop', async () => {
		expect(() => getWebSocketServer()).toThrow('not been initialized');
		createWebSocketServer({} as HttpServer);
		expect(() => createWebSocketServer({} as HttpServer)).toThrow('already running');
		const socket = new FakeSocket();
		await connect(socket, {
			url: '/ws?token=query-token',
			headers: { cookie: 'accessToken=cookie-token' },
		});
		expect(authenticate).toHaveBeenCalledWith('cookie-token');
		sendToUser('user', { event: 'notification:new', data: { id: 'notification' } });
		expect(socket.send).toHaveBeenCalledWith(
			JSON.stringify({ event: 'notification:new', data: { id: 'notification' } }),
			expect.any(Function),
		);
		await closeWebSocketServer();
		expect(socket.terminate).toHaveBeenCalledTimes(1);
		expect(server.close).toHaveBeenCalledTimes(1);
		socket.send.mockClear();
		sendToUser('user', { event: 'notification:new', data: null });
		expect(socket.send).not.toHaveBeenCalled();
		expect(() => getWebSocketServer()).toThrow('not been initialized');
	});

	it('rejects invalid credentials without registering a connection', async () => {
		createWebSocketServer({} as HttpServer);
		authenticate.mockRejectedValueOnce(new Error('invalid token'));
		const socket = new FakeSocket();
		await connect(socket);
		expect(socket.close).toHaveBeenCalledWith(1008, 'Unauthorized');
		sendToUser('user', { event: 'notification:new', data: null });
		expect(socket.send).not.toHaveBeenCalled();
	});

	it.each(['throw', 'callback'])(
		'continues delivering to other connections after a send %s error',
		async (failure) => {
			createWebSocketServer({} as HttpServer);
			const failing = new FakeSocket();
			const healthy = new FakeSocket();
			await connect(failing);
			await connect(healthy);
			failing.send.mockImplementationOnce(
				(_payload: string, done: (error: Error) => void) => {
					if (failure === 'throw') throw new Error('closed');
					done(new Error('closed'));
				},
			);
			expect(() =>
				sendToUser('user', { event: 'notification:new', data: null }),
			).not.toThrow();
			expect(failing.terminate).toHaveBeenCalledTimes(1);
			expect(healthy.send).toHaveBeenCalledTimes(1);
			failing.send.mockClear();
			sendToUser('user', { event: 'notification:new', data: null });
			expect(failing.send).not.toHaveBeenCalled();
		},
	);

	it('does not send to a closed connection or another user', async () => {
		createWebSocketServer({} as HttpServer);
		const socket = new FakeSocket();
		await connect(socket);
		sendToUser('other-user', { event: 'notification:new', data: null });
		socket.emit('close');
		sendToUser('user', { event: 'notification:new', data: null });
		expect(socket.send).not.toHaveBeenCalled();
	});

	const boardId = '0a5fb79a-8eb3-4f1b-8615-85fdb47b3878';
	async function message(socket: FakeSocket, value: unknown) {
		socket.emit('message', typeof value === 'string' ? value : JSON.stringify(value));
		for (let count = 0; count < 10; count++) await Promise.resolve();
	}
	function boardServer() {
		jest.useFakeTimers();
		const snapshot = jest.fn().mockResolvedValue('1');
		createWebSocketServer(
			{} as HttpServer,
			{ snapshot } as unknown as BoardRealtimeRepository,
		);
		return snapshot;
	}
	function events(socket: FakeSocket) {
		return socket.send.mock.calls.map((call: unknown[]) =>
			JSON.parse(call[0] as string),
		);
	}
	it('subscribes with current permission, sends committed revision only and resyncs on reconnect', async () => {
		const snapshot = boardServer();
		const socket = new FakeSocket();
		await connect(socket);
		await message(socket, { event: 'board:subscribe', data: { boardId } });
		expect(snapshot).toHaveBeenCalledWith('user', boardId);
		expect(events(socket)).toEqual([
			{
				event: 'board:subscribed',
				data: { boardId, revision: '1', resyncRequired: true },
			},
		]);
		socket.send.mockClear();
		await jest.advanceTimersByTimeAsync(1000);
		expect(socket.send).not.toHaveBeenCalled();
		snapshot.mockResolvedValue('4');
		await jest.advanceTimersByTimeAsync(1000);
		expect(events(socket)).toEqual([
			{ event: 'board:changed', data: { boardId, revision: '4' } },
		]);
		socket.emit('close');
		const reconnect = new FakeSocket();
		await connect(reconnect);
		await message(reconnect, { event: 'board:subscribe', data: { boardId } });
		expect(events(reconnect)[0]).toEqual({
			event: 'board:subscribed',
			data: { boardId, revision: '4', resyncRequired: true },
		});
	});
	it('denies outsiders and never broadcasts private notification data to board subscribers', async () => {
		const snapshot = boardServer();
		const privateSocket = new FakeSocket();
		await connect(privateSocket);
		authenticate.mockResolvedValueOnce({ id: 'other-user' });
		const other = new FakeSocket();
		await connect(other);
		await message(other, { event: 'board:subscribe', data: { boardId } });
		snapshot.mockResolvedValue(null);
		await message(privateSocket, { event: 'board:subscribe', data: { boardId } });
		expect(events(privateSocket)[0]).toEqual({
			event: 'board:unsubscribed',
			data: { boardId, reason: 'forbidden' },
		});
		other.send.mockClear();
		privateSocket.send.mockClear();
		sendToUser('user', {
			event: 'notification:new',
			data: { token: 'private-invitation' },
		});
		expect(events(privateSocket)[0].data.token).toBe('private-invitation');
		expect(other.send).not.toHaveBeenCalled();
	});
	it('revokes a subscription before delivering a changed revision when access is removed', async () => {
		const snapshot = boardServer();
		const socket = new FakeSocket();
		await connect(socket);
		await message(socket, { event: 'board:subscribe', data: { boardId } });
		socket.send.mockClear();
		snapshot.mockResolvedValue(null);
		await jest.advanceTimersByTimeAsync(1000);
		expect(events(socket)).toEqual([
			{ event: 'board:unsubscribed', data: { boardId, reason: 'forbidden' } },
		]);
		snapshot.mockClear();
		await jest.advanceTimersByTimeAsync(1000);
		expect(snapshot).not.toHaveBeenCalled();
	});
	it('unsubscribes explicitly and validates untrusted messages before querying permission', async () => {
		const snapshot = boardServer();
		const socket = new FakeSocket();
		await connect(socket);
		await message(socket, 'not JSON');
		await message(socket, { event: 'board:subscribe', data: { boardId: 'invalid' } });
		await message(socket, {
			event: 'board:subscribe',
			data: { boardId, token: 'secret' },
		});
		expect(snapshot).not.toHaveBeenCalled();
		await message(socket, { event: 'board:subscribe', data: { boardId } });
		await message(socket, { event: 'board:unsubscribe', data: { boardId } });
		snapshot.mockClear();
		await jest.advanceTimersByTimeAsync(1000);
		expect(snapshot).not.toHaveBeenCalled();
	});
	it('closes at JWT expiry and stops both notification and board delivery', async () => {
		const snapshot = boardServer();
		jest.mocked(getTokenExpiry).mockImplementation(() => new Date(Date.now() + 1500));
		const socket = new FakeSocket();
		await connect(socket);
		await message(socket, { event: 'board:subscribe', data: { boardId } });
		await jest.advanceTimersByTimeAsync(1500);
		expect(socket.close).toHaveBeenCalledWith(1008, 'Access token expired');
		socket.send.mockClear();
		snapshot.mockClear();
		sendToUser('user', { event: 'notification:new', data: {} });
		await jest.advanceTimersByTimeAsync(1000);
		expect(snapshot).not.toHaveBeenCalled();
		expect(socket.send).not.toHaveBeenCalled();
	});
	it('rechecks account authentication and rejects a locked/deleted user', async () => {
		const snapshot = boardServer();
		const socket = new FakeSocket();
		await connect(socket);
		await message(socket, { event: 'board:subscribe', data: { boardId } });
		authenticate.mockRejectedValueOnce(new Error('locked'));
		snapshot.mockClear();
		await jest.advanceTimersByTimeAsync(1000);
		expect(socket.close).toHaveBeenCalledWith(1008, 'Unauthorized');
		expect(snapshot).not.toHaveBeenCalled();
	});
	it('rejects a newly locked account before creating a subscription', async () => {
		const snapshot = boardServer();
		const socket = new FakeSocket();
		await connect(socket);
		authenticate.mockRejectedValueOnce(new Error('locked'));
		await message(socket, { event: 'board:subscribe', data: { boardId } });
		expect(socket.close).toHaveBeenCalledWith(1008, 'Unauthorized');
		expect(snapshot).not.toHaveBeenCalled();
	});
	it('does not manufacture changed events on DB failure and retries later', async () => {
		const snapshot = boardServer();
		jest.spyOn(console, 'warn').mockImplementation(() => {});
		const socket = new FakeSocket();
		await connect(socket);
		await message(socket, { event: 'board:subscribe', data: { boardId } });
		socket.send.mockClear();
		snapshot.mockRejectedValueOnce(new Error('DB offline'));
		await jest.advanceTimersByTimeAsync(1000);
		expect(socket.send).not.toHaveBeenCalled();
		snapshot.mockResolvedValue('2');
		await jest.advanceTimersByTimeAsync(1000);
		expect(events(socket)).toEqual([
			{ event: 'board:changed', data: { boardId, revision: '2' } },
		]);
	});
	it('rejects cross-origin cookie connections before authenticating', async () => {
		createWebSocketServer({} as HttpServer);
		const socket = new FakeSocket();
		await connect(socket, {
			url: '/ws',
			headers: {
				origin: 'https://untrusted.example',
				cookie: 'accessToken=cookie-token',
			},
		});
		expect(socket.close).toHaveBeenCalledWith(1008, 'Origin not allowed');
		expect(authenticate).not.toHaveBeenCalled();
	});

	it('bounds subscriptions and pending messages', async () => {
		const snapshot = boardServer();
		const socket = new FakeSocket();
		await connect(socket);
		for (let index = 0; index < 21; index++) {
			await message(socket, {
				event: 'board:subscribe',
				data: {
					boardId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
				},
			});
		}
		expect(snapshot).toHaveBeenCalledTimes(20);
		expect(events(socket)[20]).toEqual({
			event: 'error',
			data: { message: 'Board subscription limit reached' },
		});
		for (let index = 0; index < 21; index++)
			socket.emit(
				'message',
				JSON.stringify({ event: 'board:subscribe', data: { boardId } }),
			);
		expect(socket.close).toHaveBeenCalledWith(1008, 'Too many messages');
	});
	it('disconnects a slow consumer without affecting other recipients', async () => {
		createWebSocketServer({} as HttpServer);
		const slow = new FakeSocket();
		const healthy = new FakeSocket();
		await connect(slow);
		await connect(healthy);
		slow.bufferedAmount = 1024 * 1024 + 1;
		sendToUser('user', { event: 'notification:new', data: {} });
		expect(slow.terminate).toHaveBeenCalledTimes(1);
		expect(healthy.send).toHaveBeenCalledTimes(1);
	});
});
