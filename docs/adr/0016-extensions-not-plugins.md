# 0016. Extensions, not plugins

- Status: Superseded by [0018](0018-no-extensions.md)
- Date: 2026-10-28

## Context

YapYap called its add-ons "plugins". To most people who use a desktop app,
the word suggests something technical, and an older generation of browser
plugins that were a byword for crashes and security holes. YapYap's add-ons
are the opposite: signed, sandboxed, and limited to what the user allowed
(ADR 0004). People already know "extensions" from their browser, where they
mean small, optional, permission-scoped additions, which is what YapYap's
are. No stable release has shipped the plugin system to many users yet, so
renaming now costs little; later it would cost every extension author.

## Decision

1. **One word everywhere.** User-facing text, documentation, the SDK, code,
   file and folder names, workflows and issue templates say "extension".
   Third-party names (such as ESLint's `plugins` option and
   `typedoc-plugin-markdown`), the changelog and past progress notes keep
   their spelling.
2. **No backward compatibility.** The maintainer chose a clean break
   (2026-10-28):
   - packages: `@yapyap/extension-sdk`, `@yapyap/extension-sign` with the
     `yapyap-extension-sign` command;
   - archives: `.yapyap-extension`;
   - pages: the `extension://<id>/` scheme, on `extension:<id>` partitions;
   - data: `<userData>/extensions/`, and an `extensions` settings section;
   - links: `yapyap://extensions/install/<id>`;
   - the marketplace index: `https://packages.guita.org/extensions/index.json`,
     with an `extensions` list;
   - CI: the `EXTENSION_SIGNING_KEY` secret and the
     `EXTENSION_SIGNING_PUBLIC_KEY` variable.
3. **A new first-party signing key.** Nobody held a copy of the old private
   key outside the CI secret, which cannot be read back, so it could not move
   to the new secret name. A new Ed25519 key replaces it: it is the only
   trust anchor, and the old public key is no longer trusted. The maintainer
   keeps a copy of the new private key offline.
4. **Accepted ADRs use the new word.** Their decisions are unchanged; only
   the term and the names above were updated, so they keep describing the
   code as it is.

## Consequences

- Extensions installed under the old names are not carried over: YapYap no
  longer reads `<userData>/plugins/`, so users install them again, and the
  AI assistant asks for its key again. The old folder and partitions stay on
  disk, with secrets still encrypted by the OS, until the user removes them.
- The Developer Mode switch and the number of messages an extension may read
  return to their defaults, because the old settings section is dropped.
- First-party archives signed before the rename are refused, because
  their key is no longer trusted. Older YapYap versions read the old index
  address, which is no longer updated. The marketplace lists the same
  entries; their next versions ship as `.yapyap-extension` files.
- Install in YapYap links on the website use the new address, so they only
  work with a YapYap version from after the rename.
