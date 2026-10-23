// Click a figure to see it full size, when the column shrinks it.
//
// Figures are captured at device scale 2, so naturalWidth / 2 is the app's own
// size. A figure shown narrower than that (a whole-screen capture on a desktop,
// or almost any figure on a phone) is wrapped in a link to the PNG, which the
// browser opens at full resolution and lets the reader zoom.
(function () {
  function wrap(img) {
    if (img.closest('a')) return;
    if (img.clientWidth >= (img.naturalWidth / 2) * 0.95) return;
    var link = document.createElement('a');
    link.href = img.currentSrc || img.src;
    link.className = 'figure-zoom';
    link.target = '_blank';
    link.rel = 'noopener';
    link.title = 'Open full size';
    img.parentNode.insertBefore(link, img);
    link.appendChild(img);
  }

  function check(img) {
    if (img.complete && img.naturalWidth) wrap(img);
    else img.addEventListener('load', function () { wrap(img); }, { once: true });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('figure img').forEach(check);
  });
})();
