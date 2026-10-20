import type { Config } from 'jest';

const config: Config = {
	testEnvironment: 'node',
	roots: ['<rootDir>/tests'],
	testMatch: ['**/tests/**/*.spec.ts'],
	testPathIgnorePatterns: ['/node_modules/'],
	moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
	transform: {
		'^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
	},
	setupFiles: ['<rootDir>/tests/environment.ts'],
	setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
	clearMocks: true,
	restoreMocks: true,
	testTimeout: 10000,
};
export default config;

