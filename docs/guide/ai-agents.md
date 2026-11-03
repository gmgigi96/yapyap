# AI agents (MCP)

AI agents such as Claude Code can connect to YapYap over MCP, the Model
Context Protocol. With a token you create, an agent can read your unread
chats and the open chat, write drafts in the message box and, only if you
allow it, send messages.

It is off until you turn it on, and it is reachable only from your own
computer: nothing on the network can connect to it.

## Turn it on

1. Open **Settings → Agents**.
2. Turn on **Let AI agents connect**. YapYap shows the address agents
   connect to, such as `http://127.0.0.1:51234/mcp`. It keeps the same
   port from then on. If another program uses it, choose **Pick Another
   Port**.
3. Choose **Create a Token…**.

## Create a token

Every agent needs a token, and each token says exactly what that agent
may do:

| Choice         | What it means                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Accounts       | The WhatsApp accounts it may use                                                                                       |
| What it can do | Read unread chats, read the open chat, open a chat it lists, read or write drafts, and send messages                   |
| Chats          | Every chat, or only the chats you list, each by name, number or both. A token that opens chats or sends must list them |
| Limits         | Calls a minute and, for sending, messages a minute and a day. Each can be **Unlimited**                                |
| Expires        | In 1, 7, 30 or 90 days, or never. A token that sends expires within 30 days                                            |

**Read Only** and **Read and Draft** set the usual choices for you. List
a chat by its name exactly as WhatsApp shows it, by its international
number (`+44 7700 900123`), or both, then choose **Add**. **Use the Open
Chat** fills in the name of the chat open in YapYap.

Give a number when you can: with it, the agent opens the chat wherever it
is in WhatsApp, archived included, through the same link as **New Chat**.
It reloads WhatsApp, so it takes a few seconds. With a name too, the agent
can find the chat when you ask it about that person, such as "send Vasco
a message".

When you choose **Create Token**, YapYap shows the token once, with the
command that adds it to Claude Code:

```bash
claude mcp add --transport http yapyap http://127.0.0.1:51234/mcp --header "Authorization: Bearer yapyap_mcp_…"
```

Copy it then: YapYap keeps only a fingerprint of the token and cannot show
it again. Other MCP clients connect over HTTP with the same
`Authorization` header.

## What agents can do

| Tool            | What it does                                                                          |
| --------------- | ------------------------------------------------------------------------------------- |
| `list_accounts` | Lists the accounts the token may use                                                  |
| `list_chats`    | Lists, or searches, the chats the token lists, with their numbers                     |
| `list_unread`   | Lists unread chats the token may reach                                                |
| `read_chat`     | Reads the open chat's latest messages, opening a listed chat first, by name or number |
| `read_draft`    | Reads what is typed in the message box                                                |
| `write_draft`   | Writes a draft in the message box, without sending it                                 |
| `send_message`  | Sends a message to a chat the token lists, by name or number                          |

When you ask an agent to message someone, it searches the token's chats
with `list_chats`. When several match, such as two people called Vasco, it
should ask you which one. YapYap never gives an agent a number you did not
list.

An agent never sees a tool its token does not allow, and YapYap checks
every call against the token, whatever the agent asks for. It never
overwrites or sends what you are typing: if the message box has
something in it, the agent has to wait.

## Sending messages

A token with **Send messages, without asking you** sends without a click.
Before you allow it, know that:

- A message someone sends you can trick an agent into sending things you
  did not want. List only the chats you trust it with: the list is what
  limits the harm.
- WhatsApp may ban numbers that send automatically.

By default YapYap notifies you each time an agent sends.

## Stay in control

- **Recent activity** in Settings → Agents lists what agents did since
  YapYap started: when, which token, which tool, in which account, and how
  it went. It never keeps what they read or wrote.
- Take a scope, account or chat away from a token with its **×**, or
  **Revoke** it. A token can only be narrowed; for more, create a new one.
- **Stop AI Agents** in the tray turns the server off at once.

The design and its security reasoning are in
[ADR 0019](../adr/0019-mcp-server.md).
