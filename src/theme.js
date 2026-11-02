// Run before the first paint. Theme preference is independent of career saves.
(() => {
  const key = 'fang-league-lab.theme';
  const root = document.documentElement;
  function apply(theme) {
    root.dataset.theme = theme === 'light' ? 'light' : 'dark';
    const dark = root.dataset.theme === 'dark';
    document.querySelector('meta[name="theme-color"]').content = dark ? '#101b18' : '#e8e5d4';
    const button = document.getElementById('theme-toggle');
    if (button) {
      button.textContent = dark ? '☀ Light mode' : '☾ Dark mode';
      button.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
    }
  }
  let saved;
  try { saved = localStorage.getItem(key); } catch { /* Dark mode also works without storage. */ }
  apply(saved);
  document.addEventListener('DOMContentLoaded', () => {
    apply(root.dataset.theme);
    document.getElementById('theme-toggle').addEventListener('click', () => {
      apply(root.dataset.theme === 'dark' ? 'light' : 'dark');
      try { localStorage.setItem(key, root.dataset.theme); } catch { /* Keep the choice for this page. */ }
    });
  });
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) apply(event.newValue); });
})();
