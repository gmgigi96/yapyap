# Writing an extension

A YapYap extension is a small ES module, plus a manifest that says what it
needs. YapYap runs it in a sandbox of its own, away from WhatsApp, and
gives it only the capabilities you approve. This guide walks through the
example extension in
[`extensions/example`](https://github.com/vascoguita/yapyap/tree/master/extensions/example).
It drafts a greeting in the open chat when you run its command, and lets you
choose the greeting in its settings.

## Start from the template

Your extension lives in a repository of your own. Start it from a copy of
[`templates/extension`](https://github.com/vascoguita/yapyap/tree/master/templates/extension),
the same greeter set up to stand alone: a Vite build, the manifest in
`public/`, and a GitHub Actions workflow that builds, signs and attaches
each release with your own key. Its README lists the steps, from choosing
your extension's ID to listing it in the marketplace.

The template builds with two npm packages, both released from this
repository with provenance: `@yapyap/extension-sdk`, the types and manifest
schema, and `@yapyap/extension-sign`, the signing CLI. Their first release
on npm is coming; until then, build the template inside a clone of this
repository, where it uses the SDK and CLI from `packages/`.

## What an extension is made of

```text
greeter/
├── manifest.json   who made it, what it needs, what it adds
└── main.js         the entry module YapYap starts
```

An extension can carry more files, such as other modules its entry imports or
images. Every file is covered by the signature, and YapYap serves only files
inside the extension.

## The manifest

```json
{
  "id": "org.example.greeter",
  "name": "Greeter",
  "version": "1.0.0",
  "description": "Drafts a greeting in the open chat, for you to edit and send.",
  "author": { "name": "YapYap contributors", "url": "https://github.com/vascoguita/yapyap" },
  "apiVersion": "^1.0.0",
  "entry": "main.js",
  "activation": "on-demand",
  "capabilities": ["composer:insert-draft"],
  "network": { "hosts": [] },
  "contributes": {
    "commands": [{ "id": "draft-greeting", "title": "Draft a greeting" }],
    "settings": {
      "type": "object",
      "properties": {
        "greeting": {
          "type": "string",
          "title": "Greeting",
          "description": "What the draft says.",
          "maxLength": 200
        }
      }
    }
  }
}
```

Ask for as little as you can: the user sees every capability and host
before installing, and can take any of them back later. The
[manifest reference](./manifest) lists every field, every capability and
the settings form YapYap renders. IDs under `org.guita.yapyap.` belong to
YapYap's own extensions, so pick a reverse-DNS name you control.

## The code

The `@yapyap/extension-sdk` package has the types. An extension needs only its
types at build time, so nothing from the SDK ends up in `main.js`:

```ts
import type { Extension } from '@yapyap/extension-sdk';

const FALLBACK = 'Hello! How are you?';

export default {
  activate(host) {
    host.commands.onRun('draft-greeting', async () => {
      const { greeting } = await host.settings.get();
      await host.composer.insertDraft(typeof greeting === 'string' ? greeting : FALLBACK);
    });
  },
} satisfies Extension;
```

YapYap imports the `entry` module and calls the `activate` of its default
export with the host API. With `"activation": "on-demand"`, it does so only
when the user first runs one of the extension's commands or opens its
panel, and may stop it again once idle ([when it runs](./manifest#when-it-runs)).
`host.commands.onRun` runs a handler when the
user picks the command from **Extension Commands** in the menu, and
`host.settings.get` returns what the user saved in the extension's form.
`host.composer.insertDraft` puts text in the open chat's message box: the
user reads it, edits it and sends it. No API sends a message.

Every host call returns a promise. A call that fails rejects with a
[`ExtensionError`](/api/interfaces/ExtensionError) whose `kind` says why:
`not-granted` (the user did not approve the capability, or took it back for
the account on screen), `invalid`, `rate-limited` (more than 40 calls in a
burst, refilling at 5 a second), `timeout` (10 seconds) or `failed`.

The [API reference](/api/) documents the whole host API. Both chat
readers act on the account on screen, and only when the extension calls
them.

- `host.chat.readActive()`, with `chat:read-active`, returns the open
  chat's name, whether it is a group, and the text of its latest messages
  (as many as the user allows in Settings), or `null` when no chat is open.
- `host.chat.readUnreadSummary()`, with `chat:read-unread-summary`, returns
  the chats with unread messages, top of the chat list first. Each comes
  with its name, its unread count, and its last message's preview as the
  one entry in `messages`, with `outgoing: false`.

The unread summary reads the chat list and nothing else. Opening a chat to
read its messages would mark them read and tell the people who wrote that
you read them, so YapYap never opens one. That limits what it can return:

- Only the chat list's preview of each chat's last message, cut to 1,024
  characters. A chat whose preview is empty, such as a photo with no
  caption, comes with no messages.
- At most 20 chats. WhatsApp builds only the rows near the screen, so chats
  further down the list are left out until you scroll to them.
- Names cut to 256 characters. A row whose badge shows no count, as a chat
  you marked unread may, is not counted.

### Keeping data

With `storage:local`, `host.storage` keeps JSON values under keys of up to
256 characters, private to the extension and kept across restarts. An extension's
store holds up to 1 MiB, and a write that would pass that fails. Values
must be plain JSON: a value JSON cannot hold, such as `undefined`, fails
the call.

When the user removes the extension in the Extensions window, YapYap deletes its
store, its secrets and its browser data (such as `localStorage`) along with
its files. Installed again, it starts from nothing, so treat anything it
kept as something the user can take away at any time.

### Reaching the internet

An extension may call `fetch` on the HTTPS hosts its manifest lists under
`network.hosts`, and, with `local-network`, on servers running on the
user's computer (`localhost`, `127.0.0.1` or `[::1]`, any port) the user
allows, and nothing else. When the user types an endpoint into a
setting, a request to a host not in the manifest asks the user first, and
so does the first request to each server on the user's computer. YapYap
answers CORS for a local server the user allowed, so it needs no
`Access-Control-Allow-Origin` setup of its own. Keep
API keys in `host.secrets`, which the operating system encrypts, never in
settings.

### The AI assistant

The AI assistant is part of YapYap, not an extension
([ADR 0017](/adr/0017-assistant-is-part-of-yapyap)). Extensions cannot
draw in its bar, run a model with WebAssembly, or ask YapYap to look for
model servers. An extension that writes with AI calls its provider from
its own page, with `network.hosts` and `host.secrets` as above, and puts
its text in the message box with `composer:insert-draft`.

### Styling a panel

A panel starts with YapYap's own look: system fonts, YapYap's colors in
light and dark, styled buttons, inputs and lists, and a visible focus ring.
YapYap links this stylesheet before your panel's module, so plain HTML
already fits in. Give the button for the step a person takes next the
`yapyap-primary` class.

To style more, ship a stylesheet in your extension and add it from your
panel's module with a `<link rel="stylesheet">` to its path: the extension
CSP allows your own files, never inline styles. Build on these variables,
which follow the theme:

| Variable                                | What it is                          |
| --------------------------------------- | ----------------------------------- |
| `--yapyap-surface`, `--yapyap-raised`   | The page background, and cards      |
| `--yapyap-text`, `--yapyap-muted`       | Text, and secondary text            |
| `--yapyap-accent`, `--yapyap-on-accent` | Accent color, and text on it        |
| `--yapyap-border`, `--yapyap-danger`    | Borders, and errors                 |
| `--yapyap-radius`                       | Corner radius of cards and messages |

## Build it

The example compiles `src/main.ts` with `tsc` and copies the manifest next
to the output:

```sh
pnpm --filter @yapyap/extension-example build   # writes extensions/example/dist/
```

Any bundler works, as long as the output is an ES module that runs in a
browser page without Node.js.

## Sign it

Extensions are signed with Ed25519. Make a key once, and keep it private and
backed up: YapYap pins it to your extension ID on first install and refuses
updates signed by any other key.

```sh
openssl genpkey -algorithm ed25519 -out greeter-key.pem
```

Then sign the built folder and pack it into the archive users install:

```sh
node packages/extension-sign/src/bin/yapyap-extension-sign.ts sign --key greeter-key.pem extensions/example/dist
node packages/extension-sign/src/bin/yapyap-extension-sign.ts pack extensions/example/dist greeter.yapyap-extension
```

In a repository started from the template, `npx yapyap-extension-sign`
runs the same CLI, and its release workflow signs with the key you store as
the `EXTENSION_SIGNING_KEY` secret.

`sign` writes the public key and the signature into `manifest.json`. The
signature covers the manifest and the SHA-256 of every file, so change
nothing after signing; `pack` refuses a folder whose signature no longer
verifies, and `verify` checks one by hand. The CLI never prints or writes
your private key.

## Try it

1. In YapYap, choose **Install Extension…** from the menu and pick the
   `.yapyap-extension` file.
2. Check the author, the key fingerprint, the capabilities and the hosts,
   tick the acknowledgement and choose **Install**.
3. Open **Extensions…** to set the greeting, take permissions back, or see
   the latest calls the extension made.
4. Open a chat and choose **Extension Commands → Greeter: Draft a greeting**.

While you work on an extension, **Developer Mode** in Settings lets you install
it unsigned. YapYap marks unsigned extensions as such for as long as they are
installed, so turn Developer Mode off when you are done.

## Distribute it

Publish the `.yapyap-extension` file wherever you like, such as your project's
releases, together with your key's fingerprint so users can check it in the
install window. YapYap does not review third-party extensions and says so when
the user installs one. To update, raise `version`, sign with the same key
and publish the new archive. An update that asks for new capabilities or
hosts waits until the user approves them.

## Threat model

YapYap assumes an extension may be buggy, compromised or hostile, and holds the
line without trusting it ([ADR 0004](/adr/0004-extension-isolation-and-trust-model)).
What that means for you as an author:

- **Isolation.** Each extension runs in its own hidden, sandboxed page and
  browser session, with no Node.js and no access to WhatsApp's page or to
  other extensions. Its content security policy allows no `eval`, no inline
  scripts and no remote scripts.
- **One channel.** The extension talks to YapYap only through the host API.
  Every call is validated, checked against the user's grants for the
  account on screen, rate limited and timed out, and written to an audit
  log the user can read. The log names the capability and the call, never
  the parameters or the result.
- **Least privilege.** The user can take any capability or host back at
  any time, for the whole extension or for one account, and the next call
  fails with `not-granted`. Handle that gracefully.
- **Resources.** An extension that keeps using more than half a CPU core or
  256 MB of memory is restarted, and stopped after three restarts in ten
  minutes.
- **Your key.** Whoever holds your private key can ship updates to your
  users. Keep it out of your repository, and use a CI secret if your CI
  signs releases.
- **Your users' data.** Chat text reaches an extension only through capabilities
  the user granted. Do not send it anywhere the user would not expect, and
  say in your extension's description which hosts it talks to and why.
