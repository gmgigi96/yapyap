// Opens a chat from the chat list, as WhatsApp does on a click on its row:
// the header names the chat, and its messages replace the open chat's.
for (const row of document.querySelectorAll('#pane-side [role="row"]')) {
  row.addEventListener('mousedown', () => {
    const name = row.querySelector('[data-testid="cell-frame-title"]').textContent.trim();
    const main = document.querySelector('#main');
    main.querySelector('header span[dir="auto"]').textContent = name;
    for (const message of main.querySelectorAll(':scope > [role="row"]')) {
      message.remove();
    }
  });
}
