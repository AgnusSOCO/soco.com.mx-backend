import { build } from 'esbuild';

await build({
  entryPoints: ['server/_core/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: 'dist',
  packages: 'external',
  external: [
    'vite',
    '@vitejs/plugin-react',
    './vite.config',
    './vite.config.js',
    './vite.config.ts',
    '../../vite.config',
    '../../vite.config.js',
    '../../vite.config.ts',
  ],
  loader: {
    '.ts': 'ts',
  },
  logLevel: 'info',
});

