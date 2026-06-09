import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import pluginSecurity from 'eslint-plugin-security'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `gateway/` is a separate Node service with its own build/typecheck/test;
  // it must not be linted with the SPA's browser + React rule set.
  globalIgnores(['dist', 'gateway']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      pluginSecurity.configs.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // High-noise / low-signal: flags every computed member access (obj[key]).
      // Our bracket access is on trusted byte arrays and literal lookup tables,
      // not user-controlled keys. The rest of eslint-plugin-security stays on.
      'security/detect-object-injection': 'off',
      // Honor the `_`-prefix convention for intentionally-unused args/vars.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
])
