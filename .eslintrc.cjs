module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
  overrides: [
    {
      // shadcn generates these, and its convention is to export a variant
      // helper next to the component (ui/button.tsx's buttonVariants, imported
      // by ui/calendar.tsx). That trips react-refresh/only-export-components,
      // and with --max-warnings 0 it made `npm run lint` permanently fail.
      // Deleting the export isn't an option, and it's their file layout, not
      // ours, so the rule is off for this directory only.
      files: ['src/components/ui/**/*.{ts,tsx}'],
      rules: { 'react-refresh/only-export-components': 'off' },
    },
  ],
}
