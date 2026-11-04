# FAQ

## Can using YapYap get my WhatsApp account banned? {#account-safety}

YapYap is a desktop window for the official WhatsApp Web, the same page you
would open in Chrome. It loads `https://web.whatsapp.com` unchanged, on
Chromium, and identifies itself as the Chrome version it is built on. On
its own, it never sends messages or acts on WhatsApp for you. The AI
assistant only writes drafts, and a message goes out only when you send it.
An [AI agent](/guide/ai-agents) you connect sends only with a token that
allows it, and WhatsApp may ban numbers that send automatically.

YapYap is not made by WhatsApp or Meta, and nobody but WhatsApp can promise
what WhatsApp will do. What YapYap can promise is that it behaves like a
browser tab you use by hand. Custom JavaScript you add yourself runs inside
WhatsApp Web, so keep it to changes of appearance.

## Is YapYap made by WhatsApp or Meta?

No. YapYap is an independent, open-source project under the MIT license. It
is not affiliated with, endorsed by or sponsored by WhatsApp or Meta.

## Does my phone need to stay online?

No. YapYap is a linked device, like WhatsApp Web in a browser, and keeps
working while your phone is off or offline. WhatsApp logs linked devices
out when the phone has not been used for a long time; open WhatsApp on your
phone now and then.

## Why are there no call buttons? {#calls}

Calls in WhatsApp Web depend on WhatsApp, which turns features on for
accounts and browsers gradually. When WhatsApp Web offers calls to your
account, YapYap supports them: they open in a window of their own (see
[Calls](/guide/#calls)). When it does not, YapYap cannot add them, since
YapYap shows WhatsApp Web exactly as WhatsApp serves it.

## Where are my locked chats? {#locked-chats}

Locked chats follow WhatsApp's rules for linked devices, not YapYap's.
WhatsApp Web may hide them, or ask for the secret code you set on your
phone before showing them, depending on what WhatsApp has rolled out to your
account. YapYap shows what WhatsApp Web shows and neither hides nor reveals
anything more. To change which chats are locked, use WhatsApp on your
phone.

## How many accounts can I add?

Up to 32, each in its own isolated session (see
[Accounts](/guide/#accounts)). Each account counts as one of the linked
devices WhatsApp allows for that phone number.

## Does YapYap collect data about me?

No. YapYap has no telemetry and sends nothing about you anywhere. The
[privacy page](/privacy) lists everything it keeps on your computer and how
to delete it.

## Does the AI assistant read my chats? {#assistant-privacy}

Only chats you allow it in: the first time you ask for something in a chat,
it shows exactly what it would send and waits for **Allow here**. **Catch up**
reads only the chat list's previews, shows them, and sends them once when you
click **Send**. With the private model or a model server on your computer,
nothing leaves your computer; with Claude or OpenAI, that text goes to the
service you chose, with your own key. See the
[AI assistant guide](/guide/ai-assistant).

## Something is broken. What should I try first?

Use **Clear Cache and Reload** in the Account menu, which keeps you logged
in (see [When WhatsApp misbehaves](/guide/#when-whatsapp-misbehaves)). If
YapYap itself misbehaves, [Troubleshooting](/guide/troubleshooting) explains
how to collect diagnostics and report the problem.
