# Privacy

YapYap is a desktop shell around the official WhatsApp Web. Your messages
travel between WhatsApp Web and WhatsApp's servers exactly as they do in a
browser. YapYap does not read, copy or upload them.

- **No telemetry.** YapYap collects no analytics, usage statistics or
  identifiers of any kind. An automated test runs a whole session behind a
  proxy that refuses and records every request leaving your computer, and
  fails if there is even one. The AppImage, the Windows installer and signed
  macOS builds update themselves: once at startup and then daily they read
  the latest release's metadata from GitHub, download a newer version in the
  background, verify it, and install it only when you agree to restart. The Windows
  portable build and unsigned macOS builds, which cannot update themselves,
  ask GitHub for the latest release once a day (a plain request to
  `api.github.com`, with nothing about you in it) and tell you when there is
  a new one; installs from Flatpak, DEB, RPM and the AUR never ask.
- **No hidden downloads.** Chromium normally fetches a spelling dictionary
  from Google whenever a window opens, which tells Google your language and
  your IP address. YapYap stops that, so spell checking is off until you
  turn it on under Settings → Spelling. Then, on Windows and Linux,
  Chromium downloads the dictionary for your language from Google once;
  macOS uses its own spell checker and downloads nothing. Words you add to
  the dictionary stay in YapYap's data folder.
- **Passwords stay encrypted.** A proxy password you ask YapYap to remember
  is encrypted with your system's keychain (Keychain on macOS, DPAPI on
  Windows, the Secret Service or KWallet on Linux) and kept in
  `secrets.json`, never in the settings or the logs. Without a keychain,
  YapYap keeps nothing and asks each time.
- **The AI assistant sends only what you ask it to, where you chose.** It
  reads a chat only after you allow it there, and you can see exactly what
  it sends first with **What is sent?**. With the private model or a model
  server on your computer, nothing leaves your computer. With Claude or
  OpenAI, what you ask about goes to `api.anthropic.com` or
  `api.openai.com`, with your own key; YapYap refuses every other address
  for the assistant. The private model downloads from Hugging Face once,
  on your click. Nothing of it is logged. See [AI assistant](./guide/ai-assistant.md).
- **Logs stay local and are redacted.** YapYap never logs message content.
  Before a line is written, phone numbers, email addresses, tokens and your
  home folder are replaced with placeholders. Logs live in the `logs` folder
  of YapYap's data folder. Each launch starts a new file, and a file is also
  rotated at 1 MB. At most five old files are kept, and they are deleted
  after 14 days.
- **Profile photos stay in memory.** The sidebar shows each account's own
  WhatsApp profile photo. YapYap downloads it from WhatsApp with that
  account's session, keeps a small copy in memory only, and never saves or
  logs it.
- **Chats stay unread while YapYap is hidden.** When YapYap is hidden or
  minimized, WhatsApp sees its page as hidden and does not mark new messages
  in the open chat as read. Turn off **Keep chats unread while YapYap is
  hidden** in Settings → Privacy if you prefer the open chat to keep reading.
- **AI agents connect only if you let them.** YapYap listens for no
  connection unless you turn on **Let AI agents connect** in Settings →
  Agents. Then it listens on `127.0.0.1` alone, so only programs on your
  computer can reach it, and each needs a token you create. Your chats go
  to an agent only as its token allows, and from there to wherever that
  agent sends them. YapYap keeps only a fingerprint of each token, the
  chats it lists as fingerprints, and what agents did until it quits,
  never what they read or wrote. See [AI agents](guide/ai-agents.md).
- **Crash reports are opt-in.** They are off unless you turn on **Crash
  reports** in Settings → Privacy. Then, after YapYap closes unexpectedly, it
  saves a plain-text report in its data folder (`crash-report.txt`): the
  version, operating system and graphics details, and the end of the
  previous session's log, which is already redacted, under a short
  fingerprint that names the crash without revealing anything. It keeps one
  report, for at most 30 days. It never saves memory dumps, which could
  contain messages, and removes any that Chromium leaves behind at every
  start. With **Keep a report and offer to review it**, YapYap shows you
  the whole report at the next launch.
  Nothing is sent: **Report on GitHub** only opens a prefilled bug report in
  your browser, for you to read, edit and submit yourself.
- **Performance traces are on request.** **Help → Record a Performance
  Trace…** records 10 seconds of timing data only after you agree, and
  saves it where you choose. It holds page and file addresses, never
  messages, memory dumps or screenshots, and YapYap never sends it.
- **Download counts come from the stores, not the app.** The download
  count on this site and in the README is GitHub's own count of how often
  each release's installers and packages were downloaded, summed once a
  day. YapYap itself reports nothing, and this site shows the count
  without asking any third party.

## What YapYap stores

Everything below lives in YapYap's profile folder, which is
`~/.config/YapYap` on Linux, `~/.var/app/org.guita.YapYap/config/YapYap` in
the Flatpak, `%APPDATA%\YapYap` on Windows and
`~/Library/Application Support/YapYap` on macOS. Nothing in it leaves your
computer. Uninstalling YapYap leaves the folder in place, so your accounts
survive a reinstall.

### WhatsApp

| Path                   | What it holds                                                                                                         | How to delete it                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Partitions/account-…` | What WhatsApp Web keeps in a browser for each account: its login, the chats and media it caches, and its own settings | **Remove Account…** deletes it all. **Reset Session…** logs the account out and deletes it. **Clear Cache and Reload** deletes only the cache |
| `accounts.json`        | Each account's name, color, whether it is on or muted, and its own proxy address                                      | **Remove Account…** deletes the account's entry                                                                                               |

Camera and microphone choices are kept in memory only, until YapYap quits
or you choose **Ask Again for Camera and Microphone**. Words you add to the
spelling dictionary are kept with the account's data.

### YapYap

| Path                                 | What it holds                                                                                                                                                              | How to delete it                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `settings.json`, `settings.json.bak` | Your settings, and the copy before the last change. Never passwords                                                                                                        | Delete both while YapYap is closed to go back to the defaults           |
| `settings.corrupt-….json`            | A settings file YapYap could not read, set aside for you to inspect                                                                                                        | Delete it at any time                                                   |
| `secrets.json`                       | Proxy passwords you chose to remember, the assistant's API keys, and the names of the chats you allowed it or an agent's token in, all encrypted by your system's keychain | Delete it while YapYap is closed; YapYap asks again                     |
| `assistant.json`                     | Which private model you chose and whether it is all downloaded                                                                                                             | Delete it while YapYap is closed                                        |
| `assistant-chats.json`               | For each account, a fingerprint (SHA-256) of the name of each chat you allowed the assistant in, never the name                                                            | **Remove** in Settings → Assistant, or delete it while YapYap is closed |
| `agent-tokens.json`                  | For each agent token, a fingerprint (SHA-256) of the token, what it allows, and fingerprints of the chats it lists, never their names or numbers                           | **Revoke** in Settings → Agents, or delete it while YapYap is closed    |
| `models/`                            | The private model, once downloaded, and a download in progress                                                                                                             | **Remove** in Settings → Assistant                                      |
| `custom-code.json`                   | Your custom CSS and JavaScript                                                                                                                                             | Clear the snippets in **Custom CSS and JavaScript…**                    |
| `window-state.json`                  | Where the main window was, so it reopens there                                                                                                                             | Delete it at any time                                                   |
| `chat-list.json`                     | How wide each account's chat list is, if you changed it                                                                                                                    | Delete it at any time                                                   |
| `downloads.json`                     | The folder you last saved a download to                                                                                                                                    | Delete it at any time                                                   |
| `gpu-crashes.json`                   | The times of recent graphics crashes, which turn on the safe graphics fallback                                                                                             | Delete it at any time                                                   |
| `running.json`                       | The version and start time of the running session, left behind only if YapYap did not quit cleanly                                                                         | YapYap deletes it when it quits                                         |
| `crash-report.txt`                   | With crash reports on, the report of the last unclean exit                                                                                                                 | YapYap deletes it after 30 days; delete it yourself at any time         |
| `logs/`                              | Redacted logs                                                                                                                                                              | YapYap deletes them after 14 days; delete them yourself at any time     |
| `Dictionaries/`                      | Spelling dictionaries downloaded once you turned spell checking on                                                                                                         | Delete it while YapYap is closed                                        |

### Everything else

The remaining files and folders are Chromium's own caches and state. YapYap
deletes memory dumps Chromium leaves behind at every start.

YapYap writes outside its profile folder only where you tell it to:
downloads, performance traces and exported settings.

To remove everything, quit YapYap and delete its profile folder. This logs
every account out of WhatsApp; your chats stay on your phone.
