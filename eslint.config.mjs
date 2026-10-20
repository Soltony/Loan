import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'dist/**', // esbuild worker bundle
    'logs/**',
    'next-env.d.ts',
    'scripts - Copy/**',
    // Stale, non-routable copy of the API; the live routes are in src/app/api.
    'src/api/**',
  ]),
]);
