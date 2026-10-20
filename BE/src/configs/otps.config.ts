export const otpsConfig = {
	get otpExpiresIn(): number {
		const raw = String(process.env.OTP_EXPIRES_IN ?? 5).trim();
		const normalized = raw.endsWith('m') ? raw.slice(0, -1) : raw;
		const value = Number(normalized);
		if (!Number.isInteger(value) || value <= 0) {
			throw new Error('OTP_EXPIRES_IN must be a positive number of minutes');
		}
		return value;
	},
	maxAttempts: 5,
};
