import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'src-tauri/**', 'target/**'],
  },
  {
    rules: {
      // These were fully 'off', so lint caught essentially nothing at the
      // runtime/state boundary. Downgraded to 'warn' rather than re-enabled
      // as hard errors outright — there are ~50 existing `any` usages and a
      // number of unused-var/no-undef spots across the codebase, and turning
      // those into build-breaking errors in one pass risked a much larger,
      // unreviewed change. 'warn' makes them visible in `pnpm lint` output
      // (and doesn't fail the command's exit code) without a blocking rewrite.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'no-empty': 'warn',
      'no-undef': 'warn',
      'no-useless-escape': 'off',
      'prefer-const': 'warn',
    },
  },
);
