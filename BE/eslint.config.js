const parser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
	{ ignores: ['node_modules/**', 'dist/**', 'src/models/**', 'coverage/**'] },
	{
		files: ['src/**/*.ts', 'tests/**/*.ts'],
		languageOptions: { parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
		plugins: { '@typescript-eslint': tsPlugin },
		rules: {
			'constructor-super': 'error',
			'no-dupe-args': 'error',
			'no-dupe-class-members': 'error',
			'no-duplicate-case': 'error',
			'no-unreachable': 'error',
			'valid-typeof': 'error',
			'@typescript-eslint/no-explicit-any': 'warn',
		},
	},
];

