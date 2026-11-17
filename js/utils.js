export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const uid = () => Math.random().toString(36).slice(2, 10);
export const pad = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const TODAY = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const addDays = n => { const d = TODAY(); d.setDate(d.getDate() + n); return d; };
export const diffDays = s => Math.round((new Date(s + 'T00:00') - TODAY()) / 864e5);
export function fmtDate(s) {
  const d = diffDays(s);
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return 'Demain';
  if (d === -1) return 'Hier';
  const o = { day: 'numeric', month: 'short' };
  if (d > 1 && d < 7) o.weekday = 'short';
  return new Date(s + 'T00:00').toLocaleDateString('fr-FR', o);
}
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const deaccent = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const norm = s => deaccent(s).replace(/[^a-z0-9]/g, '');
export const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const STOP = new Set("le la les l de du des d un une et a au aux pour avec en sur que qui ce cette ces mon ma mes ton ta tes son sa ses notre nos leur leurs tache truc chose il elle on je j y faut faire est qu".split(' '));
export const words = s => deaccent(s).split(/[^a-z0-9]+/).filter(w => w && !STOP.has(w));
export const isMobile = () => matchMedia('(max-width: 760px)').matches;

export function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = '';
  const sp = document.createElement('span'); sp.textContent = msg; t.append(sp);
  if (action) {
    const b = document.createElement('button'); b.textContent = action.label;
    b.onclick = () => { action.fn(); t.classList.remove('show'); };
    t.append(b);
  }
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), action ? 6000 : 2800);
}
