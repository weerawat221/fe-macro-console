// errorBanner.js
// Port of show_warn(): shows a message, auto-clears after 3s (same timing
// as the Python root.after(3000, ...) call).

let clearTimer = null;

export function showError(text) {
  const el = document.getElementById('errorBanner');
  el.textContent = text;
  el.classList.add('error-banner--visible');

  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    el.classList.remove('error-banner--visible');
    el.textContent = '';
  }, 3000);
}
