/* Mode gelap Harga Pangan Jatim — tanpa dependency.
   Bagian IIFE dijalankan saat kepala dibaca: terapkan tema tersimpan
   (localStorage 'theme') atau ikut preferensi sistem sebelum paint
   pertama agar tidak berkedip. Bagian kedua memasang tombol toggle
   di header dan menyiarkan event 'themechange' untuk render ulang. */
(function () {
  var root = document.documentElement;

  var stored = null;
  try { stored = localStorage.getItem('theme'); } catch (e) {}
  var theme = (stored === 'dark' || stored === 'light')
    ? stored
    : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  root.setAttribute('data-theme', theme);

  function labelFor(mode) {
    return mode === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap';
  }

  function titleFor(mode) {
    return mode === 'dark' ? 'Mode terang' : 'Mode gelap';
  }

  function apply(mode) {
    root.setAttribute('data-theme', mode);
    try { localStorage.setItem('theme', mode); } catch (e) {}
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', mode === 'dark' ? '#0E1411' : '#F7F8FA');
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-label', labelFor(mode));
      btn.setAttribute('title', titleFor(mode));
    });
    window.dispatchEvent(new CustomEvent('themechange', { detail: mode }));
  }

  /* Sinkronkan theme-color mengikuti tema awal (bisa dari sistem). */
  var initialMeta = document.querySelector('meta[name="theme-color"]');
  if (initialMeta) initialMeta.setAttribute('content', theme === 'dark' ? '#0E1411' : '#F7F8FA');

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-label', labelFor(root.getAttribute('data-theme')));
      btn.setAttribute('title', titleFor(root.getAttribute('data-theme')));
      btn.addEventListener('click', function () {
        apply(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
      });
    });
  });
})();
