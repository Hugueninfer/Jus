import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  { ignores: ['public/build/', 'vendor/', 'var/', 'node_modules/'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Plain JavaScript here is Node tooling config (webpack.config.js), which reads process.env.
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { process: 'readonly' },
    },
  },
]);
