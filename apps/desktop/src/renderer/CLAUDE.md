# Chrome renderer: notes for agents and contributors

These add to the repository's root `CLAUDE.md`, which applies here too.

- `pnpm dev` serves chrome pages from `out/renderer` too, never from the
  Vite dev server: `watchChromePages` in `electron.vite.config.ts`
  watch-builds them there. They have no hot reload; reopen a window to see
  an edit.
- Import wllama from `@wllama/wllama/esm/index.js`: the package's `main` names
  a file it does not ship, and its TypeScript sources do not pass our checks.
  Keep `setCompat(null)`, or wllama fetches a build from a CDN.
