/* =====================================================================
   SimplePOS Cloud — çox dükanlı brauzer proqramı
   Panel, Satışlar, Müştərilər. Məlumatlar Supabase bazasında saxlanır.
   ===================================================================== */
(function () {
'use strict';

const CFG = window.SAT_CONFIG || {};
if (!CFG.FIRMA_ADI) CFG.FIRMA_ADI = 'SimplePOS';
document.title = CFG.FIRMA_ADI;
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
const S = { user: null, rol: null, ad: '', cache: {}, magaza: null, aktiv: false, admin: false, sistem: {} };
const AYLAR = ['Yanvar','Fevral','Mart','Aprel','May','İyun','İyul','Avqust','Sentyabr','Oktyabr','Noyabr','Dekabr'];
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const app = $('#app');

/* ---------------- köməkçilər ---------------- */
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => (v == null || v === '' ? 0 : Number(v));
function fmt(v, dec) {
  const n = num(v);
  const s = Math.abs(n).toFixed(dec || (Math.round(n) === n ? 0 : 2));
  const [i, d] = s.split('.');
  return (n < 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (d ? ',' + d : '');
}
const man = v => fmt(v) + ' ₼';
function fd(d) { if (!d) return ''; const [y, m, x] = String(d).slice(0, 10).split('-'); return `${x}.${m}.${y}`; }
function today() { const d = new Date(); return iso(d); }
function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function ayAdi(d) { const [y, m] = String(d).split('-'); return `${AYLAR[+m - 1]} ${y}`; }
function ayQisa(d) { const [y, m] = String(d).split('-'); return `${AYLAR[+m - 1].slice(0, 3)} ${y.slice(2)}`; }
function ayBasi(d) { return String(d).slice(0, 7) + '-01'; }
function aySonu(d) { const [y, m] = String(d).split('-').map(Number); return iso(new Date(y, m, 0)); }
const canWrite = () => S.rol === 'muhasib' && S.aktiv;
const firmaAdi = () => (S.magaza && S.magaza.ad) || CFG.FIRMA_ADI;
const gunFerqi = d => Math.round((new Date(d + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 864e5);

function toast(msg, ms) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms || 2600);
}
function fail(e) { console.error(e); toast('Xəta: ' + (e && (e.message || e.error_description) || e), 5000); }

async function q(builder) {
  const { data, error } = await builder;
  if (error) throw error;
  return data;
}
// 1000 sətirdən çox olanda hissə-hissə oxu
async function all(make) {
  const out = []; const step = 1000;
  for (let from = 0; ; from += step) {
    const part = await q(make().range(from, from + step - 1));
    out.push(...part);
    if (part.length < step) break;
  }
  return out;
}

const ICON = {
  kassaI: '<path d="M21 18v1a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v1h-9a2 2 0 00-2 2v8a2 2 0 002 2h9zm-9-2h10V8H12v8zm4-2.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/>',
  chart: '<path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"/>',
  cal: '<path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V10h14v10zM7 12h5v5H7z"/>',
  trend: '<path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/>',
  hist: '<path d="M13 3a9 9 0 00-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 112.05 4.95l-1.42 1.42A9 9 0 1013 3zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>',
  gear: '<path d="M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.48.48 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7 7 0 00-1.62-.94l-.36-2.54A.48.48 0 0013.9 2h-3.84a.48.48 0 00-.48.41l-.36 2.54a7.3 7.3 0 00-1.62.94l-2.39-.96a.48.48 0 00-.59.22L2.7 8.47a.47.47 0 00.12.61l2.03 1.58a7.4 7.4 0 000 1.88l-2.03 1.58a.48.48 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54a7 7 0 001.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.47.47 0 00-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z"/>',
  doc: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>',
  clip: '<path d="M19 3h-4.18A3 3 0 0012 1a3 3 0 00-2.82 2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-7 0a1 1 0 110 2 1 1 0 010-2zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>',
  wallet: '<path d="M21 7.28V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-2.28A2 2 0 0022 15V9a2 2 0 00-1-1.72zM20 9v6h-7V9h7zM5 19V5h14v2h-6a2 2 0 00-2 2v6a2 2 0 002 2h6v2H5zm11-5.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>',
  grid: '<path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"/>',
  down: '<path d="M5 20h14v-2H5v2zm7-4l5-5h-3V3h-4v8H7l5 5z"/>',
  up: '<path d="M5 20h14v-2H5v2zM12 2l-5 5h3v8h4V7h3l-5-5z"/>',
  box: '<path d="M20 7l-8-4-8 4v10l8 4 8-4V7zm-8-1.76L16.76 7.5 12 9.88 7.24 7.5 12 5.24zM6 9.12l5 2.5v6.76l-5-2.5V9.12zm7 9.26v-6.76l5-2.5v6.76l-5 2.5z"/>',
  panel: '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>',
  sale: '<path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45C4.52 15.37 5.48 17 7 17h12v-2H7l1.1-2h7.45c.75 0 1.41-.41 1.75-1.03L21.7 4H5.21l-.94-2H1zm16 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>',
  bina: '<path d="M3 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5h5a1 1 0 0 1 1 1v11h-7v-4h-4v4H3zm3-15v2h2V6H6zm4 0v2h2V6h-2zm-4 4v2h2v-2H6zm4 0v2h2v-2h-2zm-4 4v2h2v-2H6zm11-2v2h2v-2h-2zm0 4v2h2v-2h-2z"/>',
  users: '<path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>',
  exp: '<path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>',
  worker: '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>',
  cash: '<path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>',
  plus: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>',
  print: '<path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>'
};
const LOGO = `<svg class="logo-ico" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21v17h30V21"/><path d="M6 13l4-7h28l4 7v2a5 5 0 0 1-9 3 5 5 0 0 1-9 0 5 5 0 0 1-9 0 5 5 0 0 1-9-3z"/><path d="M20 38v-9h8v9"/></svg>`;
// Dükanın sahəsi: nümunə yazılar ona uyğun dəyişir
const SAHELER = [['mebel', 'Mebel'], ['elektronika', 'Elektronika və məişət texnikası'], ['telefon', 'Telefon və aksesuar'], ['geyim', 'Geyim və ayaqqabı'],
  ['tikinti', 'Tikinti materialları'], ['xalca', 'Xalça və ev tekstili'], ['zinet', 'Zərgərlik'], ['market', 'Market və ərzaq'], ['diger', 'Digər']];
const saheAd = k => (SAHELER.find(x => x[0] === k) || SAHELER[SAHELER.length - 1])[1];
const saheOpt = sec => SAHELER.map(([k, t]) => `<option value="${k}" ${k === sec ? 'selected' : ''}>${t}</option>`).join('');
const NUMUNE = {
  mebel: ['Künc divan Milano', 'Divanlar', 'Mətbəx mebeli', 'Mətbəx dəsti 2.4 m'], elektronika: ['Soyuducu Samsung RB34', 'Soyuducular', 'Paltaryuyan maşın', 'Televizor LG 55"'],
  telefon: ['iPhone 15 128 GB', 'Smartfonlar', 'Telefon', 'Samsung Galaxy A55'], geyim: ['Kişi kostyumu', 'Kostyumlar', 'Paltar', 'Qadın paltosu'],
  tikinti: ['Sement M400 (50 kq)', 'Sement', 'Tikinti materialı', 'Laminat 8 mm (m²)'], xalca: ['Xalça 2×3 m', 'Xalçalar', 'Xalça', 'Yorğan-döşək dəsti'],
  zinet: ['Qızıl üzük 585', 'Üzüklər', 'Qızıl əşya', 'Qızıl sırğa'], market: ['Un 25 kq', 'Ərzaq', 'Ərzaq', 'Şəkər 10 kq'], diger: ['Məhsulun adı', 'Kateqoriya', 'Mal', 'Başqa məhsul'] };
const numune = () => NUMUNE[S.magaza && S.magaza.sahe] || NUMUNE.diger;
const ico = k => `<svg class="ico" viewBox="0 0 24 24" fill="currentColor">${ICON[k]}</svg>`;

/* ---------------- modal ---------------- */
function modal(title, body, foot, wide) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="overlay"><div class="modal ${wide ? 'wide' : ''}">
    <div class="mh"><h3>${title}</h3><button class="x" data-close>×</button></div>
    <div class="mb">${body}</div>${foot ? `<div class="mf">${foot}</div>` : ''}</div></div>`;
  const ov = $('.overlay', root);
  ov.addEventListener('mousedown', e => { if (e.target === ov) closeModal(); });
  $$('[data-close]', root).forEach(b => b.onclick = closeModal);
  return $('.modal', root);
}
function closeModal() { $('#modal-root').innerHTML = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ---------------- giriş / qeydiyyat ---------------- */
const SAYT = () => location.origin + location.pathname;
function authXeta(e) {
  const m = (e && e.message) || '';
  if (/already registered|already been registered/i.test(m)) return 'Bu e-poçt artıq qeydiyyatdan keçib. "Daxil ol" bölməsindən girin.';
  if (/Invalid login/i.test(m)) return 'E-poçt və ya şifrə yanlışdır.';
  if (/Email not confirmed/i.test(m)) return 'E-poçtunuzu təsdiqləyin: gələn məktubdakı linkə basın.';
  if (/Database error/i.test(m)) return 'Qeydiyyat alınmadı. Dəvət kodunu yoxlayın.';
  if (/Password should be|at least 6/i.test(m)) return 'Şifrə ən azı 6 simvol olmalıdır.';
  if (/rate limit|too many/i.test(m)) return 'Çox cəhd edildi, bir az sonra yenidən yoxlayın.';
  if (/valid email|invalid format/i.test(m)) return 'E-poçt ünvanı düzgün deyil.';
  return m || 'Xəta baş verdi';
}
async function sistemOxu() {
  try { const r = await q(sb.from('sistem').select('*')); S.sistem = Object.fromEntries(r.map(x => [x.acar, x.deyer || ''])); } catch (_) {}
  return S.sistem;
}
function loginView(msg, rejim) {
  rejim = rejim || 'giris';
  const sinaq = S.sistem.sinaq_gun || '14';
  const tabs = `<div class="seg" style="display:flex;margin:4px 0 16px">${[['giris', 'Daxil ol'], ['qeyd', 'Qeydiyyat']].map(([k, t]) =>
    `<button type="button" data-rj="${k}" class="${rejim === k || (rejim === 'unut' && k === 'giris') ? 'on' : ''}" style="flex:1">${t}</button>`).join('')}</div>`;
  let form = '';
  if (rejim === 'giris') form = `
    <div class="field"><label class="f">E-poçt</label><input class="in" type="email" name="e" autocomplete="username" required></div>
    <div class="field"><label class="f">Şifrə</label><input class="in" type="password" name="p" autocomplete="current-password" required></div>
    <button class="btn primary" style="width:100%;justify-content:center;padding:11px">Daxil ol</button>
    <div style="text-align:center;margin-top:12px"><a href="#" data-rj="unut" style="font-size:13px">Şifrəni unutmusunuz?</a></div>`;
  else if (rejim === 'unut') form = `
    <p class="muted" style="font-size:13px;margin-top:0">E-poçtunuzu yazın, şifrəni yeniləmək üçün link göndərəcəyik.</p>
    <div class="field"><label class="f">E-poçt</label><input class="in" type="email" name="e" required></div>
    <button class="btn primary" style="width:100%;justify-content:center;padding:11px">Link göndər</button>
    <div style="text-align:center;margin-top:12px"><a href="#" data-rj="giris" style="font-size:13px">← Girişə qayıt</a></div>`;
  else if (rejim === 'yeni') form = `
    <p class="muted" style="font-size:13px;margin-top:0">Yeni şifrənizi yazın.</p>
    <div class="field"><label class="f">Yeni şifrə</label><input class="in" type="password" name="p" minlength="6" autocomplete="new-password" required></div>
    <div class="field"><label class="f">Təkrar</label><input class="in" type="password" name="p2" minlength="6" autocomplete="new-password" required></div>
    <button class="btn primary" style="width:100%;justify-content:center;padding:11px">Şifrəni yadda saxla</button>`;
  else form = `
    <div class="seg" style="display:flex;margin-bottom:12px" id="nv">
      <button type="button" data-nv="yeni" class="on" style="flex:1">Dükanım var</button><button type="button" data-nv="muh" style="flex:1">Mühasibəm</button><button type="button" data-nv="kod" style="flex:1">Dəvət kodu</button></div>
    <div id="yenidukan">
      <div class="field"><label class="f">Dükanın adı</label><input class="in" name="mg" placeholder="məs. Ulduz Mebel"></div>
      <div class="field"><label class="f">Sahə</label><select class="in" name="sahe">${saheOpt('mebel')}</select></div></div>
    <div id="muhinfo" class="muted" style="display:none;font-size:13px;background:#faf4ea;border-radius:10px;padding:10px 12px;margin-bottom:12px">Bir hesabla bir neçə firmanın uçotunu aparacaqsınız. Qeydiyyatdan sonra firmalarınızı əlavə edin — hər yeni firma ${esc(sinaq)} gün pulsuz işləyir.</div>
    <div class="field" id="telsah"><label class="f">Telefon</label><input class="in" name="tel" type="tel" placeholder="050 000 00 00"></div>
    <div id="kodlu" style="display:none">
      <div class="field"><label class="f">Dəvət kodu</label><input class="in" name="kod" maxlength="6" style="text-transform:uppercase;letter-spacing:3px;font-weight:600" placeholder="ABC123">
        <div class="cell-sub" id="kodinfo" style="margin-top:4px">Kodu dükanın mühasibindən alın.</div></div></div>
    <div class="field"><label class="f">Ad Soyad</label><input class="in" name="ad" required></div>
    <div class="field"><label class="f">E-poçt</label><input class="in" type="email" name="e" autocomplete="username" required></div>
    <div class="field"><label class="f">Şifrə (ən azı 6 simvol)</label><input class="in" type="password" name="p" minlength="6" autocomplete="new-password" required></div>
    <button class="btn primary" style="width:100%;justify-content:center;padding:11px">Qeydiyyatdan keç</button>
    <p class="muted" style="font-size:12.5px;text-align:center;margin:10px 0 0" id="sinaqinfo">Yeni dükan ${esc(sinaq)} gün pulsuz işləyir.${S.sistem.qiymet ? ' Sonra: ' + esc(S.sistem.qiymet) + '.' : ''}</p>`;
  app.innerHTML = `<div class="login-wrap"><form class="login-card" id="lf">
    <div class="login-logo">${LOGO}</div><h1>${esc(CFG.FIRMA_ADI)}</h1><p>Nisyə və kredit satışının uçotu</p>
    ${rejim === 'yeni' ? '' : tabs}${form}
    <div class="err">${esc(msg || '')}</div></form></div>`;
  const f = $('#lf');
  $$('[data-rj]', f).forEach(x => x.onclick = e => { e.preventDefault(); loginView('', x.dataset.rj); });
  const err = t => { $('.err', f).textContent = t; $('.err', f).style.color = ''; };
  const ok = t => { $('.err', f).textContent = t; $('.err', f).style.color = 'var(--green)'; };
  const btn = () => $('button.primary', f);
  if (rejim === 'qeyd') {
    let nv = 'yeni';
    $$('[data-nv]', f).forEach(b => b.onclick = () => {
      nv = b.dataset.nv; $$('[data-nv]', f).forEach(x => x.classList.toggle('on', x === b));
      $('#yenidukan').style.display = nv === 'yeni' ? '' : 'none'; $('#kodlu').style.display = nv === 'kod' ? '' : 'none';
      $('#muhinfo').style.display = nv === 'muh' ? '' : 'none'; $('#telsah').style.display = nv === 'kod' ? 'none' : '';
      $('#sinaqinfo').style.display = nv === 'yeni' ? '' : 'none';
    });
    if (location.hash === '#muhasib') $('[data-nv="muh"]', f).click();
    let kodAd = null;
    f.kod.oninput = async () => {
      const k = f.kod.value.trim().toUpperCase(); kodAd = null;
      if (k.length < 6) { $('#kodinfo').textContent = 'Kodu dükanın mühasibindən alın.'; return; }
      try { kodAd = await q(sb.rpc('devet_yoxla', { kod: k })); } catch (_) {}
      $('#kodinfo').innerHTML = kodAd ? `Dükan: <b>${esc(kodAd)}</b>` : '<span class="neg">Bu kod tapılmadı</span>';
    };
    f.onsubmit = async e => {
      e.preventDefault();
      const data = { ad: f.ad.value.trim() };
      if (nv === 'yeni') { if (!f.mg.value.trim()) return err('Dükanın adını yazın.'); data.magaza_adi = f.mg.value.trim(); data.telefon = f.tel.value.trim(); data.sahe = f.sahe.value; }
      else if (nv === 'muh') { data.hesab = 'muhasib'; data.telefon = f.tel.value.trim(); }
      else { if (!kodAd) return err('Düzgün dəvət kodu yazın.'); data.devet_kodu = f.kod.value.trim().toUpperCase(); }
      btn().disabled = true;
      const { data: r, error } = await sb.auth.signUp({ email: f.e.value.trim(), password: f.p.value, options: { data, emailRedirectTo: SAYT() } });
      btn().disabled = false;
      if (error) return err(authXeta(error));
      if (r && r.session) return start();
      if (r && r.user && Array.isArray(r.user.identities) && r.user.identities.length === 0) return err('Bu e-poçt artıq qeydiyyatdan keçib.');
      ok('Qeydiyyat alındı. E-poçtunuza təsdiq linki göndərildi — linkə basıb sonra daxil olun.');
    };
  } else if (rejim === 'unut') {
    f.onsubmit = async e => {
      e.preventDefault(); btn().disabled = true;
      const { error } = await sb.auth.resetPasswordForEmail(f.e.value.trim(), { redirectTo: SAYT() });
      btn().disabled = false;
      if (error) return err(authXeta(error));
      ok('Link göndərildi. E-poçtunuzu yoxlayın (spam qovluğunu da).');
    };
  } else if (rejim === 'yeni') {
    f.onsubmit = async e => {
      e.preventDefault();
      if (f.p.value !== f.p2.value) return err('Şifrələr eyni deyil.');
      btn().disabled = true;
      const { error } = await sb.auth.updateUser({ password: f.p.value });
      btn().disabled = false;
      if (error) return err(authXeta(error));
      toast('Şifrə yeniləndi'); history.replaceState(null, '', SAYT()); start();
    };
  } else {
    f.onsubmit = async e => {
      e.preventDefault(); btn().disabled = true;
      const { error } = await sb.auth.signInWithPassword({ email: f.e.value.trim(), password: f.p.value });
      btn().disabled = false;
      if (error) return err(authXeta(error));
      start();
    };
  }
}

async function start() {
  await sistemOxu();
  const { data } = await sb.auth.getSession();
  const ses = data && data.session;
  if (!ses) return loginView('', /^#(qeyd|muhasib)$/.test(location.hash) ? 'qeyd' : 'giris');
  S.user = ses.user; S.cache = {};
  if (/^#(qeyd|muhasib)$/.test(location.hash)) location.hash = '';
  try {
    const [uz, adm, pr] = await Promise.all([
      q(sb.from('uzvler').select('rol,ad,magaza_id,secili,yaradildi').eq('user_id', S.user.id)),
      q(sb.from('adminler').select('user_id').eq('user_id', S.user.id).maybeSingle()),
      q(sb.from('profiller').select('*').eq('user_id', S.user.id).maybeSingle()).catch(() => null),
    ]);
    S.admin = !!adm; S.profil = pr; S.muhasibHesab = !!(pr && pr.nov === 'muhasib');
    const aktivUz = uz.filter(x => x.rol !== 'bloklu').sort((a, b) => (b.secili - a.secili) || String(a.yaradildi).localeCompare(String(b.yaradildi)) || a.magaza_id - b.magaza_id);
    if (!aktivUz.length && uz.length && !S.admin && !S.muhasibHesab) { await sb.auth.signOut(); return loginView('Bu hesab bloklanıb. Dükanınızın mühasibinə müraciət edin.'); }
    S.coxFirma = S.muhasibHesab || aktivUz.length > 1;
    S.firmalar = S.coxFirma ? await q(sb.rpc('uzvluklerim')).catch(() => []) : [];
    const me = aktivUz[0];
    if (me) {
      S.rol = me.rol; S.ad = me.ad || S.user.email;
      S.magaza = await q(sb.from('magazalar').select('*').eq('id', me.magaza_id).single());
      S.qalan = gunFerqi(S.magaza.abune_bitir);
      S.aktiv = !S.magaza.dayandirilib && S.qalan >= 0;
    } else { S.rol = null; S.magaza = null; S.aktiv = false; S.ad = (pr && pr.ad) || S.user.email; }
  } catch (e) { return loginView('Baza ilə əlaqə alınmadı: ' + e.message); }
  document.title = firmaAdi() + ' · ' + CFG.FIRMA_ADI;
  if (!S.magaza) location.hash = S.admin && !S.muhasibHesab ? '#/admin' : '#/firmalar';
  else if (S.rol === 'kuryer') location.hash = '#/yigim';
  else if (!location.hash || /access_token|type=/.test(location.hash)) location.hash = window.innerWidth <= 760 ? '#/menyu' : '#/panel';
  route();
}

function abuneBanner() {
  if (!S.magaza) return '';
  const el = [S.sistem.elaqe_telefon, S.sistem.elaqe_whatsapp && `<a href="https://wa.me/${S.sistem.elaqe_whatsapp.replace(/\D/g, '')}" target="_blank">WhatsApp</a>`].filter(Boolean).join(' · ');
  if (S.magaza.dayandirilib) return `<div class="banner b-red-bg">Hesabınız dayandırılıb. Məlumatlara baxa və Excel-ə yükləyə bilərsiniz.${el ? ' Əlaqə: ' + el : ''}</div>`;
  if (S.qalan < 0) return `<div class="banner b-red-bg"><b>Abunə müddəti ${fd(S.magaza.abune_bitir)} tarixində bitib.</b> Məlumatlara baxa və Excel-ə yükləyə bilərsiniz; yeni yazı üçün abunəni yeniləyin.${el ? ' Əlaqə: ' + el : ''}${S.sistem.qiymet ? ' · Qiymət: ' + esc(S.sistem.qiymet) : ''}</div>`;
  if (S.qalan <= 5) return `<div class="banner b-amber-bg">Abunənin bitməsinə <b>${S.qalan === 0 ? 'bu gün' : S.qalan + ' gün'}</b> qalıb (${fd(S.magaza.abune_bitir)}).${el ? ' Uzatmaq üçün: ' + el : ''}</div>`;
  return '';
}

/* ---------------- çərçivə ---------------- */
const NAV = [
  ['panel', 'Panel', 'panel'], ['satislar', 'Satışlar', 'sale'], ['musteriler', 'Müştərilər', 'users'], ['mehsullar', 'Məhsullar', 'box'],
  ['rasxodlar', 'Xərclər', 'exp'], ['isciler', 'İşçilər', 'worker'], ['odenisler', 'Ödənişlər', 'wallet'], ['cixaris', 'Çıxarış', 'doc'],
  ['kassa', 'Kassa', 'kassaI'], ['sifarisler', 'Sifarişlər', 'clip'], ['hesabat', 'Aylıq hesabat', 'chart'],
  ['teqvim', 'Ödəniş təqvimi', 'cal'], ['menfeet', 'Mənfəət', 'trend'], ['yigim', 'Yığım siyahısı', 'wallet'], ['saticilar', 'Satıcılar', 'chart'], ['jurnal', 'Jurnal', 'hist'], ['ayarlar', 'Ayarlar', 'gear'],
];
const MOBNAV = ['menyu', 'panel', 'satislar', 'musteriler', 'mehsullar'];

const NAVQISA = { menyu: 'Menyu', panel: 'Panel', satislar: 'Satış', musteriler: 'Müştəri', mehsullar: 'Məhsul', rasxodlar: 'Xərc', isciler: 'İşçi' };
const NAVBOLME = [['Satış', ['panel', 'satislar', 'musteriler', 'mehsullar']], ['Xərclər və işçilər', ['rasxodlar', 'isciler', 'odenisler', 'cixaris']], ['Kassa və hesabatlar', ['kassa', 'yigim', 'sifarisler', 'hesabat', 'teqvim', 'menfeet', 'saticilar']], ['İdarəetmə', ['jurnal', 'ayarlar']]];

function shell(active, title, sub, tools, body) {
  const navA = (S.rol === 'kuryer' ? NAV.filter(n => n[0] === 'yigim') : NAV).map(([k, t, i]) => `<a href="#/${k}" class="${active === k ? 'active' : ''}">${ico(i)}${t}</a>`).join('');
  app.innerHTML = `<div class="shell">
   <aside class="side"><div class="logo">${LOGO}<div><span>${esc(CFG.FIRMA_ADI)}</span><small>${S.magaza ? esc(S.magaza.ad) : S.admin ? 'Admin' : ''}</small></div></div>
    ${S.coxFirma && S.firmalar.length > 1 ? `<div class="firma-sec"><select id="fsec" title="Firmanı dəyiş">${S.firmalar.map(x => `<option value="${x.id}" ${S.magaza && x.id === S.magaza.id ? 'selected' : ''}>${esc(x.ad)}</option>`).join('')}</select></div>` : ''}
    <nav>${S.coxFirma || (!S.magaza && !S.admin) ? `<a href="#/firmalar" class="${active === 'firmalar' ? 'active' : ''}">${ico('bina')}${S.muhasibHesab ? 'Firmalarım' : 'Dükanlarım'}</a>` : ''}${S.rol === 'kuryer' ? navA : ''}${S.admin ? `<a href="#/admin" class="${active === 'admin' ? 'active' : ''}">${ico('panel')}Admin panel</a>${S.magaza ? '<div class="sec">Dükan</div>' : ''}` : ''}${S.magaza && S.rol !== 'kuryer' ? `${navA.split('<a href="#/rasxodlar"')[0]}<div class="sec">Xərclər və işçilər</div><a href="#/rasxodlar"${navA.split('<a href="#/rasxodlar"')[1].split('<a href="#/kassa"')[0]}<div class="sec">Kassa və hesabatlar</div><a href="#/kassa"${navA.split('<a href="#/kassa"')[1].split('<a href="#/jurnal"')[0]}<div class="sec">İdarəetmə</div><a href="#/jurnal"${navA.split('<a href="#/jurnal"')[1]}` : ''}</nav>
    <div class="who"><b>${esc(S.ad)}</b>${esc(S.user.email)}<br><span style="font-size:11.5px;opacity:.8">${S.rol === 'sahibkar' ? 'Yalnız baxış' : S.rol === 'kuryer' ? 'Kuryer' : ''}</span><br><button id="out">Çıxış</button></div></aside>
   <div class="mobile-bar"><button id="geri" class="mb-geri" ${active === 'menyu' || (S.rol === 'kuryer' && active === 'yigim') ? 'style="visibility:hidden"' : ''}>‹ Geri</button><b ${S.coxFirma ? 'id="mbfirma" style="cursor:pointer"' : ''}>${LOGO}${esc(firmaAdi())}${S.coxFirma ? ' ▾' : ''}</b><button id="out2">Çıxış</button></div>
   <main class="main">${abuneBanner()}<div class="topbar"><div><h2>${title}</h2><div class="sub">${sub || ''}</div></div><div class="tools">${tools || ''}</div></div>
   <div id="page">${body || '<div class="empty"><div class="spinner" style="margin:auto"></div></div>'}</div></main>
   <nav class="bottom-nav" ${S.magaza && S.rol !== 'kuryer' ? '' : 'style="display:none"'}><a href="#/menyu" class="${active === 'menyu' ? 'active' : ''}">${ico('grid')}Menyu</a></nav>
  </div>`;
  const out = async () => { await sb.auth.signOut(); S.user = null; S.magaza = null; S.cache = {}; YOL.length = 0; history.replaceState(null, '', SAYT()); loginView(); };
  $('#out').onclick = out; $('#out2').onclick = out;
  $('#geri').onclick = geri;
  if ($('#fsec')) $('#fsec').onchange = e => firmaSec(+e.target.value);
  if ($('#mbfirma')) $('#mbfirma').onclick = () => { location.hash = '#/firmalar'; };
}
// Telefon "Geri" düyməsi: proqram daxilində gəzilən səhifələrin siyahısı
const YOL = [];
function yolQeyd() { const h = location.hash || '#/'; if (YOL[YOL.length - 1] !== h) YOL.push(h); if (YOL.length > 60) YOL.shift(); }
function geri() { YOL.pop(); location.hash = YOL.pop() || '#/menyu'; }

function route() {
  if (!S.user) return;
  closeModal(); yolQeyd();
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const params = new URLSearchParams(qs || '');
  const [p, id] = path.split('/');
  const run = { panel: pagePanel, satislar: () => pageSatislar(params), musteriler: () => pageMusteriler(params), musteri: () => pageMusteri(id), menyu: () => pageMenyu(), firmalar: () => pageFirmalar(), yigim: () => pageYigim(params), saticilar: () => pageSaticilar(params), mehsullar: () => pageMehsullar(params), cek: () => pageCek(id), etiket: () => pageEtiket(),
    rasxodlar: () => pageRasxodlar(params), isciler: () => pageIsciler(params), odenisler: () => pageOdenisler(params), cixaris: () => pageCixaris(id, params),
    kassa: () => pageKassa(), sifarisler: () => pageSifarisler(params), hesabat: () => pageHesabat(params),
    teqvim: () => pageTeqvim(params), menfeet: () => pageMenfeet(), jurnal: () => pageJurnal(params), ayarlar: () => pageAyarlar(),
    qebz: () => pageQebz(id), muqavile: () => pageMuqavile(id), admin: () => pageAdmin() }[p] || pagePanel;
  if (!S.magaza && !['admin', 'firmalar'].includes(p)) { location.hash = S.admin && !S.muhasibHesab ? '#/admin' : '#/firmalar'; return; }
  if (S.rol === 'kuryer' && !['yigim', 'qebz', 'menyu', 'firmalar'].includes(p)) { location.hash = '#/yigim'; return; }
  if (p === 'admin' && !S.admin) { location.hash = '#/panel'; return; }
  Promise.resolve(run()).catch(fail);
}
window.addEventListener('hashchange', route);

/* =====================================================================
   FİRMALARIM — bir hesabda bir neçə dükan (mühasib rejimi)
   ===================================================================== */
async function firmaSec(id) {
  if (S.magaza && S.magaza.id === id) { location.hash = window.innerWidth <= 760 ? '#/menyu' : '#/panel'; return; }
  try { await q(sb.rpc('magaza_sec', { m: id })); } catch (er) { return fail(er); }
  S.cache = {}; YOL.length = 0; history.replaceState(null, '', SAYT()); await start();
}
async function pageFirmalar() {
  const bas = S.muhasibHesab ? 'Firmalarım' : 'Dükanlarım';
  shell('firmalar', bas, '', `<input class="in" id="fax" placeholder="Axtar: firma adı" style="width:200px">
    <button class="btn" id="fqos">${ico('users')}Kodla qoşul</button><button class="btn primary" id="fyeni">${ico('plus')}Yeni firma</button>`);
  $('#fyeni').onclick = firmaYeniModal; $('#fqos').onclick = firmaQosulModal;
  const list = await q(sb.rpc('firmalarim'));
  S.firmalar = list.map(x => ({ id: x.id, ad: x.ad, rol: x.rol })).sort((a, b) => a.ad.localeCompare(b.ad, 'az'));
  if (list.length > 1 || S.muhasibHesab) S.coxFirma = true;
  const rolAd = { muhasib: 'Mühasib', sahibkar: 'Yalnız baxış', kuryer: 'Kuryer' };
  const abune = x => { const g = gunFerqi(x.abune_bitir);
    return x.dayandirilib ? '<span class="badge b-red">Dayandırılıb</span>' : g < 0 ? '<span class="badge b-red">Abunə bitib</span>'
      : g <= 7 ? `<span class="badge b-amber">Abunə: ${g} gün qalıb</span>` : `<span class="badge b-gray">Abunə: ${fd(x.abune_bitir)}</span>`; };
  const kart = x => `<div class="firma-kart ${x.secili ? 'cari' : ''}" data-f="${x.id}" data-ad="${esc(azLow(x.ad))}">
    <div class="fk-bas"><div><b>${esc(x.ad)}</b><div class="cell-sub">${esc(saheAd(x.sahe))} · ${rolAd[x.rol] || esc(x.rol)}</div></div>${x.secili ? '<span class="badge b-green">Açıqdır</span>' : ''}</div>
    <div class="fk-say"><div><span>Müştəri</span><b>${fmt(x.musteri)}</b></div><div><span>Qalıq borc</span><b>${man(x.borc)}</b></div>
      <div><span>Gecikən</span><b class="${num(x.gecikan) ? 'neg' : ''}">${fmt(x.gecikan)} nəfər · ${man(x.gecikmis_borc)}</b></div><div><span>Bu ay yığılıb</span><b>${man(x.bu_ay)}</b></div></div>
    <div class="fk-alt">${abune(x)}<span class="btn sm ${x.secili ? '' : 'primary'}">${x.secili ? 'Davam et' : 'Aç'} →</span></div></div>`;
  const cem = k => list.reduce((a, x) => a + num(x[k]), 0);
  $('.topbar .sub').textContent = list.length ? `${list.length} firma` : '';
  $('#page').innerHTML = list.length ? `${list.length > 1 ? `<div class="grid kpis" style="margin-bottom:16px">
      <div class="card kpi"><div class="lbl">Ümumi qalıq borc</div><div class="val">${man(cem('borc'))}</div><div class="cmp">${fmt(cem('musteri'))} müştəri</div></div>
      <div class="card kpi"><div class="lbl">Gecikən borc</div><div class="val neg">${man(cem('gecikmis_borc'))}</div><div class="cmp">${fmt(cem('gecikan'))} müştəri</div></div>
      <div class="card kpi"><div class="lbl">Bu ay yığılıb</div><div class="val">${man(cem('bu_ay'))}</div><div class="cmp">bütün firmalar</div></div>
      <div class="card kpi"><div class="lbl">Bu gün yığılıb</div><div class="val">${man(cem('bu_gun'))}</div><div class="cmp">${fd(today())}</div></div></div>` : ''}
    <div class="firma-grid">${list.map(kart).join('')}</div>`
    : `<div class="card empty" style="padding:40px 20px"><div style="font-size:17px;font-weight:600;margin-bottom:6px">Hələ firma yoxdur</div>
       <div class="muted" style="margin-bottom:14px">Uçotunu apardığınız ilk firmanı əlavə edin və ya dükanın verdiyi dəvət kodu ilə qoşulun.</div>
       <button class="btn primary" id="fyeni2">${ico('plus')}Yeni firma</button> <button class="btn" id="fqos2">Kodla qoşul</button></div>`;
  if ($('#fyeni2')) { $('#fyeni2').onclick = firmaYeniModal; $('#fqos2').onclick = firmaQosulModal; }
  $$('[data-f]').forEach(d => d.onclick = () => firmaSec(+d.dataset.f));
  $('#fax').oninput = e => { const t = azLow(e.target.value); $$('[data-f]').forEach(d => d.style.display = !t || d.dataset.ad.includes(t) ? '' : 'none'); };
}
function firmaYeniModal() {
  const sinaq = S.sistem.sinaq_gun || '14';
  const m = modal('Yeni firma', `<form id="nf">
    <div class="field"><label class="f">Firmanın (dükanın) adı</label><input class="in" name="ad" required placeholder="məs. Kamran Elektronika"></div>
    <div class="row2"><div class="field"><label class="f">Sahə</label><select class="in" name="sahe">${saheOpt((S.magaza && S.magaza.sahe) || 'mebel')}</select></div>
      <div class="field"><label class="f">Telefon</label><input class="in" name="tel" type="tel" placeholder="050 000 00 00"></div></div>
    <p class="muted" style="font-size:13px;margin:0">Yeni firma ${esc(sinaq)} gün pulsuz işləyir, abunəsi ayrıca hesablanır. Siz onun mühasibi olacaqsınız; dükan sahibini sonra Ayarlardakı dəvət kodu ilə əlavə edə bilərsiniz.</p></form>`,
    `<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yarat</button>`);
  const f = $('#nf', m); setTimeout(() => f.ad.focus(), 50);
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    $('#ok', m).disabled = true;
    try { const id = await q(sb.rpc('firma_yarat', { ad: f.ad.value.trim(), telefon: f.tel.value.trim() || null, sahe: f.sahe.value }));
      closeModal(); toast('Firma yaradıldı'); S.magaza = null; await firmaSec(id);
    } catch (er) { fail(er); $('#ok', m).disabled = false; }
  };
}
function firmaQosulModal() {
  const m = modal('Dəvət kodu ilə qoşul', `<form id="qf">
    <p class="muted" style="font-size:13px;margin-top:0">Kodu dükanın mühasibi Ayarlar → İstifadəçilər bölməsindən verir. Qoşulandan sonra əvvəlcə yalnız baxa bilərsiniz; yazmaq üçün dükanın mühasibi sizə "Mühasib" hüququ verməlidir.</p>
    <div class="field"><label class="f">Dəvət kodu</label><input class="in" name="kod" maxlength="6" required style="text-transform:uppercase;letter-spacing:3px;font-weight:600" placeholder="ABC123"></div></form>`,
    `<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Qoşul</button>`);
  const f = $('#qf', m); setTimeout(() => f.kod.focus(), 50);
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    try { const ad = await q(sb.rpc('firma_qosul', { kod: f.kod.value.trim().toUpperCase() }));
      closeModal(); toast(`"${ad}" əlavə olundu`, 3500); pageFirmalar().catch(fail);
    } catch (er) { fail(er); }
  };
}

/* =====================================================================
   YIĞIM SİYAHISI — kuryer / pul yığan üçün: kimdən, nə qədər, hansı ünvanda
   ===================================================================== */
async function pageYigim(params) {
  const nov = params.get('n') || 'bugun';
  const odeyer = S.rol === 'muhasib' || S.rol === 'kuryer';
  shell('yigim', 'Yığım siyahısı', fd(today()), `<div class="seg" id="yn">${[['bugun', 'Bu günə qədər'], ['hefte', 'Bu həftə'], ['hamisi', 'Bütün borclular']].map(([k, t]) => `<button data-n="${k}" class="${nov === k ? 'on' : ''}">${t}</button>`).join('')}</div>`);
  $$('#yn button').forEach(b => b.onclick = () => location.hash = '#/yigim?n=' + b.dataset.n);
  const [qr, mus] = await Promise.all([
    all(() => sb.from('v_qrafik').select('id,musteri_id,novbeti_tarix,novbeti_mebleg,gecikmis,qaliq').gt('qaliq', 0).order('id')),
    all(() => sb.from('v_musteriler').select('id,ad,unvan,telefon,qaliq,gecikme_gun').gt('qaliq', 0).order('id')),
  ]);
  const sat = await all(() => sb.from('v_satislar').select('id,satis_no,musteri_id,mal,qaliq,tarix').gt('qaliq', 0).order('id'));
  const hed = nov === 'hefte' ? iso(new Date(Date.now() + 7 * 864e5)) : today();
  const M = new Map(mus.map(x => [x.id, Object.assign({}, x, { gozlenen: 0, satislar: [] })]));
  qr.forEach(r => { if (!r.novbeti_tarix) return; const m = M.get(r.musteri_id); if (!m) return;
    if (nov === 'hamisi' || r.novbeti_tarix <= hed) { m.gozlenen += Math.max(num(r.gecikmis), num(r.novbeti_mebleg)); m.tarix = !m.tarix || r.novbeti_tarix < m.tarix ? r.novbeti_tarix : m.tarix; } });
  sat.forEach(x => { const m = M.get(x.musteri_id); if (m) m.satislar.push(x); });
  let list = [...M.values()].filter(m => nov === 'hamisi' || m.gozlenen > 0 || (m.gecikme_gun > 0 && !qr.some(r => r.musteri_id === m.id && r.novbeti_tarix)));
  list.sort((a, b) => azLow(a.unvan || 'zzz').localeCompare(azLow(b.unvan || 'zzz'), 'az') || (b.gozlenen - a.gozlenen));
  const cem = list.reduce((a, m) => a + (m.gozlenen || 0), 0);
  $('.topbar .sub').textContent = `${fd(today())} · ${list.length} müştəri · gözlənilən ${man(cem)}`;
  $('#page').innerHTML = list.length ? `<div class="yigim">${list.map(m => `<div class="card yg" data-m="${m.id}">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div><div class="cell-main" style="font-size:15.5px">${esc(m.ad)}</div><div class="muted" style="font-size:13px">${esc(m.unvan || 'ünvan yoxdur')}</div></div>
        <div style="text-align:right"><div style="font-size:18px;font-weight:700">${man(m.gozlenen || m.qaliq)}</div><div class="muted" style="font-size:12px">${m.gozlenen ? 'qalıq ' + man(m.qaliq) : 'ümumi borc'}</div></div></div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        ${m.telefon ? `<a class="btn sm" href="tel:${esc(m.telefon.replace(/\s/g, ''))}">📞 ${esc(m.telefon)}</a>` : ''}
        ${m.unvan ? `<a class="btn sm" target="_blank" href="https://www.google.com/maps/search/${encodeURIComponent(m.unvan)}">Xəritə</a>` : ''}
        ${m.tarix ? `<span class="badge ${m.tarix < today() ? 'b-red' : 'b-amber'}" style="align-self:center">${m.tarix < today() ? 'gecikib · ' : ''}${fd(m.tarix)}</span>` : (m.gecikme_gun > 0 ? `<span class="badge b-red" style="align-self:center">${m.gecikme_gun} gün</span>` : '')}
        ${odeyer && m.satislar.length ? `<button class="btn sm green" data-al="${m.id}" style="margin-left:auto">${ico('cash')}Ödəniş al</button>` : ''}</div></div>`).join('')}</div>`
    : '<div class="card empty">Bu dövr üçün yığılacaq ödəniş yoxdur</div>';
  $$('[data-al]').forEach(b => b.onclick = () => { const m = M.get(+b.dataset.al); odenisAl({ ad: m.ad, qaliq: m.qaliq }, m.satislar); });
}

/* =====================================================================
   SATICILAR — kim nə qədər satıb və bonusu
   ===================================================================== */
async function pageSaticilar(params) {
  const ay = params.get('ay') || ayBasi(today());
  const aylar = await q(sb.from('v_aylar').select('ay').order('ay', { ascending: false }));
  shell('saticilar', 'Satıcılar', ay === 'hamisi' ? 'Bütün dövr' : ayAdi(ay),
    `<select class="in" id="ay" style="width:auto"><option value="hamisi">Bütün dövr</option>${aylar.map(a => `<option value="${a.ay}" ${a.ay === ay ? 'selected' : ''}>${ayAdi(a.ay)}</option>`).join('')}</select>
     <button class="btn" onclick="window.print()">${ico('print')}Çap / PDF</button>`);
  if (ay === 'hamisi') $('#ay').value = 'hamisi';
  $('#ay').onchange = e => location.hash = '#/saticilar?ay=' + e.target.value;
  const [isc, sat] = await Promise.all([
    q(sb.from('isciler').select('id,ad,vezife,satis_faizi').order('ad')),
    all(() => { let b = sb.from('satislar').select('id,isci_id,deyer,ilkin,tarix'); if (ay !== 'hamisi') b = b.gte('tarix', ay).lte('tarix', aySonu(ay)); return b.order('id'); }),
  ]);
  const G = new Map();
  sat.forEach(x => { const k = x.isci_id || 0; const g = G.get(k) || { say: 0, cem: 0, ilkin: 0 }; g.say++; g.cem += num(x.deyer); g.ilkin += num(x.ilkin); G.set(k, g); });
  const rows = [...G.entries()].map(([k, g]) => { const i = isc.find(x => x.id === k); return { ad: i ? i.ad : 'Satıcı göstərilməyib', vez: i ? i.vezife : '', faiz: i ? num(i.satis_faizi) : 0, ...g }; })
    .sort((a, b) => b.cem - a.cem);
  const T = rows.reduce((a, r) => ({ say: a.say + r.say, cem: a.cem + r.cem, bonus: a.bonus + r.cem * r.faiz / 100 }), { say: 0, cem: 0, bonus: 0 });
  $('#page').innerHTML = rows.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Satıcı</th><th class="n">Satış sayı</th><th class="n">Satış cəmi</th><th class="n">Pay %</th><th class="n hide-m">İlkin ödənişlər</th><th class="n">Bonus %</th><th class="n">Bonus</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td><div class="cell-main">${esc(r.ad)}</div><div class="cell-sub">${esc(r.vez || '')}</div></td><td class="n">${r.say}</td><td class="n"><b>${fmt(r.cem)}</b></td>
        <td class="n">${T.cem ? Math.round(r.cem / T.cem * 100) : 0}%</td><td class="n hide-m">${fmt(r.ilkin)}</td><td class="n">${r.faiz ? fmt(r.faiz) : '—'}</td><td class="n">${r.faiz ? `<b>${fmt(Math.round(r.cem * r.faiz) / 100)}</b>` : '—'}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Cəmi</td><td class="n">${T.say}</td><td class="n">${fmt(T.cem)}</td><td></td><td class="n hide-m"></td><td></td><td class="n">${fmt(Math.round(T.bonus * 100) / 100)}</td></tr></tfoot></table></div>
      <p class="muted" style="font-size:13px">Satıcını satış formasında seçirsiniz. Bonus faizi "İşçilər" bölməsində işçinin kartında yazılır; bonusu "Ödənişlər" bölməsindən "Bonus" kimi yaza bilərsiniz.</p>`
    : '<div class="card empty">Bu dövrdə satış yoxdur</div>';
}

/* ---------------- telefon üçün kafel menyu ---------------- */
function pageMenyu() {
  if (S.rol === 'kuryer') { location.hash = '#/yigim'; return; }
  shell('menyu', firmaAdi(), canWrite() ? '' : (S.rol === 'sahibkar' ? 'Yalnız baxış' : ''), '');
  const ad = Object.fromEntries(NAV.map(n => [n[0], n]));
  const kafel = k => { const n = ad[k]; return n ? `<a class="kafel" href="#/${k}">${ico(n[2])}<span>${n[1]}</span></a>` : ''; };
  $('#page').innerHTML = `
    ${canWrite() ? `<div class="kafel-tez"><button class="btn primary" id="ts">${ico('plus')}Yeni satış</button><button class="btn" id="tm">${ico('plus')}Yeni müştəri</button></div>` : ''}
    ${S.coxFirma ? `<div class="kafel-bas">Firmalar</div><div class="kafeller"><a class="kafel" href="#/firmalar">${ico('bina')}<span>${S.muhasibHesab ? 'Firmalarım' : 'Dükanlarım'}</span></a></div>` : ''}
    ${S.admin ? `<div class="kafel-bas">Sistem</div><div class="kafeller"><a class="kafel" href="#/admin">${ico('panel')}<span>Admin panel</span></a></div>` : ''}
    ${NAVBOLME.map(([b, ks]) => `<div class="kafel-bas">${b}</div><div class="kafeller">${ks.map(kafel).join('')}</div>`).join('')}`;
  if ($('#ts')) $('#ts').onclick = () => yeniSatis();
  if ($('#tm')) $('#tm').onclick = () => yeniMusteri();
}

/* ---------------- status ---------------- */
function statusBadge(m) {
  if (num(m.qaliq) <= 0) return '<span class="badge b-green">Borcu yoxdur</span>';
  const g = m.gecikme_gun;
  if (g == null) return '';
  if (g > 0) return `<span class="badge b-red">${g} gün keçib</span>`;
  if (g === 0) return '<span class="badge b-amber">Ödəmə günü</span>';
  return `<span class="badge b-blue">${-g} gün qalıb</span>`;
}

/* =====================================================================
   PANEL
   ===================================================================== */
async function pagePanel() {
  shell('panel', 'Panel', 'Yenilənmə: ' + fd(today()), `<button class="btn" onclick="window.print()">${ico('print')}Çap / PDF</button>`);
  const [aylar, mus, isc] = await Promise.all([
    q(sb.from('v_kassa').select('*').order('ay')),
    all(() => sb.from('v_musteriler').select('id,ad,telefon,qaliq,gecikme_gun,son_tarix').order('id')),
    q(sb.from('v_isciler').select('nov,status,verilecek')),
  ]);
  const buAy = ayBasi(today());
  const kecen = iso(new Date(+buAy.slice(0, 4), +buAy.slice(5, 7) - 2, 1));
  const kat = await q(sb.from('v_rasxod_kateqoriya').select('*').eq('ay', buAy));
  const A = aylar.find(x => x.ay === buAy) || {};
  const B = aylar.find(x => x.ay === kecen) || {};
  const xalis = x => num(x.medaxil) - num(x.rasxod) - num(x.maas) - num(x.sahib) - num(x.diger_mexaric);
  const borc = mus.reduce((s, m) => s + num(m.qaliq), 0);
  const gec = mus.filter(m => num(m.qaliq) > 0 && m.gecikme_gun > 0);
  const gecCem = gec.reduce((s, m) => s + num(m.qaliq), 0);
  const isciVer = isc.filter(i => i.nov === 'İşçi' && i.status === 'İşləyir').reduce((s, i) => s + num(i.verilecek), 0);
  const kassa = aylar.length ? aylar[aylar.length - 1].ay_sonu_kassa : 0;
  const qrf = await all(() => sb.from('v_qrafik').select('id,novbeti_tarix,novbeti_mebleg,gecikmis').gt('qaliq', 0).order('id'));
  let azMeh = [];
  try { azMeh = (await q(sb.from('v_mehsullar').select('ad,anbar,min_qaliq').eq('anbar_izle', true).eq('aktiv', true))).filter(x => num(x.anbar) <= num(x.min_qaliq)); } catch (_) {}
  const hf = iso(new Date(Date.now() + 7 * 864e5));
  const hl = qrf.filter(r => r.novbeti_tarix && r.novbeti_tarix <= hf);
  const hefte = { say: hl.length, cem: hl.reduce((a, r) => a + num(r.novbeti_mebleg) + Math.max(0, num(r.gecikmis) - num(r.novbeti_mebleg)), 0) };

  const kpi = (lbl, v, prev, opt = {}) => `<div class="card kpi"><div class="lbl">${lbl}</div>
    <div class="val ${opt.sign && num(v) < 0 ? 'neg' : ''}">${opt.count ? fmt(v) : man(v)}</div>
    ${prev !== undefined ? `<div class="cmp">Keçən ay: ${opt.count ? fmt(prev) : man(prev)}</div>` : (opt.note ? `<div class="cmp">${opt.note}</div>` : '')}</div>`;

  const son12 = aylar.slice(-12);
  const mx = Math.max(1, ...son12.map(x => Math.max(num(x.satis), num(x.medaxil))));
  const chart = `<div class="bars">${son12.map(x => `<div class="col" title="${ayAdi(x.ay)}: satış ${man(x.satis)}, daxil olan ${man(x.medaxil)}">
      <div class="pair"><div class="bar" style="height:${num(x.satis) / mx * 100}%;background:var(--c1)"></div>
      <div class="bar" style="height:${num(x.medaxil) / mx * 100}%;background:var(--c2)"></div></div>
      <div class="lbl">${ayQisa(x.ay)}</div></div>`).join('')}</div>
      <div class="legend"><span><i style="background:var(--c1)"></i>Satış</span><span><i style="background:var(--c2)"></i>Kassaya daxil olan</span></div>`;

  const KATS = ['Material','Yanacaq','Nəqliyyat','Kirayə','Kommunal','Vergi','Digər'];
  const katCem = kat.reduce((s, k) => s + num(k.cem), 0);
  const katHtml = `<table class="t"><tbody>${KATS.map(k => { const r = kat.find(x => x.kateqoriya === k); return `<tr><td>${k}</td><td class="n">${man(r ? r.cem : 0)}</td></tr>`; }).join('')}</tbody>
    <tfoot><tr><td>Cəm</td><td class="n">${man(katCem)}</td></tr></tfoot></table>`;

  const top = gec.sort((a, b) => b.gecikme_gun - a.gecikme_gun).slice(0, 10);
  const topHtml = top.length ? `<table class="t"><thead><tr><th>Müştəri</th><th class="hide-m">Telefon</th><th class="n">Qalıq borc</th><th class="n">Gecikmə</th></tr></thead><tbody>
    ${top.map(m => `<tr class="click" data-m="${m.id}"><td class="cell-main">${esc(m.ad)}</td><td class="hide-m">${esc(m.telefon || '—')}</td><td class="n">${man(m.qaliq)}</td><td class="n"><span class="badge b-red">${m.gecikme_gun} gün</span></td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">Gecikən müştəri yoxdur</div>';

  const cedvel = `<table class="t"><thead><tr><th>Ay</th><th class="n">Satış</th><th class="n">Kassaya daxil</th><th class="n hide-m">Xərclər</th><th class="n hide-m">Maaş</th><th class="n hide-m">Sahib</th><th class="n">Xalis</th></tr></thead>
    <tbody>${son12.slice().reverse().map(x => `<tr><td style="white-space:nowrap">${ayAdi(x.ay)}</td><td class="n">${fmt(x.satis)}</td><td class="n">${fmt(x.medaxil)}</td><td class="n hide-m">${fmt(x.rasxod)}</td><td class="n hide-m">${fmt(x.maas)}</td><td class="n hide-m">${fmt(x.sahib)}</td><td class="n ${xalis(x) < 0 ? 'neg' : ''}">${fmt(xalis(x))}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>Cəm</td>${['satis','medaxil'].map(k => `<td class="n">${fmt(son12.reduce((s, x) => s + num(x[k]), 0))}</td>`).join('')}${['rasxod','maas','sahib'].map(k => `<td class="n hide-m">${fmt(son12.reduce((s, x) => s + num(x[k]), 0))}</td>`).join('')}<td class="n">${fmt(son12.reduce((s, x) => s + xalis(x), 0))}</td></tr></tfoot></table>`;

  $('#page').innerHTML = `
   ${azMeh.length ? `<div class="banner b-amber-bg"><b>${azMeh.length} məhsul bitmək üzrədir:</b> ${azMeh.slice(0, 5).map(x => `${esc(x.ad)} (${fmt(x.anbar)})`).join(', ')}${azMeh.length > 5 ? ' …' : ''} — <a href="#/mehsullar?az=1">bax</a></div>` : ''}
   <div class="grid kpis">
     ${kpi(`Satış — ${ayAdi(buAy)}`, A.satis, B.satis)}
     ${kpi('Satış sayı', A.satis_sayi, B.satis_sayi, { count: true })}
     ${kpi('Kassaya daxil olan pul', A.medaxil, B.medaxil)}
     ${kpi('Xərclər', A.rasxod, B.rasxod)}
     ${kpi('İşçilərə verilən maaş', A.maas, B.maas)}
     ${kpi('Sahib götürmələri', A.sahib, B.sahib)}
     ${kpi('Daxil olan − çıxan', xalis(A), xalis(B), { sign: true })}
     ${kpi('Hazırda kassada', kassa, undefined, { sign: true, note: 'Kassa hesabına görə' })}
     ${kpi('Ümumi müştəri borcu', borc, undefined, { note: mus.filter(m => num(m.qaliq) > 0).length + ' borclu müştəri' })}
     ${kpi('Gecikən borc (30+ gün)', gecCem, undefined, { note: gec.length + ' müştəri' })}
     ${kpi('İşçilərə veriləcək maaş', isciVer, undefined, { sign: true, note: 'İşləyən işçilər üzrə' })}
     ${kpi('Bu həftə gözlənilən ödəniş', hefte.cem, undefined, { note: `${hefte.say} satış · <a href="#/teqvim">təqvim</a>` })}
   </div>
   <div class="grid two" style="margin-top:16px">
     <div class="card"><h3>Son 12 ay</h3>${chart}</div>
     <div class="card"><h3>Bu ayın xərcləri</h3>${katHtml}</div>
   </div>
   <div class="card" style="padding:0;margin-top:16px"><h3 style="padding:18px 20px 0">Ən çox gecikən 10 müştəri</h3>${topHtml}</div>
   <div class="card" style="padding:0;overflow:auto;margin-top:16px"><h3 style="padding:18px 20px 0">Aylar üzrə (son 12 ay)</h3>${cedvel}</div>`;
  $$('[data-m]').forEach(tr => tr.onclick = () => location.hash = '#/musteri/' + tr.dataset.m);
}

/* =====================================================================
   SATIŞLAR
   ===================================================================== */
async function pageSatislar(params) {
  const ay = params.get('ay') || ayBasi(today());
  const aylar = await q(sb.from('v_aylar').select('ay').order('ay', { ascending: false }));
  const sel = `<select class="in" id="ay" style="width:auto">${'<option value="hamisi">Bütün aylar</option>' + aylar.map(a => `<option value="${a.ay}" ${a.ay === ay ? 'selected' : ''}>${ayAdi(a.ay)}</option>`).join('')}</select>`;
  shell('satislar', 'Satışlar', ay === 'hamisi' ? 'Bütün satışlar' : ayAdi(ay),
    `<input class="in search" id="axtar" placeholder="Axtar: müştəri, mal, telefon, №">${sel}
     ${canWrite() ? `<button class="btn" id="idx">${ico('up')}Excel-dən yüklə</button><button class="btn primary" id="yeni">${ico('plus')}Yeni satış</button>` : ''}
     <button class="btn" onclick="window.print()">${ico('print')}Çap</button>`);
  if (ay === 'hamisi') $('#ay').value = 'hamisi';
  if ($('#idx')) $('#idx').onclick = () => satisIdxal();
  $('#ay').onchange = e => location.hash = '#/satislar?ay=' + e.target.value;
  if ($('#yeni')) $('#yeni').onclick = () => yeniSatis();

  const rows = await all(() => {
    let b = sb.from('v_satislar').select('*');
    if (ay !== 'hamisi') b = b.gte('tarix', ay).lte('tarix', aySonu(ay));
    return b.order('tarix').order('id');
  });
  const draw = () => {
    const s = ($('#axtar').value || '').toLocaleLowerCase('az');
    const list = s ? rows.filter(r => [r.satis_no, r.musteri, r.mal, r.telefon, r.unvan].join(' ').toLocaleLowerCase('az').includes(s)) : rows;
    const sum = k => list.reduce((a, r) => a + num(r[k]), 0);
    $('#page').innerHTML = list.length ? `<div class="tbl-wrap"><table class="t">
      <thead><tr><th>№</th><th>Tarix</th><th>Müştəri</th><th class="hide-m">Mal</th><th>Üsul</th><th class="n">Dəyəri</th><th class="n hide-m">İlkin</th><th class="n hide-m">Ödənilən</th><th class="n">Qalıq</th><th class="hide-m">Son ödəniş</th></tr></thead>
      <tbody>${list.map(r => `<tr class="click" data-s="${r.id}">
        <td class="muted">${esc(r.satis_no)}</td><td>${fd(r.tarix)}</td>
        <td><div class="cell-main">${esc(r.musteri)}</div><div class="cell-sub">${esc(r.unvan || '')}${r.telefon ? ' · ' + esc(r.telefon) : ''}</div></td>
        <td class="hide-m">${esc(r.mal || '')}</td><td>${usulBadge(r.odenis_usulu)}</td><td class="n">${fmt(r.deyer)}</td><td class="n hide-m">${fmt(r.ilkin)}</td>
        <td class="n hide-m">${fmt(r.odenilen)}</td><td class="n">${num(r.qaliq) > 0 ? `<b>${fmt(r.qaliq)}</b>` : '<span class="badge b-green">Bağlanıb</span>'}</td>
        <td class="hide-m">${fd(r.son_odenis)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">${list.length} satış</td><td></td><td class="hide-m"></td><td></td><td class="n">${fmt(sum('deyer'))}</td><td class="n hide-m">${fmt(sum('ilkin'))}</td><td class="n hide-m">${fmt(sum('odenilen'))}</td><td class="n">${fmt(sum('qaliq'))}</td><td class="hide-m"></td></tr></tfoot>
      </table></div>` : '<div class="card empty">Bu dövrdə satış yoxdur</div>';
    $$('[data-s]').forEach(tr => tr.onclick = () => satisModal(+tr.dataset.s));
  };
  $('#axtar').oninput = draw;
  draw();
}

async function satisModal(id) {
  const [s, pays, qr, z, cer, A] = await Promise.all([
    q(sb.from('v_satislar').select('*').eq('id', id).single()),
    q(sb.from('satis_odenisleri').select('*').eq('satis_id', id).order('tarix').order('id')),
    q(sb.from('v_qrafik').select('*').eq('id', id).maybeSingle()),
    q(sb.from('satislar').select('zamin_ad,zamin_tel,zamin_qeyd').eq('id', id).single()),
    q(sb.from('satis_cerimeleri').select('*').eq('satis_id', id).order('tarix')),
    ayarlar(),
  ]);
  const ch = cerimeHesabla(s, qr, A);
  const yazilib = cer.reduce((a, x) => a + num(x.mebleg), 0);
  const yeniCer = ch ? Math.round((ch.cem - yazilib) * 100) / 100 : 0;
  const w = canWrite();
  const cet = qr && qr.qrafikli ? qrafikCetveli(s, qr) : [];
  const m = modal(`Satış ${esc(s.satis_no)}`, `
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <div><div class="cell-main" style="font-size:16px">${esc(s.musteri)}</div><div class="cell-sub">${esc(s.unvan || '')}${s.telefon ? ' · ' + esc(s.telefon) : ''}</div></div>
      <div style="text-align:right"><div>${fd(s.tarix)} ${usulBadge(s.odenis_usulu)}</div><div class="cell-sub">${esc(s.mal || '')}</div></div></div>
    <div class="info"><div><span>Dəyəri</span><b>${man(s.deyer)}</b></div><div><span>İlkin ödəniş</span><b>${man(s.ilkin)}</b></div>
      <div><span>Kredit ödənişləri</span><b>${man(s.odenilen)}</b></div><div><span>Qalıq borc</span><b class="${num(s.qaliq) > 0 ? 'neg' : 'pos'}">${man(s.qaliq)}</b></div>
      <div><span>Ödəniş sayı</span><b>${s.odenis_sayi}</b></div><div><span>Son ödəniş</span><b>${fd(s.son_odenis) || '—'}</b></div></div>
    ${s.qeyd ? `<p class="muted">Qeyd: ${esc(s.qeyd)}</p>` : ''}
    <p id="qytlist" style="margin:6px 0"></p>
    ${z.zamin_ad ? `<p style="margin:6px 0"><span class="muted">Zamin:</span> <b>${esc(z.zamin_ad)}</b>${z.zamin_tel ? ' · <a href="tel:' + esc(z.zamin_tel) + '">' + esc(z.zamin_tel) + '</a>' : ''}${z.zamin_qeyd ? ' · ' + esc(z.zamin_qeyd) : ''}</p>` : ''}
    ${cer.length ? `<p style="margin:6px 0"><span class="muted">Yazılmış cərimə:</span> <b class="neg">${man(yazilib)}</b> ${cer.map(c => `<span class="badge b-red" title="${esc(c.qeyd || '')}">${fd(c.tarix)}: ${fmt(c.mebleg)}${w ? ` <a href="#" data-csil="${c.id}" style="color:inherit">✕</a>` : ''}</span>`).join(' ')}</p>` : ''}
    ${ch && yeniCer > 0.009 ? `<div class="banner b-amber-bg" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <span>Gecikmə cəriməsi: <b>${man(yeniCer)}</b> <span class="muted">(gecikən ${man(ch.gecikmis)}, ən çox ${ch.gun} gün)</span></span>
      ${w ? '<button class="btn sm" id="cyaz">Borca əlavə et</button>' : ''}</div>` : ''}
    ${qr && qr.maya != null ? `<p class="muted">Maya dəyəri: ${man(qr.maya)} · mənfəət: <b class="${num(s.deyer) - num(qr.maya) < 0 ? 'neg' : 'pos'}">${man(num(s.deyer) - num(qr.maya))}</b></p>` : ''}
    ${cet.length ? `<h4 style="margin:6px 0 8px">Ödəniş qrafiki <span class="muted" style="font-weight:400">· ayda ${man(qr.ayliq)}${num(qr.gecikmis) > 0 ? ` · <span class="neg">gecikən ${man(qr.gecikmis)}</span>` : ''}</span></h4>
      <div class="tbl-wrap" style="box-shadow:none;border:1px solid var(--line);max-height:260px;margin-bottom:14px"><table class="t"><thead><tr><th>#</th><th>Tarix</th><th class="n">Məbləğ</th><th>Vəziyyət</th></tr></thead><tbody>
      ${cet.map(c => `<tr><td class="muted">${c.no}</td><td>${fd(c.tarix)}</td><td class="n">${fmt(c.mebleg)}</td><td>${qrafikBadge(c.status)}</td></tr>`).join('')}</tbody></table></div>`
      : (num(s.qaliq) > 0 && w ? '<p class="muted">Ödəniş qrafiki yoxdur — "Satışı düzəlt" ilə aylıq məbləği və ilk ödəniş tarixini yazın.</p>' : '')}
    <h4 style="margin:6px 0 8px">Ödənişlər</h4>
    ${pays.length ? `<div class="tbl-wrap" style="box-shadow:none;border:1px solid var(--line)"><table class="t"><thead><tr><th>#</th><th>Tarix</th><th class="n">Məbləğ</th><th>Qeyd</th><th></th></tr></thead><tbody>
      ${pays.map((p, i) => `<tr><td class="muted">${i + 1}</td><td>${fd(p.tarix)} ${p.texmini ? '<span class="badge b-gray" title="Excel-də tarixi yazılmamışdı, təxmini qoyulub">təxmini</span>' : ''}${p.usul === 'POS' ? ' <span class="badge b-blue">POS</span>' : ''}</td><td class="n">${fmt(p.mebleg)}</td><td>${esc(p.qeyd || '')}</td>
      <td class="n" style="white-space:nowrap"><a class="btn sm" href="#/qebz/${p.id}">Qəbz</a> ${w ? `<button class="btn sm danger" data-del="${p.id}">Sil</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="muted">Hələ ödəniş yoxdur.</div>'}
    ${w && num(s.qaliq) > 0 ? `<form id="pf" style="margin-top:16px;background:#faf4ea;border-radius:10px;padding:14px">
      <b style="display:block;margin-bottom:10px">Yeni ödəniş</b>
      <div class="row2"><div class="field"><label class="f">Tarix</label><input class="in" type="date" name="t" value="${today()}" required></div>
      <div class="field"><label class="f">Məbləğ (qalıq ${fmt(s.qaliq)})</label><input class="in" type="number" step="0.01" min="0.01" name="m" required></div></div>
      <div class="row2"><div class="field"><label class="f">Üsul</label><select class="in" name="u"><option>Nağd</option><option>POS</option></select></div>
      <div class="field"><label class="f">Qeyd (istəyə bağlı)</label><input class="in" name="q"></div></div>
      <button class="btn green">Ödənişi yaz</button></form>` : ''}`,
    `${w ? '<button class="btn" id="qyt">Qaytarma</button>' : ''}<a class="btn" href="#/cek/${s.id}">${ico('print')}Çek</a><a class="btn" href="#/muqavile/${s.id}">Müqavilə (PDF)</a><a class="btn" href="#/musteri/${s.musteri_id}">Müştəriyə bax</a>${w ? '<button class="btn" id="ed">Satışı düzəlt</button>' : ''}<button class="btn" data-close>Bağla</button>`, true);
  $$('[data-close]', m).forEach(b => b.onclick = closeModal);
  const pf = $('#pf', m);
  if (pf) pf.onsubmit = async e => {
    e.preventDefault();
    const mb = num(pf.m.value);
    if (mb > num(s.qaliq) + 0.001 && !confirm(`Məbləğ qalıq borcdan (${fmt(s.qaliq)}) çoxdur. Yenə də yazılsın?`)) return;
    $('button', pf).disabled = true;
    try {
      const np = await q(sb.from('satis_odenisleri').insert({ satis_id: id, tarix: pf.t.value, mebleg: mb, usul: pf.u.value, qeyd: pf.q.value.trim() || null }).select().single());
      toast('Ödəniş yazıldı'); S.cache = {};
      if (confirm('Ödəniş yazıldı. Müştəri üçün qəbz çap edilsin?')) location.hash = '#/qebz/' + np.id; else { refresh(); satisModal(id); }
    } catch (er) { fail(er); $('button', pf).disabled = false; }
  };
  if ($('#qyt', m)) $('#qyt', m).onclick = () => qaytarmaModal(s).catch(fail);
  q(sb.from('satis_qaytarmalari').select('*').eq('satis_id', id).order('tarix')).then(qs => {
    if (!qs.length || !$('#qytlist', m)) return;
    $('#qytlist', m).innerHTML = `<span class="muted">Qaytarmalar:</span> ${qs.map(x => `<span class="badge b-amber" title="${esc(x.qeyd || '')}">${fd(x.tarix)}: −${fmt(x.mebleg)}${num(x.geri_pul) ? ` (nağd ${fmt(x.geri_pul)})` : ''}${x.mallar ? ' · ' + esc(x.mallar) : ''}</span>`).join(' ')}`;
  }).catch(() => {});
  if ($('#cyaz', m)) $('#cyaz', m).onclick = async () => {
    if (!confirm(`${man(yeniCer)} gecikmə cəriməsi müştərinin borcuna əlavə edilsin?`)) return;
    try { await q(sb.from('satis_cerimeleri').insert({ satis_id: id, tarix: today(), mebleg: yeniCer, qeyd: `${ch.gun} gün gecikmə, gecikən ${fmt(ch.gecikmis)} ₼` })); toast('Cərimə borca əlavə olundu'); refresh(); satisModal(id); } catch (er) { fail(er); }
  };
  $$('[data-csil]', m).forEach(b => b.onclick = async e => {
    e.preventDefault(); if (!confirm('Bu cərimə silinsin?')) return;
    try { await q(sb.from('satis_cerimeleri').delete().eq('id', +b.dataset.csil)); toast('Cərimə silindi'); refresh(); satisModal(id); } catch (er) { fail(er); }
  });
  $$('[data-del]', m).forEach(b => b.onclick = async () => {
    if (!confirm('Bu ödəniş silinsin?')) return;
    try { await q(sb.from('satis_odenisleri').delete().eq('id', +b.dataset.del)); toast('Ödəniş silindi'); refresh(); satisModal(id); } catch (er) { fail(er); }
  });
  if ($('#ed', m)) $('#ed', m).onclick = () => satisDuzelt(Object.assign({}, s, { ayliq: qr && qr.ayliq, ilk_odenis: qr && qr.ilk_odenis, maya: qr && qr.maya }));
}

async function satisDuzelt(s, birbasa) {
  const [z, kohne] = await Promise.all([
    q(sb.from('satislar').select('zamin_ad,zamin_tel,zamin_qeyd,isci_id,odenis_usulu,ilkin_pos').eq('id', s.id).single()),
    q(sb.from('satis_mallari').select('*').eq('satis_id', s.id).order('id')),
  ]);
  const m = modal(`Satışı düzəlt — ${esc(s.satis_no)}`, `<form id="ef">
    ${MEHSUL_SAHESI}
    <div class="row2"><div class="field"><label class="f">Tarix</label><input class="in" type="date" name="t" value="${s.tarix}" required></div>
    <div class="field"><label class="f">Götürdüyü mal</label><input class="in" name="mal" value="${esc(s.mal || '')}"></div></div>
    <div class="field"><label class="f">Malın dəyəri</label><input class="in" type="number" step="0.01" min="0" name="d" value="${s.deyer}" required></div>
    ${USUL_SAHESI(z.odenis_usulu || 'Borc', s.ilkin, z.ilkin_pos)}
    ${SATICI_SAHESI}
    ${qrafikSaheleri(s.ayliq, s.ilk_odenis, s.maya)}
    ${zaminSaheleri(z)}
    <div class="field"><label class="f">Qeyd</label><input class="in" name="q" value="${esc(s.qeyd || '')}"></div></form>`,
    `<button class="btn danger" id="sil" style="margin-right:auto">Satışı sil</button><button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yadda saxla</button>`);
  $$('[data-close]', m).forEach(b => b.onclick = () => birbasa ? closeModal() : satisModal(s.id));
  const f = $('#ef', m);
  const setirler = kohne.map(x => ({ mehsul_id: x.mehsul_id, ad: x.ad, miqdar: num(x.miqdar), qiymet: num(x.qiymet), maya: x.maya == null ? null : num(x.maya) }));
  const ilkVeziyyet = JSON.stringify(setirler);
  saticiDoldur(f.sat, z.isci_id || null).catch(() => {});
  const usulAl = usulIzle(m, f);
  await setirRedaktor(m, f, setirler, null);
  qrafikIzle(f);
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    try {
      const U = usulAl(); if (U.xeta) return toast(U.xeta);
      await q(sb.from('satislar').update(Object.assign({ tarix: f.t.value, mal: f.mal.value.trim() || null, deyer: num(f.d.value), qeyd: f.q.value.trim() || null }, qrafikDeyerleri(f), zaminDeyerleri(f), { isci_id: f.sat.value ? +f.sat.value : null }, { odenis_usulu: U.odenis_usulu, ilkin: U.ilkin, ilkin_pos: U.ilkin_pos })).eq('id', s.id));
      if (JSON.stringify(setirler) !== ilkVeziyyet) {
        await q(sb.from('satis_mallari').delete().eq('satis_id', s.id));
        if (setirler.length) await q(sb.from('satis_mallari').insert(setirler.map(x => ({ satis_id: s.id, mehsul_id: x.mehsul_id, ad: x.ad, miqdar: x.miqdar, qiymet: x.qiymet, maya: x.maya }))));
      }
      toast('Satış yeniləndi'); refresh(); if (!birbasa) satisModal(s.id);
    } catch (er) { fail(er); }
  };
  $('#sil', m).onclick = async () => {
    if (!confirm(`${s.satis_no} satışı və onun bütün ödənişləri silinsin? Bu geri qaytarılmır.`)) return;
    try { await q(sb.from('satislar').delete().eq('id', s.id)); closeModal(); toast('Satış silindi'); refresh(); } catch (er) { fail(er); }
  };
}

async function yeniSatis(musteriId, pref) {
  const mus = S.cache.mus || (S.cache.mus = await all(() => sb.from('v_musteriler').select('id,ad,telefon,unvan,qaliq').order('id')));
  let secilen = musteriId ? mus.find(x => x.id === musteriId) : null;
  const m = modal('Yeni satış', `<form id="sf">
    <div class="field"><label class="f">Müştəri</label>
      <div class="seg" id="mtip"><button type="button" data-t="kohne" class="on">Mövcud müştəri</button><button type="button" data-t="yeni">Yeni müştəri</button></div></div>
    <div id="mkohne" class="field">
      <div id="mchip"></div>
      <input class="in" id="max" placeholder="Ad, telefon və ya ünvan yazın…" autocomplete="off">
      <div class="suggest" id="msug" style="display:none"></div></div>
    <div id="myeni" style="display:none">
      <div class="field"><label class="f">Ad Soyad</label><input class="in" name="ad"></div>
      <div class="row2"><div class="field"><label class="f">Ünvan</label><input class="in" name="un"></div>
      <div class="field"><label class="f">Telefon</label><input class="in" name="tel" inputmode="tel"></div></div></div>
    ${MEHSUL_SAHESI}
    <div class="row2"><div class="field"><label class="f">Tarix</label><input class="in" type="date" name="t" value="${today()}" required></div>
    <div class="field"><label class="f">Götürdüyü mal</label><input class="in" name="mal" placeholder="məs. ${esc(numune()[2])}"></div></div>
    <div class="field"><label class="f">Malın dəyəri <span class="muted" style="font-weight:400" id="endinfo"></span></label><input class="in" type="number" step="0.01" min="0" name="d" required></div>
    ${USUL_SAHESI(localStorage_usul(), 0, 0)}
    ${SATICI_SAHESI}
    ${qrafikSaheleri(null, null, null)}
    ${zaminSaheleri(null)}
    <div class="field"><label class="f">Qeyd (istəyə bağlı)</label><input class="in" name="q"></div>
    <div class="muted" id="qal"></div></form>`,
    `<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Satışı yaz</button>`);
  let tip = 'kohne';
  const chip = () => {
    $('#mchip', m).innerHTML = secilen ? `<div class="chip" style="margin-bottom:8px">${esc(secilen.ad)} ${secilen.telefon ? '· ' + esc(secilen.telefon) : ''}${num(secilen.qaliq) > 0 ? ` · borc ${fmt(secilen.qaliq)}` : ''} <a href="#" id="dəyiş" style="margin-left:4px">dəyiş</a></div>` : '';
    $('#max', m).style.display = secilen ? 'none' : '';
    const d = $('#dəyiş', m); if (d) d.onclick = e => { e.preventDefault(); secilen = null; chip(); $('#max', m).focus(); };
  };
  chip();
  $$('#mtip button', m).forEach(b => b.onclick = () => {
    tip = b.dataset.t; $$('#mtip button', m).forEach(x => x.classList.toggle('on', x === b));
    $('#mkohne', m).style.display = tip === 'kohne' ? '' : 'none'; $('#myeni', m).style.display = tip === 'yeni' ? '' : 'none';
  });
  const sug = $('#msug', m);
  $('#max', m).oninput = e => {
    const s = e.target.value.trim().toLocaleLowerCase('az');
    if (s.length < 2) { sug.style.display = 'none'; return; }
    const list = mus.filter(x => [x.ad, x.telefon, x.unvan].join(' ').toLocaleLowerCase('az').includes(s)).slice(0, 30);
    sug.style.display = '';
    sug.innerHTML = list.length ? list.map(x => `<div data-id="${x.id}"><b>${esc(x.ad)}</b> <span class="muted">${esc(x.unvan || '')} ${esc(x.telefon || '')}</span>${num(x.qaliq) > 0 ? ` <span class="badge b-amber">borc ${fmt(x.qaliq)}</span>` : ''}</div>`).join('')
      : '<div class="muted" style="cursor:default">Tapılmadı — "Yeni müştəri" seçin</div>';
    $$('[data-id]', sug).forEach(d => d.onclick = () => { secilen = mus.find(x => x.id === +d.dataset.id); sug.style.display = 'none'; e.target.value = ''; chip(); });
  };
  const f = $('#sf', m);
  const qal = () => { $('#qal', m).textContent = f.d.value ? `Kreditə qalan: ${man(num(f.d.value) - num(f.i.value))}` : '';
    const cem = setirler.reduce((a, x) => a + x.miqdar * x.qiymet, 0);
    $('#endinfo', m).textContent = setirler.length && f.d.value && num(f.d.value) < cem - 0.001 ? `· endirim ${fmt(cem - num(f.d.value))}` : ''; };
  f.d.oninput = qal; f.i.oninput = qal;
  saticiDoldur(f.sat).catch(() => {});
  // --- məhsul sətirləri ---
  const setirler = [];
  await setirRedaktor(m, f, setirler, qal);
  const usulAl = usulIzle(m, f);
  qrafikIzle(f, true);
  if (pref) {
    $('#mtip button[data-t="yeni"]', m).click();
    f.ad.value = pref.ad || ''; f.un.value = pref.unvan || ''; f.tel.value = pref.tel || '';
    f.mal.value = pref.mal || ''; if (pref.deyer) f.d.value = pref.deyer; qal();
  }
  $$('[data-close]', m).forEach(b => b.onclick = closeModal);
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    if (tip === 'kohne' && !secilen) { toast('Müştərini seçin və ya "Yeni müştəri" yazın'); return; }
    if (tip === 'yeni' && !f.ad.value.trim()) { toast('Müştərinin adını yazın'); return; }
    const U = usulAl(); if (U.xeta) { toast(U.xeta); return; }
    const btn = $('#ok', m); btn.disabled = true;
    try {
      let mid = secilen && secilen.id;
      if (tip === 'yeni') {
        const nm = await q(sb.from('musteriler').insert({ ad: f.ad.value.trim(), unvan: f.un.value.trim() || null, telefon: f.tel.value.trim() || null }).select().single());
        mid = nm.id;
      }
      const ns = await q(sb.from('satislar').insert(Object.assign({ musteri_id: mid, tarix: f.t.value, mal: f.mal.value.trim() || null, deyer: num(f.d.value), qeyd: f.q.value.trim() || null }, qrafikDeyerleri(f), zaminDeyerleri(f), { isci_id: f.sat.value ? +f.sat.value : null }, { odenis_usulu: U.odenis_usulu, ilkin: U.ilkin, ilkin_pos: U.ilkin_pos })).select().single());
      try { localStorage.setItem('son_usul', U.odenis_usulu); } catch (_) {}
      if (setirler.length) await q(sb.from('satis_mallari').insert(setirler.map(x => ({ satis_id: ns.id, mehsul_id: x.mehsul_id, ad: x.ad, miqdar: x.miqdar, qiymet: x.qiymet, maya: x.maya }))));
      if (pref && pref.sifarisId) await q(sb.from('sifarisler').update({ status: 'Təhvil verildi' }).eq('id', pref.sifarisId));
      closeModal(); toast(`Satış yazıldı: ${ns.satis_no}`); S.cache = {};
      if (confirm(`Satış yazıldı: ${ns.satis_no}. Müştəri üçün çek çap edilsin?`)) location.hash = '#/cek/' + ns.id; else refresh();
    } catch (er) { fail(er); btn.disabled = false; }
  };
}

function localStorage_usul() { try { const u = localStorage.getItem('son_usul'); return USULLAR.includes(u) ? u : 'Borc'; } catch (_) { return 'Borc'; } }
function refresh() { S.cache = {}; route(); }

/* =====================================================================
   MÜŞTƏRİLƏR
   ===================================================================== */
async function pageMusteriler(params) {
  const fil = params.get('f') || 'borclu';
  shell('musteriler', 'Müştərilər', '', `<input class="in search" id="axtar" placeholder="Axtar: ad, telefon, ünvan">
    <div class="seg" id="fil">${[['borclu','Borclular'],['gecikenler','Gecikənlər'],['hamisi','Hamısı']].map(([k, t]) => `<button data-f="${k}" class="${fil === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    ${canWrite() ? `<button class="btn" id="idx">${ico('up')}Excel-dən yüklə</button><button class="btn primary" id="yeni">${ico('plus')}Yeni müştəri</button>` : ''}
    <button class="btn" onclick="window.print()">${ico('print')}Çap</button>`);
  $$('#fil button').forEach(b => b.onclick = () => location.hash = '#/musteriler?f=' + b.dataset.f);
  if ($('#yeni')) $('#yeni').onclick = () => yeniMusteri();
  if ($('#idx')) $('#idx').onclick = () => musteriIdxal();
  const rows = S.cache.musAll || (S.cache.musAll = await all(() => sb.from('v_musteriler').select('*').order('id')));
  const draw = () => {
    const s = ($('#axtar').value || '').toLocaleLowerCase('az');
    let list = rows;
    if (fil === 'borclu') list = list.filter(r => num(r.qaliq) > 0);
    if (fil === 'gecikenler') list = list.filter(r => num(r.qaliq) > 0 && r.gecikme_gun > 0);
    if (s) list = list.filter(r => [r.ad, r.telefon, r.unvan].join(' ').toLocaleLowerCase('az').includes(s));
    list = list.slice().sort((a, b) => fil === 'hamisi' ? a.id - b.id : (num(b.gecikme_gun) - num(a.gecikme_gun)) || (num(b.qaliq) - num(a.qaliq)));
    const sum = k => list.reduce((a, r) => a + num(r[k]), 0);
    $('.topbar .sub').textContent = `${list.length} müştəri · qalıq borc ${man(sum('qaliq'))}`;
    $('#page').innerHTML = list.length ? `<div class="tbl-wrap"><table class="t">
      <thead><tr><th>Müştəri</th><th class="hide-m">Ünvan</th><th class="n hide-m">Satış</th><th class="n hide-m">Cəm</th><th class="n hide-m">Verilən</th><th class="n">Qalıq</th><th class="hide-m">Son ödəniş/alış</th><th>Vəziyyət</th></tr></thead>
      <tbody>${list.map(r => `<tr class="click" data-m="${r.id}"><td><div class="cell-main">${esc(r.ad)}</div><div class="cell-sub">${esc(r.telefon || '')}</div></td>
        <td class="hide-m">${esc(r.unvan || '')}</td><td class="n hide-m">${r.satis_sayi}</td><td class="n hide-m">${fmt(r.cem)}</td><td class="n hide-m">${fmt(r.verilen)}</td>
        <td class="n"><b>${fmt(r.qaliq)}</b></td><td class="hide-m">${fd(r.son_tarix)}</td><td>${statusBadge(r)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>${list.length} müştəri</td><td class="hide-m"></td><td class="n hide-m">${fmt(sum('satis_sayi'))}</td><td class="n hide-m">${fmt(sum('cem'))}</td><td class="n hide-m">${fmt(sum('verilen'))}</td><td class="n">${fmt(sum('qaliq'))}</td><td class="hide-m"></td><td></td></tr></tfoot>
      </table></div>` : '<div class="card empty">Müştəri tapılmadı</div>';
    $$('[data-m]').forEach(tr => tr.onclick = () => location.hash = '#/musteri/' + tr.dataset.m);
  };
  $('#axtar').oninput = draw;
  draw();
}

async function yeniMusteri() {
  const mus = S.cache.musAll || await all(() => sb.from('v_musteriler').select('id,ad,telefon,unvan').order('id'));
  const m = modal('Yeni müştəri', `<form id="nm">
    <div class="field"><label class="f">Ad Soyad</label><input class="in" name="ad" required autocomplete="off"></div>
    <div class="row2"><div class="field"><label class="f">Telefon</label><input class="in" name="tel" inputmode="tel" placeholder="050 000 00 00"></div>
    <div class="field"><label class="f">Ünvan</label><input class="in" name="un"></div></div>
    <div class="field"><label class="f">Qeyd (istəyə bağlı)</label><input class="in" name="q" placeholder="məs. iş yeri, zamin, şəxsiyyət vəsiqəsi"></div>
    <div id="eyni" class="muted" style="font-size:13px"></div></form>`,
    `<button class="btn" data-close>Ləğv et</button><button class="btn" id="oksatis">Yadda saxla və satış et</button><button class="btn primary" id="ok">Yadda saxla</button>`);
  const f = $('#nm', m);
  const reqemler = t => String(t || '').replace(/\D/g, '').slice(-9);
  const yoxla = () => {
    const ad = azLow(f.ad.value), tel = reqemler(f.tel.value);
    const ox = mus.filter(x => (ad.length > 3 && azLow(x.ad) === ad) || (tel.length >= 7 && reqemler(x.telefon) === tel)).slice(0, 3);
    $('#eyni', m).innerHTML = ox.length ? `<span class="neg">Diqqət: oxşar müştəri artıq var —</span> ${ox.map(x => `<a href="#/musteri/${x.id}">${esc(x.ad)}${x.telefon ? ' (' + esc(x.telefon) + ')' : ''}</a>`).join(', ')}` : '';
  };
  f.ad.oninput = yoxla; f.tel.oninput = yoxla;
  setTimeout(() => f.ad.focus(), 50);
  const yaz = async sonra => {
    if (!f.reportValidity()) return;
    $$('.mf .btn', m).forEach(b => b.disabled = true);
    try {
      const nm = await q(sb.from('musteriler').insert({ ad: f.ad.value.trim(), telefon: f.tel.value.trim() || null, unvan: f.un.value.trim() || null, qeyd: f.q.value.trim() || null }).select().single());
      S.cache = {}; closeModal(); toast('Müştəri əlavə olundu: ' + nm.ad);
      location.hash = '#/musteri/' + nm.id;
      if (sonra) setTimeout(() => yeniSatis(nm.id), 400);
    } catch (er) { fail(er); $$('.mf .btn', m).forEach(b => b.disabled = false); }
  };
  $('#ok', m).onclick = () => yaz(false);
  $('#oksatis', m).onclick = () => yaz(true);
  f.onsubmit = e => { e.preventDefault(); yaz(false); };
}

async function pageMusteri(id) {
  id = +id;
  shell('musteriler', 'Müştəri', '', '');
  const [m, sales] = await Promise.all([
    q(sb.from('v_musteriler').select('*').eq('id', id).single()),
    q(sb.from('v_satislar').select('*').eq('musteri_id', id).order('tarix').order('id')),
  ]);
  const pays = sales.length ? await q(sb.from('satis_odenisleri').select('*').in('satis_id', sales.map(s => s.id)).order('tarix').order('id')) : [];
  const cers = sales.length ? await q(sb.from('satis_cerimeleri').select('*').in('satis_id', sales.map(s => s.id)).order('tarix')) : [];
  const w = canWrite();
  $('.topbar').innerHTML = `<div><h2>${esc(m.ad)}</h2><div class="sub">${esc(m.unvan || '')}${m.telefon ? ' · ' + esc(m.telefon) : ''}</div></div>
    <div class="tools"><a class="btn" href="#/musteriler">← Siyahı</a>${w ? `${num(m.qaliq) > 0 ? `<button class="btn green" id="odal">${ico('cash')}Ödəniş al</button>` : ''}<button class="btn" id="ed">Məlumatı düzəlt</button><button class="btn primary" id="yeni">${ico('plus')}Yeni satış</button>` : ''}
    <button class="btn" onclick="window.print()">${ico('print')}Çap / PDF</button></div>`;
  const satNo = Object.fromEntries(sales.map(s => [s.id, s.satis_no]));
  // hesab çıxarışı: satışlar (+) və ödənişlər (−) tarix sırası ilə
  const hereket = [];
  sales.forEach(s => { hereket.push({ t: s.tarix, k: 0, ad: `Satış ${s.satis_no}${s.mal ? ' — ' + s.mal : ''}`, borc: num(s.deyer) });
    if (num(s.ilkin) > 0) hereket.push({ t: s.tarix, k: 1, ad: `İlkin ödəniş (${s.satis_no})`, od: num(s.ilkin) }); });
  cers.forEach(c => hereket.push({ t: c.tarix, k: 1.5, ad: `Gecikmə cəriməsi (${satNo[c.satis_id]})`, borc: num(c.mebleg) }));
  pays.forEach(p => hereket.push({ t: p.tarix, k: 2, ad: `Ödəniş (${satNo[p.satis_id]})${p.texmini ? ' · təxmini tarix' : ''}${p.qeyd ? ' — ' + p.qeyd : ''}`, od: num(p.mebleg) }));
  hereket.sort((a, b) => a.t < b.t ? -1 : a.t > b.t ? 1 : a.k - b.k);
  let bal = 0;
  $('#page').innerHTML = `
    <div class="grid kpis">
      <div class="card kpi"><div class="lbl">Cəm alış</div><div class="val">${man(m.cem)}</div><div class="cmp">${m.satis_sayi} satış</div></div>
      <div class="card kpi"><div class="lbl">Verilən pul</div><div class="val">${man(m.verilen)}</div></div>
      <div class="card kpi"><div class="lbl">Qalıq borc</div><div class="val ${num(m.qaliq) > 0 ? 'neg' : 'pos'}">${man(m.qaliq)}</div></div>
      <div class="card kpi"><div class="lbl">Vəziyyət</div><div class="val" style="font-size:16px;margin-top:10px">${statusBadge(m) || '—'}</div><div class="cmp">Son ödəniş/alış: ${fd(m.son_tarix) || '—'}</div></div>
    </div>
    <h3 style="margin:22px 0 10px">Satışlar</h3>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>№</th><th>Tarix</th><th>Mal</th><th class="n">Dəyəri</th><th class="n hide-m">İlkin</th><th class="n hide-m">Ödənilən</th><th class="n">Qalıq</th><th></th></tr></thead>
      <tbody>${sales.map(s => `<tr class="click" data-s="${s.id}"><td class="muted">${esc(s.satis_no)}</td><td>${fd(s.tarix)}</td><td>${esc(s.mal || '')}</td><td class="n">${fmt(s.deyer)}</td><td class="n hide-m">${fmt(s.ilkin)}</td><td class="n hide-m">${fmt(s.odenilen)}</td><td class="n">${num(s.qaliq) > 0 ? `<b>${fmt(s.qaliq)}</b>` : '<span class="badge b-green">Bağlanıb</span>'}</td>
        <td class="n no-print" style="white-space:nowrap">${w ? `<button class="btn sm" data-sd="${s.id}" title="Satışı düzəlt">✎ Düzəlt</button> ` : ''}<a class="btn sm" href="#/cek/${s.id}" data-stop="1" title="Çek">${ico('print')}</a></td></tr>`).join('')}</tbody></table></div>
    <h3 style="margin:22px 0 10px">Hesab çıxarışı</h3>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>Tarix</th><th>Əməliyyat</th><th class="n">Borc</th><th class="n">Ödənilib</th><th class="n">Qalıq</th></tr></thead>
      <tbody>${hereket.map(h => { bal += (h.borc || 0) - (h.od || 0); return `<tr><td>${fd(h.t)}</td><td>${esc(h.ad)}</td><td class="n">${h.borc ? fmt(h.borc) : ''}</td><td class="n">${h.od ? fmt(h.od) : ''}</td><td class="n"><b>${fmt(bal)}</b></td></tr>`; }).join('')}</tbody></table></div>`;
  $$('[data-s]').forEach(tr => tr.onclick = e => { if (e.target.closest('[data-sd],[data-stop]')) return; satisModal(+tr.dataset.s); });
  $$('[data-sd]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    try {
      const s = sales.find(x => x.id === +b.dataset.sd);
      const qr = await q(sb.from('v_qrafik').select('ayliq,ilk_odenis,maya').eq('id', s.id).maybeSingle());
      satisDuzelt(Object.assign({}, s, { ayliq: qr && qr.ayliq, ilk_odenis: qr && qr.ilk_odenis, maya: qr && qr.maya }), true);
    } catch (er) { fail(er); }
  });
  if ($('#yeni')) $('#yeni').onclick = () => yeniSatis(id);
  if ($('#odal')) $('#odal').onclick = () => odenisAl(m, sales);
  if ($('#ed')) $('#ed').onclick = () => {
    const md = modal('Müştəri məlumatı', `<form id="mf"><div class="field"><label class="f">Ad Soyad</label><input class="in" name="ad" value="${esc(m.ad)}" required></div>
      <div class="row2"><div class="field"><label class="f">Ünvan</label><input class="in" name="un" value="${esc(m.unvan || '')}"></div>
      <div class="field"><label class="f">Telefon</label><input class="in" name="tel" value="${esc(m.telefon || '')}"></div></div>
      <div class="field"><label class="f">Qeyd</label><input class="in" name="q" value="${esc(m.qeyd || '')}"></div></form>`,
      `<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yadda saxla</button>`);
    $('#ok', md).onclick = async () => {
      const f = $('#mf', md); if (!f.reportValidity()) return;
      try { await q(sb.from('musteriler').update({ ad: f.ad.value.trim(), unvan: f.un.value.trim() || null, telefon: f.tel.value.trim() || null, qeyd: f.q.value.trim() || null }).eq('id', id)); toast('Yeniləndi'); refresh(); }
      catch (er) { fail(er); }
    };
  };
}

/* ---------- Müştəridən ödəniş al (bir və ya bir neçə satışa) ---------- */
function odenisAl(m, sales) {
  const acik = sales.filter(s => num(s.qaliq) > 0.001).sort((a, b) => a.tarix < b.tarix ? -1 : a.tarix > b.tarix ? 1 : a.id - b.id);
  const cem = acik.reduce((a, s) => a + num(s.qaliq), 0);
  if (!acik.length) return toast('Açıq borc yoxdur');
  const md = modal(`Ödəniş al — ${esc(m.ad)}`, `<form id="oa">
    <div class="info" style="margin-bottom:14px"><div><span>Qalıq borc</span><b class="neg">${man(cem)}</b></div><div><span>Açıq satış</span><b>${acik.length}</b></div></div>
    ${acik.length > 1 ? `<div class="field"><label class="f">Hansı satışa</label><select class="in" name="s">
      <option value="auto">Avtomatik — əvvəl köhnə borc bağlansın</option>
      ${acik.map(s => `<option value="${s.id}">${esc(s.satis_no)} · ${fd(s.tarix)} · ${esc(s.mal || '')} — qalıq ${fmt(s.qaliq)}</option>`).join('')}</select></div>`
      : `<p class="muted" style="margin-top:0">Satış: <b>${esc(acik[0].satis_no)}</b> · ${fd(acik[0].tarix)} · ${esc(acik[0].mal || '')}</p>`}
    <div class="row2"><div class="field"><label class="f">Məbləğ</label><input class="in" type="number" step="0.01" min="0.01" name="mb" required autofocus>
      <div style="margin-top:6px"><button type="button" class="btn sm" id="tam">Hamısı: ${fmt(cem)}</button></div></div>
    <div class="field"><label class="f">Tarix</label><input class="in" type="date" name="t" value="${today()}" required></div></div>
    <div class="field"><label class="f">Ödəniş üsulu</label><div class="seg" id="ou"><button type="button" data-u="Nağd" class="on">Nağd</button><button type="button" data-u="POS">POS (kart)</button></div></div>
    <div class="field"><label class="f">Qeyd (istəyə bağlı)</label><input class="in" name="q"></div>
    <div class="muted" id="bolgu" style="font-size:13px"></div></form>`,
    `<button class="btn" data-close>Ləğv et</button><button class="btn green" id="ok">Ödənişi yaz</button>`);
  const f = $('#oa', md);
  let usul = 'Nağd';
  $$('#ou button', md).forEach(b => b.onclick = () => { usul = b.dataset.u; $$('#ou button', md).forEach(x => x.classList.toggle('on', x === b)); });
  const plan = () => {
    const mb = Math.round(num(f.mb.value) * 100) / 100;
    if (!(mb > 0)) return [];
    if (f.s && f.s.value !== 'auto') return [{ s: acik.find(x => x.id === +f.s.value), m: mb }];
    if (acik.length === 1) return [{ s: acik[0], m: mb }];
    const out = []; let qal = mb;
    for (const s of acik) { if (qal <= 0.001) break; const m_ = Math.min(qal, Math.round(num(s.qaliq) * 100) / 100); out.push({ s, m: m_ }); qal = Math.round((qal - m_) * 100) / 100; }
    if (qal > 0.001) out[out.length - 1].m = Math.round((out[out.length - 1].m + qal) * 100) / 100;
    return out;
  };
  const goster = () => {
    const pl = plan();
    $('#bolgu', md).innerHTML = pl.length > 1 ? 'Bölgü: ' + pl.map(x => `${esc(x.s.satis_no)} — <b>${fmt(x.m)}</b>`).join(', ') : '';
  };
  f.mb.oninput = goster; if (f.s) f.s.onchange = goster;
  $('#tam', md).onclick = () => { f.mb.value = Math.round(cem * 100) / 100; goster(); };
  $('#ok', md).onclick = async () => {
    if (!f.reportValidity()) return;
    const pl = plan(), mb = num(f.mb.value);
    const hed = f.s && f.s.value !== 'auto' ? num(pl[0].s.qaliq) : cem;
    if (mb > hed + 0.001 && !confirm(`Məbləğ qalıq borcdan (${fmt(hed)}) çoxdur. Yenə də yazılsın?`)) return;
    $('#ok', md).disabled = true;
    try {
      const ids = [];
      for (const x of pl) {
        const np = await q(sb.from('satis_odenisleri').insert({ satis_id: x.s.id, tarix: f.t.value, mebleg: x.m, usul, qeyd: f.q.value.trim() || null }).select().single());
        ids.push(np.id);
      }
      closeModal(); S.cache = {}; toast(`${fmt(mb)} ₼ ödəniş yazıldı`);
      if (confirm('Ödəniş yazıldı. Müştəri üçün qəbz çap edilsin?')) location.hash = '#/qebz/' + ids.join(','); else refresh();
    } catch (er) { fail(er); $('#ok', md).disabled = false; }
  };
  setTimeout(() => f.mb.focus(), 50);
}

/* =====================================================================
   MƏHSULLAR — satışda seçilən şablon mallar
   ===================================================================== */
async function pageMehsullar(params) {
  const w = canWrite();
  shell('mehsullar', 'Məhsullar', '', `<input class="in search" id="axtar" placeholder="Axtar: ad, kod, kateqoriya">
    <select class="in" id="kat" style="width:auto"><option value="">Bütün kateqoriyalar</option></select>
    <label style="display:flex;align-items:center;gap:6px;font-size:13.5px;white-space:nowrap"><input type="checkbox" id="passiv"> Passivlər</label>
    <label style="display:flex;align-items:center;gap:6px;font-size:13.5px;white-space:nowrap"><input type="checkbox" id="azal" ${params.get('az') ? 'checked' : ''}> Bitmək üzrə</label>
    ${w ? `<button class="btn" id="toplu">${ico('up')}Excel-dən yüklə</button><button class="btn" id="medaxil">${ico('box')}Mal mədaxili</button><button class="btn" id="etk">${ico('print')}Barkod etiketi</button><button class="btn primary" id="yeni">${ico('plus')}Yeni məhsul</button>` : ''}`);
  const [rows] = await Promise.all([all(() => sb.from('v_mehsullar').select('*').order('ad')), ayarlar()]);
  const QA = qAdlari(), elave = [2, 3, 4].filter(n => rows.some(r => r['qiymet' + n] != null));
  const azdir = r => r.anbar_izle && num(r.anbar) <= num(r.min_qaliq);
  const kats = [...new Set(rows.map(r => r.kateqoriya).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'az'));
  $('#kat').innerHTML += kats.map(k => `<option>${esc(k)}</option>`).join('');
  const draw = () => {
    const t = ($('#axtar').value || '').toLocaleLowerCase('az'), k = $('#kat').value, pas = $('#passiv').checked, az = $('#azal').checked;
    const list = rows.filter(r => (pas || r.aktiv) && (!az || azdir(r)) && (!k || r.kateqoriya === k) && (!t || [r.ad, r.kod, r.kateqoriya].join(' ').toLocaleLowerCase('az').includes(t)));
    $('.topbar .sub').textContent = `${list.length} məhsul`;
    $('#page').innerHTML = rows.length ? (list.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Məhsul</th><th class="hide-m">Kateqoriya</th><th class="hide-m">Barkod / kod</th><th class="n">${esc(QA[0])}</th>${elave.map(n => `<th class="n hide-m">${esc(QA[n - 1])}</th>`).join('')}<th class="n hide-m">Maya</th><th class="n hide-m">Mənfəət</th><th class="n hide-m">Satılıb</th><th class="n">Anbarda</th></tr></thead>
      <tbody>${list.map(r => { const mf = r.maya != null && num(r.qiymet) > 0 ? (num(r.qiymet) - num(r.maya)) / num(r.qiymet) * 100 : null;
        return `<tr class="${w ? 'click' : ''}" data-p="${r.id}" style="${r.aktiv ? '' : 'opacity:.55'}"><td><div class="cell-main">${esc(r.ad)}</div>${r.qeyd ? `<div class="cell-sub">${esc(r.qeyd)}</div>` : ''}${r.aktiv ? '' : '<span class="badge b-gray">passiv</span>'}</td>
        <td class="hide-m">${esc(r.kateqoriya || '')}</td><td class="hide-m muted">${esc(r.kod || '')}</td><td class="n"><b>${fmt(r.qiymet)}</b></td>${elave.map(n => `<td class="n hide-m">${r['qiymet' + n] == null ? '<span class="muted">—</span>' : fmt(r['qiymet' + n])}</td>`).join('')}
        <td class="n hide-m">${r.maya == null ? '—' : fmt(r.maya)}</td><td class="n hide-m">${mf == null ? '—' : `<span class="${mf < 0 ? 'neg' : 'pos'}">${Math.round(mf)}%</span>`}</td>
        <td class="n hide-m">${num(r.satilib) ? fmt(r.satilib) + ' ədəd' : '—'}</td>
        <td class="n">${r.anbar_izle ? `<span class="badge ${azdir(r) ? 'b-red' : 'b-green'}">${fmt(r.anbar)} ədəd</span>` : '<span class="muted">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>`
      : '<div class="card empty">Məhsul tapılmadı</div>')
      : `<div class="card empty" style="padding:40px 20px"><div style="font-size:17px;font-weight:600;margin-bottom:6px">Hələ məhsul yoxdur</div>
         <div class="muted">Satdığınız malları (məs. "${esc(numune()[0])}", "${esc(numune()[3])}") bir dəfə qiyməti ilə yazın — satış zamanı siyahıdan seçəcəksiniz.</div></div>`;
    if (w) $$('[data-p]').forEach(tr => tr.onclick = () => mehsulForm(rows.find(r => r.id === +tr.dataset.p), kats));
  };
  ['axtar', 'kat', 'passiv', 'azal'].forEach(id => $('#' + id).addEventListener(id === 'axtar' ? 'input' : 'change', draw));
  if ($('#medaxil')) $('#medaxil').onclick = () => malMedaxili(rows);
  if ($('#etk')) $('#etk').onclick = () => etiketPencere([]).catch(fail);
  if ($('#yeni')) $('#yeni').onclick = () => mehsulForm(null, kats);
  if ($('#toplu')) $('#toplu').onclick = () => mehsulIdxal();
  draw();
}

function mehsulForm(r, kats) {
  const QA = qAdlari();
  const m = modal(r ? 'Məhsulu düzəlt' : 'Yeni məhsul', `<form id="pf">
    <div class="field"><label class="f">Məhsulun adı</label><input class="in" name="ad" value="${esc(r ? r.ad : '')}" required placeholder="məs. ${esc(numune()[0])}"></div>
    <div class="row2"><div class="field"><label class="f">Kateqoriya</label><input class="in" name="kat" list="katlist" value="${esc(r && r.kateqoriya || '')}" placeholder="məs. ${esc(numune()[1])}">
      <datalist id="katlist">${kats.map(k => `<option value="${esc(k)}">`).join('')}</datalist></div>
    <div class="field"><label class="f">Barkod / kod <span class="muted" style="font-weight:400">(oxuyucu ilə oxudun)</span></label><div style="display:flex;gap:6px"><input class="in" name="kod" value="${esc(r && r.kod || '')}" placeholder="məs. 4760001234567"><button type="button" class="btn" id="kcam" title="Kamera ilə oxu">📷</button>${r ? `<button type="button" class="btn" id="kyar" title="Barkodu yoxdursa proqram yaratsın">Yarat</button>` : ''}</div></div></div>
    <div class="row2"><div class="field"><label class="f">${esc(QA[0])} <span class="muted" style="font-weight:400">(əsas satış qiyməti)</span></label><input class="in" type="number" step="0.01" min="0" name="qy" value="${r ? r.qiymet : ''}" required></div>
    <div class="field"><label class="f">Maya dəyəri <span class="muted" style="font-weight:400">(istəyə bağlı)</span></label><input class="in" type="number" step="0.01" min="0" name="my" value="${r && r.maya != null ? r.maya : ''}"></div></div>
    <div class="row3">${[2, 3, 4].map(n => `<div class="field"><label class="f">${esc(QA[n - 1])}</label><input class="in" type="number" step="0.01" min="0" name="q${n}" value="${r && r['qiymet' + n] != null ? r['qiymet' + n] : ''}" placeholder="—"></div>`).join('')}</div>
    <div class="muted" style="font-size:12.5px;margin:-6px 0 12px">Əlavə qiymətlər istəyə bağlıdır — satışda "Qiymət növü" ilə seçilir. Adlarını "Ayarlar" bölməsində dəyişə bilərsiniz.</div>
    <div class="field"><label class="f">Qeyd (ölçü, rəng və s.)</label><input class="in" name="q" value="${esc(r && r.qeyd || '')}"></div>
    <div style="background:#faf4ea;border-radius:10px;padding:10px 12px;margin-bottom:12px">
      <label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" name="ai" ${r && r.anbar_izle ? 'checked' : ''}> Anbar qalığını izlə</label>
      <div class="row2" style="margin-top:8px"><div class="field" style="margin:0"><label class="f">Minimum qalıq (xəbərdarlıq üçün)</label><input class="in" type="number" min="0" step="1" name="mq" value="${r ? num(r.min_qaliq) : 1}"></div>
      ${r && r.anbar_izle ? `<div class="field" style="margin:0"><label class="f">Sayım: faktiki qalıq <span class="muted" style="font-weight:400">(indi ${fmt(r.anbar)})</span></label><input class="in" type="number" step="1" name="say" placeholder="${fmt(r.anbar)}"></div>` : ''}</div>
      ${r ? '<div id="hrk" style="margin-top:10px"></div>' : ''}</div>
    ${r ? `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="ak" ${r.aktiv ? 'checked' : ''}> Aktivdir (satışda görünür)</label>` : ''}</form>`,
    `${r ? '<button class="btn danger" id="sil" style="margin-right:auto">Sil</button><button class="btn" id="ketk">Etiket çap et</button>' : ''}<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yadda saxla</button>`);
  const f = $('#pf', m);
  setTimeout(() => f.ad.focus(), 50);
  f.kod.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); f.qy.focus(); } };   // oxuyucunun Enter-i formu göndərməsin
  $('#kcam', m).onclick = () => kameraOxu(k => { f.kod.value = k; f.qy.focus(); });
  if ($('#kyar', m)) $('#kyar', m).onclick = () => { if (f.kod.value.trim() && !confirm('Mövcud barkod dəyişdirilsin?')) return; f.kod.value = daxiliBarkod(r.id); };
  if ($('#ketk', m)) $('#ketk', m).onclick = () => etiketPencere([r.id]).catch(fail);
  if (r && $('#hrk', m)) Promise.all([
    q(sb.from('anbar_hereketleri').select('*').eq('mehsul_id', r.id).order('tarix', { ascending: false }).limit(15)),
    q(sb.from('satis_mallari').select('miqdar,satis_id').eq('mehsul_id', r.id).order('id', { ascending: false }).limit(15)),
  ]).then(([h, sm]) => {
    const list = [...h.map(x => ({ t: x.tarix, ad: x.nov + (x.techizatci ? ' · ' + x.techizatci : '') + (x.qeyd && x.nov !== 'Mədaxil' ? ' · ' + x.qeyd : ''), m: num(x.miqdar), qy: x.qiymet })),
      ...sm.map(x => ({ t: '', ad: 'Satış', m: -num(x.miqdar) }))].slice(0, 20);
    $('#hrk', m).innerHTML = list.length ? `<div class="muted" style="font-size:12.5px;margin-bottom:4px">Son hərəkətlər</div>
      <div style="max-height:150px;overflow:auto;font-size:13px">${list.map(x => `<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding:3px 0">
        <span>${x.t ? fd(x.t) + ' · ' : ''}${esc(x.ad)}${x.qy != null ? ` <span class="muted">(${fmt(x.qy)} ₼)</span>` : ''}</span><b class="${x.m < 0 ? 'neg' : 'pos'}">${x.m > 0 ? '+' : ''}${fmt(x.m)}</b></div>`).join('')}</div>` : '';
  }).catch(() => {});
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    const kodT = f.kod.value.trim();
    if (kodT && kats !== undefined) {
      try { const eyni = await q(sb.from('mehsullar').select('id,ad').eq('kod', kodT)); const b = eyni.find(x => !r || x.id !== r.id);
        if (b && !confirm(`Bu barkod artıq "${b.ad}" məhsulundadır. Yenə də yadda saxlanılsın?`)) return; } catch (_) {}
    }
    const v = { ad: f.ad.value.trim(), kateqoriya: f.kat.value.trim() || null, kod: kodT || null, qiymet: num(f.qy.value),
                qiymet2: f.q2.value === '' ? null : num(f.q2.value), qiymet3: f.q3.value === '' ? null : num(f.q3.value), qiymet4: f.q4.value === '' ? null : num(f.q4.value),
                maya: f.my.value === '' ? null : num(f.my.value), qeyd: f.q.value.trim() || null, anbar_izle: f.ai.checked, min_qaliq: num(f.mq.value) };
    if (r) v.aktiv = f.ak.checked;
    try {
      if (r) await q(sb.from('mehsullar').update(v).eq('id', r.id)); else await q(sb.from('mehsullar').insert(v));
      if (r && f.say && f.say.value !== '' && num(f.say.value) !== num(r.anbar))
        await q(sb.from('anbar_hereketleri').insert({ mehsul_id: r.id, tarix: today(), nov: 'Sayım', miqdar: num(f.say.value) - num(r.anbar), qeyd: `Sayım: ${fmt(r.anbar)} → ${fmt(f.say.value)}` }));
      closeModal(); toast('Yadda saxlanıldı'); refresh();
    } catch (er) { fail(er); }
  };
  if ($('#sil', m)) $('#sil', m).onclick = async () => {
    if (num(r.satilib) > 0) {
      if (!confirm('Bu məhsul satışlarda istifadə olunub, ona görə silinmir — passiv edilsin? (satışda görünməyəcək, köhnə satışlar dəyişməyəcək)')) return;
      try { await q(sb.from('mehsullar').update({ aktiv: false }).eq('id', r.id)); closeModal(); toast('Passiv edildi'); refresh(); } catch (er) { fail(er); }
      return;
    }
    if (!confirm(`"${r.ad}" silinsin?`)) return;
    try { await q(sb.from('mehsullar').delete().eq('id', r.id)); closeModal(); toast('Silindi'); refresh(); } catch (er) { fail(er); }
  };
}

function malMedaxili(mehs) {
  const akt = mehs.filter(x => x.aktiv);
  const m = modal('Mal mədaxili (anbara gələn mal)', `<form id="mf">
    <div class="row2"><div class="field"><label class="f">Tarix</label><input class="in" type="date" name="t" value="${today()}" required></div>
    <div class="field"><label class="f">Təchizatçı / haradan</label><input class="in" name="tc" placeholder="məs. İstehsalat sexi, Bakı anbarı"></div></div>
    <div class="field"><label class="f">Məhsullar</label><input class="in" id="max" placeholder="Məhsul adı və ya kodu yazın…" autocomplete="off">
      <button type="button" class="btn sm" id="mcam" style="margin-top:6px">📷 Kamera ilə barkod</button>
      <div class="suggest" id="msug" style="display:none"></div><div id="msetir"></div></div>
    <label style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="checkbox" name="my" checked> Məhsulun maya dəyərini bu alış qiymətinə yenilə</label>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="rx"> Pulu kassadan ödənilib — cəmi "Xərclər"ə yaz</label>
    <div class="field" style="margin-top:10px"><label class="f">Qeyd</label><input class="in" name="q"></div></form>`,
    `<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Anbara yaz</button>`, true);
  const f = $('#mf', m), set = [];
  const ciz = () => {
    $('#msetir', m).innerHTML = set.length ? `<table class="t" style="margin-top:8px"><thead><tr><th>Məhsul</th><th class="n">Anbarda</th><th class="n">Miqdar</th><th class="n">Alış qiyməti</th><th class="n">Cəm</th><th></th></tr></thead><tbody>${set.map((x, i) => `<tr>
      <td>${esc(x.ad)}</td><td class="n muted">${x.anbar_izle ? fmt(x.anbar) : '—'}</td>
      <td style="width:80px"><input class="in" type="number" min="1" step="1" value="${x.miqdar}" data-mq="${i}" style="padding:5px 6px"></td>
      <td style="width:110px"><input class="in" type="number" min="0" step="0.01" value="${x.qiymet}" data-qy="${i}" style="padding:5px 6px"></td>
      <td class="n"><b>${fmt(x.miqdar * x.qiymet)}</b></td><td style="width:30px"><button type="button" class="btn sm danger" data-sl="${i}">×</button></td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Cəm</td><td></td><td class="n">${fmt(set.reduce((a, x) => a + x.miqdar, 0))}</td><td></td><td class="n">${fmt(set.reduce((a, x) => a + x.miqdar * x.qiymet, 0))}</td><td></td></tr></tfoot></table>` : '';
    $$('[data-mq]', m).forEach(el => el.onchange = () => { set[+el.dataset.mq].miqdar = Math.max(1, num(el.value)); setTimeout(() => ciz()); });
    $$('[data-qy]', m).forEach(el => el.onchange = () => { set[+el.dataset.qy].qiymet = Math.max(0, num(el.value)); setTimeout(() => ciz()); });
    $$('[data-sl]', m).forEach(el => el.onclick = () => { set.splice(+el.dataset.sl, 1); ciz(); });
  };
  const sug = $('#msug', m);
  $('#max', m).oninput = e => {
    const t = azLow(e.target.value); if (!t) { sug.style.display = 'none'; return; }
    const list = akt.filter(x => azLow([x.ad, x.kod, x.kateqoriya].join(' ')).includes(t)).slice(0, 20);
    sug.style.display = '';
    sug.innerHTML = list.length ? list.map(x => `<div data-id="${x.id}"><b>${esc(x.ad)}</b> <span class="muted">${esc(x.kateqoriya || '')}</span>${x.anbar_izle ? ` <span class="badge b-gray">anbarda ${fmt(x.anbar)}</span>` : ''}</div>`).join('') : '<div class="muted" style="cursor:default">Tapılmadı — əvvəlcə "Yeni məhsul" ilə əlavə edin</div>';
    $$('[data-id]', sug).forEach(d => d.onclick = () => {
      const x = akt.find(z => z.id === +d.dataset.id); const v = set.find(z => z.id === x.id);
      if (v) v.miqdar += 1; else set.push({ id: x.id, ad: x.ad, anbar_izle: x.anbar_izle, anbar: x.anbar, miqdar: 1, qiymet: x.maya != null ? num(x.maya) : 0 });
      sug.style.display = 'none'; e.target.value = ''; ciz(); e.target.focus();
    });
  };
  const mBarkod = t => {
    t = String(t || '').trim(); if (!t) return;
    const x = akt.find(z => barkodBerabar(z, t));
    if (x) { const v = set.find(z => z.id === x.id); if (v) v.miqdar += 1; else set.push({ id: x.id, ad: x.ad, anbar_izle: x.anbar_izle, anbar: x.anbar, miqdar: 1, qiymet: x.maya != null ? num(x.maya) : 0 });
      sug.style.display = 'none'; $('#max', m).value = ''; ciz(); toast('+ ' + x.ad, 1500); $('#max', m).focus(); return; }
    const d = $('[data-id]', sug); if (d && sug.style.display !== 'none') return d.click();
    toast(`"${t}" barkodu ilə məhsul tapılmadı`, 4000);
  };
  $('#max', m).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); mBarkod(e.target.value); } };
  $('#mcam', m).onclick = () => kameraOxu(mBarkod);
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    if (!set.length) return toast('Ən azı bir məhsul seçin');
    $('#ok', m).disabled = true;
    try {
      await q(sb.from('anbar_hereketleri').insert(set.map(x => ({ mehsul_id: x.id, tarix: f.t.value, nov: 'Mədaxil', miqdar: x.miqdar, qiymet: x.qiymet, techizatci: f.tc.value.trim() || null, qeyd: f.q.value.trim() || null }))));
      for (const x of set) {
        const v = { anbar_izle: true }; if (f.my.checked && x.qiymet > 0) v.maya = x.qiymet;
        await q(sb.from('mehsullar').update(v).eq('id', x.id));
      }
      const cem = set.reduce((a, x) => a + x.miqdar * x.qiymet, 0);
      if (f.rx.checked && cem > 0) await q(sb.from('rasxodlar').insert({ tarix: f.t.value, mebleg: Math.round(cem * 100) / 100, kateqoriya: 'Material', kim: f.tc.value.trim() || null,
        aciqlama: 'Mal mədaxili: ' + set.map(x => `${x.ad} ×${x.miqdar}`).join(', ').slice(0, 200) }));
      closeModal(); toast(`${set.reduce((a, x) => a + x.miqdar, 0)} ədəd mal anbara yazıldı`); refresh();
    } catch (er) { fail(er); $('#ok', m).disabled = false; }
  };
}

// Satışdan qaytarma: mal anbara qayıdır, satışın dəyəri azalır, istəyə görə nağd pul geri verilir
async function qaytarmaModal(s) {
  const mallar = await q(sb.from('satis_mallari').select('*').eq('satis_id', s.id).order('id'));
  const cem = mallar.reduce((a, x) => a + num(x.miqdar) * num(x.qiymet), 0);
  const nisbet = cem > 0 ? num(s.deyer) / cem : 1;           // endirim varsa mütənasib
  const odenib = num(s.ilkin) + num(s.odenilen);
  const m = modal(`Qaytarma — ${esc(s.satis_no)}`, `<form id="qf">
    ${mallar.length ? `<div class="muted" style="font-size:13px;margin-bottom:6px">Qaytarılan malların sayını yazın:</div>
      <table class="t"><thead><tr><th>Məhsul</th><th class="n">Satılıb</th><th class="n">Qiymət</th><th class="n">Qaytarılır</th></tr></thead><tbody>${mallar.map((x, i) => `<tr>
        <td>${esc(x.ad)}</td><td class="n">${fmt(x.miqdar)}</td><td class="n">${fmt(x.qiymet)}</td>
        <td style="width:100px"><input class="in" type="number" min="0" max="${num(x.miqdar)}" step="1" value="0" data-qm="${i}" style="padding:5px 6px"></td></tr>`).join('')}</tbody></table>`
      : '<p class="muted" style="margin-top:0">Bu satışda kataloq məhsulu yoxdur — qaytarılan məbləği yazın.</p>'}
    <div class="row2" style="margin-top:12px"><div class="field"><label class="f">Satışın dəyərindən çıxılır</label><input class="in" type="number" min="0" step="0.01" name="mb" value="0" required></div>
    <div class="field"><label class="f">Müştəriyə nağd qaytarılır</label><input class="in" type="number" min="0" step="0.01" name="gp" value="0"></div></div>
    <div class="row2"><div class="field"><label class="f">Tarix</label><input class="in" type="date" name="t" value="${today()}" required></div>
    <div class="field"><label class="f">Səbəb / qeyd</label><input class="in" name="q" placeholder="məs. zədəli gəldi, rəng uyğun deyil"></div></div>
    <div class="muted" id="qinfo" style="font-size:13px"></div>
    <p class="muted" style="font-size:12.5px;margin-bottom:0">Dəyişmə üçün: əvvəl qaytarmanı yazın, sonra "Satışı düzəlt" ilə yeni məhsulu əlavə edin.</p></form>`,
    `<button class="btn" data-close>Ləğv et</button><button class="btn danger" id="ok">Qaytarmanı yaz</button>`, true);
  const f = $('#qf', m);
  const hesabla = (avto = true) => {
    const qm = mallar.map((x, i) => Math.min(num(x.miqdar), Math.max(0, num(($(`[data-qm="${i}"]`, m) || {}).value))));
    if (avto && mallar.length) f.mb.value = Math.round(qm.reduce((a, k, i) => a + k * num(mallar[i].qiymet), 0) * nisbet * 100) / 100;
    const yeniDeyer = num(s.deyer) - num(f.mb.value);
    if (avto) f.gp.value = Math.max(0, Math.round((odenib - yeniDeyer) * 100) / 100);
    $('#qinfo', m).innerHTML = `Yeni dəyər: <b>${man(yeniDeyer)}</b> · ödənilib: ${man(odenib)} · yeni qalıq borc: <b>${man(yeniDeyer - odenib + num(f.gp.value) + num(s.cerime || 0))}</b>`;
    return qm;
  };
  $$('[data-qm]', m).forEach(el => el.oninput = () => hesabla(true));
  f.mb.oninput = () => hesabla(false); f.gp.oninput = () => hesabla(false);
  hesabla(true);
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    const qm = hesabla(false), mb = num(f.mb.value), gp = num(f.gp.value);
    if (!(mb > 0) && !qm.some(x => x > 0)) return toast('Qaytarılan malı və ya məbləği yazın');
    if (mb > num(s.deyer)) return toast('Çıxılan məbləğ satışın dəyərindən çox ola bilməz');
    if (!confirm(`${s.satis_no}: dəyərdən ${man(mb)} çıxılsın${gp > 0 ? `, müştəriyə ${man(gp)} nağd qaytarılsın` : ''}?`)) return;
    $('#ok', m).disabled = true;
    try {
      const mallarMetn = mallar.map((x, i) => qm[i] > 0 ? `${x.ad} ×${qm[i]}` : '').filter(Boolean).join(', ');
      for (const [i, x] of mallar.entries()) {
        if (!(qm[i] > 0)) continue;
        if (qm[i] >= num(x.miqdar)) await q(sb.from('satis_mallari').delete().eq('id', x.id));
        else await q(sb.from('satis_mallari').update({ miqdar: num(x.miqdar) - qm[i] }).eq('id', x.id));
      }
      const qalan = mallar.map((x, i) => ({ ad: x.ad, m: num(x.miqdar) - qm[i] })).filter(x => x.m > 0);
      const v = { deyer: Math.round((num(s.deyer) - mb) * 100) / 100 };
      if (mallar.length) v.mal = qalan.length ? qalan.map(x => x.ad + (x.m > 1 ? ' ×' + x.m : '')).join(', ') : (s.mal || '') + ' (qaytarılıb)';
      await q(sb.from('satislar').update(v).eq('id', s.id));
      await q(sb.from('satis_qaytarmalari').insert({ satis_id: s.id, tarix: f.t.value, mebleg: mb, geri_pul: gp, mallar: mallarMetn || null, qeyd: f.q.value.trim() || null }));
      if (gp > 0) await q(sb.from('kassa_diger').insert({ tarix: f.t.value, nov: 'Məxaric', mebleg: gp, aciqlama: `Qaytarma ${s.satis_no} — ${s.musteri}${mallarMetn ? ': ' + mallarMetn : ''}`.slice(0, 250) }));
      closeModal(); toast('Qaytarma yazıldı'); refresh();
    } catch (er) { fail(er); $('#ok', m).disabled = false; }
  };
}

function mehsulToplu() {
  const m = modal('Excel-dən yapışdır', `<p class="muted" style="margin-top:0;font-size:13.5px">Excel-də sütunları bu ardıcıllıqla seçin, kopyalayın (Ctrl+C) və aşağıya yapışdırın (Ctrl+V):<br>
    <b>Ad</b> · <b>Satış qiyməti</b> · Maya dəyəri · Kateqoriya · Kod. Son üçü istəyə bağlıdır.</p>
    <textarea class="in" id="tx" rows="9" placeholder="Künc divan Milano&#9;1450&#9;980&#9;Divanlar&#10;Mətbəx dəsti 2.4 m&#9;2100&#9;1500&#9;Mətbəx"></textarea>
    <div class="muted" id="txinfo" style="margin-top:8px;font-size:13px"></div>`,
    `<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok" disabled>Əlavə et</button>`, true);
  let list = [];
  const ədəd = v => { const t = String(v || '').replace(/\s|₼|AZN/gi, '').replace(',', '.'); return t === '' ? null : Number(t); };
  $('#tx', m).oninput = e => {
    list = e.target.value.split(/\r?\n/).map(l => l.split('\t')).filter(c => c[0] && c[0].trim())
      .map(c => ({ ad: c[0].trim(), qiymet: ədəd(c[1]), maya: ədəd(c[2]), kateqoriya: (c[3] || '').trim() || null, kod: (c[4] || '').trim() || null }))
      .filter(x => x.qiymet != null && !isNaN(x.qiymet) && !/^ad$/i.test(x.ad));
    list.forEach(x => { if (x.maya != null && isNaN(x.maya)) x.maya = null; });
    $('#txinfo', m).textContent = list.length ? `${list.length} məhsul tanındı: ${list.slice(0, 3).map(x => `${x.ad} — ${fmt(x.qiymet)} ₼`).join('; ')}${list.length > 3 ? ' …' : ''}` : 'Hələ heç nə tanınmadı (ad və qiymət sütunu lazımdır)';
    $('#ok', m).disabled = !list.length;
  };
  $('#ok', m).onclick = async () => {
    $('#ok', m).disabled = true;
    try { for (let i = 0; i < list.length; i += 500) await q(sb.from('mehsullar').insert(list.slice(i, i + 500)));
      closeModal(); toast(list.length + ' məhsul əlavə olundu'); refresh(); } catch (er) { fail(er); $('#ok', m).disabled = false; }
  };
}

/* =====================================================================
   BARKOD — EAN-13 və Code 128 (SVG), avtomatik barkod, etiket çapı
   ===================================================================== */
const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const EAN_P = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
const eanYoxla = d12 => { let s = 0; for (let i = 0; i < 12; i++) s += +d12[i] * (i % 2 ? 3 : 1); return String((10 - s % 10) % 10); };
const eanDuzdur = k => /^\d{13}$/.test(k) && eanYoxla(k.slice(0, 12)) === k[12];
// Dükanın daxili barkodu: 20 + dükan (3) + məhsul nömrəsi (7) + yoxlama rəqəmi
function daxiliBarkod(mehsulId) {
  const d12 = '20' + String((S.magaza && S.magaza.id) % 1000).padStart(3, '0') + String(mehsulId % 1e7).padStart(7, '0');
  return d12 + eanYoxla(d12);
}
function eanBitler(k) {
  let b = '101'; const p = EAN_P[+k[0]];
  for (let i = 1; i <= 6; i++) b += (p[i - 1] === 'L' ? EAN_L : EAN_G)[+k[i]];
  b += '01010';
  for (let i = 7; i <= 12; i++) b += EAN_R[+k[i]];
  return b + '101';
}
const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
function c128Bitler(t) {
  t = String(t).replace(/[^\x20-\x7e]/g, '?');
  const kod = [104]; for (const ch of t) kod.push(ch.charCodeAt(0) - 32);
  let s = kod[0]; for (let i = 1; i < kod.length; i++) s += kod[i] * i;
  kod.push(s % 103, 106);
  let b = ''; for (const c of kod) { const w = C128[c]; for (let i = 0; i < w.length; i++) b += (i % 2 ? '0' : '1').repeat(+w[i]); }
  return b;
}
// SVG: modul eni = 1 vahid; hündürlük və altdakı yazı
function barkodSvg(kod, hund = 40) {
  kod = String(kod || '').trim(); if (!kod) return '';
  const ean = eanDuzdur(kod), bit = ean ? eanBitler(kod) : c128Bitler(kod);
  const ses = ean ? 9 : 10, W = bit.length + ses * 2;
  let rect = '', i = 0;
  while (i < bit.length) { if (bit[i] === '1') { let j = i; while (j < bit.length && bit[j] === '1') j++;
    const uzun = ean && (i < 3 || (i >= 45 && i < 50) || i >= 92);
    rect += `<rect x="${ses + i}" y="0" width="${j - i}" height="${uzun ? hund + 5 : hund}"/>`; i = j; } else i++; }
  const yazi = ean
    ? `<text x="${ses - 2}" y="${hund + 11}" text-anchor="end">${kod[0]}</text><text x="${ses + 3 + 21}" y="${hund + 11}" text-anchor="middle">${kod.slice(1, 7)}</text><text x="${ses + 50 + 21}" y="${hund + 11}" text-anchor="middle">${kod.slice(7)}</text>`
    : `<text x="${W / 2}" y="${hund + 11}" text-anchor="middle">${esc(kod)}</text>`;
  return `<svg class="bk-svg" viewBox="0 0 ${W} ${hund + 13}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"><g fill="#000">${rect}</g><g font-family="Arial,Helvetica,sans-serif" font-size="10" fill="#000">${yazi}</g></svg>`;
}

const ETIKET_OLCU = {
  '58x40': { ad: 'Etiket printeri 58 × 40 mm', w: 58, h: 40 },
  '40x30': { ad: 'Etiket printeri 40 × 30 mm', w: 40, h: 30 },
  'a4': { ad: 'A4 vərəq — 3 × 8 (24 etiket)', w: 70, h: 37 },
};
// Etiket pəncərəsi: məhsul seçimi, say, ölçü; barkodu olmayanlara barkod verilir
async function etiketPencere(secilmis) {
  await ayarlar();
  const rows = (await all(() => sb.from('v_mehsullar').select('id,ad,kod,qiymet,qiymet2,qiymet3,qiymet4,kateqoriya,anbar_izle,anbar,aktiv').order('ad'))).filter(r => r.aktiv);
  const QA = qAdlari(), novler = [1, 2, 3, 4].filter(n => n === 1 || rows.some(r => mQ(r, n) != null));
  let qn = 1; const etQ = r => mQ(r, qn) != null ? mQ(r, qn) : mQ(r, 1);
  const sec = new Map((secilmis || []).map(id => [id, 1]));
  let olcu = 'a4'; try { olcu = localStorage.getItem('etiket_olcu') || 'a4'; } catch (_) {}
  const m = modal('Barkod etiketləri', `
    <div class="row2"><div class="field"><label class="f">Etiket ölçüsü</label><select class="in" id="eo">${Object.entries(ETIKET_OLCU).map(([k, v]) => `<option value="${k}" ${k === olcu ? 'selected' : ''}>${v.ad}</option>`).join('')}</select></div>
      <div class="field"><label class="f">Etiketdə</label><div style="display:flex;gap:14px;padding-top:8px;flex-wrap:wrap">
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="eq" checked> qiymət</label>
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="ef" checked> dükanın adı</label></div></div></div>
    ${novler.length > 1 ? `<div class="row2"><div class="field"><label class="f">Hansı qiymət çap olunsun</label><select class="in" id="eqn">${novler.map(n => `<option value="${n}">${esc(QA[n - 1])}</option>`).join('')}</select></div>
      <div class="field"><label class="f">&nbsp;</label><label style="display:flex;gap:6px;align-items:center;padding-top:8px"><input type="checkbox" id="ekh"> əsas qiyməti də göstər (üstündən xətt)</label></div></div>` : ''}
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
      <input class="in" id="ea" placeholder="Məhsul axtar…" style="flex:1;min-width:180px">
      <button type="button" class="btn sm" id="ehamisi">Hamısını seç</button><button type="button" class="btn sm" id="eanbar">Say = anbar qalığı</button><button type="button" class="btn sm" id="esil">Təmizlə</button></div>
    <div class="tbl-wrap" style="max-height:320px;box-shadow:none"><table class="t"><thead><tr><th style="width:34px"></th><th>Məhsul</th><th>Barkod</th><th class="n">Qiymət</th><th class="n" style="width:90px">Etiket sayı</th></tr></thead><tbody id="elist"></tbody></table></div>
    <div class="muted" id="einfo" style="font-size:13px;margin-top:8px"></div>`,
    `<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ecap">${ico('print')}Çap et</button>`, true);
  const ciz = () => {
    const t = azLow($('#ea', m).value);
    $('#elist', m).innerHTML = rows.filter(r => !t || azLow([r.ad, r.kod, r.kateqoriya].join(' ')).includes(t)).map(r => `<tr>
      <td><input type="checkbox" data-c="${r.id}" ${sec.has(r.id) ? 'checked' : ''}></td><td>${esc(r.ad)}</td>
      <td>${r.kod ? `<span class="muted">${esc(r.kod)}</span>` : '<span class="badge b-amber">yaradılacaq</span>'}</td><td class="n">${mQ(r, qn) == null && qn > 1 ? `<span class="muted" title="Bu qiymət yoxdur, əsas qiymət çap olunur">${fmt(r.qiymet)}*</span>` : fmt(etQ(r))}</td>
      <td><input class="in" type="number" min="1" step="1" data-n="${r.id}" value="${sec.get(r.id) || 1}" style="padding:4px 6px"></td></tr>`).join('');
    $$('[data-c]', m).forEach(c => c.onchange = () => { const id = +c.dataset.c; if (c.checked) sec.set(id, num($(`[data-n="${id}"]`, m).value) || 1); else sec.delete(id); info(); });
    $$('[data-n]', m).forEach(c => c.oninput = () => { const id = +c.dataset.n; if (num(c.value) > 0) { sec.set(id, Math.round(num(c.value))); $(`[data-c="${id}"]`, m).checked = true; } info(); });
    info();
  };
  const info = () => {
    const say = [...sec.values()].reduce((a, n) => a + n, 0), yeni = [...sec.keys()].filter(id => !rows.find(r => r.id === id).kod).length;
    $('#einfo', m).innerHTML = `${sec.size} məhsul, cəmi <b>${say}</b> etiket${yeni ? ` · ${yeni} məhsula yeni barkod veriləcək` : ''}`;
  };
  $('#ea', m).oninput = ciz;
  if ($('#eqn', m)) $('#eqn', m).onchange = e => { qn = +e.target.value; ciz(); };
  $('#ehamisi', m).onclick = () => { rows.forEach(r => { if (!sec.has(r.id)) sec.set(r.id, 1); }); ciz(); };
  $('#eanbar', m).onclick = () => { rows.forEach(r => { if (r.anbar_izle && num(r.anbar) > 0) sec.set(r.id, Math.round(num(r.anbar))); }); ciz(); };
  $('#esil', m).onclick = () => { sec.clear(); ciz(); };
  ciz();
  $('#ecap', m).onclick = async () => {
    if (!sec.size) return toast('Ən azı bir məhsul seçin');
    $('#ecap', m).disabled = true;
    try {
      for (const id of sec.keys()) {
        const r = rows.find(x => x.id === id);
        if (!r.kod) { r.kod = daxiliBarkod(r.id); if (canWrite()) await q(sb.from('mehsullar').update({ kod: r.kod }).eq('id', r.id)); }
      }
      olcu = $('#eo', m).value; try { localStorage.setItem('etiket_olcu', olcu); } catch (_) {}
      S.etiket = { olcu, qn, kohne: !!($('#ekh', m) && $('#ekh', m).checked), qiymet: $('#eq', m).checked, firma: $('#ef', m).checked, list: [...sec.entries()].map(([id, n]) => ({ r: rows.find(x => x.id === id), n })) };
      closeModal(); S.cache = {}; location.hash = '#/etiket';
    } catch (er) { fail(er); $('#ecap', m).disabled = false; }
  };
}
async function pageEtiket() {
  const E = S.etiket;
  shell('', 'Barkod etiketləri', E ? `${E.list.reduce((a, x) => a + x.n, 0)} etiket · ${ETIKET_OLCU[E.olcu].ad}` : '',
    `<button class="btn" onclick="history.back()">← Geri</button><button class="btn primary" onclick="window.print()">${ico('print')}Çap et</button>`);
  if (!E) { $('#page').innerHTML = '<div class="card empty">Əvvəlcə "Məhsullar → Barkod etiketi" bölməsindən məhsul seçin</div>'; return; }
  const O = ETIKET_OLCU[E.olcu], a4 = E.olcu === 'a4';
  const firma = firmaAdi();
  const tek = r => `<div class="etk" style="width:${O.w}mm;height:${O.h}mm">
    ${E.firma ? `<div class="etk-f">${esc(firma)}</div>` : ''}
    <div class="etk-ad">${esc(r.ad)}</div>
    <div class="etk-bk">${barkodSvg(r.kod)}</div>
    ${E.qiymet ? (() => { const q1 = mQ(r, 1), qx = E.qn > 1 && mQ(r, E.qn) != null ? mQ(r, E.qn) : q1;
      return `<div class="etk-q">${E.kohne && qx !== q1 ? `<s class="etk-kq">${fmt(q1)} ₼</s> ` : ''}${fmt(qx)} ₼</div>`; })() : ''}</div>`;
  const hamisi = E.list.flatMap(x => Array.from({ length: x.n }, () => x.r));
  let st = $('#etkpage'); if (!st) { st = document.createElement('style'); st.id = 'etkpage'; document.head.appendChild(st); }
  st.textContent = a4 ? '@media print{@page{size:A4;margin:8mm 0 0 0} .topbar{display:none!important} .main{padding:0!important} body{background:#fff!important}}'
    : `@media print{@page{size:${O.w}mm ${O.h}mm;margin:0} .topbar{display:none!important} .main{padding:0!important} body{background:#fff!important} .etk-vereq{display:block!important;gap:0!important;padding:0!important;background:none!important} .etk{break-after:page;border:0!important;margin:0!important}}`;
  $('#page').innerHTML = `<div class="etk-vereq ${a4 ? 'a4' : ''}">${hamisi.map(tek).join('')}</div>
    <p class="muted no-print" style="font-size:13px;margin-top:14px">${a4 ? 'A4 üçün 70 × 37 mm-lik 24-lük yapışqan etiket vərəqi istifadə edin; çap pəncərəsində miqyas "100%" (Actual size) olsun.' : `Etiket printerində kağız ölçüsünü ${O.w} × ${O.h} mm seçin; çap pəncərəsində kənar boşluq "Yoxdur" (None) və miqyas "100%" olsun.`}</p>`;
}

/* =====================================================================
   SATIŞ ÇEKİ — 80 mm termal printer və ya A4
   ===================================================================== */
async function pageCek(id) {
  let olcu = 'a4'; try { olcu = localStorage.getItem('cek_olcu') || 'a4'; } catch (_) {}
  shell('', 'Satış çeki', '', `<button class="btn" onclick="history.back()">← Geri</button>
    <div class="seg" id="olcu"><button data-o="80" class="${olcu === '80' ? 'on' : ''}">Kiçik çek (80 mm)</button><button data-o="a4" class="${olcu === 'a4' ? 'on' : ''}">A4</button></div>
    <button class="btn primary" onclick="window.print()">${ico('print')}Çap / PDF</button>`);
  const [s, mallar, qr, A, sx] = await Promise.all([
    q(sb.from('v_satislar').select('*').eq('id', +id).single()),
    q(sb.from('satis_mallari').select('*').eq('satis_id', +id).order('id')),
    q(sb.from('v_qrafik').select('*').eq('id', +id).maybeSingle()), ayarlar(),
    q(sb.from('satislar').select('isci_id').eq('id', +id).single()).catch(() => ({})),
  ]);
  let satici = S.ad;
  if (sx && sx.isci_id) { try { const i = await q(sb.from('isciler').select('ad').eq('id', sx.isci_id).single()); satici = i.ad; } catch (_) {} }
  const setir = mallar.length ? mallar : [{ ad: s.mal || 'Mal', miqdar: 1, qiymet: s.deyer }];
  const cem = setir.reduce((a, x) => a + num(x.miqdar) * num(x.qiymet), 0);
  const endirim = Math.round((cem - num(s.deyer)) * 100) / 100;
  const kredit = num(s.deyer) - num(s.ilkin);
  const ay = qr && num(qr.ayliq) > 0 ? num(qr.ayliq) : 0;
  const ayS = ay ? Math.ceil(kredit / ay) : 0;
  const firma = A.firma_adi || firmaAdi();
  const draw = () => {
    const k = olcu === '80';
    let st = $('#cekpage'); if (!st) { st = document.createElement('style'); st.id = 'cekpage'; document.head.appendChild(st); }
    st.textContent = '@media print{.topbar{display:none!important} body,.main{background:#fff!important}}' + (k ? '@media print{@page{size:80mm auto;margin:3mm} .cek{width:auto!important;box-shadow:none!important;border:0!important;padding:0!important} .main{padding:0!important}}'
                       : '@media print{@page{size:A4;margin:14mm} .cek{box-shadow:none!important;border:0!important}}');
    const satirlar = setir.map(x => k
      ? `<div style="margin-top:6px">${esc(x.ad)}</div><div style="display:flex;justify-content:space-between"><span>${fmt(x.miqdar)} × ${fmt(x.qiymet, 2)}</span><b>${fmt(num(x.miqdar) * num(x.qiymet), 2)}</b></div>`
      : `<tr><td>${esc(x.ad)}</td><td class="n">${fmt(x.miqdar)}</td><td class="n">${fmt(x.qiymet, 2)}</td><td class="n"><b>${fmt(num(x.miqdar) * num(x.qiymet), 2)}</b></td></tr>`).join('');
    const sira = (a, b, guc) => `<div style="display:flex;justify-content:space-between;gap:10px;${guc ? 'font-weight:700;font-size:' + (k ? '15px' : '17px') : ''}"><span>${a}</span><span style="white-space:nowrap">${b}</span></div>`;
    const yekun = `${endirim > 0.001 ? sira('Cəm', man(cem)) + sira('Endirim', '−' + man(endirim)) : ''}
      ${sira('YEKUN', man(s.deyer), true)}
      ${s.odenis_usulu ? sira('Ödəniş üsulu', esc(s.odenis_usulu === 'Borc' ? 'Hissə-hissə' : s.odenis_usulu)) : ''}
      ${num(s.ilkin_pos) > 0 && num(s.ilkin_pos) < num(s.ilkin) ? sira('&nbsp;&nbsp;nağd', man(num(s.ilkin) - num(s.ilkin_pos))) + sira('&nbsp;&nbsp;kartla (POS)', man(s.ilkin_pos)) : ''}
      ${kredit > 0.001 ? sira('İlkin ödəniş (ödənildi)', man(s.ilkin)) + sira('<b>Kreditə qalan</b>', '<b>' + man(kredit) + '</b>') : sira('Ödənildi', man(s.deyer))}
      ${ay ? sira('Aylıq ödəniş', man(ay)) + sira('Müddət', ayS + ' ay') + (qr.ilk_odenis ? sira('Ödəniş tarixləri', `${fd(qr.ilk_odenis)} – ${fd(ayArtir(qr.ilk_odenis, ayS - 1))}`) : '') : ''}`;
    const vaxt = s.tarix === today() ? new Date().toTimeString().slice(0, 5) : '';
    $('#page').innerHTML = k ? `<div class="card cek" style="width:300px;margin:0 auto;padding:16px 14px;font-family:'Inter',monospace;font-size:12.5px;line-height:1.45;color:#000">
        <div style="text-align:center"><div style="font-size:16px;font-weight:700">${esc(firma)}</div>
        ${A.firma_unvan ? `<div>${esc(A.firma_unvan)}</div>` : ''}${A.firma_telefon ? `<div>Tel: ${esc(A.firma_telefon)}</div>` : ''}${A.firma_voen ? `<div>VÖEN: ${esc(A.firma_voen)}</div>` : ''}</div>
        <div style="border-top:1px dashed #000;margin:8px 0"></div>
        <div style="text-align:center;font-weight:700">SATIŞ ÇEKİ № ${esc(s.satis_no)}</div>
        ${sira('Tarix', fd(s.tarix) + (vaxt ? ' ' + vaxt : ''))}${sira('Müştəri', esc(s.musteri))}${s.telefon ? sira('Telefon', esc(s.telefon)) : ''}${sira('Satıcı', esc(satici))}
        <div style="border-top:1px dashed #000;margin:8px 0 2px"></div>${satirlar}
        <div style="border-top:1px dashed #000;margin:8px 0"></div>${yekun}
        <div style="border-top:1px dashed #000;margin:8px 0"></div>
        <div style="text-align:center">${esc(A.cek_altyazi || 'Təşəkkür edirik!')}</div></div>`
      : `<div class="card cek" style="max-width:720px;margin:0 auto;padding:32px 36px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;border-bottom:2px solid var(--brand);padding-bottom:12px">
          <div><div style="font-size:22px;font-weight:700;color:var(--brand);font-family:var(--serif)">${esc(firma)}</div><div class="muted" style="font-size:13px">${[A.firma_unvan, A.firma_telefon].filter(Boolean).map(esc).join(' · ')}${A.firma_voen ? '<br>VÖEN: ' + esc(A.firma_voen) : ''}</div></div>
          <div style="text-align:right"><div style="font-size:18px;font-weight:700">SATIŞ ÇEKİ</div><div>№ ${esc(s.satis_no)}</div><div class="muted">${fd(s.tarix)}${vaxt ? ' ' + vaxt : ''}</div></div></div>
        <div style="display:flex;justify-content:space-between;gap:16px;margin:16px 0;flex-wrap:wrap"><div><span class="muted">Müştəri:</span> <b>${esc(s.musteri)}</b>${s.telefon ? ' · ' + esc(s.telefon) : ''}${s.unvan ? '<br><span class="muted">' + esc(s.unvan) + '</span>' : ''}</div>
          <div><span class="muted">Satıcı:</span> ${esc(satici)}</div></div>
        <table class="t"><thead><tr><th>Məhsul</th><th class="n">Miqdar</th><th class="n">Qiymət</th><th class="n">Məbləğ</th></tr></thead><tbody>${satirlar}</tbody></table>
        <div style="max-width:330px;margin:16px 0 0 auto;display:grid;gap:5px">${yekun}</div>
        <p class="muted" style="text-align:center;margin-top:22px">${esc(A.cek_altyazi || 'Təşəkkür edirik!')}</p>
        ${imza('Satıcı (imza)', 'Alıcı (imza)')}</div>`;
  };
  $$('#olcu button').forEach(b => b.onclick = () => { olcu = b.dataset.o; try { localStorage.setItem('cek_olcu', olcu); } catch (_) {} $$('#olcu button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  draw();
}

/* =====================================================================
   RASXODLAR
   ===================================================================== */
const KATS = ['Material', 'Yanacaq', 'Nəqliyyat', 'Kirayə', 'Kommunal', 'Vergi', 'Digər'];

async function pageRasxodlar(params) {
  const ay = params.get('ay') || ayBasi(today());
  const aylar = await q(sb.from('v_aylar').select('ay').order('ay', { ascending: false }));
  shell('rasxodlar', 'Xərclər', ay === 'hamisi' ? 'Bütün aylar' : ayAdi(ay),
    `<input class="in search" id="axtar" placeholder="Axtar: açıqlama, kim">
     <select class="in" id="ay" style="width:auto"><option value="hamisi">Bütün aylar</option>${aylar.map(a => `<option value="${a.ay}" ${a.ay === ay ? 'selected' : ''}>${ayAdi(a.ay)}</option>`).join('')}</select>
     ${canWrite() ? `<button class="btn" id="idx">${ico('up')}Excel-dən yüklə</button><button class="btn primary" id="yeni">${ico('plus')}Yeni xərc</button>` : ''}
     <button class="btn" onclick="window.print()">${ico('print')}Çap / PDF</button>`);
  if (ay === 'hamisi') $('#ay').value = 'hamisi';
  $('#ay').onchange = e => location.hash = '#/rasxodlar?ay=' + e.target.value;
  if ($('#yeni')) $('#yeni').onclick = () => rasxodForm(null, ay);
  if ($('#idx')) $('#idx').onclick = () => rasxodIdxal();
  const rows = await all(() => {
    let b = sb.from('rasxodlar').select('*');
    if (ay !== 'hamisi') b = b.gte('tarix', ay).lte('tarix', aySonu(ay));
    return b.order('tarix').order('id');
  });
  const kat12 = await q(sb.from('v_rasxod_kateqoriya').select('*').order('ay', { ascending: false }));
  const draw = () => {
    const s = ($('#axtar').value || '').toLocaleLowerCase('az');
    const list = s ? rows.filter(r => [r.aciqlama, r.kim, r.kateqoriya].join(' ').toLocaleLowerCase('az').includes(s)) : rows;
    const cem = list.reduce((a, r) => a + num(r.mebleg), 0);
    const byKat = KATS.map(k => [k, list.filter(r => r.kateqoriya === k).reduce((a, r) => a + num(r.mebleg), 0)]);
    const aySirasi = [...new Set(kat12.map(k => k.ay))].slice(0, 12);
    $('.topbar .sub').textContent = `${ay === 'hamisi' ? 'Bütün aylar' : ayAdi(ay)} · ${list.length} xərc · cəmi ${man(cem)}`;
    $('#page').innerHTML = `
      <div class="grid two">
        <div class="tbl-wrap">${list.length ? `<table class="t">
          <thead><tr><th>Tarix</th><th>Açıqlama</th><th class="hide-m">Kim verib</th><th class="hide-m">Kateqoriya</th><th class="n">Məbləğ</th></tr></thead>
          <tbody>${list.map(r => `<tr class="${canWrite() ? 'click' : ''}" data-r="${r.id}"><td>${fd(r.tarix)}</td>
            <td><div class="cell-main">${esc(r.aciqlama || '—')}</div><div class="cell-sub">${esc(r.kateqoriya)}${r.kim ? ' · ' + esc(r.kim) : ''}</div></td>
            <td class="hide-m">${esc(r.kim || '')}</td><td class="hide-m"><span class="badge b-gray">${esc(r.kateqoriya)}</span></td><td class="n">${fmt(r.mebleg)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="2">${list.length} xərc</td><td class="hide-m"></td><td class="hide-m"></td><td class="n">${fmt(cem)}</td></tr></tfoot></table>`
          : '<div class="empty">Bu dövrdə xərc yoxdur</div>'}</div>
        <div>
          <div class="card"><h3>Kateqoriyalar üzrə</h3><table class="t"><tbody>${byKat.map(([k, v]) => `<tr><td>${k}</td><td class="n">${man(v)}</td></tr>`).join('')}</tbody>
            <tfoot><tr><td>Cəm</td><td class="n">${man(cem)}</td></tr></tfoot></table></div>
          <div class="card" style="margin-top:16px;padding:0;overflow:auto"><h3 style="padding:18px 20px 0">Son aylar</h3><table class="t">
            <thead><tr><th>Ay</th><th class="n">Material</th><th class="n">Digər xərclər</th><th class="n">Cəm</th></tr></thead>
            <tbody>${aySirasi.map(a => { const r = kat12.filter(k => k.ay === a); const mat = r.filter(k => k.kateqoriya === 'Material').reduce((x, k) => x + num(k.cem), 0); const c = r.reduce((x, k) => x + num(k.cem), 0);
              return `<tr class="click" data-ay="${a}"><td style="white-space:nowrap">${ayAdi(a)}</td><td class="n">${fmt(mat)}</td><td class="n">${fmt(c - mat)}</td><td class="n"><b>${fmt(c)}</b></td></tr>`; }).join('')}</tbody></table></div>
        </div>
      </div>`;
    $$('[data-ay]').forEach(tr => tr.onclick = () => location.hash = '#/rasxodlar?ay=' + tr.dataset.ay);
    if (canWrite()) $$('[data-r]').forEach(tr => tr.onclick = () => rasxodForm(rows.find(r => r.id === +tr.dataset.r), ay));
  };
  $('#axtar').oninput = draw;
  draw();
}

async function rasxodForm(r, ay) {
  const kimler = S.cache.kimler || (S.cache.kimler = [...new Set((await q(sb.from('rasxodlar').select('kim').order('id', { ascending: false }).range(0, 999))).map(x => x.kim).filter(Boolean))]);
  const defTarix = r ? r.tarix : (ay && ay !== 'hamisi' && ayBasi(today()) !== ay ? ay : today());
  const m = modal(r ? 'Xərci düzəlt' : 'Yeni xərc', `<form id="rf">
    <div class="field"><label class="f">Açıqlama</label><input class="in" name="a" value="${esc(r ? r.aciqlama || '' : '')}" placeholder="məs. Laminat, Fariz üçün" required></div>
    <div class="row2"><div class="field"><label class="f">Tarix</label><input class="in" type="date" name="t" value="${defTarix}" required></div>
    <div class="field"><label class="f">Məbləğ</label><input class="in" type="number" step="0.01" min="0.01" name="m" value="${r ? r.mebleg : ''}" required></div></div>
    <div class="row2"><div class="field"><label class="f">Kateqoriya</label><select class="in" name="k">${KATS.map(k => `<option ${(r ? r.kateqoriya : 'Material') === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
    <div class="field"><label class="f">Kim verib</label><input class="in" name="kim" list="kimler" value="${esc(r ? r.kim || '' : (kimler[0] || ''))}"><datalist id="kimler">${kimler.map(k => `<option value="${esc(k)}">`).join('')}</datalist></div></div>
    </form>`,
    `${r ? '<button class="btn danger" id="sil" style="margin-right:auto">Sil</button>' : ''}<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yadda saxla</button>`);
  const f = $('#rf', m);
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    const row = { aciqlama: f.a.value.trim(), tarix: f.t.value, mebleg: num(f.m.value), kateqoriya: f.k.value, kim: f.kim.value.trim() || null };
    $('#ok', m).disabled = true;
    try {
      if (r) await q(sb.from('rasxodlar').update(row).eq('id', r.id)); else await q(sb.from('rasxodlar').insert(row));
      closeModal(); toast(r ? 'Xərc yeniləndi' : 'Xərc yazıldı'); refresh();
    } catch (er) { fail(er); $('#ok', m).disabled = false; }
  };
  if ($('#sil', m)) $('#sil', m).onclick = async () => {
    if (!confirm('Bu xərc silinsin?')) return;
    try { await q(sb.from('rasxodlar').delete().eq('id', r.id)); closeModal(); toast('Xərc silindi'); refresh(); } catch (er) { fail(er); }
  };
}

/* =====================================================================
   İŞÇİLƏR — hesablama köməkçiləri
   ===================================================================== */
async function isciMelumati() {
  if (S.cache.isci) return S.cache.isci;
  const [isc, dov, ode, deg] = await Promise.all([
    q(sb.from('v_isciler').select('*').order('id')),
    all(() => sb.from('v_isci_dovrleri').select('*').order('isci_id').order('dovr')),
    all(() => sb.from('isci_odenisleri').select('*').order('tarix').order('id')),
    q(sb.from('maas_deyisiklikleri').select('*').order('tarixden').order('id')),
  ]);
  return (S.cache.isci = { isc, dov, ode, deg });
}

// İşçinin bütün əməliyyatları tarix sırası ilə, işləyən qalıqla
function hesabHereketi(isci, D) {
  const ev = [];
  D.dov.filter(d => d.isci_id === isci.id).forEach(d => ev.push({ t: d.tarix, s: 0, id: d.dovr, ad: `Maaş hesablandı (dövr ${d.dovr})`, hes: num(d.maas), ver: 0 }));
  D.ode.filter(o => o.isci_id === isci.id).forEach(o => ev.push({
    t: o.tarix, s: 1, id: o.id, odenis: o, ad: o.nov + (o.qeyd ? ' — ' + o.qeyd : ''),
    hes: o.nov === 'Bonus' ? num(o.mebleg) : 0, ver: o.nov === 'Bonus' ? 0 : num(o.mebleg) }));
  ev.sort((a, b) => a.t < b.t ? -1 : a.t > b.t ? 1 : (a.s - b.s) || (a.id - b.id));
  let q2 = 0; ev.forEach(e => { q2 += e.hes - e.ver; e.qaliq = q2; });
  return ev;
}

function buDovrdeGoturdu(isci, D) {
  if (isci.nov === 'Sahib' || !isci.dovr_sayi) return null;
  const son = D.dov.filter(d => d.isci_id === isci.id).slice(-1)[0];
  if (!son) return null;
  return D.ode.filter(o => o.isci_id === isci.id && o.tarix >= son.tarix && ['Avans', 'Maaş'].includes(o.nov)).reduce((a, o) => a + num(o.mebleg), 0);
}

/* =====================================================================
   İŞÇİLƏR
   ===================================================================== */
async function pageIsciler(params) {
  const fil = params.get('f') || 'isleyen';
  shell('isciler', 'İşçilər', '', `<div class="seg" id="fil">${[['isleyen', 'İşləyənlər'], ['hamisi', 'Hamısı']].map(([k, t]) => `<button data-f="${k}" class="${fil === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    <a class="btn" href="#/odenisler">Ödənişlər</a>
    ${canWrite() ? `<button class="btn green" id="ode">${ico('plus')}Ödəniş yaz</button><button class="btn primary" id="yeni">${ico('plus')}Yeni işçi</button>` : ''}`);
  $$('#fil button').forEach(b => b.onclick = () => location.hash = '#/isciler?f=' + b.dataset.f);
  if ($('#yeni')) $('#yeni').onclick = () => isciForm(null);
  if ($('#ode')) $('#ode').onclick = () => odenisForm(null);
  const D = await isciMelumati();
  let list = D.isc.slice();
  if (fil === 'isleyen') list = list.filter(i => i.status === 'İşləyir');
  list.sort((a, b) => (a.nov === b.nov ? 0 : a.nov === 'Sahib' ? 1 : -1) || (a.status === b.status ? 0 : a.status === 'İşləyir' ? -1 : 1) || a.id - b.id);
  const isleyenVer = D.isc.filter(i => i.nov === 'İşçi' && i.status === 'İşləyir').reduce((a, i) => a + num(i.verilecek), 0);
  const sahibCem = D.isc.filter(i => i.nov === 'Sahib').reduce((a, i) => a + num(i.goturduyu), 0);
  $('.topbar .sub').textContent = `${list.length} nəfər`;
  const gun = d => { if (!d) return ''; const n = Math.round((new Date(d) - new Date(today())) / 864e5); return n === 0 ? 'bu gün' : n > 0 ? `${n} gün qalıb` : `${-n} gün keçib`; };
  $('#page').innerHTML = `
    <div class="grid kpis" style="margin-bottom:16px">
      <div class="card kpi"><div class="lbl">İşləyən işçilərə veriləcək</div><div class="val ${isleyenVer < 0 ? 'neg' : ''}">${man(isleyenVer)}</div><div class="cmp">Mənfi — işçilər artıq götürüb</div></div>
      <div class="card kpi"><div class="lbl">İşləyən işçi sayı</div><div class="val">${D.isc.filter(i => i.nov === 'İşçi' && i.status === 'İşləyir').length}</div></div>
      <div class="card kpi"><div class="lbl">Aylıq maaş fondu</div><div class="val">${man(D.isc.filter(i => i.nov === 'İşçi' && i.status === 'İşləyir').reduce((a, i) => a + num(i.cari_maas), 0))}</div></div>
      <div class="card kpi"><div class="lbl">Sahib götürmələri (cəmi)</div><div class="val">${man(sahibCem)}</div></div>
    </div>
    <div class="tbl-wrap"><table class="t">
      <thead><tr><th>Ad Soyad</th><th class="hide-m">Vəzifə</th><th class="hide-m">İşə giriş</th><th class="n">Maaş</th><th class="hide-m">Növbəti maaş günü</th><th class="n hide-m">Bu dövrdə götürüb</th><th class="n">Veriləcək</th><th class="hide-m">Status</th></tr></thead>
      <tbody>${list.map(i => { const bd = buDovrdeGoturdu(i, D); return `<tr class="click" data-i="${i.id}">
        <td><div class="cell-main">${esc(i.ad)}</div><div class="cell-sub">${i.nov === 'Sahib' ? 'Sahib' : esc(i.vezife || '')}</div></td>
        <td class="hide-m">${esc(i.vezife || '')}</td><td class="hide-m">${fd(i.ise_giris)}</td>
        <td class="n">${i.nov === 'Sahib' ? '—' : fmt(i.cari_maas)}</td>
        <td class="hide-m">${i.novbeti_maas_gunu ? `${fd(i.novbeti_maas_gunu)} <span class="muted">(${gun(i.novbeti_maas_gunu)})</span>` : '—'}</td>
        <td class="n hide-m">${bd == null ? '—' : fmt(bd)}</td>
        <td class="n">${i.nov === 'Sahib' ? `<span class="muted">götürüb ${fmt(i.goturduyu)}</span>` : `<b class="${num(i.verilecek) < 0 ? 'neg' : ''}">${fmt(i.verilecek)}</b>`}</td>
        <td class="hide-m">${i.status === 'İşləyir' ? '<span class="badge b-green">İşləyir</span>' : `<span class="badge b-gray">Çıxıb ${fd(i.cixis)}</span>`}</td></tr>`; }).join('')}</tbody>
    </table></div>
    <p class="muted" style="font-size:13px">Maaş dövrü hər işçinin işə giriş günündən hesablanır (məs. 10-u girib — hər ayın 10-u maaş günüdür). İşçinin üzərinə klikləyin — hesab çıxarışı açılacaq.</p>`;
  $$('[data-i]').forEach(tr => tr.onclick = () => location.hash = '#/cixaris/' + tr.dataset.i);
}

async function isciForm(i) {
  const D = await isciMelumati();
  const deg = i ? D.deg.filter(d => d.isci_id === i.id) : [];
  const m = modal(i ? `İşçi — ${esc(i.ad)}` : 'Yeni işçi', `<form id="if">
    <div class="row2"><div class="field"><label class="f">Ad Soyad</label><input class="in" name="ad" value="${esc(i ? i.ad : '')}" required></div>
    <div class="field"><label class="f">Vəzifə</label><input class="in" name="v" value="${esc(i ? i.vezife || '' : '')}" list="vez"><datalist id="vez">${[...new Set(D.isc.map(x => x.vezife).filter(Boolean))].map(v => `<option value="${esc(v)}">`).join('')}</datalist></div></div>
    <div class="row2"><div class="field"><label class="f">İşə giriş tarixi</label><input class="in" type="date" name="g" value="${i ? i.ise_giris || '' : today()}" required></div>
    <div class="field"><label class="f">Başlanğıc maaş</label><input class="in" type="number" step="0.01" min="0" name="m" value="${i ? i.baslangic_maas : ''}" required></div></div>
    <div class="row2"><div class="field"><label class="f">Növ</label><select class="in" name="n"><option ${!i || i.nov === 'İşçi' ? 'selected' : ''}>İşçi</option><option ${i && i.nov === 'Sahib' ? 'selected' : ''}>Sahib</option></select></div>
    <div class="field"><label class="f">Çıxış tarixi (işdən çıxıbsa)</label><input class="in" type="date" name="c" value="${i ? i.cixis || '' : ''}"></div></div>
    <div class="row2"><div class="field"><label class="f">Satışdan bonus, % <span class="muted" style="font-weight:400">(satıcıdırsa)</span></label><input class="in" type="number" step="0.1" min="0" name="sf" value="${i ? num(i.satis_faizi) : 0}"></div><div></div></div>
    </form>
    ${i ? `<h4 style="margin:10px 0 8px">Maaş dəyişiklikləri</h4>
      ${deg.length ? `<table class="t" style="margin-bottom:10px"><tbody>${deg.map(d => `<tr><td>${fd(d.tarixden)}-dən</td><td class="n">${fmt(d.maas)}</td><td class="n"><button class="btn sm danger" data-dd="${d.id}">Sil</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Maaş dəyişikliyi yoxdur.</p>'}
      <form id="df" class="row2" style="align-items:end;background:#faf4ea;padding:12px;border-radius:10px">
        <div class="field" style="margin:0"><label class="f">Tarixdən</label><input class="in" type="date" name="t" value="${today()}" required></div>
        <div class="field" style="margin:0"><label class="f">Yeni maaş</label><div style="display:flex;gap:8px"><input class="in" type="number" step="0.01" min="0" name="m" required><button class="btn">Əlavə et</button></div></div>
      </form>` : ''}`,
    `${i ? '<button class="btn danger" id="sil" style="margin-right:auto">Sil</button>' : ''}<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yadda saxla</button>`);
  const f = $('#if', m);
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    const row = { ad: f.ad.value.trim(), vezife: f.v.value.trim() || null, ise_giris: f.g.value, baslangic_maas: num(f.m.value), nov: f.n.value, cixis: f.c.value || null, satis_faizi: num(f.sf.value) };
    try {
      if (i) await q(sb.from('isciler').update(row).eq('id', i.id)); else await q(sb.from('isciler').insert(row));
      closeModal(); toast(i ? 'İşçi yeniləndi' : 'İşçi əlavə olundu'); refresh();
    } catch (er) { fail(er.message && er.message.includes('duplicate') ? { message: 'Bu adda işçi artıq var' } : er); }
  };
  const df = $('#df', m);
  if (df) df.onsubmit = async e => {
    e.preventDefault();
    try { await q(sb.from('maas_deyisiklikleri').insert({ isci_id: i.id, tarixden: df.t.value, maas: num(df.m.value) })); toast('Maaş dəyişikliyi yazıldı'); S.cache = {}; isciForm((await isciMelumati()).isc.find(x => x.id === i.id)); }
    catch (er) { fail(er); }
  };
  $$('[data-dd]', m).forEach(b => b.onclick = async () => {
    if (!confirm('Bu maaş dəyişikliyi silinsin?')) return;
    try { await q(sb.from('maas_deyisiklikleri').delete().eq('id', +b.dataset.dd)); S.cache = {}; isciForm((await isciMelumati()).isc.find(x => x.id === i.id)); } catch (er) { fail(er); }
  });
  if ($('#sil', m)) $('#sil', m).onclick = async () => {
    if (D.ode.some(o => o.isci_id === i.id)) { toast('Bu işçinin ödənişləri var — silmək olmaz. Əvəzinə çıxış tarixi yazın.', 5000); return; }
    if (!confirm(`${i.ad} silinsin?`)) return;
    try { await q(sb.from('isciler').delete().eq('id', i.id)); closeModal(); toast('Silindi'); location.hash = '#/isciler'; refresh(); } catch (er) { fail(er); }
  };
}

/* =====================================================================
   ÖDƏNİŞLƏR (avans, maaş, bonus, cərimə)
   ===================================================================== */
const ODENIS_NOV = ['Avans', 'Maaş', 'Bonus', 'Cərimə'];

async function pageOdenisler(params) {
  const ay = params.get('ay') || ayBasi(today());
  const isciId = params.get('i') || '';
  const D = await isciMelumati();
  const aylar = await q(sb.from('v_aylar').select('ay').order('ay', { ascending: false }));
  const setHash = (k, v) => { const p = new URLSearchParams({ ay, i: isciId }); p.set(k, v); location.hash = '#/odenisler?' + p.toString(); };
  shell('odenisler', 'İşçi ödənişləri', '', `
    <select class="in" id="isc" style="width:auto"><option value="">Bütün işçilər</option>${D.isc.map(i => `<option value="${i.id}" ${String(i.id) === isciId ? 'selected' : ''}>${esc(i.ad)}${i.status === 'Çıxıb' ? ' (çıxıb)' : ''}</option>`).join('')}</select>
    <select class="in" id="ay" style="width:auto"><option value="hamisi">Bütün aylar</option>${aylar.map(a => `<option value="${a.ay}" ${a.ay === ay ? 'selected' : ''}>${ayAdi(a.ay)}</option>`).join('')}</select>
    ${canWrite() ? `<button class="btn green" id="yeni">${ico('plus')}Ödəniş yaz</button>` : ''}
    <button class="btn" onclick="window.print()">${ico('print')}Çap</button>`);
  if (ay === 'hamisi') $('#ay').value = 'hamisi';
  $('#ay').onchange = e => setHash('ay', e.target.value);
  $('#isc').onchange = e => setHash('i', e.target.value);
  if ($('#yeni')) $('#yeni').onclick = () => odenisForm(null, isciId ? +isciId : null);
  // hər ödənişdən sonrakı qalıq
  const sonra = {};
  D.isc.forEach(i => hesabHereketi(i, D).forEach(e => { if (e.odenis) sonra[e.odenis.id] = e.qaliq; }));
  const ad = Object.fromEntries(D.isc.map(i => [i.id, i]));
  let list = D.ode.filter(o => (!isciId || String(o.isci_id) === isciId) && (ay === 'hamisi' || (o.tarix >= ay && o.tarix <= aySonu(ay))));
  list = list.slice().reverse();
  const cem = n => list.filter(o => n.includes(o.nov)).reduce((a, o) => a + num(o.mebleg), 0);
  $('.topbar .sub').textContent = `${isciId ? ad[isciId].ad + ' · ' : ''}${ay === 'hamisi' ? 'Bütün aylar' : ayAdi(ay)} · ${list.length} ödəniş`;
  $('#page').innerHTML = `
    <div class="grid kpis" style="margin-bottom:16px">
      <div class="card kpi"><div class="lbl">Avans + maaş</div><div class="val">${man(cem(['Avans', 'Maaş']))}</div></div>
      <div class="card kpi"><div class="lbl">Bonus</div><div class="val">${man(cem(['Bonus']))}</div></div>
      <div class="card kpi"><div class="lbl">Cərimə</div><div class="val">${man(cem(['Cərimə']))}</div></div>
      <div class="card kpi"><div class="lbl">Ödəniş sayı</div><div class="val">${list.length}</div></div>
    </div>
    <div class="tbl-wrap">${list.length ? `<table class="t">
      <thead><tr><th>Tarix</th><th>İşçi</th><th>Növ</th><th class="n">Məbləğ</th><th class="hide-m">Qeyd</th><th class="n">Sonrakı qalıq</th></tr></thead>
      <tbody>${list.map(o => { const i = ad[o.isci_id]; const qq = sonra[o.id]; return `<tr class="${canWrite() ? 'click' : ''}" data-o="${o.id}"><td>${fd(o.tarix)}</td>
        <td><div class="cell-main">${esc(i ? i.ad : '?')}</div><div class="cell-sub">${esc(i ? i.vezife || '' : '')}</div></td>
        <td><span class="badge ${o.nov === 'Bonus' ? 'b-green' : o.nov === 'Cərimə' ? 'b-red' : o.nov === 'Maaş' ? 'b-blue' : 'b-gray'}">${o.nov}</span></td>
        <td class="n">${fmt(o.mebleg)}</td><td class="hide-m">${esc(o.qeyd || '')}</td>
        <td class="n">${i && i.nov === 'Sahib' ? '—' : `<span class="${qq < 0 ? 'neg' : ''}">${fmt(qq)}</span>`}</td></tr>`; }).join('')}</tbody></table>`
      : '<div class="empty">Bu seçimə uyğun ödəniş yoxdur</div>'}</div>
    <p class="muted" style="font-size:13px">"Sonrakı qalıq" — həmin ödənişdən sonra işçiyə veriləcək məbləğ (mənfi — artıq götürüb).</p>`;
  if (canWrite()) $$('[data-o]').forEach(tr => tr.onclick = () => odenisForm(D.ode.find(o => o.id === +tr.dataset.o)));
}

async function odenisForm(o, isciId) {
  const D = await isciMelumati();
  const aktiv = D.isc.filter(i => i.status === 'İşləyir' || (o && i.id === o.isci_id) || i.id === isciId);
  const m = modal(o ? 'Ödənişi düzəlt' : 'Ödəniş yaz', `<form id="of">
    <div class="field"><label class="f">İşçi</label><select class="in" name="i" required><option value="">— seçin —</option>${aktiv.map(i => `<option value="${i.id}" ${(o ? o.isci_id : isciId) === i.id ? 'selected' : ''}>${esc(i.ad)}${i.vezife ? ' — ' + esc(i.vezife) : ''}</option>`).join('')}</select></div>
    <div id="qinfo" class="muted" style="margin:-6px 0 12px"></div>
    <div class="row2"><div class="field"><label class="f">Tarix</label><input class="in" type="date" name="t" value="${o ? o.tarix : today()}" required></div>
    <div class="field"><label class="f">Məbləğ</label><input class="in" type="number" step="0.01" min="0.01" name="m" value="${o ? o.mebleg : ''}" required></div></div>
    <div class="field"><label class="f">Növ</label><div class="seg" id="nov">${ODENIS_NOV.map(n => `<button type="button" data-n="${n}" class="${(o ? o.nov : 'Avans') === n ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <div class="field"><label class="f">Qeyd (istəyə bağlı)</label><input class="in" name="q" value="${esc(o ? o.qeyd || '' : '')}"></div>
    <div id="sonra" style="background:#faf4ea;border-radius:10px;padding:10px 12px;display:none"></div></form>`,
    `${o ? '<button class="btn danger" id="sil" style="margin-right:auto">Sil</button>' : ''}<button class="btn" data-close>Ləğv et</button><button class="btn green" id="ok">Yadda saxla</button>`);
  const f = $('#of', m); let nov = o ? o.nov : 'Avans';
  const info = () => {
    const i = D.isc.find(x => x.id === +f.i.value);
    if (!i) { $('#qinfo', m).textContent = ''; $('#sonra', m).style.display = 'none'; return; }
    if (i.nov === 'Sahib') { $('#qinfo', m).textContent = `Sahib — cəmi götürüb: ${man(i.goturduyu)}`; $('#sonra', m).style.display = 'none'; return; }
    const indi = num(i.verilecek) + (o && o.isci_id === i.id ? (o.nov === 'Bonus' ? -num(o.mebleg) : num(o.mebleg)) : 0);
    $('#qinfo', m).innerHTML = `Hazırda veriləcək: <b class="${indi < 0 ? 'neg' : ''}">${man(indi)}</b> · aylıq maaş ${man(i.cari_maas)}`;
    const mb = num(f.m.value);
    if (mb > 0) { const s2 = indi + (nov === 'Bonus' ? mb : -mb); $('#sonra', m).style.display = ''; $('#sonra', m).innerHTML = `Bu ödənişdən sonra qalıq: <b class="${s2 < 0 ? 'neg' : 'pos'}">${man(s2)}</b>${s2 < 0 ? ' — işçi artıq götürmüş olacaq' : ''}`; }
    else $('#sonra', m).style.display = 'none';
  };
  f.i.onchange = info; f.m.oninput = info;
  $$('#nov button', m).forEach(b => b.onclick = () => { nov = b.dataset.n; $$('#nov button', m).forEach(x => x.classList.toggle('on', x === b)); info(); });
  info();
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    const row = { isci_id: +f.i.value, tarix: f.t.value, mebleg: num(f.m.value), nov, qeyd: f.q.value.trim() || null };
    $('#ok', m).disabled = true;
    try {
      if (o) await q(sb.from('isci_odenisleri').update(row).eq('id', o.id)); else await q(sb.from('isci_odenisleri').insert(row));
      closeModal(); toast(o ? 'Ödəniş yeniləndi' : 'Ödəniş yazıldı'); refresh();
    } catch (er) { fail(er); $('#ok', m).disabled = false; }
  };
  if ($('#sil', m)) $('#sil', m).onclick = async () => {
    if (!confirm('Bu ödəniş silinsin?')) return;
    try { await q(sb.from('isci_odenisleri').delete().eq('id', o.id)); closeModal(); toast('Ödəniş silindi'); refresh(); } catch (er) { fail(er); }
  };
}

/* =====================================================================
   İŞÇİ ÇIXARIŞI (tarix aralığı ilə)
   ===================================================================== */
async function pageCixaris(id, params) {
  const D = await isciMelumati();
  const isci = D.isc.find(i => String(i.id) === String(id)) || D.isc.find(i => i.status === 'İşləyir' && i.nov === 'İşçi');
  const d1 = params.get('d1') || '', d2 = params.get('d2') || '';
  shell('cixaris', 'İşçi çıxarışı', '', '');
  if (!isci) { $('#page').innerHTML = '<div class="card empty">İşçi yoxdur</div>'; return; }
  const ev = hesabHereketi(isci, D);
  const evvel = ev.filter(e => d1 && e.t < d1);
  const aralig = ev.filter(e => (!d1 || e.t >= d1) && (!d2 || e.t <= d2));
  const acilis = evvel.length ? evvel[evvel.length - 1].qaliq : 0;
  const hes = aralig.reduce((a, e) => a + e.hes, 0), ver = aralig.reduce((a, e) => a + e.ver, 0);
  const son = acilis + hes - ver;
  const sahib = isci.nov === 'Sahib';
  $('.topbar').innerHTML = `<div><h2>${esc(isci.ad)}</h2><div class="sub">${sahib ? 'Sahib' : esc(isci.vezife || '')} · işə giriş ${fd(isci.ise_giris)}${isci.status === 'Çıxıb' ? ' · çıxıb ' + fd(isci.cixis) : ''} · çıxarış tarixi ${fd(today())}</div></div>
    <div class="tools no-print">
      <select class="in" id="isc" style="width:auto">${D.isc.map(i => `<option value="${i.id}" ${i.id === isci.id ? 'selected' : ''}>${esc(i.ad)}${i.status === 'Çıxıb' ? ' (çıxıb)' : ''}</option>`).join('')}</select>
      <label class="muted" style="font-size:13px">Tarixdən</label><input class="in" type="date" id="d1" value="${d1}" style="width:auto">
      <label class="muted" style="font-size:13px">Tarixədək</label><input class="in" type="date" id="d2" value="${d2}" style="width:auto">
      ${d1 || d2 ? '<button class="btn" id="sifirla">Hamısı</button>' : ''}
      ${canWrite() ? `<button class="btn green" id="ode">${ico('plus')}Ödəniş</button><button class="btn" id="ed">Düzəlt</button>` : ''}
      <button class="btn primary" onclick="window.print()">${ico('print')}PDF / Çap</button></div>`;
  const go = (iid, a, b) => { const p = new URLSearchParams(); if (a) p.set('d1', a); if (b) p.set('d2', b); location.hash = `#/cixaris/${iid}` + (p.toString() ? '?' + p : ''); };
  $('#isc').onchange = e => go(e.target.value, d1, d2);
  $('#d1').onchange = e => go(isci.id, e.target.value, $('#d2').value);
  $('#d2').onchange = e => go(isci.id, $('#d1').value, e.target.value);
  if ($('#sifirla')) $('#sifirla').onclick = () => go(isci.id, '', '');
  if ($('#ode')) $('#ode').onclick = () => odenisForm(null, isci.id);
  if ($('#ed')) $('#ed').onclick = () => isciForm(isci);
  const dovrStr = d1 || d2 ? `${d1 ? fd(d1) : 'əvvəldən'} — ${d2 ? fd(d2) : 'bu günədək'}` : 'Bütün dövr';
  let rows = '';
  if (d1) rows += `<tr><td>${fd(d1)}</td><td><b>Əvvəlki dövrdən qalıq</b></td><td class="n"></td><td class="n"></td><td class="n"><b>${fmt(acilis)}</b></td></tr>`;
  rows += aralig.map(e => `<tr><td>${fd(e.t)}</td><td>${esc(e.ad)}</td><td class="n">${e.hes ? fmt(e.hes) : ''}</td><td class="n">${e.ver ? fmt(e.ver) : ''}</td><td class="n ${e.qaliq < 0 ? 'neg' : ''}">${fmt(e.qaliq)}</td></tr>`).join('');
  $('#page').innerHTML = `
    <div class="grid kpis">
      <div class="card kpi"><div class="lbl">Dövr</div><div class="val" style="font-size:17px;margin-top:10px">${dovrStr}</div><div class="cmp">${sahib ? '' : 'Aylıq maaş ' + man(isci.cari_maas)}</div></div>
      <div class="card kpi"><div class="lbl">${sahib ? 'Bonus' : 'Hesablanmış (maaş + bonus)'}</div><div class="val">${man(hes)}</div>${d1 ? `<div class="cmp">Dövrün əvvəlinə qalıq: ${man(acilis)}</div>` : ''}</div>
      <div class="card kpi"><div class="lbl">${sahib ? 'Götürüb' : 'Verilən və tutulan'}</div><div class="val">${man(ver)}</div></div>
      <div class="card kpi"><div class="lbl">${sahib ? 'Qalıq' : d2 ? 'Dövr sonu qalıq' : 'VERİLƏCƏK QALIQ'}</div><div class="val ${son < 0 ? 'neg' : 'pos'}">${man(son)}</div><div class="cmp">${son < 0 && !sahib ? 'Mənfi — işçi artıq götürüb' : (isci.novbeti_maas_gunu ? 'Növbəti maaş günü: ' + fd(isci.novbeti_maas_gunu) : '')}</div></div>
    </div>
    <div class="tbl-wrap" style="margin-top:16px"><table class="t">
      <thead><tr><th>Tarix</th><th>Əməliyyat</th><th class="n">Hesablandı</th><th class="n">Verildi / tutuldu</th><th class="n">Qalıq</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="empty">Bu dövrdə əməliyyat yoxdur</td></tr>'}</tbody>
      <tfoot><tr><td colspan="2">Cəm</td><td class="n">${fmt(hes)}</td><td class="n">${fmt(ver)}</td><td class="n">${fmt(son)}</td></tr></tfoot></table></div>`;
}

/* =====================================================================
   KASSA
   ===================================================================== */
async function pageKassa() {
  await pageKassa0();
  try { await kassaBaglanis(); } catch (er) { console.warn(er); }
}
async function kassaBaglanis() {
  const w = canWrite();
  const [hes, son] = await Promise.all([q(sb.rpc('kassa_qaliq', { t: today() })), q(sb.from('kassa_baglanislari').select('*').order('tarix', { ascending: false }).limit(31))]);
  const bu = son.find(x => x.tarix === today());
  const card = document.createElement('div'); card.className = 'card'; card.style.marginBottom = '16px';
  card.innerHTML = `<h3>Günün bağlanışı — ${fd(today())}</h3>
    <div class="grid two" style="gap:16px;align-items:end">
      <div class="info" style="margin:0"><div><span>Proqrama görə kassada</span><b>${man(hes)}</b></div>
        <div><span>Sayılan pul</span><b>${bu ? man(bu.sayilan) : '—'}</b></div>
        <div><span>Fərq</span><b class="${bu && Math.abs(num(bu.sayilan) - num(bu.hesablanan)) > 0.009 ? 'neg' : 'pos'}">${bu ? (num(bu.sayilan) - num(bu.hesablanan) > 0 ? '+' : '') + man(num(bu.sayilan) - num(bu.hesablanan)) : '—'}</b></div></div>
      ${w ? `<form id="kbf" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap"><div class="field" style="margin:0;flex:1;min-width:140px"><label class="f">Kassada sayılan pul</label><input class="in" type="number" step="0.01" name="s" value="${bu ? bu.sayilan : ''}" required></div>
        <div class="field" style="margin:0;flex:2;min-width:160px"><label class="f">Qeyd</label><input class="in" name="q" value="${esc(bu && bu.qeyd || '')}" placeholder="məs. 20 ₼ xırda pul banka verildi"></div>
        <button class="btn primary">${bu ? 'Yenilə' : 'Günü bağla'}</button></form>` : ''}</div>
    <div class="muted" id="kbfark" style="font-size:13px;margin-top:8px"></div>
    ${son.length ? `<details style="margin-top:10px"><summary style="cursor:pointer;font-size:13.5px">Son bağlanışlar</summary><table class="t" style="margin-top:8px"><thead><tr><th>Tarix</th><th class="n">Proqram</th><th class="n">Sayılan</th><th class="n">Fərq</th><th>Qeyd</th><th>Kim</th></tr></thead><tbody>
      ${son.map(x => { const d = num(x.sayilan) - num(x.hesablanan); return `<tr><td>${fd(x.tarix)}</td><td class="n">${fmt(x.hesablanan)}</td><td class="n">${fmt(x.sayilan)}</td><td class="n ${Math.abs(d) > 0.009 ? 'neg' : 'pos'}">${d > 0 ? '+' : ''}${fmt(d)}</td><td>${esc(x.qeyd || '')}</td><td class="muted">${esc(x.kim || '')}</td></tr>`; }).join('')}</tbody></table></details>` : ''}`;
  $('#page').prepend(card);
  const f = $('#kbf', card);
  if (f) {
    f.s.oninput = () => { const d = num(f.s.value) - num(hes); $('#kbfark', card).innerHTML = f.s.value === '' ? '' : Math.abs(d) < 0.01 ? '<span class="pos">Kassa düz gəlir</span>' : `<span class="neg">${d > 0 ? 'Artıq' : 'Əskik'}: ${man(Math.abs(d))}</span>`; };
    f.onsubmit = async e => {
      e.preventDefault();
      try {
        if (bu) await q(sb.from('kassa_baglanislari').update({ hesablanan: hes, sayilan: num(f.s.value), qeyd: f.q.value.trim() || null, kim: S.ad }).eq('id', bu.id));
        else await q(sb.from('kassa_baglanislari').insert({ tarix: today(), hesablanan: hes, sayilan: num(f.s.value), qeyd: f.q.value.trim() || null, kim: S.ad }));
        toast('Gün bağlandı'); route();
      } catch (er) { fail(er); }
    };
  }
}
async function pageKassa0() {
  const w = canWrite();
  shell('kassa', 'Kassa', 'Pul hansı ayda real olaraq kassaya girib-çıxıbsa, o ayda görünür',
    `${w ? `<button class="btn green" id="emel">${ico('plus')}Digər əməliyyat</button><button class="btn" id="ayar">Başlanğıc</button>` : ''}
     <button class="btn" onclick="window.print()">${ico('print')}Çap / PDF</button>`);
  if ($('#emel')) $('#emel').onclick = () => digerForm(null);
  const [aylar, diger, ayar] = await Promise.all([
    q(sb.from('v_kassa').select('*').order('ay')),
    q(sb.from('kassa_diger').select('*').order('tarix', { ascending: false }).order('id', { ascending: false })),
    q(sb.from('ayarlar').select('*')),
  ]);
  const A = Object.fromEntries(ayar.map(a => [a.acar, a.deyer]));
  const son = aylar[aylar.length - 1] || {};
  const bas = r => num(r.ay_sonu_kassa) - num(r.medaxil) + num(r.mexaric);
  if ($('#ayar')) $('#ayar').onclick = () => {
    const m = modal('Kassanın başlanğıcı', `<form id="kf"><p class="muted">Kassa hesabı bu tarixdən başlayır. O gün kassada olan pulu yazın.</p>
      <div class="row2"><div class="field"><label class="f">Başlanğıc tarixi</label><input class="in" type="date" name="t" value="${A.kassa_baslangic || ''}" required></div>
      <div class="field"><label class="f">O gün kassada olan pul</label><input class="in" type="number" step="0.01" name="m" value="${num(A.kassa_ilkin)}" required></div></div></form>`,
      `<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yadda saxla</button>`);
    $('#ok', m).onclick = async () => {
      const f = $('#kf', m); if (!f.reportValidity()) return;
      try {
        await q(sb.from('ayarlar').update({ deyer: ayBasi(f.t.value) }).eq('acar', 'kassa_baslangic'));
        await q(sb.from('ayarlar').update({ deyer: String(num(f.m.value)) }).eq('acar', 'kassa_ilkin'));
        closeModal(); toast('Yadda saxlanıldı'); refresh();
      } catch (er) { fail(er); }
    };
  };
  $('#page').innerHTML = `
    <div class="grid kpis">
      <div class="card kpi"><div class="lbl">Hazırda kassada</div><div class="val ${num(son.ay_sonu_kassa) < 0 ? 'neg' : ''}">${man(son.ay_sonu_kassa)}</div><div class="cmp">Başlanğıc: ${fd(A.kassa_baslangic)} · ${man(A.kassa_ilkin)}</div></div>
      <div class="card kpi"><div class="lbl">Bu ay daxil olan</div><div class="val">${man(son.medaxil)}</div></div>
      <div class="card kpi"><div class="lbl">Bu ay çıxan</div><div class="val">${man(son.mexaric)}</div></div>
      <div class="card kpi"><div class="lbl">Bu ay POS / kartla</div><div class="val">${man(son.pos)}</div><div class="cmp">Banka daxil olur, kassaya düşmür</div></div>
      <div class="card kpi"><div class="lbl">Bu ay fərq</div><div class="val ${num(son.medaxil) - num(son.mexaric) < 0 ? 'neg' : 'pos'}">${man(num(son.medaxil) - num(son.mexaric))}</div></div>
    </div>
    <div class="tbl-wrap" style="margin-top:16px"><table class="t">
      <thead><tr><th>Ay</th><th class="n hide-m">Ayın əvvəli</th><th class="n hide-m">İlkin ödənişlər</th><th class="n hide-m">Müştəri ödənişləri</th><th class="n hide-m">Digər mədaxil</th><th class="n">Daxil olan (nağd)</th><th class="n hide-m">POS</th>
        <th class="n hide-m">Xərc</th><th class="n hide-m">Maaş</th><th class="n hide-m">Sahib</th><th class="n hide-m">Digər məxaric</th><th class="n">Çıxan</th><th class="n">Ayın sonu</th></tr></thead>
      <tbody>${aylar.slice().reverse().map(r => `<tr><td style="white-space:nowrap">${ayAdi(r.ay)}</td><td class="n hide-m">${fmt(bas(r))}</td><td class="n hide-m">${fmt(r.ilkin)}</td><td class="n hide-m">${fmt(r.musteri_odenisi)}</td><td class="n hide-m">${fmt(r.diger_medaxil)}</td><td class="n"><b>${fmt(r.medaxil)}</b></td><td class="n hide-m">${fmt(r.pos)}</td>
        <td class="n hide-m">${fmt(r.rasxod)}</td><td class="n hide-m">${fmt(r.maas)}</td><td class="n hide-m">${fmt(r.sahib)}</td><td class="n hide-m">${fmt(r.diger_mexaric)}</td><td class="n"><b>${fmt(r.mexaric)}</b></td>
        <td class="n ${num(r.ay_sonu_kassa) < 0 ? 'neg' : ''}"><b>${fmt(r.ay_sonu_kassa)}</b></td></tr>`).join('')}</tbody></table></div>
    <h3 style="margin:22px 0 10px">Digər kassa əməliyyatları <span class="muted" style="font-weight:400;font-size:13px">(kredit, bank, sahibin qoyduğu pul və s.)</span></h3>
    <div class="tbl-wrap">${diger.length ? `<table class="t"><thead><tr><th>Tarix</th><th>Növ</th><th>Açıqlama</th><th class="n">Məbləğ</th></tr></thead>
      <tbody>${diger.map(d => `<tr class="${w ? 'click' : ''}" data-d="${d.id}"><td>${fd(d.tarix)}</td><td><span class="badge ${d.nov === 'Mədaxil' ? 'b-green' : 'b-red'}">${d.nov}</span></td><td>${esc(d.aciqlama || '')}</td><td class="n">${fmt(d.mebleg)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">Hələ digər əməliyyat yoxdur</div>'}</div>`;
  if (w) $$('[data-d]').forEach(tr => tr.onclick = () => digerForm(diger.find(d => d.id === +tr.dataset.d)));
}

function digerForm(d) {
  const m = modal(d ? 'Əməliyyatı düzəlt' : 'Digər kassa əməliyyatı', `<form id="gf">
    <div class="field"><label class="f">Növ</label><select class="in" name="n"><option ${!d || d.nov === 'Mədaxil' ? 'selected' : ''}>Mədaxil</option><option ${d && d.nov === 'Məxaric' ? 'selected' : ''}>Məxaric</option></select></div>
    <div class="row2"><div class="field"><label class="f">Tarix</label><input class="in" type="date" name="t" value="${d ? d.tarix : today()}" required></div>
    <div class="field"><label class="f">Məbləğ</label><input class="in" type="number" step="0.01" min="0.01" name="m" value="${d ? d.mebleg : ''}" required></div></div>
    <div class="field"><label class="f">Açıqlama</label><input class="in" name="a" value="${esc(d ? d.aciqlama || '' : '')}" placeholder="məs. Sahib kassaya pul qoydu"></div></form>`,
    `${d ? '<button class="btn danger" id="sil" style="margin-right:auto">Sil</button>' : ''}<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yadda saxla</button>`);
  const f = $('#gf', m);
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    const row = { nov: f.n.value, tarix: f.t.value, mebleg: num(f.m.value), aciqlama: f.a.value.trim() || null };
    try { if (d) await q(sb.from('kassa_diger').update(row).eq('id', d.id)); else await q(sb.from('kassa_diger').insert(row)); closeModal(); toast('Yadda saxlanıldı'); refresh(); }
    catch (er) { fail(er); }
  };
  if ($('#sil', m)) $('#sil', m).onclick = async () => {
    if (!confirm('Bu əməliyyat silinsin?')) return;
    try { await q(sb.from('kassa_diger').delete().eq('id', d.id)); closeModal(); toast('Silindi'); refresh(); } catch (er) { fail(er); }
  };
}

/* =====================================================================
   SİFARİŞLƏR
   ===================================================================== */
const SIF_STATUS = ['Gözləyir', 'Hazırdır', 'Təhvil verildi', 'Ləğv edildi'];
const sifBadge = s => `<span class="badge ${s === 'Gözləyir' ? 'b-amber' : s === 'Hazırdır' ? 'b-blue' : s === 'Təhvil verildi' ? 'b-green' : 'b-gray'}">${s}</span>`;

async function pageSifarisler(params) {
  const fil = params.get('f') || 'aktiv';
  shell('sifarisler', 'Sifarişlər', '', `<input class="in search" id="axtar" placeholder="Axtar: müştəri, mal, telefon">
    <div class="seg" id="fil">${[['aktiv', 'Aktiv'], ['hamisi', 'Hamısı']].map(([k, t]) => `<button data-f="${k}" class="${fil === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    ${canWrite() ? `<button class="btn primary" id="yeni">${ico('plus')}Yeni sifariş</button>` : ''}
    <button class="btn" onclick="window.print()">${ico('print')}Çap</button>`);
  $$('#fil button').forEach(b => b.onclick = () => location.hash = '#/sifarisler?f=' + b.dataset.f);
  if ($('#yeni')) $('#yeni').onclick = () => sifarisForm(null);
  const rows = await all(() => sb.from('sifarisler').select('*').order('tarix', { ascending: false }).order('id', { ascending: false }));
  const draw = () => {
    const s = ($('#axtar').value || '').toLocaleLowerCase('az');
    let list = fil === 'aktiv' ? rows.filter(r => ['Gözləyir', 'Hazırdır'].includes(r.status)) : rows;
    if (s) list = list.filter(r => [r.musteri, r.mal, r.telefon, r.unvan, r.aciqlama].join(' ').toLocaleLowerCase('az').includes(s));
    $('.topbar .sub').textContent = `${list.length} sifariş · cəmi ${man(list.reduce((a, r) => a + num(r.qiymet), 0))}`;
    $('#page').innerHTML = `<div class="tbl-wrap">${list.length ? `<table class="t">
      <thead><tr><th>Tarix</th><th>Müştəri</th><th>Sifariş edilən mal</th><th class="hide-m">Açıqlama</th><th class="n">Qiymət</th><th>Vəziyyət</th></tr></thead>
      <tbody>${list.map(r => `<tr class="${canWrite() ? 'click' : ''}" data-s="${r.id}"><td>${fd(r.tarix)}</td>
        <td><div class="cell-main">${esc(r.musteri || '—')}</div><div class="cell-sub">${esc(r.unvan || '')}${r.telefon ? ' · ' + esc(r.telefon) : ''}</div></td>
        <td>${esc(r.mal || '')}</td><td class="hide-m">${esc(r.aciqlama || '')}</td><td class="n">${r.qiymet != null ? fmt(r.qiymet) : ''}</td><td>${sifBadge(r.status)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">Sifariş yoxdur</div>'}</div>`;
    if (canWrite()) $$('[data-s]').forEach(tr => tr.onclick = () => sifarisForm(rows.find(r => r.id === +tr.dataset.s)));
  };
  $('#axtar').oninput = draw;
  draw();
}

function sifarisForm(r) {
  const m = modal(r ? 'Sifariş' : 'Yeni sifariş', `<form id="pf2">
    <div class="field"><label class="f">Müştərinin adı</label><input class="in" name="ad" value="${esc(r ? r.musteri || '' : '')}" required></div>
    <div class="row2"><div class="field"><label class="f">Ünvan</label><input class="in" name="un" value="${esc(r ? r.unvan || '' : '')}"></div>
    <div class="field"><label class="f">Telefon</label><input class="in" name="tel" value="${esc(r ? r.telefon || '' : '')}"></div></div>
    <div class="row2"><div class="field"><label class="f">Tarix</label><input class="in" type="date" name="t" value="${r ? r.tarix : today()}" required></div>
    <div class="field"><label class="f">Qiymət</label><input class="in" type="number" step="0.01" min="0" name="q" value="${r && r.qiymet != null ? r.qiymet : ''}"></div></div>
    <div class="field"><label class="f">Sifariş edilən mal</label><input class="in" name="mal" value="${esc(r ? r.mal || '' : '')}" required></div>
    <div class="field"><label class="f">Açıqlama</label><input class="in" name="a" value="${esc(r ? r.aciqlama || '' : '')}" placeholder="ölçü, rəng, təhvil tarixi…"></div>
    <div class="field"><label class="f">Vəziyyət</label><select class="in" name="s">${SIF_STATUS.map(s => `<option ${(r ? r.status : 'Gözləyir') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div></form>`,
    `${r ? '<button class="btn danger" id="sil" style="margin-right:auto">Sil</button>' : ''}${r && r.status !== 'Təhvil verildi' ? '<button class="btn green" id="sat">Satışa çevir</button>' : ''}<button class="btn" data-close>Bağla</button><button class="btn primary" id="ok">Yadda saxla</button>`);
  const f = $('#pf2', m);
  const row = () => ({ musteri: f.ad.value.trim(), unvan: f.un.value.trim() || null, telefon: f.tel.value.trim() || null, tarix: f.t.value,
    qiymet: f.q.value === '' ? null : num(f.q.value), mal: f.mal.value.trim(), aciqlama: f.a.value.trim() || null, status: f.s.value });
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    try { if (r) await q(sb.from('sifarisler').update(row()).eq('id', r.id)); else await q(sb.from('sifarisler').insert(row())); closeModal(); toast('Yadda saxlanıldı'); refresh(); }
    catch (er) { fail(er); }
  };
  if ($('#sil', m)) $('#sil', m).onclick = async () => {
    if (!confirm('Bu sifariş silinsin?')) return;
    try { await q(sb.from('sifarisler').delete().eq('id', r.id)); closeModal(); toast('Silindi'); refresh(); } catch (er) { fail(er); }
  };
  if ($('#sat', m)) $('#sat', m).onclick = () => {
    const x = row();
    yeniSatis(null, { ad: x.musteri, unvan: x.unvan, tel: x.telefon, mal: x.mal, deyer: x.qiymet, sifarisId: r.id });
  };
}

/* =====================================================================
   AYLIQ HESABAT (PDF)
   ===================================================================== */
async function pageHesabat(params) {
  const ay = params.get('ay') || ayBasi(today());
  const aylar = await q(sb.from('v_kassa').select('*').order('ay', { ascending: false }));
  shell('hesabat', 'Aylıq hesabat', '', `<select class="in" id="ay" style="width:auto">${aylar.map(a => `<option value="${a.ay}" ${a.ay === ay ? 'selected' : ''}>${ayAdi(a.ay)}</option>`).join('')}</select>
    <button class="btn primary" onclick="window.print()">${ico('print')}PDF / Çap</button>`);
  $('#ay').onchange = e => location.hash = '#/hesabat?ay=' + e.target.value;
  const A = aylar.find(a => a.ay === ay) || {};
  const son = aySonu(ay);
  const [sat, pays, rx, kat, iod, isc, mus] = await Promise.all([
    all(() => sb.from('v_satislar').select('*').gte('tarix', ay).lte('tarix', son).order('tarix').order('id')),
    all(() => sb.from('satis_odenisleri').select('*').gte('tarix', ay).lte('tarix', son).order('tarix').order('id')),
    all(() => sb.from('rasxodlar').select('*').gte('tarix', ay).lte('tarix', son).order('tarix').order('id')),
    q(sb.from('v_rasxod_kateqoriya').select('*').eq('ay', ay)),
    all(() => sb.from('isci_odenisleri').select('*').gte('tarix', ay).lte('tarix', son).order('tarix').order('id')),
    q(sb.from('isciler').select('id,ad,nov')),
    all(() => sb.from('v_musteriler').select('id,qaliq,gecikme_gun').order('id')),
  ]);
  const satIds = [...new Set(pays.map(p => p.satis_id))];
  const paySat = satIds.length ? await all(() => sb.from('v_satislar').select('id,satis_no,musteri').in('id', satIds).order('id')) : [];
  const sMap = Object.fromEntries(paySat.map(s => [s.id, s]));
  const iMap = Object.fromEntries(isc.map(i => [i.id, i]));
  const xalis = num(A.medaxil) - num(A.mexaric);
  const borc = mus.reduce((a, m) => a + num(m.qaliq), 0);
  const gec = mus.filter(m => num(m.qaliq) > 0 && m.gecikme_gun > 0);
  const sum = (l, k) => l.reduce((a, r) => a + num(r[k]), 0);
  const row2 = (a, b, cls) => `<tr><td>${a}</td><td class="n ${cls || ''}">${b}</td></tr>`;
  const sec = (title, body) => `<div class="card" style="padding:0;margin-top:16px;overflow:auto"><h3 style="padding:16px 20px 0">${title}</h3>${body}</div>`;
  $('#page').innerHTML = `
    <div class="card" style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div><div style="font-size:20px;font-weight:700;color:var(--brand)">${esc(firmaAdi())}</div><div class="muted">Aylıq hesabat — ${ayAdi(ay)}</div></div>
      <div class="muted" style="text-align:right">Hazırlanıb: ${fd(today())}<br>${esc(S.ad)}</div></div></div>
    <div class="grid two">
      <div class="card" style="padding:0"><h3 style="padding:16px 20px 0">Ümumi göstəricilər</h3><table class="t"><tbody>
        ${row2('Satış (malın dəyəri)', man(A.satis))}${row2('Satış sayı', fmt(A.satis_sayi))}
        ${row2('İlkin ödənişlər', man(A.ilkin))}${row2('Müştəri ödənişləri (kredit)', man(A.musteri_odenisi))}${row2('Digər mədaxil', man(A.diger_medaxil))}
        ${row2('<b>Kassaya daxil olan</b>', '<b>' + man(A.medaxil) + '</b>')}
        ${row2('Xərclər', man(A.rasxod))}${row2('İşçilərə maaş', man(A.maas))}${row2('Sahib götürmələri', man(A.sahib))}${row2('Digər məxaric', man(A.diger_mexaric))}
        ${row2('<b>Kassadan çıxan</b>', '<b>' + man(A.mexaric) + '</b>')}
        ${row2('<b>Fərq (daxil − çıxan)</b>', '<b>' + man(xalis) + '</b>', xalis < 0 ? 'neg' : 'pos')}
        ${row2('Ay sonu kassa', man(A.ay_sonu_kassa), num(A.ay_sonu_kassa) < 0 ? 'neg' : '')}
      </tbody></table></div>
      <div>
        <div class="card" style="padding:0"><h3 style="padding:16px 20px 0">Müştəri borcları (bu günə)</h3><table class="t"><tbody>
          ${row2('Ümumi qalıq borc', man(borc))}${row2('Gecikən borc (30+ gün)', man(gec.reduce((a, m) => a + num(m.qaliq), 0)))}${row2('Gecikən müştəri sayı', fmt(gec.length))}
          ${row2('Bu ayın satışlarından qalan borc', man(A.satisdan_qalan))}</tbody></table></div>
        <div class="card" style="padding:0;margin-top:16px"><h3 style="padding:16px 20px 0">Xərclər kateqoriyalar üzrə</h3><table class="t"><tbody>
          ${KATS.map(k => { const r = kat.find(x => x.kateqoriya === k); return row2(k, man(r ? r.cem : 0)); }).join('')}</tbody>
          <tfoot><tr><td>Cəm</td><td class="n">${man(sum(kat, 'cem'))}</td></tr></tfoot></table></div>
      </div>
    </div>
    ${sec(`Ayın satışları (${sat.length})`, sat.length ? `<table class="t"><thead><tr><th>№</th><th>Tarix</th><th>Müştəri</th><th class="hide-m">Mal</th><th class="n">Dəyəri</th><th class="n">İlkin</th><th class="n">Qalıq</th></tr></thead>
      <tbody>${sat.map(s => `<tr><td class="muted">${esc(s.satis_no)}</td><td>${fd(s.tarix)}</td><td>${esc(s.musteri)}</td><td class="hide-m">${esc(s.mal || '')}</td><td class="n">${fmt(s.deyer)}</td><td class="n">${fmt(s.ilkin)}</td><td class="n">${fmt(s.qaliq)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">Cəm</td><td class="hide-m"></td><td class="n">${fmt(sum(sat, 'deyer'))}</td><td class="n">${fmt(sum(sat, 'ilkin'))}</td><td class="n">${fmt(sum(sat, 'qaliq'))}</td></tr></tfoot></table>` : '<div class="empty">Satış yoxdur</div>')}
    ${sec(`Müştərilərdən alınan kredit ödənişləri (${pays.length})`, pays.length ? `<table class="t"><thead><tr><th>Tarix</th><th>Müştəri</th><th>Satış</th><th class="n">Məbləğ</th></tr></thead>
      <tbody>${pays.map(p => `<tr><td>${fd(p.tarix)}</td><td>${esc(sMap[p.satis_id] ? sMap[p.satis_id].musteri : '')}</td><td class="muted">${esc(sMap[p.satis_id] ? sMap[p.satis_id].satis_no : '')}</td><td class="n">${fmt(p.mebleg)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">Cəm</td><td class="n">${fmt(sum(pays, 'mebleg'))}</td></tr></tfoot></table>` : '<div class="empty">Ödəniş yoxdur</div>')}
    ${sec(`Xərclər (${rx.length})`, rx.length ? `<table class="t"><thead><tr><th>Tarix</th><th>Açıqlama</th><th class="hide-m">Kateqoriya</th><th class="n">Məbləğ</th></tr></thead>
      <tbody>${rx.map(r => `<tr><td>${fd(r.tarix)}</td><td>${esc(r.aciqlama || '')}</td><td class="hide-m">${esc(r.kateqoriya)}</td><td class="n">${fmt(r.mebleg)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">Cəm</td><td class="hide-m"></td><td class="n">${fmt(sum(rx, 'mebleg'))}</td></tr></tfoot></table>` : '<div class="empty">Xərc yoxdur</div>')}
    ${sec(`İşçi və sahib ödənişləri (${iod.length})`, iod.length ? `<table class="t"><thead><tr><th>Tarix</th><th>Ad</th><th>Növ</th><th class="n">Məbləğ</th></tr></thead>
      <tbody>${iod.map(o => `<tr><td>${fd(o.tarix)}</td><td>${esc(iMap[o.isci_id] ? iMap[o.isci_id].ad : '')}${iMap[o.isci_id] && iMap[o.isci_id].nov === 'Sahib' ? ' <span class="muted">(sahib)</span>' : ''}</td><td>${o.nov}</td><td class="n">${fmt(o.mebleg)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">Cəm</td><td class="n">${fmt(sum(iod, 'mebleg'))}</td></tr></tfoot></table>` : '<div class="empty">Ödəniş yoxdur</div>')}`;
}

/* =====================================================================
   ÖDƏNİŞ QRAFİKİ — köməkçilər
   ===================================================================== */
function ayArtir(d, n) {
  const [y, m, g] = String(d).slice(0, 10).split('-').map(Number);
  const son = new Date(y, m - 1 + n + 1, 0).getDate();
  return iso(new Date(y, m - 1 + n, Math.min(g, son)));
}
function qrafikSaheleri(ayliq, ilk, maya) {
  return `<div style="background:#faf4ea;border-radius:10px;padding:12px 12px 2px;margin-bottom:14px">
    <b style="display:block;margin-bottom:8px">Ödəniş qrafiki <span class="muted" style="font-weight:400">(nağd satışda boş saxlayın)</span></b>
    <div class="row2"><div class="field"><label class="f">Aylıq ödəniş</label><input class="in" type="number" step="0.01" min="0.01" name="ay" value="${ayliq != null ? ayliq : ''}"></div>
    <div class="field"><label class="f">İlk ödəniş tarixi</label><input class="in" type="date" name="ilk" value="${ilk || ''}"></div></div>
    <div class="muted" id="qinfo2" style="margin:-6px 0 10px;font-size:13px"></div>
    <input type="hidden" name="maya" value="${maya != null ? maya : ''}"></div>`;
}
function qrafikIzle(f, yeni) {
  const info = () => {
    const kr = num(f.d.value) - num(f.i.value), ay = num(f.ay.value);
    if (yeni && ay > 0 && !f.ilk.value && f.t.value) f.ilk.value = ayArtir(f.t.value, 1);
    $('#qinfo2', f).textContent = kr > 0 && ay > 0 ? `Kredit ${man(kr)} → ${Math.ceil(kr / ay)} ay${f.ilk.value ? `, son ödəniş ${fd(ayArtir(f.ilk.value, Math.ceil(kr / ay) - 1))}` : ''}` : '';
  };
  ['d', 'i', 'ay', 'ilk', 't'].forEach(k => f[k] && f[k].addEventListener('input', info));
  info();
}
function qrafikDeyerleri(f) {
  const ay = num(f.ay.value);
  return { ayliq: ay > 0 ? ay : null, ilk_odenis: ay > 0 && f.ilk.value ? f.ilk.value : null, maya: f.maya.value === '' ? null : num(f.maya.value) };
}
function qrafikCetveli(s, qr) {
  const kr = num(s.deyer) - num(s.ilkin), ay = num(qr.ayliq);
  if (!(ay > 0) || !qr.ilk_odenis || kr <= 0) return [];
  const out = []; let cem = 0; const paid = num(s.odenilen); const bugun = today();
  for (let k = 1; cem < kr - 0.001 && k <= 240; k++) {
    const mb = Math.min(ay, kr - cem); cem += mb;
    const tarix = ayArtir(qr.ilk_odenis, k - 1);
    const status = paid >= cem - 0.001 ? 'odenib' : paid > cem - mb + 0.001 ? 'qismen' : tarix < bugun ? 'gecikib' : tarix === bugun ? 'bugun' : 'gozleyir';
    out.push({ no: k, tarix, mebleg: mb, cem, status });
  }
  return out;
}
// Qiymət növləri: məhsulda 4 qiymət (1 = əsas). Adları Ayarlarda dəyişilir.
const QNOV_DEF = ['Qiymət 1', 'Qiymət 2', 'Qiymət 3', 'Endirim qiyməti'];
const qAdlari = () => { const A = S.cache.ayar || {}; return QNOV_DEF.map((d, i) => (A['qiymet_ad_' + (i + 1)] || '').trim() || d); };
const mQ = (x, n) => { const v = x && x[n > 1 ? 'qiymet' + n : 'qiymet']; return v == null || v === '' ? null : num(v); };
const mNovler = x => [1, 2, 3, 4].filter(n => mQ(x, n) != null);
// Satış formasında məhsul sətirləri: kataloqdan seçim, miqdar, qiymət; malın adı/dəyəri/maya avtomatik
async function setirRedaktor(m, f, setirler, qal) {
  await ayarlar();
  const mehs = S.cache.mehs || (S.cache.mehs = await all(() => sb.from('v_mehsullar').select('id,ad,kod,kateqoriya,qiymet,qiymet2,qiymet3,qiymet4,maya,anbar_izle,anbar').eq('aktiv', true).order('ad')));
  const QA = qAdlari(), cox = mehs.some(x => mNovler(x).length > 1);
  const mh = id => mehs.find(z => z.id === id);
  let sev = 1;
  const novSecimi = (x, i) => {
    const p = mh(x.mehsul_id), nl = mNovler(p); if (nl.length < 2) return '';
    const cari = nl.find(n => mQ(p, n) === num(x.qiymet));
    return `<select class="in qsel" data-qn="${i}">${cari ? '' : '<option value="0" selected>Əl ilə</option>'}${nl.map(n => `<option value="${n}" ${n === cari ? 'selected' : ''}>${esc(QA[n - 1])} — ${fmt(mQ(p, n))} ₼</option>`).join('')}</select>`;
  };
  const yenile = (dyaz = true) => {
    $('#psetir', m).innerHTML = setirler.length ? `${cox ? `<div class="qnov-bar"><span class="muted">Qiymət növü:</span><div class="seg">${QA.map((a, i) => `<button type="button" data-sev="${i + 1}" class="${sev === i + 1 ? 'on' : ''}">${esc(a)}</button>`).join('')}</div></div>` : ''}<table class="t" style="margin-top:8px"><tbody>${setirler.map((x, i) => `<tr>
      <td style="padding-left:0">${esc(x.ad)}${novSecimi(x, i)}</td>
      <td style="width:70px"><input class="in" type="number" min="1" step="1" value="${x.miqdar}" data-mq="${i}" style="padding:5px 6px"></td>
      <td style="width:100px"><input class="in" type="number" min="0" step="0.01" value="${x.qiymet}" data-qy="${i}" style="padding:5px 6px"></td>
      <td class="n" style="width:80px"><b>${fmt(x.miqdar * x.qiymet)}</b></td><td style="width:30px;padding-right:0"><button type="button" class="btn sm danger" data-sl="${i}">×</button></td></tr>`).join('')}</tbody>
      <tfoot><tr><td style="padding-left:0">Cəm</td><td></td><td></td><td class="n">${fmt(setirler.reduce((a, x) => a + x.miqdar * x.qiymet, 0))}</td><td></td></tr></tfoot></table>` : '';
    if (dyaz && setirler.length) {
      f.mal.value = setirler.map(x => x.ad + (x.miqdar > 1 ? ' ×' + x.miqdar : '')).join(', ');
      f.d.value = Math.round(setirler.reduce((a, x) => a + x.miqdar * x.qiymet, 0) * 100) / 100;
      f.maya.value = setirler.every(x => x.maya != null) ? Math.round(setirler.reduce((a, x) => a + x.miqdar * num(x.maya), 0) * 100) / 100 : '';
      f.d.dispatchEvent(new Event('input'));
    }
    $$('[data-mq]', m).forEach(el => el.onchange = () => { setirler[+el.dataset.mq].miqdar = Math.max(1, num(el.value)); setTimeout(() => yenile()); });
    $$('[data-qy]', m).forEach(el => el.onchange = () => { setirler[+el.dataset.qy].qiymet = Math.max(0, num(el.value)); setTimeout(() => yenile()); });
    $$('[data-sl]', m).forEach(el => el.onclick = () => { setirler.splice(+el.dataset.sl, 1); yenile(); });
    $$('[data-qn]', m).forEach(el => el.onchange = () => { const x = setirler[+el.dataset.qn], v = mQ(mh(x.mehsul_id), +el.value); if (v != null) { x.qiymet = v; setTimeout(() => yenile()); } });
    $$('[data-sev]', m).forEach(el => el.onclick = () => {
      sev = +el.dataset.sev;
      setirler.forEach(x => { const p = mh(x.mehsul_id); if (!p) return; const v = mQ(p, sev); x.qiymet = v != null ? v : mQ(p, 1); });
      const yox = setirler.filter(x => mh(x.mehsul_id) && mQ(mh(x.mehsul_id), sev) == null).length;
      if (yox && sev > 1) toast(`${yox} məhsulda "${QA[sev - 1]}" yoxdur — əsas qiymət qaldı`, 3500);
      yenile();
    });
    if (qal) qal();
  };
  const psug = $('#psug', m);
  $('#pax', m).oninput = e => {
    const t = e.target.value.trim().toLocaleLowerCase('az');
    if (!t) { psug.style.display = 'none'; return; }
    const list = mehs.filter(x => [x.ad, x.kod, x.kateqoriya].join(' ').toLocaleLowerCase('az').includes(t)).slice(0, 20);
    psug.style.display = '';
    psug.innerHTML = list.length ? list.map(x => `<div data-pid="${x.id}"><b>${esc(x.ad)}</b> <span class="muted">${esc(x.kateqoriya || '')}${x.kod ? ' · ' + esc(x.kod) : ''}</span>
        ${x.anbar_izle ? `<span class="badge ${num(x.anbar) > 0 ? 'b-green' : 'b-red'}">anbarda ${fmt(x.anbar)}</span>` : ''} <span style="float:right"><b>${fmt(mQ(x, sev) != null ? mQ(x, sev) : x.qiymet)} ₼</b></span></div>`).join('')
      : `<div class="muted" style="cursor:default">Kataloqda yoxdur${canWrite() ? ' — "Məhsullar" bölməsindən əlavə edin' : ''}</div>`;
    $$('[data-pid]', psug).forEach(d => d.onclick = () => elaveEt(mehs.find(z => z.id === +d.dataset.pid)));
  };
  const elaveEt = x => {
    const var_ = setirler.find(z => z.mehsul_id === x.id);
    if (var_) var_.miqdar += 1; else setirler.push({ mehsul_id: x.id, ad: x.ad, miqdar: 1, qiymet: mQ(x, sev) != null ? mQ(x, sev) : num(x.qiymet), maya: x.maya == null ? null : num(x.maya) });
    if (x.anbar_izle && (var_ ? var_.miqdar : 1) > num(x.anbar)) toast(`Diqqət: "${x.ad}" anbarda ${fmt(x.anbar)} ədəddir`, 4000);
    else toast(`+ ${x.ad}${var_ ? ' (' + fmt(var_.miqdar) + ' ədəd)' : ''}`, 1500);
    psug.style.display = 'none'; $('#pax', m).value = ''; yenile(); $('#pax', m).focus();
  };
  // barkod oxuyucu kodu yazıb Enter basır: dəqiq uyğunluq varsa dərhal əlavə olunur
  const barkodla = t => {
    t = String(t || '').trim(); if (!t) return;
    const x = mehs.find(z => barkodBerabar(z, t));
    if (x) return elaveEt(x);
    const d = $('[data-pid]', psug); if (d && psug.style.display !== 'none') return d.click();
    toast(`"${t}" barkodu ilə məhsul tapılmadı`, 4000); $('#pax', m).select();
  };
  $('#pax', m).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); barkodla(e.target.value); } };
  $('#pcam', m).onclick = () => kameraOxu(barkodla);
  yenile(false);
  return yenile;
}
const USULLAR = ['Nağd', 'POS', 'Parçalı', 'Borc'];
const USUL_IZAH = { 'Nağd': 'Tam məbləğ nağd ödənilir', 'POS': 'Tam məbləğ kartla (POS terminal) ödənilir', 'Parçalı': 'Bir hissə nağd, bir hissə kartla; qalan olarsa borc kimi yazılır', 'Borc': 'Hissə-hissə ödəniş (kredit): ilkin ödəniş + aylıq qrafik' };
const usulBadge = u => u ? `<span class="badge ${u === 'Borc' ? 'b-amber' : u === 'POS' ? 'b-blue' : u === 'Parçalı' ? 'b-gray' : 'b-green'}">${esc(u)}</span>` : '';
// Satış formasında "Ödəniş üsulu": f.i (ilkin) və f.ip (ilkinin POS hissəsi) buradan idarə olunur
const USUL_SAHESI = (u, ilkin, ipos) => `<div class="field"><label class="f">Ödəniş üsulu</label>
    <div class="seg usul" id="usul">${USULLAR.map(x => `<button type="button" data-u="${x}" class="${x === u ? 'on' : ''}">${x}</button>`).join('')}</div>
    <div class="muted" id="usulizah" style="font-size:12.5px;margin-top:4px"></div></div>
  <input type="hidden" name="usul" value="${u}"><input type="hidden" name="ip" value="${ipos || 0}">
  <div class="row2" id="u-parca" style="display:none"><div class="field"><label class="f">Nağd</label><input class="in" type="number" step="0.01" min="0" name="pn" value="${u === 'Parçalı' ? Math.max(0, num(ilkin) - num(ipos)) : ''}"></div>
    <div class="field"><label class="f">Kartla (POS)</label><input class="in" type="number" step="0.01" min="0" name="pp" value="${u === 'Parçalı' ? num(ipos) : ''}"></div></div>
  <div class="row2" id="u-borc"><div class="field"><label class="f">İlkin ödəniş</label><input class="in" type="number" step="0.01" min="0" name="i" value="${ilkin != null ? ilkin : 0}"></div>
    <div class="field"><label class="f">İlkin ödənişin üsulu</label><select class="in" name="iu"><option>Nağd</option><option ${u === 'Borc' && num(ipos) > 0 ? 'selected' : ''}>POS</option></select></div></div>`;
function usulIzle(m, f) {
  const qr = f.ay ? f.ay.closest('div[style*="background"]') : null;
  const tetbiq = () => {
    const u = f.usul.value, d = num(f.d.value);
    $$('#usul button', m).forEach(b => b.classList.toggle('on', b.dataset.u === u));
    $('#u-parca', m).style.display = u === 'Parçalı' ? '' : 'none';
    $('#u-borc', m).style.display = u === 'Borc' ? '' : 'none';
    let izah = USUL_IZAH[u];
    if (u === 'Nağd') { f.i.value = d; f.ip.value = 0; }
    else if (u === 'POS') { f.i.value = d; f.ip.value = d; }
    else if (u === 'Parçalı') { const n = num(f.pn.value), pp = num(f.pp.value); f.i.value = Math.round((n + pp) * 100) / 100; f.ip.value = pp;
      const q_ = Math.round((d - n - pp) * 100) / 100; izah += q_ > 0.001 ? ` · <b class="neg">borc qalır: ${man(q_)}</b>` : q_ < -0.001 ? ` · <b class="neg">${man(-q_)} artıqdır</b>` : ' · <b class="pos">tam ödənilir</b>'; }
    else { f.ip.value = f.iu.value === 'POS' ? num(f.i.value) : 0; }
    $('#usulizah', m).innerHTML = izah;
    const borcVar = u === 'Borc' || (u === 'Parçalı' && num(f.i.value) < d - 0.001);
    if (qr) qr.style.display = borcVar ? '' : 'none';
    if (!borcVar && f.ay) { f.ay.value = ''; f.ilk.value = ''; }
    f.i.dispatchEvent(new Event('input'));
  };
  $$('#usul button', m).forEach(b => b.onclick = () => { f.usul.value = b.dataset.u; tetbiq(); });
  ['pn', 'pp', 'iu'].forEach(k => f[k].addEventListener(k === 'iu' ? 'change' : 'input', tetbiq));
  f.i.addEventListener('change', () => { if (f.usul.value === 'Borc') f.ip.value = f.iu.value === 'POS' ? num(f.i.value) : 0; });
  f.d.addEventListener('input', () => { if (f.usul.value !== 'Borc') tetbiq(); });
  tetbiq();
  return () => {
    const u = f.usul.value, d = num(f.d.value), ilkin = num(f.i.value), ip = u === 'Borc' ? (f.iu.value === 'POS' ? ilkin : 0) : num(f.ip.value);
    if (ilkin > d + 0.001) return { xeta: 'Ödənilən məbləğ satışın dəyərindən çox ola bilməz' };
    return { odenis_usulu: u, ilkin, ilkin_pos: Math.min(ip, ilkin) };
  };
}
const SATICI_SAHESI = `<div class="field"><label class="f">Satıcı</label><select class="in" name="sat"><option value="">— seçilməyib —</option></select></div>`;
async function saticiDoldur(sel, cari) {
  const isc = S.cache.isc0 || (S.cache.isc0 = await q(sb.from('isciler').select('id,ad,nov,cixis').order('ad')));
  const aktiv = isc.filter(i => !i.cixis || i.cixis >= today() || i.id === cari);
  let son = null; try { son = +localStorage.getItem('son_satici') || null; } catch (_) {}
  const sec = cari !== undefined ? cari : son;
  sel.innerHTML = '<option value="">— seçilməyib —</option>' + aktiv.map(i => `<option value="${i.id}" ${i.id === sec ? 'selected' : ''}>${esc(i.ad)}</option>`).join('');
  sel.onchange = () => { try { localStorage.setItem('son_satici', sel.value); } catch (_) {} };
}
const barkodBerabar = (x, t) => !!x.kod && String(x.kod).trim().toLowerCase() === String(t).trim().toLowerCase();
async function kameraOxu(cb) {
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices) {
    toast('Bu brauzer kamera ilə barkod oxumur. USB barkod oxuyucudan istifadə edin və ya telefonda Chrome ilə açın.', 6000); return;
  }
  let formatlar = ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf', 'qr_code'];
  try { const d = await BarcodeDetector.getSupportedFormats(); formatlar = formatlar.filter(f => d.includes(f)); } catch (_) {}
  const det = new BarcodeDetector({ formats: formatlar });
  const ov = document.createElement('div'); ov.className = 'overlay kamera-ov';
  ov.innerHTML = `<div class="modal" style="max-width:480px"><div class="mh"><h3>Barkodu kameraya tutun</h3><button class="x" type="button">×</button></div>
    <div class="mb" style="padding:0;position:relative;background:#000"><video playsinline muted style="width:100%;display:block;max-height:60vh;object-fit:cover"></video>
    <div style="position:absolute;left:10%;right:10%;top:45%;height:2px;background:rgba(255,80,60,.9);box-shadow:0 0 8px rgba(255,80,60,.9)"></div></div>
    <div class="mf"><span class="muted" style="font-size:13px;margin-right:auto">Barkod xəttə düşəndə avtomatik oxunur</span><button class="btn" type="button" data-x>Bağla</button></div></div>`;
  document.body.appendChild(ov);
  let stream = null, dayan = false;
  const bitir = () => { dayan = true; if (stream) stream.getTracks().forEach(t => t.stop()); ov.remove(); };
  ov.querySelector('.x').onclick = bitir; ov.querySelector('[data-x]').onclick = bitir;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    const v = ov.querySelector('video'); v.srcObject = stream; await v.play();
    const dovr = async () => {
      if (dayan) return;
      try { const r = await det.detect(v); if (r.length) { const kod = r[0].rawValue; bitir(); if (navigator.vibrate) navigator.vibrate(80); cb(kod); return; } } catch (_) {}
      setTimeout(dovr, 200);
    };
    dovr();
  } catch (er) { bitir(); toast('Kameranı açmaq olmadı: ' + (er.message || er), 5000); }
}
const MEHSUL_SAHESI = `<div class="field"><label class="f">Məhsullar <span class="muted" style="font-weight:400">(kataloqdan seçin və ya aşağıda əl ilə yazın)</span></label>
      <div style="display:flex;gap:6px"><input class="in" id="pax" placeholder="Məhsul adı, kodu və ya barkodu oxudun…" autocomplete="off"><button type="button" class="btn" id="pcam" title="Kamera ilə barkod oxu">📷</button></div>
      <div class="suggest" id="psug" style="display:none"></div>
      <div id="psetir"></div></div>`;
// Zamin sahələri
const zaminSaheleri = s => `<details class="zamin" ${s && s.zamin_ad ? 'open' : ''}><summary>Zamin <span class="muted" style="font-weight:400">(istəyə bağlı)</span></summary>
    <div class="row2" style="margin-top:8px"><div class="field"><label class="f">Zaminin adı soyadı</label><input class="in" name="zad" value="${esc(s && s.zamin_ad || '')}"></div>
    <div class="field"><label class="f">Zaminin telefonu</label><input class="in" name="ztel" inputmode="tel" value="${esc(s && s.zamin_tel || '')}"></div></div>
    <div class="field"><label class="f">Şəxsiyyət vəsiqəsi / iş yeri / qeyd</label><input class="in" name="zq" value="${esc(s && s.zamin_qeyd || '')}"></div></details>`;
const zaminDeyerleri = f => ({ zamin_ad: f.zad.value.trim() || null, zamin_tel: f.ztel.value.trim() || null, zamin_qeyd: f.zq.value.trim() || null });

// Gecikmə cəriməsi: hər gecikən hissə üçün ödənməmiş məbləğ × günlük faiz × gecikmə günü (güzəşt günlərindən sonra), yuxarı hədd ilə
function cerimeHesabla(s, qr, A) {
  const gun = num(A.cerime_gunluk); if (!(gun > 0) || !qr || !qr.qrafikli) return null;
  const guz = num(A.cerime_guzest), maxF = num(A.cerime_max);
  const bugun = new Date(today() + 'T00:00:00'); let cem = 0, gecikmis = 0, maxGun = 0;
  for (const c of qrafikCetveli(s, qr)) {
    if (c.status !== 'gecikib' && c.status !== 'qismen') continue;
    const odenmemis = Math.max(0, Math.min(c.mebleg, c.cem - num(s.odenilen)));
    const g = Math.round((bugun - new Date(c.tarix + 'T00:00:00')) / 864e5) - guz;
    if (odenmemis <= 0 || g <= 0) continue;
    gecikmis += odenmemis; maxGun = Math.max(maxGun, g + guz);
    cem += odenmemis * gun / 100 * g;
  }
  if (maxF > 0) cem = Math.min(cem, gecikmis * maxF / 100);
  cem = Math.round(cem * 100) / 100;
  return cem > 0 ? { cem, gecikmis, gun: maxGun } : null;
}

const qrafikBadge = st => ({ odenib: '<span class="badge b-green">Ödənilib</span>', qismen: '<span class="badge b-amber">Qismən</span>', gecikib: '<span class="badge b-red">Gecikib</span>', bugun: '<span class="badge b-amber">Bu gün</span>', gozleyir: '<span class="badge b-gray">Gözləyir</span>' }[st] || '');

async function ayarlar() {
  if (S.cache.ayar) return S.cache.ayar;
  const r = await q(sb.from('ayarlar').select('*'));
  return (S.cache.ayar = Object.fromEntries(r.map(a => [a.acar, a.deyer || ''])));
}

/* =====================================================================
   ÖDƏNİŞ TƏQVİMİ
   ===================================================================== */
async function pageTeqvim(params) {
  shell('teqvim', 'Ödəniş təqvimi', 'Qrafiki olan kredit satışları üzrə gözlənilən ödənişlər', `<input class="in search" id="axtar" placeholder="Axtar: müştəri, telefon">
    <button class="btn" onclick="window.print()">${ico('print')}Çap</button>`);
  const [qr, sat] = await Promise.all([
    all(() => sb.from('v_qrafik').select('*').eq('qrafikli', true).gt('qaliq', 0).order('id')),
    all(() => sb.from('v_satislar').select('id,satis_no,musteri,telefon,unvan,mal').gt('qaliq', 0).order('id')),
  ]);
  const sm = Object.fromEntries(sat.map(s => [s.id, s]));
  const bugun = today(), hefte = iso(new Date(Date.now() + 7 * 864e5)), ay30 = iso(new Date(Date.now() + 30 * 864e5));
  const rows = qr.map(r => Object.assign({}, r, sm[r.id] || {}));
  const draw = () => {
    const s = ($('#axtar').value || '').toLocaleLowerCase('az');
    const L = s ? rows.filter(r => [r.musteri, r.telefon, r.unvan, r.satis_no].join(' ').toLocaleLowerCase('az').includes(s)) : rows;
    const grup = [
      ['Vaxtı keçmiş', L.filter(r => num(r.gecikmis) > 0 && r.novbeti_tarix < bugun).sort((a, b) => a.novbeti_tarix < b.novbeti_tarix ? -1 : 1), 'b-red'],
      ['Bu gün', L.filter(r => r.novbeti_tarix === bugun), 'b-amber'],
      ['Bu həftə', L.filter(r => r.novbeti_tarix > bugun && r.novbeti_tarix <= hefte).sort((a, b) => a.novbeti_tarix < b.novbeti_tarix ? -1 : 1), 'b-blue'],
      ['Gələn 30 gün', L.filter(r => r.novbeti_tarix > hefte && r.novbeti_tarix <= ay30).sort((a, b) => a.novbeti_tarix < b.novbeti_tarix ? -1 : 1), 'b-gray'],
    ];
    const meb = r => Math.max(num(r.gecikmis), num(r.novbeti_mebleg));
    $('#page').innerHTML = (rows.length ? '' : `<div class="card" style="margin-bottom:16px">Hələ ödəniş qrafiki olan satış yoxdur. Yeni satış yazanda və ya köhnə satışı düzəldəndə <b>aylıq ödəniş</b> və <b>ilk ödəniş tarixi</b> yazın — burada görünəcək.</div>`) +
      `<div class="grid kpis" style="margin-bottom:16px">${grup.map(([t, l, b]) => `<div class="card kpi"><div class="lbl"><span class="badge ${b}">${t}</span></div><div class="val">${man(l.reduce((a, r) => a + meb(r), 0))}</div><div class="cmp">${l.length} satış</div></div>`).join('')}</div>` +
      grup.filter(g => g[1].length).map(([t, l, b]) => `<h3 style="margin:18px 0 8px">${t}</h3><div class="tbl-wrap"><table class="t">
        <thead><tr><th>Ödəniş günü</th><th>Müştəri</th><th class="hide-m">Mal</th><th class="n">Ödəməli</th><th class="n hide-m">Aylıq</th><th class="n">Qalıq borc</th></tr></thead>
        <tbody>${l.map(r => `<tr class="click" data-s="${r.id}"><td><span class="badge ${b}">${fd(r.novbeti_tarix)}</span>${r.novbeti_tarix < bugun ? `<div class="cell-sub">${Math.round((new Date(bugun) - new Date(r.novbeti_tarix)) / 864e5)} gün keçib</div>` : ''}</td>
          <td><div class="cell-main">${esc(r.musteri || '')}</div><div class="cell-sub">${esc(r.telefon || '')}${r.unvan ? ' · ' + esc(r.unvan) : ''}</div></td>
          <td class="hide-m">${esc(r.mal || '')} <span class="muted">${esc(r.satis_no || '')}</span></td><td class="n"><b>${fmt(meb(r))}</b></td><td class="n hide-m">${fmt(r.ayliq)}</td><td class="n">${fmt(r.qaliq)}</td></tr>`).join('')}</tbody></table></div>`).join('');
    $$('[data-s]').forEach(tr => tr.onclick = () => satisModal(+tr.dataset.s));
  };
  $('#axtar').oninput = draw; draw();
}

/* =====================================================================
   MƏNFƏƏT
   ===================================================================== */
async function pageMenfeet() {
  shell('menfeet', 'Mənfəət', 'Satış − xərclər − işçi maaşı (sahib götürmələri daxil deyil)', `<button class="btn" onclick="window.print()">${ico('print')}Çap / PDF</button>`);
  const [aylar, kat, qr] = await Promise.all([
    q(sb.from('v_aylar').select('*').order('ay', { ascending: false })),
    q(sb.from('v_rasxod_kateqoriya').select('*')),
    all(() => sb.from('v_qrafik').select('id,maya').gt('maya', -1).order('id')),
  ]);
  const sat = qr.length ? await all(() => sb.from('v_satislar').select('id,ay,deyer').in('id', qr.map(r => r.id)).order('id')) : [];
  const mayaMap = Object.fromEntries(qr.map(r => [r.id, num(r.maya)]));
  const mat = a => kat.filter(k => k.ay === a && k.kateqoriya === 'Material').reduce((x, k) => x + num(k.cem), 0);
  const rows = aylar.map(a => {
    const m = mat(a.ay), diger = num(a.rasxod) - m, menf = num(a.satis) - num(a.rasxod) - num(a.maas);
    const ms = sat.filter(s => s.ay === a.ay);
    return { ay: a.ay, satis: num(a.satis), mat: m, diger, maas: num(a.maas), menf, faiz: num(a.satis) ? menf / num(a.satis) * 100 : 0,
      mayaSay: ms.length, mayaMenf: ms.reduce((x, s) => x + num(s.deyer) - mayaMap[s.id], 0) };
  });
  const s12 = rows.slice(0, 12), cem = k => s12.reduce((a, r) => a + r[k], 0);
  $('#page').innerHTML = `
    <div class="grid kpis">
      <div class="card kpi"><div class="lbl">Bu ayın mənfəəti</div><div class="val ${rows[0] && rows[0].menf < 0 ? 'neg' : 'pos'}">${man(rows[0] ? rows[0].menf : 0)}</div><div class="cmp">${rows[0] ? fmt(rows[0].faiz, 1) + '% satışdan' : ''}</div></div>
      <div class="card kpi"><div class="lbl">Keçən ay</div><div class="val ${rows[1] && rows[1].menf < 0 ? 'neg' : 'pos'}">${man(rows[1] ? rows[1].menf : 0)}</div></div>
      <div class="card kpi"><div class="lbl">Son 12 ay cəmi</div><div class="val ${cem('menf') < 0 ? 'neg' : 'pos'}">${man(cem('menf'))}</div><div class="cmp">Satış ${man(cem('satis'))}</div></div>
      <div class="card kpi"><div class="lbl">Maya dəyəri yazılmış satışlar</div><div class="val">${sat.length}</div><div class="cmp">Onlardan mənfəət: ${man(sat.reduce((x, s) => x + num(s.deyer) - mayaMap[s.id], 0))}</div></div>
    </div>
    <div class="tbl-wrap" style="margin-top:16px"><table class="t">
      <thead><tr><th>Ay</th><th class="n">Satış</th><th class="n hide-m">Material</th><th class="n hide-m">Digər xərclər</th><th class="n hide-m">Maaş</th><th class="n">Mənfəət</th><th class="n">%</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td style="white-space:nowrap">${ayAdi(r.ay)}</td><td class="n">${fmt(r.satis)}</td><td class="n hide-m">${fmt(r.mat)}</td><td class="n hide-m">${fmt(r.diger)}</td><td class="n hide-m">${fmt(r.maas)}</td>
        <td class="n ${r.menf < 0 ? 'neg' : ''}"><b>${fmt(r.menf)}</b></td><td class="n">${fmt(r.faiz, 1)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Son 12 ay</td><td class="n">${fmt(cem('satis'))}</td><td class="n hide-m">${fmt(cem('mat'))}</td><td class="n hide-m">${fmt(cem('diger'))}</td><td class="n hide-m">${fmt(cem('maas'))}</td><td class="n">${fmt(cem('menf'))}</td><td class="n">${cem('satis') ? fmt(cem('menf') / cem('satis') * 100, 1) : ''}</td></tr></tfoot></table></div>
    <p class="muted" style="font-size:13px">Satış — həmin ayda satılan malların tam dəyəridir (kreditlə satılanlar da daxil). 2026-cı ilin fevralından əvvəlki aylarda xərclər Excel-də yazdığınız aylıq orta rəqəmdir.
    Satışa "maya dəyəri" yazsanız, hər satışın öz mənfəəti də görünəcək.</p>`;
}

/* =====================================================================
   JURNAL
   ===================================================================== */
const JC = { satislar: 'Satış', satis_odenisleri: 'Müştəri ödənişi', musteriler: 'Müştəri', rasxodlar: 'Xərc', isciler: 'İşçi', isci_odenisleri: 'İşçi ödənişi',
  maas_deyisiklikleri: 'Maaş dəyişikliyi', kassa_diger: 'Kassa əməliyyatı', sifarisler: 'Sifariş', ayarlar: 'Ayar' };
const JE = { INSERT: ['yazıldı', 'b-green'], UPDATE: ['dəyişdirildi', 'b-blue'], DELETE: ['silindi', 'b-red'] };
function jurnalIzah(j) {
  const r = j.yeni || j.kohne || {};
  const p = [];
  if (r.satis_no) p.push(r.satis_no);
  if (r.ad) p.push(r.ad);
  if (r.musteri) p.push(r.musteri);
  if (r.aciqlama) p.push(r.aciqlama);
  if (r.mal && !r.satis_no) p.push(r.mal);
  if (r.nov && j.cedvel === 'isci_odenisleri') p.push(r.nov);
  if (r.mebleg != null) p.push(fmt(r.mebleg) + ' ₼');
  if (r.deyer != null && j.cedvel === 'satislar') p.push(fmt(r.deyer) + ' ₼');
  if (r.acar) p.push(r.acar + ' = ' + (r.deyer || ''));
  if (j.emeliyyat === 'UPDATE' && j.kohne && j.yeni) {
    const d = Object.keys(j.yeni).filter(k => !['yaradildi'].includes(k) && JSON.stringify(j.yeni[k]) !== JSON.stringify(j.kohne[k]))
      .map(k => `${k}: ${j.kohne[k] == null ? '—' : j.kohne[k]} → ${j.yeni[k] == null ? '—' : j.yeni[k]}`);
    if (d.length) p.push('(' + d.join(', ') + ')');
  }
  return p.join(' · ');
}
async function pageJurnal(params) {
  const c = params.get('c') || '';
  shell('jurnal', 'Dəyişiklik jurnalı', 'Proqramda kim, nə vaxt, nəyi yazıb, dəyişib və ya silib', `<select class="in" id="ced" style="width:auto"><option value="">Hamısı</option>${Object.entries(JC).map(([k, v]) => `<option value="${k}" ${c === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <button class="btn" onclick="window.print()">${ico('print')}Çap</button>`);
  $('#ced').onchange = e => location.hash = '#/jurnal' + (e.target.value ? '?c=' + e.target.value : '');
  let b = sb.from('jurnal').select('*');
  if (c) b = b.eq('cedvel', c);
  const rows = await q(b.order('zaman', { ascending: false }).range(0, 299));
  $('#page').innerHTML = rows.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Vaxt</th><th>Kim</th><th>Nə</th><th>Təfərrüat</th></tr></thead>
    <tbody>${rows.map(j => { const z = new Date(j.zaman); const e = JE[j.emeliyyat] || [j.emeliyyat, 'b-gray']; return `<tr><td style="white-space:nowrap">${fd(iso(z))} ${String(z.getHours()).padStart(2, '0')}:${String(z.getMinutes()).padStart(2, '0')}</td>
      <td>${esc(j.email || '')}</td><td style="white-space:nowrap">${JC[j.cedvel] || j.cedvel} <span class="badge ${e[1]}">${e[0]}</span></td><td>${esc(jurnalIzah(j))}</td></tr>`; }).join('')}</tbody></table></div>
    <p class="muted" style="font-size:13px">Son 300 qeyd göstərilir.</p>` : '<div class="card empty">Hələ qeyd yoxdur — proqramda edilən hər dəyişiklik burada görünəcək.</div>';
}

/* =====================================================================
   AYARLAR: firma, istifadəçilər, Excel-ə ixrac
   ===================================================================== */
async function pageAyarlar() {
  const w = canWrite();
  shell('ayarlar', 'Ayarlar', '', '');
  const [A, ist] = await Promise.all([ayarlar(), q(sb.from('uzvler').select('*').eq('magaza_id', S.magaza.id).order('yaradildi'))]);
  const yaz = S.rol === 'muhasib';
  const rolAd = { muhasib: 'Mühasib (yazır)', sahibkar: 'Sahibkar (yalnız baxır)', kuryer: 'Kuryer (yalnız pul yığır)', bloklu: 'Bloklanıb' };
  $('#page').innerHTML = `
    <div class="card" style="margin-bottom:16px"><h3>Dükan və abunə</h3>
      <div class="grid two" style="gap:16px;align-items:end">
        <form id="mgf" class="row3" style="margin:0"><div class="field" style="margin:0"><label class="f">Dükanın adı</label><input class="in" name="ad" value="${esc(S.magaza.ad)}" ${yaz ? '' : 'disabled'} required></div>
          <div class="field" style="margin:0"><label class="f">Sahə</label><select class="in" name="sahe" ${yaz ? '' : 'disabled'}>${saheOpt(S.magaza.sahe || 'mebel')}</select></div>
          <div class="field" style="margin:0"><label class="f">Telefon</label><div style="display:flex;gap:8px"><input class="in" name="tel" value="${esc(S.magaza.telefon || '')}" ${yaz ? '' : 'disabled'}>${yaz ? '<button class="btn">Saxla</button>' : ''}</div></div></form>
        <div class="info" style="margin:0"><div><span>Abunə bitir</span><b class="${S.aktiv ? '' : 'neg'}">${fd(S.magaza.abune_bitir)}</b></div>
          <div><span>Vəziyyət</span><b>${S.magaza.dayandirilib ? '<span class="neg">Dayandırılıb</span>' : S.aktiv ? `<span class="pos">Aktiv</span> · ${S.qalan} gün` : '<span class="neg">Bitib</span>'}</b></div></div></div>
      ${S.sistem.elaqe_telefon || S.sistem.elaqe_whatsapp ? `<p class="muted" style="font-size:13px;margin:12px 0 0">Abunəni uzatmaq üçün: ${esc(S.sistem.elaqe_telefon || '')}${S.sistem.elaqe_whatsapp ? ` · <a href="https://wa.me/${S.sistem.elaqe_whatsapp.replace(/\D/g, '')}" target="_blank">WhatsApp</a>` : ''}${S.sistem.qiymet ? ' · ' + esc(S.sistem.qiymet) : ''}</p>` : ''}</div>
    <div class="grid two">
      <div class="card"><h3>Firma məlumatları</h3><p class="muted" style="margin-top:-6px;font-size:13px">Müqavilə və qəbzlərdə çıxır.</p>
        <form id="ff">
          <div class="field"><label class="f">Firmanın adı</label><input class="in" name="firma_adi" value="${esc(A.firma_adi || firmaAdi())}" ${w ? '' : 'disabled'}></div>
          <div class="field"><label class="f">Ünvan</label><input class="in" name="firma_unvan" value="${esc(A.firma_unvan || '')}" ${w ? '' : 'disabled'}></div>
          <div class="row2"><div class="field"><label class="f">Telefon</label><input class="in" name="firma_telefon" value="${esc(A.firma_telefon || '')}" ${w ? '' : 'disabled'}></div>
          <div class="field"><label class="f">VÖEN</label><input class="in" name="firma_voen" value="${esc(A.firma_voen || '')}" ${w ? '' : 'disabled'}></div></div>
          <div class="row2"><div class="field"><label class="f">Gecikmə cəriməsi, gündəlik %</label><input class="in" type="number" step="0.01" min="0" name="cerime_gunluk" value="${esc(A.cerime_gunluk || '0')}" ${w ? '' : 'disabled'} title="0 = cərimə yoxdur"></div>
          <div class="field"><label class="f">Güzəşt (gün) / maksimum %</label><div style="display:flex;gap:6px"><input class="in" type="number" min="0" name="cerime_guzest" value="${esc(A.cerime_guzest || '3')}" ${w ? '' : 'disabled'}><input class="in" type="number" min="0" name="cerime_max" value="${esc(A.cerime_max || '20')}" ${w ? '' : 'disabled'}></div></div></div>
          <div class="muted" style="font-size:12.5px;margin:-6px 0 12px">Məs. 0,1% gündəlik: 300 ₼ gecikən ödəniş 10 gün gecikəndə 3 ₼. 0 yazsanız cərimə hesablanmır. Cərimə borca yalnız siz "Borca əlavə et" basanda yazılır.</div>
          <div class="field"><label class="f">Qiymət növlərinin adları <span class="muted" style="font-weight:400">(məhsulda 4 qiymət)</span></label>
            <div class="row2" style="gap:6px">${QNOV_DEF.map((d, i) => `<input class="in" name="qiymet_ad_${i + 1}" value="${esc(A['qiymet_ad_' + (i + 1)] || '')}" placeholder="${esc(d)}" ${w ? '' : 'disabled'} style="margin-bottom:6px">`).join('')}</div></div>
          <div class="field"><label class="f">Çekin altındakı yazı</label><input class="in" name="cek_altyazi" value="${esc(A.cek_altyazi || '')}" ${w ? '' : 'disabled'}></div>
          <div class="field"><label class="f">Müqavilənin şərtləri</label><textarea class="in" name="muqavile_sertleri" rows="4" ${w ? '' : 'disabled'}>${esc(A.muqavile_sertleri || '')}</textarea></div>
          ${w ? '<button class="btn primary">Yadda saxla</button>' : ''}</form></div>
      <div>
        <div class="card"><h3>Ehtiyat nüsxə</h3><p class="muted" style="margin-top:-6px;font-size:13px">Bütün məlumatları (müştərilər, satışlar, ödənişlər, xərclər, işçilər, kassa, sifarişlər) bir Excel faylına yükləyir.</p>
          <button class="btn green" id="xls">Excel-ə yüklə</button> <span class="muted" id="xlsinfo"></span></div>
        ${yaz ? '<div class="card" style="margin-top:16px" id="tg"><h3>Telegram xülasəsi</h3><div class="muted">Yüklənir…</div></div>' : ''}
        <div class="card" style="margin-top:16px;padding:0"><h3 style="padding:18px 20px 0">İstifadəçilər</h3>
          <table class="t"><tbody>${ist.map(i => `<tr><td><div class="cell-main">${esc(i.ad || i.email || '')}</div><div class="cell-sub">${esc(i.email || '')}${i.user_id === S.user.id ? ' · siz' : ''}</div></td>
            <td style="width:200px">${yaz && i.user_id !== S.user.id ? `<select class="in" data-u="${i.user_id}">${Object.entries(rolAd).map(([k, v]) => `<option value="${k}" ${i.rol === k ? 'selected' : ''}>${v}</option>`).join('')}</select>` : `<span class="badge ${i.rol === 'muhasib' ? 'b-blue' : i.rol === 'bloklu' ? 'b-red' : 'b-gray'}">${rolAd[i.rol] || i.rol}</span>`}</td></tr>`).join('')}</tbody></table>
          ${yaz ? `<div style="padding:4px 20px 16px"><div class="muted" style="font-size:13px;margin-bottom:8px">İşçi və ya sahibkar əlavə etmək üçün: o, girişdə <b>Qeydiyyat → "Dəvət kodum var"</b> seçib bu kodu yazsın. Yeni üzv yalnız baxır, hüququnu buradan dəyişin.</div>
            <div style="display:flex;align-items:center;gap:10px"><span style="font-size:22px;font-weight:700;letter-spacing:4px;background:#faf4ea;border:1px dashed var(--oak);border-radius:10px;padding:6px 14px" id="kod">${esc(S.magaza.devet_kodu)}</span>
            <button class="btn sm" id="kodkop">Kopyala</button><button class="btn sm" id="kodyen">Yeni kod</button></div></div>` : ''}</div>
      </div>
    </div>`;
  const ff = $('#ff');
  if (w) ff.onsubmit = async e => {
    e.preventDefault();
    try {
      for (const k of ['firma_adi', 'firma_unvan', 'firma_telefon', 'firma_voen', 'cerime_gunluk', 'cerime_guzest', 'cerime_max', 'cek_altyazi', 'muqavile_sertleri']) {
        if ((A[k] || '') !== ff[k].value) await q(sb.from('ayarlar').update({ deyer: ff[k].value.trim() }).eq('acar', k));
      }
      for (let i = 1; i <= 4; i++) { const k = 'qiymet_ad_' + i, v = ff[k].value.trim();
        if ((A[k] || '') === v) continue;
        if (k in A) await q(sb.from('ayarlar').update({ deyer: v }).eq('acar', k)); else await q(sb.from('ayarlar').insert({ acar: k, deyer: v }));
      }
      toast('Yadda saxlanıldı'); S.cache = {};
    } catch (er) { fail(er); }
  };
  $$('[data-u]').forEach(sel => sel.onchange = async () => {
    try { await q(sb.from('uzvler').update({ rol: sel.value }).eq('user_id', sel.dataset.u).eq('magaza_id', S.magaza.id)); toast('Hüquq dəyişdirildi'); } catch (er) { fail(er); }
  });
  $('#xls').onclick = () => excelIxrac().catch(fail);
  if ($('#kodkop')) $('#kodkop').onclick = () => { navigator.clipboard && navigator.clipboard.writeText($('#kod').textContent); toast('Kod kopyalandı'); };
  if ($('#kodyen')) $('#kodyen').onclick = async () => {
    if (!confirm('Köhnə kod işləməyəcək. Yeni kod yaradılsın?')) return;
    try { const k = await q(sb.rpc('devet_yenile')); S.magaza.devet_kodu = k; $('#kod').textContent = k; toast('Yeni kod: ' + k); } catch (er) { fail(er); }
  };
  if ($('#mgf')) $('#mgf').onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    try { await q(sb.from('magazalar').update({ ad: f.ad.value.trim(), telefon: f.tel.value.trim() || null, sahe: f.sahe.value }).eq('id', S.magaza.id));
      S.magaza.ad = f.ad.value.trim(); S.magaza.sahe = f.sahe.value; S.firmalar.forEach(x => { if (x.id === S.magaza.id) x.ad = S.magaza.ad; }); S.magaza.telefon = f.tel.value.trim(); toast('Yadda saxlanıldı'); route(); } catch (er) { fail(er); }
  };
  if (yaz) telegramKart().catch(er => { $('#tg').innerHTML = '<h3>Telegram xülasəsi</h3><div class="muted">Hələ qurulmayıb (bazada 6_telegram.sql işlədilməlidir).</div>'; console.warn(er); });
}

/* ---------- Telegram gündəlik xülasə ---------- */
async function telegramKart() {
  const box = $('#tg');
  const [T] = await q(sb.from('telegram').select('*'));
  const al = await q(sb.from('telegram_alicilar').select('*').order('elave'));
  const api = (m, tk = T && T.token) => fetch(`https://api.telegram.org/bot${tk}/${m}`).then(r => r.json());
  const saat = T ? T.saat : 20;
  const qosulub = T && T.token;
  box.innerHTML = `<h3>Telegram xülasəsi</h3>
    <p class="muted" style="margin-top:-6px;font-size:13px">Hər gün seçdiyiniz saatda Telegram-a günün satışları, kassa, xərclər, borclar və sabah ödəniş edəcək müştərilər göndərilir.</p>
    ${qosulub ? `<div class="info" style="margin-bottom:12px"><div><small style="display:block">Bot</small><b>${T.bot ? `<a href="https://t.me/${esc(T.bot)}" target="_blank">@${esc(T.bot)}</a>` : 'qoşulub'}</b></div>
       <div><small style="display:block">Göndərmə saatı (Bakı)</small><b><select class="in" id="tgsaat" style="padding:4px 8px;width:auto">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === saat ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select></b></div></div>` :
      `<ol style="font-size:13.5px;padding-left:18px;margin:0 0 12px;line-height:1.7">
        <li>Telegram-da <a href="https://t.me/BotFather" target="_blank"><b>@BotFather</b></a>-i açın, <b>/newbot</b> yazın.</li>
        <li>Bota ad verin (məs. <i>SimplePOS hesabat</i>), sonra sonu <b>bot</b> ilə bitən istifadəçi adı (məs. <i>simplepos_hesabat_bot</i>).</li>
        <li>BotFather-in verdiyi uzun kodu (token) aşağıya yapışdırın.</li></ol>`}
    <form id="tgf" class="field" style="display:flex;gap:8px;align-items:flex-end">
      <div style="flex:1"><label class="f">${qosulub ? 'Tokeni dəyiş' : 'Bot tokeni'}</label><input class="in" type="password" name="tk" autocomplete="off" placeholder="${qosulub ? '••••••••' : '123456789:ABC…'}"></div>
      <button class="btn ${qosulub ? '' : 'primary'}">Yoxla və saxla</button></form>
    ${qosulub ? `<div style="margin-top:14px"><label class="f">Kimə göndərilir</label>
      ${al.length ? `<table class="t"><tbody>${al.map(a => `<tr><td>${esc(a.ad || a.chat_id)}</td><td style="width:60px;text-align:right"><button class="btn danger" data-tgsil="${a.chat_id}" style="padding:4px 10px">Sil</button></td></tr>`).join('')}</tbody></table>`
        : '<div class="muted" style="font-size:13px">Hələ heç kim yoxdur.</div>'}
      <p class="muted" style="font-size:13px;margin:10px 0 8px">Mesaj almaq istəyən hər kəs Telegram-da ${T.bot ? `<a href="https://t.me/${esc(T.bot)}" target="_blank">@${esc(T.bot)}</a>` : 'bota'} yazıb <b>Start</b> bassın, sonra buradan “Alıcıları tap” düyməsini basın.</p>
      <button class="btn" id="tgtap">Alıcıları tap</button> <span id="tgyeni"></span></div>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="tgbax">Önizləmə</button><button class="btn green" id="tggon">İndi göndər</button></div>
      <pre id="tgpre" style="display:none;white-space:pre-wrap;font-family:inherit;font-size:13px;background:#faf4ea;border:1px solid var(--line);border-radius:10px;padding:12px;margin-top:10px"></pre>` : ''}`;

  $('#tgf').onsubmit = async e => {
    e.preventDefault();
    const tk = e.target.tk.value.trim();
    if (!/^\d+:[\w-]{20,}$/.test(tk)) return toast('Token düzgün deyil — BotFather-in verdiyi kodu tam yapışdırın');
    try {
      const r = await api('getMe', tk);
      if (!r.ok) return toast('Telegram bu tokeni qəbul etmədi');
      if (T) await q(sb.from('telegram').update({ token: tk, bot: r.result.username }).eq('magaza_id', S.magaza.id));
      else await q(sb.from('telegram').insert({ magaza_id: S.magaza.id, token: tk, bot: r.result.username, saat }));
      try { await q(sb.rpc('telegram_saat_qur', { h: saat })); } catch (_) {}
      toast('Bot qoşuldu: @' + r.result.username); telegramKart();
    } catch (er) { fail(er); }
  };
  if (!qosulub) return;
  $('#tgsaat').onchange = async e => { try { await q(sb.rpc('telegram_saat_qur', { h: +e.target.value })); toast('Hər gün ' + e.target.selectedOptions[0].text + '-da göndəriləcək'); } catch (er) { fail(er); } };
  $$('[data-tgsil]').forEach(b => b.onclick = async () => { try { await q(sb.from('telegram_alicilar').delete().eq('magaza_id', S.magaza.id).eq('chat_id', b.dataset.tgsil)); telegramKart(); } catch (er) { fail(er); } });
  $('#tgtap').onclick = async () => {
    try {
      const r = await api('getUpdates');
      if (!r.ok) return toast('Telegram cavab vermədi: ' + (r.description || ''));
      const var_ = new Set(al.map(a => String(a.chat_id))), tap = new Map();
      for (const u of r.result) {
        const c = (u.message || u.my_chat_member || u.edited_message || {}).chat;
        if (c && !var_.has(String(c.id))) tap.set(String(c.id), c.title || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.username || String(c.id));
      }
      $('#tgyeni').innerHTML = tap.size ? [...tap].map(([id, ad]) => `<button class="btn primary" data-tgel="${id}" data-ad="${esc(ad)}" style="margin:4px 4px 0 0">+ ${esc(ad)}</button>`).join('')
        : '<span class="muted" style="font-size:13px">Yeni yazan tapılmadı — bota Start basıb bir neçə saniyə sonra yenidən yoxlayın.</span>';
      $$('[data-tgel]').forEach(b => b.onclick = async () => {
        try {
          await q(sb.from('telegram_alicilar').insert({ magaza_id: S.magaza.id, chat_id: +b.dataset.tgel, ad: b.dataset.ad }));
          await api(`sendMessage?chat_id=${b.dataset.tgel}&text=${encodeURIComponent('✅ ' + firmaAdi() + ' — gündəlik xülasə bu çata göndəriləcək.')}`);
          toast(b.dataset.ad + ' əlavə olundu'); telegramKart();
        } catch (er) { fail(er); }
      });
    } catch (er) { fail(er); }
  };
  $('#tgbax').onclick = async () => {
    try { const t = await q(sb.rpc('telegram_metn')); const pre = $('#tgpre'); pre.style.display = 'block'; pre.innerHTML = String(t).replace(/<(?!\/?b>)/g, '&lt;'); } catch (er) { fail(er); }
  };
  $('#tggon').onclick = async () => {
    try { const n = await q(sb.rpc('telegram_gonder')); toast(n ? n + ' alıcıya göndərildi' : 'Əvvəlcə alıcı əlavə edin'); } catch (er) { fail(er); }
  };
}

/* =====================================================================
   ADMIN PANEL — bütün dükanlar və abunələr
   ===================================================================== */
async function pageAdmin() {
  shell('admin', 'Admin panel', 'Dükanlar və abunələr', `<input class="in search" id="axtar" placeholder="Axtar: dükan, ad, telefon, e-poçt">
    <div class="seg" id="fil">${[['hamisi', 'Hamısı'], ['aktiv', 'Aktiv'], ['bitir', 'Bitir (7 gün)'], ['bitib', 'Bitib']].map(([k, t], i) => `<button data-f="${k}" class="${i ? '' : 'on'}">${t}</button>`).join('')}</div>`);
  const [rows, sis, ode] = await Promise.all([q(sb.rpc('admin_magazalar')), sistemOxu(), q(sb.from('abune_odenisleri').select('*').order('tarix', { ascending: false }))]);
  const buAy = ayBasi(today());
  const gelirAy = ode.filter(o => o.tarix >= buAy).reduce((a, o) => a + num(o.mebleg), 0);
  const gelirCem = ode.reduce((a, o) => a + num(o.mebleg), 0);
  const son12 = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 11 + i); const a = iso(d).slice(0, 7);
    return { ay: a + '-01', c: ode.filter(o => o.tarix.slice(0, 7) === a).reduce((x, o) => x + num(o.mebleg), 0) }; });
  const mx = Math.max(1, ...son12.map(x => x.c));
  rows.forEach(r => { r.qalan = gunFerqi(r.abune_bitir); });
  let fil = 'hamisi';
  const wa = t => t ? `https://wa.me/${(t.replace(/\D/g, '').replace(/^0/, '994'))}` : '';
  const draw = () => {
    const s = ($('#axtar').value || '').toLocaleLowerCase('az');
    let list = rows.filter(r => !s || [r.ad, r.sahib_ad, r.telefon, r.email].join(' ').toLocaleLowerCase('az').includes(s));
    if (fil === 'aktiv') list = list.filter(r => r.aktiv);
    if (fil === 'bitir') list = list.filter(r => r.aktiv && r.qalan <= 7);
    if (fil === 'bitib') list = list.filter(r => !r.aktiv);
    const say = f => rows.filter(f).length;
    $('#page').innerHTML = `
      <div class="grid kpis">
        <div class="card kpi"><div class="lbl">Dükanlar</div><div class="val">${rows.length}</div><div class="cmp">Son 30 gündə: ${say(r => gunFerqi(String(r.qeydiyyat).slice(0, 10)) >= -30)} yeni</div></div>
        <div class="card kpi"><div class="lbl">Aktiv</div><div class="val pos">${say(r => r.aktiv)}</div></div>
        <div class="card kpi"><div class="lbl">7 gün içində bitir</div><div class="val">${say(r => r.aktiv && r.qalan <= 7)}</div></div>
        <div class="card kpi"><div class="lbl">Bitib / dayandırılıb</div><div class="val neg">${say(r => !r.aktiv)}</div></div>
        <div class="card kpi"><div class="lbl">Gəlir — ${ayAdi(buAy)}</div><div class="val pos">${man(gelirAy)}</div><div class="cmp">Cəmi: ${man(gelirCem)}</div></div>
      </div>
      <div class="card" style="margin-top:16px"><h3>Abunə gəliri — son 12 ay</h3>
        <div class="bars">${son12.map(x => `<div class="col" title="${ayAdi(x.ay)}: ${man(x.c)}"><div class="pair"><div class="bar" style="height:${x.c / mx * 100}%;background:var(--c1)"></div></div><div class="lbl">${ayQisa(x.ay)}</div></div>`).join('')}</div></div>
      <div class="tbl-wrap" style="margin-top:16px"><table class="t"><thead><tr><th>Dükan</th><th class="hide-m">Əlaqə</th><th class="hide-m">Qeydiyyat</th><th>Abunə</th><th class="n hide-m">Ödəyib</th><th class="n hide-m">Müştəri / satış</th><th class="hide-m">Son iş</th><th></th></tr></thead>
      <tbody>${list.map(r => `<tr><td><div class="cell-main">${esc(r.ad)}</div><div class="cell-sub">${esc(r.sahib_ad || '')}${r.uzv_sayi > 1 ? ` · ${r.uzv_sayi} istifadəçi` : ''}${r.admin_qeyd ? ` · <i>${esc(r.admin_qeyd)}</i>` : ''}</div></td>
        <td class="hide-m"><div>${esc(r.telefon || '')}${r.telefon ? ` <a href="${wa(r.telefon)}" target="_blank" title="WhatsApp">WA</a>` : ''}</div><div class="cell-sub">${esc(r.email || '')}</div></td>
        <td class="hide-m">${fd(String(r.qeydiyyat).slice(0, 10))}</td>
        <td>${fd(r.abune_bitir)}<div>${r.dayandirilib ? '<span class="badge b-red">Dayandırılıb</span>' : r.qalan < 0 ? `<span class="badge b-red">${-r.qalan} gün keçib</span>` : `<span class="badge ${r.qalan <= 7 ? 'b-amber' : 'b-green'}">${r.qalan} gün qalıb</span>`}</div></td>
        <td class="n hide-m">${num(r.odenilib) ? fmt(r.odenilib) + ' ₼' : '—'}${r.son_odenis ? `<div class="cell-sub">${fd(r.son_odenis)}</div>` : ''}</td>
        <td class="n hide-m">${fmt(r.musteri_sayi)} / ${fmt(r.satis_sayi)}</td>
        <td class="hide-m">${r.son_aktivlik ? fd(String(r.son_aktivlik).slice(0, 10)) : '—'}</td>
        <td class="n" style="white-space:nowrap"><button class="btn sm green" data-od="${r.id}">₼ Ödəniş</button> <button class="btn sm" data-uz="${r.id}" data-ay="1">+1 ay</button> <button class="btn sm" data-ed="${r.id}">…</button></td></tr>`).join('')
        || '<tr><td colspan="8" class="empty">Dükan tapılmadı</td></tr>'}</tbody></table></div>
      <div class="card" style="margin-top:16px;max-width:720px"><h3>Sistem ayarları</h3><p class="muted" style="margin-top:-6px;font-size:13px">Qeydiyyat səhifəsində və abunə xəbərdarlıqlarında görünür.</p>
        <form id="sf"><div class="row2"><div class="field"><label class="f">Əlaqə telefonu</label><input class="in" name="elaqe_telefon" value="${esc(sis.elaqe_telefon || '')}"></div>
        <div class="field"><label class="f">WhatsApp nömrəsi (994…)</label><input class="in" name="elaqe_whatsapp" value="${esc(sis.elaqe_whatsapp || '')}"></div></div>
        <div class="row2"><div class="field"><label class="f">Qiymət (məs. "ayda 20 ₼")</label><input class="in" name="qiymet" value="${esc(sis.qiymet || '')}"></div>
        <div class="field"><label class="f">Pulsuz sınaq (gün)</label><input class="in" type="number" min="0" name="sinaq_gun" value="${esc(sis.sinaq_gun || '14')}"></div></div>
        <button class="btn primary">Yadda saxla</button></form></div>`;
    $$('[data-uz]').forEach(b => b.onclick = async () => {
      const r = rows.find(x => x.id === +b.dataset.uz), ay = +b.dataset.ay;
      if (!confirm(`${r.ad} — abunə ${ay === 12 ? '1 il' : '1 ay'} uzadılsın?`)) return;
      try { const d = await q(sb.rpc('admin_uzat', { m: r.id, aylar: ay })); toast(`${r.ad}: ${fd(d)} tarixinə qədər`); pageAdmin(); } catch (er) { fail(er); }
    });
    $$('[data-od]').forEach(b => b.onclick = () => {
      const r = rows.find(x => x.id === +b.dataset.od);
      const md = modal(`Ödəniş qəbul et — ${esc(r.ad)}`, `<form id="of">
        <div class="row2"><div class="field"><label class="f">Məbləğ (₼)</label><input class="in" type="number" step="0.01" min="0" name="m" required></div>
        <div class="field"><label class="f">Neçə aylıq</label><select class="in" name="a">${[1, 2, 3, 6, 12].map(n => `<option value="${n}">${n === 12 ? '1 il' : n + ' ay'}</option>`).join('')}</select></div></div>
        <div class="field"><label class="f">Qeyd</label><input class="in" name="q" placeholder="məs. kartla, nağd"></div>
        <div class="muted" style="font-size:13px">İndiki bitmə tarixi: <b>${fd(r.abune_bitir)}</b></div></form>`,
        `<button class="btn" data-close>Ləğv et</button><button class="btn green" id="ok">Qəbul et və uzat</button>`);
      $('#ok', md).onclick = async () => {
        const f = $('#of', md); if (!f.reportValidity()) return;
        try { const d = await q(sb.rpc('admin_odenis', { m: r.id, mebleg: num(f.m.value), aylar: +f.a.value, qeyd: f.q.value })); closeModal(); toast(`${r.ad}: ${fd(d)} tarixinə qədər`); pageAdmin(); } catch (er) { fail(er); }
      };
    });
    $$('[data-ed]').forEach(b => b.onclick = () => {
      const r = rows.find(x => x.id === +b.dataset.ed);
      const ro = ode.filter(o => o.magaza_id === r.id);
      const md = modal(esc(r.ad), `<form id="af">
        <div class="row2"><div class="field"><label class="f">Abunə bitir</label><input class="in" type="date" name="d" value="${r.abune_bitir}" required></div>
        <div class="field"><label class="f">Vəziyyət</label><select class="in" name="st"><option value="0">Aktiv</option><option value="1" ${r.dayandirilib ? 'selected' : ''}>Dayandırılıb</option></select></div></div>
        <div class="field"><label class="f">Qeyd (yalnız siz görürsünüz)</label><input class="in" name="q" value="${esc(r.admin_qeyd || '')}" placeholder="məs. 3 ay ödəyib, kartla"></div></form>
        <h4 style="margin:12px 0 6px">Ödənişlər</h4>${ro.length ? `<table class="t"><tbody>${ro.map(o => `<tr><td>${fd(o.tarix)}</td><td class="n">${fmt(o.mebleg)} ₼</td><td>${o.aylar} ay</td><td class="muted">${esc(o.qeyd || '')}</td><td class="n"><button class="btn sm danger" data-os="${o.id}">Sil</button></td></tr>`).join('')}</tbody></table>` : '<div class="muted">Hələ ödəniş yoxdur</div>'}
        ${num(r.satis_sayi) === 0 ? `<div class="banner b-amber-bg" style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:10px">Bu dükan boşdur — tanıtım üçün nümunə məlumatla doldurmaq olar.<button class="btn sm" id="demo">Demo məlumatla doldur</button></div>` : ''}`,
        `<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yadda saxla</button>`, true);
      $$('[data-os]', md).forEach(x => x.onclick = async () => { if (!confirm('Bu ödəniş qeydi silinsin? (bitmə tarixi dəyişmir)')) return;
        try { await q(sb.from('abune_odenisleri').delete().eq('id', +x.dataset.os)); closeModal(); pageAdmin(); } catch (er) { fail(er); } });
      if ($('#demo', md)) $('#demo', md).onclick = async () => { if (!confirm(`"${r.ad}" dükanı 10 məhsul, 30 müştəri, ~45 satış, ödəniş və xərclərlə doldurulsun?`)) return;
        try { toast(await q(sb.rpc('admin_demo_doldur', { m: r.id }))); closeModal(); pageAdmin(); } catch (er) { fail(er); } };
      $('#ok', md).onclick = async () => {
        const f = $('#af', md); if (!f.reportValidity()) return;
        try { await q(sb.rpc('admin_deyis', { m: r.id, bitir: f.d.value, dayan: f.st.value === '1', qeyd: f.q.value.trim() })); closeModal(); toast('Yadda saxlanıldı'); pageAdmin(); } catch (er) { fail(er); }
      };
    });
    $('#sf').onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      try { for (const k of ['elaqe_telefon', 'elaqe_whatsapp', 'qiymet', 'sinaq_gun']) if ((sis[k] || '') !== f[k].value.trim()) await q(sb.from('sistem').update({ deyer: f[k].value.trim() }).eq('acar', k));
        await sistemOxu(); toast('Yadda saxlanıldı'); } catch (er) { fail(er); }
    };
  };
  $('#axtar').oninput = draw;
  $$('#fil button').forEach(b => b.onclick = () => { fil = b.dataset.f; $$('#fil button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  draw();
}

/* ---------- Excel-ə ixrac (xarici kitabxanasız .xlsx) ---------- */
async function excelIxrac() {
  $('#xls').disabled = true; $('#xlsinfo').textContent = 'Hazırlanır…';
  const [mus, sat, pay, rx, isc, iod, kas, sif] = await Promise.all([
    all(() => sb.from('v_musteriler').select('*').order('id')),
    all(() => sb.from('v_satislar').select('*').order('id')),
    all(() => sb.from('satis_odenisleri').select('*').order('tarix').order('id')),
    all(() => sb.from('rasxodlar').select('*').order('tarix').order('id')),
    q(sb.from('v_isciler').select('*').order('id')),
    all(() => sb.from('isci_odenisleri').select('*').order('tarix').order('id')),
    q(sb.from('v_kassa').select('*').order('ay')),
    all(() => sb.from('sifarisler').select('*').order('tarix').order('id')),
  ]);
  const meh = await all(() => sb.from('v_mehsullar').select('*').order('ad'));
  const sM = Object.fromEntries(sat.map(s => [s.id, s])), iM = Object.fromEntries(isc.map(i => [i.id, i]));
  const sheets = [
    ['Müştərilər', ['ID', 'Ad', 'Ünvan', 'Telefon', 'Satış sayı', 'Cəm', 'Verilən', 'Qalıq borc', 'Son ödəniş/alış', 'Gecikmə (gün)'], mus.map(m => [m.id, m.ad, m.unvan, m.telefon, m.satis_sayi, num(m.cem), num(m.verilen), num(m.qaliq), m.son_tarix, m.gecikme_gun])],
    ['Satışlar', ['№', 'Tarix', 'Müştəri', 'Ünvan', 'Telefon', 'Mal', 'Dəyəri', 'İlkin', 'Ödənilən', 'Qalıq', 'Son ödəniş'], sat.map(s => [s.satis_no, s.tarix, s.musteri, s.unvan, s.telefon, s.mal, num(s.deyer), num(s.ilkin), num(s.odenilen), num(s.qaliq), s.son_odenis])],
    ['Müştəri ödənişləri', ['Tarix', 'Satış №', 'Müştəri', 'Məbləğ', 'Qeyd'], pay.map(p => [p.tarix, sM[p.satis_id] && sM[p.satis_id].satis_no, sM[p.satis_id] && sM[p.satis_id].musteri, num(p.mebleg), p.qeyd])],
    ['Xərclər', ['Tarix', 'Açıqlama', 'Kim verib', 'Kateqoriya', 'Məbləğ'], rx.map(r => [r.tarix, r.aciqlama, r.kim, r.kateqoriya, num(r.mebleg)])],
    ['İşçilər', ['Ad', 'Vəzifə', 'Növ', 'İşə giriş', 'Çıxış', 'Cari maaş', 'Status', 'Veriləcək'], isc.map(i => [i.ad, i.vezife, i.nov, i.ise_giris, i.cixis, num(i.cari_maas), i.status, i.verilecek == null ? '' : num(i.verilecek)])],
    ['İşçi ödənişləri', ['Tarix', 'Ad', 'Növ', 'Məbləğ', 'Qeyd'], iod.map(o => [o.tarix, iM[o.isci_id] && iM[o.isci_id].ad, o.nov, num(o.mebleg), o.qeyd])],
    ['Kassa', ['Ay', 'İlkin ödənişlər', 'Müştəri ödənişləri', 'Digər mədaxil', 'Daxil olan', 'Xərc', 'Maaş', 'Sahib', 'Digər məxaric', 'Çıxan', 'Ay sonu'], kas.map(k => [k.ay, num(k.ilkin), num(k.musteri_odenisi), num(k.diger_medaxil), num(k.medaxil), num(k.rasxod), num(k.maas), num(k.sahib), num(k.diger_mexaric), num(k.mexaric), num(k.ay_sonu_kassa)])],
    ['Məhsullar', ['Ad', 'Kateqoriya', 'Kod', ...qAdlari(), 'Maya', 'Aktiv', 'Satılıb (ədəd)', 'Satış cəmi'], meh.map(x => [x.ad, x.kateqoriya, x.kod, num(x.qiymet), ...[2, 3, 4].map(n => x['qiymet' + n] == null ? '' : num(x['qiymet' + n])), x.maya == null ? '' : num(x.maya), x.aktiv ? 'Bəli' : 'Xeyr', num(x.satilib), num(x.satis_cemi)])],
    ['Sifarişlər', ['Tarix', 'Müştəri', 'Ünvan', 'Telefon', 'Mal', 'Açıqlama', 'Qiymət', 'Vəziyyət'], sif.map(r => [r.tarix, r.musteri, r.unvan, r.telefon, r.mal, r.aciqlama, r.qiymet == null ? '' : num(r.qiymet), r.status])],
  ];
  const blob = xlsxYarat(sheets.map(([ad, h, rows]) => ({ ad, rows: [h, ...rows] })));
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `${firmaAdi().replace(/[^\wəöüğıçşƏÖÜĞIÇŞ -]/g, '')} ${today()}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  $('#xls').disabled = false; $('#xlsinfo').textContent = 'Yükləndi';
}

function xlsxYarat(sheets) {
  const enc = new TextEncoder();
  const x = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const col = n => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const serial = v => { const [y, m, d] = v.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5); };
  const files = {};
  files['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  files['_rels/.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  files['xl/workbook.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${x(s.ad.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  files['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  files['xl/styles.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\.mm\\.yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`;
  sheets.forEach((s, i) => {
    const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
      const ref = col(ci) + (ri + 1);
      if (v == null || v === '') return '';
      if (ri === 0) return `<c r="${ref}" s="1" t="inlineStr"><is><t>${x(v)}</t></is></c>`;
      if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${Number.isInteger(v) && Math.abs(v) < 1e6 && ci === 0 ? '' : ' s="3"'}><v>${v}</v></c>`;
      if (isDate(v)) return `<c r="${ref}" s="2"><v>${serial(v)}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    const widths = s.rows[0].map((h, ci) => Math.min(45, Math.max(10, ...s.rows.slice(0, 200).map(r => String(r[ci] == null ? '' : r[ci]).length + 2))));
    files[`xl/worksheets/sheet${i + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w2, ci) => `<col min="${ci + 1}" max="${ci + 1}" width="${w2}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData><autoFilter ref="A1:${col(s.rows[0].length - 1)}${s.rows.length}"/></worksheet>`;
  });
  // ZIP (sıxılmadan)
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const parts = [], cen = []; let off = 0;
  const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const [name, txt] of Object.entries(files)) {
    const nb = enc.encode(name), db = enc.encode(txt), c = crc(db);
    const lh = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(db.length), ...u32(db.length), ...u16(nb.length), ...u16(0)]);
    parts.push(lh, nb, db);
    cen.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(db.length), ...u32(db.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nb);
    off += lh.length + nb.length + db.length;
  }
  const cenLen = cen.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(Object.keys(files).length), ...u16(Object.keys(files).length), ...u32(cenLen), ...u32(off), ...u16(0)]);
  return new Blob([...parts, ...cen, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* =====================================================================
   EXCEL-DƏN YÜKLƏMƏ — .xlsx / .csv oxuyucu (kitabxanasız) və idxal pəncərəsi
   ===================================================================== */
async function zipAc(buf) {
  const u = new Uint8Array(buf), dv = new DataView(buf); const out = {};
  let e = u.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Fayl Excel (.xlsx) deyil');
  let p = dv.getUint32(e + 16, true); const n = dv.getUint16(e + 10, true);
  for (let k = 0; k < n; k++) {
    const meth = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl));
    const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    out[name] = { meth, data: u.subarray(ds, ds + csize) };
    p += 46 + nl + xl + cl;
  }
  const oxu = async name => {
    const f = out[name]; if (!f) return null;
    if (f.meth === 0) return new TextDecoder().decode(f.data);
    const st = new Blob([f.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(st).text();
  };
  return { oxu, adlar: Object.keys(out) };
}
async function xlsxOxu(buf) {
  const z = await zipAc(buf), P = t => new DOMParser().parseFromString(t, 'application/xml');
  const ss = []; const sst = await z.oxu('xl/sharedStrings.xml');
  if (sst) Array.from(P(sst).getElementsByTagName('si')).forEach(si => ss.push(Array.from(si.getElementsByTagName('t')).map(t => t.textContent).join('')));
  // tarix formatlı xanaları tanımaq üçün stillər
  const tarixStil = new Set(); const sty = await z.oxu('xl/styles.xml');
  if (sty) {
    const d = P(sty); const ozel = {};
    Array.from(d.getElementsByTagName('numFmt')).forEach(f => ozel[f.getAttribute('numFmtId')] = f.getAttribute('formatCode'));
    const xfs = d.getElementsByTagName('cellXfs')[0];
    if (xfs) Array.from(xfs.getElementsByTagName('xf')).forEach((xf, i) => {
      const id = +xf.getAttribute('numFmtId');
      if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (ozel[id] && /[dy]/i.test(ozel[id].replace(/\[[^\]]*\]|"[^"]*"/g, '')))) tarixStil.add(i);
    });
  }
  // birinci vərəq
  let yol = 'xl/worksheets/sheet1.xml';
  const wb = await z.oxu('xl/workbook.xml'), rels = await z.oxu('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const sh = P(wb).getElementsByTagName('sheet')[0];
    const rid = sh && (sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
    const r = Array.from(P(rels).getElementsByTagName('Relationship')).find(x => x.getAttribute('Id') === rid);
    if (r) { const t = r.getAttribute('Target'); yol = t.startsWith('/') ? t.slice(1) : 'xl/' + t; }
  }
  const xml = await z.oxu(yol); if (!xml) throw new Error('Vərəq tapılmadı');
  const rows = [];
  Array.from(P(xml).getElementsByTagName('row')).forEach(r => {
    const row = []; let auto = 0;
    Array.from(r.getElementsByTagName('c')).forEach(c => {
      const ref = c.getAttribute('r'); let ci = auto;
      if (ref) { const L = ref.replace(/\d+/g, ''); ci = 0; for (const ch of L) ci = ci * 26 + ch.charCodeAt(0) - 64; ci--; }
      auto = ci + 1;
      const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
      let val = '';
      if (t === 's') val = ss[+(v && v.textContent)] || '';
      else if (t === 'inlineStr') val = Array.from(c.getElementsByTagName('t')).map(x => x.textContent).join('');
      else if (t === 'b') val = v && v.textContent === '1' ? 'Bəli' : 'Xeyr';
      else if (v) {
        val = v.textContent;
        if (t !== 'str' && tarixStil.has(+c.getAttribute('s')) && !isNaN(+val)) val = new Date(Math.round((+val - 25569) * 864e5)).toISOString().slice(0, 10);
      }
      row[ci] = val;
    });
    rows.push(Array.from(row, x => x == null ? '' : String(x)));
  });
  return rows;
}
function csvOxu(t) {
  t = t.replace(/^﻿/, '');
  const ilk = t.split(/\r?\n/)[0] || '';
  const ay = ilk.includes('\t') ? '\t' : (ilk.split(';').length > ilk.split(',').length ? ';' : ',');
  const rows = []; let row = [], cur = '', qt = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (qt) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else qt = false; } else cur += ch; }
    else if (ch === '"') qt = true;
    else if (ch === ay) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
const normBas = t => azLow(t).replace(/[^a-zəöüğıçş0-9]/g, '');
function idxalEded(v) {
  let t = String(v == null ? '' : v).replace(/[\s ₼]|AZN|azn|manat/g, '');
  if (t === '') return null;
  if (/,\d{1,2}$/.test(t) && !/\.\d/.test(t)) t = t.replace(/\.(?=\d{3})/g, '').replace(',', '.');   // 1.450,50
  else t = t.replace(/,/g, '');                                                                    // 1,450.50
  const n = Number(t); return isNaN(n) ? NaN : n;
}
function idxalTarix(v) {
  v = String(v == null ? '' : v).trim(); if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; if (+m[2] > 12 || +m[1] > 31) return 'X'; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  if (/^\d{5}(\.\d+)?$/.test(v)) return new Date(Math.round((+v - 25569) * 864e5)).toISOString().slice(0, 10);
  return 'X';
}
// sahələr: [{ k, ad, lazim, tip: 'metn'|'eded'|'tarix', ox: ['başlıq adları'] }]
function idxalPencere({ basliq, izah, saheler, numune, yaz }) {
  const m = modal(basliq, `<div id="ix1">
      <p class="muted" style="margin-top:0;font-size:13.5px">${izah}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <label class="btn primary" style="cursor:pointer">${ico('up')}Fayl seç (.xlsx, .csv)<input type="file" id="ixf" accept=".xlsx,.csv,.txt" style="display:none"></label>
        <button type="button" class="btn" id="ixnum">${ico('down')}Nümunə faylı yüklə</button></div>
      <div class="muted" style="font-size:13px;margin-bottom:6px">və ya Excel-dən kopyalayıb (başlıqlarla birlikdə) bura yapışdırın:</div>
      <textarea class="in" id="ixtx" rows="5" placeholder="${saheler.map(x => x.ad).join(' · ')}"></textarea></div>
    <div id="ix2" style="display:none"></div>`,
    `<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ixok" disabled>Yüklə</button>`, true);
  let cedvel = [], xer = [];
  $('#ixnum', m).onclick = () => {
    const blob = xlsxYarat([{ ad: 'Nümunə', rows: [saheler.map(x => x.ad), ...numune] }]);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = basliq.replace(/[^\wəöüğıçşƏÖÜĞIÇŞ -]/g, '') + ' - numune.xlsx'; document.body.appendChild(a); a.click(); a.remove();
  };
  const goster = rows => {
    rows = rows.filter(r => r.some(x => String(x).trim()));
    if (rows.length < 2) { toast('Faylda başlıq sətri və ən azı bir məlumat sətri olmalıdır'); return; }
    const bas = rows[0].map(x => String(x).trim()), data = rows.slice(1);
    // başlıqları tanı: əvvəl dəqiq, sonra şəkilçisiz (Adı Soyadı → adsoyad), sonra başlanğıca görə; bir sütun bir sahəyə
    const sait = t => t.replace(/[ıiuü]/g, '');
    const B = bas.map(normBas), istifade = new Set();
    const uyg = saheler.map(() => -1);
    [(b, a) => b === a, (b, a) => sait(b) === sait(a), (b, a) => b.length > 2 && a.length > 2 && (b.startsWith(a) || a.startsWith(b) || sait(b).startsWith(sait(a)))]
      .forEach(test => saheler.forEach((sh, j) => {
        if (uyg[j] >= 0) return;
        const al = [sh.ad, ...(sh.ox || [])].map(normBas);
        const i = B.findIndex((b, bi) => !istifade.has(bi) && b && al.some(a => test(b, a)));
        if (i >= 0) { uyg[j] = i; istifade.add(i); }
      }));
    $('#ix1', m).style.display = 'none'; const box = $('#ix2', m); box.style.display = '';
    box.innerHTML = `<div class="muted" style="font-size:13.5px;margin-bottom:10px">Faylda <b>${data.length}</b> sətir tapıldı. Sütunların uyğunluğunu yoxlayın:</div>
      <div class="grid two" style="gap:8px 16px">${saheler.map((sh, j) => `<div class="field" style="margin:0"><label class="f">${esc(sh.ad)}${sh.lazim ? ' <span class="neg">*</span>' : ''}</label>
        <select class="in" data-sh="${j}"><option value="-1">— yoxdur —</option>${bas.map((b, i) => `<option value="${i}" ${uyg[j] === i ? 'selected' : ''}>${esc(b || ('Sütun ' + (i + 1)))}</option>`).join('')}</select></div>`).join('')}</div>
      <div id="ixon" style="margin-top:14px"></div>`;
    const hesabla = () => {
      const map = saheler.map((sh, j) => +$(`[data-sh="${j}"]`, box).value);
      cedvel = []; xer = [];
      data.forEach((r, ri) => {
        const o = {}, er = [];
        saheler.forEach((sh, j) => {
          const raw = map[j] >= 0 ? String(r[map[j]] == null ? '' : r[map[j]]).trim() : '';
          let v = raw === '' ? null : raw;
          if (v != null && sh.tip === 'eded') { v = idxalEded(raw); if (Number.isNaN(v)) { er.push(`${sh.ad}: "${raw}" rəqəm deyil`); v = null; } }
          if (v != null && sh.tip === 'tarix') { v = idxalTarix(raw); if (v === 'X') { er.push(`${sh.ad}: "${raw}" tarix deyil`); v = null; } }
          if (sh.lazim && v == null && !er.length) er.push(`${sh.ad} boşdur`);
          o[sh.k] = v;
        });
        if (er.length) xer.push(`Sətir ${ri + 2}: ${er.join('; ')}`); else cedvel.push(o);
      });
      const yox = saheler.filter((sh, j) => sh.lazim && map[j] < 0);
      $('#ixon', box).innerHTML = (yox.length ? `<div class="banner b-red-bg">Bu sütunları seçin: ${yox.map(x => esc(x.ad)).join(', ')}</div>` : '') +
        `<div style="font-size:13.5px;margin-bottom:6px"><b class="pos">${cedvel.length}</b> sətir yüklənəcək${xer.length ? `, <b class="neg">${xer.length}</b> sətir xətaya görə buraxılacaq` : ''}.</div>
        ${cedvel.length ? `<div class="tbl-wrap" style="max-height:220px;box-shadow:none"><table class="t"><thead><tr>${saheler.map(sh => `<th>${esc(sh.ad)}</th>`).join('')}</tr></thead>
          <tbody>${cedvel.slice(0, 8).map(o => `<tr>${saheler.map(sh => `<td class="${sh.tip === 'eded' ? 'n' : ''}">${o[sh.k] == null ? '' : sh.tip === 'tarix' ? fd(o[sh.k]) : sh.tip === 'eded' ? fmt(o[sh.k]) : esc(o[sh.k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
          ${cedvel.length > 8 ? `<div class="muted" style="font-size:12.5px;margin-top:4px">… və daha ${cedvel.length - 8} sətir</div>` : ''}` : ''}
        ${xer.length ? `<details style="margin-top:8px;font-size:13px"><summary class="neg" style="cursor:pointer">Xətalı sətirlər</summary><div style="max-height:120px;overflow:auto">${xer.slice(0, 200).map(esc).join('<br>')}</div></details>` : ''}`;
      $('#ixok', m).disabled = !cedvel.length || yox.length > 0;
    };
    $$('[data-sh]', box).forEach(x => x.onchange = hesabla); hesabla();
  };
  $('#ixf', m).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { goster(/\.xlsx$/i.test(f.name) ? await xlsxOxu(await f.arrayBuffer()) : csvOxu(await f.text())); }
    catch (er) { toast('Faylı oxumaq olmadı: ' + er.message, 5000); }
  };
  $('#ixtx', m).addEventListener('paste', () => setTimeout(() => goster(csvOxu($('#ixtx', m).value)), 30));
  $('#ixok', m).onclick = async () => {
    const b = $('#ixok', m); b.disabled = true; b.textContent = 'Yüklənir…';
    try { const msj = await yaz(cedvel, (i, n) => { b.textContent = `Yüklənir… ${i}/${n}`; }); closeModal(); toast(msj, 5000); refresh(); }
    catch (er) { fail(er); b.disabled = false; b.textContent = 'Yüklə'; }
  };
}
const hisse = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
const telAcar = t => String(t || '').replace(/\D/g, '').slice(-9);

function musteriIdxal() {
  idxalPencere({
    basliq: 'Müştəriləri Excel-dən yüklə',
    izah: 'Faylda hər sətir bir müştəridir. Eyni telefonlu (telefon yoxdursa eyni adlı) müştəri artıq varsa, təkrar yaradılmır.',
    saheler: [{ k: 'ad', ad: 'Ad Soyad', lazim: true, ox: ['ad', 'müştəri', 'musteri', 'adsoyad', 'name', 'alıcı'] }, { k: 'telefon', ad: 'Telefon', ox: ['tel', 'mobil', 'nömrə', 'phone'] },
      { k: 'unvan', ad: 'Ünvan', ox: ['ünvan', 'unvan', 'address'] }, { k: 'qeyd', ad: 'Qeyd', ox: ['qeyd', 'açıqlama', 'note'] }],
    numune: [['Əli Həsənov', '050 123 45 67', 'Şərur, Heydər Əliyev 12', ''], ['Nigar Quliyeva', '055 765 43 21', 'Naxçıvan', 'Zamin: qardaşı']],
    yaz: async (rows, ir) => {
      const var_ = await all(() => sb.from('musteriler').select('ad,telefon').order('id'));
      const tel = new Set(var_.map(x => telAcar(x.telefon)).filter(x => x.length >= 7)), ad = new Set(var_.filter(x => !telAcar(x.telefon)).map(x => azLow(x.ad)));
      const yeni = []; let tekrar = 0;
      rows.forEach(r => {
        const t = telAcar(r.telefon);
        if ((t.length >= 7 && tel.has(t)) || (!t && ad.has(azLow(r.ad)))) { tekrar++; return; }
        if (t.length >= 7) tel.add(t); else ad.add(azLow(r.ad));
        yeni.push({ ad: r.ad, telefon: r.telefon, unvan: r.unvan, qeyd: r.qeyd });
      });
      let i = 0; for (const h of hisse(yeni, 500)) { await q(sb.from('musteriler').insert(h)); i += h.length; ir(i, yeni.length); }
      return `${yeni.length} müştəri əlavə olundu${tekrar ? `, ${tekrar} təkrar buraxıldı` : ''}`;
    },
  });
}

function mehsulIdxal() {
  idxalPencere({
    basliq: 'Məhsulları Excel-dən yüklə',
    izah: 'Eyni adlı məhsul artıq varsa, onun qiyməti, maya dəyəri və kateqoriyası yenilənir; yoxdursa əlavə olunur.',
    saheler: [{ k: 'ad', ad: 'Məhsulun adı', lazim: true, ox: ['ad', 'məhsul', 'mehsul', 'mal', 'malınadı', 'name'] }, { k: 'qiymet', ad: 'Satış qiyməti', lazim: true, tip: 'eded', ox: ['qiymət', 'qiymet', 'satışqiyməti', 'price'] },
      ...[2, 3, 4].map(n => ({ k: 'qiymet' + n, ad: qAdlari()[n - 1], tip: 'eded', ox: ['qiymət' + n, 'qiymet' + n, ...(n === 4 ? ['endirim', 'endirimqiyməti'] : [])] })),
      { k: 'maya', ad: 'Maya dəyəri', tip: 'eded', ox: ['maya', 'alış', 'alis', 'alışqiyməti', 'cost'] }, { k: 'kateqoriya', ad: 'Kateqoriya', ox: ['kateqoriya', 'qrup', 'növ', 'category'] },
      { k: 'kod', ad: 'Barkod / kod', ox: ['barkod', 'barcode', 'kod', 'artikul', 'code', 'sku', 'ean'] }],
    numune: [['Künc divan Milano', 1450, 980, 'Divanlar', 'DV-01'], ['Mətbəx dəsti 2.4 m', 2100, 1500, 'Mətbəx', '']],
    yaz: async (rows, ir) => {
      const var_ = await all(() => sb.from('mehsullar').select('id,ad').order('id')); const ix = new Map(var_.map(x => [azLow(x.ad), x.id]));
      const yeni = [], yen = []; const gor = new Set();
      rows.forEach(r => {
        const k = azLow(r.ad); if (gor.has(k)) return; gor.add(k);
        const v = { ad: r.ad, qiymet: r.qiymet, maya: r.maya, kateqoriya: r.kateqoriya, kod: r.kod };
        [2, 3, 4].forEach(n => { if (r['qiymet' + n] != null && !isNaN(r['qiymet' + n])) v['qiymet' + n] = r['qiymet' + n]; });
        if (ix.has(k)) yen.push([ix.get(k), v]); else yeni.push(v);
      });
      let i = 0; const n = yeni.length + yen.length;
      for (const h of hisse(yeni, 500)) { await q(sb.from('mehsullar').insert(h)); i += h.length; ir(i, n); }
      for (const [id, v] of yen) { await q(sb.from('mehsullar').update(v).eq('id', id)); i++; if (i % 10 === 0) ir(i, n); }
      return `${yeni.length} məhsul əlavə olundu${yen.length ? `, ${yen.length} məhsul yeniləndi` : ''}`;
    },
  });
}

function rasxodIdxal() {
  idxalPencere({
    basliq: 'Xərcləri Excel-dən yüklə',
    izah: `Kateqoriya bunlardan biri olmalıdır: ${KATS.join(', ')}. Tanınmayan kateqoriya "Digər" yazılır.`,
    saheler: [{ k: 'tarix', ad: 'Tarix', lazim: true, tip: 'tarix', ox: ['tarix', 'gün', 'date'] }, { k: 'mebleg', ad: 'Məbləğ', lazim: true, tip: 'eded', ox: ['məbləğ', 'mebleg', 'pul', 'amount', 'summa'] },
      { k: 'aciqlama', ad: 'Açıqlama', ox: ['açıqlama', 'aciqlama', 'təyinat', 'qeyd'] }, { k: 'kim', ad: 'Kim verib', ox: ['kim', 'verən', 'kimverib'] },
      { k: 'kateqoriya', ad: 'Kateqoriya', ox: ['kateqoriya', 'növ', 'qrup'] }],
    numune: [['01.11.2026', 250, 'Dükan kirayəsi', 'Adəm', 'Kirayə'], ['03.11.2026', 40, 'Benzin', 'Bəxtiyar', 'Yanacaq']],
    yaz: async (rows, ir) => {
      const kat = k => KATS.find(x => azLow(x) === azLow(k)) || 'Digər';
      const v = rows.map(r => ({ tarix: r.tarix, mebleg: r.mebleg, aciqlama: r.aciqlama, kim: r.kim, kateqoriya: kat(r.kateqoriya) }));
      let i = 0; for (const h of hisse(v, 500)) { await q(sb.from('rasxodlar').insert(h)); i += h.length; ir(i, v.length); }
      return `${v.length} xərc əlavə olundu`;
    },
  });
}

function satisIdxal() {
  idxalPencere({
    basliq: 'Satışları Excel-dən yüklə',
    izah: 'Köhnə satışları köçürmək üçün. Müştəri telefonla (yoxdursa adla) tapılır, tapılmasa yaradılır. "Ödənilib (kredit)" ilkin ödənişdən sonra ödənmiş məbləğdir — bir ödəniş kimi yazılır.',
    saheler: [{ k: 'ad', ad: 'Müştəri', lazim: true, ox: ['müştəri', 'musteri', 'ad', 'adsoyad', 'alıcı'] }, { k: 'telefon', ad: 'Telefon', ox: ['tel', 'mobil', 'nömrə'] },
      { k: 'unvan', ad: 'Ünvan', ox: ['ünvan', 'unvan'] }, { k: 'tarix', ad: 'Satış tarixi', lazim: true, tip: 'tarix', ox: ['tarix', 'satıştarixi', 'date'] },
      { k: 'mal', ad: 'Mal', ox: ['mal', 'məhsul', 'götürdüyümal'] }, { k: 'deyer', ad: 'Dəyəri', lazim: true, tip: 'eded', ox: ['dəyəri', 'dəyər', 'deyer', 'malındəyəri', 'qiymət'] },
      { k: 'ilkin', ad: 'İlkin ödəniş', tip: 'eded', ox: ['ilkin', 'ilkinödəniş', 'beh', 'avans'] }, { k: 'odenilen', ad: 'Ödənilib (kredit)', tip: 'eded', ox: ['ödənilib', 'odenilen', 'ödənilən', 'kreditödənişləri'] },
      { k: 'son', ad: 'Son ödəniş tarixi', tip: 'tarix', ox: ['sonödənişt', 'sonödəniş', 'sonodenis'] },
      { k: 'ayliq', ad: 'Aylıq ödəniş', tip: 'eded', ox: ['aylıq', 'ayliq', 'aylıqödəniş'] }, { k: 'ilk_odenis', ad: 'İlk ödəniş tarixi', tip: 'tarix', ox: ['ilködənişt', 'ilködəniş', 'ilkodenis'] }],
    numune: [['Əli Həsənov', '050 123 45 67', 'Şərur', '15.03.2026', 'Künc divan', 1800, 300, 600, '15.09.2026', 150, '15.04.2026'],
             ['Nigar Quliyeva', '055 765 43 21', 'Naxçıvan', '02.06.2026', 'Mətbəx dəsti', 2400, 400, 0, '', 200, '02.07.2026']],
    yaz: async (rows, ir) => {
      const mus = await all(() => sb.from('musteriler').select('id,ad,telefon').order('id'));
      const pT = new Map(), pA = new Map();
      mus.forEach(x => { const t = telAcar(x.telefon); if (t.length >= 7) pT.set(t, x.id); if (!pA.has(azLow(x.ad))) pA.set(azLow(x.ad), x.id); });
      const tap = r => { const t = telAcar(r.telefon); return t.length >= 7 ? pT.get(t) : pA.get(azLow(r.ad)); };
      // 1) çatışmayan müştərilər
      const yeniM = [], gor = new Set();
      rows.forEach(r => {
        if (tap(r)) return;
        const k = telAcar(r.telefon).length >= 7 ? 't' + telAcar(r.telefon) : 'a' + azLow(r.ad);
        if (gor.has(k)) return; gor.add(k); yeniM.push({ ad: r.ad, telefon: r.telefon, unvan: r.unvan });
      });
      for (const h of hisse(yeniM, 500)) {
        const ins = await q(sb.from('musteriler').insert(h).select('id,ad,telefon'));
        ins.forEach(x => { const t = telAcar(x.telefon); if (t.length >= 7) pT.set(t, x.id); else pA.set(azLow(x.ad), x.id); });
      }
      // 2) satışlar (köhnədən yeniyə) və ödənişlər
      const sat = rows.slice().sort((a, b) => a.tarix < b.tarix ? -1 : a.tarix > b.tarix ? 1 : 0);
      let i = 0;
      for (const h of hisse(sat, 200)) {
        const ins = await q(sb.from('satislar').insert(h.map(r => ({
          musteri_id: tap(r), tarix: r.tarix, mal: r.mal, deyer: r.deyer, ilkin: Math.min(r.ilkin || 0, r.deyer),
          ayliq: r.ayliq > 0 ? r.ayliq : null, ilk_odenis: r.ayliq > 0 ? (r.ilk_odenis || ayArtir(r.tarix, 1)) : null, qeyd: 'Excel-dən köçürülüb',
        }))).select('id'));
        const od = [];
        ins.forEach((x, j) => { const r = h[j]; if (r.odenilen > 0) od.push({ satis_id: x.id, tarix: r.son || r.tarix, mebleg: r.odenilen, texmini: !r.son, qeyd: 'Köçürülmüş ödənişlər (cəmi)' }); });
        if (od.length) await q(sb.from('satis_odenisleri').insert(od));
        i += h.length; ir(i, sat.length);
      }
      return `${sat.length} satış yükləndi${yeniM.length ? `, ${yeniM.length} yeni müştəri yaradıldı` : ''}`;
    },
  });
}

/* =====================================================================
   QƏBZ və MÜQAVİLƏ (çap / PDF)
   ===================================================================== */
const imza = (a, b) => `<div style="display:flex;justify-content:space-between;gap:30px;margin-top:40px">
  <div style="flex:1"><div style="border-top:1px solid #333;padding-top:6px">${a}</div></div><div style="flex:1"><div style="border-top:1px solid #333;padding-top:6px">${b}</div></div></div>`;

async function pageQebz(id) {
  shell('', 'Ödəniş qəbzi', '', `<button class="btn" onclick="history.back()">← Geri</button><button class="btn primary" onclick="window.print()">${ico('print')}Çap / PDF</button>`);
  const ids = String(id).split(',').map(Number).filter(Boolean);
  const kartlar = [];
  for (const pid of ids) kartlar.push(await qebzKart(pid));
  $('#page').innerHTML = kartlar.join('<div style="height:24px;break-after:page"></div>');
}

async function qebzKart(id) {
  const p = await q(sb.from('satis_odenisleri').select('*').eq('id', +id).single());
  const [s, A, evvel] = await Promise.all([
    q(sb.from('v_satislar').select('*').eq('id', p.satis_id).single()), ayarlar(),
    q(sb.from('satis_odenisleri').select('id,tarix,mebleg').eq('satis_id', p.satis_id).order('tarix').order('id')),
  ]);
  const idx = evvel.findIndex(x => x.id === p.id);
  const odenilenBuDaxil = num(s.ilkin) + evvel.slice(0, idx + 1).reduce((a, x) => a + num(x.mebleg), 0);
  const qaliq = num(s.deyer) - odenilenBuDaxil;
  const firma = A.firma_adi || firmaAdi();
  return `<div class="card" style="max-width:640px;margin:0 auto;padding:30px 34px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;border-bottom:2px solid var(--brand);padding-bottom:12px">
      <div><div style="font-size:20px;font-weight:700;color:var(--brand)">${esc(firma)}</div><div class="muted" style="font-size:13px">${esc(A.firma_unvan || '')}${A.firma_telefon ? ' · ' + esc(A.firma_telefon) : ''}${A.firma_voen ? '<br>VÖEN: ' + esc(A.firma_voen) : ''}</div></div>
      <div style="text-align:right"><div style="font-size:18px;font-weight:700">QƏBZ № ${p.id}</div><div class="muted">${fd(p.tarix)}</div></div></div>
    <table class="t" style="margin-top:16px"><tbody>
      <tr><td>Müştəri</td><td><b>${esc(s.musteri)}</b>${s.telefon ? ' · ' + esc(s.telefon) : ''}</td></tr>
      <tr><td>Satış</td><td>${esc(s.satis_no)} · ${fd(s.tarix)} · ${esc(s.mal || '')}</td></tr>
      <tr><td>Malın dəyəri</td><td>${man(s.deyer)}</td></tr>
      <tr><td><b>Ödənilən məbləğ</b></td><td><b style="font-size:18px">${man(p.mebleg)}</b></td></tr>
      <tr><td>Bu günə qədər cəmi ödənilib</td><td>${man(odenilenBuDaxil)}</td></tr>
      <tr><td>Qalıq borc</td><td><b>${man(qaliq)}</b></td></tr>
      ${p.qeyd ? `<tr><td>Qeyd</td><td>${esc(p.qeyd)}</td></tr>` : ''}</tbody></table>
    ${imza('Pulu qəbul etdi (imza)', 'Ödəyən (imza)')}</div>`;
}

async function pageMuqavile(id) {
  shell('', 'Kredit müqaviləsi', '', `<button class="btn" onclick="history.back()">← Geri</button><button class="btn primary" onclick="window.print()">${ico('print')}Çap / PDF</button>`);
  const [s, qr, A, z] = await Promise.all([
    q(sb.from('v_satislar').select('*').eq('id', +id).single()),
    q(sb.from('v_qrafik').select('*').eq('id', +id).maybeSingle()), ayarlar(),
    q(sb.from('satislar').select('zamin_ad,zamin_tel,zamin_qeyd').eq('id', +id).single()),
  ]);
  const cet = qr && qr.qrafikli ? qrafikCetveli(s, qr) : [];
  const firma = A.firma_adi || firmaAdi();
  const kr = num(s.deyer) - num(s.ilkin);
  const cerSert = num(A.cerime_gunluk) > 0 ? ` Ödəniş ${fmt(A.cerime_guzest)} gündən çox gecikdikdə gecikən məbləğə hər gün üçün ${fmt(A.cerime_gunluk, 2)}% cərimə hesablanır${num(A.cerime_max) > 0 ? ` (gecikən məbləğin ${fmt(A.cerime_max)}%-dən çox olmamaqla)` : ''}.` : '';
  $('#page').innerHTML = `<div class="card" style="max-width:760px;margin:0 auto;padding:30px 36px;line-height:1.55">
    <div style="text-align:center"><div style="font-size:19px;font-weight:700">HİSSƏ-HİSSƏ ÖDƏNİŞLƏ ALQI-SATQI MÜQAVİLƏSİ № ${esc(s.satis_no)}</div>
      <div class="muted">${fd(s.tarix)}${A.firma_unvan ? ' · ' + esc(A.firma_unvan) : ''}</div></div>
    <p><b>Satıcı:</b> ${esc(firma)}${A.firma_voen ? ', VÖEN ' + esc(A.firma_voen) : ''}${A.firma_telefon ? ', tel. ' + esc(A.firma_telefon) : ''}<br>
       <b>Alıcı:</b> ${esc(s.musteri)}${s.unvan ? ', ünvan: ' + esc(s.unvan) : ''}${s.telefon ? ', tel. ' + esc(s.telefon) : ''}
       ${z.zamin_ad ? `<br><b>Zamin:</b> ${esc(z.zamin_ad)}${z.zamin_tel ? ', tel. ' + esc(z.zamin_tel) : ''}${z.zamin_qeyd ? ', ' + esc(z.zamin_qeyd) : ''}` : ''}</p>
    <p>1. Satıcı aşağıdakı malı Alıcıya satır, Alıcı isə onun dəyərini bu müqavilədə göstərilən qaydada ödəyir.</p>
    <table class="t"><tbody>
      <tr><td>Mal</td><td><b>${esc(s.mal || '')}</b></td></tr>
      <tr><td>Malın dəyəri</td><td>${man(s.deyer)}</td></tr>
      <tr><td>İlkin ödəniş</td><td>${man(s.ilkin)}</td></tr>
      <tr><td>Hissə-hissə ödəniləcək məbləğ</td><td><b>${man(kr)}</b></td></tr>
      ${cet.length ? `<tr><td>Aylıq ödəniş</td><td>${man(qr.ayliq)} · ${cet.length} ay · ${fd(cet[0].tarix)} — ${fd(cet[cet.length - 1].tarix)}</td></tr>` : ''}</tbody></table>
    ${cet.length ? `<p style="margin-top:14px">2. Ödəniş qrafiki:</p><table class="t"><thead><tr><th>#</th><th>Ödəniş tarixi</th><th class="n">Məbləğ</th><th class="n">Qalıq</th></tr></thead>
      <tbody>${cet.map(c => `<tr><td>${c.no}</td><td>${fd(c.tarix)}</td><td class="n">${fmt(c.mebleg)}</td><td class="n">${fmt(kr - c.cem)}</td></tr>`).join('')}</tbody></table>` : ''}
    <p style="margin-top:14px">${cet.length ? '3' : '2'}. ${esc(A.muqavile_sertleri || '')}${cerSert}</p>
    ${z.zamin_ad ? `<p>${cet.length ? '4' : '3'}. Zamin Alıcının bu müqavilə üzrə öhdəliklərini yerinə yetirməsinə zəmanət verir.</p>` : ''}
    ${imza(`Satıcı: ${esc(firma)}`, `Alıcı: ${esc(s.musteri)}`)}
    ${z.zamin_ad ? imza(`Zamin: ${esc(z.zamin_ad)}`, '&nbsp;') : ''}
    <p class="muted no-print" style="font-size:12px;margin-top:24px">Bu, nümunə müqavilə şablonudur. Mətni "Ayarlar → Müqavilənin şərtləri" bölməsində dəyişə bilərsiniz; hüquqi məsələlərdə hüquqşünasla məsləhətləşin.</p></div>`;
}

/* =====================================================================
   SÜTUN FİLTRLƏRİ — bütün cədvəllərdə (ERP kimi): başlıq altında axtarış,
   az dəyərli sütunlarda siyahı, başlığa basanda sıralama, cəmlər yenilənir
   ===================================================================== */
const FLT = {};
const AXT = {};   // cədvəl axtarışı
const PG = {};    // cari səhifə
const SAY = () => { if (SAY._v == null) { let v = 20; try { const x = localStorage.getItem('cedvel_say'); if (x != null) v = +x; } catch (_) {} SAY._v = v; } return SAY._v; };
const AXT_IKON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';   // səhifə + sütun → dəyər (cədvəl yenidən çəkiləndə qorunur)
const SRT = {};
const azLow = t => String(t || '').toLocaleLowerCase('az').trim();
function xanaMetni(td) { return (td ? td.innerText : '').replace(/\s+/g, ' ').trim(); }
function ededle(t) {
  const x = String(t).replace(/[\s ₼%]/g, '').replace('−', '-').replace(/ədəd|gün|ay/g, '');
  if (!/^-?\d+(,\d+)?(\.\d+)?$/.test(x)) return null;
  if (/^0\d{3,}/.test(x) || /^\+?994/.test(String(t).trim())) return null;   // telefon nömrəsi rəqəm sayılmasın
  return Number(x.replace(',', '.'));
}
function tarixle(t) { const m = String(t).match(/^(\d{2})\.(\d{2})\.(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; }
function uygun(deyer, f) {
  if (!f) return true;
  if (f.startsWith('=')) return azLow(deyer) === azLow(f.slice(1));
  const m = f.replace(/\s/g, '').match(/^(>=|<=|>|<)(-?[\d.,]+)$/) || f.replace(/\s/g, '').match(/^(-?[\d.,]+)-(-?[\d.,]+)$/);
  if (m) {
    const n = ededle(deyer); if (n == null) return false;
    if (m[1] && /^[<>]/.test(m[1])) { const v = Number(m[2].replace(',', '.'));
      return m[1] === '>' ? n > v : m[1] === '<' ? n < v : m[1] === '>=' ? n >= v : n <= v; }
    return n >= Number(m[1].replace(',', '.')) && n <= Number(m[2].replace(',', '.'));
  }
  return azLow(deyer).includes(azLow(f));
}
// Cədvəli olduğu kimi (filtr və sıralama ilə) Excel-ə
function sehifeBasligi() { const h = $('.topbar h2'); return h ? h.innerText.trim() : 'Cədvəl'; }
function cedvelBasligi(tb) {
  const kart = tb.closest('.card'); const h = kart && $('h3', kart);
  return (h ? h.innerText.trim() : '') || sehifeBasligi();
}
function cedveliExcel(tb) {
  const ths = Array.from(tb.tHead.rows[0].cells);
  const cols = ths.map((th, i) => [i, th.innerText.replace(/[▲▼]/g, '').trim()]).filter(([, t]) => t);
  const deyer = t => { t = (t || '').replace(/\s+/g, ' ').trim(); if (!t) return ''; const n = ededle(t); if (n != null) return n; const d = tarixle(t); return d && t.length <= 16 ? d : t; };
  const data = Array.from(tb.tBodies[0].rows).filter(r => r.style.display !== 'none' && r.cells.length === ths.length)
    .map(r => cols.map(([i]) => deyer(r.cells[i].innerText)));
  const foot = tb.tFoot && tb.tFoot.rows[0];
  if (foot) { const fr = []; let k = 0; Array.from(foot.cells).forEach(c => { for (let j = 0; j < c.colSpan; j++) fr[k + j] = j ? '' : c.innerText; k += c.colSpan; });
    data.push(cols.map(([i]) => deyer(fr[i]))); }
  const ad = `${firmaAdi()} — ${cedvelBasligi(tb)} ${today()}`.replace(/[\\/:*?"<>|]/g, '');
  const blob = xlsxYarat([{ ad: cedvelBasligi(tb).replace(/[\\/:*?\[\]]/g, '').slice(0, 31) || 'Cədvəl', rows: [cols.map(c => c[1]), ...data] }]);
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = ad + '.xlsx';
  document.body.appendChild(a); a.click(); a.remove(); toast('Excel faylı yükləndi');
}
// Yalnız bu cədvəli çap et (brauzerdə "PDF kimi saxla" seçmək olar)
function cedveliPdf(tb) {
  const host = tb.closest('.card') || tb.closest('.tbl-wrap') || tb;
  const basliq = document.createElement('div'); basliq.className = 'pt-basliq';
  const alt = $('.topbar .sub') && $('.topbar .sub').innerText;
  basliq.innerHTML = `<b>${esc(firmaAdi())} — ${esc(cedvelBasligi(tb))}</b><span>${fd(today())}${alt ? ' · ' + esc(alt) : ''}</span>`;
  host.parentElement.insertBefore(basliq, host);
  host.setAttribute('data-pt', '1'); basliq.setAttribute('data-pt', '1'); document.body.classList.add('pt');
  const bitir = () => { document.body.classList.remove('pt'); host.removeAttribute('data-pt'); basliq.remove(); window.removeEventListener('afterprint', bitir); };
  window.addEventListener('afterprint', bitir);
  setTimeout(() => { window.print(); setTimeout(bitir, 500); }, 50);
}

const HUNI = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/></svg>';
function fpBagla() { const x = document.getElementById('fpop'); if (x) x.remove(); document.removeEventListener('mousedown', fpKenar, true); }
function fpKenar(e) { const x = document.getElementById('fpop'); if (x && !x.contains(e.target) && !e.target.closest('.flt-btn')) fpBagla(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') fpBagla(); });
window.addEventListener('hashchange', fpBagla);
function tabloFiltr(tb) {
  tb.dataset.flt = '1';
  const thead = tb.tHead, body = tb.tBodies[0];
  if (!thead || !body || !thead.rows[0]) return;
  const ths = Array.from(thead.rows[0].cells);
  const rows = () => Array.from(body.rows).filter(r => r.cells.length === ths.length);
  if (!rows().length || tb.closest('.cek,.modal') || /^#\/(muqavile|qebz|cek)\//.test(location.hash)) return;
  const acar = location.hash.split('?')[0] + '|' + ths.map(th => th.innerText.trim()).join('/');
  const st = FLT[acar] || (FLT[acar] = {});
  const BOS = '(Boş)';
  const deyerAl = (r, i) => xanaMetni(r.cells[i]) || BOS;
  const kecir = (r, i, f) => (!f.q || uygun(xanaMetni(r.cells[i]), f.q)) && (!f.sec || f.sec.includes(deyerAl(r, i)));
  const sirKey = t => { const n = ededle(t); if (n != null) return [0, n]; const d = tarixle(t); return d ? [1, d] : [2, azLow(t)]; };
  const muqayise = (x, y) => x[0] !== y[0] ? x[0] - y[0] : (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0);
  ths.forEach((th, i) => {
    if (!th.innerText.trim()) return;
    th.classList.add('srt'); th.title = 'Sıralamaq üçün basın';
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'flt-btn no-print'; btn.title = 'Filtr'; btn.innerHTML = HUNI;
    th.appendChild(btn);
    th.addEventListener('click', e => {
      if (e.target.closest('.flt-btn')) return;
      const cur = SRT[acar]; SRT[acar] = cur && cur.i === i ? (cur.d === 1 ? { i, d: -1 } : null) : { i, d: 1 };
      PG[acar] = 0; sirala(); tetbiq();
    });
    btn.addEventListener('click', e => { e.stopPropagation(); const acik = document.getElementById('fpop'); const eyni = acik && acik.dataset.col === acar + i; fpBagla(); if (!eyni) popAc(i, btn); });
  });
  function popAc(i, btn) {
    const f = st[i] || {};
    // Excel kimi: siyahıda digər sütunların filtrindən keçən sətirlərin dəyərləri
    const diger = rows().filter(r => Object.entries(st).every(([k, v]) => +k === i || !v || kecir(r, +k, v)));
    const say = new Map(); diger.forEach(r => { const v = deyerAl(r, i); say.set(v, (say.get(v) || 0) + 1); });
    const vals = [...say.keys()].sort((x, y) => x === BOS ? 1 : y === BOS ? -1 : muqayise(sirKey(x), sirKey(y)));
    const reqem = vals.some(v => v !== BOS) && vals.every(v => v === BOS || ededle(v) != null);
    const pop = document.createElement('div'); pop.id = 'fpop'; pop.className = 'fpop'; pop.dataset.col = acar + i;
    pop.innerHTML = `<div class="fp-h">${esc(ths[i].innerText.trim())}</div>
      <div class="fp-srt"><button type="button" data-s="1">${reqem ? 'Kiçikdən böyüyə' : 'A → Z'} ▲</button><button type="button" data-s="-1">${reqem ? 'Böyükdən kiçiyə' : 'Z → A'} ▼</button></div>
      <input class="fp-q" placeholder="${reqem ? 'Axtar və ya >100, <50, 100-500' : 'Axtar…'}" value="${esc(f.q || '')}">
      <label class="fp-all"><input type="checkbox"> <b>(Hamısını seç)</b></label>
      <div class="fp-list">${vals.slice(0, 1000).map(v => `<label><input type="checkbox" value="${esc(v)}" ${!f.sec || f.sec.includes(v) ? 'checked' : ''}> <span>${esc(v)}</span><i>${say.get(v)}</i></label>`).join('')}
        ${vals.length > 1000 ? `<div class="muted" style="padding:6px">… ${vals.length - 1000} dəyər daha — axtarışla daraldın</div>` : ''}</div>
      <div class="fp-foot"><button type="button" class="btn sm" data-t="sil">Təmizlə</button><button type="button" class="btn sm primary" data-t="ok">Tətbiq et</button></div>`;
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect(), w = Math.min(290, window.innerWidth - 16);
    pop.style.width = w + 'px';
    pop.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + window.scrollX + 'px';
    pop.style.top = r.bottom + 6 + window.scrollY + 'px';
    const q_ = $('.fp-q', pop), all_ = $('.fp-all input', pop), cbs = () => $$('.fp-list label', pop).filter(l => l.style.display !== 'none').map(l => $('input', l));
    const hamisiYoxla = () => { const c = cbs(); all_.checked = c.length && c.every(x => x.checked); all_.indeterminate = !all_.checked && c.some(x => x.checked); };
    const ifade = t => /^\s*(>=|<=|>|<)\s*-?[\d.,]+\s*$|^\s*-?[\d.,]+\s*-\s*-?[\d.,]+\s*$/.test(t);
    q_.oninput = () => { const t = q_.value; const ex = ifade(t);
      $$('.fp-list label', pop).forEach(l => { const v = $('input', l).value; const ok = !t || (ex ? uygun(v === BOS ? '' : v, t) : azLow(v).includes(azLow(t))); l.style.display = ok ? '' : 'none'; if (t) $('input', l).checked = ok; });
      hamisiYoxla(); };
    all_.onchange = () => { cbs().forEach(x => x.checked = all_.checked); hamisiYoxla(); };
    $('.fp-list', pop).addEventListener('change', hamisiYoxla);
    hamisiYoxla();
    $$('.fp-srt button', pop).forEach(b => b.onclick = () => { SRT[acar] = { i, d: +b.dataset.s }; sirala(); tetbiq(); fpBagla(); });
    $('[data-t=sil]', pop).onclick = () => { delete st[i]; PG[acar] = 0; tetbiq(); fpBagla(); };
    $('[data-t=ok]', pop).onclick = () => {
      const t = q_.value.trim();
      if (t && ifade(t)) st[i] = { q: t };
      else {
        const gorunen = $$('.fp-list label', pop).filter(l => l.style.display !== 'none').map(l => $('input', l));
        const sec = gorunen.filter(x => x.checked).map(x => x.value);
        const hamisi = !t && sec.length === $$('.fp-list label', pop).length;
        if (hamisi) delete st[i]; else st[i] = { sec, q: '' };
      }
      PG[acar] = 0; tetbiq(); fpBagla();
    };
    q_.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('[data-t=ok]', pop).click(); } };
    setTimeout(() => { document.addEventListener('mousedown', fpKenar, true); q_.focus(); }, 0);
  }
  // cəm sətri: hansı sütunlar yenilənə bilər
  const foot = tb.tFoot && tb.tFoot.rows[0] ? tb.tFoot.rows[0] : null;
  const fCell = [];
  if (foot) { let k = 0; Array.from(foot.cells).forEach(c => { if (c.colSpan === 1) fCell[k] = c; k += c.colSpan; }); }
  const cemSut = foot ? ths.map((th, i) => !!fCell[i] && i > 0 && fCell[i].classList.contains('n') && ededle(xanaMetni(fCell[i])) != null
    && rows().every(r => !xanaMetni(r.cells[i]) || ededle(xanaMetni(r.cells[i])) != null)) : [];
  const ilkFoot = foot ? foot.cells[0].innerHTML : '';
  let host = tb.closest('.tbl-wrap') || tb;
  let bar = host.previousElementSibling && host.previousElementSibling.classList.contains('flt-bar') ? host.previousElementSibling : null;
  if (!bar) {
    bar = document.createElement('div'); bar.className = 'flt-bar no-print'; bar.innerHTML = '<div class="flt-sol"></div><div class="flt-info"></div><div class="flt-tools"></div>';
    // cədvəl grid/flex içindədirsə, alət sətri ayrıca sütun olmasın: ikisini bir qutuya yığ
    const d = getComputedStyle(host.parentElement).display;
    if (/grid|flex/.test(d)) { const w = document.createElement('div'); w.className = 'flt-qutu'; w.style.minWidth = '0'; host.parentElement.insertBefore(w, host); w.appendChild(host); }
    host.parentElement.insertBefore(bar, host);
  }
  const info = $('.flt-info', bar);
  const coxSetir = true;
  $('.flt-sol', bar).innerHTML = true ? `<label class="flt-axtar">${AXT_IKON}<input type="search" placeholder="Cədvəldə axtar…" value="${esc(AXT[acar] || '')}"></label>` : '';
  const ax = $('.flt-axtar input', bar);
  if (ax) { let t0; ax.oninput = () => { clearTimeout(t0); t0 = setTimeout(() => { AXT[acar] = ax.value; PG[acar] = 0; tetbiq(); }, 150); }; }
  $('.flt-tools', bar).innerHTML = (coxSetir ? `<label class="flt-say" title="Bir səhifədə neçə sətir göstərilsin">Göstər <select>${[10, 20, 50, 100, 200, 0].map(n => `<option value="${n}" ${n === SAY() ? 'selected' : ''}>${n || 'Hamısı'}</option>`).join('')}</select></label>` : '') + `<button type="button" class="btn sm" data-x="xls" title="Görünən sətirləri Excel faylına yüklə">${ico('down')}Excel</button><button type="button" class="btn sm" data-x="pdf" title="Yalnız bu cədvəli çap et və ya PDF kimi saxla">${ico('print')}PDF</button>`;
  $('[data-x=xls]', bar).onclick = () => cedveliExcel(tb);
  const saySel = $('.flt-say select', bar);
  if (saySel) saySel.onchange = () => { try { localStorage.setItem('cedvel_say', saySel.value); } catch (_) {} SAY._v = +saySel.value; PG[acar] = 0; tetbiq(); };
  // səhifə keçidləri cədvəlin altında
  let pager = host.nextElementSibling && host.nextElementSibling.classList.contains('flt-pager') ? host.nextElementSibling : null;
  if (!pager) { pager = document.createElement('div'); pager.className = 'flt-pager no-print'; host.parentElement.insertBefore(pager, host.nextSibling); }
  const metnler = new Map(rows().map(r => [r, azLow(r.innerText)]));
  $('[data-x=pdf]', bar).onclick = () => cedveliPdf(tb);
  function sirala() {
    $$('th.srt', thead).forEach(th => th.classList.remove('asc', 'desc'));
    const sr = SRT[acar]; if (!sr) return;
    ths[sr.i].classList.add(sr.d === 1 ? 'asc' : 'desc');
    rows().map(r => [sirKey(xanaMetni(r.cells[sr.i])), r]).sort((a, b) => muqayise(a[0], b[0]) * sr.d).forEach(([, r]) => body.appendChild(r));
  }
  function tetbiq() {
    const aktiv = Object.entries(st).filter(([, v]) => v && (v.q || v.sec));
    ths.forEach((th, i) => { const b = $('.flt-btn', th); if (b) b.classList.toggle('on', !!(st[i] && (st[i].q || st[i].sec))); });
    let gor = 0; const hamisi = rows();
    const axt = azLow(AXT[acar] || '').split(/\s+/).filter(Boolean);
    const uygunlar = [];
    hamisi.forEach(r => {
      const ok = aktiv.every(([i, v]) => kecir(r, +i, v)) && axt.every(w => (metnler.get(r) || azLow(r.innerText)).includes(w));
      r.style.display = ok ? '' : 'none'; r.classList.remove('pg-gizli'); if (ok) { gor++; uygunlar.push(r); }
    });
    // səhifələmə (filtrdən sonra, cari sıralama ilə)
    const n = SAY(), sehSay = n ? Math.max(1, Math.ceil(gor / n)) : 1;
    let pgi = Math.min(PG[acar] || 0, sehSay - 1); PG[acar] = pgi;
    if (n) uygunlar.forEach((r, k) => { if (k < pgi * n || k >= (pgi + 1) * n) r.classList.add('pg-gizli'); });
    if (n && gor > n) {
      const dug = (i, t, on, dis) => `<button type="button" class="btn sm ${on ? 'primary' : ''}" data-pg="${i}" ${dis ? 'disabled' : ''}>${t}</button>`;
      const nomreler = []; for (let i = 0; i < sehSay; i++) if (i === 0 || i === sehSay - 1 || Math.abs(i - pgi) <= 2) nomreler.push(i); else if (nomreler[nomreler.length - 1] !== '…') nomreler.push('…');
      pager.innerHTML = `<span class="muted">${fmt(pgi * n + 1)}–${fmt(Math.min(gor, (pgi + 1) * n))} / ${fmt(gor)}</span>
        <div>${dug(pgi - 1, '‹', false, pgi === 0)}${nomreler.map(i => i === '…' ? '<span class="muted" style="padding:0 4px">…</span>' : dug(i, i + 1, i === pgi)).join('')}${dug(pgi + 1, '›', false, pgi >= sehSay - 1)}</div>`;
      $$('[data-pg]', pager).forEach(b => b.onclick = () => { PG[acar] = +b.dataset.pg; tetbiq(); host.scrollIntoView({ block: 'nearest' }); });
    } else pager.innerHTML = '';
    if (foot) {
      cemSut.forEach((ok, i) => { if (!ok) return;
        const c = hamisi.filter(r => r.style.display !== 'none').reduce((a, r) => a + (ededle(xanaMetni(r.cells[i])) || 0), 0);
        const t = fCell[i]; const b = t.querySelector('b') || t; b.textContent = fmt(Math.round(c * 100) / 100) + (/₼/.test(t.innerText) ? ' ₼' : ''); });
      foot.cells[0].innerHTML = aktiv.length || axt.length ? `${gor} sətir (süzülüb)` : ilkFoot;
    }
    info.innerHTML = aktiv.length || axt.length ? `<span>${HUNI} ${gor} / ${hamisi.length} sətir${aktiv.length ? ' · ' + aktiv.map(([i]) => esc(ths[+i].innerText.trim())).join(', ') : ''}</span> <a href="#" class="flt-sil">Təmizlə ✕</a>` : '';
    const sil = info.querySelector('.flt-sil');
    if (sil) sil.onclick = e => { e.preventDefault(); Object.keys(st).forEach(k => delete st[k]); AXT[acar] = ''; if (ax) ax.value = ''; PG[acar] = 0; tetbiq(); };
  }
  sirala(); tetbiq();
}
let fltT = null;
new MutationObserver(() => { clearTimeout(fltT); fltT = setTimeout(() => $$('#page table.t:not([data-flt])').forEach(tabloFiltr), 60); })
  .observe(document.getElementById('app'), { childList: true, subtree: true });

/* ---------------- başla ---------------- */
if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes('SIZIN-LAYIHE')) {
  app.innerHTML = '<div class="login-wrap"><div class="login-card"><h1>Quraşdırma lazımdır</h1><p>config.js faylına Supabase ünvanını və açarını yazın.</p></div></div>';
} else {
  let berpa = /type=recovery/.test(location.hash);
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'SIGNED_OUT') { S.user = null; }
    if (ev === 'PASSWORD_RECOVERY') { berpa = true; sistemOxu().then(() => loginView('', 'yeni')); }
  });
  setTimeout(() => { if (!berpa) start(); else loginView('', 'yeni'); }, berpa ? 400 : 0);
}
})();
