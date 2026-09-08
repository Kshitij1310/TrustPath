module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: 'detect' } },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // Props are documented in JSDoc and the API README; prop-types would be
    // noise in a codebase that deliberately skipped TypeScript.
    'react/prop-types': 'off',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // Build config runs in Node, not the browser.
      files: ['vite.config.js', 'tailwind.config.js', 'postcss.config.js'],
      env: { node: true, browser: false },
      parserOptions: { sourceType: 'module' },
    },
  ],
};
