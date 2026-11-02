# 0011. WhatsApp notifications

- Status: Accepted
- Date: 2026-10-23

## Context

WhatsApp Web announces new messages with the Web Notifications API
(`new Notification(title, options)`). Chromium shows those notifications
itself, so YapYap never sees them: it cannot say which account a
notification belongs to, switch to that account when the user clicks it,
honour do-not-disturb (#61) or the privacy options (#62), or withdraw
notifications when YapYap quits. Electron offers no hook for web
notifications in the main process.

## Decision

- WhatsApp's views get one preload, `src/preload/whatsapp/`. With
  `contextBridge.executeInMainWorld` it replaces the page's `Notification`
  with a stand-in before any page script runs. The stand-in behaves like the
  Web API (permission `granted`, `requestPermission`, `close`, `onclick`,
  `click` and `close` events) and forwards each notification as plain data.
- The bridge it uses, exposed with `contextBridge.exposeInMainWorld`, has
  three operations and nothing else: show a notification (an ID, title, body,
  tag, picture address and silent flag, all strings or booleans), close one, and listen for
  clicks on them. The page can call them, which gives it no more than the
  Web API already did.
- The main process accepts these messages only from a registered WhatsApp
  view's main frame on WhatsApp's origin, checks every field's type and
  length, and drops anything else. At most 30 notifications a minute are
  shown per account; the rest are dropped and counted in the log, never with
  their content.
- The main process shows a native notification for the page. With more than
  one account, the account's name heads the notification.
- The chat's picture (#572, C46 in ADR 0008) comes as the address the page
  names, never as image data. The main process fetches it only under the
  rules for the account's own photo (ADR 0001): HTTPS from `*.whatsapp.net`
  or WhatsApp's origin, on the account's session, at most 2 MB, shrunk to a
  64-pixel copy. It fetches only for a notification that passed
  do-not-disturb, mute and the rate limit and whose sender is shown, since
  the picture tells who wrote. A notification waits at most 1.5 s for its
  picture, and one the page closes or replaces meanwhile never shows. The
  last 50 pictures stay in memory, so a chat's picture is fetched once;
  nothing stores or logs a picture or its address. Any other address, or a
  picture that does not come, leaves YapYap's own icon.
- Clicking a notification brings the window forward, switches to its account
  and tells the page, whose stand-in fires `click`, so WhatsApp opens the
  chat itself. When WhatsApp closes a notification, for example because the
  chat was read on the phone, YapYap withdraws it. Removing an account and
  quitting withdraw all of its notifications.
- Notification text is message content: it is never logged, stored or sent
  anywhere but to the system's notification service.
- If the system has no notification service, YapYap logs that once and keeps
  trying for later notifications, so notifications return when the service
  does.
- Do not disturb and muting an account (#61) drop that account's
  notifications before the rate limit, so they never reach the system. They
  also mute the page's audio, which carries WhatsApp's message tones and
  ringtones, except for the account on screen (ADR 0008, C20).

## Replies (#60)

On macOS and Windows, notifications offer an inline reply. A reply does
what a click does (brings the window forward, switches to the account and
lets WhatsApp open the chat), then waits up to about three seconds for
WhatsApp's message box, focuses it through the adapter (`FOCUS_COMPOSER`,
which reports only whether it found the box) and types the reply there
with `insertText`. YapYap never sends it: the user sees the chat it is in
and sends it themselves (ADR 0008, C22). The reply is message content, so
it is never logged. Linux has no inline reply, so a click opens the chat.

## Screen shares (#161)

The same preload installs a second stand-in, for screen capture. It wraps
`getDisplayMedia`, and `getUserMedia` when it asks for Chromium's legacy
desktop source, and reports only a random ID when a share starts and when
its last video track has ended (checked twice a second while it runs,
since stopping a track fires no event). The stream never leaves the page.
The main process hears these reports only from a WhatsApp page or call
window of an account, on WhatsApp's origin, and the tray and the sidebar
show each running share with a Stop action, which asks the page to stop
the share's tracks. A page that goes away takes its shares with it. Call
windows get the WhatsApp preload too, so both stand-ins run there.

## Consequences

- YapYap now owns how notifications look and behave, which do-not-disturb,
  per-account mute and privacy options build on.
- WhatsApp's own notification sound settings still apply, through the
  `silent` flag.
- A WhatsApp change to how it shows notifications (for example moving to a
  service worker's `showNotification`) would bypass the stand-in; the fake
  page and the E2E tests cover the Web API path WhatsApp uses today.
- The preload is the first code YapYap runs in WhatsApp's main world. It
  stays minimal and is reviewed as security-critical, like the IPC handlers.
