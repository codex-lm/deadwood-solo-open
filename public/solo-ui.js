import { getLanguage, translateDom } from './i18n.js';

/** Keep existing game element IDs for its controls, but remove co-op affordances. */
export function installSoloUi() {
  const hidden = ['.session-tabs', '#join-field', '.room-ticket', '#room-share-panel',
    '#hud-room', '#admission-panel', '#advanced-options', '#advanced-options-results',
    '#companions-picker', '#companions-picker-results', '#pause-friendly-fire'];
  for (const selector of hidden) {
    for (const element of document.querySelectorAll(selector)) element.classList.add('solo-unavailable');
  }
  const count = document.querySelector('.feature-strip b');
  if (count) count.textContent = '01';
  const brand = document.querySelector('.brand > span:last-child');
  if (brand) {
    brand.replaceChildren(document.createTextNode('DEADWOOD'));
    const subtitle = document.createElement('small');
    subtitle.textContent = 'SOLO OPEN';
    brand.append(subtitle);
  }
  document.title = 'Deadwood Solo Open';
  const edition = document.querySelector('.edition');
  if (edition) edition.textContent = 'SOLO 1.0';
  const footer = document.createElement('p');
  footer.className = 'solo-credit';
  footer.textContent = 'Published by Nilo. Created with Codex, Claude and Kimi.';
  document.querySelector('.setup-panel')?.append(footer);
  document.getElementById('reload-page')?.addEventListener('click', () => location.reload());
  document.querySelector('#boot-error button')?.addEventListener('click', () => location.reload());
  const languageSelect = document.getElementById('language-select');
  if (languageSelect) languageSelect.value = getLanguage();
  translateDom();
}
