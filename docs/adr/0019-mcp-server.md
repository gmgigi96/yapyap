# 0019. An MCP server for AI agents

- Status: Accepted
- Date: 2026-11-02

## Context

People who use AI agents (Claude Code, Claude Desktop, other MCP clients)
want those agents to read their WhatsApp chats, write drafts and, when the
user allows it, send messages for them. MCP is the common way agents reach
tools on the same computer, so YapYap would offer an MCP server.

The maintainer decided (2026-11-02) that:

- It is part of YapYap (ADR 0018: a feature goes into YapYap itself), off
  until the user turns it on.
- Agents reach it directly over HTTP on this computer, with no extra
  program to install.
- A **fine-grained token** is the protection: the agent may ask for
  anything, and the server allows only what the token's scopes, accounts
  and chats permit.
- With the right scope, the agent **sends messages without a click**.

Each of these goes against something decided before:

- YapYap listens on no port or socket, enforced by
  `src/main/no-endpoint.test.ts`.
- Rule 8 of `CLAUDE.md`: nothing sends a message for the user. ADR 0013
  and ADR 0017 say the same of the assistant.

The risks this brings in, which the design has to limit:

- **Other programs and web pages on this computer.** A loopback port is
  reachable by every local process and, through DNS rebinding and
  cross-site requests, by web pages.
- **Prompt injection.** An agent with a valid token reads messages written
  by other people. A message can tell the agent to forward chats, message
  contacts or spam groups. A token checks _who_ is calling, not _why_.
- **The user's account.** WhatsApp bans numbers that send automated or bulk
  messages.

## Decision

### 1. Where it lives

The server is YapYap's own code in `apps/desktop/src/main/agents/`: the
listener, the token store and checks, the tools, and the call queue. It
reaches WhatsApp only through the adapter, with the same readers and
message box steps as the assistant (`assistant/chat-reading.ts`,
`notifications/reply.ts`). Its settings are a section of the Settings
page. Nothing runs in a new renderer, and nothing about the agent is
trusted: every rule below is enforced by YapYap, on every call.

### 2. The listener

- **Transport.** MCP's Streamable HTTP, stateless (no session, one
  answer per request), at `http://127.0.0.1:<port>/mcp`. The protocol
  versions are the ones the pinned SDK supports.
- **Address.** `127.0.0.1` only, never `0.0.0.0` or `::`. The port is
  chosen at random from 49152–65535 the first time and kept, so agents'
  configs stay valid; Settings can pick a new one. If it is taken, YapYap
  does not listen and Settings says so with **Pick another port**.
- **Lifetime.** Listening starts when the user turns on **Let AI agents
  connect** in Settings › Agents, and stops when they turn it off or
  choose **Stop AI Agents** in the tray. It is off by default, never starts
  before the main window is up, and opens no renderer (ADR 0009).
- **Implementation.** The official MCP TypeScript SDK, so the protocol
  (handshake, version negotiation, JSON-RPC framing and errors, capability
  advertising) follows the spec and its fixes without us tracking it by
  hand. We take the v2 server package alone, pinned exactly (rule 10):
  `@modelcontextprotocol/server`, which brings `@modelcontextprotocol/core`
  and `zod`. Both are MIT or Apache-2.0, which `pnpm check:licenses`
  allows, and neither has an install script. We take neither the v1
  `@modelcontextprotocol/sdk`, which also pulls Express, CORS, OAuth and
  client code into the main process, nor the v2 Node adapter, which brings
  Hono for what one function does here.
  - YapYap's own `node:http` server (`listener.ts`) runs steps 1–5 of §3
    before it reads the body, and `handler.ts` runs steps 6–7. Only then
    is the request handed to the SDK's `createMcpHandler` as a web
    `Request` carrying the body and three headers (`content-type`,
    `accept`, `mcp-protocol-version`). The SDK never sees a request that
    is unauthenticated, too large or from a browser, nor the token.
  - The SDK's own DNS-rebinding options are deprecated in favour of the
    server's own checks, which §3 is.
  - Tools are registered with `McpServer.registerTool` and Zod input
    schemas. A server is built per request with only the tools the
    calling token may use, the stateless pattern from the SDK's docs.
    Nothing from one agent's call stays around for the next.

### 3. Every request, in this order

Each step fails closed and ends the request; nothing reaches the next step
on failure.

1. The socket's remote address is loopback.
2. `Host` is exactly `127.0.0.1:<port>` or `localhost:<port>` (DNS
   rebinding).
3. There is no `Origin` header (a browser page sends one; agents do not).
4. Method `POST` on `/mcp`; anything else is `405` or `404`.
5. `Content-Type: application/json`, body at most 64 KiB however it is
   sent, all of it within 5 seconds.
6. `Authorization: Bearer <token>`. The token's ID selects a record; the
   secret's SHA-256 is compared in constant time. Unknown, revoked or
   expired: `401`, with the same body for each. After 10 failures in a
   minute, from any caller, every request gets `429` until they are a
   minute old.
7. The token's calls a minute (§5).
8. The SDK parses the JSON-RPC message and refuses one that does not
   match the protocol.
9. `tools/list` returns only the tools the token's scopes allow.
   `tools/call` refuses a tool the token cannot use, then the SDK checks
   the arguments against the tool's schema.
10. The tool checks the token's accounts and chats before it touches
    WhatsApp, and again for every chat it opens, reads or writes to. A
    refusal is a tool error, not a crash.

Errors name the rule, not the data: a chat outside the allowlist and a
chat that does not exist get the same `chat_not_allowed`, so a token cannot
probe which chats exist. Calls run one at a time per account, so two agents
never type into the same message box at once.

### 4. Tokens

A token looks like `yapyap_mcp_<id>_<secret>`, where `<id>` is 8 random
bytes and `<secret>` 32, both in hex. Only `<id>` and the SHA-256 of
`<secret>` are kept; the token is shown once, at creation.

Each token has:

| Field    | Values                                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Name     | What the user calls it ("Claude Code on this laptop"), up to 64 characters                                                       |
| Scopes   | A subset of §5                                                                                                                   |
| Accounts | One or more of the user's accounts                                                                                               |
| Chats    | **All chats**, or **Only these chats** (at most 100). A token with `chat:open` or `messages:send` must use **Only these chats**. |
| Limits   | Calls per minute; for `messages:send`, messages per minute and per day. Each is a number or **Unlimited**.                       |
| Expiry   | 1, 7, 30 (default) or 90 days, or never. A token with `messages:send` expires within 30 days.                                    |
| Notify   | For `messages:send`: show a notification each time it sends (on by default)                                                      |

Records live in `agent-tokens.json` (at most 20 tokens). Chat allowlists
follow C42: the record holds the SHA-256 of each chat name, and the names
themselves, for the UI, are kept encrypted in the secrets under
`agents/chat/<token>/<chat>`. A token can be **narrowed**, one scope,
account or chat at a time, but never left with none and never widened:
wanting more means creating a new token.

The `agents` settings section (on or off, and the port) is local like
`assistant` (`LOCAL_SECTIONS`): never exported or imported, so a file
someone hands the user cannot turn the server on. Tokens are state, not
settings, and are never exported either.

### 5. Scopes and tools

| Scope                      | Lets the agent                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `chat:read-unread-summary` | See unread chats: name, count, last messages. Filtered to the token's chats.                          |
| `chat:read-active`         | Read the open chat's name and its last N messages (N at most 50). Refused if the chat is not allowed. |
| `chat:open`                | Open an allowed chat from the chat list, so it can be read or written to. Marks it read.              |
| `composer:read-draft`      | Read the draft in the open chat.                                                                      |
| `composer:insert-draft`    | Put text in the open chat's message box, never sending it.                                            |
| `messages:send`            | Send a plain-text message to an allowed chat, opening it first.                                       |

Each token has three limits: 60 calls a minute, and, for a token that
sends, 5 messages a minute and 100 a day. The defaults are what a new token starts with. The user can raise or lower
any of them, or set it to **Unlimited**. An unlimited token is still
checked for everything else, and its calls still run one at a time per
account. Failed authentication (§3, step 6) is limited for every caller
and has no setting.

The tools:

| Tool            | Arguments                       | Needs                                                         |
| --------------- | ------------------------------- | ------------------------------------------------------------- |
| `list_accounts` | none                            | any scope (lists only the token's accounts)                   |
| `list_unread`   | `account`                       | `chat:read-unread-summary`                                    |
| `read_chat`     | `account`, `chat?`, `messages?` | `chat:read-active`, and `chat:open` when `chat` is given      |
| `read_draft`    | `account`                       | `composer:read-draft`                                         |
| `write_draft`   | `account`, `chat?`, `text`      | `composer:insert-draft`, and `chat:open` when `chat` is given |
| `send_message`  | `account`, `chat`, `text`       | `messages:send`                                               |

`send_message` checks the token and the allowlist; opens the chat and
checks its header names that chat; **refuses with `composer_busy` if the
message box holds anything** (it never overwrites or sends what the user
is typing); counts the send against the limits; puts the text in; and
presses Enter. A send that fails leaves its text in the box, so the next
one waits for the user. Text only, at most 4096 characters, to chats
that already exist in the chat list: no new numbers, no attachments, no
broadcasts.

### 6. The UI

All text lives in `en.json` under `agents` (ADR 0012).

**Settings › Agents**, a new section after Assistant:

- **Let AI agents connect**, off by default, whose description says what
  it means: programs on this computer holding a token can read and write
  in the chats you allow, and, if you let them, send.
- The address, `http://127.0.0.1:<port>/mcp`, with **Copy**, or why
  YapYap is not listening, with **Pick Another Port**.
- **Tokens**: each token's name; its scopes, accounts and chats as chips,
  sending in red, each with a button that takes it away (narrowing);
  its limits, expiry and last use; and **Revoke**.
- **Recent activity**: the last 500 calls, newest first: time, token,
  tool, account and the result. Never message text, drafts, chat names or
  phone numbers (rule 9). It is kept in memory only, until YapYap quits.

**Create a Token…** opens a form in the section:

1. **Name.**
2. **Accounts**: checkboxes.
3. **What it can do**, with presets **Read Only** and **Read and Draft**,
   then one checkbox per scope with its sentence from §5. **Send
   messages** sits in its own red-bordered box, unchecked. Ticking it
   warns that a message someone sends you can trick an agent into sending
   things, and that WhatsApp may ban numbers that send automatically. It
   also switches the chats to **Only these chats** and caps the expiry at
   30 days.
4. **Chats**: **All chats** or **Only these chats**. A chat is added by
   its exact name or with **Add the Open Chat**.
5. **Limits**: each starts at its default from §5 and has a number field
   and an **Unlimited** checkbox. Choosing **Unlimited** for sending shows
   that nothing will slow a hijacked agent down but the chats it may reach.
   For send, also **Notify me each time it sends**.
6. **Expires**.
7. **Create Token**, which shows the token once with **Copy**, a ready
   command for Claude Code
   (`claude mcp add --transport http yapyap http://127.0.0.1:<port>/mcp --header "Authorization: Bearer <token>"`)
   and the header for other clients. Chrome pages cannot use the
   clipboard, so **Copy** goes through the main process.

**While agents work.** While the server is on, the tray has **Stop AI
Agents**, which turns it off and closes the listener immediately. A send
notifies by default (“`<token> sent a message to <chat>.`”). Revoking a token
refuses its next request.

### 7. What changes elsewhere

- `no-endpoint.test.ts` allows `node:http` and `.listen(` in
  `src/main/agents/listener.ts` alone, and checks it binds `127.0.0.1`
  only.
- Rule 8 of `CLAUDE.md`: nothing sends a message for the user, except the
  MCP server for a token with `messages:send`. ADR 0013 and ADR 0017 do
  not change: the assistant never sends.
- The adapter gains opening a chat by name (`adapter/open-chat.ts`),
  which presses the chat list row whose title is that name. WhatsApp's
  chat list is virtualized, holding only the rows near what is on screen,
  so YapYap looks from the top of the list and, while the chat is not
  there, scrolls down most of a screen to load the next rows, for at most
  60 screens; it then puts the list back at its top. It scrolls the
  nearest box around a chat row that overflows and may scroll, since
  which box that is is a layout detail, falling back to `#pane-side`. It reuses the
  `chatList`, `chatRow` and `chatTitle` landmarks, so `LANDMARKS_VERSION`
  stays. The
  fake page opens a chat when its row is pressed. Sending reuses the
  assistant bar's Enter. Tests never touch a real account (rule 3).
- ADR 0008 logs C47.

### Out of scope

Push notifications of new messages (agents poll `list_unread`), reading
more than the last N messages of a chat, attachments, new chats or numbers,
groups and calls, and MCP over stdio.

## Consequences

- Agents get a standard way into WhatsApp, which the user switches on per
  install, per token, per account and per chat, and off in one click.
- YapYap is no longer an app that listens on nothing. The listener is one
  file, off by default, loopback only, with every request authenticated
  before the SDK parses it.
- Sending without a click is possible. A hijacked agent can send, but only
  to the chats on its token, as fast as its limits allow (with no cap if the
  user chose **Unlimited**), until the token expires or is revoked, with a
  notification each time by default. The allowlist is the main limit on
  damage; the UI has to make that clear.
- Users who turn sending on risk WhatsApp banning their number. Settings
  and the token form say so; YapYap cannot prevent it.
- Three new runtime packages in the main process: the MCP project's
  server and core, and Zod. Their updates come through Dependabot like any
  other.
- New code tested to 100%: the request checks (with a property test for
  `Origin`), the real listener on a free port, tokens, every tool through
  the SDK, Settings' section and form, the adapter's opener, and E2E tests
  that create a token in Settings, call the server over HTTP and send in
  the fake page.
