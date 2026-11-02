// Shows notifications the way WhatsApp Web does, with the Web Notifications
// API, and reports what the page saw: the permission and any click.
let latest;
const result = document.querySelector('[data-testid="notify-result"]');
document.querySelector('[data-testid="notify"]').addEventListener('click', () => {
  result.textContent = `permission ${window.Notification.permission}`;
  // WhatsApp names the chat's picture by its full address.
  latest = new window.Notification('Test Chat One', {
    body: 'Hello from the test',
    tag: 'chat-1',
    icon: new window.URL('/media/avatar.png', window.location.href).href,
  });
  latest.onclick = () => {
    result.textContent = 'clicked';
  };
});
document.querySelector('[data-testid="notify-read"]').addEventListener('click', () => {
  latest?.close();
});
