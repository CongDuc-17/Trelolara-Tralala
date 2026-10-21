import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['./src/app.ts', './src/server.ts'],
	format: ['cjs'],
	splitting: false,
	sourcemap: true,
	clean: true,
	outDir: './dist',
	skipNodeModulesBundle: true,
	external: ['bcrypt', '@prisma/client'],
});

