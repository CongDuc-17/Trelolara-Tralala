import { EventEmitter } from 'node:events';
import type { Server as HttpServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer } from 'ws';
import { AuthService } from '@/modules/auth/auth.service';
import {
	closeWebSocketServer,
	createWebSocketServer,
	getWebSocketServer,
	sendToUser,
} from '@/socket/socket.server';

jest.mock('ws', () => ({ WebSocket: { OPEN: 1 }, WebSocketServer: jest.fn() }));
jest.mock('@/modules/auth/auth.service', () => ({ AuthService: jest.fn() }));

class FakeSocket extends EventEmitter {
	readyState = 1;
	userId?: string;
	send = jest.fn();
	close = jest.fn(() => this.emit('close'));
	terminate = jest.fn(() => this.emit('close'));
}

describe('socket lifecycle and notification delivery', () => {
	let server: EventEmitter & { clients: Set<FakeSocket>; close: jest.Mock };
	let authenticate: jest.Mock;

	beforeEach(() => {
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
});
