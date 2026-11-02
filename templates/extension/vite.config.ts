import { defineConfig } from 'vite';

/**
 * YapYap loads one self-contained ES module per page, with nothing from
 * Node.js. `public/` holds the manifest, which Vite copies beside it.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2024',
    lib: {
      entry: { main: 'src/main.ts' },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
  },
});
