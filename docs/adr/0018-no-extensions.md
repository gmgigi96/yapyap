# 0018. No extensions, marketplace or call recording

- Status: Accepted
- Date: 2026-11-02

## Context

YapYap hosted signed, sandboxed extensions (ADR 0004), listed them in a
marketplace (ADR 0014), and built call recording for an extension to ask
for (ADR 0015). Once the AI assistant became part of YapYap (ADR 0017),
the only first-party extensions left were the call recorder and an
example.

On 2026-11-02 the maintainer decided that YapYap drops extensions
altogether: the extension host, the marketplace, the SDK and signing CLI,
and the call recorder.

## Decision

- YapYap runs no extensions. There is no extension host, no
  `extension://` scheme, no extension preload, no Extensions window or
  menu, no install links (`yapyap://`), and no extension settings,
  shortcuts or right-click items.
- There is no marketplace: no signed index on packages.guita.org, no
  marketplace pages on the website, and no signing key for it.
- There is no call recording: no recorder window, no recording settings,
  and no exception in the permission handler for YapYap's own pages to use
  the microphone or capture a call.
- `@yapyap/extension-sdk` and `@yapyap/extension-sign` are not published,
  and the extension template is gone. YapYap releases one thing: the app.
- What the assistant shares with the removed code stays with the
  assistant: reading the open chat and the unread chats through the
  adapter (`assistant/chat-reading.ts`), and the capped download that
  detects model servers (`assistant/capped-fetch.ts`).

This supersedes ADR 0004, 0014, 0015 and 0016. Where other ADRs and the
conflict log mention extensions, they describe what YapYap used to do.

## Consequences

- One trust zone fewer: the only renderers are WhatsApp's accounts,
  YapYap's own pages and the private model's engine. The permission
  handler, navigation guards and CSPs no longer carry rules for third-party
  code.
- No signing key to guard, no index to sign again every 30 days, and no
  npm packages to publish.
- Before 1.0 YapYap keeps no backward compatibility (ADR 0008, C45): a
  profile's `extensions/` folder and `recordings.json` stay on disk
  untouched, and a settings file's `extensions` and `recording` sections are
  dropped as unknown on the next start.
- Features that need code beside WhatsApp go into YapYap itself, through
  the usual review, or into the user's own CSS and JavaScript.
