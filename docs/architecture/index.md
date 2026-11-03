# Architecture overview

YapYap is an Electron app split into trust zones that share nothing they do
not have to. The main process is the only trusted code that touches the
system; every web page runs in a sandboxed, context-isolated renderer with
no Node.js access, and talks to the main process only through narrow,
checked channels.

| Zone         | Runs                                                                 | Trust                         |
| ------------ | -------------------------------------------------------------------- | ----------------------------- |
| Main process | App logic, settings, IPC validation, AI assistant, MCP server        | Trusted                       |
| App chrome   | YapYap's own UI, served from a custom `app://` protocol              | Trusted code, untrusted input |
| WhatsApp     | One sandboxed renderer per account, with its own persistent session  | Untrusted (remote)            |
| Engine       | A hidden, sandboxed renderer for the private model, while it is used | Trusted code, no network      |

## Processes and trust zones

<figure class="diagram">
<svg viewBox="0 0 760 440" role="img" aria-labelledby="zones-title zones-desc">
<title id="zones-title">YapYap's processes and trust zones</title>
<desc id="zones-desc">The trusted main process sits between three kinds of sandboxed renderer: WhatsApp accounts, YapYap's own chrome and the private model's engine. Each reaches the main process through its own checked channel. WhatsApp views reach only web.whatsapp.com, the engine reaches no network, and the main process alone reaches GitHub for updates and the AI provider you chose.</desc>
<defs>
<marker id="zones-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrowhead" d="M0,0 L10,5 L0,10 z"/></marker>
</defs>
<rect class="box untrusted" x="20" y="20" width="220" height="50" rx="8"/>
<text class="title" x="130" y="42" text-anchor="middle">web.whatsapp.com</text>
<text class="note" x="130" y="59" text-anchor="middle">the internet</text>
<rect class="box untrusted" x="270" y="20" width="220" height="50" rx="8"/>
<text class="title" x="380" y="42" text-anchor="middle">Updates and AI providers</text>
<text class="note" x="380" y="59" text-anchor="middle">GitHub, the provider you chose</text>
<rect class="box trusted" x="140" y="130" width="480" height="80" rx="8"/>
<text class="title" x="380" y="158" text-anchor="middle">Main process (Node.js): trusted</text>
<text x="380" y="179" text-anchor="middle">settings · accounts · IPC checks · permissions · network filters</text>
<text x="380" y="197" text-anchor="middle">AI assistant · MCP server · secrets · updates</text>
<rect class="box untrusted" x="20" y="290" width="220" height="130" rx="8"/>
<text class="title" x="130" y="314" text-anchor="middle">WhatsApp accounts</text>
<text x="130" y="336" text-anchor="middle">one view per account</text>
<text x="130" y="354" text-anchor="middle">persist:account-&lt;uuid&gt;</text>
<text x="130" y="372" text-anchor="middle">notification shim preload</text>
<text x="130" y="390" text-anchor="middle">adapter in an isolated world</text>
<text class="note" x="130" y="410" text-anchor="middle">untrusted, remote</text>
<rect class="box trusted" x="270" y="290" width="220" height="130" rx="8"/>
<text class="title" x="380" y="314" text-anchor="middle">App chrome</text>
<text x="380" y="336" text-anchor="middle">app://chrome/, in memory</text>
<text x="380" y="354" text-anchor="middle">sidebar, settings, dialogs</text>
<text x="380" y="372" text-anchor="middle">typed preload bridge</text>
<text x="380" y="390" text-anchor="middle">strict CSP, no remote code</text>
<text class="note" x="380" y="410" text-anchor="middle">trusted code, untrusted input</text>
<rect class="box trusted" x="520" y="290" width="220" height="130" rx="8"/>
<text class="title" x="630" y="314" text-anchor="middle">Private model engine</text>
<text x="630" y="336" text-anchor="middle">one hidden page, while used</text>
<text x="630" y="354" text-anchor="middle">app://engine, own session</text>
<text x="630" y="372" text-anchor="middle">CSP of its own</text>
<text x="630" y="390" text-anchor="middle">reaches no network</text>
<text class="note" x="630" y="410" text-anchor="middle">trusted code, no network</text>
<path class="edge" d="M60,286 L60,74" marker-end="url(#zones-arrow)"/>
<text class="label" x="68" y="235">HTTPS</text>
<path class="edge" d="M380,126 L380,74" marker-end="url(#zones-arrow)"/>
<path class="edge" d="M180,214 L180,286" marker-start="url(#zones-arrow)" marker-end="url(#zones-arrow)"/>
<text class="label" x="188" y="246">notification</text>
<text class="label" x="188" y="260">bridge, probes</text>
<path class="edge" d="M380,214 L380,286" marker-start="url(#zones-arrow)" marker-end="url(#zones-arrow)"/>
<text class="label" x="388" y="253">checked IPC</text>
<path class="edge" d="M580,214 L580,286" marker-start="url(#zones-arrow)" marker-end="url(#zones-arrow)"/>
<text class="label" x="588" y="246">engine channel,</text>
<text class="label" x="588" y="260">checked</text>
</svg>
<figcaption>Solid outlines are trusted code; dashed outlines are untrusted content.</figcaption>
</figure>

- **WhatsApp** runs in one view per account inside the main window, each on
  its own persistent partition, so logins, storage and caches never cross
  accounts. The page reaches only WhatsApp's own origin: navigation and
  `window.open` guards send every other link to your browser. Its one
  preload replaces the page's `Notification` and has three operations,
  each checked by the main process ([ADR 0011](/adr/0011-whatsapp-notifications)).
  All knowledge of WhatsApp's page lives in the adapter
  (`src/adapter/`), whose scripts the main process runs in an isolated
  world on demand. They return plain flags or plain data, never page nodes,
  and they add no observers.
- **App chrome** is YapYap's own UI: the sidebar, Settings and every other
  dialog. It is served from `app://chrome/` on an
  in-memory partition under a strict CSP. Its typed preload bridge can
  only invoke named operations, and the main process checks each call's
  sender and payload before acting.
- **The private model's engine** runs in a hidden, sandboxed page on a
  session of its own, served from `app://engine` under a CSP of its own. It
  opens only when the assistant first needs it, closes when idle, and
  reaches no network ([ADR 0017](/adr/0017-assistant-is-part-of-yapyap)).
- **The main process** owns everything that touches the system: files,
  settings, secrets (through the system keychain), notifications, the tray,
  permissions and updates. It denies every permission by default
  ([ADR 0001](/adr/0001-process-model-and-security-boundaries)).
- **The MCP server** for AI agents is part of the main process and off by
  default. Once turned on, it listens on `127.0.0.1` alone, and checks
  every call against the token the agent presents: its scopes, accounts
  and chats ([ADR 0019](/adr/0019-mcp-server)).

The [security review](/architecture/security-review) checks this design
against Electron's security checklist.

## Data flows

### A WhatsApp notification

1. WhatsApp Web creates a `Notification`. The shim in the page's main world
   hands its title, body and tag to the preload, which forwards them.
2. The main process checks that the message came from a WhatsApp account
   view and that each field has the expected shape and size. Bad messages
   are dropped.
3. YapYap shows a native notification, named after the account when there
   are several, and redacted if Settings → Privacy says so. Nothing is
   logged or stored.
4. Clicking it brings YapYap forward, switches to the account and opens the
   chat. Reading the chat closes the notification.

### An AI assistant reply

The assistant is part of YapYap ([ADR 0017](/adr/0017-assistant-is-part-of-yapyap)).

1. You choose **Suggest replies** in the bar above the message box. The
   bar lives in WhatsApp's page, in the adapter's isolated world, in a
   closed shadow root, and its click reaches the main process over a
   fixed channel, checked for sender and payload.
2. The main process reads the open chat through the adapter, at most the
   number of messages you set. The first time in a chat, the bar asks
   you to allow it there, and shows exactly what is sent when you ask.
3. The main process sends it to the provider you chose, with your API key
   from the system keychain, through a session of its own that reaches
   only the providers, Hugging Face and the model server on this computer
   you chose. With the private model, a hidden, sandboxed engine window
   that reaches no network runs it instead.
4. The suggestions appear in the bar as plain text. You click one to put
   it in the message box, and send it yourself.

See the [AI assistant guide](/guide/ai-assistant) for the settings and
the [privacy page](/privacy) for everything YapYap keeps on disk.

## Decisions

Each design choice is recorded in an
[Architecture Decision Record](/adr/):

| Topic                                                  | ADR                                                     |
| ------------------------------------------------------ | ------------------------------------------------------- |
| Processes, trust zones, web preferences, permissions   | [0001](/adr/0001-process-model-and-security-boundaries) |
| Toolchain and pinned versions                          | [0002](/adr/0002-toolchain-and-resolved-versions)       |
| Package formats and update channels                    | [0003](/adr/0003-packaging-and-update-channels)         |
| Tests, coverage and mutation testing                   | [0005](/adr/0005-test-strategy)                         |
| Settings schema and migrations                         | [0006](/adr/0006-settings-schema-and-migrations)        |
| Branches, commits and merging                          | [0007](/adr/0007-git-and-merge-strategy)                |
| Requirements that conflicted, and how each was settled | [0008](/adr/0008-requirement-conflicts)                 |
| Memory, CPU and startup budgets                        | [0009](/adr/0009-performance-budgets)                   |
| Static analysis                                        | [0010](/adr/0010-static-analysis-with-sonarqube-cloud)  |
| WhatsApp notifications                                 | [0011](/adr/0011-whatsapp-notifications)                |
| Translations and right-to-left support                 | [0012](/adr/0012-translations)                          |
| The in-chat assistant bar                              | [0013](/adr/0013-in-chat-assistant-bar)                 |
| The AI assistant as part of YapYap                     | [0017](/adr/0017-assistant-is-part-of-yapyap)           |
| No extensions, marketplace or call recording           | [0018](/adr/0018-no-extensions)                         |
| The MCP server for AI agents                           | [0019](/adr/0019-mcp-server)                            |
| Keeping pinned versions current with Renovate          | [0020](/adr/0020-renovate)                              |
