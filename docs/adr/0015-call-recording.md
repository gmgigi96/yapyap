# 0015. Call recording

- Status: Superseded by [0018](0018-no-extensions.md)
- Date: 2026-10-27

## Context

People ask for a way to record WhatsApp calls on their computer (#392),
and the maintainer chose to offer it with safeguards, through an official
extension (#393). Recording a call is sensitive: in many places it is legal
only with everyone's consent, a recording holds other people's voices, and
a hostile extension that could record silently would be a wiretap.

WhatsApp Web runs a call in a window of its own, opened by the account's
page on the account's session (#67). ADR 0001 keeps YapYap's code out of
WhatsApp's page, and ADR 0004 gives extensions no way to reach it.

## Decision

1. **YapYap records; extensions only ask.** A new capability, `calls:record`,
   granted per account, lets an extension ask YapYap to record the call on
   screen and to stop. The extension never receives audio, file names or
   paths, and cannot start a recording on its own (see 3).
2. **The capture point is the call window's own audio, not the system's.**
   A hidden recorder page, in the chrome zone on an in-memory partition of
   its own with every network request refused, asks for display media. The
   main process answers only that page, only while a recording the user
   started is pending, with the audio of the call window's main frame
   (`setDisplayMediaRequestHandler` with a `WebFrameMain` as the audio
   source), and stops the video track it must also take. The recorder adds
   the user's default microphone, mixes both with Web Audio, and encodes
   them with `MediaRecorder` (Opus in WebM by default). Nothing is injected
   into WhatsApp's page, and other apps' sound is never captured. The first
   implementation step checks frame audio capture on Linux, Windows and
   macOS; where it does not work, recording is not offered there, rather
   than falling back to the whole system's sound.
3. **Each recording starts from the user's click in YapYap.** An extension's
   request makes YapYap show a bar of its own in the call window, saying
   which extension wants to record this call, with **Record** and **Cancel**.
   Recording starts only on **Record**, for that call only. Nothing records
   automatically, and an extension asking repeatedly is rate-limited like any
   other call (ADR 0004).
4. **Consent comes first.** Before the first recording, YapYap asks the
   user to confirm that they know the law where they and the other people
   are may require everyone's consent, and that they will ask for it.
   YapYap keeps that answer, and asks again when its wording changes.
5. **Recording is always visible and one click stops it.** While it runs, a
   red recording mark with the elapsed time shows in the call window's bar,
   on the account in the sidebar, and in the tray icon and its menu, each
   with **Stop Recording**. YapYap stops the recording when the call window
   closes, the account is switched or removed, the main window closes, or
   YapYap quits, and after four hours at most.
6. **Files stay on this computer.** The recorder streams the encoded audio
   to the main process, which writes it to a temporary file in the folder
   the user chose and renames it when the recording stops. The name holds
   only the date and time (`YapYap call 2026-10-27 14.05.webm`), never a
   contact's name, which is page text. Nothing is uploaded or logged except
   that a recording started and stopped. Extensions can list recordings by an
   opaque ID, date and length, and ask YapYap to show one in the folder;
   YapYap does that itself.

## Consequences

- ADR 0004 gains `calls:record`, the first capability whose effect needs a
  click in YapYap's own interface every time.
- ADR 0001 gains one display-media answer that is not a user pick: frame
  audio for YapYap's own recorder, only after the user's **Record** click.
  WhatsApp's own screen sharing still always needs the user's pick.
- Tests use the fake WhatsApp page with a fake call that plays a tone, and
  Chromium's fake microphone, so no real call is ever recorded.
- Follow-up work: the capability and recorder (#392), and the official
  call recorder extension (#393).

## Amendment (2026-10-28)

Building the recorder (#392) changed three details; the decision stands.

- **The prompt is a small window of YapYap's own, attached to the call
  window**, not a bar inside it: WhatsApp's call window is WhatsApp's page,
  and YapYap draws nothing into it (ADR 0001). The window names the extension,
  offers **Record** and **Cancel**, and, while recording, shows the
  elapsed time and **Stop**.
- **The recorder page runs on the chrome session**, hidden, under the
  chrome CSP, which loads nothing from the network. The session guard
  grants it the microphone and the call window's audio only while it is the
  page of a recording the user started, recognized by its web contents,
  not by its origin, so no other chrome page gains anything.
- **Recordings go to `YapYap` in the system's music folder**, created when
  needed, with an index readable by the user alone. Choosing another folder
  waits for a setting.

The recording mark on the account in the sidebar and in the tray, item 5,
follows in its own change. Until then the attached window shows it, and
the recording stops when the call window closes, another account is shown
(including when the one on screen is removed), YapYap quits, or after four
hours.

Recording is not offered on macOS for now: on macOS CI the recorder page
received no sound from the call window, and nobody has verified it on a
Mac. There, `host.calls.record` resolves `unsupported` without asking, and
`host.calls.state` reports `supported: false`, until it is checked on a Mac.

## Amendment (2026-11-01)

**The consent warning moved into the window by the call** (item 4). A
system message box cannot keep **Record** unavailable until its box is
ticked, so it accepted **Record** without the tick and then did nothing.
Until the user has confirmed the warning, the window by the call shows it,
with its box, and offers **Record** only once the box is ticked. The main
process refuses a **Record** answer without the tick, and keeps the
confirmation only when it comes with one.
