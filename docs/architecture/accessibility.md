# Accessibility

YapYap's own windows, such as Settings, Accounts and Downloads, aim for WCAG
2.2 AA. WhatsApp itself runs as Meta ships it; YapYap does not change its
page for accessibility, and its zoom setting scales it.

## What is checked automatically

- **axe** runs in the E2E suite (`e2e/accessibility.spec.ts`) on every
  chrome page that opens from the menu, in the light and the dark theme,
  against the WCAG 2.0, 2.1 and 2.2 A and AA rules. Any violation fails the
  build. A further test plants an unlabelled button to prove the check
  catches one.
- **Keyboard**: on every chrome page that opens from the menu, a test
  presses Tab round the whole page and fails if a control is never reached
  or shows no focus ring, outline or shadow when it is. A radio group counts
  as one stop, as the arrow keys move within it. A planted button with its
  focus hidden proves the check catches one.
- **Lint** rejects literal UI text, so every label, title and description
  comes from the message catalog and is translated with the rest.
- **Reduced motion**: a test checks that transitions stop when the system
  asks for reduced motion.
- **Text scaling**: chrome pages size text in `rem`, so they follow the
  system's font size, and Settings → Appearance → Interface scale zooms
  WhatsApp.

axe finds about half of what can go wrong. The rest needs a person with a
screen reader and a keyboard.

## Manual checks before a release

Run these on each platform's screen reader: Orca on Linux, NVDA on Windows
and VoiceOver on macOS. Record what you find in the release PR.

1. **Keyboard only.** Unplug the mouse. Open every window from the menu with
   the keyboard, reach every control with Tab and Shift+Tab, change it with
   Space, Enter or the arrow keys, and close the window with Escape or the
   window shortcut. Focus must always be visible and never get stuck.
2. **Names and roles.** With the screen reader on, move through each window.
   Every control must announce a name that says what it does, its role
   (button, checkbox, radio, link), and its state (checked, expanded).
   Section headings must be announced as headings.
3. **Changes.** Change a setting that shows a notice, such as one that needs
   a restart. The notice must be announced without moving focus.
4. **Text size. Set the system's text size to 200% and reopen each window.
   Nothing may be cut off or overlap, and the windows must scroll.
5. **High contrast.** Turn on Windows' contrast themes or macOS's Increase
   contrast. Every control and its focus ring must stay visible.

Report a failure as an issue with the `area: a11y` label.
