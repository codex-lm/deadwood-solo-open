import { t } from './i18n.js';

function showError(error) {
  if (!error) return;
  const panel = document.getElementById('boot-error');
  const detail = document.getElementById('boot-error-detail');
  if (!panel || !detail) return;
  detail.textContent = t('boot.detail', { error: error.message ?? String(error) });
  panel.hidden = false;
}

window.addEventListener('error', event => showError(event.error));
window.addEventListener('unhandledrejection', event => showError(event.reason));
document.querySelector('#boot-error button')?.addEventListener('click', () => location.reload());
