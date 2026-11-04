import { t, translateDom } from './i18n.js';
import { SIEGE, SIEGE_COSTS, siegeWaveProfile } from './supply-siege-rules.js';

export function createSiegeDesk({ buy, start, leave, releaseControls }) {
  const panel = document.createElement('section');
  panel.id = 'siege-desk'; panel.className = 'siege-overlay'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'siege-heading');
  panel.innerHTML = `<div class="siege-desk">
    <div class="siege-top"><span class="eyebrow" data-i18n="siege.eyebrow"></span><span class="siege-frozen" data-i18n="siege.frozen"></span></div>
    <h2 id="siege-heading" tabindex="-1" data-i18n="siege.title"></h2>
    <p data-i18n="siege.brief"></p><ol class="siege-route" aria-label="Assaults">${Array.from({length:SIEGE.waves},(_,i)=>`<li>${String(i+1).padStart(2,'0')}</li>`).join('')}</ol>
    <div class="siege-ledger" role="status" aria-live="polite"></div>
    <p class="siege-carry" data-i18n="siege.carry"></p>
    <div class="siege-purchases">${Object.entries(SIEGE_COSTS).map(([id,cost])=>`<button type="button" data-siege-buy="${id}"><span class="siege-cost">${cost}</span><strong data-i18n="siege.${id}"></strong><small data-i18n="siege.${id}Help"></small><em></em></button>`).join('')}</div>
    <fieldset class="siege-orders"><legend data-i18n="siege.orders"></legend>
      <label><input type="radio" name="siege-risk" value="quiet" checked><span><strong data-i18n="siege.quiet"></strong><small data-i18n="siege.quietHelp"></small></span></label>
      <label><input type="radio" name="siege-risk" value="convoy"><span><strong data-i18n="siege.convoy"></strong><small data-i18n="siege.convoyHelp"></small></span></label>
    </fieldset><p class="siege-forecast" role="status" aria-live="polite"></p>
    <div class="siege-actions"><button type="button" class="text-button siege-leave" data-i18n="siege.leave"></button><button type="button" class="primary siege-launch" data-i18n="siege.launch"></button></div>
    <p class="siege-help" data-i18n="siege.help"></p>
  </div>`;
  document.body.append(panel);
  let planningWave = null, current = null, pendingPurchase = null;
  const buttons = [...panel.querySelectorAll('[data-siege-buy]')];
  const radio = () => panel.querySelector('[value="convoy"]').checked;
  const forecast = () => {
    if (!current) return;
    const final = current.siege.nextAssault === SIEGE.waves;
    const profile = siegeWaveProfile(current.siege.nextAssault, radio(), {});
    panel.querySelector('.siege-forecast').textContent = t(final ? 'siege.finalForecast' : 'siege.forecast', { seconds:profile.seconds, threats:profile.total, reward:radio()?SIEGE.convoyReward:SIEGE.quietReward });
  };
  for (const button of buttons) button.addEventListener('click', () => { pendingPurchase = button.dataset.siegeBuy; buy(pendingPurchase); });
  panel.querySelectorAll('input').forEach(input => input.addEventListener('change', forecast));
  panel.querySelector('.siege-launch').addEventListener('click', () => start(radio()));
  panel.querySelector('.siege-leave').addEventListener('click', leave);
  // Keep Tab in the desk; no game hotkey may act while supplies are allocated.
  panel.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('button:not(:disabled),input:not(:disabled)')];
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.querySelector('h2'))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  return {
    update(snapshot, self, inGame) {
      current = snapshot;
      const visible = !!(inGame && snapshot?.siege?.planning && self?.alive && !self.downed);
      const opening = visible && (panel.hidden || planningWave !== snapshot.wave);
      panel.hidden = !visible;
      if (!visible) { planningWave = null; return false; }
      if (opening) {
        planningWave = snapshot.wave;
        panel.querySelector('[value="quiet"]').checked = true;
        releaseControls();
        panel.querySelector('h2').focus({preventScroll:true});
      }
      translateDom(panel);
      const finalAssault = snapshot.siege.nextAssault === SIEGE.waves;
      panel.querySelector('[value="convoy"]').disabled = finalAssault;
      if (finalAssault) panel.querySelector('[value="quiet"]').checked = true;
      panel.querySelector('.siege-ledger').textContent = t('siege.ledger', {supplies:snapshot.siege.supplies, hp:Math.ceil(self.hp), ammo:snapshot.siege.reserveAmmo});
      for (const [index,item] of [...panel.querySelectorAll('.siege-route li')].entries()) {
        item.classList.toggle('done', index < snapshot.wave);
        item.classList.toggle('next', index === snapshot.wave);
      }
      for (const button of buttons) {
        const id = button.dataset.siegeBuy;
        button.disabled = !snapshot.siege.available[id];
        button.querySelector('em').textContent = t(snapshot.siege.purchased.includes(id) ? 'siege.bought' : snapshot.siege.supplies < SIEGE_COSTS[id] ? 'siege.tooCostly' : !snapshot.siege.available[id] ? 'siege.notNeeded' : 'siege.buy');
      }
      if (pendingPurchase && snapshot.siege.purchased.includes(pendingPurchase)) {
        (buttons.find(button => !button.disabled) ?? panel.querySelector('.siege-launch')).focus({preventScroll:true});
        pendingPurchase = null;
      }
      forecast();
      return opening;
    },
    reset() { current = null; planningWave = null; pendingPurchase = null; panel.hidden = true; },
  };
}
