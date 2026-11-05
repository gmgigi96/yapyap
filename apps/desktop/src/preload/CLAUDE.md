# Preloads: notes for agents and contributors

These add to the repository's root `CLAUDE.md`, which applies here too.

- WhatsApp's views have one preload, `src/preload/whatsapp/`, which replaces
  the page's `Notification` (ADR 0011). `installNotificationShim` runs in
  WhatsApp's main world as source text, so it may use nothing from outside
  its body; check `out/preload/whatsapp.cjs` after changing it. Its bridge
  has three operations, and the main process checks everything it sends.
