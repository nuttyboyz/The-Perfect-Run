// The Perfect Shop: spend Perfect Points on permanent power-ups. Opened from the title screen.
import { META, costOf, getMeta, buy, refundAll } from './meta.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderPShop(ui) {
  const root = ui.$('#s-pshop');
  const m = getMeta();
  ui.$('#pshop-pp').textContent = m.pp.toLocaleString();
  const g = ui.game;
  ui.$('#pshop-grid').innerHTML = META.map((d) => {
    const r = m.ranks[d.id] | 0, maxed = r >= d.max, cost = maxed ? 0 : costOf(d, r), can = !maxed && m.pp >= cost;
    const pips = Array.from({ length: d.max }, (_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('');
    const toggle = '';
    return `<div class="ps-slot"><div class="ps-card ${maxed ? 'maxed' : can ? 'can' : ''}">
      <div class="ps-ico">${d.icon}</div>
      <div class="ps-body"><div class="ps-name">${esc(d.name)}</div><div class="ps-per">${esc(d.per)}</div><div class="ps-pips">${pips}<b>Rank ${r} / ${d.max}</b></div><div class="ps-lore">${esc(d.lore)}</div></div>
      <div class="ps-side"><div class="ps-cost">${maxed ? 'MAX' : '<img class="pp-gem" alt="">' + cost}</div>${maxed ? '' : `<button class="ps-buy ${can ? 'can' : ''}" data-id="${d.id}">Buy</button>`}</div>
    </div>${toggle}</div>`;
  }).join('');
  ui.$$('.ps-buy', root).forEach((b) => (b.onclick = () => {
    const res = buy(b.dataset.id);
    const g = ui.game;
    if (res.ok) { g.audio.play('buy'); ui.toast(META.find((x) => x.id === b.dataset.id).name + ' upgraded', 'good'); }
    else { g.audio.play('deny'); ui.toast(res.why === 'max' ? 'Already maxed' : res.why === 'pp' ? 'Need ' + res.need + ' more PP' : 'Not available', 'bad'); }
    renderPShop(ui);
    const again = ui.$('.ps-buy[data-id="' + b.dataset.id + '"]', root);
    if (again && g.pad && g.pad.active) again.classList.add('pad-focus');
  }));
  const rf = ui.$('#pshop-refund');
  rf.textContent = m.spent ? 'Refund all (' + m.spent + ' PP)' : 'Refund all';
  rf.disabled = !m.spent;
  rf.onclick = () => {
    if (!rf.dataset.sure) { rf.dataset.sure = '1'; rf.textContent = 'Really refund everything?'; setTimeout(() => { delete rf.dataset.sure; renderPShop(ui); }, 3000); return; }
    refundAll(); ui.game.audio.play('ui'); ui.toast('All PP refunded', 'good'); renderPShop(ui);
  };
  // The gem icon is drawn once and reused.
  ui.$$('.pp-gem', root).forEach((i) => (i.src = gemURL()));
}

let _gem = null;
export function gemURL() {
  if (_gem) return _gem;
  const c = document.createElement('canvas'); c.width = c.height = 48;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(8, 4, 40, 44); grad.addColorStop(0, '#fff6d8'); grad.addColorStop(0.5, '#b58cff'); grad.addColorStop(1, '#5a3cc8');
  g.fillStyle = grad; g.beginPath(); g.moveTo(24, 3); g.lineTo(41, 18); g.lineTo(24, 45); g.lineTo(7, 18); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2; g.beginPath(); g.moveTo(7, 18); g.lineTo(41, 18); g.moveTo(17, 18); g.lineTo(24, 3); g.lineTo(31, 18); g.lineTo(24, 45); g.lineTo(17, 18); g.stroke();
  _gem = c.toDataURL();
  return _gem;
}
