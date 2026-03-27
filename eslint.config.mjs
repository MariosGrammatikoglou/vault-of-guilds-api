// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Goal: keep it simple, avoid ESLint TypeScript "project service" entirely,
 * and ignore non-source folders (scripts/sql) so dbSetup.js never triggers warnings.
 */
export default tseslint.config(
  // Completely ignore folders we don't want ESLint/TS to touch
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'scripts/**', // <-- dbSetup.js lives here; fully ignored
      'sql/**',
      'eslint.config.mjs'
    ]
  },

  // Base JS recommendations
  eslint.configs.recommended,

  // TS recommendations (NON type-checked = no project service)
  ...tseslint.configs.recommended,

  // Prettier integration (formatting warnings)
  eslintPluginPrettierRecommended,

  // Global language options for this repo
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest
      },
      sourceType: 'module',
      parserOptions: {
        ecmaVersion: 'latest'
        // NOTE: no "projectService" and no "project" here — keeps things lightweight
      }
    }
  },

  // Your custom rules
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn'
    }
  }
);
