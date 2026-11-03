// Draws a QR-shaped code as WhatsApp's logged-out screen does: dark modules
// on a white canvas, with the three finder patterns. It encodes nothing, so
// no phone could link with it; it only has the shape YapYap reads (ADR 0020).
const canvas = document.querySelector('[data-ref] canvas');
const context = canvas.getContext('2d');
const SIZE = 25;
const MODULE = 8;
const QUIET = (canvas.width - SIZE * MODULE) / 2;

const inFinder = (x, y) =>
  [
    [0, 0],
    [SIZE - 7, 0],
    [0, SIZE - 7],
  ].find(([left, top]) => x >= left - 1 && x <= left + 7 && y >= top - 1 && y <= top + 7);

const dark = (x, y) => {
  const finder = inFinder(x, y);
  if (finder === undefined) {
    return (x * 7 + y * 3) % 5 < 2;
  }
  const ring = Math.max(Math.abs(x - finder[0] - 3), Math.abs(y - finder[1] - 3));
  return ring !== 2 && ring !== 4;
};

context.fillStyle = '#ffffff';
context.fillRect(0, 0, canvas.width, canvas.height);
context.fillStyle = '#122e31';
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    if (dark(x, y)) {
      context.fillRect(QUIET + x * MODULE, QUIET + y * MODULE, MODULE, MODULE);
    }
  }
}
