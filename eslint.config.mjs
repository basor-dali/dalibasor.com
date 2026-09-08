import { createRequire } from 'node:module';

/**
 * ESLint flat config.
 *
 * eslint-config-next v16 ships flat-config arrays directly, so there is no
 * FlatCompat shim here — passing these through the eslintrc compat layer
 * throws on the plugin graph's circular references.
 *
 * They are CommonJS, hence createRequire rather than a bare import.
 */
const require = createRequire(import.meta.url);

const coreWebVitals = require('eslint-config-next/core-web-vitals');
const nextTypescript = require('eslint-config-next/typescript');

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'public/**',
      'next-env.d.ts',
    ],
  },

  ...coreWebVitals,
  ...nextTypescript,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Every image on this site goes through the media provider, which emits a
      // plain <img> with a hand-built srcSet. next/image would duplicate the
      // work and route CDN URLs through a second optimizer.
      '@next/next/no-img-element': 'off',
    },
  },

  {
    // Node scripts: plain ESM, run directly, not part of the app's type graph.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
];

export default config;
