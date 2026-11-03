# Headless mode

`yapyap --headless` runs YapYap with no window, tray or dialog. On Linux it
needs no X11 or Wayland at all, so it runs on a home server or in a
container. Scripts and AI agents use it through the
[MCP server](/guide/ai-agents), which is on for the whole run.

## Start it

```bash
yapyap --headless
```

YapYap uses the same profile, accounts and settings as when it runs on the
desktop, and only one YapYap runs per profile: a headless launch while
YapYap is open hands over to it and quits. To keep a headless YapYap apart,
give it a profile of its own with `--user-data-dir=<folder>`.

Once it listens, YapYap writes the address agents connect to:

```text
AI agents connect to http://127.0.0.1:51234/mcp
```

Ctrl+C, `SIGTERM` or shutting the computer down quits YapYap, and with it
the MCP server. While it runs, the server is on whatever **Settings ›
Agents** says, and the setting is left as it was.

## Link an account

An account that is not linked shows WhatsApp's QR code in the terminal:

1. Start `yapyap --headless` in a terminal.
2. On your phone, open WhatsApp and go to **Settings › Linked devices ›
   Link a device**.
3. Scan the code in the terminal. WhatsApp changes it about every 20
   seconds, and YapYap shows each new one.

YapYap says when the account is linked. With several accounts, each code is
headed by the account's name.

The code is shown only in a terminal. When the output goes to a file or a
service manager's log, YapYap writes that the account is not linked
instead, and never the code. Link it once from a terminal; the account stays
linked when YapYap later runs as a service.

## Tokens

Agents and scripts need a token from **Settings › Agents** (see
[create a token](/guide/ai-agents#create-a-token)). Tokens cannot be created
from the terminal yet, so create the first one in a desktop session on the
same profile.

## What it leaves out

Headless, YapYap shows no tray, welcome, update notice or crash report,
since nobody could answer them. Update it the way you installed it. It
still refuses to start without Chromium's sandbox, and says why in its log.
