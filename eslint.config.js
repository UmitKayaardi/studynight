import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dev-dist',
      'coverage',
      'playwright-report',
      'test-results',
      'node_modules',
      'public',
      'benchmarks/results',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // Model output is always rendered as text. The only allowed exception is sanitised KaTeX/highlighter HTML
      // inside src/components/RichText.tsx, which disables this rule locally with a justification.
      'react/no-danger': 'off',
    },
  },
  {
    files: ['scripts/**', 'benchmarks/**'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
);
