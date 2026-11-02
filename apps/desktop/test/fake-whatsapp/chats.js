// Opens a chat from the chat list, as WhatsApp does when its row is
// pressed: the header names the chat. The messages stay, so a message sent
// next still lands after the last one (compose.js).
for (const row of document.querySelectorAll('#pane-side [role="row"]')) {
  row.addEventListener('mousedown', () => {
    const name = row.querySelector('[data-testid="cell-frame-title"]').textContent.trim();
    document.querySelector('#main header span[dir="auto"]').textContent = name;
  });
}
