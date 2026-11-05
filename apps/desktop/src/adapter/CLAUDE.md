# WhatsApp adapter: notes for agents and contributors

These add to the repository's root `CLAUDE.md`, which applies here too.

- Code that inspects WhatsApp's page lives in `src/adapter/` and runs in the
  adapter's isolated world (`ADAPTER_WORLD_ID`). Probes return plain flags,
  never page text, which can contain chats. They run on demand and never add
  observers. Selectors live only in `LANDMARKS` (`src/adapter/page-state.ts`):
  change one together with the fake page, and bump `LANDMARKS_VERSION`.
