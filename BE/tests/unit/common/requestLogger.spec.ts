import { redactInvitationTokens } from '@/common/middlewares/requestLogger.middleware';

describe('Invitation token redaction in URL and referrer logs', () => {
	it.each([
		'/invitations/secret/accept',
		'/invitations/secret/reject?next=board',
		'https://frontend.example/trello/invite/projects/secret',
		'https://frontend.example/trello/invite/boards/secret?next=board#accept',
		'/INVITATIONS/secret/ACCEPT',
	])('redacts the token in %s', (value) => {
		const output = redactInvitationTokens(value);
		expect(output).not.toContain('secret');
		expect(output).toContain('[redacted]');
	});
	it('keeps non-token resource paths and preserves the method suffix/query', () => {
		expect(redactInvitationTokens('/invitations/projects/project-id')).toBe(
			'/invitations/projects/project-id',
		);
		expect(redactInvitationTokens('/invitations/token/accept?next=board')).toBe(
			'/invitations/[redacted]/accept?next=board',
		);
	});
	it.each([
		'/auth/google/check-login?code=private-code&state=private-state&scope=email',
		'https://api.example/auth/google/check-login?scope=email&code=private-code',
		'/callback?access_token=private-code&refresh_token=private-state&id_token=private-id',
	])('redacts OAuth secrets in URL and referrer %s', (value) => {
		const output = redactInvitationTokens(value);
		expect(output).not.toContain('private-');
		expect(output).toContain('[redacted]');
	});
});
