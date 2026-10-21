import { invitationFixture } from './invitations.fixture';

describe.each(['project', 'board'] as const)('%s invitations', (scope) => {
	it('creates EMAIL/PENDING without membership and delivers private token metadata only after commit', async () => {
		const f = invitationFixture(scope);
		f.socket.emitNewNotification.mockImplementation((...args: unknown[]) => {
			expect(f.events).toContain('commit');
			expect(f.state().members).toEqual([]);
			expect(args[0]).toBe('recipient');
		});
		const row = await f.invite();
		expect(row).toMatchObject({
			type: 'EMAIL',
			status: 'PENDING',
			roleId: f.roleId,
			inviterId: 'actor',
			delivery: { email: 'SENT', notification: 'SENT' },
		});
		expect(row.token).toMatch(/^[a-f0-9]{64}$/);
		expect(f.state().members).toEqual([]);
		expect(f.state().notifications[0].metadata).toMatchObject({
			invitationId: row.id,
			token: row.token,
			type: 'EMAIL',
			expiresAt: row.expiresAt.toISOString(),
		});
		expect(f.mails.sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				recipients: ['recipient@example.com'],
				text: expect.stringContaining(row.token),
			}),
		);
		expect(f.events.indexOf('commit')).toBeLessThan(f.events.indexOf('email'));
	});
	it('leaves a new account outside membership until a verified explicit accept', async () => {
		const f = invitationFixture(scope, false);
		const row = await f.invite();
		expect(row.delivery.notification).toBe('NOT_APPLICABLE');
		expect(f.state().notifications).toEqual([]);
		f.users.push({
			id: 'recipient',
			name: 'New user',
			email: 'recipient@example.com',
			verify: false,
			status: 'ACTIVE',
			deletedAt: null,
		});
		await expect(
			f.service.acceptInvitation(row.token, 'recipient'),
		).rejects.toMatchObject({ status: 403 });
		f.users.find((user) => user.id === 'recipient')!.verify = true;
		expect(f.state().members).toEqual([]);
		await expect(f.service.acceptInvitation(row.token, 'recipient')).resolves.toBe(
			'Invitation accepted successfully',
		);
		expect(f.state().members).toMatchObject([
			{ userId: 'recipient', accepted: true },
		]);
		expect(f.state().invitations[0]).toMatchObject({
			status: 'ACCEPTED',
			acceptedAt: expect.any(Date),
		});
	});
	it('retries the same pending invitation without changing token/expiry or duplicating notification', async () => {
		const f = invitationFixture(scope);
		const first = await f.invite();
		const second = await f.invite('RECIPIENT@EXAMPLE.COM');
		expect(second.id).toBe(first.id);
		expect(second.token).toBe(first.token);
		expect(second.expiresAt).toEqual(first.expiresAt);
		expect(f.state().invitations).toHaveLength(1);
		expect(f.state().notifications).toHaveLength(1);
		expect(f.mails.sendEmail).toHaveBeenCalledTimes(2);
		await expect(
			f.invite('recipient@example.com', scope.toUpperCase() + '_VIEWER'),
		).rejects.toMatchObject({ status: 409 });
	});
	it('serializes concurrent invites and concurrent accept so only one membership is created', async () => {
		const f = invitationFixture(scope);
		const rows = await Promise.all([f.invite(), f.invite()]);
		expect(new Set(rows.map((row) => row.id)).size).toBe(1);
		expect(f.state().notifications).toHaveLength(1);
		const accepts = await Promise.allSettled([
			f.service.acceptInvitation(rows[0].token, 'recipient'),
			f.service.acceptInvitation(rows[0].token, 'recipient'),
		]);
		expect(accepts.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
		expect(f.state().members).toHaveLength(1);
	});
	it.each([
		'wrong-email',
		'unverified',
		'locked',
		'deleted',
		'missing-user',
		'expired',
		'cancelled',
		'accepted',
		'revoked-inviter',
		'inactive-role',
		'deleted-role',
	])('rejects acceptance: %s', async (reason) => {
		const f = invitationFixture(scope);
		const row = await f.invite();
		const recipient = f.users.find((user) => user.id === 'recipient')!;
		if (reason === 'wrong-email') recipient.email = 'another@example.com';
		if (reason === 'unverified') recipient.verify = false;
		if (reason === 'locked') recipient.status = 'LOCKED';
		if (reason === 'deleted') recipient.deletedAt = new Date();
		if (reason === 'missing-user') f.users.splice(f.users.indexOf(recipient), 1);
		if (reason === 'expired') f.state().invitations[0].expiresAt = new Date();
		if (reason === 'cancelled') f.state().invitations[0].status = 'CANCELLED';
		if (reason === 'accepted') f.state().invitations[0].status = 'ACCEPTED';
		if (reason === 'revoked-inviter') f.allowed.delete('actor');
		if (reason === 'inactive-role')
			f.roles.find((role) => role.id === f.roleId)!.status = 'INACTIVE';
		if (reason === 'deleted-role')
			f.roles.find((role) => role.id === f.roleId)!.deletedAt = new Date();
		await expect(
			f.service.acceptInvitation(row.token, 'recipient'),
		).rejects.toHaveProperty('status');
		expect(f.state().members).toEqual([]);
	});
	it('checks target lifecycle and exactly one target before accepting', async () => {
		const f = invitationFixture(scope);
		const row = await f.invite();
		if (scope === 'board') f.board.status = 'ARCHIVED';
		else f.project.status = 'ARCHIVED';
		await expect(
			f.service.acceptInvitation(row.token, 'recipient'),
		).rejects.toMatchObject({ status: 409 });
		f.board.status = 'ACTIVE';
		f.project.status = 'ARCHIVED';
		await expect(
			f.service.acceptInvitation(row.token, 'recipient'),
		).rejects.toMatchObject({ status: 409 });
		f.project.status = 'ACTIVE';
		f.state().invitations[0].projectId = 'project';
		f.state().invitations[0].boardId = 'board';
		await expect(
			f.service.acceptInvitation(row.token, 'recipient'),
		).rejects.toMatchObject({ status: 422 });
	});
	it('reuses LINK for different verified users and never overwrites an existing membership role', async () => {
		const f = invitationFixture(scope);
		const row = await f.link();
		expect(row).toMatchObject({
			type: 'LINK',
			status: 'PENDING',
			shareUrl: expect.stringContaining('/trello/invite/' + scope + 's/'),
		});
		await f.service.acceptInvitation(row.token, 'recipient');
		await f.service.acceptInvitation(row.token, 'second');
		expect(f.state().members.map((member) => member.userId)).toEqual([
			'recipient',
			'second',
		]);
		expect(f.state().invitations[0].status).toBe('PENDING');
		f.state().members[0].roleId = 'CUSTOM_ROLE';
		await expect(
			f.service.acceptInvitation(row.token, 'recipient'),
		).rejects.toMatchObject({ status: 409 });
		expect(f.state().members[0].roleId).toBe('CUSTOM_ROLE');
	});
	it('keeps legacy ACCEPTED links reusable and legacy accepted:false memberships intact', async () => {
		const f = invitationFixture(scope);
		const row = await f.link();
		f.state().invitations[0].status = 'ACCEPTED';
		await f.service.acceptInvitation(row.token, 'recipient');
		f.state().members[0].accepted = false;
		await expect(
			f.service.acceptInvitation(row.token, 'recipient'),
		).rejects.toMatchObject({ status: 409 });
		expect(f.state().members[0].accepted).toBe(false);
		await f.service.acceptInvitation(row.token, 'second');
		expect(f.state().invitations[0].status).toBe('ACCEPTED');
	});
	it('preserves legacy accepted EMAIL rows without membership and requires a new invitation', async () => {
		const f = invitationFixture(scope);
		const row = await f.invite();
		f.state().invitations[0].status = 'ACCEPTED';
		await expect(
			f.service.acceptInvitation(row.token, 'recipient'),
		).rejects.toMatchObject({ status: 409 });
		const fresh = await f.invite();
		expect(fresh.id).not.toBe(row.id);
		expect(f.state().invitations[0].status).toBe('ACCEPTED');
	});
	it('lets the EMAIL recipient reject, and permits inviter/admin cancellation without removing members', async () => {
		const f = invitationFixture(scope);
		let row = await f.invite();
		await expect(
			f.service.rejectInvitation(row.token, 'second'),
		).rejects.toMatchObject({ status: 403 });
		await f.service.rejectInvitation(row.token, 'recipient');
		expect(f.state().invitations[0].status).toBe('CANCELLED');
		row = await f.invite();
		await f.service.acceptInvitation(row.token, 'recipient');
		await f.service.rejectInvitation(row.token, 'admin');
		expect(f.state().members).toHaveLength(1);
		expect(f.state().invitations.find((item) => item.id === row.id)?.status).toBe(
			'CANCELLED',
		);
	});
	it('prevents a LINK recipient from cancelling the shared link and lets the inviter cancel after losing invite rights', async () => {
		const f = invitationFixture(scope);
		const row = await f.link();
		await expect(
			f.service.rejectInvitation(row.token, 'recipient'),
		).rejects.toMatchObject({ status: 403 });
		f.allowed.delete('actor');
		await f.service.rejectInvitation(row.token, 'actor');
		await expect(
			f.service.acceptInvitation(row.token, 'recipient'),
		).rejects.toMatchObject({ status: 409 });
	});
	it('rejects wrong-scope roles and limits a non-admin to MEMBER/VIEWER grants', async () => {
		const f = invitationFixture(scope);
		const adminRole = scope.toUpperCase() + '_ADMIN';
		await expect(
			f.invite(
				'recipient@example.com',
				scope === 'board' ? 'PROJECT_MEMBER' : 'BOARD_MEMBER',
			),
		).rejects.toMatchObject({ status: 422 });
		await expect(f.invite('recipient@example.com', adminRole)).rejects.toMatchObject({
			status: 403,
		});
		f.admins.add('actor');
		const row = await f.invite('recipient@example.com', adminRole);
		f.admins.delete('actor');
		await expect(
			f.service.acceptInvitation(row.token, 'recipient'),
		).rejects.toMatchObject({ status: 403 });
		expect(f.state().members).toEqual([]);
	});
	it.each(['notification', 'commit'] as const)(
		'rolls back invite and suppresses external delivery when %s fails',
		async (failure) => {
			const f = invitationFixture(scope);
			f.failures[failure] = true;
			await expect(f.invite()).rejects.toThrow();
			expect(f.state().invitations).toEqual([]);
			expect(f.state().notifications).toEqual([]);
			expect(f.socket.emitNewNotification).not.toHaveBeenCalled();
			expect(f.mails.sendEmail).not.toHaveBeenCalled();
		},
	);
	it('rolls back membership if the accept status write fails', async () => {
		const f = invitationFixture(scope);
		const row = await f.invite();
		f.failures.status = true;
		await expect(f.service.acceptInvitation(row.token, 'recipient')).rejects.toThrow(
			'Status write failed',
		);
		expect(f.state().members).toEqual([]);
		expect(f.state().invitations[0].status).toBe('PENDING');
	});
	it('keeps pending on email/socket failure, reports delivery and supports retry', async () => {
		const f = invitationFixture(scope);
		jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		f.mails.sendEmail.mockRejectedValueOnce(new Error('SMTP unavailable'));
		f.socket.emitNewNotification.mockImplementationOnce(() => {
			throw new Error('socket unavailable');
		});
		const failed = await f.invite();
		expect(failed.delivery).toEqual({ email: 'FAILED', notification: 'FAILED' });
		expect(f.state().invitations[0].status).toBe('PENDING');
		const retried = await f.invite();
		expect(retried.delivery).toEqual({ email: 'SENT', notification: 'SENT' });
		expect(retried.token).toBe(failed.token);
		expect(f.state().notifications).toHaveLength(1);
	});
});
