describe('JWT configuration validation', () => {
	const originalAccessExpiry = process.env.EXPIRES_IN_ACCESS_TOKEN;
	afterEach(() => {
		if (originalAccessExpiry === undefined)
			delete process.env.EXPIRES_IN_ACCESS_TOKEN;
		else process.env.EXPIRES_IN_ACCESS_TOKEN = originalAccessExpiry;
	});

	it.each(['not-a-duration', '0', '-1h'])(
		'rejects invalid expiry %s at configuration time',
		(value) => {
			process.env.EXPIRES_IN_ACCESS_TOKEN = value;
			jest.isolateModules(() => {
				expect(() => require('@/configs/jwt.config')).toThrow(
					'JWT expiry must be a positive duration',
				);
			});
		},
	);

	it('accepts supported positive expiration units', () => {
		process.env.EXPIRES_IN_ACCESS_TOKEN = '15m';
		jest.isolateModules(() => {
			expect(require('@/configs/jwt.config').jwtConfig.expiresInAccessToken).toBe(
				'15m',
			);
		});
	});
});
