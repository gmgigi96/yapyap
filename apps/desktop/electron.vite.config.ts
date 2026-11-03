import { globSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';

const RENDERER = resolve(import.meta.dirname, 'src/renderer');

/**
 * The chrome pages show the app icon, whose one source is the packaging
 * icon, so it is emitted from there rather than kept as a second copy.
 */
function appIcon(): Plugin {
  return {
    name: 'yapyap-app-icon',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'icon.svg',
        source: readFileSync(resolve(import.meta.dirname, 'build/icon.svg')),
      });
    },
  };
}

/**
 * The private model's engine (ADR 0017): wllama's one WebAssembly build,
 * shipped beside the renderer's pages under a fixed name, so YapYap holds
 * every byte that runs and nothing is fetched from a CDN.
 */
function engineWasm(): Plugin {
  const require = createRequire(import.meta.url);
  const entry = require.resolve('@wllama/wllama/esm/index.js');
  return {
    name: 'engine-wasm',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'wllama.wasm',
        source: readFileSync(join(dirname(entry), 'wasm', 'wllama.wasm')),
      });
    },
  };
}

export default defineConfig({
  // The main process's dependencies are bundled like YapYap's own code rather
  // than shipped as node_modules: the package then holds only the code that
  // runs, not the SDKs' sources, type definitions and source maps. Bundled
  // code keeps its licenses in a notice file next to it.
  main: { build: { externalizeDeps: false, license: { fileName: 'licenses.md' } } },
  preload: {
    build: {
      rolldownOptions: {
        input: {
          chrome: resolve(import.meta.dirname, 'src/preload/chrome/index.ts'),
          whatsapp: resolve(import.meta.dirname, 'src/preload/whatsapp/index.ts'),
          engine: resolve(import.meta.dirname, 'src/preload/engine/index.ts'),
        },
        // Sandboxed preloads cannot load ES modules.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: RENDERER,
    plugins: [appIcon(), engineWasm()],
    build: {
      license: { fileName: 'licenses.md' },
      // Every HTML shell in the renderer folder is a chrome page.
      rolldownOptions: {
        input: Object.fromEntries(
          globSync('*.html', { cwd: RENDERER }).map((page) => [
            basename(page, '.html'),
            resolve(RENDERER, page),
          ]),
        ),
      },
    },
  },
});
