# User guide

New to YapYap? [Get started](/guide/get-started) in six short steps.

YapYap wraps the official [WhatsApp Web](https://web.whatsapp.com) in a
hardened desktop app. Link it like any other device: open YapYap, then on
your phone open **WhatsApp → Linked devices → Link a device** and scan the
QR code.

::: tip Each account uses a linked-device slot
WhatsApp limits how many devices can be linked to one phone number. Every
account you add in YapYap uses one of those slots.
:::

::: tip Early days
YapYap is young and not yet at 1.0, and the
[changelog](https://github.com/vascoguita/yapyap/blob/master/CHANGELOG.md)
lists what each release changed. Report anything that goes wrong
as described in [Troubleshooting](/guide/troubleshooting#diagnostics), and
follow what comes next on the
[project board](https://github.com/users/vascoguita/projects/5).
:::

## First launch

The first time YapYap starts, a short welcome asks for the choices most
people make at once: where the AI assistant thinks, the theme, whether
closing the window keeps YapYap in the tray, starting at login, and how much
notifications show. Each choice
applies as you make it; press <kbd>Esc</kbd> or **Start Using YapYap** when
you are done. Everything it asks is also in Settings.

## AI assistant

YapYap's built-in assistant helps you write, right above the message box: it
suggests replies, writes the message you describe, rewrites your draft,
sums up a chat, and catches you up on unread chats. It runs a private model
on your computer, a model server you already run, or Claude or OpenAI with
your own key. It reads a chat only once you allow it there, and never sends
a message on its own. The [AI assistant guide](/guide/ai-assistant) covers
setting it up and every choice.

## AI agents

AI agents such as Claude Code can connect to YapYap over MCP, once you turn
on **Let AI agents connect** in Settings → Agents. Each agent needs a token
you create, which says which accounts and chats it may use, and whether it
may only read, write drafts or also send. See
[AI agents (MCP)](/guide/ai-agents).

## Settings

Open **File → Settings…** (on macOS, **YapYap → Settings…**), or press
<kbd>Ctrl</kbd>+<kbd>,</kbd> (<kbd>⌘</kbd>+<kbd>,</kbd> on macOS). Every
setting is a native control, so the window works fully from the keyboard,
and <kbd>Esc</kbd> closes it.

A setting that only takes effect at the next launch, such as hardware
acceleration, shows **Restart Now** once you change it. Settings are saved
the moment you change them; if the settings file is ever damaged, YapYap
starts with the last good copy and tells you.

To move your settings to another computer, or keep a copy, use **Export
Settings…** under **Backup**, then **Import Settings…** on the other side.
The file holds only your preferences, never your WhatsApp login or chats.
YapYap checks an imported file the same way it checks its own settings, and
asks before replacing yours. It refuses a file from another version of
YapYap's settings.

## Theme

Choose **Light**, **Dark** or **Same as the system** under Settings →
Appearance. The change applies at once to YapYap's windows, their title bars
and WhatsApp itself, as long as WhatsApp's own theme (in WhatsApp's
settings) is left at **System default**. Animations are turned off when your
system asks for reduced motion.

## Graphics problems

If the window flickers, stays blank or video calls show artifacts, turn off
**Use hardware acceleration** or **Use hardware video decoding** in
Settings → Reliability, then restart.

If YapYap cannot even show its window, start it in **safe mode**, which
turns off hardware acceleration for that launch only:

- **Linux:** right-click YapYap in your app launcher and choose **Start in
  Safe Mode**, or run `yapyap --safe-mode`.
- **Windows:** run `YapYap.exe --safe-mode`.
- **macOS:** run `open -a YapYap --args --safe-mode`.

When graphics crash in three separate runs within a day, YapYap starts the next launch
without hardware acceleration on its own and tells you. **Copy Technical
Details** in About includes the graphics mode, so bug reports show it.

On Linux, YapYap runs natively on Wayland when your desktop uses it, and on
X11 otherwise. If the window is blank, blurry or in the wrong place, try the
other one with **Display backend** in Settings → Reliability, then restart.
If YapYap does not start at all, run `yapyap --ozone-platform=x11` (or
`=wayland`) once; the command line always wins over the setting. YapYap
ignores a setting whose display server is missing and uses the automatic
choice instead.

## Calls

Voice and video calls open in a window of their own, which belongs to the
account the call is in: it uses that account's login, and closes when you
hang up or when the account is turned off or removed.

The first time an account wants your microphone or camera, YapYap asks, and
on macOS the system then asks too: allow YapYap in **System Settings →
Privacy & Security** if you said no there before. In the Flatpak, the camera
is reached through your desktop's camera portal, which asks once as well.
YapYap leaves echo cancellation, noise suppression and automatic gain on, as
WhatsApp requests them.

## Screen sharing

When you share your screen in a WhatsApp call, YapYap asks what to share
before anything is captured. On Windows, X11 and macOS before 15, YapYap's
own picker lists your screens and windows with previews, and nothing is
selected until you choose. On Windows you can also tick **Also share system
audio**. On Wayland and macOS 15 and later, your system's own picker asks
instead. Cancelling, closing the picker or pressing <kbd>Esc</kbd> shares
nothing.

While you share, YapYap shows it: the tray menu starts with **Stop Sharing
Screen**, its tooltip says you are sharing, and with several accounts the
sidebar marks the sharing account with a red **Sharing** button. Either one
stops the share at once.

## Notifications

New messages show up as your system's notifications, whichever account they
arrive in. With several accounts, each notification starts with the
account's name. Clicking one brings YapYap forward, switches to that account
and opens the chat. Once an account has no unread chats left, here or on
your phone, YapYap withdraws its notifications, so your notification list
and the count on your dock clear too. They also go when YapYap quits. WhatsApp's own notification settings,
such as sounds, still apply. A notification shows the picture of the person
or group it comes from, unless you hide who wrote. The text of a
notification never leaves your computer.

On macOS and Windows you can reply from a notification: YapYap opens the
chat and puts your reply in the message box, where you check it and press
<kbd>Enter</kbd> to send it. On Linux, clicking a notification opens the
chat. Under Settings → Privacy you can hide who wrote and what they wrote, for example
when others can see your screen; hidden text never reaches the system's
notifications at all.

**Do Not Disturb**, in the tray menu, the Account menu or Settings → General,
stops all notifications and silences the sounds of accounts that are not on
screen, such as message tones and ringtones. To silence one account, use
**Mute This Account** in the Account menu or turn on **Mute this account** in
the Accounts window; the tray and the sidebar mark muted accounts. The account on screen
keeps its sound either way, so the voice messages and videos you play still
work. Unread counts keep updating, and chats you mute in WhatsApp itself
never notify.

## Custom CSS and JavaScript

**Custom CSS and JavaScript…** (beside Settings) lets you restyle WhatsApp
or add small scripts of your own. It is meant for people who write code:
anything you add here runs in WhatsApp and can read your chats, so only add
code you understand, and never paste code someone sent you.

- It stays off until you tick **Use custom CSS and JavaScript**.
- **Applies to** picks **All accounts** or one account; an account's own
  code comes after the code for all accounts.
- CSS shows in WhatsApp as you type, and is kept only when you **Save**.
- JavaScript runs each time WhatsApp loads, in a world of its own: it sees
  WhatsApp's page but not WhatsApp's own scripts. A script with a mistake
  stops only itself. Reload WhatsApp to run a change.
- The code is kept apart from your settings and never travels in an
  exported settings file.

## Accounts

YapYap can run several WhatsApp accounts side by side, such as a personal
and a work number. Each one is linked separately and keeps its own login,
cache and storage; nothing is shared between them.

- **Account → Add Account** adds one and shows its QR code to link it.
- The **Account** menu lists your accounts; pick one, or press
  <kbd>Ctrl</kbd>+<kbd>1</kbd> to <kbd>Ctrl</kbd>+<kbd>9</kbd>
  (<kbd>⌘</kbd> on macOS) to switch by position. Switching never reloads an
  account.
- With two or more accounts running, a sidebar on the left lists them with
  their unread chats, each with its WhatsApp profile photo, or its initial
  until the photo loads; click one to switch. Its arrow button, or **Compact
  account sidebar** in Settings → Appearance, shrinks it to avatars only.
  Muted accounts show a crossed-out speaker instead of a count.
- Every account keeps running in the background, so its messages keep
  arriving. The window title shows the account you see, and the unread count
  on YapYap's icon adds up all of them.
- **Account → Manage Accounts…** renames an account, gives it a color, or
  turns it off. Changes apply when you choose **Save**; <kbd>Esc</kbd> closes
  the window, asking first if you changed something. An account that is off
  keeps its login and data but receives no messages until you turn it on
  again. At least one account keeps running.
- The Accounts window also shows each running account's **Permissions**:
  whether it may use the camera and microphone until YapYap quits, or asks
  first. **Ask Again for Camera and Microphone** forgets those answers.
  Notifications are always allowed (mute the account to silence them), and
  screen sharing asks every time.
- **Remove Account…**, in the Account menu or the Accounts window, removes
  an account after asking. It logs that account out and deletes its
  WhatsApp data on this computer; its chats stay on the phone. The last
  running account cannot be removed.

Each account uses one of WhatsApp's linked-device slots for its number.

## When WhatsApp misbehaves

The **Account** menu has two maintenance actions for the account you see:

- **Clear Cache and Reload** removes WhatsApp's cached files and service
  worker, then reloads. You stay logged in, so try this first when WhatsApp
  looks broken or will not update.
- **Reset Session…** logs you out and deletes WhatsApp's data on this
  computer. YapYap asks first. Your chats stay on your phone; link this
  device again to continue.

## Chat links

Only one YapYap runs at a time: starting it again brings the open window
back. Clicking a `whatsapp://` link, or opening a `https://wa.me/` or
`https://api.whatsapp.com/send` link with YapYap, opens that chat in WhatsApp,
with any prefilled text. YapYap accepts only the phone number and the text
from these links.

## Chat with a number

To message a number that is not in your contacts, choose **Account → New
Chat with Number…**, type the number with its country code (for example
`+44 7700 900123` or `0044 7700 900123`) and choose **Open Chat**. WhatsApp
opens the chat; YapYap does not save the number.

## Window and quitting

YapYap reopens where you left it, at the same size, and maximized or full
screen if it was. If that spot is on a monitor that is no longer connected,
it opens at its default size instead.

On Windows and Linux, closing the window quits YapYap, unless you turn on
**Close to the tray** under Settings → General: then YapYap keeps running in
the tray, and notifications keep coming. **Hide the menu bar** under
Settings → Appearance hides the menu until you press <kbd>Alt</kbd>.
<kbd>Ctrl</kbd>+<kbd>,</kbd> opens Settings either way. On macOS, closing
the window keeps YapYap running, as other Mac apps do: click its Dock icon
to bring the window back, and choose **Quit** to quit.

YapYap's tray icon shows the window again; on macOS it sits in the menu bar
and opens its menu. The menu shows or hides the window, lists your running
accounts to switch to, and has **Settings…** and **Quit YapYap**. Its
tooltip shows how many chats have unread messages across all accounts, and
on macOS the number also appears next to the icon. With **Start minimized** on, YapYap opens in the
background. Some Linux desktops have no tray; there, starting YapYap again
always brings its window back.

**Tray icon** under Settings → Appearance swaps the colorful app icon for a
one-color one that matches the other icons of your panel. **Automatic**
picks a light or dark shade to stand out against the panel, following your
color scheme (on Windows, the taskbar's own setting). On macOS every
one-color choice becomes a menu bar template, which macOS colors itself.

On Linux the tray uses the StatusNotifierItem standard, which KDE Plasma,
Xfce, Cinnamon and most other desktops show on both Wayland and X11. GNOME
shows it only with the **AppIndicator and KStatusNotifierItem Support**
extension, which Ubuntu installs by default; on other GNOME systems,
install it from your distribution or extensions.gnome.org. CI tests the
tray menu's logic and that YapYap starts with a tray on Linux, but not how a
panel draws the icon, which is checked by hand before each release.

The number of chats with unread messages shows on YapYap's icon: as a badge
on the Dock on macOS, over the taskbar icon on Windows, and on the launcher
icon on Linux desktops that support counts, such as Ubuntu's dock and KDE
Plasma.

**Start at login** under Settings → General starts YapYap when you log in;
together with **Start minimized** it waits in the tray. It uses your
system's login items, so removing YapYap there turns the setting off too.
In the Flatpak package, your desktop asks first whether YapYap may start
at login, and the setting changes only if you agree.

## Privacy screen

The privacy screen blurs WhatsApp so people nearby cannot read your chats.
Turn it on and off from the tray menu, or with **View → Privacy Screen**
(<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>H</kbd>, <kbd>⌘</kbd> on macOS).
While it is on, nothing behind it can be clicked. Under Settings → Privacy
it can also come on by itself: whenever another window is in front of
YapYap, until you click YapYap again, or after five minutes away from your
computer, until you are back.

## Chat list width

Drag the edge between the chat list and the open chat to make the list
wider or narrower. With the keyboard, Tab to that edge and use the left and
right arrows; <kbd>Home</kbd> and <kbd>End</kbd> go to the narrowest and the
widest. Double-click the edge, or press <kbd>Enter</kbd> on it, to go back to
WhatsApp's own width.

- Each account keeps its own width, and YapYap remembers it for next time.
- The list stays at least 240 pixels wide and takes at most 60% of the
  window, so the open chat always has room, however small the window.
- The edge is drawn by YapYap inside WhatsApp's page. If a WhatsApp update
  moves its chat list, the width may stop applying until YapYap is updated.

## Zoom

Make WhatsApp bigger or smaller with **View → Zoom In** and **Zoom Out**
(<kbd>Ctrl</kbd>+<kbd>=</kbd> and <kbd>Ctrl</kbd>+<kbd>-</kbd>, or
<kbd>⌘</kbd> on macOS), or hold <kbd>Ctrl</kbd> and scroll. Each step is 5%,
from 50% to 300%. **Actual Size** (<kbd>Ctrl</kbd>+<kbd>0</kbd>) goes back to
100%. YapYap remembers the level for next time. **Interface scale** in
Settings → Appearance offers the common sizes from 50% to 200%.

If a touchpad pinch zooms by accident, turn off **Zoom with a pinch, or Ctrl
and the wheel** in Settings → Appearance; the View menu and its shortcuts
still zoom.

## Proxy

By default YapYap connects the way your system is set up, proxy included,
unless you start it with one of Chromium's proxy options (see the
[command line](reference.md#command-line)).
Under Settings → Network, **Proxy** can instead connect directly, or through
a proxy you name, such as `socks5://127.0.0.1:1080` or
`http://proxy.example.org:3128`. Update checks use the same proxy. Changes apply at once, and
connections made before them are closed. A manual proxy that has no address, or that YapYap
cannot use, blocks every connection rather than letting WhatsApp go around
it. With a manual proxy, calls also go only through it, which keeps your
address hidden but can make them slower or stop them from connecting.

When a proxy asks for a username and password, a **Sign In to the Proxy**
window names it and asks for them. Tick **Remember on this computer** to have YapYap
keep them, encrypted by your system's keychain, for next time; on a Linux
desktop without a keychain YapYap cannot keep them safely, so it asks each
time. If the proxy refuses saved details, YapYap asks again. After you cancel,
it waits a minute before asking again.

An account can also have a proxy of its own: in **Account → Manage
Accounts…**, fill in **Proxy** and save. That account then
connects only through it, calls included, while the others keep using the
proxy in Settings. Leave it empty to use Settings again.

## Copy and paste

Paste images straight into a chat: screenshots, images copied in a browser,
and on Linux image files copied in your file manager. WhatsApp cannot read
your clipboard; it can only copy to it while you are using its window, as
when you copy a message. YapYap itself only writes to the clipboard when you
click one of its **Copy** buttons.

## Spelling

Right-click in WhatsApp's message box for **Cut**, **Copy**, **Paste** and
**Select All**; right-click selected text elsewhere to copy it. Spell
checking is off at first, because on Windows and Linux it needs a dictionary
downloaded from Google (see [Privacy](/privacy)). Turn it on under
Settings → Spelling, or by ticking **Check Spelling** in the right-click menu,
which opens Settings. It checks your system's language, unless you pick
others: with spell checking on, **Languages…** in the right-click menu lists
every language YapYap has a dictionary for, searchable by its own name, its
English name or its code, and you can check up to ten at once. On macOS the
system's own spell checker picks the languages, under System Settings →
Keyboard. Right-click an underlined word for up to five suggestions, or **Add
to Dictionary** to stop YapYap from flagging it. Unticking **Check
Spelling** in the same menu turns it off at once.

## Downloads

Files you download from WhatsApp go straight to your Downloads folder, and
YapYap tells you when each one is done, or if it failed. File names are
cleaned up so they are safe on every system: folder parts and characters
Windows does not allow are removed, and a file is never replaced. A second
`photo.jpg` is saved as `photo (1).jpg`.

Under Settings → Downloads, **Save files to** → **Choose…** picks another
folder for them; if it goes away, files go to Downloads again.
**Ask where to save each file** shows the save
dialog for every download instead, starting in the folder you last chose.
**Open files when they finish downloading** opens PDFs, pictures, sound,
video and plain text in their usual app. Anything else, programs, scripts,
installers and office documents among them, is only saved, so a file
someone sends you can never start a program by itself.

**Window → Downloads…** (<kbd>Ctrl</kbd>+<kbd>J</kbd>, or <kbd>⇧</kbd><kbd>⌘</kbd><kbd>J</kbd>
on macOS) lists this session's downloads with their progress. Pause, resume
or cancel one that is still running, and show a finished one in its folder.
**Clear Finished** empties the list; the files stay where they are. YapYap
keeps the list only while it runs.

## Voice notes and videos

Voice notes, videos, GIFs and status videos play with sound in every YapYap
package, including the AppImage and Flatpak, with no extra codecs to install:
YapYap brings the ones WhatsApp needs.
