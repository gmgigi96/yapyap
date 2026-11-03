// Opens a chat from the chat list, as WhatsApp does when its row is
// pressed: the header names the chat. The messages stay, so a message sent
// next still lands after the last one (compose.js).
const header = document.querySelector('#main header span[dir="auto"]');
for (const row of document.querySelectorAll('#pane-side [role="row"]')) {
  row.addEventListener('mousedown', () => {
    header.textContent = row.querySelector('[data-testid="cell-frame-title"]').textContent.trim();
  });
}

// WhatsApp's link to a number opens that number's chat, under the name the
// contact is saved as, or the number itself.
const SAVED = { 447700900123: 'Test Chat Two' };
const [, phone] =
  /^\/send\?(?:.*&)?phone=(\d+)/.exec(document.location.pathname + document.location.search) ?? [];
if (phone !== undefined) {
  header.textContent = SAVED[phone] ?? `+${phone}`;
}
