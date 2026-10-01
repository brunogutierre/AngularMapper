// @ts-check
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const rootConfig = require('../../../eslint.config.js');

/**
 * The library is held to a stricter standard than application code: every rule that
 * needs type information is enabled, because public API mistakes are costly to undo.
 */
module.exports = defineConfig([
  ...rootConfig,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.lib.json', './tsconfig.spec.json', './tsconfig.type-tests.json'],
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/consistent-type-exports': 'error',
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test-d.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
]);
