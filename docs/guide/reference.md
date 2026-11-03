# Reference

The details behind the [user guide](/guide/): every setting, where YapYap
keeps its files, and how to start it from the command line.

## Settings

Change settings in **Settings** (<kbd>Ctrl</kbd>+<kbd>,</kbd>, or
<kbd>⌘</kbd>+<kbd>,</kbd> on macOS). They are saved in `settings.json` in
the [profile folder](#files).

| Setting                                 | In the file                         | Default               | Notes                                                                                         |
| --------------------------------------- | ----------------------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| Start at login                          | `general.autostart`                 | Off                   | Follows the system's login items; in Flatpak, your desktop asks first                         |
| Start minimized                         | `general.startMinimized`            | Off                   | Opens in the tray or the Dock                                                                 |
| Get beta updates                        | `general.betaUpdates`               | Off                   | Only in builds that update or announce updates; see [betas](install.md#betas)                 |
| Do not disturb                          | `general.doNotDisturb`              | Off                   | Also in the tray and the Account menu                                                         |
| Close to the tray                       | `general.closeToTray`               | Off                   | Windows and Linux; macOS always keeps running                                                 |
| Check spelling                          | `spelling.enabled`                  | Off                   | Downloads a dictionary from Google on Windows and Linux; see [Spelling](/guide/#spelling)     |
| Spelling languages                      | `spelling.languages`                | Empty                 | Right-click → Languages…; up to ten, such as `en-GB`; empty means the system's language       |
| Theme                                   | `appearance.theme`                  | Same as the system    | `system`, `light` or `dark`                                                                   |
| Tray icon                               | `appearance.trayIcon`               | App icon              | `color`, `auto`, `light` or `dark`; one-color icons are templates on macOS                    |
| Compact account sidebar                 | `appearance.compactSidebar`         | Off                   | Avatars only; the sidebar shows with two or more accounts                                     |
| Hide the menu bar                       | `appearance.autoHideMenuBar`        | Off                   | Windows and Linux; <kbd>Alt</kbd> shows it                                                    |
| Interface scale                         | `appearance.zoom`                   | 100%                  | 50% to 200% in Settings; the View menu goes in 5% steps up to 300%                            |
| Zoom with a pinch or the wheel          | `appearance.pinchZoom`              | On                    | Off ignores pinches and Ctrl with the wheel; the View menu still zooms                        |
| Show the assistant in chats             | `assistant.enabled`                 | On                    | Off hides the assistant's bar                                                                 |
| Where the assistant thinks              | `assistant.provider`                | Automatic             | `auto`, `built-in`, `anthropic`, `openai` or `local`; see [AI assistant](/guide/ai-assistant) |
| Model                                   | `assistant.model`                   | Auto                  | `auto`, or a model's ID from the provider's list                                              |
| Suggest replies as messages arrive      | `assistant.autoSuggest`             | On                    | Only in chats you allowed the assistant in                                                    |
| Messages the assistant reads            | `assistant.messages`                | 10                    | `5`, `10` or `20` of the open chat's latest messages                                          |
| Model server address                    | `assistant.localServer`             | Empty                 | A `/v1` address on this computer; the assistant section is never exported or imported         |
| Use hardware acceleration               | `reliability.hardwareAcceleration`  | On                    | Takes effect after a restart                                                                  |
| Use hardware video decoding             | `reliability.hardwareVideoDecoding` | On                    | Takes effect after a restart                                                                  |
| Display backend                         | `reliability.displayBackend`        | Automatic             | Linux; `auto`, `wayland` or `x11`; restart                                                    |
| Disk cache size                         | `reliability.diskCacheMb`           | Automatic             | `auto`, `128`, `256`, `512` or `1024` MB; takes effect after a restart                        |
| Memory limit per page                   | `reliability.jsHeapMb`              | Automatic             | `auto`, `2048`, `4096` or `8192` MB of script memory; after a restart                         |
| Memory limit                            | `reliability.memoryWatchdogMb`      | 2048 MB               | File only; 512 to 16384; see below                                                            |
| Crash reports                           | `privacy.crashReports`              | Off                   | `off`, `local` or `ask`; see [Privacy](/privacy)                                              |
| Keep chats unread while hidden          | `privacy.unreadWhileHidden`         | On                    | WhatsApp marks nothing read while YapYap is hidden or minimized                               |
| Show who wrote in notifications         | `privacy.notificationSender`        | On                    | Off shows “WhatsApp” instead                                                                  |
| Blur when not in front                  | `privacy.blurWhenUnfocused`         | Off                   | The privacy screen covers WhatsApp while another window is in front                           |
| Blur when you are away                  | `privacy.blurWhenIdle`              | Off                   | After five minutes without using the computer                                                 |
| Show message text in notifications      | `privacy.notificationText`          | On                    | Off shows “New message”; the text never reaches the system                                    |
| Proxy                                   | `network.proxyMode`                 | Same as the system    | `system`, `direct` or `manual`; see [Proxy](/guide/#proxy)                                    |
| Proxy address                           | `network.proxyServer`               | Empty                 | With `manual`: `http://`, `https://` or `socks5://`, a host and a port                        |
| Ask where to save each file             | `downloads.askWhere`                | Off                   | Off saves to the Downloads folder; on starts the dialog in the last folder chosen             |
| Save files to                           | `downloads.folder`                  | Your Downloads folder | Set with Choose… in Settings; a folder that is gone means Downloads again                     |
| Open files when they finish downloading | `downloads.openWhenDone`            | Off                   | PDFs, pictures, sound, video and text only; nothing that could run                            |

The file also has entries for features that are not built yet. YapYap
ignores them until those features arrive, and the settings window shows a
setting only once YapYap acts on it.

YapYap checks `settings.json` every time it starts, and never fails to start
because of it. An invalid value goes back to its default. A damaged file, or
one from another version of YapYap's settings, is kept as
`settings.corrupt-<time>.json`, and YapYap restores the previous copy
(`settings.json.bak`) or, if that cannot be used either, the defaults.

### Memory limit

When WhatsApp keeps using more memory than `reliability.memoryWatchdogMb`
for two minutes, YapYap reloads it, which keeps you logged in and frees the
memory the page has piled up. It waits while you are typing or reading in
the window, so a draft is never cut off; only WhatsApp using more than one
and a half times the limit reloads regardless. The log notes the size and
the limit, nothing else.

### Saving CPU in hidden accounts

Accounts you are not looking at are throttled by Chromium, so their timers
run less often and they use little CPU. The same throttling keeps chats
unread while YapYap is hidden; turning off **Keep chats unread while
hidden** turns it off too, for every account.

## Files

Everything YapYap stores lives in one profile folder:

| System  | Profile folder                              |
| ------- | ------------------------------------------- |
| Linux   | `~/.config/YapYap`                          |
| Flatpak | `~/.var/app/org.guita.YapYap/config/YapYap` |
| Windows | `%APPDATA%\YapYap`                          |
| macOS   | `~/Library/Application Support/YapYap`      |

The [privacy page](/privacy#what-yapyap-stores) lists every file in it,
what each holds and how to delete it. Deleting the profile folder while
YapYap is closed resets YapYap completely and logs you out of WhatsApp.

## Command line

| Option                                                                                                | Effect                                                                                                                           |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `--headless`                                                                                          | Runs with no window, tray or dialog, and on Linux with no display, with the MCP server on (see [headless mode](/guide/headless)) |
| `--safe-mode`                                                                                         | Starts without hardware acceleration, for this launch only (see [graphics problems](/guide/#graphics-problems))                  |
| `--ozone-platform=wayland` or `=x11`                                                                  | Linux: uses that display backend for this launch, over the setting and `ELECTRON_OZONE_PLATFORM_HINT`                            |
| `--proxy-server=<proxy>`, `--proxy-bypass-list=<hosts>`, `--proxy-pac-url=<url>`, `--no-proxy-server` | Chromium's proxy options: used for this launch while Settings → Network → Proxy follows the system                               |
| A chat link                                                                                           | Opens that chat, for example `yapyap "https://wa.me/15551234567?text=Hi"` (see [chat links](#chat-links))                        |

The executable is `yapyap` on Linux and `YapYap.exe` on Windows. On macOS,
pass options with `open -a YapYap --args <options>`.

YapYap refuses to start with Chromium's `--no-sandbox` option or the
`ELECTRON_DISABLE_SANDBOX` environment variable, because they remove the
protection between WhatsApp Web and your computer.
[Troubleshooting](/guide/troubleshooting#sandbox) explains what to do if
your system triggers this.

YapYap reads no environment variables of its own. `YAPYAP_TEST_WHATSAPP_ORIGIN`
exists only for YapYap's automated tests. It points YapYap at a local fake
WhatsApp page and accepts only loopback `http` addresses.

## Chat links

YapYap registers itself for `whatsapp:` links and opens these forms in the
matching chat:

| Link                                                       | Opens                                |
| ---------------------------------------------------------- | ------------------------------------ |
| `whatsapp://send?phone=<number>&text=<text>`               | The chat with that number, prefilled |
| `https://wa.me/<number>?text=<text>`                       | The chat with that number, prefilled |
| `https://api.whatsapp.com/send?phone=<number>&text=<text>` | The chat with that number, prefilled |

The phone number and the text are optional. YapYap keeps only those two
values and drops everything else in the link. Starting YapYap while it is
already running passes the link to the open window.

## Keyboard shortcuts

**Help → Keyboard Shortcuts…** (<kbd>Ctrl</kbd>+<kbd>/</kbd>, <kbd>⌘</kbd><kbd>/</kbd>
on macOS) lists every shortcut with the keys of your system. **Change** next to one
waits for the new keys: press them, or Escape to keep the old ones. YapYap
refuses keys another action already uses, and keys without Ctrl, Alt,
Shift or ⌘, unless they are a function key. **Reset** goes back to YapYap's own keys.
Switching accounts keeps its digits: give it keys ending in 1, and 2 to 9
follow.

Under **From any app**, **Show or hide YapYap** works while you use other
apps. It has no keys until you give it some; **Remove** gives them back.
If another app already holds the keys, or your system does not let apps use
keys everywhere (as on some Wayland desktops), the window says so.

On macOS, use <kbd>⌘</kbd> where this table says <kbd>Ctrl</kbd>, unless it
names other keys.

| Shortcut                                                                                                | Action                                                      |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| <kbd>Ctrl</kbd>+<kbd>,</kbd>                                                                            | Open Settings                                               |
| <kbd>Ctrl</kbd>+<kbd>/</kbd>                                                                            | Show these shortcuts                                        |
| <kbd>Ctrl</kbd>+<kbd>1</kbd>                                                                            | Switch to the first account; 2 to 9 switch to the next ones |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>H</kbd>                                                           | Turn the privacy screen on or off                           |
| <kbd>Ctrl</kbd>+<kbd>=</kbd>                                                                            | Zoom in                                                     |
| <kbd>Ctrl</kbd>+<kbd>-</kbd>                                                                            | Zoom out                                                    |
| <kbd>Ctrl</kbd>+<kbd>0</kbd>                                                                            | Actual size                                                 |
| <kbd>Ctrl</kbd>+<kbd>R</kbd>                                                                            | Reload WhatsApp                                             |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>                                                           | Reload WhatsApp, bypassing the cache                        |
| <kbd>F11</kbd> (macOS: <kbd>⌃</kbd><kbd>⌘</kbd><kbd>F</kbd>)                                            | Full screen                                                 |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd> (macOS: <kbd>⌥</kbd><kbd>⌘</kbd><kbd>I</kbd>)             | Developer tools                                             |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd>                                                                            | Undo                                                        |
| <kbd>Ctrl</kbd>+<kbd>Y</kbd> (macOS: <kbd>⇧</kbd><kbd>⌘</kbd><kbd>Z</kbd>)                              | Redo                                                        |
| <kbd>Ctrl</kbd>+<kbd>X</kbd>                                                                            | Cut                                                         |
| <kbd>Ctrl</kbd>+<kbd>C</kbd>                                                                            | Copy                                                        |
| <kbd>Ctrl</kbd>+<kbd>V</kbd>                                                                            | Paste                                                       |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> (macOS: <kbd>⌥</kbd><kbd>⇧</kbd><kbd>⌘</kbd><kbd>V</kbd>) | Paste as plain text                                         |
| <kbd>Ctrl</kbd>+<kbd>A</kbd>                                                                            | Select all                                                  |
| <kbd>Ctrl</kbd>+<kbd>M</kbd>                                                                            | Minimize the window                                         |
| <kbd>Ctrl</kbd>+<kbd>W</kbd>                                                                            | Close the window                                            |
| <kbd>Ctrl</kbd>+<kbd>J</kbd> (macOS: <kbd>⇧</kbd><kbd>⌘</kbd><kbd>J</kbd>)                              | Show downloads                                              |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Y</kbd>                                                           | Suggest replies in the open chat                            |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>                                                           | Summarize the open chat                                     |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>U</kbd>                                                           | Catch up on unread chats                                    |
| <kbd>⌘</kbd><kbd>H</kbd> (macOS)                                                                        | Hide YapYap                                                 |
| <kbd>Ctrl</kbd>+<kbd>Q</kbd> (not on Windows)                                                           | Quit YapYap                                                 |
| <kbd>Alt</kbd>                                                                                          | Show a hidden menu bar (Windows and Linux)                  |
