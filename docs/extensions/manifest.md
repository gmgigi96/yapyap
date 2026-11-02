# Extension manifest

Every extension carries a `manifest.json` that says who made it, what it needs
and what it adds to YapYap. YapYap checks it against the
[manifest schema](/schema/manifest.schema.json) before it shows the extension
to you, and shows you every capability and host it asks for before you
install it. [Writing an extension](./) walks through a complete example.

```json
{
  "id": "org.example.translate",
  "name": "Translate",
  "version": "1.2.0",
  "author": { "name": "Example", "url": "https://example.org" },
  "apiVersion": "^1.0.0",
  "entry": "dist/main.js",
  "capabilities": ["chat:read-active", "composer:insert-draft"],
  "network": { "hosts": ["api.example.org"] },
  "contributes": {
    "commands": [{ "id": "translate", "title": "Translate draft" }],
    "composerActions": [{ "title": "Translate", "command": "translate" }]
  }
}
```

| Field          | Meaning                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `id`           | Reverse-DNS name, lower case, such as `org.example.translate`                                    |
| `version`      | Semantic version of the extension                                                                |
| `apiVersion`   | The SDK versions it works with: an exact version, or one starting with `^` or `~`                |
| `entry`        | The ES module YapYap starts, a path inside the extension                                         |
| `activation`   | When it runs: `startup` (the default) from launch to quit, or `on-demand` only while needed      |
| `capabilities` | What it may do; see below. YapYap asks you for each one, per account                             |
| `network`      | The only HTTPS hosts it may reach: names, without a scheme or port                               |
| `contributes`  | Commands, composer actions, context-menu items, a settings form and an optional panel            |
| `signature`    | Written by `yapyap-extension-sign`: the author's Ed25519 public key and the signature (ADR 0004) |

## Commands and menu items

Each entry of `contributes.commands` appears in YapYap's menu under
**Extension Commands** as `<extension name>: <title>`, and runs the handler the
extension registered with `host.commands.onRun`. `composerActions` and
`contextMenu` items run one of those commands from a right click in
WhatsApp: composer actions on the message box, and context-menu items on a
message (`"on": "message"`) or on a chat in the list (`"on": "chat"`). An
item that names a command the extension does not declare is not shown.

A command may suggest keys with `shortcut`, in Electron's accelerator syntax,
such as `"shortcut": "CmdOrCtrl+Shift+E"` (`CmdOrCtrl` is ⌘ on macOS and Ctrl
elsewhere). YapYap gives the command those keys only when they are valid and
clash with none of YapYap's shortcuts, as the user set them, nor with a
command of an extension listed earlier; otherwise the command has no
keys. Users can change or remove the keys in **Keyboard Shortcuts**, and
their choice comes before any suggestion.

`contributes.panel` (`title` and `entry`) gives the extension a panel, which
the user opens from **Extension Commands**. It opens in a window of its own,
titled `<extension name>: <title>`, whose page loads the `entry` module. The
panel has no host API of its own: it talks to the extension's main module,
which shares its origin, with a `BroadcastChannel`.

## When it runs

Each running extension costs a hidden page of its own, about 100 MB of
memory. An extension that acts only when the user asks it to can run only
while it is needed.

- `"activation": "startup"`, the default, starts the extension when YapYap
  starts and keeps it running until YapYap quits. Use it when the extension
  works on its own, without the user picking a command or opening its panel.
- `"activation": "on-demand"` starts it the first time it is needed: when
  the user runs one of its commands, from the menu, a shortcut or a right
  click, or opens its panel. A command picked while it starts waits until
  `activate` has finished, so register its handlers there. YapYap may stop
  it once it has made no host call, run no command and had no panel open for
  five minutes, and starts it again the next time it is needed.

YapYap lists the commands, menu items and panel from the manifest, so they
show whether the extension runs or not. An on-demand extension keeps
nothing in memory from one start to the next: keep what must last in
`host.storage`.

## Capabilities

| Capability                 | Lets the extension                                                            |
| -------------------------- | ----------------------------------------------------------------------------- |
| `chat:read-active`         | Read the open chat's name and its most recent messages                        |
| `chat:read-unread-summary` | Read which chats are unread, their counts and last-message previews           |
| `composer:insert-draft`    | Put text in the composer, or replace it, for you to edit and send             |
| `composer:read-draft`      | Read what you typed in the composer so far                                    |
| `notifications:show`       | Show notifications with its name                                              |
| `storage:local`            | Keep its own data between sessions                                            |
| `secrets:own`              | Keep its own secrets, such as API keys, encrypted by your OS                  |
| `local-network`            | Reach servers on this computer you allow one by one, such as a local AI model |

No capability lets an extension send a message, see WhatsApp's page, or run code
in it. Extensions only ever get chat content as plain data, and only what you
grant.

## Settings form

`contributes.settings` is a JSON Schema for the extension's settings, which
YapYap shows as a form in the Extensions window. YapYap renders only a plain
`object` whose `properties` are named with letters, digits and `_` and
each have:

- `type`: `string`, `number`, `integer` or `boolean`;
- optionally `title`, `description`, `enum` (the choices),
  `minimum`/`maximum`, and `maxLength` (at most 1000).

A schema with anything else shows no form. The extension reads what the user
saved with `host.settings.get()`, which needs no capability; a setting the
user never saved is missing, so the extension falls back to its own default.
Keep API keys out of settings and in `host.secrets`.

## Writing an extension

The `@yapyap/extension-sdk` package has the TypeScript types for the manifest
and for the host API an extension receives. See [Writing an extension](./) for a
complete example, and the [SDK API reference](/api/) for every call.
