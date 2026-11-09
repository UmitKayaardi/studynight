// Applies the saved theme before first paint (external file so the CSP needs no 'unsafe-inline').
(function () {
  try {
    var t = localStorage.getItem('sn-theme') || 'system';
    var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
