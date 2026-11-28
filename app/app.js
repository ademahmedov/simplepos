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
const icaze = k => !!S.admin || (S.rol && !['bloklu', 'gozleyir'].includes(S.rol) && (S.icazeler && k in S.icazeler ? !!S.icazeler[k] : icazeDef(S.rol, k)));
const canWrite = () => (icaze('elave') || icaze('duzelis')) && S.aktiv;
const idareci = () => S.rol === 'admin' || S.rol === 'muhasib';
const firmaAdi = () => (S.magaza && S.magaza.ad) || CFG.FIRMA_ADI;
const gunFerqi = d => Math.round((new Date(d + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 864e5);

function toast(msg, ms) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms || 2600);
}
function fail(e) { console.error(e); const t = (e && (e.message || e.error_description)) || String(e); toast(/row-level security|permission denied|violates row/i.test(t) ? 'Bu əməliyyat üçün icazəniz yoxdur' : 'Xəta: ' + t, 5000); }

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
const SAHELER = [['muhasibat', 'Mühasibat uçotu (qaimə, ƏDV, əmək haqqı)'], ['mebel', 'Mebel'], ['elektronika', 'Elektronika və məişət texnikası'], ['telefon', 'Telefon və aksesuar'], ['geyim', 'Geyim və ayaqqabı'],
  ['tikinti', 'Tikinti materialları'], ['xalca', 'Xalça və ev tekstili'], ['zinet', 'Zərgərlik'], ['market', 'Market və ərzaq'], ['diger', 'Digər']];
const MEQSEDLER = [['muhasib', 'Mühasibatlıq', 'Bir neçə firmanın uçotu', '📒'], ['mebel', 'Mebel', 'Mebel satışı', '🛋️'], ['elektronika', 'Elektronika', 'Məişət texnikası', '📺'],
  ['telefon', 'Telefon', 'Telefon və aksesuar', '📱'], ['geyim', 'Geyim', 'Geyim və ayaqqabı', '👕'], ['tikinti', 'Tikinti', 'Tikinti materialları', '🧱'],
  ['xalca', 'Xalça', 'Xalça və ev tekstili', '🧶'], ['zinet', 'Zərgərlik', 'Qızıl və zinət', '💍'], ['market', 'Market', 'Market və ərzaq', '🛒'], ['diger', 'Digər', 'Başqa satış sahəsi', '🏪']];
const meqsedKafel = () => `<div class="mqs">${MEQSEDLER.map(([k, t, a, e]) => `<button type="button" class="mq" data-mq="${k}"><span class="mq-e">${e}</span><b>${t}</b><small>${a}</small></button>`).join('')}</div>`;
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
// Sayt daxilində təsdiq / sual pəncərəsi (brauzerin confirm/prompt əvəzinə)
function sorus(msg, o = {}) {
  return new Promise(res => {
    let root = document.getElementById('dlg-root'); if (!root) { root = document.createElement('div'); root.id = 'dlg-root'; document.body.appendChild(root); }
    const sil = o.danger != null ? o.danger : /silin|ləğv|həmişəlik/i.test(msg);
    root.innerHTML = `<div class="overlay dlg-ov"><div class="modal dlg"><div class="mb" style="padding-top:20px"><div class="dlg-t">${esc(msg)}</div>
      ${o.input != null ? `<input class="in" id="dlgi" style="margin-top:12px" value="${esc(o.input)}" autocomplete="off">` : ''}</div>
      <div class="mf"><button class="btn" id="dlgx">${o.legv || 'Xeyr'}</button><button class="btn ${sil ? 'danger-f' : 'primary'}" id="dlgo">${o.ok || (sil ? 'Bəli, sil' : 'Bəli')}</button></div></div></div>`;
    const inp = document.getElementById('dlgi');
    const bit = v => { document.removeEventListener('keydown', kb, true); root.innerHTML = ''; res(v); };
    const kb = e => { if (e.key === 'Escape') { e.stopPropagation(); bit(o.input != null ? null : false); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); bit(o.input != null ? inp.value : true); } };
    document.addEventListener('keydown', kb, true);
    document.getElementById('dlgx').onclick = () => bit(o.input != null ? null : false);
    document.getElementById('dlgo').onclick = () => bit(o.input != null ? inp.value : true);
    $('.dlg-ov', root).addEventListener('mousedown', e => { if (e.target.classList.contains('dlg-ov')) bit(o.input != null ? null : false); });
    setTimeout(() => (inp || document.getElementById('dlgo')).focus(), 30);
  });
}
const tesdiq = (msg, o) => sorus(msg, o);
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
// Qeydiyyatdan sonra e-poçta gələn kodla təsdiq — Supabase-də öz e-poçt göndəricisi (SMTP) qoşulub məktub şablonuna kod qoyulanda true edin
const KOD_TESDIQ = false;
function kodView(email, msg) {
  app.innerHTML = `<div class="login-wrap"><form class="login-card" id="kf">
    <div class="login-logo">${LOGO}</div><h1>${esc(CFG.FIRMA_ADI)}</h1><p>E-poçtun təsdiqi</p>
    <div class="muted" style="font-size:13.5px;line-height:1.55;margin:6px 0 14px"><b>${esc(email)}</b> ünvanına təsdiq kodu göndərildi. Kodu aşağıya yazın (məktub görünmürsə "Spam" qovluğuna baxın).</div>
    <div id="kmsg">${msg || ''}</div>
    <div class="field"><label class="f">Təsdiq kodu</label><input class="in" name="t" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required style="font-size:22px;letter-spacing:6px;text-align:center;font-weight:700" placeholder="••••••"></div>
    <button class="btn primary" id="kok" style="width:100%;justify-content:center;padding:11px">Təsdiqlə və daxil ol</button>
    <div style="display:flex;justify-content:space-between;margin-top:12px;font-size:13px"><a href="#" id="kyen">Kodu yenidən göndər</a><a href="#" id="kgeri">← Girişə qayıt</a></div>
    <p class="muted" style="font-size:12px;margin:12px 0 0;text-align:center">Məktubda kod əvəzinə link varsa, linkə basmaq da kifayətdir — sonra burada daxil olun.</p></form></div>`;
  const f = $('#kf'), xeta = t => { $('#kmsg').innerHTML = `<div class="banner b-red-bg">${esc(t)}</div>`; }, ok = t => { $('#kmsg').innerHTML = `<div class="banner" style="background:#e8f5ec;color:#1e6b3a">${esc(t)}</div>`; };
  setTimeout(() => f.t.focus(), 50);
  f.onsubmit = async e => {
    e.preventDefault(); const t = f.t.value.replace(/\s/g, ''); if (t.length < 6) return xeta('Kodu tam yazın.');
    $('#kok').disabled = true;
    let { error } = await sb.auth.verifyOtp({ email, token: t, type: 'signup' });
    if (error) ({ error } = await sb.auth.verifyOtp({ email, token: t, type: 'email' }));
    $('#kok').disabled = false;
    if (error) return xeta(/expired|invalid/i.test(error.message || '') ? 'Kod yanlışdır və ya vaxtı keçib. "Kodu yenidən göndər" basın.' : authXeta(error));
    history.replaceState(null, '', SAYT()); start();
  };
  let gozle = 0;
  $('#kyen').onclick = async e => { e.preventDefault(); if (Date.now() < gozle) return xeta(`Yenidən göndərmək üçün ${Math.ceil((gozle - Date.now()) / 1000)} saniyə gözləyin.`);
    const { error } = await sb.auth.resend({ type: 'signup', email }); if (error) return xeta(authXeta(error)); gozle = Date.now() + 60000; ok('Yeni kod göndərildi.'); };
  $('#kgeri').onclick = e => { e.preventDefault(); loginView(''); };
}
function loginView(msg, rejim) {
  rejim = rejim || 'giris';
  const sinaq = S.sistem.sinaq_gun || '14';
  const tabs = `<div class="seg" style="display:flex;margin:4px 0 16px">${[['giris', 'Daxil ol'], ['qeyd', 'Qeydiyyat']].map(([k, t]) =>
    `<button type="button" data-rj="${k}" class="${rejim === k || (rejim === 'unut' && k === 'giris') ? 'on' : ''}" style="flex:1">${t}</button>`).join('')}</div>`;
  let form = '';
  if (rejim === 'giris') form = `
    <div class="field"><label class="f">E-poçt və ya istifadəçi adı</label><input class="in" type="text" name="e" autocomplete="username" autocapitalize="off" required></div>
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
    <div id="addim1"><div class="mq-bas">Proqramdan nə üçün istifadə edəcəksiniz?</div>${meqsedKafel()}
      <div style="text-align:center;margin-top:12px"><a href="#" id="kodlink" style="font-size:13px">Dükanda işləyirəm, dəvət kodum var →</a></div></div>
    <div id="addim2" style="display:none">
    <div class="mq-sec" id="mqsec"></div>
    <input type="hidden" name="sahe" value="mebel">
    <div id="yenidukan">
      <div class="field"><label class="f">Dükanın adı</label><input class="in" name="mg" placeholder="məs. Ulduz Mebel"></div></div>
    <div id="muhinfo" class="muted" style="display:none;font-size:13px;background:#faf4ea;border-radius:10px;padding:10px 12px;margin-bottom:12px">Bir hesabla bir neçə firmanın uçotunu aparacaqsınız. Qeydiyyatdan sonra firmalarınızı əlavə edin — hər yeni firma ${esc(sinaq)} gün pulsuz işləyir.</div>
    <div class="field" id="telsah"><label class="f">Telefon</label><input class="in" name="tel" type="tel" placeholder="050 000 00 00"></div>
    <div id="kodlu" style="display:none">
      <div class="field"><label class="f">Dəvət kodu</label><input class="in" name="kod" maxlength="6" style="text-transform:uppercase;letter-spacing:3px;font-weight:600" placeholder="ABC123">
        <div class="cell-sub" id="kodinfo" style="margin-top:4px">Kodu dükanın mühasibindən alın.</div></div></div>
    <div class="field"><label class="f">Ad Soyad</label><input class="in" name="ad" required></div>
    <div class="field"><label class="f">E-poçt</label><input class="in" type="email" name="e" autocomplete="username" required></div>
    <div class="field"><label class="f">Şifrə (ən azı 6 simvol)</label><input class="in" type="password" name="p" minlength="6" autocomplete="new-password" required></div>
    <button class="btn primary" style="width:100%;justify-content:center;padding:11px">Qeydiyyatdan keç</button>
    <p class="muted" style="font-size:12.5px;text-align:center;margin:10px 0 0" id="sinaqinfo">Yeni dükan ${esc(sinaq)} gün pulsuz işləyir.${S.sistem.qiymet ? ' Sonra: ' + esc(S.sistem.qiymet) + '.' : ''}</p></div>`;
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
    const addim = (yeniNv, sahe) => {
      nv = yeniNv; if (sahe) f.sahe.value = sahe;
      $('#addim1').style.display = 'none'; $('#addim2').style.display = '';
      const M = MEQSEDLER.find(x => x[0] === (nv === 'muh' ? 'muhasib' : f.sahe.value));
      $('#mqsec').innerHTML = `<span>${nv === 'kod' ? '🔑 <b>Dəvət kodu ilə qoşulma</b>' : `${M[3]} <b>${esc(M[1])}</b> <small>${esc(M[2])}</small>`}</span><a href="#" id="mqdeyis">dəyiş</a>`;
      $('#mqdeyis').onclick = e => { e.preventDefault(); $('#addim2').style.display = 'none'; $('#addim1').style.display = ''; };
      $('#yenidukan').style.display = nv === 'yeni' ? '' : 'none'; $('#kodlu').style.display = nv === 'kod' ? '' : 'none';
      $('#muhinfo').style.display = nv === 'muh' ? '' : 'none'; $('#telsah').style.display = nv === 'kod' ? 'none' : '';
      $('#sinaqinfo').style.display = nv === 'yeni' ? '' : 'none';
      if (nv === 'yeni') f.mg.placeholder = 'məs. ' + ({ mebel: 'Ulduz Mebel', elektronika: 'Kamran Elektronika', telefon: 'Nur Telefon', geyim: 'Moda Geyim', tikinti: 'Usta Tikinti', xalca: 'Şirvan Xalça', zinet: 'Qızıl Dünyası', market: 'Bərəkət Market' }[f.sahe.value] || 'Dükanın adı');
      setTimeout(() => (nv === 'yeni' ? f.mg : nv === 'kod' ? f.kod : f.ad).focus(), 30);
    };
    $$('[data-mq]', f).forEach(b => b.onclick = () => b.dataset.mq === 'muhasib' ? addim('muh') : addim('yeni', b.dataset.mq));
    $('#kodlink').onclick = e => { e.preventDefault(); addim('kod'); };
    if (location.hash === '#muhasib') addim('muh');
    let kodAd = null;
    f.kod.oninput = async () => {
      const k = f.kod.value.trim().toUpperCase(); kodAd = null;
      if (k.length < 6) { $('#kodinfo').textContent = 'Kodu dükanın mühasibindən alın.'; return; }
      try { kodAd = await q(sb.rpc('devet_yoxla', { kod: k })); } catch (_) {}
      $('#kodinfo').innerHTML = kodAd ? `Dükan: <b>${esc(kodAd)}</b>` : '<span class="neg">Bu kod tapılmadı</span>';
    };
    f.onsubmit = async e => {
      e.preventDefault();
      if ($('#addim2').style.display === 'none') return err('Əvvəlcə sahəni seçin.');
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
      if (KOD_TESDIQ) return kodView(f.e.value.trim());
      ok('Qeydiyyat alındı. E-poçtunuza təsdiq linki göndərildi — linkə basıb sonra daxil olun (məktub görünmürsə "Spam" qovluğuna baxın).');
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
      const gir = f.e.value.trim().toLowerCase(), email = gir.includes('@') ? gir : gir + ISCI_DOMEN;
      const { error } = await sb.auth.signInWithPassword({ email, password: f.p.value });
      btn().disabled = false;
      if (error && /Email not confirmed/i.test(error.message || '')) { const em = f.e.value.trim(); await sb.auth.resend({ type: 'signup', email: em });
        if (KOD_TESDIQ) return kodView(em, '<div class="banner b-amber-bg">E-poçtunuz hələ təsdiqlənməyib — yeni kod göndərdik.</div>');
        return err('E-poçtunuz hələ təsdiqlənməyib. Yeni təsdiq linki göndərdik — məktubdakı linkə basıb sonra daxil olun.'); }
      if (error) return err(authXeta(error));
      try { await sb.rpc('admin_cix'); } catch (_) {}   // admin həmişə admin paneldən başlasın
      history.replaceState(null, '', SAYT()); start();
    };
  }
}

async function start() {
  if (!S.sistem || !Object.keys(S.sistem).length) await sistemOxu();
  const { data } = await sb.auth.getSession();
  const ses = data && data.session;
  if (!ses) return loginView('', /^#(qeyd|muhasib)$/.test(location.hash) ? 'qeyd' : 'giris');
  S.user = ses.user; S.cache = {};
  if (/^#(qeyd|muhasib)$/.test(location.hash)) location.hash = '';
  try {
    // hamısı paralel: açıq dükanı RLS özü verir (magazalar yalnız açıq dükanı göstərir)
    const [uz, adm, pr, fl, mg] = await Promise.all([
      q(sb.from('uzvler').select('rol,ad,magaza_id,secili,yaradildi,admin_giris,icazeler').eq('user_id', S.user.id)),
      q(sb.from('adminler').select('user_id').eq('user_id', S.user.id).maybeSingle()),
      q(sb.from('profiller').select('*').eq('user_id', S.user.id).maybeSingle()).catch(() => null),
      q(sb.rpc('uzvluklerim')).catch(() => []),
      q(sb.from('magazalar').select('*')).catch(() => []),
    ]);
    S.admin = !!adm; S.profil = pr; S.muhasibHesab = !!(pr && pr.nov === 'muhasib');
    const aktivUz = uz.filter(x => !['bloklu', 'gozleyir'].includes(x.rol) && (!x.admin_giris || x.secili)).sort((a, b) => (b.secili - a.secili) || String(a.yaradildi).localeCompare(String(b.yaradildi)) || a.magaza_id - b.magaza_id);
    S.coxFirma = true;   // hər istifadəçi öz müəssisələrini açıb idarə edə bilər
    S.ozFirma = uz.some(x => !x.admin_giris && !['bloklu', 'gozleyir'].includes(x.rol));
    S.firmalar = S.coxFirma ? fl : [];
    const me = aktivUz[0];
    S.adminBaxir = !!(me && me.admin_giris);
    if (me) {
      S.rol = me.rol; S.icazeler = me.icazeler || null; S.ad = me.ad || (S.user.email || '').replace(ISCI_DOMEN, '');
      S.magaza = mg.find(x => x.id === me.magaza_id) || await q(sb.from('magazalar').select('*').eq('id', me.magaza_id).single());
      S.qalan = gunFerqi(S.magaza.abune_bitir);
      S.aktiv = !S.magaza.dayandirilib && S.qalan >= 0;
    } else { S.rol = null; S.magaza = null; S.aktiv = false; S.ad = (pr && pr.ad) || S.user.email; }
  } catch (e) { return loginView('Baza ilə əlaqə alınmadı: ' + e.message); }
  document.title = firmaAdi() + ' · ' + CFG.FIRMA_ADI;
  // ünvanı hashchange-siz dəyiş, səhifə yalnız bir dəfə çəkilsin (iki dəfə çəkiləndə xəta çıxırdı)
  const get = h => { if (location.hash !== h) history.replaceState(null, '', h); };
  if (!S.magaza) get(S.admin && !S.muhasibHesab ? '#/admin' : '#/firmalar');
  else if (S.rol === 'kuryer') get('#/yigim');
  else if (!location.hash || /access_token|type=/.test(location.hash)) get(window.innerWidth <= 760 ? '#/menyu' : (muhFirma() ? '#/cedvel' : '#/panel'));
  route();
  if (S.profil && !S.profil.meqsed && !S.admin && (idareci() || !S.magaza)) setTimeout(meqsedModal, 600);
}
function meqsedModal() {
  const m = modal('Proqramdan nə üçün istifadə edirsiniz?', `<p class="muted" style="margin-top:0;font-size:13.5px">Seçiminizə görə nümunələr və bölmələr uyğunlaşdırılacaq. Sonra Ayarlardan dəyişə bilərsiniz.</p>${meqsedKafel()}`,
    `<button class="btn" data-close>Sonra</button>`, true);
  $$('[data-mq]', m).forEach(b => b.onclick = async () => {
    const k = b.dataset.mq;
    try { await q(sb.rpc('meqsed_sec', { m: k })); S.profil.meqsed = k; closeModal();
      if (k === 'muhasib') { toast('Mühasib rejimi açıldı — firmalarınızı "Müəssisələr" bölməsindən əlavə edin', 4500); await start(); location.hash = '#/firmalar'; }
      else { if (S.magaza && idareci()) S.magaza.sahe = k; toast('Yadda saxlanıldı'); route(); }
    } catch (er) { fail(er); }
  });
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
  ['panel', 'Panel', 'panel'], ['sat', 'Satış et', 'sale'], ['satislar', 'Satışlar', 'doc'], ['musteriler', 'Müştərilər', 'users'], ['mehsullar', 'Məhsullar', 'box'],
  ['rasxodlar', 'Xərclər', 'exp'], ['isciler', 'İşçilər', 'worker'], ['odenisler', 'Ödənişlər', 'wallet'], ['cixaris', 'Çıxarış', 'doc'],
  ['kassa', 'Kassa', 'kassaI'], ['sifarisler', 'Sifarişlər', 'clip'], ['hesabat', 'Aylıq hesabat', 'chart'],
  ['teqvim', 'Ödəniş təqvimi', 'cal'], ['menfeet', 'Mənfəət', 'trend'], ['yigim', 'Yığım siyahısı', 'wallet'], ['saticilar', 'Satıcılar', 'chart'], ['jurnal', 'Jurnal', 'hist'], ['ayarlar', 'Ayarlar', 'gear'],
];
const MOBNAV = ['menyu', 'panel', 'satislar', 'musteriler', 'mehsullar'];

const NAVQISA = { menyu: 'Menyu', panel: 'Panel', satislar: 'Satış', musteriler: 'Müştəri', mehsullar: 'Məhsul', rasxodlar: 'Xərc', isciler: 'İşçi' };
const NAVBOLME = [['Satış', ['panel', 'sat', 'satislar', 'musteriler', 'mehsullar']], ['Xərclər və işçilər', ['rasxodlar', 'isciler']], ['Kassa və hesabatlar', ['kassa', 'yigim', 'sifarisler', 'hesabat', 'teqvim', 'menfeet', 'saticilar']], ['İdarəetmə', ['jurnal', 'ayarlar']]];

// İşçilər bölməsinin tabları: işçilər, onlara edilən ödənişlər, çıxarış
const iscTab = a => `<div class="seg" id="isctab">${[['isciler', 'İşçilər'], ['odenisler', 'Ödənişlər'], ['cixaris', 'Çıxarış']].map(([k, t]) => `<button data-h="${k}" class="${k === a ? 'on' : ''}">${t}</button>`).join('')}</div>`;
const iscTabBagla = a => {   // tablar həmişə eyni yerdə: başlığın üstündə, solda
  const t = $('.topbar'); if (!t) return; $$('#isctab').forEach(x => x.remove());
  const d = document.createElement('div'); d.className = 'isc-nav no-print'; d.innerHTML = iscTab(a); t.parentNode.insertBefore(d, t);
  $$('#isctab button').forEach(b => b.onclick = () => { location.hash = '#/' + b.dataset.h; });
};
function navBolmeler(active) {
  const N = muhFirma() ? NAV_M : NAV, B = muhFirma() ? NAVBOLME_M : NAVBOLME;
  const link = k => { const n = N.find(x => x[0] === k); return n ? `<a href="#/${k}" class="${active === k ? 'active' : ''}">${ico(n[2])}${n[1]}</a>` : ''; };
  return B.map(([b, ks], i) => `${i ? `<div class="sec">${b}</div>` : ''}${ks.map(link).join('')}`).join('');
}
function shell(active, title, sub, tools, body) {
  document.body.classList.toggle('nohes', !!S.magaza && !icaze('hesabat'));
  const navA = (S.rol === 'kuryer' ? NAV.filter(n => n[0] === 'yigim') : NAV).map(([k, t, i]) => `<a href="#/${k}" class="${active === k ? 'active' : ''}">${ico(i)}${t}</a>`).join('');
  app.innerHTML = `<div class="shell">
   <aside class="side"><div class="logo">${LOGO}<div><span>${esc(CFG.FIRMA_ADI)}</span><small>${S.magaza ? esc(S.magaza.ad) : S.admin ? 'Admin' : ''}</small></div></div>
    ${S.coxFirma && S.firmalar.length > 1 && !S.adminBaxir ? `<div class="firma-sec"><select id="fsec" title="Firmanı dəyiş">${S.firmalar.map(x => `<option value="${x.id}" ${S.magaza && x.id === S.magaza.id ? 'selected' : ''}>${esc(x.ad)}</option>`).join('')}</select></div>` : ''}
    <nav>${(S.coxFirma || !S.magaza) && (!S.admin || S.ozFirma) ? `<a href="#/firmalar" class="${active === 'firmalar' ? 'active' : ''}">${ico('bina')}Müəssisələr</a>` : ''}${S.rol === 'kuryer' ? navA : ''}${S.admin ? `<a href="#/admin" class="${active === 'admin' ? 'active' : ''}">${ico('panel')}Admin panel</a>${S.magaza ? `<div class="sec">${muhFirma() ? 'Firma' : 'Dükan'}</div>` : ''}` : ''}${S.magaza && S.rol !== 'kuryer' ? navBolmeler(active) : ''}</nav>
    <div class="who"><b>${esc(S.ad)}</b>${esc((S.user.email || '').replace(ISCI_DOMEN, ''))}<br><span style="font-size:11.5px;opacity:.8">${S.admin && !S.magaza ? 'Super admin' : VEZIFE_AD[S.rol] || ''}</span><br><button id="out">Çıxış</button></div></aside>
   <div class="mobile-bar"><button id="geri" class="mb-geri" ${active === 'menyu' || (S.rol === 'kuryer' && active === 'yigim') ? 'style="visibility:hidden"' : ''}>‹ Geri</button><b ${S.coxFirma ? 'id="mbfirma" style="cursor:pointer"' : ''}>${LOGO}${esc(firmaAdi())}${S.coxFirma ? ' ▾' : ''}</b><button id="out2">Çıxış</button></div>
   <main class="main">${S.adminBaxir ? `<div class="admin-bar no-print"><span>Admin rejimi: <b>${esc(S.magaza.ad)}</b> müəssisəsinə baxırsınız — hər şeyi görə və düzəldə bilərsiniz</span><button class="btn sm" id="admgeri">← Admin panelə qayıt</button></div>` : ''}${S.magaza && muhFirma() && S.rol !== 'kuryer' ? mUstPanel(active) : ''}${abuneBanner()}<div class="topbar"><div><h2>${title}</h2><div class="sub">${sub || ''}</div></div><div class="tools">${tools || ''}</div></div>
   <div id="page">${body || '<div class="empty"><div class="spinner" style="margin:auto"></div></div>'}</div></main>
   <nav class="bottom-nav" ${S.magaza && S.rol !== 'kuryer' ? '' : 'style="display:none"'}><a href="#/menyu" class="${active === 'menyu' ? 'active' : ''}">${ico('grid')}Menyu</a></nav>
  </div>`;
  const out = async () => { await sb.auth.signOut(); S.user = null; S.magaza = null; S.cache = {}; YOL.length = 0; history.replaceState(null, '', SAYT()); loginView(); };
  $('#out').onclick = out; $('#out2').onclick = out;
  $('#geri').onclick = geri;
  if ($('#admgeri')) $('#admgeri').onclick = adminPaneleQayit;
  document.body.classList.toggle('muh', muhFirma());
  mUstBagla();
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
  const run = { heyet: () => pageHeyet(), cedvel: () => pageCedvel(params), panel: pagePanel, satislar: () => pageSatislar(params), musteriler: () => pageMusteriler(params), musteri: () => pageMusteri(id), menyu: () => pageMenyu(), sat: () => pageSat(params), mpanel: () => { location.replace('#/bugun'); }, gelen: () => { location.replace('#/qaime?ist=gelen'); }, geden: () => { location.replace('#/qaime?ist=geden'); },
    bugun: () => pageBugun(), qaime: () => pageQaime(params), akt: () => pageAkt(params), odenis: () => pageOdenis(params), edv: () => pageEdv(params), depozit: () => pageDepozit(params), hesab: () => pageMHesabat(params), xeber: () => pageXeber(),
    gomruk: () => pageGomruk(params), bank: () => pageBank(params), evez: () => pageEvez(params), emek: () => pageEmek(params), mz: () => pageMZ(params), kontragent: () => pageKontragent(params), firmalar: () => pageFirmalar(), yigim: () => pageYigim(params), saticilar: () => pageSaticilar(params), mehsullar: () => pageMehsullar(params), cek: () => pageCek(id), etiket: () => pageEtiket(),
    rasxodlar: () => pageRasxodlar(params), isciler: () => pageIsciler(params), odenisler: () => pageOdenisler(params), cixaris: () => pageCixaris(id, params),
    kassa: () => pageKassa(), sifarisler: () => pageSifarisler(params), hesabat: () => pageHesabat(params),
    teqvim: () => pageTeqvim(params), menfeet: () => pageMenfeet(), jurnal: () => pageJurnal(params), ayarlar: () => pageAyarlar(params),
    qebz: () => pageQebz(id), muqavile: () => pageMuqavile(id), admin: () => pageAdmin(params) }[p] || pagePanel;
  if (!S.magaza && !['admin', 'firmalar'].includes(p)) { location.hash = S.admin && !S.muhasibHesab ? '#/admin' : '#/firmalar'; return; }
  if (S.rol === 'kuryer' && !['yigim', 'qebz', 'menyu', 'firmalar'].includes(p)) { location.hash = '#/yigim'; return; }
  if (S.magaza && muhFirma() && !MUH_SEHIFE.includes(p) && !['jurnal', 'ayarlar', 'menyu', 'firmalar', 'admin', 'heyet'].includes(p)) { location.hash = '#/cedvel'; return; }
  if (S.magaza && muhFirma()) mTabQeyd(p, location.hash || '#/cedvel');
  if (S.magaza && !muhFirma() && MUH_SEHIFE.includes(p)) { location.hash = '#/panel'; return; }
  if (p === 'admin' && !S.admin) { location.hash = '#/panel'; return; }
  Promise.resolve(run()).catch(fail);
}
window.addEventListener('hashchange', route);

/* =====================================================================
   FİRMALARIM — bir hesabda bir neçə dükan (mühasib rejimi)
   ===================================================================== */
// Şifrə xanalarında "göstər" düyməsi — səhv yazılıbsa baxmaq üçün
const GOZ = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const GOZ_YOX = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.9 17.9A10.9 10.9 0 0 1 12 19c-7 0-11-7-11-7a20 20 0 0 1 5.1-5.9M9.9 4.2A10 10 0 0 1 12 4c7 0 11 7 11 7a20 20 0 0 1-3.2 4.2M1 1l22 22"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2"/></svg>';
function sifreGozler(root) {
  (root || document).querySelectorAll('input[type=password]:not([data-goz])').forEach(inp => {
    inp.dataset.goz = '1'; const w = document.createElement('span'); w.className = 'sifre-w'; inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sifre-goz'; b.title = 'Şifrəni göstər'; b.innerHTML = GOZ; w.appendChild(b);
    b.onclick = () => { const g = inp.type === 'password'; inp.type = g ? 'text' : 'password'; b.innerHTML = g ? GOZ_YOX : GOZ; b.title = g ? 'Şifrəni gizlət' : 'Şifrəni göstər'; inp.focus(); };
  });
}
new MutationObserver(() => sifreGozler()).observe(document.documentElement, { childList: true, subtree: true });
async function firmaSec(id) {
  if (S.magaza && S.magaza.id === id) { location.hash = window.innerWidth <= 760 ? '#/menyu' : (muhFirma() ? '#/cedvel' : '#/panel'); return; }
  if (S.deyisir) return; S.deyisir = true;
  const ad = (S.firmalar.find(x => x.id === id) || {}).ad || '';
  const ov = document.createElement('div'); ov.className = 'firma-ov'; ov.innerHTML = `<div><div class="spinner"></div>${esc(ad)} açılır…</div>`; document.body.appendChild(ov);
  try { await q(sb.rpc('magaza_sec', { m: id })); S.cache = {}; S.pos = null; YOL.length = 0; history.replaceState(null, '', SAYT()); await start(); }
  catch (er) { fail(er); }
  finally { S.deyisir = false; ov.remove(); }
}
/* ---------- İşçilər və icazələr: işçini bir dəfə yarat (istifadəçi adı + parol), müəssisələrə bağla ---------- */
const VEZIFE_AD = { admin: 'Admin', muhasib: 'Mühasib', operator: 'Operator', sahibkar: 'Direktor', kuryer: 'Kuryer', bloklu: 'Bloklanıb', gozleyir: 'Təsdiq gözləyir' };
const ICAZE_AD = [['elave', 'Əlavə etmək'], ['duzelis', 'Düzəliş etmək'], ['sil', 'Silmək'], ['hesabat', 'Hesabat, çıxarış, Excel / PDF'], ['ayarlar', 'Ayarlar'], ['istifadeciler', 'İstifadəçiləri idarə etmək']];
const icazeDef = (r, k) => r === 'admin' ? true : r === 'muhasib' ? ['elave', 'duzelis', 'sil', 'hesabat', 'ayarlar'].includes(k) : r === 'operator' ? ['elave', 'duzelis'].includes(k) : r === 'sahibkar' ? k === 'hesabat' : false;
const ISCI_DOMEN = '@isci.simplepos.az';
async function pageHeyet() {
  shell('firmalar', 'İşçilər və icazələr', 'İşçi bir dəfə yaradılır, sonra müəssisələrə bağlanır', `<button class="btn" onclick="location.hash='#/firmalar'">← Müəssisələr</button><button class="btn primary" id="isyeni">${ico('plus')}Yeni işçi</button>`);
  const [fl, il] = await Promise.all([q(sb.rpc('idare_firmalarim')), q(sb.rpc('isci_siyahi'))]);
  if (!fl.length) { $('#page').innerHTML = '<div class="card empty">İşçi əlavə etmək üçün ən azı bir müəssisədə admin olmalısınız.</div>'; $('#isyeni').style.display = 'none'; return; }
  $('#isyeni').onclick = () => hesabForm(null, fl);
  $('#page').innerHTML = il.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Ad</th><th>Giriş adı</th><th>Müəssisələr və vəzifə</th><th class="hide-m">Son giriş</th><th></th></tr></thead>
    <tbody>${il.map(x => `<tr><td><b>${esc(x.ad || '')}</b>${x.isci ? '' : '<div class="cell-sub">öz qeydiyyatı ilə</div>'}</td><td>${esc(x.login || x.email || '')}</td>
      <td>${(x.uzvluk || []).map(u => `<div style="margin:2px 0">${esc(u.ad)} — <span class="badge ${u.rol === 'admin' ? 'b-amber' : u.rol === 'bloklu' || u.rol === 'gozleyir' ? 'b-red' : 'b-blue'}">${VEZIFE_AD[u.rol] || u.rol}</span>${u.icazeler ? ' <span class="muted" style="font-size:12px">(xüsusi icazələr)</span>' : ''}</div>`).join('') || '<span class="muted">heç bir müəssisəyə bağlı deyil</span>'}</td>
      <td class="hide-m">${x.son_giris ? fd(String(x.son_giris).slice(0, 10)) : '—'}</td><td><button class="btn sm" data-hd="${x.user_id}">Düzəlt</button></td></tr>`).join('')}</tbody></table></div>`
    : '<div class="card empty">Hələ işçi yoxdur — "Yeni işçi" ilə yaradın.</div>';
  $$('[data-hd]').forEach(b => b.onclick = () => hesabForm(il.find(x => x.user_id === b.dataset.hd), fl));
}
function hesabForm(x, fl) {
  const uz = new Map(((x && x.uzvluk) || []).map(u => [u.m, u]));
  const ilk = (x && x.uzvluk && x.uzvluk[0]) || null, r0 = ilk ? ilk.rol : 'muhasib';
  const ic0 = k => ilk && ilk.icazeler && k in ilk.icazeler ? !!ilk.icazeler[k] : icazeDef(r0, k);
  const m = modal(x ? `İşçi: ${esc(x.ad || x.login || x.email)}` : 'Yeni işçi', `<form id="hf">
    <div class="row2"><div class="field"><label class="f">Ad Soyad</label><input class="in" name="ad" value="${esc((x && x.ad) || '')}" ${x ? 'disabled' : 'required'}></div>
      <div class="field"><label class="f">İstifadəçi adı (giriş üçün)</label><input class="in" name="login" value="${esc((x && (x.login || x.email)) || '')}" ${x ? 'disabled' : 'required'} placeholder="məs. elvin" autocapitalize="off"></div></div>
    ${!x || x.isci ? `<div class="field"><label class="f">${x ? 'Yeni parol (dəyişmək istəmirsinizsə boş saxlayın)' : 'Parol (ən azı 6 simvol)'}</label><input class="in" type="password" name="p" ${x ? '' : 'required minlength="6"'} autocomplete="new-password"></div>` : ''}
    <div class="field"><label class="f">Vəzifə</label><select class="in" name="r">${['admin', 'muhasib', 'operator', 'sahibkar', 'kuryer', 'bloklu'].map(k => `<option value="${k}" ${r0 === k ? 'selected' : ''}>${VEZIFE_AD[k]}</option>`).join('')}</select></div>
    <div class="field"><label class="f">Nələri edə bilər</label><div id="hic" style="display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;font-size:14px">${ICAZE_AD.map(([k, t]) => `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-ic="${k}" ${ic0(k) ? 'checked' : ''}> ${t}</label>`).join('')}</div>
      <div class="muted" style="font-size:12px;margin-top:4px">Baxmaq hər vəzifədə var. Vəzifəni dəyişəndə icazələr həmin vəzifəyə görə yenilənir, sonra istəsəniz dəyişin.</div></div>
    <div class="field"><label class="f">Hansı müəssisələrdə işləyəcək</label><div style="display:flex;flex-direction:column;gap:6px;font-size:14px;max-height:220px;overflow:auto">${fl.map(f => `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-fm="${f.id}" ${uz.has(f.id) ? 'checked' : ''}> ${esc(f.ad)} <span class="muted" style="font-size:12px">${esc(saheAd(f.sahe))}</span></label>`).join('')}</div></div></form>`,
    `<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="hok">Yadda saxla</button>`, true);
  const f = $('#hf', m);
  f.r.onchange = () => $$('[data-ic]', m).forEach(c => { c.checked = icazeDef(f.r.value, c.dataset.ic); });
  $('#hok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    const r = f.r.value, ic = {}; let ferq = false;
    $$('[data-ic]', m).forEach(c => { ic[c.dataset.ic] = c.checked; if (c.checked !== icazeDef(r, c.dataset.ic)) ferq = true; });
    const sec = $$('[data-fm]', m).filter(c => c.checked).map(c => +c.dataset.fm);
    if (!sec.length && !await tesdiq('Heç bir müəssisə seçilməyib — işçi heç nə görməyəcək. Davam edilsin?')) return;
    $('#hok', m).disabled = true;
    try {
      let u = x && x.user_id;
      if (!x) u = await q(sb.rpc('isci_yarat', { login: f.login.value.trim().toLowerCase(), parol: f.p.value, ad: f.ad.value.trim() }));
      else if (f.p && f.p.value) await q(sb.rpc('isci_parol', { u, parol: f.p.value }));
      for (const id of sec) await q(sb.rpc('isci_uzvluk', { u, m: id, r, ic: ferq ? ic : null }));
      for (const id of fl.map(z => z.id)) if (!sec.includes(id) && uz.has(id)) await q(sb.rpc('isci_uzvluk_sil', { u, m: id }));
      closeModal(); toast(x ? 'Yadda saxlanıldı' : `İşçi yaradıldı. Giriş: ${f.login.value.trim().toLowerCase()} + parol`, 6000); pageHeyet();
    } catch (er) { $('#hok', m).disabled = false; fail(er); }
  };
}
async function pageFirmalar() {
  const bas = 'Müəssisələr';
  shell('firmalar', bas, '', `<input class="in" id="fax" placeholder="Axtar: firma adı" style="width:200px">
    <button class="btn" id="fheyet" style="display:none">${ico('users')}İşçilər və icazələr</button><button class="btn" id="fqos">${ico('users')}Kodla qoşul</button><button class="btn primary" id="fyeni">${ico('plus')}Yeni müəssisə</button>`);
  $('#fyeni').onclick = firmaYeniModal; $('#fqos').onclick = firmaQosulModal;
  const list = await q(sb.rpc('firmalarim'));
  if (list.some(x => x.rol === 'admin')) { $('#fheyet').style.display = ''; $('#fheyet').onclick = () => { location.hash = '#/heyet'; }; }
  S.firmalar = list.map(x => ({ id: x.id, ad: x.ad, rol: x.rol })).sort((a, b) => a.ad.localeCompare(b.ad, 'az'));
  if (list.length > 1 || S.muhasibHesab) S.coxFirma = true;
  const rolAd = VEZIFE_AD;
  const abune = x => { const g = gunFerqi(x.abune_bitir);
    return x.dayandirilib ? '<span class="badge b-red">Dayandırılıb</span>' : g < 0 ? '<span class="badge b-red">Abunə bitib</span>'
      : g <= 7 ? `<span class="badge b-amber">Abunə: ${g} gün qalıb</span>` : `<span class="badge b-gray">Abunə: ${fd(x.abune_bitir)}</span>`; };
  const kart = x => x.rol === 'gozleyir' ? `<div class="firma-kart" style="opacity:.75;cursor:default" data-ad="${esc(azLow(x.ad))}"><div class="fk-bas"><div><b>${esc(x.ad)}</b><div class="cell-sub">${esc(saheAd(x.sahe))}</div></div><span class="badge b-amber">Təsdiq gözləyir</span></div>
    <div class="muted" style="font-size:13px;padding:10px 0">Qoşulma sorğunuz göndərilib. Müəssisənin mühasibi təsdiqləyəndən sonra burada açılacaq.</div></div>`
  : `<div class="firma-kart ${x.secili ? 'cari' : ''}" data-f="${x.id}" data-ad="${esc(azLow(x.ad))}">
    <div class="fk-bas"><div><b>${esc(x.ad)}</b><div class="cell-sub">${esc(saheAd(x.sahe))} · ${rolAd[x.rol] || esc(x.rol)}</div></div>${x.secili ? '<span class="badge b-green">Açıqdır</span>' : ''}</div>
    ${x.sahe === 'muhasibat' ? `<div class="fk-say"><div><span>Bu ay qaimə</span><b>${fmt(x.q_say)}</b></div><div><span>Təchizatçılara borc</span><b class="${num(x.kreditor) ? 'neg' : ''}">${man(x.kreditor)}</b></div>
      <div><span>Alıcıların borcu</span><b>${man(x.debitor)}</b></div><div><span></span><b></b></div></div>`
    : `<div class="fk-say"><div><span>Müştəri</span><b>${fmt(x.musteri)}</b></div><div><span>Qalıq borc</span><b>${man(x.borc)}</b></div>
      <div><span>Gecikən</span><b class="${num(x.gecikan) ? 'neg' : ''}">${fmt(x.gecikan)} nəfər · ${man(x.gecikmis_borc)}</b></div><div><span>Bu ay yığılıb</span><b>${man(x.bu_ay)}</b></div></div>`}
    <div class="fk-alt">${abune(x)}<span class="btn sm ${x.secili ? '' : 'primary'}">${x.secili ? 'Davam et' : 'Aç'} →</span></div></div>`;
  const cem = k => list.reduce((a, x) => a + num(x[k]), 0);
  $('.topbar .sub').textContent = list.length ? `${list.length} müəssisə` : '';
  $('#page').innerHTML = list.length ? `
    <div class="firma-grid">${list.map(kart).join('')}</div>`
    : `<div class="card empty" style="padding:40px 20px"><div style="font-size:17px;font-weight:600;margin-bottom:6px">Hələ müəssisəniz yoxdur</div>
       <div class="muted" style="margin-bottom:14px">"Yeni müəssisə" ilə öz müəssisənizi yaradın (${esc(S.sistem.sinaq_gun || '14')} gün pulsuz, sonra abunə). Başqa müəssisədə işləyirsinizsə, onun verdiyi dəvət kodu ilə qoşulma sorğusu göndərin.</div>
       <button class="btn primary" id="fyeni2">${ico('plus')}Yeni müəssisə</button> <button class="btn" id="fqos2">Kodla qoşul</button></div>`;
  if ($('#fyeni2')) { $('#fyeni2').onclick = firmaYeniModal; $('#fqos2').onclick = firmaQosulModal; }
  $$('[data-f]').forEach(d => d.onclick = () => firmaSec(+d.dataset.f));
  $('#fax').oninput = e => { const t = azLow(e.target.value); $$('.firma-kart').forEach(d => d.style.display = !t || d.dataset.ad.includes(t) ? '' : 'none'); };
}
function firmaYeniModal() {
  const sinaq = S.sistem.sinaq_gun || '14', qiy = S.sistem.qiymet || '';
  const m = modal('Yeni müəssisə', `<form id="nf">
    <div class="field"><label class="f">Müəssisənin adı *</label><input class="in" name="ad" required placeholder="məs. Kamran Elektronika MMC"></div>
    <div class="row2"><div class="field"><label class="f">Fəaliyyət sahəsi *</label><select class="in" name="sahe">${saheOpt(S.muhasibHesab ? 'muhasibat' : ((S.magaza && S.magaza.sahe) || 'mebel'))}</select></div>
      <div class="field"><label class="f">Hüquqi forma</label><select class="in" name="hf"><option value="">—</option><option>Hüquqi şəxs</option><option>Fərdi sahibkar</option></select></div></div>
    <div class="row2"><div class="field"><label class="f">VÖEN</label><input class="in" name="voen" inputmode="numeric" maxlength="10" placeholder="10 rəqəm"></div>
      <div class="field"><label class="f">Telefon</label><input class="in" name="tel" type="tel" placeholder="050 000 00 00"></div></div>
    <div class="row2"><div class="field"><label class="f">Direktor (rəhbər)</label><input class="in" name="dir" placeholder="Ad Soyad"></div>
      <div class="field"><label class="f">Ünvan</label><input class="in" name="unvan"></div></div>
    <div class="banner b-amber-bg" style="margin:4px 0 0;font-size:13px">Hər müəssisənin abunəsi ayrıca hesablanır: ilk ${esc(sinaq)} gün pulsuzdur${qiy ? `, sonra ${esc(qiy)}` : ', sonra abunə ödənilməlidir'}. Siz bu müəssisənin mühasibi olacaqsınız; başqalarını sonra Ayarlar → İstifadəçilər bölməsindən təsdiqləyib əlavə edə bilərsiniz.</div></form>`,
    `<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yarat</button>`, true);
  const f = $('#nf', m); setTimeout(() => f.ad.focus(), 50);
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    const voen = f.voen.value.replace(/\D/g, '');
    if (voen && voen.length !== 10) return toast('VÖEN 10 rəqəmdən ibarət olmalıdır');
    $('#ok', m).disabled = true;
    try {
      const id = await q(sb.rpc('firma_yarat', { ad: f.ad.value.trim(), telefon: f.tel.value.trim() || null, sahe: f.sahe.value }));
      // yeni müəssisə seçili olur — rekvizitləri onun ayarlarına yaz
      const R = { firma_adi: f.ad.value.trim(), firma_voen: voen, firma_telefon: f.tel.value.trim(), firma_unvan: f.unvan.value.trim(), direktor: f.dir.value.trim(), huquqi_forma: f.hf.value };
      const yaz = Object.entries(R).filter(([, v]) => v);
      for (const [k, v] of yaz) { const r = await q(sb.from('ayarlar').update({ deyer: v }).eq('magaza_id', id).eq('acar', k).select('acar')); if (!r.length) await q(sb.from('ayarlar').insert({ magaza_id: id, acar: k, deyer: v })); }
      closeModal(); toast('Müəssisə yaradıldı'); S.magaza = null; await firmaSec(id);
    } catch (er) { fail(er); $('#ok', m).disabled = false; }
  };
}
function firmaQosulModal() {
  const m = modal('Dəvət kodu ilə qoşul', `<form id="qf">
    <p class="muted" style="font-size:13px;margin-top:0">Kodu müəssisənin mühasibi verir. Kodu yazandan sonra sorğunuz müəssisəyə gedir; mühasib təsdiqləyib sizə rol verəndən sonra müəssisə burada açılacaq.</p>
    <div class="field"><label class="f">Dəvət kodu</label><input class="in" name="kod" maxlength="6" required style="text-transform:uppercase;letter-spacing:3px;font-weight:600" placeholder="ABC123"></div></form>`,
    `<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Qoşul</button>`);
  const f = $('#qf', m); setTimeout(() => f.kod.focus(), 50);
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    try { const ad = await q(sb.rpc('firma_qosul', { kod: f.kod.value.trim().toUpperCase() }));
      closeModal(); toast(`"${ad}" müəssisəsinə qoşulma sorğusu göndərildi — təsdiqlənəndən sonra açılacaq`, 5000); pageFirmalar().catch(fail);
    } catch (er) { fail(er); }
  };
}

/* =====================================================================
   YIĞIM SİYAHISI — kuryer / pul yığan üçün: kimdən, nə qədər, hansı ünvanda
   ===================================================================== */
async function pageYigim(params) {
  const nov = params.get('n') || 'bugun';
  const odeyer = canWrite() || S.rol === 'kuryer';
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
  shell('menyu', firmaAdi(), canWrite() ? '' : (S.rol === 'sahibkar' ? 'Direktor' : ''), '');
  const ad = Object.fromEntries((muhFirma() ? NAV_M : NAV).map(n => [n[0], n]));
  const kafel = k => { const n = ad[k]; return n ? `<a class="kafel" href="#/${k}">${ico(n[2])}<span>${n[1]}</span></a>` : ''; };
  $('#page').innerHTML = `
    ${canWrite() ? (muhFirma() ? `<div class="kafel-tez"><a class="btn primary" href="#/gelen">${ico('down')}Gələn qaimələr</a><a class="btn" href="#/geden">${ico('up')}Gedən qaimələr</a></div>`
      : `<div class="kafel-tez"><button class="btn primary" id="ts">${ico('plus')}Yeni satış</button><button class="btn" id="tm">${ico('plus')}Yeni müştəri</button></div>`) : ''}
    ${S.coxFirma && (!S.admin || S.ozFirma) ? `<div class="kafel-bas">Müəssisələr</div><div class="kafeller"><a class="kafel" href="#/firmalar">${ico('bina')}<span>Müəssisələr</span></a></div>` : ''}
    ${S.admin ? `<div class="kafel-bas">Sistem</div><div class="kafeller"><a class="kafel" href="#/admin">${ico('panel')}<span>Admin panel</span></a></div>` : ''}
    ${(muhFirma() ? NAVBOLME_M : NAVBOLME).map(([b, ks]) => `<div class="kafel-bas">${b}</div><div class="kafeller">${ks.map(kafel).join('')}</div>`).join('')}`;
  if ($('#ts')) $('#ts').onclick = () => { location.hash = '#/sat'; };
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

  const cedvel = `<table class="t"><thead><tr><th>Ay</th><th class="n">Satış</th><th class="n">Kassaya daxil</th><th class="n hide-m">Xərclər</th><th class="n hide-m">Maaş</th><th class="n hide-m">Direktor</th><th class="n">Xalis</th></tr></thead>
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
     ${kpi('Direktor götürmələri', A.sahib, B.sahib)}
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
  if ($('#yeni')) $('#yeni').onclick = () => { location.hash = '#/sat'; };

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
    if (mb > num(s.qaliq) + 0.001 && !await tesdiq(`Məbləğ qalıq borcdan (${fmt(s.qaliq)}) çoxdur. Yenə də yazılsın?`)) return;
    $('button', pf).disabled = true;
    try {
      const np = await q(sb.from('satis_odenisleri').insert({ satis_id: id, tarix: pf.t.value, mebleg: mb, usul: pf.u.value, qeyd: pf.q.value.trim() || null }).select().single());
      toast('Ödəniş yazıldı'); S.cache = {};
      if (await tesdiq('Ödəniş yazıldı. Müştəri üçün qəbz çap edilsin?')) location.hash = '#/qebz/' + np.id; else { refresh(); satisModal(id); }
    } catch (er) { fail(er); $('button', pf).disabled = false; }
  };
  if ($('#qyt', m)) $('#qyt', m).onclick = () => qaytarmaModal(s).catch(fail);
  q(sb.from('satis_qaytarmalari').select('*').eq('satis_id', id).order('tarix')).then(qs => {
    if (!qs.length || !$('#qytlist', m)) return;
    $('#qytlist', m).innerHTML = `<span class="muted">Qaytarmalar:</span> ${qs.map(x => `<span class="badge b-amber" title="${esc(x.qeyd || '')}">${fd(x.tarix)}: −${fmt(x.mebleg)}${num(x.geri_pul) ? ` (nağd ${fmt(x.geri_pul)})` : ''}${x.mallar ? ' · ' + esc(x.mallar) : ''}</span>`).join(' ')}`;
  }).catch(() => {});
  if ($('#cyaz', m)) $('#cyaz', m).onclick = async () => {
    if (!await tesdiq(`${man(yeniCer)} gecikmə cəriməsi müştərinin borcuna əlavə edilsin?`)) return;
    try { await q(sb.from('satis_cerimeleri').insert({ satis_id: id, tarix: today(), mebleg: yeniCer, qeyd: `${ch.gun} gün gecikmə, gecikən ${fmt(ch.gecikmis)} ₼` })); toast('Cərimə borca əlavə olundu'); refresh(); satisModal(id); } catch (er) { fail(er); }
  };
  $$('[data-csil]', m).forEach(b => b.onclick = async e => {
    e.preventDefault(); if (!await tesdiq('Bu cərimə silinsin?')) return;
    try { await q(sb.from('satis_cerimeleri').delete().eq('id', +b.dataset.csil)); toast('Cərimə silindi'); refresh(); satisModal(id); } catch (er) { fail(er); }
  });
  $$('[data-del]', m).forEach(b => b.onclick = async () => {
    if (!await tesdiq('Bu ödəniş silinsin?')) return;
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
    if (!await tesdiq(`${s.satis_no} satışı və onun bütün ödənişləri silinsin? Bu geri qaytarılmır.`)) return;
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
  const yenileSetir = await setirRedaktor(m, f, setirler, qal);
  const usulAl = usulIzle(m, f);
  qrafikIzle(f, true);
  if (pref && pref.setirler) {
    pref.setirler.forEach(x => setirler.push(x)); yenileSetir();
    if (pref.deyer != null) { f.d.value = pref.deyer; f.d.dispatchEvent(new Event('input')); }
    if (pref.qeyd) f.q.value = pref.qeyd; if (pref.tarix) f.t.value = pref.tarix;
    if (pref.isci) setTimeout(() => { f.sat.value = pref.isci; }, 400);
    if (pref.usul) { const b = $(`#usul [data-u="${pref.usul}"]`, m); if (b) b.click(); }
    qal();
  } else if (pref) {
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
      if (pref && pref.onSaved) { closeModal(); S.cache = {}; return pref.onSaved(ns); }
      closeModal(); toast(`Satış yazıldı: ${ns.satis_no}`); S.cache = {};
      if (await tesdiq(`Satış yazıldı: ${ns.satis_no}. Müştəri üçün çek çap edilsin?`)) location.hash = '#/cek/' + ns.id; else refresh();
    } catch (er) { fail(er); btn.disabled = false; }
  };
}

function localStorage_usul() { try { const u = localStorage.getItem('son_usul'); return USULLAR.includes(u) ? u : 'Borc'; } catch (_) { return 'Borc'; } }
function refresh() { S.cache = {}; route(); }

/* =====================================================================
   SATIŞ EKRANI (POS) — solda səbət, sağda məhsul kafelləri, aşağıda ödəniş
   ===================================================================== */
const POS_SEBET_SAY = 8;
const PERAKENDE = 'Pərakəndə müştəri';
function posSebetler() {
  const k = 'sebet_' + (S.magaza && S.magaza.id);
  if (!S.pos || S.pos.k !== k) {
    let arr = null; try { arr = JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) {}
    if (!Array.isArray(arr) || arr.length !== POS_SEBET_SAY) arr = Array.from({ length: POS_SEBET_SAY }, () => ({ s: [], m: null, q: '', qn: 1, e: '', o: '' }));
    S.pos = { k, arr, i: 0 };
  }
  return S.pos;
}
function posSaxla() { try { localStorage.setItem(S.pos.k, JSON.stringify(S.pos.arr)); } catch (_) {} }
async function perakendeMusteri() {
  const r = await q(sb.from('musteriler').select('id,ad').eq('ad', PERAKENDE).limit(1));
  if (r.length) return r[0].id;
  const n = await q(sb.from('musteriler').insert({ ad: PERAKENDE, qeyd: 'Kassadan nağd/POS satışlar üçün' }).select().single());
  return n.id;
}

async function pageSat(params) {
  if (!canWrite()) { shell('sat', 'Satış', '', ''); $('#page').innerHTML = '<div class="card empty">Satış yazmaq üçün mühasib hüququ və aktiv abunə lazımdır.</div>'; return; }
  shell('sat', 'Satış', '', '');
  document.querySelector('.main').classList.add('pos-main');
  const [mehs, mus] = await Promise.all([
    all(() => sb.from('v_mehsullar').select('id,ad,kod,kateqoriya,qiymet,qiymet2,qiymet3,qiymet4,maya,anbar_izle,anbar').eq('aktiv', true).order('ad')),
    S.cache.mus || (S.cache.mus = await all(() => sb.from('v_musteriler').select('id,ad,telefon,unvan,qaliq').order('id'))),
    ayarlar(),
  ]);
  const QA = qAdlari();
  const P = posSebetler();
  if (params.get('m')) { const mm = mus.find(x => x.id === +params.get('m')); if (mm) { const b = P.arr.findIndex(x => !x.s.length); P.i = b < 0 ? P.i : b; P.arr[P.i].m = { id: mm.id, ad: mm.ad, telefon: mm.telefon }; } }
  const kats = [...new Set(mehs.map(x => x.kateqoriya).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'az'));
  let kat = '', axt = '';
  const C = () => P.arr[P.i];
  const qy = (x, n) => mQ(x, n) != null ? mQ(x, n) : num(x.qiymet);
  const cem = () => C().s.reduce((a, x) => a + x.miqdar * x.qiymet, 0);
  const endirim = () => { const e = String(C().e || '').trim(); if (!e) return 0; const c = cem();
    const v = e.endsWith('%') ? c * num(e.slice(0, -1)) / 100 : num(e); return Math.min(c, Math.max(0, Math.round(v * 100) / 100)); };
  const yekun = () => Math.round((cem() - endirim()) * 100) / 100;

  $('#page').innerHTML = `<div class="posek">
    <section class="pos-sol card">
      <div class="pos-axtar"><div class="pos-inp">${ico('box')}<input id="sbk" placeholder="Barkod oxudun və ya məhsul adı yazın" autocomplete="off"></div>
        <button class="btn" id="scam" title="Kamera ilə oxu">📷</button><div class="pos-sug" id="ssug" style="display:none"></div></div>
      <div class="pos-mus" id="smus"></div>
      <div class="pos-sahe">
        <div><label class="f">Qeyd</label><input class="in" id="sqeyd" placeholder="Satışa dair qeyd"></div>
        <div><label class="f">Qiymət növü (F2)</label><select class="in" id="sqn">${QA.map((a, i) => `<option value="${i + 1}">${esc(a)}</option>`).join('')}</select></div>
        <div><label class="f">Tarix</label><input class="in" type="date" id="starix" value="${today()}"></div>
        <div><label class="f">Satıcı</label><select class="in" id="ssat"><option value="">— seçilməyib —</option></select></div>
      </div>
      <div class="pos-tabs" id="stabs"></div>
      <div class="pos-sebet" id="ssebet"></div>
      <div class="pos-alt">
        <div class="pos-od">
          <div><label class="f">Endirim (₼ və ya %)</label><input class="in" id="send" placeholder="məs. 50 və ya 10%"></div>
          <div><label class="f">Ödənilən</label><input class="in" id="sode" type="number" min="0" step="0.01" placeholder="0,00"></div></div>
        <div class="pos-tez">${[5, 10, 20, 50, 100, 200].map(v => `<button class="btn sm" data-ps="${v}">${v} ₼</button>`).join('')}<button class="btn sm" data-ps="tam">Tam</button></div>
        <div class="pos-toplam"><div><span>TOPLAM</span><small id="sinfo"></small></div><b id="scem">0,00 ₼</b></div>
      </div>
    </section>
    <section class="pos-sag card">
      <div class="pos-kat" id="skat"></div>
      <div class="pos-kafeller" id="skaf"></div>
    </section>
    <div class="pos-odenis">
      <button class="pod nagd" data-od="Nağd">${ico('cash')}<span>Nağd<small>F8</small></span></button>
      <button class="pod kart" data-od="POS">${ico('exp')}<span>POS<small>F9</small></span></button>
      <button class="pod borc" data-od="Borc">${ico('doc')}<span>Kredit<small>F10 · borca yaz</small></span></button>
      <button class="pod parca" data-od="Parçalı">${ico('wallet')}<span>Parçalı<small>F6 · nağd + kart</small></span></button>
    </div></div>`;

  // --- müştəri
  const musCiz = () => {
    const m = C().m;
    $('#smus').innerHTML = `<div class="pos-mchip">${m ? `<b>${esc(m.ad)}</b><small>${esc(m.telefon || '')}${(() => { const r = mus.find(z => z.id === m.id); return r && num(r.qaliq) > 0 ? ` · borcu ${fmt(r.qaliq)} ₼` : ''; })()}</small>`
        : `<b class="muted">${PERAKENDE}</b><small>Nağd və POS satışda müştəri seçmək mütləq deyil</small>`}</div>
      ${m ? '<button class="btn sm" id="smsil" title="Müştərini götür">×</button>' : ''}<button class="btn" id="smsec">${ico('users')}Müştəri seç</button>
      <div class="suggest" id="smsug" style="display:none"></div>`;
    $('#smsec').onclick = musSec;
    if ($('#smsil')) $('#smsil').onclick = () => { C().m = null; posSaxla(); musCiz(); };
  };
  const musSec = () => {
    const mm = modal('Müştəri seç', `<input class="in" id="mx" placeholder="Ad, telefon və ya ünvan…" autocomplete="off"><div id="ml" class="pos-mlist"></div>
      <div style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px"><b style="font-size:13.5px">Yeni müştəri</b>
        <div class="row2" style="margin-top:6px"><input class="in" id="nad" placeholder="Ad Soyad"><input class="in" id="ntel" placeholder="Telefon" inputmode="tel"></div>
        <button class="btn primary" id="nok" style="margin-top:8px">Əlavə et və seç</button></div>`);
    const ciz = () => { const t = azLow($('#mx', mm).value);
      const l = mus.filter(x => x.ad !== PERAKENDE && (!t || azLow([x.ad, x.telefon, x.unvan].join(' ')).includes(t))).slice(0, 40);
      $('#ml', mm).innerHTML = l.map(x => `<div data-id="${x.id}"><b>${esc(x.ad)}</b> <span class="muted">${esc(x.telefon || '')} ${esc(x.unvan || '')}</span>${num(x.qaliq) > 0 ? ` <span class="badge b-amber">borc ${fmt(x.qaliq)}</span>` : ''}</div>`).join('') || '<div class="muted">Tapılmadı</div>';
      $$('[data-id]', mm).forEach(d => d.onclick = () => { const x = mus.find(z => z.id === +d.dataset.id); C().m = { id: x.id, ad: x.ad, telefon: x.telefon }; posSaxla(); closeModal(); musCiz(); $('#sbk').focus(); }); };
    $('#mx', mm).oninput = ciz; ciz(); setTimeout(() => $('#mx', mm).focus(), 50);
    $('#nok', mm).onclick = async () => {
      const ad = $('#nad', mm).value.trim(); if (!ad) return toast('Müştərinin adını yazın');
      try { const n = await q(sb.from('musteriler').insert({ ad, telefon: $('#ntel', mm).value.trim() || null }).select().single());
        mus.push({ id: n.id, ad: n.ad, telefon: n.telefon, qaliq: 0 }); S.cache.musAll = null;
        C().m = { id: n.id, ad: n.ad, telefon: n.telefon }; posSaxla(); closeModal(); musCiz(); toast('Müştəri əlavə olundu');
      } catch (er) { fail(er); }
    };
  };

  // --- səbət
  const tabCiz = () => {
    $('#stabs').innerHTML = P.arr.map((x, i) => `<button class="${i === P.i ? 'on' : ''}" data-tb="${i}">${i + 1}${x.s.length ? `<i>${x.s.reduce((a, z) => a + z.miqdar, 0)}</i>` : ''}</button>`).join('');
    $$('[data-tb]').forEach(b => b.onclick = () => { P.i = +b.dataset.tb; hamisi(); });
  };
  const sebetCiz = () => {
    const s = C().s;
    $('#ssebet').innerHTML = s.length ? `<table class="pos-t"><tbody>${s.map((x, i) => `<tr>
        <td><div class="cell-main">${esc(x.ad)}</div>${x.uyari ? `<div class="cell-sub neg">${esc(x.uyari)}</div>` : ''}</td>
        <td class="pos-say"><button data-az="${i}">−</button><input type="number" min="1" step="1" value="${x.miqdar}" data-mq="${i}"><button data-ar="${i}">+</button></td>
        <td style="width:96px"><input class="in" type="number" min="0" step="0.01" value="${x.qiymet}" data-qy="${i}"></td>
        <td class="n" style="width:90px"><b>${fmt(x.miqdar * x.qiymet, 2)}</b></td>
        <td style="width:30px"><button class="btn sm danger" data-sl="${i}">×</button></td></tr>`).join('')}</tbody></table>`
      : `<div class="pos-bos">🛒<div>Səbət boşdur</div><small>Barkod oxudun və ya sağdan məhsula basın</small></div>`;
    const dey = (i, f) => { f(s[i]); posSaxla(); setTimeout(hesabla); };
    $$('[data-az]').forEach(b => b.onclick = () => dey(+b.dataset.az, x => { x.miqdar = Math.max(1, x.miqdar - 1); }));
    $$('[data-ar]').forEach(b => b.onclick = () => dey(+b.dataset.ar, x => { x.miqdar += 1; }));
    $$('[data-mq]').forEach(el => el.onchange = () => dey(+el.dataset.mq, x => { x.miqdar = Math.max(1, Math.round(num(el.value))); }));
    $$('[data-qy]').forEach(el => el.onchange = () => dey(+el.dataset.qy, x => { x.qiymet = Math.max(0, num(el.value)); }));
    $$('[data-sl]').forEach(b => b.onclick = () => { s.splice(+b.dataset.sl, 1); posSaxla(); hesabla(); });
  };
  const hesabla = () => {
    stokYoxla(); sebetCiz(); tabCiz();
    const c = cem(), e = endirim(), y = yekun(), od = num($('#sode').value);
    $('#scem').textContent = fmt(y, 2) + ' ₼';
    const say = C().s.reduce((a, x) => a + x.miqdar, 0);
    $('#sinfo').innerHTML = `${C().s.length} məhsul · ${fmt(say)} ədəd${e ? ` · endirim ${fmt(e, 2)} ₼` : ''}${od > y + 0.001 && y > 0 ? ` · <b class="pos">qaytarılacaq: ${fmt(od - y, 2)} ₼</b>` : od > 0 && od < y - 0.001 ? ` · <b class="neg">çatmır: ${fmt(y - od, 2)} ₼</b>` : ''}`;
  };
  const stokYoxla = () => C().s.forEach(x => { const p = mehs.find(z => z.id === x.mehsul_id);
    x.uyari = p && p.anbar_izle && x.miqdar > num(p.anbar) ? `Anbarda ${fmt(p.anbar)} ədəd var` : ''; });
  const elaveEt = p => {
    const s = C().s, v = s.find(z => z.mehsul_id === p.id);
    if (v) v.miqdar += 1; else s.push({ mehsul_id: p.id, ad: p.ad, miqdar: 1, qiymet: qy(p, C().qn || 1), maya: p.maya == null ? null : num(p.maya) });
    posSaxla(); hesabla();
    const tr = $$('#ssebet tr')[s.indexOf(v || s[s.length - 1])]; if (tr) { tr.classList.add('yeni'); tr.scrollIntoView({ block: 'nearest' }); }
  };

  // --- məhsul kafelləri
  const katCiz = () => {
    $('#skat').innerHTML = [['', `Hamısı <i>${mehs.length}</i>`], ...kats.map(k => [k, `${esc(k)} <i>${mehs.filter(x => x.kateqoriya === k).length}</i>`])]
      .map(([k, t]) => `<button class="${k === kat ? 'on' : ''}" data-kt="${esc(k)}">${t}</button>`).join('');
    $$('[data-kt]').forEach(b => b.onclick = () => { kat = b.dataset.kt; katCiz(); kafCiz(); });
  };
  const suzulmus = () => { const t = azLow(axt);
    return mehs.filter(x => (!kat || x.kateqoriya === kat) && (!t || azLow([x.ad, x.kod, x.kateqoriya].join(' ')).includes(t))); };
  const kafCiz = () => {
    const l = suzulmus(), n = C().qn || 1;
    $('#skaf').innerHTML = l.length ? l.slice(0, 300).map(x => `<button class="pkaf" data-p="${x.id}"><span class="pk-ad">${esc(x.ad)}</span>
        <span class="pk-alt">${x.anbar_izle ? `<i class="${num(x.anbar) > 0 ? '' : 'yox'}">${fmt(x.anbar)} əd.</i>` : '<i></i>'}<b>${fmt(qy(x, n), 2)}</b></span></button>`).join('')
      : `<div class="muted" style="padding:20px">${mehs.length ? 'Məhsul tapılmadı' : 'Hələ məhsul yoxdur — "Məhsullar" bölməsindən əlavə edin'}</div>`;
    $$('[data-p]', $('#skaf')).forEach(b => b.onclick = () => { elaveEt(mehs.find(z => z.id === +b.dataset.p)); $('#sbk').focus(); });
  };

  // --- sahələr
  const sahelerCiz = () => { $('#sqeyd').value = C().q || ''; $('#sqn').value = String(C().qn || 1); $('#send').value = C().e || ''; $('#sode').value = C().o || ''; };
  const hamisi = () => { sahelerCiz(); musCiz(); hesabla(); kafCiz(); };
  $('#sqeyd').oninput = e => { C().q = e.target.value; posSaxla(); };
  $('#send').oninput = e => { C().e = e.target.value; posSaxla(); hesabla(); };
  $('#sode').oninput = e => { C().o = e.target.value; posSaxla(); hesabla(); };
  const qnDeyis = n => {
    C().qn = n; $('#sqn').value = String(n);
    let yox = 0; C().s.forEach(x => { const p = mehs.find(z => z.id === x.mehsul_id); if (!p) return; if (mQ(p, n) == null && n > 1) yox++; x.qiymet = qy(p, n); });
    if (yox) toast(`${yox} məhsulda "${QA[n - 1]}" yoxdur — əsas qiymət qaldı`, 3000);
    posSaxla(); hesabla(); kafCiz();
  };
  $('#sqn').onchange = e => qnDeyis(+e.target.value);
  $$('[data-ps]').forEach(b => b.onclick = () => {
    const v = b.dataset.ps; C().o = v === 'tam' ? String(yekun()) : String(Math.round((num($('#sode').value) + num(v)) * 100) / 100);
    $('#sode').value = C().o; posSaxla(); hesabla();
  });
  saticiDoldur($('#ssat')).catch(() => {});

  // --- barkod / axtarış
  const bk = $('#sbk'), sug = $('#ssug');
  let sugL = [], sugI = 0;
  const sugGizle = () => { sug.style.display = 'none'; sugL = []; };
  const sugCiz = () => {
    const t = azLow(bk.value);
    if (!t) return sugGizle();
    sugL = mehs.filter(x => azLow([x.ad, x.kod, x.kateqoriya].join(' ')).includes(t))
      .sort((a, b) => (azLow(b.ad).startsWith(t) - azLow(a.ad).startsWith(t)) || a.ad.localeCompare(b.ad, 'az')).slice(0, 12);
    if (sugI >= sugL.length) sugI = 0;
    const n = C().qn || 1;
    sug.innerHTML = sugL.length ? sugL.map((x, i) => `<div class="${i === sugI ? 'on' : ''}" data-si="${i}"><span><b>${esc(x.ad)}</b><small>${esc([x.kateqoriya, x.kod].filter(Boolean).join(' · '))}</small></span>
        ${x.anbar_izle ? `<i class="${num(x.anbar) > 0 ? '' : 'yox'}">${fmt(x.anbar)} əd.</i>` : ''}<em>${fmt(qy(x, n), 2)} ₼</em></div>`).join('')
      : '<div class="bos">Məhsul tapılmadı</div>';
    sug.style.display = '';
    $$('[data-si]', sug).forEach(d => d.onmousedown = e => { e.preventDefault(); sec(sugL[+d.dataset.si]); });
  };
  const sec = x => { elaveEt(x); bk.value = ''; axt = ''; sugGizle(); kafCiz(); bk.focus(); };
  bk.oninput = () => { axt = bk.value; sugI = 0; sugCiz(); kafCiz(); };
  bk.onblur = () => setTimeout(() => { if (document.activeElement !== bk) sugGizle(); }, 150);
  bk.onfocus = () => { if (bk.value.trim()) sugCiz(); };
  const barkodla = t => {
    t = String(t || '').trim(); if (!t) return;
    const x = mehs.find(z => barkodBerabar(z, t)) || (sugL.length ? sugL[sugI] : null);
    if (x) return sec(x);
    toast(`"${t}" tapılmadı`, 2500); bk.select();
  };
  bk.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); barkodla(bk.value); }
    else if (e.key === 'ArrowDown' && sugL.length) { e.preventDefault(); sugI = (sugI + 1) % sugL.length; sugCiz(); }
    else if (e.key === 'ArrowUp' && sugL.length) { e.preventDefault(); sugI = (sugI - 1 + sugL.length) % sugL.length; sugCiz(); }
    else if (e.key === 'Escape') { bk.value = ''; axt = ''; sugGizle(); kafCiz(); }
  };
  $('#scam').onclick = () => kameraOxu(barkodla);

  // --- ödəniş
  const yoxla = () => { if (!C().s.length) { toast('Səbət boşdur'); return false; } return true; };
  const yaz = async (usul, ilkin, ipos) => {
    const c = C(), y = yekun();
    const mid = c.m ? c.m.id : await perakendeMusteri();
    const maya = c.s.every(x => x.maya != null) ? Math.round(c.s.reduce((a, x) => a + x.miqdar * num(x.maya), 0) * 100) / 100 : null;
    const ns = await q(sb.from('satislar').insert({ musteri_id: mid, tarix: $('#starix').value || today(), mal: c.s.map(x => x.ad + (x.miqdar > 1 ? ' ×' + x.miqdar : '')).join(', ').slice(0, 500),
      deyer: y, maya, qeyd: c.q.trim() || null, isci_id: $('#ssat').value ? +$('#ssat').value : null, odenis_usulu: usul, ilkin, ilkin_pos: ipos }).select().single());
    await q(sb.from('satis_mallari').insert(c.s.map(x => ({ satis_id: ns.id, mehsul_id: x.mehsul_id, ad: x.ad, miqdar: x.miqdar, qiymet: x.qiymet, maya: x.maya }))));
    return ns;
  };
  const bitdi = (ns, od) => {
    const y = yekun(), qay = od > y ? od - y : 0;
    P.arr[P.i] = { s: [], m: null, q: '', qn: 1, e: '', o: '' }; posSaxla(); S.cache = {};
    mehs.forEach(p => { const sat = ns._mallar && ns._mallar.find(z => z.mehsul_id === p.id); if (sat && p.anbar_izle) p.anbar = num(p.anbar) - sat.miqdar; });
    hamisi();
    const m = modal('Satış yazıldı', `<div class="pos-bitdi"><div class="muted">${esc(ns.satis_no || '')} · ${esc(ns.odenis_usulu)}</div><b>${fmt(y, 2)} ₼</b>
      ${qay > 0.001 ? `<div class="pos-qay">Qaytarılacaq: <b>${fmt(qay, 2)} ₼</b></div>` : ''}</div>`,
      `<button class="btn" id="bcek">${ico('print')}Çek çap et</button><button class="btn primary" id="byeni">Yeni satış (Enter)</button>`);
    $('#bcek', m).onclick = () => { closeModal(); location.hash = '#/cek/' + ns.id; };
    $('#byeni', m).onclick = () => { closeModal(); bk.focus(); };
    setTimeout(() => $('#byeni', m).focus(), 50);
  };
  let mesgul = false;
  const ode = async usul => {
    if (mesgul || !yoxla()) return;
    const y = yekun(), od = num($('#sode').value);
    if (usul === 'Borc') {
      return yeniSatis(C().m ? C().m.id : null, { setirler: C().s.map(x => ({ mehsul_id: x.mehsul_id, ad: x.ad, miqdar: x.miqdar, qiymet: x.qiymet, maya: x.maya })),
        deyer: y, qeyd: C().q, isci: $('#ssat').value, tarix: $('#starix').value, usul: 'Borc',
        onSaved: ns => { ns._mallar = C().s.map(x => ({ ...x })); bitdi(ns, 0); } });
    }
    if (usul === 'Parçalı') return parcaliModal(y);
    if (usul === 'Nağd' && od > 0 && od < y - 0.001) { toast(`Ödənilən ${fmt(od, 2)} ₼ azdır. Qalanı borca yazmaq üçün "Kredit / borc" seçin.`, 4500); return; }
    mesgul = true;
    try { const mal = C().s.map(x => ({ ...x })); const ns = await yaz(usul, y, usul === 'POS' ? y : 0); ns._mallar = mal; bitdi(ns, usul === 'Nağd' ? od : 0); }
    catch (er) { fail(er); } finally { mesgul = false; }
  };
  const parcaliModal = y => {
    const m = modal('Parçalı ödəniş', `<div class="pos-bitdi" style="margin-bottom:12px"><span class="muted">Ödəniləcək</span><b>${fmt(y, 2)} ₼</b></div>
      <div class="row2"><div class="field"><label class="f">Nağd</label><input class="in" type="number" min="0" step="0.01" id="pn"></div>
      <div class="field"><label class="f">Kartla (POS)</label><input class="in" type="number" min="0" step="0.01" id="pp"></div></div>
      <div class="muted" id="pinfo" style="font-size:13px"></div>`,
      `<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="pok">Satışı yaz</button>`);
    const pn = $('#pn', m), pp = $('#pp', m);
    const info = () => { const qal = Math.round((y - num(pn.value) - num(pp.value)) * 100) / 100;
      $('#pinfo', m).innerHTML = qal > 0.001 ? (C().m ? `Qalan <b class="neg">${fmt(qal, 2)} ₼</b> müştərinin borcuna yazılacaq` : `Qalan <b class="neg">${fmt(qal, 2)} ₼</b> — borca yazmaq üçün əvvəlcə müştəri seçin`)
        : qal < -0.001 ? `<b class="neg">${fmt(-qal, 2)} ₼ artıqdır</b>` : '<b class="pos">Tam ödənilir</b>'; };
    pn.oninput = () => { if (document.activeElement === pn && pp.value === '') {} info(); };
    pp.oninput = () => { if (pn.value === '') pn.value = Math.max(0, Math.round((y - num(pp.value)) * 100) / 100); info(); };
    info(); setTimeout(() => pp.focus(), 50);
    $('#pok', m).onclick = async () => {
      const n = num(pn.value), k = num(pp.value), cm = Math.round((n + k) * 100) / 100;
      if (cm > y + 0.001) return toast('Ödənilən məbləğ satışdan çoxdur');
      if (cm < y - 0.001 && !C().m) return toast('Borc qalırsa müştəri seçilməlidir');
      $('#pok', m).disabled = true;
      try { const mal = C().s.map(x => ({ ...x })); const ns = await yaz('Parçalı', cm, k); ns._mallar = mal; closeModal(); bitdi(ns, 0); }
      catch (er) { fail(er); $('#pok', m).disabled = false; }
    };
  };
  $$('[data-od]').forEach(b => b.onclick = () => ode(b.dataset.od));

  // --- klaviatura
  if (!S.posKlav) {
    S.posKlav = true;
    document.addEventListener('keydown', e => {
      if (!location.hash.startsWith('#/sat') || !S.posOde) return;
      if ($('#modal-root').innerHTML && !['Enter'].includes(e.key)) return;
      if (e.key === 'F8') { e.preventDefault(); S.posOde('Nağd'); }
      else if (e.key === 'F9') { e.preventDefault(); S.posOde('POS'); }
      else if (e.key === 'F10') { e.preventDefault(); S.posOde('Borc'); }
      else if (e.key === 'F6') { e.preventDefault(); S.posOde('Parçalı'); }
      else if (e.key === 'F2') { e.preventDefault(); S.posQn(); }
    });
  }
  S.posOde = ode; S.posQn = () => qnDeyis((C().qn || 1) % 4 + 1);

  katCiz(); hamisi(); bk.focus();
}

/* =====================================================================
   MÜHASİBAT FİRMASI — qaimələr, ƏDV əvəzləşməsi, idxal/ixrac, bank,
   əmək haqqı, mənfəət/zərər, kontragentlər (sahe = 'muhasibat')
   ===================================================================== */
const muhFirma = () => !!(S.magaza && S.magaza.sahe === 'muhasibat');
const NAV_M = [['cedvel', 'Əvəzləşmə', 'doc'], ['bugun', 'Bu gün', 'panel'], ['qaime', 'Qaimələr', 'doc'], ['akt', 'Alış aktları', 'clip'],
  ['odenis', 'Ödənişlər', 'exp'], ['bank', 'Bank hesabları', 'kassaI'], ['kontragent', 'Kontragentlər', 'users'],
  ['gomruk', 'Gömrük bəyanı', 'box'], ['edv', 'ƏDV hesabatı', 'chart'], ['depozit', 'ƏDV depozit', 'wallet'], ['emek', 'Əmək haqqı', 'worker'], ['hesab', 'Hesabatlar', 'trend'], ['xeber', 'Xəbərdarlıqlar', 'hist'],
  ['jurnal', 'Jurnal', 'hist'], ['ayarlar', 'Ayarlar', 'gear'], ['evez', 'ƏDV əvəzləşməsi', 'doc'], ['mz', 'Mənfəət / Zərər', 'trend']];
const NAVBOLME_M = [['Əsas', ['cedvel', 'kontragent', 'bank', 'emek']], ['Digər bölmələr', ['evez', 'mz', 'qaime', 'odenis', 'edv', 'hesab', 'bugun', 'akt', 'gomruk', 'depozit', 'xeber']], ['Sistem', ['ayarlar', 'jurnal']]];
const MUH_SEHIFE = ['cedvel', 'bugun', 'qaime', 'akt', 'odenis', 'bank', 'kontragent', 'gomruk', 'edv', 'depozit', 'emek', 'hesab', 'xeber', 'evez', 'mz', 'mpanel', 'gelen', 'geden'];
const r2 = v => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const aylarSiyahi = (n = 24) => { const d = new Date(); d.setDate(1); const o = [];
  for (let i = 0; i < n; i++) { o.push(iso(d).slice(0, 7) + '-01'); d.setMonth(d.getMonth() - 1); } return o; };
const ayOpt = (sec, hamisi) => (hamisi ? `<option value="">Bütün aylar</option>` : '') + aylarSiyahi().map(a => `<option value="${a}" ${a === sec ? 'selected' : ''}>${ayAdi(a)}</option>`).join('');
const ayinSonu = a => { const d = new Date(a + 'T00:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0); return iso(d); };
const kecenAy = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return iso(d); };
const qisaAd = t => String(t || '').replace(/MƏHDUD MƏSULİYYƏTLİ CƏMİYYƏTİ/gi, 'MMC').replace(/AÇIQ SƏHMDAR CƏMİYYƏTİ/gi, 'ASC').replace(/QAPALI SƏHMDAR CƏMİYYƏTİ/gi, 'QSC').replace(/\s+/g, ' ').trim();
const qaimeNo = r => [r.seriya, r.nomre].filter(Boolean).join(' ') || '—';
const odenisBadge = r => num(r.qaliq) <= 0.005 ? '<span class="badge b-green">Ödənilib</span>' : num(r.odenilib) > 0 ? '<span class="badge b-amber">Qismən</span>' : '<span class="badge b-gray">Ödənilməyib</span>';
const xlsxEndir = (ad, sheets) => { const a = document.createElement('a'); a.href = URL.createObjectURL(xlsxYarat(sheets)); a.download = ad.replace(/[^\wəöüğıçşƏÖÜĞIÇŞ .-]/g, '') + '.xlsx'; document.body.appendChild(a); a.click(); a.remove(); };
async function bankHesablari() { return S.cache.bh || (S.cache.bh = await q(sb.from('bank_hesablari').select('*').order('id'))); }

/* ---------- Panel ---------- */
async function pageMPanel() {
  shell('bugun', 'Bu gün', ayAdi(today()), '');
  const ay = ayBasi(today()), son = ayinSonu(ay);
  const [qm, od, bh, be, qo, gm, eh] = await Promise.all([
    all(() => sb.from('v_qaimeler').select('id,istiqamet,tarix,esas,edv,edvsiz,cem,odenilib,qaliq,kontragent,voen').order('id')),
    all(() => sb.from('v_qaime_odenisleri').select('istiqamet,tarix,mebleg,edv,hesab_id').gte('tarix', ay).lte('tarix', son).order('id')),
    bankHesablari(),
    all(() => sb.from('bank_emeliyyatlari').select('hesab_id,nov,mebleg').order('id')),
    all(() => sb.from('qaime_odenisleri').select('mebleg,hesab_id,qaime_id').order('id')),
    all(() => sb.from('gomruk').select('nov,tarix,edv').gte('tarix', ay).lte('tarix', son).order('id')),
    all(() => sb.from('emek_haqqi').select('hesablanan,dsmf_isveren,issizlik_isveren,tibbi_isveren').eq('ay', ay).order('id')),
  ]);
  const buAy = qm.filter(x => x.tarix >= ay && x.tarix <= son);
  const sum = (l, k) => l.reduce((a, x) => a + num(x[k]), 0);
  const g = buAy.filter(x => x.istiqamet === 'gelen'), d = buAy.filter(x => x.istiqamet === 'geden');
  const hesablanmis = sum(d, 'edv'), evez = sum(od.filter(x => x.istiqamet === 'gelen'), 'edv') + sum(gm.filter(x => x.nov === 'idxal'), 'edv');
  const kred = qm.filter(x => x.istiqamet === 'gelen' && num(x.qaliq) > 0), deb = qm.filter(x => x.istiqamet === 'geden' && num(x.qaliq) > 0);
  const qIstiq = new Map(qm.map(x => [x.id, x.istiqamet]));
  const bankQ = h => { let s = num(h.ilkin_qaliq);
    be.filter(x => x.hesab_id === h.id).forEach(x => { s += x.nov === 'Mədaxil' ? num(x.mebleg) : -num(x.mebleg); });
    qo.filter(x => x.hesab_id === h.id).forEach(x => { s += qIstiq.get(x.qaime_id) === 'geden' ? num(x.mebleg) : -num(x.mebleg); });
    return s; };
  const kpi = (l, v, c, cls = '') => `<div class="card kpi"><div class="lbl">${l}</div><div class="val ${cls}">${v}</div><div class="cmp">${c}</div></div>`;
  $('#page').innerHTML = `<div class="grid kpis">
      ${kpi('Gələn qaimələr — bu ay', man(sum(g, 'cem')), `${g.length} qaimə · ƏDV ${man(sum(g, 'edv'))}`)}
      ${kpi('Gedən qaimələr — bu ay', man(sum(d, 'cem')), `${d.length} qaimə · ƏDV ${man(sum(d, 'edv'))}`)}
      ${kpi('ƏDV: hesablanmış − əvəzləşən', man(hesablanmis - evez), `${man(hesablanmis)} − ${man(evez)}`, hesablanmis - evez > 0 ? 'neg' : 'pos')}
      ${kpi('Əmək haqqı fondu — bu ay', man(sum(eh, 'hesablanan')), `işəgötürən payları: ${man(sum(eh, 'dsmf_isveren') + sum(eh, 'issizlik_isveren') + sum(eh, 'tibbi_isveren'))}`)}
      ${kpi('Təchizatçılara borc', man(sum(kred, 'qaliq')), `${kred.length} ödənilməmiş qaimə`, 'neg')}
      ${kpi('Alıcıların borcu', man(sum(deb, 'qaliq')), `${deb.length} ödənilməmiş qaimə`)}
      ${kpi('Bank qalığı', man(bh.reduce((a, h) => a + bankQ(h), 0)), `${bh.length} hesab`)}
      ${kpi('Bu ay ödənilib (gələn)', man(sum(od.filter(x => x.istiqamet === 'gelen'), 'mebleg')), `o cümlədən ƏDV ${man(sum(od.filter(x => x.istiqamet === 'gelen'), 'edv'))}`)}</div>
    <div class="grid two" style="margin-top:16px">
      <div class="card" style="padding:0"><h3 style="padding:18px 20px 0">Ən çox borcumuz olan təchizatçılar</h3>${kontrSiyahi(kred)}</div>
      <div class="card" style="padding:0"><h3 style="padding:18px 20px 0">Bizə ən çox borcu olan alıcılar</h3>${kontrSiyahi(deb)}</div></div>`;
}
function kontrSiyahi(l) {
  const m = new Map(); l.forEach(x => { const k = x.voen || x.kontragent; const o = m.get(k) || { ad: x.kontragent || x.voen, voen: x.voen, s: 0, n: 0 }; o.s += num(x.qaliq); o.n++; m.set(k, o); });
  const top = [...m.values()].sort((a, b) => b.s - a.s).slice(0, 8);
  return top.length ? `<table class="t"><tbody>${top.map(o => `<tr><td><div class="cell-main">${esc(qisaAd(o.ad) || '—')}</div><div class="cell-sub">${esc(o.voen || '')} · ${o.n} qaimə</div></td><td class="n"><b>${fmt(o.s, 2)}</b></td></tr>`).join('')}</tbody></table>`
    : '<div class="empty muted" style="padding:20px">Borc yoxdur</div>';
}

/* ---------- Qaimələr ---------- */
async function pageQaimeler(ist, params) {
  const gelen = ist === 'gelen', w = canWrite();
  const ay = params.has('ay') ? params.get('ay') : '', yalniz = params.get('q') === '1';
  shell(ist, gelen ? 'Gələn qaimələr' : 'Gedən qaimələr', '', `<select class="in" id="qay" style="width:auto">${ayOpt(ay, true)}</select>
    <label style="display:flex;align-items:center;gap:6px;font-size:13.5px;white-space:nowrap"><input type="checkbox" id="qyal" ${yalniz ? 'checked' : ''}> Ödənilməmiş</label>
    ${w ? `<button class="btn" id="qidx">${ico('up')}e-taxes Excel-dən yüklə</button><button class="btn primary" id="qyeni">${ico('plus')}Yeni qaimə</button>` : ''}`);
  const yol = () => { const p = new URLSearchParams(); if ($('#qay').value) p.set('ay', $('#qay').value); if ($('#qyal').checked) p.set('q', '1'); location.hash = `#/${ist}?${p}`; };
  $('#qay').onchange = yol; $('#qyal').onchange = yol;
  if ($('#qidx')) $('#qidx').onclick = () => qaimeIdxal(ist);
  if ($('#qyeni')) $('#qyeni').onclick = () => qaimeForm(ist, null);
  const rows = await all(() => { let s = sb.from('v_qaimeler').select('*').eq('istiqamet', ist); if (ay) s = s.gte('tarix', ay).lte('tarix', ayinSonu(ay)); return s.order('tarix', { ascending: false }).order('id', { ascending: false }); });
  const list = yalniz ? rows.filter(r => num(r.qaliq) > 0.005) : rows;
  const sum = k => list.reduce((a, r) => a + num(r[k]), 0);
  $('.topbar .sub').textContent = `${list.length} qaimə · cəmi ${man(sum('cem'))} · qalıq ${man(sum('qaliq'))}`;
  $('#page').innerHTML = list.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Tarix</th><th>Seriya / №</th><th>VÖEN</th><th>${gelen ? 'Təchizatçı' : 'Alıcı'}</th>
      <th class="n">Əsas</th><th class="n">ƏDV</th><th class="n hide-m">ƏDV-siz</th><th class="n">Cəm</th><th class="n">Ödənilib</th><th class="n">Qalıq</th><th>Vəziyyət</th></tr></thead>
    <tbody>${list.map(r => `<tr class="click" data-q="${r.id}"><td>${fd(r.tarix)}</td><td>${esc(qaimeNo(r))}</td><td class="muted">${esc(r.voen || '')}</td><td>${esc(qisaAd(r.kontragent))}</td>
      <td class="n">${fmt(r.esas, 2)}</td><td class="n">${fmt(r.edv, 2)}</td><td class="n hide-m">${fmt(r.edvsiz, 2)}</td><td class="n"><b>${fmt(r.cem, 2)}</b></td>
      <td class="n">${fmt(r.odenilib, 2)}</td><td class="n"><b class="${num(r.qaliq) > 0.005 ? 'neg' : ''}">${fmt(r.qaliq, 2)}</b></td><td>${odenisBadge(r)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>${list.length} qaimə</td><td></td><td></td><td></td><td class="n">${fmt(sum('esas'), 2)}</td><td class="n">${fmt(sum('edv'), 2)}</td><td class="n hide-m">${fmt(sum('edvsiz'), 2)}</td>
      <td class="n">${fmt(sum('cem'), 2)}</td><td class="n">${fmt(sum('odenilib'), 2)}</td><td class="n">${fmt(sum('qaliq'), 2)}</td><td></td></tr></tfoot></table></div>`
    : `<div class="card empty" style="padding:40px 20px"><div style="font-size:17px;font-weight:600;margin-bottom:6px">Qaimə yoxdur</div>
       <div class="muted">e-taxes.gov.az-dan ${gelen ? 'gələn' : 'göndərilmiş'} e-qaimələrin siyahısını Excel kimi yükləyin və "e-taxes Excel-dən yüklə" düyməsi ilə bura köçürün.</div></div>`;
  $$('[data-q]').forEach(tr => tr.onclick = () => qaimeKart(rows.find(r => r.id === +tr.dataset.q)));
}

function qaimeForm(ist, r) {
  const gelen = ist === 'gelen';
  const m = modal(r ? 'Qaiməni düzəlt' : (gelen ? 'Yeni gələn qaimə' : 'Yeni gedən qaimə'), `<form id="qf">
    <div class="row2"><div class="field"><label class="f">${gelen ? 'Təchizatçının' : 'Alıcının'} VÖEN-i</label><input class="in" name="voen" value="${esc(r && r.voen || '')}" inputmode="numeric" maxlength="10"></div>
      <div class="field"><label class="f">${gelen ? 'Təchizatçı' : 'Alıcı'}</label><input class="in" name="kontr" value="${esc(r && r.kontragent || '')}" list="kontrlist"><datalist id="kontrlist"></datalist></div></div>
    <div class="row3"><div class="field"><label class="f">Seriya</label><input class="in" name="seriya" value="${esc(r && r.seriya || '')}"></div>
      <div class="field"><label class="f">Nömrə</label><input class="in" name="nomre" value="${esc(r && r.nomre || '')}"></div>
      <div class="field"><label class="f">Tarix</label><input class="in" type="date" name="tarix" value="${r ? r.tarix : today()}" required></div></div>
    <div class="row3"><div class="field"><label class="f">Əsas məbləğ (ƏDV-yə cəlb olunan)</label><input class="in" type="number" step="0.01" min="0" name="esas" value="${r ? r.esas : ''}" required></div>
      <div class="field"><label class="f">ƏDV <a href="#" id="edv18" style="font-weight:400;font-size:12px">18% hesabla</a></label><input class="in" type="number" step="0.01" min="0" name="edv" value="${r ? r.edv : ''}"></div>
      <div class="field"><label class="f">ƏDV-yə cəlb olunmayan</label><input class="in" type="number" step="0.01" min="0" name="edvsiz" value="${r && num(r.edvsiz) ? r.edvsiz : ''}"></div></div>
    <div class="field"><label class="f">Qeyd</label><input class="in" name="qeyd" value="${esc(r && r.qeyd || '')}"></div></form>`,
    `${r ? '<button class="btn danger" id="sil" style="margin-right:auto">Sil</button>' : ''}<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yadda saxla</button>`);
  const f = $('#qf', m);
  q(sb.from('kontragentler').select('voen,ad').order('ad')).then(l => {
    $('#kontrlist', m).innerHTML = l.map(x => `<option value="${esc(x.ad)}">${esc(x.voen || '')}</option>`).join('');
    f.voen.onchange = () => { const k = l.find(x => x.voen === f.voen.value.trim()); if (k && !f.kontr.value) f.kontr.value = k.ad; };
    f.kontr.onchange = () => { const k = l.find(x => x.ad === f.kontr.value.trim()); if (k && !f.voen.value) f.voen.value = k.voen || ''; };
  }).catch(() => {});
  $('#edv18', m).onclick = e => { e.preventDefault(); f.edv.value = r2(num(f.esas.value) * 0.18); };
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    const v = { istiqamet: ist, voen: f.voen.value.trim() || null, kontragent: f.kontr.value.trim() || null, seriya: f.seriya.value.trim() || null, nomre: f.nomre.value.trim() || null,
      tarix: f.tarix.value, esas: r2(f.esas.value), edv: r2(f.edv.value), edvsiz: r2(f.edvsiz.value), qeyd: f.qeyd.value.trim() || null };
    try {
      if (r) await q(sb.from('qaimeler').update(v).eq('id', r.id)); else await q(sb.from('qaimeler').insert(v));
      if (v.voen && v.kontragent) await kontragentSaxla([{ voen: v.voen, ad: v.kontragent }]);
      closeModal(); toast('Yadda saxlanıldı'); refresh();
    } catch (er) { fail(er); }
  };
  if ($('#sil', m)) $('#sil', m).onclick = async () => {
    if (!await tesdiq(`Qaimə ${qaimeNo(r)} və onun ödənişləri silinsin?`)) return;
    try { await q(sb.from('qaimeler').delete().eq('id', r.id)); closeModal(); toast('Silindi'); refresh(); } catch (er) { fail(er); }
  };
}
async function kontragentSaxla(list) {
  const var_ = await all(() => sb.from('kontragentler').select('voen').order('id'));
  const v = new Set(var_.map(x => x.voen)), yeni = [];
  list.forEach(x => { if (x.voen && !v.has(x.voen)) { v.add(x.voen); yeni.push({ voen: x.voen, ad: x.ad || x.voen }); } });
  for (const h of hisse(yeni, 500)) await q(sb.from('kontragentler').insert(h));
  return yeni.length;
}

// Bir və ya bir neçə qaiməni bir ödənişlə ödəmək: məbləğ köhnə qaimələrdən başlayaraq paylanır, sonuncu qismən ödənir.
// ƏDV hissəsi hər qaimənin öz ƏDV nisbəti ilə hesablanır (ƏDV-dən azad mal olan qaimədə ƏDV az, əsas çox olur).
async function topluOdenis(ist, voen0) {
  ist = ist === 'geden' ? 'geden' : 'gelen';
  const [qm, od, bh] = await Promise.all([
    all(() => sb.from('v_qaimeler').select('id,voen,kontragent,seriya,nomre,tarix,cem,edv,qaliq').eq('istiqamet', ist).eq('qaytarma', false).gt('qaliq', 0).order('tarix').order('id')),
    all(() => sb.from('v_qaime_odenisleri').select('qaime_id,edv').eq('istiqamet', ist).order('id')), bankHesablari()]);
  const pEdv = new Map(); od.forEach(o => pEdv.set(o.qaime_id, (pEdv.get(o.qaime_id) || 0) + num(o.edv)));
  qm.forEach(x => { x.qal = r2(x.qaliq); x.edvQal = Math.max(0, r2(num(x.edv) - (pEdv.get(x.id) || 0))); if (x.edvQal > x.qal) x.edvQal = x.qal; });
  const K = new Map(); qm.forEach(x => { const o = K.get(x.voen) || { voen: x.voen, ad: x.kontragent, say: 0, qal: 0 }; o.say++; o.qal += x.qal; o.ad = x.kontragent || o.ad; K.set(x.voen, o); });
  const kl = [...K.values()].sort((a, b) => azLow(qisaAd(a.ad)).localeCompare(azLow(qisaAd(b.ad)), 'az'));
  if (!kl.length) return toast(ist === 'gelen' ? 'Ödənilməmiş gələn qaimə yoxdur' : 'Ödənilməmiş gedən qaimə yoxdur');
  const m = modal(ist === 'gelen' ? 'Təchizatçıya ödəniş' : 'Alıcıdan ödəniş', `<form id="tf">
    <div class="row2"><div class="field"><label class="f">${ist === 'gelen' ? 'Təchizatçı' : 'Alıcı'}</label><select class="in" name="k">${kl.map(k => `<option value="${esc(k.voen)}" ${k.voen === voen0 ? 'selected' : ''}>${esc(qisaAd(k.ad))} · ${esc(k.voen || '')} — ${fmt(k.qal, 2)} ₼ (${k.say})</option>`).join('')}</select></div>
      <div class="field"><label class="f">Ödəniş tarixi</label><input class="in" type="date" name="t" value="${today()}" required></div></div>
    <div class="row3"><div class="field"><label class="f">Ödənilən məbləğ (₼)</label><input class="in" name="m" inputmode="decimal" required style="font-weight:600"></div>
      <div class="field"><label class="f">Bank hesabı</label><select class="in" name="h"><option value="">— seçilməyib —</option>${bh.filter(h => h.aktiv !== false).map(h => `<option value="${h.id}">${esc(h.bank)}${h.hesab_no ? ' · ' + esc(h.hesab_no.slice(-4)) : ''}</option>`).join('')}</select></div>
      <div class="field"><label class="f">Qeyd</label><input class="in" name="q" placeholder="məs. ödəniş tapşırığı №"></div></div>
    <div id="tlist"></div></form>`,
    `<button class="btn" id="tbpdf" style="margin-right:0">${ico('down')}Bank üçün siyahı (PDF)</button><button class="btn" id="tbxls" style="margin-right:auto">Excel</button><button class="btn" data-close>Ləğv et</button><button class="btn primary" id="tok">Ödənişi yaz</button>`, true);
  const f = $('#tf', m); let secim = new Set(), list = [], plan = [];
  const elave = async tip => {
    paylas(); const P = plan.filter(p => p.a > 0); if (!P.length) return toast('Ödəniləcək qaimə seçilməyib');
    const A = await ayarlar(), k = list[0], bizAd = A.firma_adi || firmaAdi(), bizV = A.firma_voen || '';
    const sat = P.map((p, i) => [i + 1, p.x.seriya || '', p.x.nomre || '', fd(p.x.tarix), r2(num(p.x.cem)), p.a, p.e]);
    const cA = r2(P.reduce((t, p) => t + p.a, 0)), cE = r2(P.reduce((t, p) => t + p.e, 0));
    const tey = `${P.length} qaimə üzrə ödəniş (${P.slice(0, 3).map(p => qaimeNo(p.x)).join(', ')}${P.length > 3 ? ' və s.' : ''}), siyahı əlavədədir`;
    const bas = ['№', 'Seriya', 'Nömrə', 'Qaimə tarixi', 'Qaimənin məbləği', 'Ödənilən məbləğ', 'o cümlədən ƏDV'];
    const fayl = `Qaimələr - ${qisaAd(k.kontragent)} - ${f.t.value}`.replace(/[\\/:*?"<>|]/g, '');
    if (tip === 'xls') {
      const blob = xlsxYarat([{ ad: 'Qaimələr', rows: [[`Ödəyici: ${bizAd}${bizV ? ', VÖEN ' + bizV : ''}`], [`Alan: ${k.kontragent || ''}, VÖEN ${k.voen || ''}`], [`Ödəniş tarixi: ${fd(f.t.value)}`, '', '', '', '', `Məbləğ: ${fmt(cA, 2)} ₼`], [], bas, ...sat, ['', '', '', 'Cəmi', r2(P.reduce((t, p) => t + num(p.x.cem), 0)), cA, cE]] }]);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fayl + '.xlsx'; document.body.appendChild(a); a.click(); a.remove(); return toast('Excel faylı yükləndi');
    }
    const w = window.open('', '_blank'); if (!w) return toast('Brauzer yeni pəncərəni bloklayıb — icazə verin', 5000);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(fayl)}</title><style>body{font:13px/1.45 Arial,sans-serif;color:#111;margin:28px}h2{font-size:16px;text-align:center;margin:0 0 16px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #444;padding:5px 7px}th{background:#eee;font-size:12px}td.n,th.n{text-align:right;white-space:nowrap}.r{display:flex;justify-content:space-between;gap:20px}.imza{margin-top:40px;display:flex;justify-content:space-between}@page{size:A4;margin:14mm}</style></head><body>
      <h2>Ödəniş tapşırığına əlavə<br><span style="font-weight:normal;font-size:13px">Ödənişin aid olduğu elektron qaimə-fakturaların siyahısı</span></h2>
      <div class="r"><div><b>Ödəyici:</b> ${esc(bizAd)}${bizV ? '<br><b>VÖEN:</b> ' + esc(bizV) : ''}</div><div style="text-align:right"><b>Ödəniş tarixi:</b> ${fd(f.t.value)}<br><b>Ödəniş məbləği:</b> ${fmt(cA, 2)} ₼</div></div>
      <div style="margin-top:8px"><b>Alan:</b> ${esc(k.kontragent || '')}<br><b>VÖEN:</b> ${esc(k.voen || '')}</div>
      <table><thead><tr>${bas.map((b, i) => `<th class="${i > 3 ? 'n' : ''}">${b}</th>`).join('')}</tr></thead><tbody>${sat.map(r => `<tr><td>${r[0]}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${r[3]}</td><td class="n">${fmt(r[4], 2)}</td><td class="n"><b>${fmt(r[5], 2)}</b></td><td class="n">${fmt(r[6], 2)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="5"><b>Cəmi: ${P.length} qaimə</b></td><td class="n"><b>${fmt(cA, 2)}</b></td><td class="n"><b>${fmt(cE, 2)}</b></td></tr></tfoot></table>
      <div class="imza"><div>Direktor: ______________ ${esc(A.direktor || '')}</div><div>M.Y.</div></div>
      <script>onload=()=>setTimeout(()=>print(),200)<\/script></body></html>`);
    w.document.close();
    try { await navigator.clipboard.writeText(tey); toast('Siyahı açıldı — "PDF kimi saxla" seçin. Təyinat mətni kopyalandı', 6000); } catch (e) { toast('Siyahı açıldı — "PDF kimi saxla" seçin', 5000); }
  };
  $('#tbpdf', m).onclick = () => elave('pdf'); $('#tbxls', m).onclick = () => elave('xls');
  const yukle = () => { list = qm.filter(x => x.voen === f.k.value); secim = new Set(list.map(x => x.id)); f.m.value = r2(list.reduce((a, x) => a + x.qal, 0)); paylas(); };
  const paylas = () => {
    let qalan = r2(idxalEded(f.m.value) || 0); plan = [];
    list.forEach(x => {
      let a = 0, e = 0;
      if (secim.has(x.id) && qalan > 0.004) { a = r2(Math.min(x.qal, qalan)); qalan = r2(qalan - a);
        e = Math.abs(a - x.qal) < 0.005 ? x.edvQal : r2(x.qal ? a * x.edvQal / x.qal : 0); }
      plan.push({ x, a, e });
    });
    const P = plan.filter(p => p.a > 0), cA = r2(P.reduce((s, p) => s + p.a, 0)), cE = r2(P.reduce((s, p) => s + p.e, 0));
    $('#tlist', m).innerHTML = `<div style="overflow-x:auto;max-height:46vh;overflow-y:auto;margin-top:6px;border:1px solid var(--line,#e6e8ee);border-radius:10px"><table class="t" data-flt="0" style="margin:0;font-size:13px"><thead><tr><th class="cb"></th><th>Tarix</th><th>Qaimə</th><th class="n">Qalıq</th><th class="n">Ödənilir</th><th class="n">o cümlədən ƏDV</th><th class="n">Əsas</th><th class="n">Sonra qalır</th></tr></thead>
      <tbody>${plan.map(p => `<tr style="${p.a > 0 ? '' : 'opacity:.55'}"><td class="cb"><input type="checkbox" data-t="${p.x.id}" ${secim.has(p.x.id) ? 'checked' : ''}></td><td>${fd(p.x.tarix)}</td><td style="white-space:nowrap">${esc(p.x.seriya || '')} ${esc(p.x.nomre || '')}</td>
        <td class="n">${fmt(p.x.qal, 2)}</td><td class="n"><b>${p.a ? fmt(p.a, 2) : '—'}</b>${p.a && p.a < p.x.qal - 0.004 ? ' <span class="badge b-amber">qismən</span>' : ''}</td><td class="n">${p.a ? fmt(p.e, 2) : ''}</td><td class="n">${p.a ? fmt(r2(p.a - p.e), 2) : ''}</td><td class="n">${fmt(r2(p.x.qal - p.a), 2)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td></td><td colspan="3">Cəmi ${P.length} qaimə</td><td class="n">${fmt(cA, 2)}</td><td class="n">${fmt(cE, 2)}</td><td class="n">${fmt(r2(cA - cE), 2)}</td><td></td></tr></tfoot></table></div>
      ${qalan > 0.004 ? `<div class="banner b-amber-bg" style="margin-top:8px">${fmt(qalan, 2)} ₼ seçilmiş qaimələrin qalığından artıqdır — yazılmayacaq.</div>` : ''}
      <div class="muted" style="font-size:12.5px;margin-top:6px">Məbləğ köhnə qaimələrdən başlayaraq paylanır, sonuncu qaimə qismən ödənir. ƏDV hər qaimənin öz ƏDV nisbəti ilə hesablanır — ƏDV-dən azad mal olan qaimədə ƏDV hissəsi az, əsas hissə çox olur. Hansı qaimənin ödənməsini istəmirsinizsə, işarəni götürün.</div>`;
    $$('[data-t]', m).forEach(c => c.onchange = () => { c.checked ? secim.add(+c.dataset.t) : secim.delete(+c.dataset.t); paylas(); });
  };
  f.k.onchange = yukle; f.m.oninput = () => { clearTimeout(paylas.t); paylas.t = setTimeout(paylas, 250); };
  yukle();
  $('#tok', m).onclick = async () => {
    if (!f.reportValidity()) return; paylas();
    const P = plan.filter(p => p.a > 0); if (!P.length) return toast('Ödəniləcək məbləğ yoxdur');
    const qeyd = f.q.value.trim() || `Ödəniş ${fmt(r2(idxalEded(f.m.value)), 2)} ₼ — ${qisaAd(list[0].kontragent)}`;
    $('#tok', m).disabled = true;
    try { await q(sb.from('qaime_odenisleri').insert(P.map(p => ({ qaime_id: p.x.id, tarix: f.t.value, mebleg: p.a, edv: p.e, hesab_id: f.h.value ? +f.h.value : null, qeyd }))));
      closeModal(); S.cache.bh = null; toast(`${P.length} qaiməyə ${fmt(r2(P.reduce((s, p) => s + p.a, 0)), 2)} ₼ ödəniş yazıldı`); refresh();
    } catch (er) { fail(er); $('#tok', m).disabled = false; }
  };
}
async function qaimeKart(r) {
  const gelen = r.istiqamet === 'gelen', w = canWrite();
  const [od, bh, qn, kn] = await Promise.all([q(sb.from('qaime_odenisleri').select('*').eq('qaime_id', r.id).order('tarix')), bankHesablari(),
    gelen ? q(sb.from('qaimeler').select('nov').eq('id', r.id).maybeSingle()) : null, gelen && r.voen ? q(sb.from('kontragentler').select('nov').eq('voen', r.voen).maybeSingle()) : null]);
  const qNov = qn && qn.nov, kNov = kn && kn.nov;
  const qal = r2(num(r.cem) - od.reduce((a, x) => a + num(x.mebleg), 0)), edvQal = r2(num(r.edv) - od.reduce((a, x) => a + num(x.edv), 0));
  const hAd = id => { const h = bh.find(x => x.id === id); return h ? `${h.bank}${h.hesab_no ? ' · ' + h.hesab_no.slice(-4) : ''}` : ''; };
  const m = modal(`Qaimə ${esc(qaimeNo(r))}`, `<div class="info"><div><span>${gelen ? 'Təchizatçı' : 'Alıcı'}</span><b>${esc(r.kontragent || '—')}</b><small class="muted">${esc(r.voen || '')}</small></div>
      <div><span>Tarix</span><b>${fd(r.tarix)}</b></div><div><span>Cəm</span><b>${man(r.cem)}</b><small class="muted">əsas ${fmt(r.esas, 2)} · ƏDV ${fmt(r.edv, 2)}${num(r.edvsiz) ? ' · ƏDV-siz ' + fmt(r.edvsiz, 2) : ''}</small></div></div>
    ${gelen ? `<div style="display:flex;align-items:center;gap:10px;margin:2px 0 12px;font-size:14px"><span>Növ (mənfəət-zərər üçün):</span>${w ? `<select class="in" id="qnov" style="width:auto;padding:5px 8px">
        <option value="">${kNov && kNov !== 'qarisiq' ? `Təchizatçıya görə — ${NOV_AD[kNov]}` : `Avtomatik — ${NOV_AD[novAvto(r.kontragent, r.qeyd)]}`}</option><option value="mal" ${qNov === 'mal' ? 'selected' : ''}>Mal</option><option value="xidmet" ${qNov === 'xidmet' ? 'selected' : ''}>Xidmət</option></select>` : `<b>${NOV_AD[qNov || (kNov !== 'qarisiq' && kNov) || novAvto(r.kontragent, r.qeyd)]}</b>`}</div>` : ''}
    <h3 style="margin:6px 0 8px">Ödənişlər</h3>
    ${od.length ? `<table class="t"><thead><tr><th>Tarix</th><th class="n">Məbləğ</th><th class="n">o cümlədən ƏDV</th><th>Bank</th><th>Qeyd</th>${w ? '<th></th>' : ''}</tr></thead><tbody>
      ${od.map(x => `<tr><td>${fd(x.tarix)}</td><td class="n">${fmt(x.mebleg, 2)}</td><td class="n">${fmt(x.edv, 2)}</td><td>${esc(hAd(x.hesab_id))}</td><td>${esc(x.qeyd || '')}</td>${w ? `<td><button class="btn sm danger" data-os="${x.id}">×</button></td>` : ''}</tr>`).join('')}</tbody></table>` : '<div class="muted">Hələ ödəniş yoxdur</div>'}
    <div style="margin:10px 0;font-size:14px">Qalıq: <b class="${qal > 0 ? 'neg' : 'pos'}">${man(qal)}</b> · ödənilməmiş ƏDV: <b>${man(Math.max(0, edvQal))}</b></div>
    ${w && qal > 0.005 ? `<form id="of" style="background:#faf4ea;border-radius:12px;padding:12px">
      <b>${gelen ? 'Ödəniş et' : 'Ödəniş al'}</b>
      <div class="row3" style="margin-top:8px"><div class="field"><label class="f">Tarix</label><input class="in" type="date" name="t" value="${today()}" required></div>
        <div class="field"><label class="f">Məbləğ</label><input class="in" type="number" step="0.01" min="0.01" name="m" value="${qal}" required></div>
        <div class="field"><label class="f">o cümlədən ƏDV</label><input class="in" type="number" step="0.01" min="0" name="e" value="${Math.max(0, edvQal)}"></div></div>
      <div class="row2"><div class="field"><label class="f">Bank hesabı</label><select class="in" name="h"><option value="">— nağd / seçilməyib —</option>${bh.filter(h => h.aktiv).map(h => `<option value="${h.id}">${esc(h.bank)}${h.hesab_no ? ' · ' + esc(h.hesab_no) : ''}${h.edv_depozit ? ' (ƏDV depozit)' : ''}</option>`).join('')}</select></div>
        <div class="field"><label class="f">Qeyd</label><input class="in" name="q"></div></div>
      <div class="muted" style="font-size:12.5px">ƏDV hissəsi məbləğə mütənasib hesablanır; son ödənişdə qalan ƏDV tam yazılır. İstəsəniz əl ilə dəyişin.</div></form>` : ''}`,
    `${w ? '<button class="btn" id="qed" style="margin-right:auto">Qaiməni düzəlt</button>' : ''}<button class="btn" data-close>Bağla</button>${w && qal > 0.005 ? '<button class="btn primary" id="oyaz">Ödənişi yaz</button>' : ''}`, true);
  const f = $('#of', m);
  if (f) f.m.oninput = () => { const v = num(f.m.value); f.e.value = Math.abs(v - qal) < 0.005 ? Math.max(0, edvQal) : r2(qal ? v * Math.max(0, edvQal) / qal : 0); };
  if ($('#qed', m)) $('#qed', m).onclick = () => { closeModal(); qaimeForm(r.istiqamet, r); };
  if ($('#qnov', m)) $('#qnov', m).onchange = async e => { try { await q(sb.from('qaimeler').update({ nov: e.target.value || null }).eq('id', r.id)); toast('Növ yadda saxlanıldı'); } catch (er) { fail(er); } };
  $$('[data-os]', m).forEach(b => b.onclick = async () => {
    if (!await tesdiq('Ödəniş silinsin?')) return;
    try { await q(sb.from('qaime_odenisleri').delete().eq('id', +b.dataset.os)); toast('Silindi'); closeModal(); qaimeKartYenile(r.id); } catch (er) { fail(er); }
  });
  if ($('#oyaz', m)) $('#oyaz', m).onclick = async () => {
    if (!f.reportValidity()) return;
    const v = num(f.m.value); if (v > qal + 0.005) return toast('Məbləğ qalıqdan çoxdur');
    if (num(f.e.value) > v) return toast('ƏDV hissəsi ödənişdən çox ola bilməz');
    try { await q(sb.from('qaime_odenisleri').insert({ qaime_id: r.id, tarix: f.t.value, mebleg: r2(v), edv: r2(f.e.value), hesab_id: f.h.value ? +f.h.value : null, qeyd: f.q.value.trim() || null }));
      toast('Ödəniş yazıldı'); closeModal(); S.cache.bh = null; refresh();
    } catch (er) { fail(er); }
  };
}
async function qaimeKartYenile(id) { const r = await q(sb.from('v_qaimeler').select('*').eq('id', id).maybeSingle()); refresh(); if (r) setTimeout(() => qaimeKart(r), 300); }

const LEGV_RE = /passiv|ləğv edildi/i;
async function qaimeIdxal(ist) {
  const gelen = ist === 'gelen';
  // harada qalmışdıq: sonuncu yükləmə vaxtı və bazadakı ən son qaimənin tarixi
  const [A, son] = await Promise.all([ayarlar(), q(sb.from('qaimeler').select('tarix').eq('istiqamet', ist).order('tarix', { ascending: false }).limit(1))]);
  const sonT = son[0] && son[0].tarix, sonY = A['son_yukleme_' + ist];
  const yer = sonT ? `<div class="banner b-amber-bg" style="margin:0 0 12px;font-size:13.5px;line-height:1.6">Ən son yüklənmiş qaimənin tarixi: <b>${fd(sonT)}</b>${sonY ? ` · sonuncu yükləmə: <b>${fd(sonY.slice(0, 10))} ${esc(sonY.slice(11, 16))}</b>` : ''}<br>
    e-taxes-dən <b>${fd(sonT)}</b> tarixindən (həmin gün daxil) bu günə qədər olanları endirib yükləyin — həmin gün sonradan gələnlər də düşsün. Artıq yüklənmiş qaimələr təkrar yazılmır, statusu dəyişənlər isə bildiriş kimi göstərilir.</div>` : '';
  idxalPencere({
    basliq: gelen ? 'Gələn e-qaimələri yüklə' : 'Gedən e-qaimələri yüklə',
    izah: `${yer}e-taxes.gov.az → E-qaimə → ${gelen ? 'Daxil olan' : 'Göndərilmiş'} qaimələr → "Excel" ilə yüklədiyiniz faylı olduğu kimi seçin (yuxarıdakı filtr sətirləri nəzərə alınmır). Eyni VÖEN + seriya + nömrə artıq varsa, təkrar yaradılmır — məbləği və statusu yenilənir. "Passiv" və "Ləğv edildi" statuslu qaimələr yüklənmir.`,
    saheler: [
      { k: 'voen', ad: gelen ? 'Təchizatçının VÖEN-i' : 'Alıcının VÖEN-i', lazim: true, ox: gelen ? ['vöen', 'voen', 'təqdimedəninvöeni', 'təqdimedənvöen', 'satıcınınvöeni', 'göndərəninvöeni'] : ['vöen', 'voen', 'alıcınınvöeni', 'alıcıvöen', 'qəbuledəninvöeni'] },
      { k: 'kontragent', ad: gelen ? 'Təchizatçının adı' : 'Alıcının adı', ox: gelen ? ['adı', 'ad', 'təqdimedəninadı', 'təqdimedən', 'satıcınınadı', 'satıcı'] : ['adı', 'ad', 'alıcınınadı', 'alıcı', 'qəbuledən'] },
      { k: 'seriya', ad: 'Seriya', ox: ['qaiməseriyası', 'seriya', 'seria', 'qaiməninseriyası', 'series'] },
      { k: 'nomre', ad: 'Nömrə', lazim: true, ox: ['qaimənömrəsi', 'nömrə', 'nomre', 'qaiməninnömrəsi', 'number'] },
      { k: 'tarix', ad: 'Tarix', lazim: true, tip: 'tarix', ox: ['qaimətarixi', 'tarix', 'qaiməntarixi', 'təqdimolunmatarixi', 'tarixi', 'date'] },
      { k: 'esas', ad: 'ƏDV-yə cəlb edilən', tip: 'eded', ox: ['ədvyəcəlbedilən', 'ədvyəcəlbedilənməbləğ', 'ədvyəcəlbolunanməbləğ', 'ədvyəcəlbolunan', 'əsasməbləğ', 'əsasdəyər'] },
      { k: 'edv', ad: 'ƏDV məbləği', tip: 'eded', ox: ['malınədvməbləği', 'ədvməbləği', 'ədvdəyəri', 'ədv'] },
      { k: 'umumi', ad: 'ƏDV-siz ümumi dəyər', tip: 'eded', ox: ['malınədvsizümumidəyəri', 'ədvsizümumidəyər', 'ədvsizdəyər', 'ədvsizməbləğ'] },
      { k: 'yekun', ad: 'Yekun məbləğ', tip: 'eded', ox: ['yekunməbləğ', 'yekun', 'cəmiməbləğ', 'cəmi'] },
      { k: 'status', ad: 'Status', ox: ['vəziyyəti', 'status', 'vəziyyət', 'qaiməninstatusu'] },
      { k: 'qeyd', ad: 'Əsas qeyd', ox: ['əsasqeyd', 'qeyd', 'açıqlama'] }],
    xam: true,
    numune: [['1300123451', 'Nümunə MMC', 'MT2611', '0012345', '05-11-2026', 1000, 180, 1000, 1180, 'Təsdiqləndi', 'Material'], ['9876543211', 'Test ASC', 'MT2611', '0012399', '12-11-2026', 2500, 450, 2600, 3050, 'Təsdiqləndi', '']],
    yaz: async (rows, ir) => {
      const var_ = await all(() => sb.from('qaimeler').select('id,voen,seriya,nomre,status,esas,edv,edvsiz,kontragent,tarix,xam,qaytarma').eq('istiqamet', ist).order('id'));
      const acar = x => [x.voen || '', azLow(x.seriya || ''), azLow(String(x.nomre || '')).replace(/^0+/, '')].join('|');
      const ix = new Map(var_.map(x => [acar(x), x])), gor = new Set();
      const yeni = [], yen = [], st = [], xamYaz = []; let buraxildi = 0, eyni = 0;
      rows.forEach(r => {
        // məbləğlər: yekun = əsas (ƏDV-yə cəlb edilən) + ƏDV + qalan hissə (cəlb edilməyən, azad, 0%, aksiz, yol vergisi)
        const edv = r2(r.edv || 0); let esas = r2(r.esas || 0);
        if (!esas && edv > 0 && r.umumi) esas = r2(r.umumi);
        const yekun = r.yekun != null ? r2(r.yekun) : r2((r.umumi != null ? num(r.umumi) : esas) + edv);
        const edvsiz = Math.max(0, r2(yekun - esas - edv));
        if (esas + edv > yekun + 0.01) esas = Math.max(0, r2(yekun - edv));
        const v = { istiqamet: ist, voen: String(r.voen).replace(/\D/g, '') || r.voen, kontragent: r.kontragent, seriya: r.seriya, nomre: r.nomre, tarix: r.tarix,
          esas, edv, edvsiz, status: r.status, qeyd: r.qeyd ? String(r.qeyd).slice(0, 500) : null, xam: r.__xam || null,
          qaytarma: Object.entries(r.__xam || {}).some(([h, d]) => /növ/i.test(h) && /qaytarılması/i.test(String(d || ''))) };
        const k = acar(v); if (gor.has(k)) return; gor.add(k);
        const x = ix.get(k);
        if (!x) { if (LEGV_RE.test(r.status || '')) buraxildi++; else yeni.push(v); return; }
        const stDeyisib = (r.status || '') !== (x.status || '');
        const meblegDeyisib = Math.abs(num(x.esas) - esas) > 0.005 || Math.abs(num(x.edv) - edv) > 0.005 || Math.abs(num(x.edvsiz) - edvsiz) > 0.005;
        if (stDeyisib) st.push([x.id, { status: v.status, kohne_status: x.status, status_deyisib: new Date().toISOString(), status_bax: false, xam: v.xam, qaytarma: v.qaytarma, ...(meblegDeyisib ? { esas, edv, edvsiz } : {}) }]);
        else if (meblegDeyisib || !!x.qaytarma !== v.qaytarma) yen.push([x.id, { esas, edv, edvsiz, xam: v.xam, qaytarma: v.qaytarma }]);
        else { eyni++; if (!x.xam && v.xam) xamYaz.push({ id: x.id, xam: v.xam }); }
      });
      const n = yeni.length + yen.length + st.length; let i = 0;
      for (const h of hisse(yeni, 500)) { await q(sb.from('qaimeler').insert(h)); i += h.length; ir(i, n); }
      for (const [id, v] of [...st, ...yen]) { await q(sb.from('qaimeler').update(v).eq('id', id)); i++; if (i % 10 === 0) ir(i, n); }
      for (const h of hisse(xamYaz, 300)) await q(sb.rpc('qaime_xam_yaz', { j: h }));
      const yenMebleg = yen.length;
      const k = await kontragentSaxla(rows.filter(r => !LEGV_RE.test(r.status || '')).map(r => ({ voen: String(r.voen).replace(/\D/g, '') || r.voen, ad: r.kontragent })));
      const sira = []; rows.forEach(r => Object.keys(r.__xam || {}).forEach(h => { if (!sira.includes(h)) sira.push(h); }));
      const A2 = await ayarlar(); if (sira.length) await ayarYaz(A2, 'xam_sira_' + ist, JSON.stringify(sira));
      await ayarYaz(A2, 'son_yukleme_' + ist, new Date(Date.now() + 4 * 36e5).toISOString().slice(0, 19).replace('T', ' ')); S.cache.ayar = null;
      try { localStorage.setItem('son_yukleme_' + S.magaza.id, new Date().toLocaleString('az-AZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })); } catch (_) {}
      return `${yeni.length} yeni qaimə əlavə olundu · ${eyni} qaimə artıq var idi${st.length ? ` · ${st.length} qaimənin statusu dəyişdi (Qaimələr bölməsində bildiriş)` : ''}${yenMebleg ? ` · ${yenMebleg} qaimənin məbləği yeniləndi` : ''}${buraxildi ? ` · ${buraxildi} passiv/ləğv qaimə buraxıldı` : ''}${k ? ` · ${k} yeni kontragent` : ''}`;
    },
  });
}

/* ---------- İdxal / İxrac ---------- */
async function pageGomruk(params) {
  const nov = params.get('n') === 'ixrac' ? 'ixrac' : 'idxal', ay = params.get('ay') || '', w = canWrite();
  shell('gomruk', 'İdxal / İxrac', 'Gömrük bəyannamələri', `<div class="seg" id="gn">${[['idxal', 'İdxal'], ['ixrac', 'İxrac']].map(([k, t]) => `<button data-n="${k}" class="${nov === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    <select class="in" id="gay" style="width:auto">${ayOpt(ay, true)}</select>${w ? `<button class="btn primary" id="gyeni">${ico('plus')}Yeni bəyannamə</button>` : ''}`);
  const yol = n => { location.hash = `#/gomruk?n=${n}${$('#gay').value ? '&ay=' + $('#gay').value : ''}`; };
  $$('#gn button').forEach(b => b.onclick = () => yol(b.dataset.n)); $('#gay').onchange = () => yol(nov);
  if ($('#gyeni')) $('#gyeni').onclick = () => gomrukForm(nov, null);
  const rows = await all(() => { let s = sb.from('gomruk').select('*').eq('nov', nov); if (ay) s = s.gte('tarix', ay).lte('tarix', ayinSonu(ay)); return s.order('tarix', { ascending: false }); });
  const sum = k => rows.reduce((a, r) => a + num(r[k]), 0);
  $('.topbar .sub').textContent = `${rows.length} bəyannamə · gömrük dəyəri ${man(sum('gomruk_deyeri'))}${nov === 'idxal' ? ` · ödənilmiş ƏDV ${man(sum('edv'))}` : ''}`;
  $('#page').innerHTML = rows.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Tarix</th><th>Bəyannamə №</th><th>${nov === 'idxal' ? 'Satıcı (xarici)' : 'Alıcı (xarici)'}</th><th>Ölkə</th>
      <th class="n">Valyuta ilə</th><th class="n">Məzənnə</th><th class="n">Gömrük dəyəri</th><th class="n">Rüsum</th><th class="n">ƏDV</th><th class="n">Digər</th><th class="n">Ödənilən cəm</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="click" data-g="${r.id}"><td>${fd(r.tarix)}</td><td>${esc(r.beyanname || '')}</td><td>${esc(r.terefdas || '')}</td><td>${esc(r.olke || '')}</td>
      <td class="n">${r.mebleg_valyuta != null ? fmt(r.mebleg_valyuta, 2) + ' ' + esc(r.valyuta || '') : ''}</td><td class="n">${r.mezenne != null ? fmt(r.mezenne, 4) : ''}</td>
      <td class="n"><b>${fmt(r.gomruk_deyeri, 2)}</b></td><td class="n">${fmt(r.rusum, 2)}</td><td class="n">${fmt(r.edv, 2)}</td><td class="n">${fmt(r.diger, 2)}</td><td class="n">${fmt(num(r.rusum) + num(r.edv) + num(r.diger), 2)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>${rows.length}</td><td></td><td></td><td></td><td></td><td></td><td class="n">${fmt(sum('gomruk_deyeri'), 2)}</td><td class="n">${fmt(sum('rusum'), 2)}</td><td class="n">${fmt(sum('edv'), 2)}</td><td class="n">${fmt(sum('diger'), 2)}</td><td class="n">${fmt(sum('rusum') + sum('edv') + sum('diger'), 2)}</td></tr></tfoot></table></div>`
    : `<div class="card empty">${nov === 'idxal' ? 'İdxal' : 'İxrac'} bəyannaməsi yoxdur</div>`;
  $$('[data-g]').forEach(tr => tr.onclick = () => w && gomrukForm(nov, rows.find(r => r.id === +tr.dataset.g)));
}
function gomrukForm(nov, r) {
  const m = modal(r ? 'Bəyannaməni düzəlt' : (nov === 'idxal' ? 'Yeni idxal bəyannaməsi' : 'Yeni ixrac bəyannaməsi'), `<form id="gf">
    <div class="row3"><div class="field"><label class="f">Tarix</label><input class="in" type="date" name="t" value="${r ? r.tarix : today()}" required></div>
      <div class="field"><label class="f">Bəyannamə №</label><input class="in" name="b" value="${esc(r && r.beyanname || '')}"></div>
      <div class="field"><label class="f">Ölkə</label><input class="in" name="o" value="${esc(r && r.olke || '')}"></div></div>
    <div class="field"><label class="f">${nov === 'idxal' ? 'Xarici satıcı' : 'Xarici alıcı'}</label><input class="in" name="tr" value="${esc(r && r.terefdas || '')}"></div>
    <div class="row3"><div class="field"><label class="f">Valyuta</label><select class="in" name="v">${['USD', 'EUR', 'RUB', 'TRY', 'GBP', 'CNY', 'AZN'].map(x => `<option ${(r ? r.valyuta : 'USD') === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="field"><label class="f">Məbləğ (valyuta ilə)</label><input class="in" type="number" step="0.01" min="0" name="mv" value="${r && r.mebleg_valyuta != null ? r.mebleg_valyuta : ''}"></div>
      <div class="field"><label class="f">Məzənnə</label><input class="in" type="number" step="0.0001" min="0" name="mz" value="${r && r.mezenne != null ? r.mezenne : ''}" placeholder="məs. 1.7"></div></div>
    <div class="row2"><div class="field"><label class="f">Gömrük dəyəri (AZN)</label><input class="in" type="number" step="0.01" min="0" name="gd" value="${r ? r.gomruk_deyeri : ''}" required></div>
      <div class="field"><label class="f">Gömrük rüsumu</label><input class="in" type="number" step="0.01" min="0" name="ru" value="${r ? r.rusum : ''}"></div></div>
    <div class="row2"><div class="field"><label class="f">ƏDV ${nov === 'idxal' ? '<a href="#" id="g18" style="font-weight:400;font-size:12px">18% hesabla</a>' : '(ixracda adətən 0)'}</label><input class="in" type="number" step="0.01" min="0" name="e" value="${r ? r.edv : ''}"></div>
      <div class="field"><label class="f">Digər gömrük yığımları</label><input class="in" type="number" step="0.01" min="0" name="d" value="${r ? r.diger : ''}"></div></div>
    <div class="field"><label class="f">Qeyd</label><input class="in" name="q" value="${esc(r && r.qeyd || '')}"></div></form>`,
    `${r ? '<button class="btn danger" id="sil" style="margin-right:auto">Sil</button>' : ''}<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yadda saxla</button>`);
  const f = $('#gf', m);
  const gd = () => { if (f.mv.value && f.mz.value) f.gd.value = r2(num(f.mv.value) * num(f.mz.value)); };
  f.mv.oninput = gd; f.mz.oninput = gd;
  if ($('#g18', m)) $('#g18', m).onclick = e => { e.preventDefault(); f.e.value = r2((num(f.gd.value) + num(f.ru.value)) * 0.18); };
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    const v = { nov, tarix: f.t.value, beyanname: f.b.value.trim() || null, olke: f.o.value.trim() || null, terefdas: f.tr.value.trim() || null, valyuta: f.v.value,
      mebleg_valyuta: f.mv.value === '' ? null : r2(f.mv.value), mezenne: f.mz.value === '' ? null : num(f.mz.value), gomruk_deyeri: r2(f.gd.value), rusum: r2(f.ru.value), edv: r2(f.e.value), diger: r2(f.d.value), qeyd: f.q.value.trim() || null };
    try { if (r) await q(sb.from('gomruk').update(v).eq('id', r.id)); else await q(sb.from('gomruk').insert(v)); closeModal(); toast('Yadda saxlanıldı'); refresh(); } catch (er) { fail(er); }
  };
  if ($('#sil', m)) $('#sil', m).onclick = async () => { if (!await tesdiq('Bəyannamə silinsin?')) return;
    try { await q(sb.from('gomruk').delete().eq('id', r.id)); closeModal(); toast('Silindi'); refresh(); } catch (er) { fail(er); } };
}

/* ---------- Bank hesabları ---------- */
const BANK_KAT = ['Alıcıdan daxilolma', 'Təchizatçıya ödəniş', 'Vergi ödənişi', 'Əmək haqqı', 'DSMF / sığorta', 'Kredit / borc', 'Təsisçi', 'Kassadan mədaxil', 'Bank xərci', 'Hesablar arası', 'Digər xərc', 'Digər gəlir'];
async function pageBank(params) {
  const w = canWrite(), dep = params.get('dep') === '1';
  shell(dep ? 'depozit' : 'bank', dep ? 'ƏDV depozit' : 'Bank hesabları', '', `${w ? `<button class="btn" id="bidx">${ico('up')}Çıxarışı Excel-dən yüklə</button><button class="btn" id="bhyeni">${ico('plus')}Yeni hesab</button><button class="btn primary" id="byeni">${ico('plus')}Əməliyyat</button>` : ''}`);
  const [bh, be, qo] = await Promise.all([bankHesablari(), all(() => sb.from('bank_emeliyyatlari').select('*').order('tarix').order('id')),
    all(() => sb.from('v_qaime_odenisleri').select('*').order('tarix').order('id')).then(l => l.filter(x => x.hesab_id != null))]);
  const sec = +(params.get('h') || (bh[0] && bh[0].id) || 0);
  if ($('#bhyeni')) $('#bhyeni').onclick = () => bankHesabForm(null);
  if ($('#byeni')) $('#byeni').onclick = () => bh.length ? bankEmForm(null, sec) : toast('Əvvəlcə bank hesabı əlavə edin');
  if ($('#bidx')) $('#bidx').onclick = () => bankIdxal(sec, bh);
  const hereket = h => {
    const l = [...be.filter(x => x.hesab_id === h.id).map(x => ({ t: x.tarix, nov: x.nov, m: num(x.mebleg), kat: x.kateqoriya, kontr: [x.kontragent, x.voen].filter(Boolean).join(' · '), tey: x.teyinat, em: x })),
      ...qo.filter(x => x.hesab_id === h.id).map(x => ({ t: x.tarix, nov: x.istiqamet === 'gelen' ? 'Məxaric' : 'Mədaxil', m: num(x.mebleg), kat: x.istiqamet === 'gelen' ? 'Təchizatçıya ödəniş' : 'Alıcıdan daxilolma',
        kontr: [x.kontragent, x.voen].filter(Boolean).join(' · '), tey: `Qaimə ${qaimeNo(x)}${num(x.edv) ? ` (ƏDV ${fmt(x.edv, 2)})` : ''}` }))]
      .sort((a, b) => a.t < b.t ? -1 : a.t > b.t ? 1 : 0);
    let s = num(h.ilkin_qaliq); l.forEach(x => { s += x.nov === 'Mədaxil' ? x.m : -x.m; x.q = s; });
    return { l, qaliq: s };
  };
  if (!bh.length) { $('#page').innerHTML = `<div class="card empty" style="padding:40px 20px"><div style="font-size:17px;font-weight:600;margin-bottom:6px">Bank hesabı yoxdur</div><div class="muted">Firmanın cari hesabını və ƏDV depozit hesabını əlavə edin.</div></div>`; return; }
  const H = bh.filter(h => !dep || h.edv_depozit).map(h => ({ h, ...hereket(h) })), cari = H.find(x => x.h.id === sec) || H[0];
  $('.topbar .sub').textContent = `Cəmi qalıq: ${man(H.reduce((a, x) => a + (x.h.valyuta === 'AZN' ? x.qaliq : 0), 0))}`;
  $('#page').innerHTML = `<div class="bank-kartlar">${H.map(x => `<a class="bank-kart ${x === cari ? 'on' : ''}" href="#/${dep ? 'depozit' : 'bank'}?h=${x.h.id}"><small>${esc(x.h.bank)}${x.h.edv_depozit ? ' · ƏDV depozit' : ''}</small>
      <b>${fmt(x.qaliq, 2)} ${esc(x.h.valyuta)}</b><span class="muted">${esc(x.h.hesab_no || '')}</span></a>`).join('')}</div>
    <div class="card" style="padding:0;margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px 0"><h3 style="margin:0">${esc(cari.h.bank)} — çıxarış</h3>${w ? '<button class="btn sm" id="bhed">Hesabı düzəlt</button>' : ''}</div>
    ${cari.l.length ? `<table class="t"><thead><tr><th>Tarix</th><th>Kateqoriya</th><th>Kontragent</th><th>Təyinat</th><th class="n">Mədaxil</th><th class="n">Məxaric</th><th class="n">Qalıq</th></tr></thead><tbody>
      <tr><td></td><td colspan="5" class="muted">İlkin qalıq${cari.h.ilkin_tarix ? ' — ' + fd(cari.h.ilkin_tarix) : ''}</td><td class="n">${fmt(cari.h.ilkin_qaliq, 2)}</td></tr>
      ${cari.l.map((x, i) => `<tr class="${x.em && w ? 'click' : ''}" data-bi="${i}"><td>${fd(x.t)}</td><td>${esc(x.kat || '')}</td><td>${esc(x.kontr || '')}</td><td>${esc(x.tey || '')}</td>
        <td class="n">${x.nov === 'Mədaxil' ? fmt(x.m, 2) : ''}</td><td class="n">${x.nov === 'Məxaric' ? fmt(x.m, 2) : ''}</td><td class="n"><b>${fmt(x.q, 2)}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><td>${cari.l.length} əməliyyat</td><td></td><td></td><td></td><td class="n">${fmt(cari.l.filter(x => x.nov === 'Mədaxil').reduce((a, x) => a + x.m, 0), 2)}</td><td class="n">${fmt(cari.l.filter(x => x.nov === 'Məxaric').reduce((a, x) => a + x.m, 0), 2)}</td><td class="n sabit">${fmt(cari.qaliq, 2)}</td></tr></tfoot></table>`
      : '<div class="empty muted" style="padding:24px">Əməliyyat yoxdur</div>'}</div>
    <p class="muted" style="font-size:12.5px">Qaimə ödənişlərində bank hesabı seçilibsə, onlar da çıxarışda avtomatik görünür.</p>`;
  if ($('#bhed')) $('#bhed').onclick = () => bankHesabForm(cari.h);
  $$('[data-bi]').forEach(tr => tr.onclick = () => { const x = cari.l[+tr.dataset.bi]; if (x.em && w) bankEmForm(x.em, cari.h.id); });
}
function bankHesabForm(h) {
  const m = modal(h ? 'Bank hesabını düzəlt' : 'Yeni bank hesabı', `<form id="bf">
    <div class="row2"><div class="field"><label class="f">Bank</label><input class="in" name="b" value="${esc(h && h.bank || '')}" required placeholder="məs. Kapital Bank"></div>
      <div class="field"><label class="f">Hesab nömrəsi (IBAN)</label><input class="in" name="n" value="${esc(h && h.hesab_no || '')}"></div></div>
    <div class="row3"><div class="field"><label class="f">Valyuta</label><select class="in" name="v">${['AZN', 'USD', 'EUR', 'RUB', 'TRY'].map(x => `<option ${(h ? h.valyuta : 'AZN') === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="field"><label class="f">İlkin qalıq</label><input class="in" type="number" step="0.01" name="q" value="${h ? h.ilkin_qaliq : 0}"></div>
      <div class="field"><label class="f">Qalıq tarixi</label><input class="in" type="date" name="t" value="${h && h.ilkin_tarix || ''}"></div></div>
    <label style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><input type="checkbox" name="d" ${h && h.edv_depozit ? 'checked' : ''}> ƏDV depozit hesabıdır</label>
    ${h ? `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="a" ${h.aktiv ? 'checked' : ''}> Aktivdir</label>` : ''}</form>`,
    `${h ? '<button class="btn danger" id="sil" style="margin-right:auto">Sil</button>' : ''}<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yadda saxla</button>`);
  const f = $('#bf', m);
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    const v = { bank: f.b.value.trim(), hesab_no: f.n.value.trim() || null, valyuta: f.v.value, ilkin_qaliq: r2(f.q.value), ilkin_tarix: f.t.value || null, edv_depozit: f.d.checked };
    if (h) v.aktiv = f.a.checked;
    try { if (h) await q(sb.from('bank_hesablari').update(v).eq('id', h.id)); else await q(sb.from('bank_hesablari').insert(v)); S.cache.bh = null; closeModal(); toast('Yadda saxlanıldı'); refresh(); } catch (er) { fail(er); }
  };
  if ($('#sil', m)) $('#sil', m).onclick = async () => { if (!await tesdiq('Hesab və onun əməliyyatları silinsin?')) return;
    try { await q(sb.from('bank_hesablari').delete().eq('id', h.id)); S.cache.bh = null; closeModal(); location.hash = '#/bank'; } catch (er) { fail(er); } };
}
async function bankEmForm(e, hesabId) {
  const bh = await bankHesablari();
  const m = modal(e ? 'Əməliyyatı düzəlt' : 'Yeni bank əməliyyatı', `<form id="ef">
    <div class="seg" id="en" style="display:flex;margin-bottom:12px">${['Mədaxil', 'Məxaric'].map(x => `<button type="button" data-n="${x}" class="${(e ? e.nov : 'Məxaric') === x ? 'on' : ''}" style="flex:1">${x}</button>`).join('')}</div>
    <input type="hidden" name="n" value="${e ? e.nov : 'Məxaric'}">
    <div class="row3"><div class="field"><label class="f">Hesab</label><select class="in" name="h">${bh.map(h => `<option value="${h.id}" ${(e ? e.hesab_id : hesabId) === h.id ? 'selected' : ''}>${esc(h.bank)}${h.hesab_no ? ' · ' + esc(h.hesab_no.slice(-4)) : ''}</option>`).join('')}</select></div>
      <div class="field"><label class="f">Tarix</label><input class="in" type="date" name="t" value="${e ? e.tarix : today()}" required></div>
      <div class="field"><label class="f">Məbləğ</label><input class="in" type="number" step="0.01" min="0.01" name="m" value="${e ? e.mebleg : ''}" required></div></div>
    <div class="row3"><div class="field"><label class="f">Kateqoriya</label><select class="in" name="k">${BANK_KAT.map(x => `<option ${e && e.kateqoriya === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="field"><label class="f">Kontragentin VÖEN-i</label><input class="in" name="v" value="${esc(e && e.voen || '')}"></div>
      <div class="field"><label class="f">Kontragent</label><input class="in" name="ka" value="${esc(e && e.kontragent || '')}"></div></div>
    <div class="field"><label class="f">Təyinat</label><input class="in" name="ty" value="${esc(e && e.teyinat || '')}"></div></form>`,
    `${e ? '<button class="btn danger" id="sil" style="margin-right:auto">Sil</button>' : ''}<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yadda saxla</button>`);
  const f = $('#ef', m);
  $$('#en button', m).forEach(b => b.onclick = () => { f.n.value = b.dataset.n; $$('#en button', m).forEach(x => x.classList.toggle('on', x === b)); });
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    const v = { hesab_id: +f.h.value, nov: f.n.value, tarix: f.t.value, mebleg: r2(f.m.value), kateqoriya: f.k.value, voen: f.v.value.trim() || null, kontragent: f.ka.value.trim() || null, teyinat: f.ty.value.trim() || null };
    try { if (e) await q(sb.from('bank_emeliyyatlari').update(v).eq('id', e.id)); else await q(sb.from('bank_emeliyyatlari').insert(v)); closeModal(); toast('Yadda saxlanıldı'); refresh(); } catch (er) { fail(er); }
  };
  if ($('#sil', m)) $('#sil', m).onclick = async () => { if (!await tesdiq('Əməliyyat silinsin?')) return;
    try { await q(sb.from('bank_emeliyyatlari').delete().eq('id', e.id)); closeModal(); toast('Silindi'); refresh(); } catch (er) { fail(er); } };
}
// Bank çıxarışı (Kapital Bank və s.): əməliyyatları yükləyir, təyinatdakı qaimə nömrələrinə görə ödənişləri qaimələrə özü bağlayır
const BANK_KODLARI = { AIIB: 'Kapital Bank', IBAZ: 'ABB', PAHA: 'PAŞA Bank', UBAZ: 'Unibank', CAPN: 'Xalq Bank', BRES: 'Bank Respublika', ACAB: 'AccessBank', NABZ: 'Bank of Baku', RZBA: 'Rabitəbank', AZER: 'Azər Türk Bank', YAPI: 'Yapı Kredi', VTBA: 'VTB', TURA: 'TuranBank', AGRB: 'Gunay Bank' };
function qaimeRefler(t) {
  const T = String(t || '').toUpperCase().replace(/([A-Z]{2}\d{4})(\d{6,9})/g, '$1 $2');
  const refs = []; let ser = null;
  T.split(/[\s,;]+/).forEach(w => { if (/^[A-Z]{2}\d{4}$/.test(w)) ser = w; else if (ser && /^\d{6,9}$/.test(w)) refs.push([ser, w.replace(/^0+/, '')]); });
  const aralig = /\bDEN\b/.test(T) && /\bDEK\b/.test(T) && refs.length === 2;
  const tm = T.match(/(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})/);
  return { refs, aralig, tarix: tm ? [`${tm[3]}-${tm[2]}-${tm[1]}`, `${tm[6]}-${tm[5]}-${tm[4]}`] : null };
}
// Təyinata 130 simvol sığdığı üçün qaimə nömrələri tam yazılmır — ödənişlər qaimələrə avtomatik bağlanmır; ödəniş vəziyyəti əvəzləşmə faylından gəlir
const BANK_AVTO_BAGLA = false;
function bankIdxal(hesabId, bh) {
  let ust = [];
  idxalPencere({
    basliq: 'Bank çıxarışını yüklə',
    izah: 'İnternet-bankdan çıxarışı Excel kimi yükləyib olduğu kimi seçin (Kapital Bank formatı tam tanınır). Hesab nömrəsinə görə bank hesabı tapılır və ya yaradılır. Əməliyyatlar kateqoriyalara özü bölünür (bank xərci, vergi, hesablar arası, kassadan mədaxil, təchizatçıya ödəniş). Qaimələrin ödəniş vəziyyəti "Əvəzləşmə faylı"ndan götürülür. Eyni sənəd nömrəli əməliyyat təkrar yüklənmir.',
    ust: r => { ust = r; },
    saheler: [{ k: 'tarix', ad: 'Tarix', lazim: true, tip: 'tarix', ox: ['tarix', 'əməliyyattarixi', 'date', 'valyutalaşmatarixi'] },
      { k: 'sened', ad: 'Sənədin nömrəsi', ox: ['sənədinnömrəsi', 'sənəd', 'sənədnömrəsi', 'referans'] },
      { k: 'eks', ad: 'Əks hesab (hesab / ad / VÖEN)', ox: ['əkshesabınnömrəsiadıvəvöeni', 'əkshesab', 'qarşıtərəf', 'kontragent'] },
      { k: 'mebleg', ad: 'Məbləğ (±)', tip: 'eded', ox: ['azndəyəri', 'məbləğ', 'mebleg', 'amount'] },
      { k: 'medaxil', ad: 'Mədaxil (kredit)', tip: 'eded', ox: ['mədaxil', 'medaxil', 'kredit', 'daxilolma', 'credit'] },
      { k: 'mexaric', ad: 'Məxaric (debet)', tip: 'eded', ox: ['məxaric', 'mexaric', 'debet', 'debit', 'silinmə'] },
      { k: 'voen', ad: 'VÖEN (ayrıca sütundursa)', ox: ['vöen', 'voen'] },
      { k: 'teyinat', ad: 'Təyinat', ox: ['təyinat', 'teyinat', 'ödənişintəyinatı', 'açıqlama', 'description'] }],
    numune: [['05.01.2026', '27225598585', 'AZ27IBAZ40060019445923365262 / CAHAN TICARAT MMC / 0200680041', -622.92, '', '', '', 'MT2601 10071114 EQ ESAS ODEN']],
    yaz: async (rows, ir) => {
      // --- başlıqdan: hesab nömrəsi, ilkin/son qalıq, VÖEN, dövr
      const U = {}; ust.forEach(r => { for (let i = 0; i < r.length - 1; i += 2) { const k = normBas(r[i]); if (k) U[k] = String(r[i + 1] == null ? '' : r[i + 1]).trim(); } });
      const tap = (...a) => { for (const k of Object.keys(U)) if (a.some(x => k.startsWith(x))) return U[k]; return ''; };
      const iban = tap('hesabnömrəsi').replace(/\s/g, ''), val = tap('hesabınvalyutası') || 'AZN', ilkin = idxalEded(tap('ilkinqalıq')), son = idxalEded(tap('sonqalıq'));
      const voenOz = tap('vöen').replace(/\D/g, ''), dovr = tap('dövrüçün').match(/(\d{2})\/(\d{2})\/(\d{4})/);
      const A = await ayarlar(); if (voenOz && !A.firma_voen) { await ayarYaz(A, 'firma_voen', voenOz); S.cache.ayar = null; }
      let hesablar = await q(sb.from('bank_hesablari').select('*').order('id'));
      let h = iban ? hesablar.find(x => (x.hesab_no || '').replace(/\s/g, '') === iban) : hesablar.find(x => x.id === hesabId);
      if (!h) {
        const bank = (iban && BANK_KODLARI[iban.slice(4, 8)]) || (hesablar.find(x => x.id === hesabId) || {}).bank || 'Bank';
        h = await q(sb.from('bank_hesablari').insert({ bank, hesab_no: iban || null, valyuta: val, ilkin_qaliq: ilkin != null && !isNaN(ilkin) ? ilkin : 0, ilkin_tarix: dovr ? `${dovr[3]}-${dovr[2]}-${dovr[1]}` : null }).select().single());
      }
      S.cache.bh = null;
      // --- mövcud məlumat: təkrar sənədlər, qaimələr və onların qalıqları
      const [kb, ko, qm, od] = await Promise.all([all(() => sb.from('bank_emeliyyatlari').select('sened').order('id')), all(() => sb.from('qaime_odenisleri').select('sened').order('id')),
        all(() => sb.from('qaimeler').select('id,istiqamet,voen,seriya,nomre,tarix,esas,edv,edvsiz').order('tarix').order('id')), all(() => sb.from('qaime_odenisleri').select('qaime_id,mebleg,edv').order('id'))]);
      const kohne = new Set([...kb, ...ko].map(x => x.sened).filter(Boolean));
      const Q = new Map(qm.map(x => [x.id, { ...x, cem: num(x.esas) + num(x.edv) + num(x.edvsiz), pb: 0, pe: 0 }]));
      od.forEach(o => { const x = Q.get(o.qaime_id); if (x) { x.pe += num(o.edv); x.pb += num(o.mebleg) - num(o.edv); } });
      const bazaQal = x => r2(x.cem - num(x.edv) - x.pb), edvQal = x => r2(num(x.edv) - x.pe);
      const qaimeTap = (ist, voen, ser, no) => qm.find(x => x.istiqamet === ist && x.voen === voen && String(x.seriya || '').toUpperCase() === ser && String(x.nomre || '').replace(/^0+/, '') === no);
      const emel = [], oden = []; let bagli = 0, fifo = 0, tekrar = 0, qalan = 0;
      rows.forEach(r => {
        const sened = r.sened ? String(r.sened).trim() : null;
        if (sened && kohne.has(sened)) { tekrar++; return; } if (sened) kohne.add(sened);
        let m = r.mebleg != null ? num(r.mebleg) : num(r.medaxil) - num(r.mexaric); if (!m) return;
        const nov = m > 0 ? 'Mədaxil' : 'Məxaric'; m = r2(Math.abs(m));
        const p = String(r.eks || '').split('/').map(x => x.trim());
        const voen = (r.voen ? String(r.voen) : (p.length >= 3 ? p[p.length - 1] : '')).replace(/\D/g, ''), kontr = p.length >= 3 ? p.slice(1, -1).join(' / ') : (p[0] || null), tey = String(r.teyinat || '').trim();
        const T = tey.toUpperCase(), R = qaimeRefler(tey), edvOd = /^EDV\s*ODEN/.test(T), esasOd = !edvOd && (/ESAS\s*ODE|QAIME|EQF|\bEQ\b/.test(T) || R.refs.length > 0);
        let kat = nov === 'Mədaxil' ? 'Digər gəlir' : 'Digər xərc';
        if (/XİDMƏT HAQQI|XIDMET HAQQI/.test(T) || /xidmət haqqı/i.test(tey)) kat = 'Bank xərci';
        else if (/VID=\d+|VERGI XIDM|VERGİ XİDM/.test(T)) kat = 'Vergi ödənişi';
        else if ((voenOz && voen === voenOz) || /OZ HESABLARIM/.test(T)) kat = 'Hesablar arası';
        else if (/KAPITAL BANK/i.test(kontr || '') && nov === 'Mədaxil') kat = 'Kassadan mədaxil';
        else if (edvOd || esasOd) kat = nov === 'Məxaric' ? 'Təchizatçıya ödəniş' : 'Alıcıdan daxilolma';
        // --- qaiməyə bağlama
        let qal = m;
        if (BANK_AVTO_BAGLA && (edvOd || esasOd) && voen && voen !== voenOz) {
          const ist = nov === 'Məxaric' ? 'gelen' : 'geden';
          let hedef = [];
          if (R.aralig) { const a = qaimeTap(ist, voen, ...R.refs[0]), b = qaimeTap(ist, voen, ...R.refs[1]);
            // aralığın bir ucu bu ildən əvvəldirsə (yüklənməyib), tapılan ucdan istifadə et
            const t1 = a ? a.tarix : '0000-01-01', t2 = b ? b.tarix : r.tarix;
            if (a || b) hedef = qm.filter(x => x.istiqamet === ist && x.voen === voen && x.tarix >= (t1 < t2 ? t1 : t2) && x.tarix <= (t1 < t2 ? t2 : t1)); }
          else if (R.refs.length) hedef = R.refs.map(([s_, n_]) => qaimeTap(ist, voen, s_, n_)).filter(Boolean);
          else if (R.tarix) hedef = qm.filter(x => x.istiqamet === ist && x.voen === voen && x.tarix >= R.tarix[0] && x.tarix <= R.tarix[1]);
          let isFifo = false;
          if (!hedef.length && !R.refs.length && !R.tarix) { hedef = qm.filter(x => x.istiqamet === ist && x.voen === voen && x.tarix <= r.tarix); isFifo = true; }
          hedef = [...new Set(hedef)].map(x => Q.get(x.id)).sort((a, b) => a.tarix < b.tarix ? -1 : a.tarix > b.tarix ? 1 : a.id - b.id);
          for (const x of hedef) {
            if (qal <= 0.004) break;
            const bos = edvOd ? edvQal(x) : bazaQal(x); if (bos <= 0.004) continue;
            const v = r2(Math.min(bos, qal));
            oden.push({ qaime_id: x.id, tarix: r.tarix, mebleg: v, edv: edvOd ? v : 0, hesab_id: h.id, sened, qeyd: (isFifo ? '[avtomatik, köhnədən yeniyə] ' : '') + tey.slice(0, 300) });
            if (edvOd) x.pe += v; else x.pb += v; qal = r2(qal - v);
          }
          if (qal < m) { bagli++; if (isFifo) fifo++; }
          if (qal > 0.004 && qal < m) qalan++;
        }
        if (qal > 0.004) emel.push({ hesab_id: h.id, tarix: r.tarix, nov, mebleg: qal, kateqoriya: kat, voen: voen || null, kontragent: kontr || null, teyinat: (qal < m ? `[qaimələrdən artıq qalan] ` : '') + tey.slice(0, 480) || null, sened });
      });
      const n = emel.length + oden.length; let i = 0;
      for (const x of hisse(emel, 500)) { await q(sb.from('bank_emeliyyatlari').insert(x)); i += x.length; ir(i, n); }
      for (const x of hisse(oden, 500)) { await q(sb.from('qaime_odenisleri').insert(x)); i += x.length; ir(i, n); }
      // --- yoxlama: hesablanan son qalıq bankın son qalığı ilə
      let yoxla = '';
      if (son != null && !isNaN(son)) {
        const [be2, qo2, hh] = await Promise.all([all(() => sb.from('bank_emeliyyatlari').select('nov,mebleg').eq('hesab_id', h.id).order('id')), all(() => sb.from('v_qaime_odenisleri').select('istiqamet,mebleg').eq('hesab_id', h.id).order('id')), q(sb.from('bank_hesablari').select('ilkin_qaliq').eq('id', h.id).single())]);
        const hes = r2(num(hh.ilkin_qaliq) + be2.reduce((s, x) => s + (x.nov === 'Mədaxil' ? 1 : -1) * num(x.mebleg), 0) + qo2.reduce((s, x) => s + (x.istiqamet === 'geden' ? 1 : -1) * num(x.mebleg), 0));
        yoxla = Math.abs(hes - son) < 0.01 ? ` Son qalıq bankla eynidir: ${fmt(son, 2)} ₼ ✓` : ` Diqqət: hesablanan qalıq ${fmt(hes, 2)} ₼, bankda ${fmt(son, 2)} ₼.`;
      }
      try { localStorage.setItem('son_yukleme_' + S.magaza.id, new Date().toLocaleString('az-AZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })); } catch (_) {}
      return `${h.bank}: ${rows.length - tekrar} əməliyyat yükləndi${oden.length ? ` — ${oden.length} ödəniş qaimələrə bağlandı` : ''}${tekrar ? `, ${tekrar} təkrar buraxıldı` : ''}.${yoxla}`;
    },
  });
}

/* ---------- Əvəzləşmə (ƏDV) ---------- */
async function pageEvez(params) {
  const ay = params.get('ay') || kecenAy(), son = ayinSonu(ay);
  shell('evez', 'Əvəzləşmə (ƏDV)', ayAdi(ay), `<select class="in" id="eay" style="width:auto">${ayOpt(ay)}</select><button class="btn primary" id="exls">${ico('down')}Əvəzləşmə faylı (Excel)</button>`);
  $('#eay').onchange = e => { location.hash = '#/evez?ay=' + e.target.value; };
  const [od, gd, gm] = await Promise.all([
    all(() => sb.from('v_qaime_odenisleri').select('*').eq('istiqamet', 'gelen').gte('tarix', ay).lte('tarix', son).order('tarix').order('id')),
    all(() => sb.from('qaimeler').select('*').eq('istiqamet', 'geden').gte('tarix', ay).lte('tarix', son).order('tarix')),
    all(() => sb.from('gomruk').select('*').eq('nov', 'idxal').gte('tarix', ay).lte('tarix', son).order('tarix')),
  ]);
  const sum = (l, k) => l.reduce((a, x) => a + num(x[k]), 0);
  const hes = sum(gd, 'edv'), ev1 = sum(od, 'edv'), ev2 = sum(gm, 'edv'), net = r2(hes - ev1 - ev2);
  $('#page').innerHTML = `<div class="grid kpis">
      <div class="card kpi"><div class="lbl">Hesablanmış ƏDV (gedən qaimələr)</div><div class="val">${man(hes)}</div><div class="cmp">${gd.length} qaimə</div></div>
      <div class="card kpi"><div class="lbl">Əvəzləşən: ödənilmiş gələn qaimələr</div><div class="val">${man(ev1)}</div><div class="cmp">${od.length} ödəniş</div></div>
      <div class="card kpi"><div class="lbl">Əvəzləşən: idxalda ödənilmiş ƏDV</div><div class="val">${man(ev2)}</div><div class="cmp">${gm.length} bəyannamə</div></div>
      <div class="card kpi"><div class="lbl">${net >= 0 ? 'Büdcəyə ödəniləcək ƏDV' : 'Artıq ödənilmiş ƏDV'}</div><div class="val ${net > 0 ? 'neg' : 'pos'}">${man(Math.abs(net))}</div><div class="cmp">${ayAdi(ay)}</div></div></div>
    <div class="card" style="padding:0;margin-top:16px"><h3 style="padding:18px 20px 0">Əvəzləşməyə daxil olan ödənişlər (gələn qaimələr)</h3>
    ${od.length ? `<table class="t"><thead><tr><th>VÖEN</th><th>Təchizatçı</th><th>Seriya</th><th>Nömrə</th><th>Qaimə tarixi</th><th>Ödəniş tarixi</th><th class="n">Qaimə ƏDV-si</th><th class="n">Ödənilən məbləğ</th><th class="n">o cümlədən ƏDV</th></tr></thead>
      <tbody>${od.map(x => `<tr><td>${esc(x.voen || '')}</td><td>${esc(qisaAd(x.kontragent))}</td><td>${esc(x.seriya || '')}</td><td>${esc(x.nomre || '')}</td><td>${fd(x.qaime_tarix)}</td><td>${fd(x.tarix)}</td>
        <td class="n">${fmt(x.qaime_edv, 2)}</td><td class="n">${fmt(x.mebleg, 2)}</td><td class="n"><b>${fmt(x.edv, 2)}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><td>${od.length}</td><td></td><td></td><td></td><td></td><td></td><td></td><td class="n">${fmt(sum(od, 'mebleg'), 2)}</td><td class="n">${fmt(ev1, 2)}</td></tr></tfoot></table>`
      : '<div class="empty muted" style="padding:24px">Bu ay gələn qaimələrə ödəniş yazılmayıb</div>'}</div>
    <p class="muted" style="font-size:12.5px">Hesablanmış ƏDV gedən qaimələrin tarixinə, əvəzləşən ƏDV isə ödənişin tarixinə görə götürülür. Faylın sütunlarını e-taxes-in tələb etdiyi şablona uyğunlaşdırmaq lazım olsa, nümunə göndərin.</p>`;
  $('#exls').onclick = () => xlsxEndir(`Əvəzləşmə ${ayAdi(ay)} — ${firmaAdi()}`, [
    { ad: 'Əvəzləşmə', rows: [['VÖEN', 'Təchizatçı', 'Seriya', 'Nömrə', 'Qaimə tarixi', 'Ödəniş tarixi', 'Qaimənin əsas məbləği', 'Qaimənin ƏDV-si', 'Ödənilən məbləğ', 'o cümlədən ƏDV'],
      ...od.map(x => [x.voen || '', x.kontragent || '', x.seriya || '', x.nomre || '', fd(x.qaime_tarix), fd(x.tarix), num(x.qaime_esas), num(x.qaime_edv), num(x.mebleg), num(x.edv)])] },
    { ad: 'Xülasə', rows: [['Göstərici', 'Məbləğ'], ['Hesablanmış ƏDV (gedən qaimələr)', hes], ['Əvəzləşən ƏDV — ödənilmiş gələn qaimələr', ev1], ['Əvəzləşən ƏDV — idxal', ev2], [net >= 0 ? 'Büdcəyə ödəniləcək' : 'Artıq ödənilmiş', Math.abs(net)]] }]);
}

/* ---------- Əmək haqqı ---------- */
// Qeyri-neft-qaz, qeyri-dövlət sektoru (taxes.gov.az, 2026). İl üzrə gəlir vergisi pilləsi.
function emekHesabla(g, il, esas) {
  g = num(g); const R = {};
  if (il < 2026) R.gv = g <= 8000 ? 0 : 0.14 * (g - 8000);
  else { const [p, b1, b2] = il === 2026 ? [0.03, 75, 625] : il === 2027 ? [0.05, 125, 675] : [0.07, 175, 725];
    R.gv = g <= 2500 ? p * Math.max(0, g - (esas ? 200 : 0)) : g <= 8000 ? b1 + 0.10 * (g - 2500) : b2 + 0.14 * (g - 8000); }
  R.dsmf_i = g <= 200 ? 0.03 * g : g <= 8000 ? 6 + 0.10 * (g - 200) : 786 + 0.10 * (g - 8000);
  R.dsmf_v = g <= 200 ? 0.22 * g : g <= 8000 ? 44 + 0.15 * (g - 200) : 1214 + 0.11 * (g - 8000);
  R.iss_i = 0.005 * g; R.iss_v = 0.005 * g;
  const hed = il >= 2026 ? 2500 : 8000, sabit = hed * 0.02;
  R.tib_i = g <= hed ? 0.02 * g : sabit + 0.005 * (g - hed); R.tib_v = R.tib_i;
  Object.keys(R).forEach(k => { R[k] = r2(R[k]); });
  R.net = r2(g - R.gv - R.dsmf_i - R.iss_i - R.tib_i); R.xerc = r2(g + R.dsmf_v + R.iss_v + R.tib_v);
  return R;
}
// Fərdi sahibkarın öz sahibkarlıq fəaliyyəti üzrə MDSS (2026-dan): aylıq gəlirin (xərc çıxılmadan) 2%-i, min. əməkhaqqının 15%-dən az, 100%-dən çox olmamaqla
const MIN_EMEK = { 2025: 400, 2026: 400 };
function sahibkarMdss(gelir, il) {
  const me = MIN_EMEK[il] || MIN_EMEK[2026];
  if (il < 2026) return null;
  return r2(Math.min(Math.max(num(gelir) * 0.02, me * 0.15), me));
}
async function pageSahibkarMdss(params) {
  const il = +(params.get('il') || today().slice(0, 4)), w = canWrite(), A = await ayarlar(), fs = fsMi(A) && il >= 2026, rent = edvRent(A);
  shell('emek', 'Əmək haqqı', `Aylıq satış · ${il}`, `<div class="seg" id="et">${EMEK_TABLAR.map(([k, t]) => `<button data-t="${k}" class="${k === 'sah' ? 'on' : ''}">${t}</button>`).join('')}</div>
    <select class="in" id="sil" style="width:auto">${[il + 1, il, il - 1, il - 2].map(y => `<option ${y === il ? 'selected' : ''}>${y}</option>`).join('')}</select>`);
  $$('#et button').forEach(b => b.onclick = () => { location.hash = `#/emek?t=${b.dataset.t}`; });
  $('#sil').onchange = e => { location.hash = `#/emek?t=sah&il=${e.target.value}`; };
  const aylar = Array.from({ length: 12 }, (_, i) => `${il}-${String(i + 1).padStart(2, '0')}-01`).filter(a => a <= today());
  const me = MIN_EMEK[il] || 400;
  const setir = aylar.map(a => {
    const el = A['mdss_gelir_' + a.slice(0, 7)], gelir = num(el), edv = r2(r2(gelir * 18 / 118) * rent / 100);
    const mdss = fs ? sahibkarMdss(gelir, il) : 0, its = fs ? r2(me * 0.04) : 0;
    return { a, el, gelir, edv, mdss, its, cem: r2(edv + mdss + its) };
  });
  const cem = f => r2(setir.reduce((s, x) => s + num(x[f]), 0));
  const kodu = (k, s) => `<div class="muted" style="font-weight:400;font-size:11px">kod ${k} · səviyyə ${s}</div>`;
  $('#page').innerHTML = `<div class="tbl-wrap"><table class="t" data-flt="0"><thead><tr><th>Ay</th><th class="n" style="width:200px">Aylıq satış</th>
      <th class="n">ƏDV (${fmt(rent, 2)}%)${kodu(fsMi(A) ? 114118 : 114117, 1)}</th>
      ${fs ? `<th class="n">Sahibkarın MDSS-i (2%)${kodu(FS_SAHE_KOD[A.fs_sahe || 'Ticarət'], 4)}</th><th class="n">Sahibkarın İTS-i${kodu(124300, 7)}</th>` : ''}<th class="n">Cəmi</th></tr></thead>
      <tbody>${setir.map(x => `<tr><td>${ayAdi(x.a)}</td>
        <td class="n">${w ? `<input class="in" style="text-align:right;padding:5px 8px" data-ay="${x.a.slice(0, 7)}" value="${x.el != null && x.el !== '' ? esc(x.el) : ''}" placeholder="0,00">` : fmt(x.gelir, 2)}</td>
        <td class="n">${fmt(x.edv, 2)}</td>
        ${fs ? `<td class="n">${fmt(x.mdss, 2)}${x.mdss === r2(me * 0.15) && x.gelir * 0.02 < me * 0.15 ? ' <span class="badge b-gray">min.</span>' : x.mdss === me && x.gelir * 0.02 > me ? ' <span class="badge b-gray">maks.</span>' : ''}</td><td class="n">${fmt(x.its, 2)}</td>` : ''}
        <td class="n"><b>${fmt(x.cem, 2)}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Cəmi</td><td class="n sabit">${fmt(cem('gelir'), 2)}</td><td class="n sabit">${fmt(cem('edv'), 2)}</td>${fs ? `<td class="n sabit">${fmt(cem('mdss'), 2)}</td><td class="n sabit">${fmt(cem('its'), 2)}</td>` : ''}<td class="n sabit"><b>${fmt(cem('cem'), 2)}</b></td></tr></tfoot></table></div>
    <p class="muted" style="font-size:12.5px;line-height:1.6">Ayın satışını yazın, qalanı avtomatik hesablanır. ƏDV = satışın ƏDV hissəsi (satış × 18/118) × ${fmt(rent, 2)}% (faizi <a href="#/ayarlar?t=vergi">Ayarlar → Vergi və ödənişlər</a>-də dəyişə bilərsiniz).${fs ? ` Sahibkarın MDSS-i satışın 2%-i — ayda ən azı ${fmt(me * 0.15, 0)} ₼, ən çoxu ${me} ₼; İTS hər ay ${fmt(me * 0.04, 2)} ₼.` : ''}</p>`;

  $$('[data-ay]').forEach(inp => inp.onchange = async () => {
    try { const v = inp.value.trim().replace(/\s/g, '').replace(',', '.'); if (v && isNaN(+v)) return toast('Rəqəm yazın');
      await ayarYaz(A, 'mdss_gelir_' + inp.dataset.ay, v); S.cache.ayar = null; refresh(); } catch (er) { fail(er); }
  });
}
// Ödəniləcək məbləğlər büdcə səviyyə və təsnifat kodları ilə (mühasibin ödəniş cədvəli kimi)
const FS_SAHE_KOD = { 'Ticarət': 121340, 'Tikinti': 121350 };
function odenisKodlari(fs, sahe, A = {}) {
  const ik = fs ? 111121 : 111254;   // icarə haqqından ödəmə mənbəyində vergi
  return [
    { q: 'isci', ad: 'Gəlir vergisi (işçidən tutulan)', sev: 1, kod: 111111, k: 'gelir_vergisi' },
    { q: 'isci', ad: 'Pensiya fondu — MDSS (işçidən tutulan)', sev: 4, kod: fs ? 121212 : 121211, k: 'dsmf_isci' },
    { q: 'isci', ad: 'İşsizlikdən sığorta (işçidən tutulan)', sev: 4, kod: 123200, k: 'issizlik_isci' },
    { q: 'isci', ad: 'İcbari tibbi sığorta (işçidən tutulan)', sev: 7, kod: 124210, k: 'tibbi_isci' },
    { q: 'mues', ad: 'Pensiya fondu — MDSS (işəgötürən tərəfindən)', sev: 4, kod: fs ? 121112 : 121111, k: 'dsmf_isveren' },
    { q: 'mues', ad: 'İşsizlikdən sığorta (işəgötürən tərəfindən)', sev: 4, kod: 123100, k: 'issizlik_isveren' },
    { q: 'mues', ad: 'İcbari tibbi sığorta (işəgötürən tərəfindən)', sev: 7, kod: 124110, k: 'tibbi_isveren' },
    ...(fs ? [{ q: 'sah', ad: 'Sahibkarın icbari tibbi sığorta haqqı', sev: 7, kod: 124300, k: 'sah_its' },
      { q: 'sah', ad: `${sahe} sahəsində sahibkarlıq fəaliyyəti ilə məşğul olan fiziki şəxslər üzrə sosial ayırmalar (MDSS)`, sev: 4, kod: FS_SAHE_KOD[sahe] || 121340, k: 'sah_mdss' }] : []),
    { q: 'icare', ad: 'Fiziki şəxsə ödənilən icarə haqqından ödəmə mənbəyində vergi (14%)', sev: 1, kod: ik || '', k: 'icare_vergi', icare: true },
    { q: 'edv', ad: 'Əlavə dəyər vergisi (ƏDV)', sev: 1, kod: fs ? 114118 : 114117, k: 'edv' }];
}
async function pageEmekOdenis(params) {
  const ay = params.get('ay') || ayBasi(today()), il = +ay.slice(0, 4), A = await ayarlar(), fs = fsMi(A), sahe = A.fs_sahe || 'Ticarət';
  shell('emek', 'Əmək haqqı', `Ödəniləcək məbləğlər · ${ayAdi(ay)}`, `<div class="seg" id="et">${EMEK_TABLAR.map(([k, t]) => `<button data-t="${k}" class="${k === 'od' ? 'on' : ''}">${t}</button>`).join('')}</div>
    <select class="in" id="oay" style="width:auto">${ayOpt(ay)}</select><button class="btn" id="oxls">${ico('down')}Excel</button><button class="btn" onclick="window.print()">${ico('print')}PDF / Çap</button>`);
  $$('#et button').forEach(b => b.onclick = () => { location.hash = `#/emek?t=${b.dataset.t}&ay=${ay}`; });
  $('#oay').onchange = e => { location.hash = `#/emek?t=od&ay=${e.target.value}`; };
  let eh = await all(() => sb.from('emek_haqqi').select('*').eq('ay', ay).order('id')), avto = false;
  if (!eh.length) {   // bu ay hələ "Hesabla" basılmayıbsa — işçilərin maaşından avtomatik hesabla
    const son = ayinSonu(ay), isci = (await all(() => sb.from('emekdaslar').select('*').order('ad'))).filter(x => (!x.ise_qebul || x.ise_qebul <= son) && (!x.cixis || x.cixis >= ay));
    eh = isci.map(x => { const R = emekHesabla(x.maas, il, x.esas_is); return { gelir_vergisi: R.gv, dsmf_isci: R.dsmf_i, issizlik_isci: R.iss_i, tibbi_isci: R.tib_i, dsmf_isveren: R.dsmf_v, issizlik_isveren: R.iss_v, tibbi_isveren: R.tib_v }; });
    avto = eh.length > 0;
  }
  const me = MIN_EMEK[il] || 400, satis = num(A['mdss_gelir_' + ay.slice(0, 7)]), rent = edvRent(A);
  const M = {}; ['gelir_vergisi', 'dsmf_isci', 'issizlik_isci', 'tibbi_isci', 'dsmf_isveren', 'issizlik_isveren', 'tibbi_isveren'].forEach(k => M[k] = r2(eh.reduce((s, r) => s + num(r[k]), 0)));
  if (fs) { M.sah_its = r2(me * 0.04); M.sah_mdss = il >= 2026 ? sahibkarMdss(satis, il) : 0; }
  const icare = num(A.icare_aylik); M.icare_vergi = r2(icare * 0.14);
  const edvHisse = r2(satis * 18 / 118); M.edv = r2(edvHisse * rent / 100);
  const K = odenisKodlari(fs, sahe, A), C = q_ => r2(K.filter(x => x.q === q_).reduce((s, x) => s + M[x.k], 0)), CEM = r2(K.reduce((s, x) => s + M[x.k], 0));
  const qrup = [['isci', 'İşçinin adından (maaşdan tutulan)'], ['mues', 'Müəssisənin adından (işəgötürən)'], ['sah', 'Sahibkarın adından'], ['icare', 'İcarə vergisi'], ['edv', 'ƏDV']].filter(([q_]) => K.some(x => x.q === q_));
  const izah = () => '';
  const qeyd = `${avto ? 'İşçilərin məbləğləri "Əməkdaşlar" siyahısındakı maaşlardan hesablanıb' : eh.length ? 'İşçilərin məbləğləri ayın əmək haqqı hesablamasından götürülüb' : 'Bu ay işçi yoxdur'}. Kodlar ${fs ? 'fərdi sahibkar' : 'hüquqi şəxs'} üçündür.${fs ? ` Sahibkarın MDSS-i ayın satışının 2%-i (ən azı ${fmt(me * 0.15, 0)}, ən çoxu ${me} ₼), İTS-i minimum əməkhaqqının 4%-i (${fmt(me * 0.04, 2)} ₼).` : ''} İcarə vergisi rüb bitdikdən sonrakı ayın 20-dək ödənilir.`;
  $('#page').innerHTML = `<div class="print-only" style="margin-bottom:12px"><div style="font-size:18px;font-weight:700">${esc(A.firma_adi || S.magaza.ad)}</div>
      <div style="font-size:13px">${A.firma_voen ? 'VÖEN: ' + esc(A.firma_voen) + ' · ' : ''}${fs ? 'Fərdi sahibkar' : 'Hüquqi şəxs'}</div>
      <div style="font-size:15px;font-weight:600;margin-top:8px">${ayAdi(ay)} — ödəniləcək vergi və sığorta məbləğləri</div></div>
    <div class="tbl-wrap"><table class="t" data-flt="0"><thead><tr><th>№</th><th>Büdcə səviyyə kodu</th><th>Büdcə təsnifat kodu</th><th>Təyinatı</th><th class="n">Məbləğ</th></tr></thead>
      <tbody>${K.map((x, i) => `<tr style="${M[x.k] > 0 ? '' : 'opacity:.45'}"><td class="muted">${i + 1}</td><td>${x.sev}</td><td><b>${x.kod}</b></td><td>${esc(x.ad)}${izah(x) ? `<div class="muted" style="font-size:12.5px">${izah(x)}</div>` : ''}</td><td class="n"><b>${fmt(M[x.k], 2)}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><td></td><td></td><td></td><td>Cəmi</td><td class="n sabit">${fmt(CEM, 2)}</td></tr></tfoot></table></div>
    <div class="od-xul"><table><tbody>${qrup.map(([q_, t]) => `<tr><td>${t}</td><td class="n">${fmt(C(q_), 2)} ₼</td></tr>`).join('')}
      <tr class="cem"><td>Cəmi ödəniləcək <span class="muted" style="font-weight:400;font-size:12.5px">(${eh.length} işçi${fs ? ' + sahibkar' : ''})</span></td><td class="n">${fmt(CEM, 2)} ₼</td></tr></tbody></table></div>
    <p class="od-qeyd"><b>Qeyd:</b> ${qeyd}</p>
    <p class="muted no-print" style="font-size:12.5px">Məbləğləri dəyişmək üçün: işçilər — "Əməkdaşlar" / "Aylıq hesablama"; aylıq satış — "Aylıq satış" bölməsi; icarə, ƏDV faizi, fəaliyyət sahəsi — <a href="#/ayarlar?t=vergi">Ayarlar → Vergi və ödənişlər</a>.</p>`;
  $('#oxls').onclick = () => xlsxEndir(`${S.magaza.ad} - ödənişlər - ${ayAdi(ay)}`, [{ ad: ayAdi(ay), rows: [['№', 'Büdcə səviyyə kodu', 'Büdcə təsnifat kodu', 'Təyinatı', 'Məbləğ'], ...K.map((x, i) => [i + 1, x.sev, x.kod, x.ad, M[x.k]]), ['', '', '', 'Cəmi', CEM], [], ...qrup.map(([q_, t]) => ['', '', '', t, C(q_)]), [], ['Qeyd: ' + qeyd]] }]);
}
const edvRent = A => { const v = num(String(A.edv_rent || '').replace(',', '.')); return A.edv_rent == null || A.edv_rent === '' ? 8 : v; };
const EMEK_TABLAR = [['ay', 'Aylıq hesablama'], ['isci', 'Əməkdaşlar'], ['sah', 'Aylıq satış'], ['od', 'Ödəniləcək məbləğlər (kodlarla)']];
async function pageEmek(params) {
  const tab = ['isci', 'sah', 'od'].includes(params.get('t')) ? params.get('t') : 'ay', ay = params.get('ay') || ayBasi(today()), w = canWrite();
  if (tab === 'sah') return pageSahibkarMdss(params);
  if (tab === 'od') return pageEmekOdenis(params);
  shell('emek', 'Əmək haqqı', tab === 'ay' ? ayAdi(ay) : 'Əməkdaşlar', `<div class="seg" id="et">${EMEK_TABLAR.map(([k, t]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    ${tab === 'ay' ? `<select class="in" id="eay" style="width:auto">${ayOpt(ay)}</select>${w ? `<button class="btn primary" id="ehes">Hesabla</button>` : ''}` : (w ? `<button class="btn primary" id="eyeni">${ico('plus')}Yeni əməkdaş</button>` : '')}`);
  $$('#et button').forEach(b => b.onclick = () => { location.hash = `#/emek?t=${b.dataset.t}&ay=${ay}`; });
  const isci = await all(() => sb.from('emekdaslar').select('*').order('ad'));
  if (tab === 'isci') {
    if ($('#eyeni')) $('#eyeni').onclick = () => emekdasForm(null);
    $('#page').innerHTML = isci.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Ad Soyad</th><th>FİN</th><th>Vəzifə</th><th class="n">Maaş (hesablanan)</th><th>Əsas iş yeri</th><th>İşə qəbul</th><th>Çıxış</th></tr></thead>
      <tbody>${isci.map(x => `<tr class="click" data-i="${x.id}" style="${x.cixis && x.cixis < today() ? 'opacity:.55' : ''}"><td>${esc(x.ad)}</td><td>${esc(x.fin || '')}</td><td>${esc(x.vezife || '')}</td><td class="n"><b>${fmt(x.maas, 2)}</b></td>
        <td>${x.esas_is ? 'Bəli' : 'Xeyr'}</td><td>${fd(x.ise_qebul)}</td><td>${fd(x.cixis)}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="card empty">Əməkdaş yoxdur — "Yeni əməkdaş" ilə əlavə edin</div>';
    $$('[data-i]').forEach(tr => tr.onclick = () => w && emekdasForm(isci.find(x => x.id === +tr.dataset.i)));
    return;
  }
  $('#eay').onchange = e => { location.hash = `#/emek?t=ay&ay=${e.target.value}`; };
  const rows = await all(() => sb.from('emek_haqqi').select('*').eq('ay', ay).order('id'));
  const il = +ay.slice(0, 4), son = ayinSonu(ay);
  const aktiv = isci.filter(x => (!x.ise_qebul || x.ise_qebul <= son) && (!x.cixis || x.cixis >= ay));
  if ($('#ehes')) $('#ehes').onclick = async () => {
    if (!aktiv.length) return toast('Bu ay üçün əməkdaş yoxdur');
    if (rows.length && !await tesdiq('Bu ayın hesablaması yenidən aparılsın? Əl ilə dəyişdikləriniz də yenilənəcək.')) return;
    try {
      const v = aktiv.map(x => { const R = emekHesabla(x.maas, il, x.esas_is);
        return { emekdas_id: x.id, ay, hesablanan: r2(x.maas), gelir_vergisi: R.gv, dsmf_isci: R.dsmf_i, issizlik_isci: R.iss_i, tibbi_isci: R.tib_i, dsmf_isveren: R.dsmf_v, issizlik_isveren: R.iss_v, tibbi_isveren: R.tib_v }; });
      await q(sb.from('emek_haqqi').delete().eq('ay', ay));
      await q(sb.from('emek_haqqi').insert(v)); toast('Hesablandı'); refresh();
    } catch (er) { fail(er); }
  };
  const ad = id => (isci.find(x => x.id === id) || {}).ad || '—';
  const net = r => r2(num(r.hesablanan) - num(r.gelir_vergisi) - num(r.dsmf_isci) - num(r.issizlik_isci) - num(r.tibbi_isci));
  const ver = r => r2(num(r.dsmf_isveren) + num(r.issizlik_isveren) + num(r.tibbi_isveren));
  const sum = f => rows.reduce((a, r) => a + (typeof f === 'function' ? f(r) : num(r[f])), 0);
  $('#page').innerHTML = rows.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Əməkdaş</th><th class="n">Hesablanan</th><th class="n">Gəlir vergisi</th><th class="n">DSMF (işçi)</th><th class="n">İşsizlik (işçi)</th><th class="n">Tibbi (işçi)</th><th class="n">Ödəniləcək</th>
      <th class="n">DSMF (işəgötürən)</th><th class="n">İşsizlik (işəgötürən)</th><th class="n">Tibbi (işəgötürən)</th><th class="n">Cəm xərc</th><th>Ödənilib</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${w ? 'click' : ''}" data-e="${r.id}"><td>${esc(ad(r.emekdas_id))}</td><td class="n">${fmt(r.hesablanan, 2)}</td><td class="n">${fmt(r.gelir_vergisi, 2)}</td><td class="n">${fmt(r.dsmf_isci, 2)}</td><td class="n">${fmt(r.issizlik_isci, 2)}</td><td class="n">${fmt(r.tibbi_isci, 2)}</td>
      <td class="n"><b>${fmt(net(r), 2)}</b></td><td class="n">${fmt(r.dsmf_isveren, 2)}</td><td class="n">${fmt(r.issizlik_isveren, 2)}</td><td class="n">${fmt(r.tibbi_isveren, 2)}</td><td class="n">${fmt(num(r.hesablanan) + ver(r), 2)}</td>
      <td>${r.odenilib ? '<span class="badge b-green">Bəli</span>' : '<span class="badge b-gray">Xeyr</span>'}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>${rows.length} nəfər</td><td class="n">${fmt(sum('hesablanan'), 2)}</td><td class="n">${fmt(sum('gelir_vergisi'), 2)}</td><td class="n">${fmt(sum('dsmf_isci'), 2)}</td><td class="n">${fmt(sum('issizlik_isci'), 2)}</td><td class="n">${fmt(sum('tibbi_isci'), 2)}</td>
      <td class="n">${fmt(sum(net), 2)}</td><td class="n">${fmt(sum('dsmf_isveren'), 2)}</td><td class="n">${fmt(sum('issizlik_isveren'), 2)}</td><td class="n">${fmt(sum('tibbi_isveren'), 2)}</td><td class="n">${fmt(sum('hesablanan') + sum(ver), 2)}</td><td></td></tr></tfoot></table></div>
    <p class="muted" style="font-size:12.5px">Dərəcələr: qeyri-neft-qaz, qeyri-dövlət sektoru (${il}). Gəlir vergisi ${il === 2026 ? '2500 ₼-dək 3% (əsas iş yerində 200 ₼ azad), 2500–8000: 75 ₼ + 10%, 8000-dən çox: 625 ₼ + 14%' : 'ilin pilləsinə görə'}; DSMF işçi 3% / 6 ₼ + 10%, işəgötürən 22% / 44 ₼ + 15%; işsizlik 0,5% + 0,5%; tibbi 2% + 2% (2500 ₼-dən yuxarı 0,5%). Sətrə basıb rəqəmləri əl ilə düzəldə bilərsiniz.</p>`
    : `<div class="card empty" style="padding:36px 20px"><div style="font-size:16px;font-weight:600;margin-bottom:6px">${ayAdi(ay)} hələ hesablanmayıb</div><div class="muted">${aktiv.length} əməkdaş · "Hesabla" düyməsini basın</div></div>`;
  $$('[data-e]').forEach(tr => tr.onclick = () => w && emekSetirForm(rows.find(r => r.id === +tr.dataset.e), ad));
}
function emekdasForm(x) {
  const m = modal(x ? 'Əməkdaşı düzəlt' : 'Yeni əməkdaş', `<form id="ef">
    <div class="row2"><div class="field"><label class="f">Ad Soyad</label><input class="in" name="ad" value="${esc(x && x.ad || '')}" required></div>
      <div class="field"><label class="f">FİN</label><input class="in" name="fin" value="${esc(x && x.fin || '')}" maxlength="7" style="text-transform:uppercase"></div></div>
    <div class="row2"><div class="field"><label class="f">Vəzifə</label><input class="in" name="v" value="${esc(x && x.vezife || '')}"></div>
      <div class="field"><label class="f">Aylıq maaş (hesablanan, vergidən əvvəl)</label><input class="in" type="number" step="0.01" min="0" name="m" value="${x ? x.maas : ''}" required></div></div>
    <div class="row2"><div class="field"><label class="f">İşə qəbul</label><input class="in" type="date" name="q" value="${x && x.ise_qebul || ''}"></div>
      <div class="field"><label class="f">Çıxış</label><input class="in" type="date" name="c" value="${x && x.cixis || ''}"></div></div>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="e" ${!x || x.esas_is ? 'checked' : ''}> Əsas iş yeridir (200 ₼ güzəşt tətbiq olunur)</label>
    <div class="muted" id="eon" style="font-size:13px;margin-top:10px"></div></form>`,
    `${x ? '<button class="btn danger" id="sil" style="margin-right:auto">Sil</button>' : ''}<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yadda saxla</button>`);
  const f = $('#ef', m);
  const on = () => { const R = emekHesabla(f.m.value, new Date().getFullYear(), f.e.checked);
    $('#eon', m).innerHTML = num(f.m.value) ? `Əlinə çatacaq: <b>${man(R.net)}</b> · gəlir vergisi ${fmt(R.gv, 2)} · DSMF ${fmt(R.dsmf_i, 2)} · işəgötürənə cəm xərc <b>${man(R.xerc)}</b>` : ''; };
  f.m.oninput = on; f.e.onchange = on; on();
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    const v = { ad: f.ad.value.trim(), fin: f.fin.value.trim().toUpperCase() || null, vezife: f.v.value.trim() || null, maas: r2(f.m.value), ise_qebul: f.q.value || null, cixis: f.c.value || null, esas_is: f.e.checked };
    try { if (x) await q(sb.from('emekdaslar').update(v).eq('id', x.id)); else await q(sb.from('emekdaslar').insert(v)); closeModal(); toast('Yadda saxlanıldı'); refresh(); } catch (er) { fail(er); }
  };
  if ($('#sil', m)) $('#sil', m).onclick = async () => { if (!await tesdiq(`${x.ad} və onun hesablamaları silinsin?`)) return;
    try { await q(sb.from('emekdaslar').delete().eq('id', x.id)); closeModal(); toast('Silindi'); refresh(); } catch (er) { fail(er); } };
}
function emekSetirForm(r, ad) {
  const K = [['hesablanan', 'Hesablanan'], ['gelir_vergisi', 'Gəlir vergisi'], ['dsmf_isci', 'DSMF (işçi)'], ['issizlik_isci', 'İşsizlik (işçi)'], ['tibbi_isci', 'Tibbi (işçi)'],
    ['dsmf_isveren', 'DSMF (işəgötürən)'], ['issizlik_isveren', 'İşsizlik (işəgötürən)'], ['tibbi_isveren', 'Tibbi (işəgötürən)']];
  const m = modal(`${esc(ad(r.emekdas_id))} — ${ayAdi(r.ay)}`, `<form id="sf"><div class="row2">${K.map(([k, t]) => `<div class="field"><label class="f">${t}</label><input class="in" type="number" step="0.01" min="0" name="${k}" value="${r[k]}"></div>`).join('')}</div>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="o" ${r.odenilib ? 'checked' : ''}> Ödənilib</label></form>`,
    `<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yadda saxla</button>`);
  const f = $('#sf', m);
  $('#ok', m).onclick = async () => {
    const v = { odenilib: f.o.checked }; K.forEach(([k]) => { v[k] = r2(f[k].value); });
    try { await q(sb.from('emek_haqqi').update(v).eq('id', r.id)); closeModal(); toast('Yadda saxlanıldı'); refresh(); } catch (er) { fail(er); }
  };
}

/* ---------- Mənfəət / Zərər ---------- */
async function pageMZ(params) {
  const il = +(params.get('il') || new Date().getFullYear());
  shell('mz', 'Mənfəət / Zərər', String(il), `<select class="in" id="mil" style="width:auto">${[0, 1, 2, 3].map(i => new Date().getFullYear() - i).map(y => `<option ${y === il ? 'selected' : ''}>${y}</option>`).join('')}</select>`);
  $('#mil').onchange = e => { location.hash = '#/mz?il=' + e.target.value; };
  const a = `${il}-01-01`, b = `${il}-12-31`;
  const [qm, eh, gm, be] = await Promise.all([
    all(() => sb.from('qaimeler').select('istiqamet,tarix,esas,edvsiz,voen,nov,kontragent,qeyd').gte('tarix', a).lte('tarix', b).order('id')),
    all(() => sb.from('emek_haqqi').select('ay,hesablanan,dsmf_isveren,issizlik_isveren,tibbi_isveren').gte('ay', a).lte('ay', b).order('id')),
    all(() => sb.from('gomruk').select('nov,tarix,rusum,diger').gte('tarix', a).lte('tarix', b).order('id')),
    all(() => sb.from('bank_emeliyyatlari').select('tarix,nov,mebleg,kateqoriya').gte('tarix', a).lte('tarix', b).order('id')),
  ]);
  const KN = new Map((await all(() => sb.from('kontragentler').select('voen,nov').order('id'))).map(k => [k.voen, k.nov]));
  qm.forEach(x => { if (x.istiqamet === 'gelen') { const k = KN.get(x.voen); x.nv = x.nov || (k && k !== 'qarisiq' ? k : novAvto(x.kontragent, x.qeyd)); } });
  const aylar = Array.from({ length: 12 }, (_, i) => `${il}-${String(i + 1).padStart(2, '0')}-01`);
  const ayda = (l, k, f) => l.filter(x => String(x[k]).slice(0, 7) === f.slice(0, 7));
  const S_ = (l, f) => l.reduce((s, x) => s + f(x), 0);
  const setir = aylar.map(f => {
    const gelir = S_(ayda(qm, 'tarix', f).filter(x => x.istiqamet === 'geden'), x => num(x.esas) + num(x.edvsiz)) + S_(ayda(be, 'tarix', f).filter(x => x.nov === 'Mədaxil' && x.kateqoriya === 'Digər gəlir'), x => num(x.mebleg));
    const gq = ayda(qm, 'tarix', f).filter(x => x.istiqamet === 'gelen'), dey = x => num(x.esas) + num(x.edvsiz);
    const mal = S_(gq.filter(x => x.nv === 'mal'), dey), xid = S_(gq.filter(x => x.nv === 'xidmet'), dey), tey = S_(gq.filter(x => !x.nv), dey), alis = mal + xid + tey;
    const emek = S_(ayda(eh, 'ay', f), x => num(x.hesablanan) + num(x.dsmf_isveren) + num(x.issizlik_isveren) + num(x.tibbi_isveren));
    const gomr = S_(ayda(gm, 'tarix', f).filter(x => x.nov === 'idxal'), x => num(x.rusum) + num(x.diger));
    const bank = S_(ayda(be, 'tarix', f).filter(x => x.nov === 'Məxaric' && ['Bank xərci', 'Digər xərc'].includes(x.kateqoriya)), x => num(x.mebleg));
    return { f, gelir, alis, mal, xid, tey, emek, gomr, bank, menfeet: gelir - alis - emek - gomr - bank };
  });
  const cem = k => setir.reduce((s, x) => s + x[k], 0), mf = cem('menfeet');
  $('#page').innerHTML = `<div class="grid kpis">
      <div class="card kpi"><div class="lbl">Gəlir</div><div class="val">${man(cem('gelir'))}</div><div class="cmp">gedən qaimələr (ƏDV-siz) + digər gəlir</div></div>
      <div class="card kpi"><div class="lbl">Xərclər</div><div class="val">${man(cem('alis') + cem('emek') + cem('gomr') + cem('bank'))}</div><div class="cmp">alış, əmək haqqı, gömrük, bank</div></div>
      <div class="card kpi"><div class="lbl">${mf >= 0 ? 'Mənfəət' : 'Zərər'}</div><div class="val ${mf >= 0 ? 'pos' : 'neg'}">${man(Math.abs(mf))}</div><div class="cmp">${il}</div></div>
      <div class="card kpi"><div class="lbl">Təxmini mənfəət vergisi (20%)</div><div class="val">${man(Math.max(0, mf) * 0.2)}</div><div class="cmp">ilin nəticəsinə görə</div></div></div>
    ${cem('tey') > 0.005 ? `<div class="banner b-amber-bg" style="margin-top:16px">${man(cem('tey'))} məbləğində gələn qaimənin növü (mal / xidmət) təyin olunmayıb — <a href="#/kontragent?t=nov&f=yox">Kontragentlər → Mal / Xidmət</a> bölməsində təchizatçıların növünü seçin.</div>` : ''}
    <div class="tbl-wrap" style="margin-top:16px"><table class="t"><thead><tr><th>Ay</th><th class="n">Gəlir</th><th class="n">Mal alışı</th><th class="n">Xidmətlər</th>${cem('tey') ? '<th class="n">Növü təyin olunmayan</th>' : ''}<th class="n">Əmək haqqı + sığorta</th><th class="n">Gömrük</th><th class="n">Bank / digər xərc</th><th class="n">Mənfəət / zərər</th></tr></thead>
      <tbody>${setir.map(x => `<tr><td>${ayAdi(x.f)}</td><td class="n">${fmt(x.gelir, 2)}</td><td class="n">${fmt(x.mal, 2)}</td><td class="n">${fmt(x.xid, 2)}</td>${cem('tey') ? `<td class="n neg">${fmt(x.tey, 2)}</td>` : ''}<td class="n">${fmt(x.emek, 2)}</td><td class="n">${fmt(x.gomr, 2)}</td><td class="n">${fmt(x.bank, 2)}</td>
        <td class="n"><b class="${x.menfeet < 0 ? 'neg' : x.menfeet > 0 ? 'pos' : ''}">${fmt(x.menfeet, 2)}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Cəmi ${il}</td><td class="n">${fmt(cem('gelir'), 2)}</td><td class="n">${fmt(cem('mal'), 2)}</td><td class="n">${fmt(cem('xid'), 2)}</td>${cem('tey') ? `<td class="n">${fmt(cem('tey'), 2)}</td>` : ''}<td class="n">${fmt(cem('emek'), 2)}</td><td class="n">${fmt(cem('gomr'), 2)}</td><td class="n">${fmt(cem('bank'), 2)}</td><td class="n">${fmt(mf, 2)}</td></tr></tfoot></table></div>
    <p class="muted" style="font-size:12.5px">Sadələşdirilmiş hesablama: gəlir — gedən qaimələrin ƏDV-siz məbləği; alış xərci — gələn qaimələrin ƏDV-siz məbləği, mal və xidmət ayrıca (növ təchizatçıya və ya qaimənin özünə görə; anbar qalığı nəzərə alınmır). Bank əməliyyatlarında "Bank xərci" və "Digər xərc" kateqoriyaları xərcə, "Digər gəlir" gəlirə daxil olur.</p>`;
}

/* ---------- Kontragentlər ---------- */
/* ---------- Gələn qaimələr: mal / xidmət təsnifatı (mənfəət-zərər üçün) ---------- */
const NOV_AD = { mal: 'Mal', xidmet: 'Xidmət', qarisiq: 'Qarışıq' };
// qeyd və kontragent adına görə təxmin (yalnız təklif kimi göstərilir)
const XIDMET_SOZ = /xidmət|xidmet|(?:^|[^a-zəöüğıçş])icar[əe]|kirayə|kiraye|təmir|temir|quraşdırma|qurasdirma|daşınma|dasinma|nəqliyyat|neqliyyat|daşıma|kommunal|elektrik enerji|elektrik enerjisi|qaz təchizat|su təchizat|kanalizasiya|internet|rabitə|rabite|telefon xidm|mobil|reklam|məsləhət|meslehet|konsult|audit|mühafizə|muhafize|təmizlik|temizlik|təlim|telim|kurs|sığorta|sigorta|poçt|poct|kuryer|layihə|layihe|proqram təminat|abunə|abune|lizinq|servis|texniki baxış|yükləmə|boşaltma|ekspeditor|logistik/i;
const MAL_SOZ = /məhsul|mehsul|\bmal\b|mallar|ərzaq|erzaq|qida|material|ehtiyat hissə|avadanlıq|avadanliq|göndərilən|gonderilen|təhvil|tehvil|satış|satis|topdan/i;
function novTexmin(metn) { const t = azLow(String(metn || '')); const x = XIDMET_SOZ.test(t), m = MAL_SOZ.test(t); return x && !m ? 'xidmet' : m && !x ? 'mal' : null; }
// xidmət göstərən tanınmış təşkilatlar (adına görə)
const XIDMET_AD = /kommunal|işıq|isiq|azərsu|azersu|azəriqaz|azeriqaz|qaz təchizat|qazpaylama|enerji|elektrik şəbəkə|aztelekom|telekom|bakcell|azercell|\bnar\b|nar mobile|rabitə|rabite|internet|bank|sığorta|sigorta|lizinq|poçt|poct|mühafizə|muhafize|nəqliyyat|neqliyyat|logistik|kargo|cargo|taksi|reklam|audit|konsalt|məsləhət|universitet|məktəb|tibb|klinika|xəstəxana|otel|restoran|(?:^|[^a-zəöüğıçş])icar[əe]|xidmət|xidmet|caspos|kassa xidm|meliorasiya|şəbəkə|sebeke/i;
// avtomatik növ: əl ilə seçilməyibsə — xidmət əlaməti varsa xidmət, yoxdursa mal
const novAvto = (ad, metn) => XIDMET_AD.test(azLow(String(ad || ''))) || novTexmin(String(ad || '') + ' ' + String(metn || '')) === 'xidmet' ? 'xidmet' : 'mal';
async function kontragentNovYaz(voen, ad, nov) {
  const r = await q(sb.from('kontragentler').update({ nov: nov || null }).eq('voen', voen).select('id'));
  if (!r.length) await q(sb.from('kontragentler').insert({ voen, ad: ad || voen, nov: nov || null }));
}
async function pageMalXidmet(params) {
  const w = canWrite(), f = params.get('f') || 'hamisi';
  const [qm, kl] = await Promise.all([
    all(() => sb.from('qaimeler').select('id,voen,kontragent,esas,edvsiz,nov,qeyd,xam').eq('istiqamet', 'gelen').order('id')),
    all(() => sb.from('kontragentler').select('voen,ad,nov').order('id'))]);
  const KN = new Map(kl.map(k => [k.voen, k.nov]));
  const K = new Map();
  qm.forEach(x => { const o = K.get(x.voen) || { voen: x.voen, ad: x.kontragent, say: 0, cem: 0, ayri: 0, mal: 0, xid: 0, metn: '' }; o.say++; o.cem += num(x.esas) + num(x.edvsiz); o.ad = x.kontragent || o.ad;
    if (x.nov) { o.ayri++; o[x.nov === 'mal' ? 'mal' : 'xid'] += num(x.esas) + num(x.edvsiz); }
    if (o.metn.length < 3000) o.metn += ' ' + (x.qeyd || '') + ' ' + ((x.xam && (x.xam['Əsas qeyd'] || '')) || '') + ' ' + ((x.xam && (x.xam['Əlavə qeyd'] || '')) || ''); K.set(x.voen, o); });
  let L = [...K.values()].map(o => ({ ...o, nov: KN.get(o.voen) || null, avto: novAvto(o.ad, o.metn) })).sort((a, b) => b.cem - a.cem);
  L.forEach(o => { o.son = o.nov && o.nov !== 'qarisiq' ? o.nov : o.nov === 'qarisiq' ? 'qarisiq' : o.avto; });
  const cem = l => l.reduce((s, o) => s + o.cem, 0), hamisi = L.slice();
  if (f === 'yox') L = L.filter(o => !o.nov); else if (f === 'qar') L = L.filter(o => o.nov === 'qarisiq'); else if (f === 'xid') L = L.filter(o => o.son === 'xidmet');
  const ml = hamisi.filter(o => o.son === 'mal'), xl = hamisi.filter(o => o.son === 'xidmet'), av = hamisi.filter(o => !o.nov);
  $('#page').innerHTML = `<div class="grid kpis"><div class="card kpi"><div class="lbl">Mal</div><div class="val">${man(cem(ml))}</div><div class="cmp">${ml.length} təchizatçı</div></div>
      <div class="card kpi"><div class="lbl">Xidmət</div><div class="val">${man(cem(xl))}</div><div class="cmp">${xl.length} təchizatçı</div></div>
      <div class="card kpi"><div class="lbl">Avtomatik təyin olunub</div><div class="val">${av.length}</div><div class="cmp">siz yoxlamamısınız · ${man(cem(av))}</div></div></div>
    <div class="ced-ust" style="margin-top:14px"><div class="seg" id="mxf">${[['hamisi', 'Hamısı'], ['xid', 'Xidmətlər'], ['yox', 'Avtomatik olanlar'], ['qar', 'Qarışıq']].map(([k, t]) => `<button data-f="${k}" class="${f === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>VÖEN</th><th>Təchizatçı</th><th class="n">Qaimə</th><th class="n">Məbləğ (ƏDV-siz)</th><th>Növ</th></tr></thead>
      <tbody>${L.map(o => `<tr><td class="muted">${esc(o.voen || '')}</td><td>${esc(qisaAd(o.ad))}${o.nov === 'qarisiq' ? `<div class="cell-sub">${o.ayri} / ${o.say} qaimə ayrıca təyin olunub</div>` : ''}</td><td class="n">${fmt(o.say)}</td><td class="n">${fmt(o.cem, 2)}</td>
        <td>${w ? `<select class="in" data-nv="${esc(o.voen)}" data-ad="${esc(o.ad || '')}" style="padding:4px 8px;width:auto;${o.nov ? '' : 'color:#7a6a55'}">${[['', `Avtomatik — ${NOV_AD[o.avto]}`], ['mal', 'Mal'], ['xidmet', 'Xidmət'], ['qarisiq', 'Qarışıq (hər qaimə ayrıca)']].map(([k, t]) => `<option value="${k}" ${(o.nov || '') === k ? 'selected' : ''}>${t}</option>`).join('')}</select>` : esc(NOV_AD[o.son] || '—')}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Siyahı boşdur</td></tr>'}</tbody></table></div>
    <p class="muted" style="font-size:12.5px;line-height:1.6">Sistem növü özü təyin edir: təchizatçının adında və ya qaimə qeydlərində xidmət əlaməti varsa (kommunal, işıq, qaz, su, rabitə, internet, bank, sığorta, icarə, təmir, nəqliyyat, reklam və s.) — <b>Xidmət</b>, yoxdursa — <b>Mal</b>. Səhv təyin olunanı siyahıdan dəyişin: seçiminiz həmin təchizatçının bütün qaimələrinə (yenilərinə də) aid olur. Həm mal, həm xidmət verən üçün "Qarışıq" seçib hər qaimənin növünü onun kartında təyin edin. Ən çox "Xidmətlər" siyahısına baxmaq kifayətdir — orada az təchizatçı olur.</p>`;
  $$('#mxf button').forEach(b => b.onclick = () => { location.hash = `#/kontragent?t=nov&f=${b.dataset.f}`; });
  $$('[data-nv]').forEach(s => s.onchange = async () => { try { await kontragentNovYaz(s.dataset.nv, s.dataset.ad, s.value); toast('Yadda saxlanıldı'); refresh(); } catch (er) { fail(er); } });
}
// Kontragentlər: Borclar / Mal-Xidmət keçidi hər iki görünüşdə eyni yerdə — başlığın altında, solda
function ktBar(on) {
  const pg = $('#page'); if (!pg) return;
  const d = document.createElement('div'); d.className = 'seg ust-seg no-print'; d.id = 'kt';
  d.innerHTML = [['', 'Borclar (531 / 211)'], ['nov', 'Mal / Xidmət']].map(([k, t]) => `<button data-t="${k}" class="${k === on ? 'on' : ''}">${t}</button>`).join('');
  pg.parentElement.insertBefore(d, pg);
  $$('button', d).forEach(b => b.onclick = () => { location.hash = '#/kontragent' + (b.dataset.t ? '?t=' + b.dataset.t : ''); });
}
async function pageKontragent(params) {
  params = params || new URLSearchParams();
  if (params.get('t') === 'nov') {
    shell('kontragent', 'Kontragentlər', 'Gələn qaimələr: mal və xidmət', ''); ktBar('nov');
    return pageMalXidmet(params);
  }
  const ist = params.get('ist') === 'geden' ? 'geden' : 'gelen', ay = params.get('ay') || ayBasi(today()), son = ayinSonu(ay), f = params.get('f') || 'hamisi';
  const hesab = ist === 'gelen' ? '531 — Təchizatçılar (kreditor borcu)' : '211 — Alıcılar (debitor borcu)';
  shell('kontragent', 'Kontragentlər', `${hesab} · ${ayAdi(ay)}`, `<div class="seg" id="kist">${[['gelen', 'Təchizatçılar (531)'], ['geden', 'Alıcılar (211)']].map(([k, t]) => `<button data-i="${k}" class="${k === ist ? 'on' : ''}">${t}</button>`).join('')}</div>
    <select class="in" id="kay" style="width:auto">${ayOpt(ay)}</select><button class="btn" onclick="window.print()">${ico('print')}PDF / Çap</button>`);
  const go = (k, v) => { const p = new URLSearchParams(params); p.set(k, v); location.hash = '#/kontragent?' + p; };
  $$('#kist button').forEach(b => b.onclick = () => go('ist', b.dataset.i));
  ktBar('');
  $('#kay').onchange = e => go('ay', e.target.value);
  const qarsi = ist === 'gelen' ? 'geden' : 'gelen';
  const [qm0, od, qq] = await Promise.all([all(() => sb.from('qaimeler').select('id,voen,kontragent,tarix,esas,edv,edvsiz,qaytarma').eq('istiqamet', ist).lte('tarix', son).order('tarix').order('id')),
    all(() => sb.from('v_qaime_odenisleri').select('qaime_id,tarix,mebleg,voen').eq('istiqamet', ist).lte('tarix', son).order('id')),
    all(() => sb.from('qaimeler').select('id,voen,kontragent,tarix,esas,edv,edvsiz').eq('istiqamet', qarsi).eq('qaytarma', true).lte('tarix', son).order('id'))]);
  // qaytarma qaimələri: əks istiqamətdəki qaytarma bu hesabın borcunu azaldır, bu istiqamətdəki qaytarma isə burada sayılmır
  const qm = qm0.filter(x => !x.qaytarma);
  const K = new Map(), al = v => { let o = K.get(v); if (!o) K.set(v, o = { voen: v, ad: '', ilk: 0, gel: 0, qay: 0, od: 0 }); return o; };
  const qV = new Map();
  qm.forEach(x => { const v = x.voen || '—', o = al(v), c = num(x.esas) + num(x.edv) + num(x.edvsiz); o.ad = x.kontragent || o.ad; qV.set(x.id, v);
    if (x.tarix < ay) o.ilk += c; else o.gel += c; });
  qq.forEach(x => { const o = al(x.voen || '—'), c = num(x.esas) + num(x.edv) + num(x.edvsiz); o.ad = o.ad || x.kontragent; if (x.tarix < ay) o.ilk -= c; else o.qay += c; });
  const varQay = qq.some(x => x.tarix >= ay);
  od.forEach(p => { const o = al(qV.get(p.qaime_id) || p.voen || '—'), m = num(p.mebleg); if (p.tarix < ay) o.ilk -= m; else o.od += m; });
  let L = [...K.values()].map(o => ({ ...o, ilk: r2(o.ilk), gel: r2(o.gel), qay: r2(o.qay), od: r2(o.od), son: r2(o.ilk + o.gel - o.qay - o.od) }))
    .filter(o => Math.abs(o.ilk) > 0.004 || o.gel > 0.004 || o.qay > 0.004 || o.od > 0.004 || Math.abs(o.son) > 0.004);
  if (f === 'borc') L = L.filter(o => o.son > 0.004);
  L.sort((a, b) => b.son - a.son || a.ad.localeCompare(b.ad));
  const S_ = k => r2(L.reduce((s, o) => s + o[k], 0)), v = n => Math.abs(n) < 0.005 ? '—' : fmt(n, 2);
  const A = await ayarlar();
  $('#page').innerHTML = `<div class="print-only" style="margin-bottom:10px"><div style="font-size:17px;font-weight:700">${esc(A.firma_adi || S.magaza.ad)}</div>
      <div style="font-size:14px;font-weight:600;margin-top:4px">${hesab} — ${ayAdi(ay)}</div></div>
    <div class="ced-ust no-print"><div class="seg" id="kf">${[['hamisi', 'Hamısı'], ['borc', 'Yalnız borcu qalanlar']].map(([k, t]) => `<button data-f="${k}" class="${k === f ? 'on' : ''}">${t}</button>`).join('')}</div>
      <span class="muted" style="font-size:13px">${L.length} kontragent</span></div>
    ${L.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>№</th><th>VÖEN</th><th>Kontragent</th><th class="n">Əvvələ qalıq</th><th class="n">${ist === 'gelen' ? 'Bu ay gələn qaimələr' : 'Bu ay gedən qaimələr'}</th>${varQay ? '<th class="n">Qaytarılan</th>' : ''}<th class="n">${ist === 'gelen' ? 'Bu ay ödənilən' : 'Bu ay alınan'}</th><th class="n">Yekun borc</th></tr></thead>
      <tbody>${L.map((o, i) => `<tr><td class="muted">${i + 1}</td><td class="muted">${esc(o.voen)}</td><td>${esc(qisaAd(o.ad))}</td><td class="n">${v(o.ilk)}</td><td class="n">${v(o.gel)}</td>${varQay ? `<td class="n">${v(o.qay)}</td>` : ''}<td class="n">${v(o.od)}</td><td class="n"><b class="${o.son > 0.004 ? 'neg' : ''}">${v(o.son)}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><td></td><td></td><td>Cəmi</td><td class="n">${fmt(S_('ilk'), 2)}</td><td class="n">${fmt(S_('gel'), 2)}</td>${varQay ? `<td class="n">${fmt(S_('qay'), 2)}</td>` : ''}<td class="n">${fmt(S_('od'), 2)}</td><td class="n">${fmt(S_('son'), 2)}</td></tr></tfoot></table></div>
      <p class="muted no-print" style="font-size:12.5px">Yekun borc = əvvələ qalıq + bu ay ${ist === 'gelen' ? 'gələn' : 'gedən'} qaimələr${varQay ? ' − qaytarılan' : ''} − bu ay ${ist === 'gelen' ? 'ödənilən' : 'alınan'}. ${ist === 'gelen' ? 'Ödənişlər "Əvəzləşmə" bölməsindən götürülür.' : ''} Mənfi rəqəm artıq ödənişi (avansı) göstərir.</p>`
      : `<div class="card empty">${ist === 'gelen' ? 'Gələn qaimə yoxdur — "Vergidən qaimə yüklə" ilə yükləyin.' : 'Gedən qaimə yoxdur.'}</div>`}`;
  $$('#kf button').forEach(b => b.onclick = () => go('f', b.dataset.f));
}
function kontragentForm(x) {
  const m = modal(x ? 'Kontragenti düzəlt' : 'Yeni kontragent', `<form id="kf">
    <div class="row2"><div class="field"><label class="f">VÖEN</label><input class="in" name="v" value="${esc(x && x.voen || '')}" maxlength="10" inputmode="numeric"></div>
      <div class="field"><label class="f">Ad</label><input class="in" name="a" value="${esc(x && x.ad || '')}" required></div></div>
    <div class="row2"><div class="field"><label class="f">Telefon</label><input class="in" name="t" value="${esc(x && x.telefon || '')}"></div>
      <div class="field"><label class="f">Bank hesabı (IBAN)</label><input class="in" name="h" value="${esc(x && x.hesab || '')}"></div></div>
    <div class="field"><label class="f">Ünvan</label><input class="in" name="u" value="${esc(x && x.unvan || '')}"></div>
    <div class="field"><label class="f">Qeyd</label><input class="in" name="q" value="${esc(x && x.qeyd || '')}"></div></form>`,
    `${x ? '<button class="btn danger" id="sil" style="margin-right:auto">Sil</button>' : ''}<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yadda saxla</button>`);
  const f = $('#kf', m);
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    const v = { voen: f.v.value.trim() || null, ad: f.a.value.trim(), telefon: f.t.value.trim() || null, hesab: f.h.value.trim() || null, unvan: f.u.value.trim() || null, qeyd: f.q.value.trim() || null };
    try { if (x) await q(sb.from('kontragentler').update(v).eq('id', x.id)); else await q(sb.from('kontragentler').insert(v)); closeModal(); toast('Yadda saxlanıldı'); refresh(); } catch (er) { fail(er); }
  };
  if ($('#sil', m)) $('#sil', m).onclick = async () => { if (!await tesdiq('Kontragent silinsin? (qaimələrə toxunulmur)')) return;
    try { await q(sb.from('kontragentler').delete().eq('id', x.id)); closeModal(); toast('Silindi'); refresh(); } catch (er) { fail(er); } };
}

/* =====================================================================
   MÜHASİBAT — iş masası: üst panel, açıq səhifə tabları, hesabatlar,
   ödənişlər, ƏDV, depozit, alış aktları, xəbərdarlıqlar
   ===================================================================== */
const MUH_BASLIQ = Object.fromEntries(NAV_M.map(n => [n[0], n[1]]));
function mTablar() {
  const k = 'mtab_' + (S.magaza && S.magaza.id);
  if (!S.mtab || S.mtab.k !== k) { let l = []; try { l = JSON.parse(localStorage.getItem(k) || '[]'); } catch (_) {} S.mtab = { k, l: Array.isArray(l) ? l : [] }; }
  return S.mtab;
}
function mTabQeyd(p, h) {
  if (!MUH_BASLIQ[p]) return;
  const T = mTablar(), v = T.l.find(x => x.p === p);
  if (v) v.h = h; else T.l.push({ p, h });
  if (T.l.length > 14) T.l.shift();
  try { localStorage.setItem(T.k, JSON.stringify(T.l)); } catch (_) {}
}
function mTabBag(p) {
  const T = mTablar(), i = T.l.findIndex(x => x.p === p); if (i < 0) return;
  T.l.splice(i, 1); try { localStorage.setItem(T.k, JSON.stringify(T.l)); } catch (_) {}
  if (location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] === p) { const n = T.l[Math.min(i, T.l.length - 1)]; location.hash = n ? n.h : '#/cedvel'; } else route();
}
function mUstPanel(active) {
  const T = mTablar(), sonYuk = (() => { try { return localStorage.getItem('son_yukleme_' + S.magaza.id); } catch (_) { return null; } })();
  return `<div class="mtop">
      <label class="mtop-sirket"><span>Şirkət</span><select id="msirket">${(S.firmalar.length ? S.firmalar : [{ id: S.magaza.id, ad: S.magaza.ad }]).map(x => `<option value="${x.id}" ${x.id === S.magaza.id ? 'selected' : ''}>${esc(x.ad)}</option>`).join('')}</select></label>
      <button class="btn sm" id="mkart">Kart</button>
      <span class="mpill ${S.aktiv ? 'ok' : 'xeta'}">${S.magaza.dayandirilib ? 'Dayandırılıb' : S.aktiv ? `Abunə: ${S.qalan} gün` : 'Abunə bitib'}</span>
      ${sonYuk ? `<span class="mpill">Son yükləmə: ${esc(sonYuk)}</span>` : ''}
      <span style="flex:1"></span>
      ${canWrite() ? `<button class="btn sm" id="mq-yuk">${ico('up')}Vergidən qaimə yüklə</button><button class="btn sm" id="mb-yuk">${ico('up')}Bank çıxarışı</button>` : ''}
    </div>
    <div class="mtabs">${T.l.map(x => `<a href="${esc(x.h)}" class="${x.p === active ? 'on' : ''}">${esc(MUH_BASLIQ[x.p] || x.p)}<i data-tx="${x.p}" title="Bağla">×</i></a>`).join('')}</div>`;
}
function mUstBagla() {
  if (!$('.mtop')) return;
  $('#msirket').onchange = e => firmaSec(+e.target.value);
  const on = $('.mtabs a.on'); if (on) { const t = $('.mtabs'); t.scrollLeft = on.offsetLeft - t.clientWidth / 2 + on.clientWidth / 2; }
  $('#mkart').onclick = () => sirketKarti().catch(fail);
  $$('[data-tx]').forEach(i => i.onclick = e => { e.preventDefault(); e.stopPropagation(); mTabBag(i.dataset.tx); });
  if ($('#mq-yuk')) $('#mq-yuk').onclick = () => qaimeIdxal('gelen');
  if ($('#me-yuk')) $('#me-yuk').onclick = evezIdxal;
  if ($('#mb-yuk')) $('#mb-yuk').onclick = async () => { const bh = await bankHesablari(); bankIdxal(bh[0] && bh[0].id, bh); };
  if ($('#mg-yen')) $('#mg-yen').onclick = () => gomrukForm('idxal', null);
}
const REKVIZIT = [['firma_adi', 'Hüquqi ad'], ['firma_voen', 'VÖEN'], ['firma_unvan', 'Hüquqi ünvan'], ['firma_telefon', 'Telefon'], ['direktor', 'Direktor'],
  ['bas_muhasib', 'Baş mühasib'], ['bank_adi', 'Bank'], ['bank_kod', 'Bank kodu / SWIFT'], ['iban', 'Hesab (IBAN)'], ['edv_payer', 'ƏDV ödəyicisi'], ['vergi_rejimi', 'Vergi rejimi'], ['huquqi_forma', 'Hüquqi forma']];
// VÖEN-in son rəqəmi: 1 — hüquqi şəxs, 2 — fiziki şəxs (fərdi sahibkar)
const fsMi = A => A.huquqi_forma ? A.huquqi_forma === 'Fərdi sahibkar' : String(A.firma_voen || '').replace(/\D/g, '').slice(-1) === '2';
async function sirketKarti() {
  const A = await ayarlar();
  const m = modal('Şirkət kartı', `<table class="t"><tbody>${REKVIZIT.map(([k, t]) => `<tr><td class="muted" style="width:170px">${t}</td><td><b>${esc(A[k] || (k === 'firma_adi' ? S.magaza.ad : '') || '—')}</b></td></tr>`).join('')}</tbody></table>`,
    `<button class="btn" id="kkop">Kopyala</button>${canWrite() ? '<a class="btn primary" href="#/ayarlar" data-close>Düzəlt</a>' : ''}`);
  $('#kkop', m).onclick = () => { const t = REKVIZIT.map(([k, n]) => `${n}: ${A[k] || (k === 'firma_adi' ? S.magaza.ad : '') || ''}`).join('\n'); navigator.clipboard && navigator.clipboard.writeText(t); toast('Rekvizitlər kopyalandı'); };
}
async function ayarYaz(A, k, v) {
  if ((A[k] || '') === v) return;
  if (k in A) await q(sb.from('ayarlar').update({ deyer: v }).eq('acar', k)); else await q(sb.from('ayarlar').insert({ acar: k, deyer: v }));
}

/* ---------- Dövr seçimi (hesabatlar üçün) ---------- */
function dovrHesabla(n) {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth();
  const f = (a, b) => [iso(a), iso(b)];
  if (n === 'buay') return f(new Date(y, m, 1), new Date(y, m + 1, 0));
  if (n === 'kecenay') return f(new Date(y, m - 1, 1), new Date(y, m, 0));
  if (n === 'burub') { const r = Math.floor(m / 3) * 3; return f(new Date(y, r, 1), new Date(y, r + 3, 0)); }
  if (n === 'kecenrub') { const r = Math.floor(m / 3) * 3 - 3; return f(new Date(y, r, 1), new Date(y, r + 3, 0)); }
  if (n === 'kecenil') return f(new Date(y - 1, 0, 1), new Date(y - 1, 11, 31));
  return f(new Date(y, 0, 1), new Date(y, 11, 31));
}
const DOVRLER = [['buay', 'Bu ay'], ['kecenay', 'Keçən ay'], ['burub', 'Bu rüb'], ['kecenrub', 'Keçən rüb'], ['buil', 'Bu il'], ['kecenil', 'Keçən il']];
function dovrPanel(params, yol) {
  const [a0, b0] = dovrHesabla('buil'); const a = params.get('a') || a0, b = params.get('b') || b0;
  return { a, b, html: `<div class="dovr"><span class="muted">Dövr:</span><input class="in" type="date" id="da" value="${a}"><span>—</span><input class="in" type="date" id="db" value="${b}">
    ${DOVRLER.map(([k, t]) => `<button class="btn sm" data-dv="${k}">${t}</button>`).join('')}</div>`,
    bagla: () => { const go = (x, y) => { const p = new URLSearchParams(params); p.set('a', x); p.set('b', y); location.hash = `${yol}?${p}`; };
      $('#da').onchange = () => go($('#da').value, $('#db').value); $('#db').onchange = () => go($('#da').value, $('#db').value);
      $$('[data-dv]').forEach(x => x.onclick = () => go(...dovrHesabla(x.dataset.dv))); } };
}

/* ---------- Bu gün ---------- */
async function pageBugun() {
  await pageMPanel();
  const X = await xeberdarliqlar().catch(() => []);
  if (!location.hash.startsWith('#/bugun')) return;
  const box = document.createElement('div'); box.className = 'card'; box.style.marginTop = '16px'; box.style.padding = '0';
  box.innerHTML = `<h3 style="padding:18px 20px 0">Xəbərdarlıqlar</h3>${xeberSiyahi(X.slice(0, 6))}${X.length > 6 ? `<div style="padding:0 20px 14px"><a href="#/xeber">Hamısı (${X.length}) →</a></div>` : ''}`;
  $('#page').appendChild(box);
}

/* ---------- Qaimələr (gələn + gedən bir yerdə) ---------- */
async function pageQaime(params) {
  const ist = params.get('ist') || '', w = canWrite(), gor = params.get('v') === 'tam' ? 'tam' : '';
  const D = dovrPanel(params, '#/qaime');
  shell('qaime', 'Qaimələr', 'Elektron qaimə-fakturalar', `<div class="seg" id="qgor">${[['', 'Sadə'], ['tam', 'e-taxes görünüşü']].map(([k, t]) => `<button data-v="${k}" class="${gor === k ? 'on' : ''}" title="${k ? 'Yüklənmiş Excel-in bütün sütunları' : 'Əsas sütunlar'}">${t}</button>`).join('')}</div><div class="seg" id="qist">${[['', 'Hamısı'], ['gelen', 'Gələn'], ['geden', 'Gedən']].map(([k, t]) => `<button data-i="${k}" class="${ist === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    ${w ? `<button class="btn" id="qy1">${ico('up')}Gələnləri yüklə</button><button class="btn" id="qy2">${ico('up')}Gedənləri yüklə</button><button class="btn" id="qyeni">${ico('plus')}Yeni qaimə</button><button class="btn primary" id="qode">₼ Ödəniş et</button>` : ''}`);
  $$('#qist button').forEach(b => b.onclick = () => { const p = new URLSearchParams(params); if (b.dataset.i) p.set('ist', b.dataset.i); else p.delete('ist'); location.hash = '#/qaime?' + p; });
  $$('#qgor button').forEach(b => b.onclick = () => { const p = new URLSearchParams(params); if (b.dataset.v) p.set('v', b.dataset.v); else p.delete('v'); location.hash = '#/qaime?' + p; });
  if ($('#qy1')) { $('#qy1').onclick = () => qaimeIdxal('gelen'); $('#qy2').onclick = () => qaimeIdxal('geden'); $('#qyeni').onclick = () => qaimeForm(ist || 'gelen', null); $('#qode').onclick = () => topluOdenis(ist || 'gelen'); }
  const rows = await all(() => { let s = sb.from('v_qaimeler').select('*').gte('tarix', D.a).lte('tarix', D.b); if (ist) s = s.eq('istiqamet', ist); return s.order('tarix', { ascending: false }).order('id', { ascending: false }); });
  const sum = (l, k) => l.reduce((a, r) => a + num(r[k]), 0), g = rows.filter(r => r.istiqamet === 'gelen'), d = rows.filter(r => r.istiqamet === 'geden');
  $('.topbar .sub').textContent = `${rows.length} qaimə · gələn ${man(sum(g, 'cem'))} · gedən ${man(sum(d, 'cem'))}`;
  const sdl = await all(() => sb.from('qaimeler').select('id,istiqamet,seriya,nomre,kontragent,tarix,kohne_status,status,status_deyisib,esas,edv,edvsiz').eq('status_bax', false).order('status_deyisib', { ascending: false })).catch(() => []);
  const sdHtml = sdl.length ? `<div class="card" style="border-left:4px solid #c0392b;margin-bottom:14px;padding:14px 16px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><b>${sdl.length} qaimənin statusu e-taxes-də dəyişib</b>${w ? '<button class="btn sm" id="sdbax">Hamısına baxdım</button>' : ''}</div>
      <table class="t" data-flt="0" style="margin-top:8px"><thead><tr><th>Qaimə</th><th>Kontragent</th><th>Tarix</th><th>Əvvəl</th><th>İndi</th><th>Dəyişdi</th>${w ? '<th></th>' : ''}</tr></thead><tbody>${sdl.map(x => `<tr><td style="white-space:nowrap">${esc(x.seriya || '')} ${esc(x.nomre || '')}</td><td>${esc(qisaAd(x.kontragent))}</td><td>${fd(x.tarix)}</td>
        <td class="muted">${esc(x.kohne_status || '—')}</td><td><b class="${LEGV_RE.test(x.status || '') ? 'neg' : ''}">${esc(x.status || '')}</b></td><td>${fd(String(x.status_deyisib).slice(0, 10))}</td>${w ? `<td><button class="btn sm" data-sdb="${x.id}">Baxdım</button></td>` : ''}</tr>`).join('')}</tbody></table></div>` : '';
  $('#page').innerHTML = `${sdHtml}${D.html}<div class="hes-link"><span class="muted">Hesabatlar:</span>${[['dinamika', 'Aylıq dinamika'], ['kxulase', 'Kontragent xülasəsi'], ['quzles', 'Qaimələr üzrə üzləşmə'], ['yaslanma', 'Borcların yaşlanması']].map(([k, t]) => `<a class="chip" href="#/hesab?r=${k}">${t}</a>`).join('')}</div>
    ${rows.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>İstiqamət</th><th>Tarix</th><th>Seriya / №</th><th>VÖEN</th><th>Kontragent</th><th class="n">Əsas</th><th class="n">ƏDV</th><th class="n">Cəm</th><th class="n">Ödənilib</th><th class="n">Qalıq</th><th>Vəziyyət</th><th class="hide-m">e-taxes</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="click" data-q="${r.id}"><td><span class="badge ${r.istiqamet === 'gelen' ? 'b-blue' : 'b-amber'}">${r.istiqamet === 'gelen' ? 'Gələn' : 'Gedən'}</span>${r.qaytarma ? ' <span class="badge b-red">Qaytarma</span>' : ''}</td><td class="nw">${fd(r.tarix)}</td><td class="nw">${esc(qaimeNo(r))}</td><td class="muted nw">${esc(r.voen || '')}</td><td class="kname" title="${esc(qisaAd(r.kontragent))}">${esc(qisaAd(r.kontragent))}</td>
        <td class="n">${fmt(r.esas, 2)}</td><td class="n">${fmt(r.edv, 2)}</td><td class="n"><b>${fmt(r.cem, 2)}</b></td><td class="n">${fmt(r.odenilib, 2)}</td><td class="n"><b class="${num(r.qaliq) > 0.005 ? 'neg' : ''}">${fmt(r.qaliq, 2)}</b></td><td class="nw">${odenisBadge(r)}</td><td class="hide-m muted nw">${esc(r.status || '')}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>${rows.length}</td><td></td><td></td><td></td><td></td><td class="n">${fmt(sum(rows, 'esas'), 2)}</td><td class="n">${fmt(sum(rows, 'edv'), 2)}</td><td class="n">${fmt(sum(rows, 'cem'), 2)}</td><td class="n">${fmt(sum(rows, 'odenilib'), 2)}</td><td class="n">${fmt(sum(rows, 'qaliq'), 2)}</td><td></td><td class="hide-m"></td></tr></tfoot></table></div>`
      : `<div class="card empty" style="padding:40px 20px"><div style="font-size:17px;font-weight:600;margin-bottom:6px">Bu dövrdə qaimə yoxdur</div><div class="muted">e-taxes.gov.az-dan qaimələrin siyahısını Excel kimi yükləyib "Gələnləri yüklə" / "Gedənləri yüklə" ilə köçürün.</div></div>`}`;
  D.bagla();
  $$('[data-q]').forEach(tr => tr.onclick = () => qaimeKart(rows.find(r => r.id === +tr.dataset.q)));
  if (gor === 'tam' && rows.length && $('#page .tbl-wrap')) {
    const xr = await all(() => { let z = sb.from('qaimeler').select('id,xam').gte('tarix', D.a).lte('tarix', D.b); if (ist) z = z.eq('istiqamet', ist); return z.order('id'); });
    const XM = new Map(xr.map(x => [x.id, x.xam || {}])), kol = [];
    const Ax = await ayarlar(); let sira = []; try { sira = [...JSON.parse(Ax.xam_sira_gelen || '[]'), ...JSON.parse(Ax.xam_sira_geden || '[]')]; } catch (_) {}
    sira.forEach(k => { if (k !== '№' && !kol.includes(k) && xr.some(x => x.xam && k in x.xam)) kol.push(k); });
    xr.forEach(x => Object.keys(x.xam || {}).forEach(k => { if (k !== '№' && !kol.includes(k)) kol.push(k); }));
    const say = v => typeof v === 'number' ? fmt(v, Math.abs(v % 1) > 0 ? 2 : 0) : esc(v);
    const isNum = k => xr.some(x => x.xam && typeof x.xam[k] === 'number');
    $$('#page .flt-bar, #page .flt-pager').forEach(x => x.remove());
    $('#page .tbl-wrap').outerHTML = kol.length ? `<div class="tbl-wrap"><table class="t xam-t"><thead><tr>${kol.map(k => `<th class="${isNum(k) ? 'n' : ''}">${esc(k)}</th>`).join('')}<th class="n">Ödənilib</th><th class="n">Qalıq</th></tr></thead>
      <tbody>${rows.map(r => { const x = XM.get(r.id) || {}; return `<tr class="click" data-q="${r.id}">${kol.map(k => `<td class="${typeof x[k] === 'number' ? 'n' : ''}">${x[k] == null ? '' : say(x[k])}</td>`).join('')}<td class="n">${fmt(r.odenilib, 2)}</td><td class="n"><b class="${num(r.qaliq) > 0.005 ? 'neg' : ''}">${fmt(r.qaliq, 2)}</b></td></tr>`; }).join('')}</tbody></table></div>`
      : '<div class="card empty">Bu qaimələr bütün sütunlar saxlanmazdan əvvəl yüklənib. e-taxes faylını yenidən yükləyin — təkrar qaimə yaranmayacaq, sadəcə bütün sütunlar əlavə olunacaq.</div>';
    $$('[data-q]').forEach(tr => tr.onclick = () => qaimeKart(rows.find(r => r.id === +tr.dataset.q)));
  }
  $$('[data-sdb]').forEach(b => b.onclick = async () => { try { await q(sb.from('qaimeler').update({ status_bax: true }).eq('id', +b.dataset.sdb)); refresh(); } catch (er) { fail(er); } });
  if ($('#sdbax')) $('#sdbax').onclick = async () => { try { await q(sb.from('qaimeler').update({ status_bax: true }).eq('status_bax', false)); refresh(); } catch (er) { fail(er); } };
}

/* ---------- Alış aktları ---------- */
async function pageAkt(params) {
  const w = canWrite(), D = dovrPanel(params, '#/akt');
  shell('akt', 'Alış aktları', 'Fiziki şəxslərdən alışın elektron aktları', w ? `<button class="btn" id="aidx">${ico('up')}Excel-dən yüklə</button><button class="btn primary" id="ayeni">${ico('plus')}Yeni akt</button>` : '');
  const rows = await all(() => sb.from('alis_aktlari').select('*').gte('tarix', D.a).lte('tarix', D.b).order('tarix', { ascending: false }));
  if ($('#ayeni')) { $('#ayeni').onclick = () => aktForm(null); $('#aidx').onclick = aktIdxal; }
  const sum = k => rows.reduce((a, r) => a + num(r[k]), 0);
  $('.topbar .sub').textContent = `${rows.length} akt · cəmi ${man(sum('mebleg'))} · ödənilməmiş ${man(sum('mebleg') - sum('odenilib'))}`;
  $('#page').innerHTML = `${D.html}<p class="muted" style="font-size:13px">Akt fiziki şəxsin kreditor borcudur (aktın tam məbləği, ƏDV-yə düşmür); ödəniş qeyd olunana qədər açıq qalır.</p>
    ${rows.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Tarix</th><th>Seriya / №</th><th>Satıcı</th><th>FİN</th><th>Mal / xidmət</th><th class="n">Məbləğ</th><th class="n">Ödənilib</th><th class="n">Qalıq</th><th>Vəziyyət</th></tr></thead>
      <tbody>${rows.map(r => { const q_ = r2(num(r.mebleg) - num(r.odenilib)); return `<tr class="${w ? 'click' : ''}" data-a="${r.id}"><td>${fd(r.tarix)}</td><td>${esc([r.seriya, r.nomre].filter(Boolean).join(' '))}</td><td>${esc(r.satici)}</td><td class="muted">${esc(r.fin || '')}</td><td>${esc(r.mal || '')}</td>
        <td class="n"><b>${fmt(r.mebleg, 2)}</b></td><td class="n">${fmt(r.odenilib, 2)}</td><td class="n"><b class="${q_ > 0 ? 'neg' : ''}">${fmt(q_, 2)}</b></td><td>${q_ <= 0.005 ? '<span class="badge b-green">Ödənilib</span>' : num(r.odenilib) > 0 ? '<span class="badge b-amber">Qismən</span>' : '<span class="badge b-gray">Açıq</span>'}</td></tr>`; }).join('')}</tbody>
      <tfoot><tr><td>${rows.length}</td><td></td><td></td><td></td><td></td><td class="n">${fmt(sum('mebleg'), 2)}</td><td class="n">${fmt(sum('odenilib'), 2)}</td><td class="n">${fmt(sum('mebleg') - sum('odenilib'), 2)}</td><td></td></tr></tfoot></table></div>`
      : '<div class="card empty">Bu dövrdə alış aktı yoxdur</div>'}`;
  D.bagla();
  $$('[data-a]').forEach(tr => tr.onclick = () => w && aktForm(rows.find(r => r.id === +tr.dataset.a)));
}
function aktForm(r) {
  const m = modal(r ? 'Alış aktını düzəlt' : 'Yeni alış aktı', `<form id="af">
    <div class="row3"><div class="field"><label class="f">Tarix</label><input class="in" type="date" name="t" value="${r ? r.tarix : today()}" required></div>
      <div class="field"><label class="f">Seriya</label><input class="in" name="s" value="${esc(r && r.seriya || '')}"></div><div class="field"><label class="f">Nömrə</label><input class="in" name="n" value="${esc(r && r.nomre || '')}"></div></div>
    <div class="row2"><div class="field"><label class="f">Satıcı (fiziki şəxs)</label><input class="in" name="sa" value="${esc(r && r.satici || '')}" required></div>
      <div class="field"><label class="f">FİN</label><input class="in" name="fin" value="${esc(r && r.fin || '')}" maxlength="7" style="text-transform:uppercase"></div></div>
    <div class="field"><label class="f">Mal / xidmət</label><input class="in" name="mal" value="${esc(r && r.mal || '')}"></div>
    <div class="row3"><div class="field"><label class="f">Məbləğ</label><input class="in" type="number" step="0.01" min="0" name="m" value="${r ? r.mebleg : ''}" required></div>
      <div class="field"><label class="f">Ödənilib</label><input class="in" type="number" step="0.01" min="0" name="o" value="${r ? r.odenilib : 0}"></div>
      <div class="field"><label class="f">Ödəniş tarixi</label><input class="in" type="date" name="ot" value="${r && r.odenis_tarix || ''}"></div></div>
    <div class="field"><label class="f">Qeyd</label><input class="in" name="q" value="${esc(r && r.qeyd || '')}"></div></form>`,
    `${r ? '<button class="btn danger" id="sil" style="margin-right:auto">Sil</button>' : ''}<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yadda saxla</button>`);
  const f = $('#af', m);
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    if (num(f.o.value) > num(f.m.value)) return toast('Ödənilən məbləğ aktdan çox ola bilməz');
    const v = { tarix: f.t.value, seriya: f.s.value.trim() || null, nomre: f.n.value.trim() || null, satici: f.sa.value.trim(), fin: f.fin.value.trim().toUpperCase() || null, mal: f.mal.value.trim() || null,
      mebleg: r2(f.m.value), odenilib: r2(f.o.value), odenis_tarix: f.ot.value || (num(f.o.value) > 0 ? today() : null), qeyd: f.q.value.trim() || null };
    try { if (r) await q(sb.from('alis_aktlari').update(v).eq('id', r.id)); else await q(sb.from('alis_aktlari').insert(v)); closeModal(); toast('Yadda saxlanıldı'); refresh(); } catch (er) { fail(er); }
  };
  if ($('#sil', m)) $('#sil', m).onclick = async () => { if (!await tesdiq('Akt silinsin?')) return; try { await q(sb.from('alis_aktlari').delete().eq('id', r.id)); closeModal(); toast('Silindi'); refresh(); } catch (er) { fail(er); } };
}
function aktIdxal() {
  idxalPencere({
    basliq: 'Alış aktlarını yüklə', izah: 'e-taxes.gov.az-dan elektron alış aktlarının siyahısını Excel kimi yükləyib seçin.',
    saheler: [{ k: 'tarix', ad: 'Tarix', lazim: true, tip: 'tarix', ox: ['tarix', 'aktıntarixi', 'date'] }, { k: 'seriya', ad: 'Seriya', ox: ['seriya'] }, { k: 'nomre', ad: 'Nömrə', ox: ['nömrə', 'nomre', 'aktınnömrəsi'] },
      { k: 'satici', ad: 'Satıcı', lazim: true, ox: ['satıcı', 'satıcınınadı', 'fizikişəxs', 'adsoyad', 'ad'] }, { k: 'fin', ad: 'FİN', ox: ['fin', 'satıcınınfini', 'fərdiidentifikasiyanömrəsi'] },
      { k: 'mal', ad: 'Mal / xidmət', ox: ['mal', 'malınadı', 'xidmət', 'məhsul'] }, { k: 'mebleg', ad: 'Məbləğ', lazim: true, tip: 'eded', ox: ['məbləğ', 'mebleg', 'cəmi', 'dəyər'] }],
    numune: [['10.11.2026', 'AA', '000123', 'Əli Məmmədov', '5ABCDE1', 'Kartof 500 kq', 250]],
    yaz: async (rows, ir) => { const v = rows.map(r => ({ tarix: r.tarix, seriya: r.seriya, nomre: r.nomre, satici: r.satici, fin: r.fin ? String(r.fin).toUpperCase() : null, mal: r.mal, mebleg: r2(r.mebleg) }));
      let i = 0; for (const h of hisse(v, 500)) { await q(sb.from('alis_aktlari').insert(h)); i += h.length; ir(i, v.length); } return `${v.length} akt yükləndi`; },
  });
}

/* ---------- Ödənişlər ---------- */
// Əvəzləşmə faylı (mühasibin öz Excel-i): hər qaimə üzrə aylar üzrə ödənilmiş əsas/ƏDV və qalıq. Qaimələrin ödəniş vəziyyəti üçün əsas mənbə budur.
const AY_ADLARI = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];
function evezFaylOxu(rows) {
  const N = c => normBas(c == null ? '' : c);
  const hi = rows.findIndex(r => r.some(c => N(c) === 'seriyası' || N(c) === 'seriya') && r.some(c => N(c) === 'nömrəsi' || N(c) === 'nömrə'));
  if (hi < 0) throw new Error('Başlıq sətri tapılmadı (Seriyası, Nömrəsi sütunları olmalıdır)');
  const H = rows[hi].map(N), col = (...a) => H.findIndex(h => a.some(x => h === x || h.startsWith(x)));
  const c = { ad: col('əldəediləndqaimələr', 'əldəedilənqaimələr', 'kontragent', 'adı', 'təchizatçı'), voen: col('vöen'), ser: col('seriyası', 'seriya'), no: col('nömrəsi', 'nömrə'), tarix: col('tarix'), esas: col('əsasməbləğ', 'əsas'), edv: col('ədv'), qal: col('qalıq') };
  if (c.voen < 0 || c.esas < 0 || c.edv < 0) throw new Error('VÖEN, Əsas məbləğ və ƏDV sütunları tapılmadı');
  // ay adları başlıqdan sonrakı sətirlərdədir; hər ayın altında Əsas / ƏDV
  const ay = []; for (let k = hi + 1; k < Math.min(hi + 4, rows.length); k++) rows[k].forEach((x, i) => { const j = AY_ADLARI.indexOf(N(x)); if (j >= 0 && ay[j] == null) ay[j] = i; });
  if (ay.filter(x => x != null).length < 6) throw new Error('Ay sütunları (Yanvar … Dekabr) tapılmadı');
  const qal = c.qal >= 0 ? c.qal : null;
  const out = [];
  for (let k = hi + 1; k < rows.length; k++) {
    const r = rows[k], ser = String(r[c.ser] ?? '').trim().toUpperCase(), no = String(r[c.no] ?? '').trim().replace(/\.0+$/, '');
    const voen = String(r[c.voen] ?? '').replace(/\D/g, '');
    if (!ser || !no || !voen) continue;
    const esas = idxalEded(r[c.esas]), edv = idxalEded(r[c.edv]); if (esas == null || isNaN(esas)) continue;
    const t = c.tarix >= 0 ? idxalTarix(r[c.tarix]) : null;
    const aylar = ay.map(i => i == null ? [0, 0] : [num(idxalEded(r[i])), num(idxalEded(r[i + 1]))]);
    const qe = qal != null ? num(idxalEded(r[qal])) : null, qd = qal != null ? num(idxalEded(r[qal + 1])) : null;
    const odE = aylar.reduce((s, x) => s + x[0], 0), odD = aylar.reduce((s, x) => s + x[1], 0);
    // əvvəlki dövrlərdə ödənilən = əsas − qalıq − bu ilin ödənişləri
    const evE = qal != null ? r2(esas - qe - odE) : 0, evD = qal != null ? r2(num(edv) - qd - odD) : 0;
    out.push({ voen: voen.padStart(10, '0'), ad: c.ad >= 0 ? String(r[c.ad] ?? '').trim() : '', ser, no: no.replace(/^0+/, ''), noXam: no, tarix: t && t !== 'X' ? t : null, esas: r2(esas), edv: r2(num(edv)), aylar, evE: Math.max(0, evE), evD: Math.max(0, evD), qe: qe == null ? null : r2(qe), qd: qd == null ? null : r2(qd) });
  }
  return out;
}
function evezIdxal() {
  const il0 = +today().slice(0, 4);
  const m = modal('Əvəzləşmə faylını yüklə (ödənilmiş qaimələr)', `<div id="ev1">
      <p class="muted" style="margin-top:0;font-size:13.5px;line-height:1.55">Qaimələrin aylar üzrə ödənilmiş əsas məbləğ və ƏDV-si olan Excel faylınızı seçin (sütunlar: VÖEN, Seriyası, Nömrəsi, Tarix, Əsas məbləğ, ƏDV, Qalıq, Yanvar … Dekabr). Hansı qaimənin ödənildiyi, hansının qaldığı <b>bu fayla görə</b> yazılır: faylda olan qaimələrin əvvəlki ödəniş qeydləri əvəzlənir. Proqramda olmayan qaimələr (məs. keçən illərin) əlavə edilir.</p>
      <div class="row2" style="align-items:end"><div class="field"><label class="f">Aylar hansı ilə aiddir</label><select class="in" id="evil">${[il0, il0 - 1, il0 - 2].map(y => `<option>${y}</option>`).join('')}</select></div>
      <div class="field"><label class="btn primary" style="cursor:pointer">${ico('up')}Fayl seç (.xlsx)<input type="file" id="evf" accept=".xlsx" style="display:none"></label></div></div></div>
    <div id="ev2"></div>`, `<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="evok" disabled>Yüklə</button>`, true);
  let S_ = null;
  $('#evf', m).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const fq = evezFaylOxu(await xlsxOxu(await f.arrayBuffer()));
      if (!fq.length) throw new Error('Faylda qaimə tapılmadı');
      const qm = await all(() => sb.from('qaimeler').select('id,voen,seriya,nomre,esas,edv,edvsiz').eq('istiqamet', 'gelen').order('id'));
      const K = new Map(qm.map(x => [`${x.voen}|${String(x.seriya || '').toUpperCase()}|${String(x.nomre || '').replace(/^0+/, '')}`, x]));
      fq.forEach(x => { x.q = K.get(`${x.voen}|${x.ser}|${x.no}`) || null; });
      const tam = fq.filter(x => x.qe != null && x.qe <= 0.004 && x.qd <= 0.004).length, yeni = fq.filter(x => !x.q).length;
      const qalE = fq.reduce((s, x) => s + num(x.qe), 0), qalD = fq.reduce((s, x) => s + num(x.qd), 0);
      S_ = fq;
      $('#ev2', m).innerHTML = `<div class="kpis" style="margin:12px 0 0"><div class="kpi"><div class="l">Faylda qaimə</div><div class="v">${fq.length}</div><div class="s">${fq.length - yeni} proqramda var, ${yeni} əlavə ediləcək</div></div>
        <div class="kpi"><div class="l">Tam ödənilib</div><div class="v">${tam}</div><div class="s">${fq.length - tam} qaimədə qalıq var</div></div>
        <div class="kpi"><div class="l">Ödənilməmiş qalıq</div><div class="v">${fmt(qalE + qalD, 2)} ₼</div><div class="s">əsas ${fmt(qalE, 2)} + ƏDV ${fmt(qalD, 2)}</div></div></div>`;
      $('#evok', m).disabled = false;
    } catch (er) { toast('Faylı oxumaq olmadı: ' + er.message, 6000); }
  };
  $('#evok', m).onclick = async () => {
    const btn = $('#evok', m); btn.disabled = true; const il = +$('#evil', m).value;
    try {
      // 1) proqramda olmayan qaimələri əlavə et
      const yeni = S_.filter(x => !x.q);
      for (const h of hisse(yeni, 500)) {
        btn.textContent = 'Qaimələr əlavə edilir…';
        const r = await q(sb.from('qaimeler').insert(h.map(x => ({ istiqamet: 'gelen', voen: x.voen, kontragent: x.ad || null, seriya: x.ser, nomre: x.noXam, tarix: x.tarix || `${il}-01-01`, esas: x.esas, edv: x.edv, edvsiz: 0, status: 'Əvəzləşmə faylından', qeyd: null }))).select('id,voen,seriya,nomre,esas,edv,edvsiz'));
        r.forEach(y => { const x = h.find(z => z.voen === y.voen && z.ser === String(y.seriya).toUpperCase() && z.noXam === y.nomre); if (x) x.q = y; });
      }
      // 2) bu qaimələrin köhnə ödənişləri: bankdan gələnlər bank əməliyyatına qaytarılır (bank qalığı dəyişməsin), qalanı silinir
      const ids = S_.filter(x => x.q).map(x => x.q.id), idSet = new Set(ids);
      btn.textContent = 'Köhnə ödənişlər yoxlanılır…';
      const kohne = (await all(() => sb.from('v_qaime_odenisleri').select('id,qaime_id,tarix,mebleg,hesab_id,sened,qeyd,voen,kontragent,istiqamet').eq('istiqamet', 'gelen').order('id'))).filter(o => idSet.has(o.qaime_id) || o.sened);
      const geri = kohne.filter(o => o.hesab_id);
      for (const h of hisse(geri, 500)) await q(sb.from('bank_emeliyyatlari').insert(h.map(o => ({ hesab_id: o.hesab_id, tarix: o.tarix, nov: 'Məxaric', mebleg: o.mebleg, kateqoriya: 'Təchizatçıya ödəniş', voen: o.voen, kontragent: o.kontragent, teyinat: String(o.qeyd || '').replace(/^\[avtomatik[^\]]*\]\s*/, '').slice(0, 480) || null, sened: o.sened }))));
      for (const h of hisse(kohne.map(o => o.id), 300)) await q(sb.from('qaime_odenisleri').delete().in('id', h));
      // 3) fayldakı ödənişlər
      const son = a => { const d = ayinSonu(a); return d > today() ? today() : d; };
      const od = [];
      S_.filter(x => x.q).forEach(x => {
        if (x.evE + x.evD > 0.004) od.push({ qaime_id: x.q.id, tarix: `${il - 1}-12-31`, mebleg: r2(x.evE + x.evD), edv: x.evD, qeyd: `Əvəzləşmə faylı: ${il}-ci ilədək ödənilib` });
        x.aylar.forEach(([e, d], i) => { if (e + d > 0.004) od.push({ qaime_id: x.q.id, tarix: son(`${il}-${String(i + 1).padStart(2, '0')}-01`), mebleg: r2(e + d), edv: r2(d), qeyd: `Əvəzləşmə faylı: ${AY_ADLARI[i][0].toUpperCase() + AY_ADLARI[i].slice(1)} ${il}` }); });
        // faylda tam ödənilib, amma proqramdakı məbləğ fərqlidir — qalıq sıfırlansın
        if (x.qe != null && x.qe <= 0.004 && x.qd <= 0.004) {
          const fq = r2(num(x.q.esas) + num(x.q.edv) + num(x.q.edvsiz) - x.esas - x.edv);
          if (fq > 0.004) od.push({ qaime_id: x.q.id, tarix: son(`${il}-12-01`), mebleg: fq, edv: 0, qeyd: 'Əvəzləşmə faylına görə tam ödənilib (məbləğ fərqi)' });
        }
      });
      let i = 0; for (const h of hisse(od, 500)) { await q(sb.from('qaime_odenisleri').insert(h)); i += h.length; btn.textContent = `Ödənişlər yazılır… ${i}/${od.length}`; }
      try { localStorage.setItem('son_yukleme_' + S.magaza.id, new Date().toLocaleString('az-AZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })); } catch (_) {}
      closeModal(); S.cache = {};
      toast(`Əvəzləşmə faylı yükləndi: ${S_.length} qaimə (${yeni.length} yeni), ${od.length} ödəniş yazıldı${geri.length ? `, ${geri.length} bank ödənişi qaimədən ayrılıb bank əməliyyatına qaytarıldı` : ''}.`, 9000);
      refresh();
    } catch (er) { btn.disabled = false; btn.textContent = 'Yüklə'; fail(er); }
  };
}
/* ---------- Qaimə ödənişləri (əvəzləşmə): hansı qaimənin hansı ayda nə qədəri ödənilib ---------- */
const AY_QISA = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun', 'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];
const ayYazi = a => `${AY_QISA[+a.slice(5, 7) - 1]} ${a.slice(0, 4)}`;
async function pageCedvel(params) {
  const ay = (params.get('ay') || today().slice(0, 7)).slice(0, 7), f = 'odenen', w = canWrite();
  const ayB = ay + '-01', ayS = ayinSonu(ayB);
  const aylar = Array.from({ length: 24 }, (_, i) => { const d = new Date(today().slice(0, 7) + '-01T00:00:00'); d.setMonth(d.getMonth() + 1 - i); return iso(d).slice(0, 7); });
  shell('cedvel', 'Əvəzləşmə', 'Gələn qaimələrin aylar üzrə ödənişi', `<select class="in" id="cay" style="width:auto">${aylar.map(a => `<option value="${a}" ${a === ay ? 'selected' : ''}>${ayYazi(a)}</option>`).join('')}</select>
    <button class="btn primary" id="cgot">${ico('down')}Əvəzləşən qaimələri götür</button>`);
  const go = (k, v) => { const p = new URLSearchParams(params); p.set(k, v); location.hash = '#/cedvel?' + p; };
  $('#cay').onchange = e => go('ay', e.target.value);
  const [qm, od] = await Promise.all([
    all(() => sb.from('qaimeler').select('id,voen,kontragent,seriya,nomre,tarix,esas,edv,edvsiz').eq('istiqamet', 'gelen').lte('tarix', ayS).order('tarix').order('id')),
    all(() => sb.from('v_qaime_odenisleri').select('id,qaime_id,tarix,mebleg,edv,qeyd').eq('istiqamet', 'gelen').order('tarix').order('id'))]);
  const Q = new Map(qm.map(x => [x.id, { ...x, E: r2(num(x.esas) + num(x.edvsiz)), D: r2(num(x.edv)), pE: 0, pD: 0, bE: 0, bD: 0, ids: [], hamisi: [] }]));
  od.forEach(o => { const x = Q.get(o.qaime_id); if (!x) return; x.hamisi.push(o); if (o.tarix > ayS) return;
    const d = num(o.edv), e = num(o.mebleg) - d;
    if (o.tarix < ayB) { x.pE += e; x.pD += d; } else { x.bE += e; x.bD += d; x.ids.push(o.id); } });
  const hesab = x => { x.qE = r2(x.E - x.pE - x.bE); x.qD = r2(x.D - x.pD - x.bD); };
  let L = [...Q.values()]; L.forEach(hesab);
  L = L.filter(x => r2(x.E + x.D - x.pE - x.pD) > 0.004 || x.bE + x.bD > 0.004);   // ayın əvvəlinə tam ödənilmişlər görünmür
  const sec = new Set(); let axtar = '', goster = 200;
  const v = n => Math.abs(n) < 0.005 ? '' : fmt(n, 2);
  const filtrli = () => { const t = azLow(axtar.trim());
    return L.filter(x => (f === 'hamisi' || (f === 'qaliq' ? x.qE + x.qD > 0.004 : x.bE + x.bD > 0.004)) && (!t || azLow(`${x.kontragent} ${x.voen} ${x.seriya} ${x.nomre}`).includes(t))); };
  const setir = x => `<tr data-r="${x.id}">
    <td>${fd(x.tarix)}</td><td style="white-space:nowrap">${esc(x.seriya || '')} ${esc(x.nomre || '')}</td><td class="kn" title="${esc(x.kontragent || '')}">${esc(qisaAd(x.kontragent))}</td>
    <td class="n">${fmt(x.E + x.D, 2)}</td><td class="n muted">${v(x.pE + x.pD)}</td>
    <td class="n ay">${v(x.bE)}</td><td class="n ay">${v(x.bD)}</td>
    <td class="n"><b class="${x.qE + x.qD > 0.004 ? 'neg' : ''}">${v(x.qE + x.qD) || '0'}</b></td><td class="no-print"><button class="btn sm" data-tar="${x.id}" title="Ödəniş tarixçəsi">Tarixçə</button></td></tr>`;
  const ciz = () => {
    const l = filtrli(), S_ = k => r2(l.reduce((a, x) => a + x[k], 0));
    $('#page').innerHTML = `<div class="ced-ust"><b>${ayYazi(ay)}-da ödənilmiş qaimələr</b>
        <input class="in" id="cax" placeholder="Axtar: kontragent, VÖEN, nömrə…" value="${esc(axtar)}" style="max-width:280px"></div>
      <div class="tbl-wrap"><table class="t ced2" data-flt="0"><thead><tr><th>Tarix</th><th>Qaimə</th><th>Kontragent</th><th class="n">Qaimənin məbləği</th><th class="n">Əvvəl ödənilib</th>
          <th class="n ay">${ayYazi(ay)}<br><small>əsas</small></th><th class="n ay">${ayYazi(ay)}<br><small>ƏDV</small></th><th class="n">Qalıq</th><th class="no-print"></th></tr></thead>
        <tbody>${l.slice(0, goster).map(setir).join('') || `<tr><td colspan="9" class="empty">Bu ayda ödənilmiş qaimə yoxdur</td></tr>`}</tbody>
        <tfoot><tr><td colspan="3">Cəmi — ${l.length} qaimə</td><td class="n">${fmt(S_('E') + S_('D'), 2)}</td><td class="n">${fmt(S_('pE') + S_('pD'), 2)}</td><td class="n" id="cbe">${fmt(S_('bE'), 2)}</td><td class="n" id="cbd">${fmt(S_('bD'), 2)}</td><td class="n" id="cq">${fmt(S_('qE') + S_('qD'), 2)}</td><td></td></tr></tfoot></table></div>
      ${l.length > goster ? `<div style="text-align:center;margin:10px"><button class="btn" id="cdaha">Daha çox göstər (${l.length - goster} qalıb)</button></div>` : ''}
      <div class="ced-alt" id="calt" style="display:none"></div>
      <p class="muted no-print" style="font-size:12.5px;margin-top:10px">Ödənişlər <a href="#/qaime?ist=gelen">Qaimələr</a> bölməsində ("₼ Ödəniş et" və ya qaimənin kartı) yazılır və buraya özü düşür. Başqa ayın ödənişlərinə baxmaq üçün yuxarıdan ayı seçin.</p>`;
    $$('#cf button').forEach(b => b.onclick = () => go('f', b.dataset.f));
    $('#cax').oninput = e => { axtar = e.target.value; clearTimeout(ciz.t); ciz.t = setTimeout(() => { ciz(); const i = $('#cax'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
    if ($('#cdaha')) $('#cdaha').onclick = () => { goster += 500; ciz(); };
    $$('[data-tar]').forEach(b => b.onclick = e => { e.stopPropagation(); tarixce(Q.get(+b.dataset.tar)); });
    if (false) {
      $('#call').onchange = e => { l.slice(0, goster).forEach(x => e.target.checked ? sec.add(x.id) : sec.delete(x.id)); ciz(); };
      $('.ced2 tbody').onchange = e => { const id = +e.target.dataset.s; if (!id) return; e.target.checked ? sec.add(id) : sec.delete(id); e.target.closest('tr').classList.toggle('sel', e.target.checked); altPanel(); };
      $('.ced2 tbody').onclick = e => { const td = e.target.closest('td.ec'); if (td && !td.querySelector('input')) xanaRed(td); };
      $('.ced2 tbody').ondblclick = e => { const td = e.target.closest('td.ec'); if (!td) return; const x = Q.get(+td.parentNode.dataset.r);
        if (x.qE + x.qD > 0.004) yaz(x, r2(x.bE + Math.max(0, x.qE)), r2(x.bD + Math.max(0, x.qD))); };
    }
    altPanel();
  };
  const altPanel = () => {
    const b = $('#calt'); if (!b) return; const s = L.filter(x => sec.has(x.id));
    if (!s.length) { b.style.display = 'none'; return; }
    const qE = s.reduce((a, x) => a + Math.max(0, x.qE), 0), qD = s.reduce((a, x) => a + Math.max(0, x.qD), 0);
    b.style.display = ''; b.innerHTML = `<b>${s.length}</b> qaimə seçilib · qalıq: <b>${fmt(qE + qD, 2)} ₼</b> (əsas ${fmt(qE, 2)} + ƏDV ${fmt(qD, 2)})
      <button class="btn primary sm" id="code">${ayYazi(ay)}-da ödənilmiş et</button><button class="btn sm" id="csil">Seçimi təmizlə</button>`;
    $('#csil').onclick = () => { sec.clear(); ciz(); };
    $('#code').onclick = async () => { $('#code').disabled = true;
      try { for (const x of s) if (x.qE + x.qD > 0.004) await yaz(x, r2(x.bE + Math.max(0, x.qE)), r2(x.bD + Math.max(0, x.qD)), true); sec.clear(); toast(`${s.length} qaimə ${ayYazi(ay)}-da ödənilmiş yazıldı`); ciz(); } catch (er) { fail(er); ciz(); } };
  };
  const xanaRed = td => {
    const x = Q.get(+td.parentNode.dataset.r), k = td.dataset.k, kohne = k === 'e' ? x.bE : x.bD;
    td.innerHTML = `<input class="ced-in" value="${Math.abs(kohne) < 0.005 ? '' : r2(kohne)}">`; const inp = td.firstChild; inp.focus(); inp.select();
    let bitdi = false;
    const bitir = async saxla => { if (bitdi) return; bitdi = true;
      const n = idxalEded(inp.value); if (!saxla || n == null && inp.value.trim() || Number.isNaN(n) || r2(n || 0) === r2(kohne)) { td.textContent = v(kohne); return; }
      await yaz(x, k === 'e' ? r2(n || 0) : r2(x.bE), k === 'd' ? r2(n || 0) : r2(x.bD)); };
    inp.onkeydown = e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); bitir(true).then(() => { if (e.key === 'Tab' && k === 'e') { const n2 = $(`tr[data-r="${x.id}"] td[data-k="d"]`); if (n2) xanaRed(n2); } }); } else if (e.key === 'Escape') bitir(false); };
    inp.onblur = () => bitir(true);
  };
  const yaz = async (x, e, d, sessiz) => {
    const tarix = ayS > today() && ay === today().slice(0, 7) ? today() : ayS;
    try {
      if (e + d <= 0.004) { if (x.ids.length) await q(sb.from('qaime_odenisleri').delete().in('id', x.ids)); x.ids = []; }
      else if (x.ids.length === 1) await q(sb.from('qaime_odenisleri').update({ mebleg: r2(e + d), edv: r2(d) }).eq('id', x.ids[0]));
      else { if (x.ids.length) await q(sb.from('qaime_odenisleri').delete().in('id', x.ids));
        const r = await q(sb.from('qaime_odenisleri').insert({ qaime_id: x.id, tarix, mebleg: r2(e + d), edv: r2(d), qeyd: `Əvəzləşmə: ${ayYazi(ay)}` }).select('id').single()); x.ids = [r.id]; }
      x.bE = e; x.bD = d; hesab(x);
      if (!sessiz) { const tr = $(`tr[data-r="${x.id}"]`); if (tr) { const y = document.createElement('tbody'); y.innerHTML = setir(x); tr.replaceWith(y.firstChild); }
        const l = filtrli(), S_ = k => r2(l.reduce((a, z) => a + z[k], 0)); if ($('#cbe')) { $('#cbe').textContent = fmt(S_('bE'), 2); $('#cbd').textContent = fmt(S_('bD'), 2); $('#cq').textContent = fmt(S_('qE') + S_('qD'), 2); }
        $$(`[data-tar="${x.id}"]`).forEach(b => b.onclick = ev => { ev.stopPropagation(); tarixce(x); }); altPanel(); }
    } catch (er) { fail(er); ciz(); }
  };
  const tarixce = x => {
    const h = x.hamisi.slice().sort((a, b) => a.tarix < b.tarix ? -1 : 1);
    modal(`${esc(x.seriya || '')} ${esc(x.nomre || '')} — ödəniş tarixçəsi`, `<div class="muted" style="font-size:13px;margin-bottom:10px">${esc(x.kontragent || '')} · ${esc(x.voen || '')} · ${fd(x.tarix)}<br>Qaimə: əsas ${fmt(x.E, 2)} + ƏDV ${fmt(x.D, 2)} = <b>${fmt(x.E + x.D, 2)} ₼</b></div>
      ${h.length ? `<table class="t" data-flt="0"><thead><tr><th>Ay</th><th class="n">Əsas</th><th class="n">ƏDV</th><th class="n">Cəmi</th></tr></thead><tbody>${h.map(o => `<tr><td>${ayYazi(o.tarix.slice(0, 7))}</td><td class="n">${fmt(num(o.mebleg) - num(o.edv), 2)}</td><td class="n">${fmt(o.edv, 2)}</td><td class="n"><b>${fmt(o.mebleg, 2)}</b></td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Cəmi ödənilib</td><td class="n">${fmt(h.reduce((a, o) => a + num(o.mebleg) - num(o.edv), 0), 2)}</td><td class="n">${fmt(h.reduce((a, o) => a + num(o.edv), 0), 2)}</td><td class="n">${fmt(h.reduce((a, o) => a + num(o.mebleg), 0), 2)}</td></tr></tfoot></table>` : '<div class="empty">Hələ ödəniş yoxdur</div>'}
      <p class="muted" style="font-size:12.5px">Hər ayın ödənişini dəyişmək üçün yuxarıdan həmin ayı seçib xanaya yazın.</p>`, `<button class="btn" data-close>Bağla</button>`);
  };
  $('#cgot').onclick = () => {
    let kod = '308'; try { kod = localStorage.getItem('evez_kod') || '308'; } catch (_) {}
    const m = modal('Əvəzləşən qaimələri götür', `<p class="muted" style="margin-top:0;font-size:13.5px;line-height:1.55">Seçdiyiniz ayda ödənilmiş qaimələr vergiyə təqdim olunan formada Excel faylına çıxarılır: <b>kod · seriya · nömrə · məbləğ</b> (başlıqsız). Məbləğ = həmin ayda ödənilmiş ƏDV ÷ 0,18.</p>
      <div class="row2"><div class="field"><label class="f">Ay</label><select class="in" id="gay">${aylar.map(a => `<option value="${a}" ${a === ay ? 'selected' : ''}>${ayYazi(a)}</option>`).join('')}</select></div>
      <div class="field"><label class="f">Kod (1-ci sütun)</label><input class="in" id="gkod" value="${esc(kod)}"></div></div>
      <div id="ginfo" class="muted" style="font-size:13.5px"></div>`,
      `<button class="btn" data-close>Bağla</button><button class="btn" id="getr">${ico('down')}Ətraflı siyahı</button><button class="btn primary" id="gok">${ico('down')}Vergi üçün fayl</button>`);
    // seçilən ayın ödənişlərini qaimələr üzrə topla
    const ayOd = a => { const M_ = new Map(); od.filter(o => o.tarix.slice(0, 7) === a).forEach(o => { const x = Q.get(o.qaime_id); if (!x) return;
      const t = M_.get(x.id) || { x, e: 0, d: 0 }; t.d += num(o.edv); t.e += num(o.mebleg) - num(o.edv); M_.set(x.id, t); }); return [...M_.values()].sort((a, b) => a.x.tarix < b.x.tarix ? -1 : 1); };
    const info = () => { const l = ayOd($('#gay', m).value), lv = l.filter(t => t.d > 0.004);
      $('#ginfo', m).innerHTML = `${lv.length} qaimə · ödənilən ƏDV <b>${fmt(lv.reduce((s, t) => s + t.d, 0), 2)} ₼</b> · fayldakı məbləğ cəmi <b>${fmt(lv.reduce((s, t) => s + t.d / 0.18, 0), 2)} ₼</b>`; return l; };
    $('#gay', m).onchange = info; info();
    $('#gok', m).onclick = () => { const a = $('#gay', m).value, l = info().filter(t => t.d > 0.004); if (!l.length) return toast('Bu ayda ƏDV-si ödənilmiş qaimə yoxdur');
      const k = $('#gkod', m).value.trim() || '308'; try { localStorage.setItem('evez_kod', k); } catch (_) {}
      xlsxEndir(`${S.magaza.ad} - əvəzləşmə - ${ayYazi(a)}`, [{ ad: 'Əvəzləşdirmə', basliqsiz: true, rows: l.map(t => [/^\d+$/.test(k) ? +k : k, String(t.x.seriya || ''), String(t.x.nomre || ''), t.d / 0.18]) }]); closeModal(); };
    $('#getr', m).onclick = () => { const a = $('#gay', m).value, l = info(); if (!l.length) return toast('Bu ayda ödənilmiş qaimə yoxdur');
      xlsxEndir(`${S.magaza.ad} - əvəzləşən qaimələr - ${ayYazi(a)}`, [{ ad: ayYazi(a), rows: [['№', 'Kontragent', 'VÖEN', 'Seriya', 'Nömrə', 'Tarix', 'Qaimənin əsas məbləği', 'Qaimənin ƏDV-si', 'Ödənilən əsas məbləğ', 'Ödənilən ƏDV'],
        ...l.map((t, n) => [n + 1, t.x.kontragent || '', t.x.voen || '', t.x.seriya || '', t.x.nomre || '', fd(t.x.tarix), t.x.E, t.x.D, r2(t.e), r2(t.d)]),
        ['', 'Cəmi', '', '', '', '', r2(l.reduce((s, t) => s + t.x.E, 0)), r2(l.reduce((s, t) => s + t.x.D, 0)), r2(l.reduce((s, t) => s + t.e, 0)), r2(l.reduce((s, t) => s + t.d, 0))]] }]); closeModal(); };
  };
  ciz();
}
async function pageOdenis(params) {
  const tab = params.get('t') || 'qaime', w = canWrite(), D = dovrPanel(params, '#/odenis');
  shell('odenis', 'Ödənişlər', 'Qaimə ödənişləri və bağlanmamış bank əməliyyatları', `<div class="seg" id="ot">${[['qaime', 'Qaimə ödənişləri'], ['bag', 'Bağlanmamış ödənişlər']].map(([k, t]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${t}</button>`).join('')}</div>${w ? `<button class="btn primary" id="evyuk">${ico('up')}Əvəzləşmə faylını yüklə</button>` : ''}`);
  if ($('#evyuk')) $('#evyuk').onclick = evezIdxal;
  $$('#ot button').forEach(b => b.onclick = () => { const p = new URLSearchParams(params); p.set('t', b.dataset.t); location.hash = '#/odenis?' + p; });
  const bh = await bankHesablari(), hAd = id => { const h = bh.find(x => x.id === id); return h ? h.bank : '—'; };
  if (tab === 'qaime') {
    const rows = await all(() => sb.from('v_qaime_odenisleri').select('*').gte('tarix', D.a).lte('tarix', D.b).order('tarix', { ascending: false }).order('id', { ascending: false }));
    const sum = (l, k) => l.reduce((a, r) => a + num(r[k]), 0);
    $('.topbar .sub').textContent = `${rows.length} ödəniş · ödənilən ${man(sum(rows.filter(r => r.istiqamet === 'gelen'), 'mebleg'))} · alınan ${man(sum(rows.filter(r => r.istiqamet === 'geden'), 'mebleg'))}`;
    $('#page').innerHTML = `${D.html}${rows.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Tarix</th><th>Növ</th><th>Kontragent</th><th>VÖEN</th><th>Qaimə</th><th class="n">Məbləğ</th><th class="n">o cümlədən ƏDV</th><th>Hesab</th><th>Qeyd</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${fd(r.tarix)}</td><td><span class="badge ${r.istiqamet === 'gelen' ? 'b-red' : 'b-green'}">${r.istiqamet === 'gelen' ? 'Ödənilib' : 'Alınıb'}</span></td><td>${esc(qisaAd(r.kontragent))}</td><td class="muted">${esc(r.voen || '')}</td><td>${esc(qaimeNo(r))}</td>
        <td class="n"><b>${fmt(r.mebleg, 2)}</b></td><td class="n">${fmt(r.edv, 2)}</td><td>${esc(hAd(r.hesab_id))}</td><td>${esc(r.qeyd || '')}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>${rows.length}</td><td></td><td></td><td></td><td></td><td class="n">${fmt(sum(rows, 'mebleg'), 2)}</td><td class="n">${fmt(sum(rows, 'edv'), 2)}</td><td></td><td></td></tr></tfoot></table></div>` : '<div class="card empty">Bu dövrdə ödəniş yoxdur</div>'}`;
    D.bagla(); return;
  }
  // bağlanmamış: qaiməyə bağlanmayan təchizatçı/alıcı bank əməliyyatları
  const [be, qm] = await Promise.all([all(() => sb.from('bank_emeliyyatlari').select('*').gte('tarix', D.a).lte('tarix', D.b).order('tarix', { ascending: false })),
    all(() => sb.from('v_qaimeler').select('id,istiqamet,voen,kontragent,seriya,nomre,tarix,cem,edv,qaliq').order('tarix'))]);
  const l = be.filter(x => ['Təchizatçıya ödəniş', 'Alıcıdan daxilolma', 'Digər xərc', 'Digər gəlir'].includes(x.kateqoriya) && x.voen);
  $('.topbar .sub').textContent = `${l.length} bağlanmamış əməliyyat`;
  $('#page').innerHTML = `${D.html}<p class="muted" style="font-size:13px">VÖEN-i olan, amma heç bir qaiməyə bağlanmamış bank əməliyyatları. "Bağla" basanda əməliyyat seçdiyiniz qaimənin ödənişinə çevrilir (bank qalığı dəyişmir).</p>
    ${l.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Tarix</th><th>Növ</th><th>Kontragent</th><th>VÖEN</th><th>Təyinat</th><th class="n">Məbləğ</th><th>Hesab</th><th>Açıq qaimə</th>${w ? '<th></th>' : ''}</tr></thead>
      <tbody>${l.map(x => { const ac = qm.filter(y => y.voen === x.voen && num(y.qaliq) > 0.005 && y.istiqamet === (x.nov === 'Məxaric' ? 'gelen' : 'geden'));
        return `<tr><td>${fd(x.tarix)}</td><td>${x.nov}</td><td>${esc(qisaAd(x.kontragent))}</td><td class="muted">${esc(x.voen)}</td><td>${esc(x.teyinat || '')}</td><td class="n"><b>${fmt(x.mebleg, 2)}</b></td><td>${esc(hAd(x.hesab_id))}</td>
          <td>${ac.length ? `<select class="in" data-bq="${x.id}" style="min-width:200px">${ac.map(y => `<option value="${y.id}">${esc(qaimeNo(y))} · ${fd(y.tarix)} · qalıq ${fmt(y.qaliq, 2)}</option>`).join('')}</select>` : '<span class="muted">açıq qaimə yoxdur</span>'}</td>
          ${w ? `<td>${ac.length ? `<button class="btn sm primary" data-bg="${x.id}">Bağla</button>` : ''}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>` : '<div class="card empty">Bağlanmamış əməliyyat yoxdur</div>'}`;
  D.bagla();
  $$('[data-bg]').forEach(b => b.onclick = async () => {
    const x = be.find(z => z.id === +b.dataset.bg), y = qm.find(z => z.id === +$(`[data-bq="${x.id}"]`).value);
    const mb = Math.min(num(x.mebleg), num(y.qaliq)), edv = r2(num(y.cem) ? mb * num(y.edv) / num(y.cem) : 0);
    if (num(x.mebleg) > num(y.qaliq) + 0.005 && !await tesdiq(`Əməliyyat (${fmt(x.mebleg, 2)}) qaimənin qalığından (${fmt(y.qaliq, 2)}) çoxdur. Yalnız ${fmt(mb, 2)} bağlansın, qalanı bank əməliyyatı kimi qalsın?`)) return;
    try {
      await q(sb.from('qaime_odenisleri').insert({ qaime_id: y.id, tarix: x.tarix, mebleg: r2(mb), edv, hesab_id: x.hesab_id, qeyd: x.teyinat }));
      const art = r2(num(x.mebleg) - mb);
      if (art > 0.005) await q(sb.from('bank_emeliyyatlari').update({ mebleg: art }).eq('id', x.id)); else await q(sb.from('bank_emeliyyatlari').delete().eq('id', x.id));
      toast('Qaiməyə bağlandı'); refresh();
    } catch (er) { fail(er); }
  });
}

/* ---------- ƏDV hesabatı ---------- */
async function pageEdv(params) {
  const r = params.get('r');
  if (!r) {
    shell('edv', 'ƏDV hesabatı', 'ƏDV üzrə bütün hesabatlar — karta basın', '');
    $('#page').innerHTML = `<div class="hes-kartlar">${[['#/evez', 'Əvəzləşdiriləcək qaimələr', 'Ay üzrə ödənilmiş gələn qaimələr, idxal ƏDV-si, büdcəyə ödəniləcək məbləğ və Excel faylı'],
      ['#/edv?r=dovr', 'ƏDV dövriyyəsi', 'İl üzrə ay-ay: satış və alış dövriyyəsi, hesablanmış və əvəzləşən ƏDV'],
      ['#/edv?r=uzles', 'ƏDV üzləşməsi (ay-ay)', 'Hesablanmış / əvəzləşən ƏDV və ƏDV depozit hesabının hərəkəti'],
      ['#/depozit', 'ƏDV depozit hesabı', 'Depozit hesabının çıxarışı və qalığı']].map(([h, t, a]) => `<a class="hes-kart" href="${h}"><b>${t}</b><span>${a}</span></a>`).join('')}</div>`;
    return;
  }
  const il = +(params.get('il') || new Date().getFullYear()), a = `${il}-01-01`, b = `${il}-12-31`;
  shell('edv', r === 'dovr' ? 'ƏDV dövriyyəsi' : 'ƏDV üzləşməsi (ay-ay)', String(il), `<a class="btn" href="#/edv">← ƏDV hesabatları</a><select class="in" id="eil" style="width:auto">${[0, 1, 2].map(i => new Date().getFullYear() - i).map(y => `<option ${y === il ? 'selected' : ''}>${y}</option>`).join('')}</select>`);
  $('#eil').onchange = e => { location.hash = `#/edv?r=${r}&il=${e.target.value}`; };
  const [qm, od, gm, be, bh] = await Promise.all([all(() => sb.from('qaimeler').select('istiqamet,tarix,esas,edv,edvsiz').gte('tarix', a).lte('tarix', b).order('id')),
    all(() => sb.from('v_qaime_odenisleri').select('istiqamet,tarix,mebleg,edv,hesab_id').gte('tarix', a).lte('tarix', b).order('id')),
    all(() => sb.from('gomruk').select('nov,tarix,edv').gte('tarix', a).lte('tarix', b).order('id')),
    all(() => sb.from('bank_emeliyyatlari').select('hesab_id,tarix,nov,mebleg').lte('tarix', b).order('id')), bankHesablari()]);
  const aylar = Array.from({ length: 12 }, (_, i) => `${il}-${String(i + 1).padStart(2, '0')}`);
  const ay = (l, f) => l.filter(x => String(x.tarix).slice(0, 7) === f), S_ = (l, k) => l.reduce((s, x) => s + num(x[k]), 0);
  const dep = new Set(bh.filter(h => h.edv_depozit).map(h => h.id));
  const rows = aylar.map(f => {
    const g = ay(qm, f).filter(x => x.istiqamet === 'geden'), q_ = ay(qm, f).filter(x => x.istiqamet === 'gelen'), o = ay(od, f).filter(x => x.istiqamet === 'gelen');
    const hes = S_(g, 'edv'), ev = S_(o, 'edv') + S_(ay(gm, f).filter(x => x.nov === 'idxal'), 'edv');
    const dm = ay(be, f).filter(x => dep.has(x.hesab_id)), dOd = ay(od, f).filter(x => dep.has(x.hesab_id));
    const depGir = S_(dm.filter(x => x.nov === 'Mədaxil'), 'mebleg') + S_(dOd.filter(x => x.istiqamet === 'geden'), 'mebleg');
    const depCix = S_(dm.filter(x => x.nov === 'Məxaric'), 'mebleg') + S_(dOd.filter(x => x.istiqamet === 'gelen'), 'mebleg');
    return { f, satis: S_(g, 'esas') + S_(g, 'edvsiz'), alis: S_(q_, 'esas') + S_(q_, 'edvsiz'), alisEdv: S_(q_, 'edv'), hes, ev, net: hes - ev, depGir, depCix };
  });
  const C = k => rows.reduce((s, x) => s + x[k], 0);
  const th = r === 'dovr' ? ['Ay', 'Satış dövriyyəsi', 'Hesablanmış ƏDV', 'Alış dövriyyəsi', 'Alış qaimələrində ƏDV', 'Əvəzləşən ƏDV', 'Büdcəyə (+) / artıq (−)']
    : ['Ay', 'Hesablanmış ƏDV', 'Əvəzləşən ƏDV', 'Fərq', 'Depozitə daxil olan', 'Depozitdən çıxan'];
  const sat = x => r === 'dovr' ? [x.satis, x.hes, x.alis, x.alisEdv, x.ev, x.net] : [x.hes, x.ev, x.net, x.depGir, x.depCix];
  $('#page').innerHTML = `<div class="tbl-wrap"><table class="t"><thead><tr>${th.map((t, i) => `<th class="${i ? 'n' : ''}">${t}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(x => `<tr><td>${ayAdi(x.f + '-01')}</td>${sat(x).map((v, i, arr) => `<td class="n">${i === arr.length - 1 && r === 'dovr' ? `<b class="${v > 0 ? 'neg' : v < 0 ? 'pos' : ''}">${fmt(v, 2)}</b>` : fmt(v, 2)}</td>`).join('')}</tr>`).join('')}</tbody>
    <tfoot><tr><td>Cəmi ${il}</td>${(r === 'dovr' ? ['satis', 'hes', 'alis', 'alisEdv', 'ev', 'net'] : ['hes', 'ev', 'net', 'depGir', 'depCix']).map(k => `<td class="n">${fmt(C(k), 2)}</td>`).join('')}</tr></tfoot></table></div>
    ${r === 'uzles' && !dep.size ? '<p class="muted" style="font-size:13px">ƏDV depozit hesabı qeyd olunmayıb: "Bank hesabları"nda hesabı açıb "ƏDV depozit hesabıdır" işarəsini qoyun.</p>' : ''}`;
}
async function pageDepozit(params) {
  const bh = await bankHesablari(), d = bh.find(h => h.edv_depozit);
  if (!d) { shell('depozit', 'ƏDV depozit', '', canWrite() ? `<button class="btn primary" id="dyeni">${ico('plus')}Depozit hesabı əlavə et</button>` : '');
    $('#page').innerHTML = '<div class="card empty" style="padding:36px 20px"><div style="font-size:16px;font-weight:600;margin-bottom:6px">ƏDV depozit hesabı qeyd olunmayıb</div><div class="muted">Hesabı əlavə edib "ƏDV depozit hesabıdır" işarəsini qoyun — burada onun çıxarışı və qalığı görünəcək.</div></div>';
    if ($('#dyeni')) $('#dyeni').onclick = () => bankHesabForm(null); return; }
  const p = new URLSearchParams(params); p.set('h', String(d.id)); p.set('dep', '1');
  return pageBank(p);
}

/* ---------- Hesabatlar ---------- */
const HESABATLAR = [
  ['Kontragentlər və üzləşmə', [['uzles', 'Kontragentlərlə üzləşmə (VÖEN üzrə)'], ['akt', 'Kontragentlə üzləşmə aktı'], ['quzles', 'Qaimələr üzrə üzləşmə'], ['debkred', 'Debitor / kreditor borcları'], ['yaslanma', 'Borcların yaşlanması']]],
  ['Satış və alış', [['dinamika', 'Aylıq dinamika'], ['kxulase', 'Kontragent xülasəsi']]],
  ['ƏDV', [['#/evez', 'Əvəzləşdiriləcək qaimələr'], ['#/edv?r=dovr', 'ƏDV dövriyyəsi'], ['#/edv?r=uzles', 'ƏDV üzləşməsi (ay-ay)']]],
  ['Bank, əmək haqqı, nəticə', [['#/bank', 'Bank hərəkəti'], ['#/emek', 'Əmək haqqı cədvəli'], ['#/mz', 'Mənfəət / Zərər']]]];
async function pageMHesabat(params) {
  const r = params.get('r') || '';
  const ad = (HESABATLAR.flatMap(x => x[1]).find(x => x[0] === r) || [])[1];
  shell('hesab', ad || 'Hesabatlar', ad ? 'Hesabatlar' : 'Bölməyə və ya hesabata basın', '');
  const sol = `<aside class="hes-sol"><input class="in" id="hax" placeholder="Hesabat axtar…">${HESABATLAR.map(([b, l]) => `<div class="hes-bas">${b}</div>${l.map(([k, t]) => `<a href="${k.startsWith('#') ? k : '#/hesab?r=' + k}" class="${k === r ? 'on' : ''}">${t}</a>`).join('')}`).join('')}</aside>`;
  if (!r) {
    $('#page').innerHTML = `<div class="hes-lay">${sol}<div><div class="hes-kartlar">${HESABATLAR.map(([b, l]) => `<div class="hes-kart"><b>${b}</b><span>${l.map(([k, t]) => `<a href="${k.startsWith('#') ? k : '#/hesab?r=' + k}">${t}</a>`).join(' · ')}</span></div>`).join('')}</div></div></div>`;
    hesAxtar(); return;
  }
  const D = dovrPanel(params, '#/hesab');
  $('#page').innerHTML = `<div class="hes-lay">${sol}<div id="hesic">${D.html}<div class="empty"><div class="spinner" style="margin:auto"></div></div></div></div>`;
  hesAxtar(); D.bagla();
  const qm = await all(() => sb.from('v_qaimeler').select('*').order('tarix').order('id'));
  const icBox = $('#hesic'); if (!icBox) return;
  const out = html => { icBox.innerHTML = D.html + html; D.bagla(); };
  const dovrde = x => x.tarix >= D.a && x.tarix <= D.b;
  const kontr = new Map(); qm.forEach(x => { const k = x.voen || x.kontragent || '—'; if (!kontr.has(k)) kontr.set(k, { voen: x.voen, ad: x.kontragent || x.voen }); });
  if (r === 'uzles' || r === 'debkred') {
    const m = new Map();
    qm.filter(x => x.tarix <= D.b).forEach(x => { const k = x.voen || x.kontragent; const o = m.get(k) || { ...kontr.get(k), gc: 0, go: 0, dc: 0, do_: 0 };
      if (x.istiqamet === 'gelen') { o.gc += num(x.cem); o.go += num(x.odenilib); } else { o.dc += num(x.cem); o.do_ += num(x.odenilib); } m.set(k, o); });
    const l = [...m.values()].map(o => ({ ...o, kred: o.gc - o.go, deb: o.dc - o.do_ }));
    if (r === 'uzles') {
      const S_ = k => l.reduce((s, x) => s + x[k], 0);
      return out(`<div class="tbl-wrap"><table class="t"><thead><tr><th>VÖEN</th><th>Kontragent</th><th class="n">Alış (gələn)</th><th class="n">Ödənilib</th><th class="n">Kreditor qalığı</th><th class="n">Satış (gedən)</th><th class="n">Alınıb</th><th class="n">Debitor qalığı</th><th class="n">Saldo</th></tr></thead>
        <tbody>${l.sort((a, b) => Math.abs(b.deb - b.kred) - Math.abs(a.deb - a.kred)).map(o => `<tr class="click" data-k="${esc(o.voen || o.ad)}"><td class="muted">${esc(o.voen || '')}</td><td>${esc(qisaAd(o.ad))}</td><td class="n">${fmt(o.gc, 2)}</td><td class="n">${fmt(o.go, 2)}</td><td class="n"><b class="${o.kred > 0.005 ? 'neg' : ''}">${fmt(o.kred, 2)}</b></td>
          <td class="n">${fmt(o.dc, 2)}</td><td class="n">${fmt(o.do_, 2)}</td><td class="n"><b>${fmt(o.deb, 2)}</b></td><td class="n">${fmt(o.deb - o.kred, 2)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td></td><td>${l.length} kontragent</td>${['gc', 'go', 'kred', 'dc', 'do_', 'deb'].map(k => `<td class="n">${fmt(S_(k), 2)}</td>`).join('')}<td class="n">${fmt(S_('deb') - S_('kred'), 2)}</td></tr></tfoot></table></div>
        <p class="muted" style="font-size:12.5px">${fd(D.b)} tarixinə qalıqlar. Sətrə basanda həmin kontragentlə üzləşmə aktı açılır.</p>`), $$('[data-k]').forEach(tr => tr.onclick = () => { location.hash = `#/hesab?r=akt&k=${encodeURIComponent(tr.dataset.k)}&a=${D.a}&b=${D.b}`; });
    }
    const kr = l.filter(o => o.kred > 0.005).sort((a, b) => b.kred - a.kred), db = l.filter(o => o.deb > 0.005).sort((a, b) => b.deb - a.deb);
    const tb = (t, ll, k) => `<div class="card" style="padding:0"><h3 style="padding:16px 20px 0">${t} — ${man(ll.reduce((s, x) => s + x[k], 0))}</h3><table class="t"><tbody>${ll.map(o => `<tr><td><div class="cell-main">${esc(qisaAd(o.ad))}</div><div class="cell-sub">${esc(o.voen || '')}</div></td><td class="n"><b>${fmt(o[k], 2)}</b></td></tr>`).join('') || '<tr><td class="muted">Yoxdur</td></tr>'}</tbody></table></div>`;
    return out(`<div class="grid two">${tb('Kreditorlar (biz borcluyuq)', kr, 'kred')}${tb('Debitorlar (bizə borcludurlar)', db, 'deb')}</div>`);
  }
  if (r === 'akt') {
    const k = params.get('k') || '';
    const sec = `<div class="dovr"><span class="muted">Kontragent:</span><select class="in" id="hk" style="min-width:280px"><option value="">— seçin —</option>${[...kontr.entries()].sort((a, b) => String(a[1].ad).localeCompare(String(b[1].ad), 'az')).map(([kk, o]) => `<option value="${esc(kk)}" ${kk === k ? 'selected' : ''}>${esc(qisaAd(o.ad))} ${o.voen ? '· ' + esc(o.voen) : ''}</option>`).join('')}</select></div>`;
    if (!k) { out(sec + '<div class="card empty">Kontragenti seçin</div>'); }
    else {
      const ql = qm.filter(x => (x.voen || x.kontragent) === k), ids = new Set(ql.map(x => x.id));
      const od = (await all(() => sb.from('qaime_odenisleri').select('*').order('tarix'))).filter(x => ids.has(x.qaime_id));
      const qIst = new Map(ql.map(x => [x.id, x]));
      // biz baxımından: gələn qaimə = kreditimiz artır (kredit), ona ödəniş = debet; gedən qaimə = debet, alınan ödəniş = kredit
      const hrk = [...ql.map(x => ({ t: x.tarix, ad: `${x.istiqamet === 'gelen' ? 'Alış qaiməsi' : 'Satış qaiməsi'} ${qaimeNo(x)}`, d: x.istiqamet === 'geden' ? num(x.cem) : 0, c: x.istiqamet === 'gelen' ? num(x.cem) : 0 })),
        ...od.map(o => { const x = qIst.get(o.qaime_id); return { t: o.tarix, ad: `${x.istiqamet === 'gelen' ? 'Ödəniş' : 'Daxilolma'} (qaimə ${qaimeNo(x)})`, d: x.istiqamet === 'gelen' ? num(o.mebleg) : 0, c: x.istiqamet === 'geden' ? num(o.mebleg) : 0 }; })]
        .sort((a, b) => a.t < b.t ? -1 : a.t > b.t ? 1 : 0);
      const ilk = hrk.filter(x => x.t < D.a).reduce((s, x) => s + x.d - x.c, 0), dv = hrk.filter(x => x.t >= D.a && x.t <= D.b);
      let s = ilk; const A = await ayarlar(), o = kontr.get(k);
      out(sec + `<div class="card akt-cap"><h3 style="text-align:center;margin:0 0 4px">Qarşılıqlı hesablaşmaların üzləşmə aktı</h3>
        <div style="text-align:center" class="muted">${fd(D.a)} — ${fd(D.b)}</div>
        <div class="row2" style="margin:12px 0;font-size:13.5px"><div><b>${esc(A.firma_adi || S.magaza.ad)}</b><br>VÖEN: ${esc(A.firma_voen || '—')}</div><div style="text-align:right"><b>${esc(qisaAd(o.ad))}</b><br>VÖEN: ${esc(o.voen || '—')}</div></div>
        <table class="t"><thead><tr><th>Tarix</th><th>Sənəd</th><th class="n">Debet</th><th class="n">Kredit</th><th class="n">Saldo</th></tr></thead><tbody>
          <tr><td></td><td><b>Dövrün əvvəlinə saldo</b></td><td class="n"></td><td class="n"></td><td class="n"><b>${fmt(ilk, 2)}</b></td></tr>
          ${dv.map(x => { s += x.d - x.c; return `<tr><td>${fd(x.t)}</td><td>${esc(x.ad)}</td><td class="n">${x.d ? fmt(x.d, 2) : ''}</td><td class="n">${x.c ? fmt(x.c, 2) : ''}</td><td class="n">${fmt(s, 2)}</td></tr>`; }).join('')}</tbody>
          <tfoot><tr><td></td><td>Dövr üzrə dövriyyə / son saldo</td><td class="n">${fmt(dv.reduce((a, x) => a + x.d, 0), 2)}</td><td class="n">${fmt(dv.reduce((a, x) => a + x.c, 0), 2)}</td><td class="n sabit">${fmt(s, 2)}</td></tr></tfoot></table>
        <p style="font-size:13.5px;margin-top:12px">${fd(D.b)} tarixinə ${s > 0.005 ? `<b>${esc(qisaAd(o.ad))}</b> tərəfindən <b>${esc(A.firma_adi || S.magaza.ad)}</b>-ə borc: <b>${man(s)}</b>` : s < -0.005 ? `<b>${esc(A.firma_adi || S.magaza.ad)}</b> tərəfindən <b>${esc(qisaAd(o.ad))}</b>-ə borc: <b>${man(-s)}</b>` : 'borc yoxdur'}.</p>
        <div class="row2" style="margin-top:30px;font-size:13px"><div>________________ ${esc(A.direktor || '')}<br><span class="muted">imza, möhür</span></div><div style="text-align:right">________________<br><span class="muted">imza, möhür</span></div></div></div>
        <div style="margin-top:10px"><button class="btn" onclick="window.print()">${ico('print')}Çap / PDF</button></div>`);
    }
    if ($('#hk')) $('#hk').onchange = e => { location.hash = `#/hesab?r=akt&k=${encodeURIComponent(e.target.value)}&a=${D.a}&b=${D.b}`; };
    return;
  }
  if (r === 'quzles') {
    const l = qm.filter(dovrde);
    return out(`<div class="tbl-wrap"><table class="t"><thead><tr><th>İstiqamət</th><th>Tarix</th><th>Qaimə</th><th>Kontragent</th><th class="n">Cəm</th><th class="n">Ödənilib</th><th class="n">Qalıq</th><th>Son ödəniş</th><th>Vəziyyət</th><th>e-taxes</th></tr></thead>
      <tbody>${l.map(x => `<tr><td>${x.istiqamet === 'gelen' ? 'Gələn' : 'Gedən'}</td><td>${fd(x.tarix)}</td><td>${esc(qaimeNo(x))}</td><td>${esc(qisaAd(x.kontragent))}</td><td class="n">${fmt(x.cem, 2)}</td><td class="n">${fmt(x.odenilib, 2)}</td><td class="n"><b>${fmt(x.qaliq, 2)}</b></td><td>${fd(x.son_odenis)}</td><td>${odenisBadge(x)}</td><td class="muted">${esc(x.status || '')}</td></tr>`).join('')}</tbody></table></div>`);
  }
  if (r === 'yaslanma') {
    const bu = D.b, gun = t => Math.round((new Date(bu + 'T00:00:00') - new Date(t + 'T00:00:00')) / 864e5);
    const qr = [[0, 30, '0–30 gün'], [31, 60, '31–60'], [61, 90, '61–90'], [91, 99999, '90+']];
    const blok = ist => { const m = new Map(); qm.filter(x => x.istiqamet === ist && num(x.qaliq) > 0.005 && x.tarix <= bu).forEach(x => { const k = x.voen || x.kontragent; const o = m.get(k) || { ...kontr.get(k), b: [0, 0, 0, 0], c: 0 };
        const g = gun(x.tarix), i = qr.findIndex(([a, b]) => g >= a && g <= b); o.b[i] += num(x.qaliq); o.c += num(x.qaliq); m.set(k, o); });
      const l = [...m.values()].sort((a, b) => b.c - a.c);
      return `<div class="tbl-wrap" style="margin-bottom:16px"><table class="t"><thead><tr><th>${ist === 'gelen' ? 'Kreditor (təchizatçı)' : 'Debitor (alıcı)'}</th>${qr.map(x => `<th class="n">${x[2]}</th>`).join('')}<th class="n">Cəmi</th></tr></thead>
        <tbody>${l.map(o => `<tr><td><div class="cell-main">${esc(qisaAd(o.ad))}</div><div class="cell-sub">${esc(o.voen || '')}</div></td>${o.b.map((v, i) => `<td class="n ${i === 3 && v > 0 ? 'neg' : ''}">${v ? fmt(v, 2) : ''}</td>`).join('')}<td class="n"><b>${fmt(o.c, 2)}</b></td></tr>`).join('') || '<tr><td class="muted">Yoxdur</td></tr>'}</tbody>
        <tfoot><tr><td>Cəmi</td>${[0, 1, 2, 3].map(i => `<td class="n">${fmt(l.reduce((s, o) => s + o.b[i], 0), 2)}</td>`).join('')}<td class="n">${fmt(l.reduce((s, o) => s + o.c, 0), 2)}</td></tr></tfoot></table></div>`; };
    return out(`<h3>Kreditor borcları</h3>${blok('gelen')}<h3>Debitor borcları</h3>${blok('geden')}<p class="muted" style="font-size:12.5px">Gün qaimənin tarixindən ${fd(bu)}-ə qədər hesablanır.</p>`);
  }
  if (r === 'dinamika') {
    const l = qm.filter(dovrde), m = new Map();
    l.forEach(x => { const f = String(x.tarix).slice(0, 7); const o = m.get(f) || { gn: 0, gc: 0, ge: 0, dn: 0, dc: 0, de: 0 };
      if (x.istiqamet === 'gelen') { o.gn++; o.gc += num(x.cem); o.ge += num(x.edv); } else { o.dn++; o.dc += num(x.cem); o.de += num(x.edv); } m.set(f, o); });
    const ay_ = [...m.keys()].sort();
    return out(`<div class="tbl-wrap"><table class="t"><thead><tr><th>Ay</th><th class="n">Gələn say</th><th class="n">Gələn cəm</th><th class="n">Gələn ƏDV</th><th class="n">Gedən say</th><th class="n">Gedən cəm</th><th class="n">Gedən ƏDV</th><th class="n">Fərq (gedən − gələn)</th></tr></thead>
      <tbody>${ay_.map(f => { const o = m.get(f); return `<tr><td>${ayAdi(f + '-01')}</td><td class="n">${o.gn}</td><td class="n">${fmt(o.gc, 2)}</td><td class="n">${fmt(o.ge, 2)}</td><td class="n">${o.dn}</td><td class="n">${fmt(o.dc, 2)}</td><td class="n">${fmt(o.de, 2)}</td><td class="n"><b>${fmt(o.dc - o.gc, 2)}</b></td></tr>`; }).join('') || '<tr><td class="muted">Bu dövrdə qaimə yoxdur</td></tr>'}</tbody></table></div>`);
  }
  if (r === 'kxulase') {
    const l = qm.filter(dovrde), m = new Map();
    l.forEach(x => { const k = x.voen || x.kontragent; const o = m.get(k) || { ...kontr.get(k), gn: 0, gc: 0, dn: 0, dc: 0 }; if (x.istiqamet === 'gelen') { o.gn++; o.gc += num(x.cem); } else { o.dn++; o.dc += num(x.cem); } m.set(k, o); });
    const ll = [...m.values()].sort((a, b) => (b.gc + b.dc) - (a.gc + a.dc)), cem = ll.reduce((s, o) => s + o.gc + o.dc, 0) || 1;
    return out(`<div class="tbl-wrap"><table class="t"><thead><tr><th>VÖEN</th><th>Kontragent</th><th class="n">Alış qaiməsi</th><th class="n">Alış cəmi</th><th class="n">Satış qaiməsi</th><th class="n">Satış cəmi</th><th class="n">Payı</th></tr></thead>
      <tbody>${ll.map(o => `<tr><td class="muted">${esc(o.voen || '')}</td><td>${esc(qisaAd(o.ad))}</td><td class="n">${o.gn}</td><td class="n">${fmt(o.gc, 2)}</td><td class="n">${o.dn}</td><td class="n">${fmt(o.dc, 2)}</td><td class="n">${fmt((o.gc + o.dc) / cem * 100, 1)}%</td></tr>`).join('')}</tbody></table></div>`);
  }
  out('<div class="card empty">Hesabat tapılmadı</div>');
}
function hesAxtar() { const i = $('#hax'); if (i) i.oninput = () => { const t = azLow(i.value); $$('.hes-sol a').forEach(a => { a.style.display = !t || azLow(a.textContent).includes(t) ? '' : 'none'; }); }; }

/* ---------- Xəbərdarlıqlar ---------- */
async function xeberdarliqlar() {
  const [qm, akt, isci, eh, bh, A] = await Promise.all([all(() => sb.from('v_qaimeler').select('istiqamet,tarix,qaliq,voen,kontragent').order('id')),
    all(() => sb.from('alis_aktlari').select('mebleg,odenilib,tarix').order('id')), all(() => sb.from('emekdaslar').select('id,cixis').order('id')),
    all(() => sb.from('emek_haqqi').select('ay').eq('ay', ayBasi(today())).order('id')), bankHesablari(), ayarlar()]);
  const sd = await all(() => sb.from('qaimeler').select('id').eq('status_bax', false).order('id')).catch(() => []);
  const X = [], gun = t => Math.round((new Date(today() + 'T00:00:00') - new Date(t + 'T00:00:00')) / 864e5), sum = l => l.reduce((s, x) => s + num(x.qaliq), 0);
  const k30 = qm.filter(x => x.istiqamet === 'gelen' && num(x.qaliq) > 0.005 && gun(x.tarix) > 30), d30 = qm.filter(x => x.istiqamet === 'geden' && num(x.qaliq) > 0.005 && gun(x.tarix) > 30);
  if (sd.length) X.push(['xeta', `${sd.length} qaimənin statusu e-taxes-də dəyişib`, 'baxın', '#/qaime']);
  if (k30.length) X.push(['xeta', `${k30.length} gələn qaimə 30 gündən çoxdur ödənilməyib`, man(sum(k30)), '#/qaime?ist=gelen']);
  if (d30.length) X.push(['diqqet', `${d30.length} gedən qaimə üzrə alıcılar 30 gündən çoxdur ödəməyib`, man(sum(d30)), '#/hesab?r=yaslanma']);
  const vs = qm.filter(x => !x.voen); if (vs.length) X.push(['diqqet', `${vs.length} qaimədə VÖEN yoxdur`, '', '#/qaime']);
  const aa = akt.filter(x => num(x.mebleg) - num(x.odenilib) > 0.005); if (aa.length) X.push(['diqqet', `${aa.length} alış aktı ödənilməyib`, man(aa.reduce((s, x) => s + num(x.mebleg) - num(x.odenilib), 0)), '#/akt']);
  const aktivIsci = isci.filter(x => !x.cixis || x.cixis >= ayBasi(today()));
  if (aktivIsci.length && !eh.length) X.push(['diqqet', `${ayAdi(today())} üçün əmək haqqı hesablanmayıb`, `${aktivIsci.length} əməkdaş`, '#/emek']);
  const gnu = new Date().getDate(); if (gnu <= 20) X.push(['melumat', `${ayAdi(kecenAy())} üçün ƏDV bəyannaməsi və əvəzləşmə faylı — son gün ayın 20-si`, `${20 - gnu} gün qalıb`, '#/evez']);
  if (!bh.some(h => h.edv_depozit)) X.push(['melumat', 'ƏDV depozit hesabı qeyd olunmayıb', '', '#/depozit']);
  if (!bh.length) X.push(['melumat', 'Bank hesabı əlavə olunmayıb', '', '#/bank']);
  if (!A.firma_voen) X.push(['diqqet', 'Şirkətin VÖEN-i və rekvizitləri doldurulmayıb', '', '#/ayarlar']);
  if (S.qalan <= 7) X.push([S.qalan < 0 ? 'xeta' : 'diqqet', S.qalan < 0 ? 'Abunə müddəti bitib' : `Abunənin bitməsinə ${S.qalan} gün qalıb`, fd(S.magaza.abune_bitir), '#/ayarlar']);
  return X;
}
const xeberSiyahi = X => X.length ? `<div class="xeber">${X.map(([n, t, v, h]) => `<a href="${h}" class="xb ${n}"><i></i><span>${esc(t)}</span><b>${esc(v)}</b></a>`).join('')}</div>` : '<div class="empty muted" style="padding:20px">Xəbərdarlıq yoxdur 👍</div>';
async function pageXeber() {
  shell('xeber', 'Xəbərdarlıqlar', '', '');
  const X = await xeberdarliqlar();
  $('.topbar .sub').textContent = X.length ? `${X.length} xəbərdarlıq` : '';
  $('#page').innerHTML = `<div class="card" style="padding:0">${xeberSiyahi(X)}</div>`;
}

/* ---------- Mühasibat firmasının Excel ehtiyat nüsxəsi ---------- */
async function muhExcel() {
  const [qm, od, gm, bh, be, ek, eh, ak, ko] = await Promise.all(['v_qaimeler', 'v_qaime_odenisleri', 'gomruk', 'bank_hesablari', 'bank_emeliyyatlari', 'emekdaslar', 'emek_haqqi', 'alis_aktlari', 'kontragentler']
    .map(t => all(() => sb.from(t).select('*').order('id'))));
  const sh = (ad, l, cols) => ({ ad, rows: [cols.map(c => c[1]), ...l.map(x => cols.map(c => x[c[0]] == null ? '' : x[c[0]]))] });
  xlsxEndir(`${firmaAdi()} ${today()}`, [
    sh('Qaimələr', qm, [['istiqamet', 'İstiqamət'], ['tarix', 'Tarix'], ['seriya', 'Seriya'], ['nomre', 'Nömrə'], ['voen', 'VÖEN'], ['kontragent', 'Kontragent'], ['esas', 'Əsas'], ['edv', 'ƏDV'], ['edvsiz', 'ƏDV-siz'], ['cem', 'Cəm'], ['odenilib', 'Ödənilib'], ['qaliq', 'Qalıq'], ['status', 'Status']]),
    sh('Ödənişlər', od, [['tarix', 'Tarix'], ['istiqamet', 'İstiqamət'], ['voen', 'VÖEN'], ['kontragent', 'Kontragent'], ['seriya', 'Seriya'], ['nomre', 'Nömrə'], ['mebleg', 'Məbləğ'], ['edv', 'ƏDV'], ['qeyd', 'Qeyd']]),
    sh('Gömrük', gm, [['nov', 'Növ'], ['tarix', 'Tarix'], ['beyanname', 'Bəyannamə'], ['terefdas', 'Tərəfdaş'], ['olke', 'Ölkə'], ['valyuta', 'Valyuta'], ['mebleg_valyuta', 'Valyuta ilə'], ['mezenne', 'Məzənnə'], ['gomruk_deyeri', 'Gömrük dəyəri'], ['rusum', 'Rüsum'], ['edv', 'ƏDV'], ['diger', 'Digər']]),
    sh('Bank hesabları', bh, [['bank', 'Bank'], ['hesab_no', 'Hesab'], ['valyuta', 'Valyuta'], ['ilkin_qaliq', 'İlkin qalıq'], ['edv_depozit', 'ƏDV depozit']]),
    sh('Bank əməliyyatları', be, [['tarix', 'Tarix'], ['nov', 'Növ'], ['mebleg', 'Məbləğ'], ['kateqoriya', 'Kateqoriya'], ['voen', 'VÖEN'], ['kontragent', 'Kontragent'], ['teyinat', 'Təyinat']]),
    sh('Əməkdaşlar', ek, [['ad', 'Ad'], ['fin', 'FİN'], ['vezife', 'Vəzifə'], ['maas', 'Maaş'], ['ise_qebul', 'İşə qəbul'], ['cixis', 'Çıxış']]),
    sh('Əmək haqqı', eh, [['ay', 'Ay'], ['emekdas_id', 'Əməkdaş №'], ['hesablanan', 'Hesablanan'], ['gelir_vergisi', 'Gəlir vergisi'], ['dsmf_isci', 'DSMF işçi'], ['issizlik_isci', 'İşsizlik işçi'], ['tibbi_isci', 'Tibbi işçi'], ['dsmf_isveren', 'DSMF işəgötürən'], ['issizlik_isveren', 'İşsizlik işəgötürən'], ['tibbi_isveren', 'Tibbi işəgötürən']]),
    sh('Alış aktları', ak, [['tarix', 'Tarix'], ['seriya', 'Seriya'], ['nomre', 'Nömrə'], ['satici', 'Satıcı'], ['fin', 'FİN'], ['mal', 'Mal'], ['mebleg', 'Məbləğ'], ['odenilib', 'Ödənilib']]),
    sh('Kontragentlər', ko, [['voen', 'VÖEN'], ['ad', 'Ad'], ['unvan', 'Ünvan'], ['telefon', 'Telefon'], ['hesab', 'Hesab']])]);
}

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
  if ($('#yeni')) $('#yeni').onclick = () => { location.hash = '#/sat?m=' + id; };
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
    if (mb > hed + 0.001 && !await tesdiq(`Məbləğ qalıq borcdan (${fmt(hed)}) çoxdur. Yenə də yazılsın?`)) return;
    $('#ok', md).disabled = true;
    try {
      const ids = [];
      for (const x of pl) {
        const np = await q(sb.from('satis_odenisleri').insert({ satis_id: x.s.id, tarix: f.t.value, mebleg: x.m, usul, qeyd: f.q.value.trim() || null }).select().single());
        ids.push(np.id);
      }
      closeModal(); S.cache = {}; toast(`${fmt(mb)} ₼ ödəniş yazıldı`);
      if (await tesdiq('Ödəniş yazıldı. Müştəri üçün qəbz çap edilsin?')) location.hash = '#/qebz/' + ids.join(','); else refresh();
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
  if ($('#kyar', m)) $('#kyar', m).onclick = async () => { if (f.kod.value.trim() && !await tesdiq('Mövcud barkod dəyişdirilsin?')) return; f.kod.value = daxiliBarkod(r.id); };
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
        if (b && !await tesdiq(`Bu barkod artıq "${b.ad}" məhsulundadır. Yenə də yadda saxlanılsın?`)) return; } catch (_) {}
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
      if (!await tesdiq('Bu məhsul satışlarda istifadə olunub, ona görə silinmir — passiv edilsin? (satışda görünməyəcək, köhnə satışlar dəyişməyəcək)')) return;
      try { await q(sb.from('mehsullar').update({ aktiv: false }).eq('id', r.id)); closeModal(); toast('Passiv edildi'); refresh(); } catch (er) { fail(er); }
      return;
    }
    if (!await tesdiq(`"${r.ad}" silinsin?`)) return;
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
    if (!await tesdiq(`${s.satis_no}: dəyərdən ${man(mb)} çıxılsın${gp > 0 ? `, müştəriyə ${man(gp)} nağd qaytarılsın` : ''}?`)) return;
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
    if (!await tesdiq('Bu xərc silinsin?')) return;
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
    ${canWrite() ? `<button class="btn green" id="ode">${ico('plus')}Ödəniş yaz</button><button class="btn primary" id="yeni">${ico('plus')}Yeni işçi</button>` : ''}`);
  iscTabBagla('isciler');
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
      <div class="card kpi"><div class="lbl">İşləyən işçilərə veriləcək</div><div class="val ${isleyenVer < 0 ? 'neg' : ''}">${man(isleyenVer)}</div>${isleyenVer < 0 ? '<div class="cmp">Mənfi — işçilər artıq götürüb</div>' : ''}</div>
      <div class="card kpi"><div class="lbl">İşləyən işçi sayı</div><div class="val">${D.isc.filter(i => i.nov === 'İşçi' && i.status === 'İşləyir').length}</div></div>
      <div class="card kpi"><div class="lbl">Aylıq maaş fondu</div><div class="val">${man(D.isc.filter(i => i.nov === 'İşçi' && i.status === 'İşləyir').reduce((a, i) => a + num(i.cari_maas), 0))}</div></div>
      <div class="card kpi"><div class="lbl">Direktor götürmələri (cəmi)</div><div class="val">${man(sahibCem)}</div></div>
    </div>
    <div class="tbl-wrap"><table class="t">
      <thead><tr><th>Ad Soyad</th><th class="hide-m">Vəzifə</th><th class="hide-m">İşə giriş</th><th class="n">Maaş</th><th class="hide-m">Növbəti maaş günü</th><th class="n hide-m">Bu dövrdə götürüb</th><th class="n">Veriləcək</th><th class="hide-m">Status</th></tr></thead>
      <tbody>${list.map(i => { const bd = buDovrdeGoturdu(i, D); return `<tr class="click" data-i="${i.id}">
        <td><div class="cell-main">${esc(i.ad)}</div><div class="cell-sub">${i.nov === 'Sahib' ? 'Direktor' : esc(i.vezife || '')}</div></td>
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
    <div class="row2"><div class="field"><label class="f">Növ</label><select class="in" name="n"><option ${!i || i.nov === 'İşçi' ? 'selected' : ''}>İşçi</option><option value="Sahib" ${i && i.nov === 'Sahib' ? 'selected' : ''}>Direktor</option></select></div>
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
    if (!await tesdiq('Bu maaş dəyişikliyi silinsin?')) return;
    try { await q(sb.from('maas_deyisiklikleri').delete().eq('id', +b.dataset.dd)); S.cache = {}; isciForm((await isciMelumati()).isc.find(x => x.id === i.id)); } catch (er) { fail(er); }
  });
  if ($('#sil', m)) $('#sil', m).onclick = async () => {
    if (D.ode.some(o => o.isci_id === i.id)) { toast('Bu işçinin ödənişləri var — silmək olmaz. Əvəzinə çıxış tarixi yazın.', 5000); return; }
    if (!await tesdiq(`${i.ad} silinsin?`)) return;
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
  shell('isciler', 'İşçi ödənişləri', '', `
    <select class="in" id="isc" style="width:auto"><option value="">Bütün işçilər</option>${D.isc.map(i => `<option value="${i.id}" ${String(i.id) === isciId ? 'selected' : ''}>${esc(i.ad)}${i.status === 'Çıxıb' ? ' (çıxıb)' : ''}</option>`).join('')}</select>
    <select class="in" id="ay" style="width:auto"><option value="hamisi">Bütün aylar</option>${aylar.map(a => `<option value="${a.ay}" ${a.ay === ay ? 'selected' : ''}>${ayAdi(a.ay)}</option>`).join('')}</select>
    ${canWrite() ? `<button class="btn green" id="yeni">${ico('plus')}Ödəniş yaz</button>` : ''}
    <button class="btn" onclick="window.print()">${ico('print')}Çap</button>`);
  iscTabBagla('odenisler');
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
    if (i.nov === 'Sahib') { $('#qinfo', m).textContent = `Direktor — cəmi götürüb: ${man(i.goturduyu)}`; $('#sonra', m).style.display = 'none'; return; }
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
    if (!await tesdiq('Bu ödəniş silinsin?')) return;
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
  shell('isciler', 'İşçi çıxarışı', '', '');
  if (!isci) { $('#page').innerHTML = '<div class="card empty">İşçi yoxdur</div>'; return; }
  const ev = hesabHereketi(isci, D);
  const evvel = ev.filter(e => d1 && e.t < d1);
  const aralig = ev.filter(e => (!d1 || e.t >= d1) && (!d2 || e.t <= d2));
  const acilis = evvel.length ? evvel[evvel.length - 1].qaliq : 0;
  const hes = aralig.reduce((a, e) => a + e.hes, 0), ver = aralig.reduce((a, e) => a + e.ver, 0);
  const son = acilis + hes - ver;
  const sahib = isci.nov === 'Sahib';
  $('.topbar').innerHTML = `<div><h2>${esc(isci.ad)}</h2><div class="sub">${sahib ? 'Direktor' : esc(isci.vezife || '')} · işə giriş ${fd(isci.ise_giris)}${isci.status === 'Çıxıb' ? ' · çıxıb ' + fd(isci.cixis) : ''} · çıxarış tarixi ${fd(today())}</div></div>
    <div class="tools no-print">
      <select class="in" id="isc" style="width:auto">${D.isc.map(i => `<option value="${i.id}" ${i.id === isci.id ? 'selected' : ''}>${esc(i.ad)}${i.status === 'Çıxıb' ? ' (çıxıb)' : ''}</option>`).join('')}</select>
      <label class="muted" style="font-size:13px">Tarixdən</label><input class="in" type="date" id="d1" value="${d1}" style="width:auto">
      <label class="muted" style="font-size:13px">Tarixədək</label><input class="in" type="date" id="d2" value="${d2}" style="width:auto">
      ${d1 || d2 ? '<button class="btn" id="sifirla">Hamısı</button>' : ''}
      ${canWrite() ? `<button class="btn green" id="ode">${ico('plus')}Ödəniş</button><button class="btn" id="ed">Düzəlt</button>` : ''}
      <button class="btn primary" onclick="window.print()">${ico('print')}PDF / Çap</button></div>`;
  const go = (iid, a, b) => { const p = new URLSearchParams(); if (a) p.set('d1', a); if (b) p.set('d2', b); location.hash = `#/cixaris/${iid}` + (p.toString() ? '?' + p : ''); };
  iscTabBagla('cixaris');
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
      <tfoot><tr><td colspan="2">Cəm</td><td class="n">${fmt(hes)}</td><td class="n">${fmt(ver)}</td><td class="n sabit">${fmt(son)}</td></tr></tfoot></table></div>`;
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
        <th class="n hide-m">Xərc</th><th class="n hide-m">Maaş</th><th class="n hide-m">Direktor</th><th class="n hide-m">Digər məxaric</th><th class="n">Çıxan</th><th class="n">Ayın sonu</th></tr></thead>
      <tbody>${aylar.slice().reverse().map(r => `<tr><td style="white-space:nowrap">${ayAdi(r.ay)}</td><td class="n hide-m">${fmt(bas(r))}</td><td class="n hide-m">${fmt(r.ilkin)}</td><td class="n hide-m">${fmt(r.musteri_odenisi)}</td><td class="n hide-m">${fmt(r.diger_medaxil)}</td><td class="n"><b>${fmt(r.medaxil)}</b></td><td class="n hide-m">${fmt(r.pos)}</td>
        <td class="n hide-m">${fmt(r.rasxod)}</td><td class="n hide-m">${fmt(r.maas)}</td><td class="n hide-m">${fmt(r.sahib)}</td><td class="n hide-m">${fmt(r.diger_mexaric)}</td><td class="n"><b>${fmt(r.mexaric)}</b></td>
        <td class="n ${num(r.ay_sonu_kassa) < 0 ? 'neg' : ''}"><b>${fmt(r.ay_sonu_kassa)}</b></td></tr>`).join('')}</tbody></table></div>
    <h3 style="margin:22px 0 10px">Digər kassa əməliyyatları <span class="muted" style="font-weight:400;font-size:13px">(kredit, bank, direktorun qoyduğu pul və s.)</span></h3>
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
    <div class="field"><label class="f">Açıqlama</label><input class="in" name="a" value="${esc(d ? d.aciqlama || '' : '')}" placeholder="məs. Direktor kassaya pul qoydu"></div></form>`,
    `${d ? '<button class="btn danger" id="sil" style="margin-right:auto">Sil</button>' : ''}<button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yadda saxla</button>`);
  const f = $('#gf', m);
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    const row = { nov: f.n.value, tarix: f.t.value, mebleg: num(f.m.value), aciqlama: f.a.value.trim() || null };
    try { if (d) await q(sb.from('kassa_diger').update(row).eq('id', d.id)); else await q(sb.from('kassa_diger').insert(row)); closeModal(); toast('Yadda saxlanıldı'); refresh(); }
    catch (er) { fail(er); }
  };
  if ($('#sil', m)) $('#sil', m).onclick = async () => {
    if (!await tesdiq('Bu əməliyyat silinsin?')) return;
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
    if (!await tesdiq('Bu sifariş silinsin?')) return;
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
        ${row2('Xərclər', man(A.rasxod))}${row2('İşçilərə maaş', man(A.maas))}${row2('Direktor götürmələri', man(A.sahib))}${row2('Digər məxaric', man(A.diger_mexaric))}
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
    ${sec(`İşçi və direktor ödənişləri (${iod.length})`, iod.length ? `<table class="t"><thead><tr><th>Tarix</th><th>Ad</th><th>Növ</th><th class="n">Məbləğ</th></tr></thead>
      <tbody>${iod.map(o => `<tr><td>${fd(o.tarix)}</td><td>${esc(iMap[o.isci_id] ? iMap[o.isci_id].ad : '')}${iMap[o.isci_id] && iMap[o.isci_id].nov === 'Sahib' ? ' <span class="muted">(direktor)</span>' : ''}</td><td>${o.nov}</td><td class="n">${fmt(o.mebleg)}</td></tr>`).join('')}</tbody>
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
  shell('menfeet', 'Mənfəət', 'Satış − xərclər − işçi maaşı (direktor götürmələri daxil deyil)', `<button class="btn" onclick="window.print()">${ico('print')}Çap / PDF</button>`);
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
async function pageAyarlar(params) {
  params = params || new URLSearchParams();
  const w = canWrite() && icaze('ayarlar'), yaz = icaze('istifadeciler'), muh = muhFirma();
  const BOL = [['umumi', 'Abunə və firma'], ['rekv', 'Rekvizitlər'], ...(muh ? [['vergi', 'Vergi və ödənişlər']] : [['satis', 'Satış ayarları']]), ['ist', 'İstifadəçilər'], ...(yaz && !muh ? [['bild', 'Telegram']] : []), ['ehtiyat', 'Ehtiyat nüsxə']];
  const t = BOL.some(x => x[0] === params.get('t')) ? params.get('t') : 'umumi';
  shell('ayarlar', 'Ayarlar', '', '');
  const [A, ist0] = await Promise.all([ayarlar(), q(sb.from('uzvler').select('*').eq('magaza_id', S.magaza.id).order('yaradildi'))]);
  const ist = ist0.filter(i => !i.admin_giris || i.user_id === S.user.id);
  const rolAd = { gozleyir: '— Təsdiq gözləyir —', admin: 'Admin', muhasib: 'Mühasib', operator: 'Operator', sahibkar: 'Direktor', kuryer: 'Kuryer', bloklu: 'Bloklanıb' };
  const dis = w ? '' : 'disabled';
  const sat = (l, v) => `<tr><td class="muted" style="width:200px">${l}</td><td>${v}</td></tr>`;
  const el = [S.sistem.elaqe_telefon && esc(S.sistem.elaqe_telefon), S.sistem.elaqe_whatsapp && `<a href="https://wa.me/${S.sistem.elaqe_whatsapp.replace(/\D/g, '')}" target="_blank">WhatsApp</a>`].filter(Boolean).join(' · ');
  const icerik = {
    umumi: `<div class="card"><h3>Abunə ${S.magaza.dayandirilib ? '<span class="badge b-red">dayandırılıb</span>' : S.aktiv ? '<span class="badge b-green">qüvvədə</span>' : '<span class="badge b-red">bitib</span>'}</h3>
        <table class="ay-t"><tbody>
          ${sat('Vəziyyət', S.magaza.dayandirilib ? 'Hesab dayandırılıb — məlumatlara baxmaq və Excel-ə yükləmək olar' : S.aktiv ? 'Abunə qüvvədədir' : 'Abunə bitib — yeni yazı üçün uzadın')}
          ${sat('Bitmə', `<b>${fd(S.magaza.abune_bitir)}</b>${S.aktiv ? ` — ${S.qalan} gün qalıb` : ''}`)}
          ${sat('Qeydiyyat', fd(String(S.magaza.qeydiyyat || '').slice(0, 10)))}
          ${sat('Firma ID', `<code>${S.magaza.id}</code>`)}
          ${sat('İstifadəçilər', String(ist.length))}
          ${S.sistem.qiymet ? sat('Qiymət', esc(S.sistem.qiymet)) : ''}
          ${el ? sat('Uzatmaq üçün', el) : ''}</tbody></table></div>
      <div class="card" style="margin-top:16px"><h3>Firma</h3>
        <form id="mgf" class="row3" style="margin:0"><div class="field"><label class="f">${muh ? 'Firmanın adı' : 'Dükanın adı'}</label><input class="in" name="ad" value="${esc(S.magaza.ad)}" ${yaz ? '' : 'disabled'} required></div>
          <div class="field"><label class="f">Sahə</label><select class="in" name="sahe" ${yaz ? '' : 'disabled'}>${saheOpt(S.magaza.sahe || 'mebel')}</select></div>
          <div class="field"><label class="f">Telefon</label><input class="in" name="tel" value="${esc(S.magaza.telefon || '')}" ${yaz ? '' : 'disabled'}></div>
          ${yaz ? '<div><button class="btn primary">Yadda saxla</button></div>' : ''}</form></div>`,
    rekv: `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">Rekvizitlər</h3><a href="#" id="kartac">Şirkət kartı →</a></div>
        <p class="muted" style="font-size:13px">${muh ? 'Şirkət kartında və üzləşmə aktlarında çıxır.' : 'Müqavilə, çek və qəbzlərdə çıxır.'}</p>
        <form id="rf">${(muh ? REKVIZIT : REKVIZIT.filter(([k]) => ['firma_adi', 'firma_voen', 'firma_unvan', 'firma_telefon', 'bank_adi', 'iban'].includes(k))).map(([k, n]) => `<div class="field"><label class="f">${n}</label>${k === 'edv_payer' ? `<select class="in" name="${k}" ${dis}>${['', 'Bəli', 'Xeyr'].map(o => `<option ${(A[k] || '') === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`
          : k === 'huquqi_forma' ? `<select class="in" name="${k}" ${dis}>${[['', 'VÖEN-ə görə avtomatik (' + (fsMi({ firma_voen: A.firma_voen }) ? 'fərdi sahibkar' : 'hüquqi şəxs') + ')'], ['Hüquqi şəxs', 'Hüquqi şəxs (MMC, ASC…)'], ['Fərdi sahibkar', 'Fərdi sahibkar (fiziki şəxs)']].map(([v, t]) => `<option value="${v}" ${(A[k] || '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`
          : k === 'vergi_rejimi' ? `<select class="in" name="${k}" ${dis}>${['', 'Mənfəət vergisi + ƏDV', 'Mənfəət vergisi', 'Sadələşdirilmiş vergi', 'Fərdi sahibkar (gəlir vergisi)'].map(o => `<option ${(A[k] || '') === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`
          : `<input class="in" name="${k}" value="${esc(A[k] || (k === 'firma_adi' ? S.magaza.ad : ''))}" ${dis}>`}</div>`).join('')}${w ? '<button class="btn primary">Yadda saxla</button>' : ''}</form></div>`,
    satis: `<div class="card"><h3>Satış ayarları</h3><form id="sf2">
        <div class="row3"><div class="field"><label class="f">Gecikmə cəriməsi, gündəlik %</label><input class="in" type="number" step="0.01" min="0" name="cerime_gunluk" value="${esc(A.cerime_gunluk || '0')}" ${dis}></div>
          <div class="field"><label class="f">Güzəşt (gün)</label><input class="in" type="number" min="0" name="cerime_guzest" value="${esc(A.cerime_guzest || '3')}" ${dis}></div>
          <div class="field"><label class="f">Maksimum %</label><input class="in" type="number" min="0" name="cerime_max" value="${esc(A.cerime_max || '20')}" ${dis}></div></div>
        <div class="muted" style="font-size:12.5px;margin:-6px 0 14px">0 yazsanız cərimə hesablanmır. Məs. 0,1% gündəlik: 300 ₼ gecikən ödəniş 10 gün gecikəndə 3 ₼.</div>
        <div class="field"><label class="f">Qiymət növlərinin adları</label><div class="row2" style="gap:6px">${QNOV_DEF.map((d, i) => `<input class="in" name="qiymet_ad_${i + 1}" value="${esc(A['qiymet_ad_' + (i + 1)] || '')}" placeholder="${esc(d)}" ${dis} style="margin-bottom:6px">`).join('')}</div></div>
        <div class="field"><label class="f">Çekin altındakı yazı</label><input class="in" name="cek_altyazi" value="${esc(A.cek_altyazi || '')}" ${dis}></div>
        <div class="field"><label class="f">Müqavilənin şərtləri</label><textarea class="in" name="muqavile_sertleri" rows="4" ${dis}>${esc(A.muqavile_sertleri || '')}</textarea></div>
        ${w ? '<button class="btn primary">Yadda saxla</button>' : ''}</form></div>`,
    ist: `<div class="card" style="padding:0"><h3 style="padding:18px 20px 0">İstifadəçilər</h3>
        <table class="t" data-flt="0"><tbody>${ist.map(i => `<tr><td><div class="cell-main">${esc(i.ad || i.email || '')}</div><div class="cell-sub">${esc(i.email || '')}${i.user_id === S.user.id ? ' · siz' : ''}</div>${i.rol === 'gozleyir' ? '<span class="badge b-amber">Qoşulmaq istəyir — rol seçib təsdiqləyin və ya bloklayın</span>' : ''}</td>
          <td style="width:220px">${yaz && i.user_id !== S.user.id ? `<select class="in" data-u="${i.user_id}">${Object.entries(rolAd).map(([k, v]) => `<option value="${k}" ${i.rol === k ? 'selected' : ''}>${v}</option>`).join('')}</select>` : `<span class="badge ${i.rol === 'muhasib' ? 'b-blue' : i.rol === 'bloklu' ? 'b-red' : 'b-gray'}">${rolAd[i.rol] || i.rol}</span>`}</td></tr>`).join('')}</tbody></table>
        ${yaz ? `<div style="padding:12px 20px 18px"><b style="font-size:14px">Dəvət kodu</b><div class="muted" style="font-size:13px;margin:4px 0 8px">Kodu yalnız etibar etdiyiniz şəxsə verin. O, qeydiyyatda və ya "Müəssisələr → Kodla qoşul" ilə bu kodu yazanda siyahıda <b>"Təsdiq gözləyir"</b> kimi görünür və siz rol seçənə qədər heç nə görə bilmir. Kod başqasının əlinə keçibsə, "Yeni kod" basın.</div>
          <div style="display:flex;align-items:center;gap:10px"><span class="dkod" id="kod">${esc(S.magaza.devet_kodu)}</span><button class="btn sm" id="kodkop">Kopyala</button><button class="btn sm" id="kodyen">Yeni kod</button></div></div>` : ''}</div>`,
    bild: '<div class="card" id="tg"><h3>Telegram xülasəsi</h3><div class="muted">Yüklənir…</div></div>',
    vergi: muh ? `<div class="card"><h3>Vergi və ödənişlər</h3><p class="muted" style="font-size:13px">"Əmək haqqı → Ödəniləcək məbləğlər" bölməsi buradakı məlumatlarla hesablanır.</p>
        <form id="vf">
          <div class="field"><label class="f">Firmanın növü</label><div style="padding:8px 0"><b>${fsMi(A) ? 'Fərdi sahibkar (fiziki şəxs)' : 'Hüquqi şəxs'}</b> <span class="muted" style="font-size:12.5px">— dəyişmək üçün: Rekvizitlər → Hüquqi forma</span></div></div>
          ${fsMi(A) ? `<div class="field"><label class="f">Sahibkarın fəaliyyət sahəsi</label><select class="in" name="fs_sahe" ${dis}>${Object.keys(FS_SAHE_KOD).map(x => `<option ${x === (A.fs_sahe || 'Ticarət') ? 'selected' : ''}>${x}</option>`).join('')}</select>
            <div class="muted" style="font-size:12.5px;margin-top:4px">Sahibkarın MDSS kodu: Ticarət — 121340, Tikinti — 121350</div></div>` : ''}
          <div class="field"><label class="f">ƏDV — rentabellik faizi (%)</label><input class="in" name="edv_rent" value="${esc(A.edv_rent == null || A.edv_rent === '' ? '8' : A.edv_rent)}" style="max-width:140px" ${dis}>
            <div class="muted" style="font-size:12.5px;margin-top:4px">Ayın ƏDV-si = aylıq satışın ƏDV hissəsi (satış × 18/118) × bu faiz. Məs. 11 800 ₼ satış → 1 800 ₼ × 8% = 144 ₼. Kod: ${fsMi(A) ? '114118' : '114117'}.</div></div>
          <div class="row2"><div class="field"><label class="f">Fiziki şəxsə aylıq icarə haqqı (₼)</label><input class="in" name="icare_aylik" value="${esc(A.icare_aylik || '')}" placeholder="0,00" ${dis}></div>
            <div class="field"><label class="f">İcarəyə verən (ad, məlumat üçün)</label><input class="in" name="icare_veren" value="${esc(A.icare_veren || '')}" ${dis}></div></div>
          <div class="muted" style="font-size:12.5px;margin:-4px 0 14px">Hər ay bu məbləğdən 14% vergi hesablanır (kod: ${fsMi(A) ? '111121' : '111254'}). Hüquqi şəxsə ödənilən icarəni yazmayın — ondan vergi tutulmur. İcarə yoxdursa boş saxlayın.</div>
          ${w ? '<button class="btn primary">Yadda saxla</button>' : ''}</form></div>` : '',
    ehtiyat: `<div class="card"><h3>Ehtiyat nüsxə</h3><p class="muted" style="font-size:13px">${muh ? 'Bütün məlumatlar (qaimələr, ödənişlər, gömrük, bank, əmək haqqı, aktlar, kontragentlər) bir Excel faylına yüklənir.' : 'Bütün məlumatlar (müştərilər, satışlar, ödənişlər, xərclər, işçilər, kassa, sifarişlər) bir Excel faylına yüklənir.'}</p>
        <button class="btn primary" id="xls">${ico('down')}Excel-ə yüklə</button> <span class="muted" id="xlsinfo"></span></div>`,
  };
  $('#page').innerHTML = `<div class="ay-lay"><nav class="ay-nav">${BOL.map(([k, n]) => `<a href="#/ayarlar?t=${k}" class="${k === t ? 'on' : ''}">${n}</a>`).join('')}</nav><div class="ay-ic">${icerik[t]}</div></div>`;
  // --- hadisələr
  if ($('#mgf')) {
    $('#mgf').sahe.onchange = async e => {
      if (await tesdiq(`Sahə "${saheAd(e.target.value)}" olaraq dəyişdirilsin?${e.target.value === 'muhasibat' ? ' Menyuda qaimə, ƏDV və əmək haqqı bölmələri açılacaq.' : ''}`)) $('#mgf').requestSubmit();
      else e.target.value = S.magaza.sahe || 'mebel';
    };
    $('#mgf').onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      try { await q(sb.from('magazalar').update({ ad: f.ad.value.trim(), telefon: f.tel.value.trim() || null, sahe: f.sahe.value }).eq('id', S.magaza.id));
        S.magaza.ad = f.ad.value.trim(); S.magaza.sahe = f.sahe.value; S.magaza.telefon = f.tel.value.trim(); S.firmalar.forEach(x => { if (x.id === S.magaza.id) x.ad = S.magaza.ad; }); toast('Yadda saxlanıldı'); route(); } catch (er) { fail(er); }
    };
  }
  if ($('#rf') && w) $('#rf').onsubmit = async e => { e.preventDefault(); const f = e.target;
    try { for (const el of f.elements) if (el.name) await ayarYaz(A, el.name, el.value.trim()); S.cache = {}; toast('Rekvizitlər yadda saxlanıldı'); } catch (er) { fail(er); } };
  if ($('#kartac')) $('#kartac').onclick = e => { e.preventDefault(); sirketKarti().catch(fail); };
  if ($('#vf') && w) $('#vf').onsubmit = async e => { e.preventDefault(); const f = e.target;
    const rq = n => f[n].value.trim().replace(/\s/g, '').replace(',', '.');
    try { if (rq('icare_aylik') && isNaN(+rq('icare_aylik'))) return toast('İcarə haqqı rəqəm olmalıdır');
      if (rq('edv_rent') && isNaN(+rq('edv_rent'))) return toast('Rentabellik faizi rəqəm olmalıdır');
      for (const el of f.elements) if (el.name) await ayarYaz(A, el.name, ['icare_aylik', 'edv_rent'].includes(el.name) ? rq(el.name) : el.value.trim()); S.cache = {}; toast('Yadda saxlanıldı'); } catch (er) { fail(er); } };
  if ($('#sf2') && w) $('#sf2').onsubmit = async e => { e.preventDefault(); const f = e.target;
    try { for (const el of f.elements) if (el.name) await ayarYaz(A, el.name, el.value.trim()); S.cache = {}; toast('Yadda saxlanıldı'); } catch (er) { fail(er); } };
  $$('[data-u]').forEach(sel => sel.onchange = async () => {
    try { await q(sb.rpc('isci_uzvluk', { u: sel.dataset.u, m: S.magaza.id, r: sel.value, ic: null })); toast('Vəzifə dəyişdirildi'); } catch (er) { fail(er); }
  });
  if ($('#kodkop')) $('#kodkop').onclick = () => { navigator.clipboard && navigator.clipboard.writeText($('#kod').textContent); toast('Kod kopyalandı'); };
  if ($('#kodyen')) $('#kodyen').onclick = async () => {
    if (!await tesdiq('Köhnə kod işləməyəcək. Yeni kod yaradılsın?')) return;
    try { const k = await q(sb.rpc('devet_yenile')); S.magaza.devet_kodu = k; $('#kod').textContent = k; toast('Yeni kod: ' + k); } catch (er) { fail(er); }
  };
  if ($('#xls')) $('#xls').onclick = () => (muh ? muhExcel() : excelIxrac()).catch(fail);
  if ($('#tg')) telegramKart().catch(er => { $('#tg').innerHTML = '<h3>Telegram xülasəsi</h3><div class="muted">Hələ qurulmayıb.</div>'; console.warn(er); });
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
async function adminPaneleQayit() {
  try { await q(sb.rpc('admin_cix')); S.cache = {}; S.pos = null; YOL.length = 0; history.replaceState(null, '', SAYT() + '#/admin'); await start(); } catch (er) { fail(er); }
}
const ADM_TAB = a => `<div class="seg" id="admtab">${[['', 'Müəssisələr'], ['ist', 'İstifadəçilər']].map(([k, t]) => `<button data-t="${k}" class="${k === a ? 'on' : ''}">${t}</button>`).join('')}</div>`;
const admTabBagla = () => $$('#admtab button').forEach(b => b.onclick = () => { location.hash = '#/admin' + (b.dataset.t ? '?t=' + b.dataset.t : ''); });
async function adminFirmaAc(id, ad) {
  try { await q(sb.rpc('admin_firmaya_gir', { m: id })); S.cache = {}; S.pos = null; YOL.length = 0; history.replaceState(null, '', SAYT()); await start(); toast(`${ad} açıldı`, 3000); } catch (er) { fail(er); }
}
async function pageAdminIst() {
  shell('admin', 'Admin panel', 'Saytdan istifadə edənlər', `${ADM_TAB('ist')}<input class="in search" id="axtar" placeholder="Axtar: e-poçt, ad, müəssisə">`);
  admTabBagla();
  const rows = await q(sb.rpc('admin_istifadeciler'));
  const rolA = VEZIFE_AD;
  const draw = () => {
    const t = azLow($('#axtar').value || '');
    const l = rows.filter(r => !t || azLow([r.email, r.ad, r.telefon, ...(r.firmalar || []).map(f => f.ad)].join(' ')).includes(t));
    $('#page').innerHTML = `<div class="grid kpis"><div class="card kpi"><div class="lbl">İstifadəçilər</div><div class="val">${rows.length}</div></div>
        <div class="card kpi"><div class="lbl">Son 7 gündə girən</div><div class="val">${rows.filter(r => r.son_giris && gunFerqi(String(r.son_giris).slice(0, 10)) >= -7).length}</div></div>
        <div class="card kpi"><div class="lbl">Müəssisəsi olmayan</div><div class="val">${rows.filter(r => !(r.firmalar || []).length && !r.admin).length}</div></div></div>
      <div class="tbl-wrap" style="margin-top:16px"><table class="t"><thead><tr><th>İstifadəçi</th><th class="hide-m">Telefon</th><th class="hide-m">Məqsəd</th><th class="hide-m">Qeydiyyat</th><th class="hide-m">Son giriş</th><th>Müəssisələri</th><th></th></tr></thead>
      <tbody>${l.map(r => `<tr><td><div class="cell-main">${esc(r.ad || r.email)}${r.admin ? ' <span class="badge b-amber">Admin</span>' : ''}</div><div class="cell-sub">${esc(r.email)}</div></td>
        <td class="hide-m">${esc(r.telefon || '')}</td><td class="hide-m">${esc(r.meqsed ? saheAd(r.meqsed) : '')}</td><td class="hide-m">${fd(String(r.qeydiyyat).slice(0, 10))}</td>
        <td class="hide-m">${r.son_giris ? fd(String(r.son_giris).slice(0, 10)) : '—'}</td>
        <td>${(r.firmalar || []).map(f => `<div style="display:flex;gap:8px;align-items:center;margin:2px 0"><button class="btn sm primary" data-ac="${f.id}" data-ad="${esc(f.ad)}">Aç →</button><span>${esc(f.ad)}</span><span class="muted" style="font-size:12px">${rolA[f.rol] || f.rol}</span></div>`).join('') || '<span class="muted">—</span>'}</td>
        <td>${r.user_id !== S.user.id ? `<button class="btn sm danger" data-isil="${r.user_id}">Sil</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Tapılmadı</td></tr>'}</tbody></table></div>`;
    $$('[data-ac]').forEach(b => b.onclick = () => { b.disabled = true; adminFirmaAc(+b.dataset.ac, b.dataset.ad); });
    $$('[data-isil]').forEach(b => b.onclick = () => {
      const r = rows.find(x => x.user_id === b.dataset.isil), fl = r.firmalar || [];
      const m = modal('İstifadəçini sil', `<p style="margin-top:0">Hesab silinəcək: <b>${esc(r.email)}</b>${r.ad ? ` (${esc(r.ad)})` : ''}. Bu şəxs bir daha bu e-poçt və şifrə ilə daxil ola bilməyəcək — eyni e-poçtla yenidən qeydiyyatdan keçə bilər.</p>
        ${fl.length ? `<div style="font-size:13.5px;margin-bottom:8px">Bağlı olduğu müəssisələr: ${fl.map(f => `<b>${esc(f.ad)}</b> (${rolA[f.rol] || f.rol})`).join(', ')}</div>
          <label style="display:flex;gap:8px;align-items:flex-start;font-size:13.5px"><input type="checkbox" id="fsil"> <span>Yalnız bu şəxsin olan müəssisələri də <b>bütün məlumatları ilə</b> sil (başqa üzvü olan müəssisələrə toxunulmur)</span></label>` : ''}
        <div class="banner b-red-bg" style="margin-top:12px;font-size:13px">Bu əməliyyat geri qaytarılmır.</div>`,
        `<button class="btn" data-close>Ləğv et</button><button class="btn danger" id="silok">Hesabı sil</button>`);
      $('#silok', m).onclick = async () => { const fs = $('#fsil', m) && $('#fsil', m).checked;
        if (!await tesdiq(`${r.email} ${fs ? 'və onun müəssisələri ' : ''}həmişəlik silinsin?`)) return;
        $('#silok', m).disabled = true;
        try { const n = await q(sb.rpc('admin_istifadeci_sil', { u: r.user_id, firmalar_da: !!fs })); closeModal(); toast(`${r.email} silindi${n ? ` · ${n} müəssisə silindi` : ''}`); pageAdminIst(); }
        catch (er) { $('#silok', m).disabled = false; fail(er); } };
    });
  };
  $('#axtar').oninput = draw; draw();
}
async function pageAdmin(params) {
  if (params && params.get('t') === 'ist') return pageAdminIst();
  shell('admin', 'Admin panel', 'Bütün müəssisələr və abunələr', `${ADM_TAB('')}<input class="in search" id="axtar" placeholder="Axtar: müəssisə, ad, telefon, e-poçt">
    <div class="seg" id="nov">${[['hamisi', 'Hamısı'], ['satis', 'Satış'], ['muhasibat', 'Mühasibat']].map(([k, t], i) => `<button data-n="${k}" class="${i ? '' : 'on'}">${t}</button>`).join('')}</div>
    <div class="seg" id="fil">${[['hamisi', 'Hamısı'], ['aktiv', 'Aktiv'], ['bitir', 'Bitir (7 gün)'], ['bitib', 'Bitib']].map(([k, t], i) => `<button data-f="${k}" class="${i ? '' : 'on'}">${t}</button>`).join('')}</div>`);
  admTabBagla();
  const [rows, sis, ode] = await Promise.all([q(sb.rpc('admin_magazalar')), sistemOxu(), q(sb.from('abune_odenisleri').select('*').order('tarix', { ascending: false }))]);
  const buAy = ayBasi(today());
  const gelirAy = ode.filter(o => o.tarix >= buAy).reduce((a, o) => a + num(o.mebleg), 0);
  const gelirCem = ode.reduce((a, o) => a + num(o.mebleg), 0);
  const son12 = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 11 + i); const a = iso(d).slice(0, 7);
    return { ay: a + '-01', c: ode.filter(o => o.tarix.slice(0, 7) === a).reduce((x, o) => x + num(o.mebleg), 0) }; });
  const mx = Math.max(1, ...son12.map(x => x.c));
  rows.forEach(r => { r.qalan = gunFerqi(r.abune_bitir); });
  let fil = 'hamisi', nov = 'hamisi';
  const wa = t => t ? `https://wa.me/${(t.replace(/\D/g, '').replace(/^0/, '994'))}` : '';
  const draw = () => {
    const s = ($('#axtar').value || '').toLocaleLowerCase('az');
    let list = rows.filter(r => !s || [r.ad, r.sahib_ad, r.telefon, r.email, r.uzvler].join(' ').toLocaleLowerCase('az').includes(s));
    if (nov === 'muhasibat') list = list.filter(r => r.sahe === 'muhasibat'); else if (nov === 'satis') list = list.filter(r => r.sahe !== 'muhasibat');
    if (fil === 'aktiv') list = list.filter(r => r.aktiv);
    if (fil === 'bitir') list = list.filter(r => r.aktiv && r.qalan <= 7);
    if (fil === 'bitib') list = list.filter(r => !r.aktiv);
    const say = f => rows.filter(f).length;
    $('#page').innerHTML = `
      <div class="grid kpis">
        <div class="card kpi"><div class="lbl">Müəssisələr</div><div class="val">${rows.length}</div><div class="cmp">satış ${say(r => r.sahe !== 'muhasibat')} · mühasibat ${say(r => r.sahe === 'muhasibat')}</div></div>
        <div class="card kpi"><div class="lbl">Aktiv</div><div class="val pos">${say(r => r.aktiv)}</div></div>
        <div class="card kpi"><div class="lbl">7 gün içində bitir</div><div class="val">${say(r => r.aktiv && r.qalan <= 7)}</div></div>
        <div class="card kpi"><div class="lbl">Bitib / dayandırılıb</div><div class="val neg">${say(r => !r.aktiv)}</div></div>
        <div class="card kpi"><div class="lbl">Gəlir — ${ayAdi(buAy)}</div><div class="val pos">${man(gelirAy)}</div><div class="cmp">Cəmi: ${man(gelirCem)}</div></div>
      </div>
      <div class="card" style="margin-top:16px"><h3>Abunə gəliri — son 12 ay</h3>
        <div class="bars">${son12.map(x => `<div class="col" title="${ayAdi(x.ay)}: ${man(x.c)}"><div class="pair"><div class="bar" style="height:${x.c / mx * 100}%;background:var(--c1)"></div></div><div class="lbl">${ayQisa(x.ay)}</div></div>`).join('')}</div></div>
      <div class="tbl-wrap" style="margin-top:16px"><table class="t"><thead><tr><th>Dükan</th><th class="hide-m">Əlaqə</th><th class="hide-m">Qeydiyyat</th><th>Abunə</th><th class="n hide-m">Ödəyib</th><th class="n hide-m">Müştəri / satış</th><th class="hide-m">Son iş</th><th></th></tr></thead>
      <tbody>${list.map(r => `<tr><td><div class="cell-main">${esc(r.ad)} <span class="badge ${r.sahe === 'muhasibat' ? 'b-blue' : 'b-gray'}">${esc(saheAd(r.sahe))}</span></div><div class="cell-sub">${esc(r.uzvler || r.sahib_ad || '')}${r.uzv_sayi > 1 ? ` · ${r.uzv_sayi} istifadəçi` : ''}${r.admin_qeyd ? ` · <i>${esc(r.admin_qeyd)}</i>` : ''}</div></td>
        <td class="hide-m"><div>${esc(r.telefon || '')}${r.telefon ? ` <a href="${wa(r.telefon)}" target="_blank" title="WhatsApp">WA</a>` : ''}</div><div class="cell-sub">${esc(r.email || '')}</div></td>
        <td class="hide-m">${fd(String(r.qeydiyyat).slice(0, 10))}</td>
        <td>${fd(r.abune_bitir)}<div>${r.dayandirilib ? '<span class="badge b-red">Dayandırılıb</span>' : r.qalan < 0 ? `<span class="badge b-red">${-r.qalan} gün keçib</span>` : `<span class="badge ${r.qalan <= 7 ? 'b-amber' : 'b-green'}">${r.qalan} gün qalıb</span>`}</div></td>
        <td class="n hide-m">${num(r.odenilib) ? fmt(r.odenilib) + ' ₼' : '—'}${r.son_odenis ? `<div class="cell-sub">${fd(r.son_odenis)}</div>` : ''}</td>
        <td class="n hide-m">${r.sahe === 'muhasibat' ? `${fmt(r.qaime_sayi)} qaimə` : `${fmt(r.musteri_sayi)} / ${fmt(r.satis_sayi)}`}</td>
        <td class="hide-m">${r.son_aktivlik ? fd(String(r.son_aktivlik).slice(0, 10)) : '—'}</td>
        <td class="n" style="white-space:nowrap"><button class="btn sm primary" data-ac="${r.id}">Aç →</button> <button class="btn sm green" data-od="${r.id}">₼ Ödəniş</button> <button class="btn sm" data-uz="${r.id}" data-ay="1">+1 ay</button> <button class="btn sm" data-ed="${r.id}">…</button></td></tr>`).join('')
        || '<tr><td colspan="8" class="empty">Müəssisə tapılmadı</td></tr>'}</tbody></table></div>
      <div class="card" style="margin-top:16px;max-width:720px"><h3>Sistem ayarları</h3><p class="muted" style="margin-top:-6px;font-size:13px">Qeydiyyat səhifəsində və abunə xəbərdarlıqlarında görünür.</p>
        <form id="sf"><div class="row2"><div class="field"><label class="f">Əlaqə telefonu</label><input class="in" name="elaqe_telefon" value="${esc(sis.elaqe_telefon || '')}"></div>
        <div class="field"><label class="f">WhatsApp nömrəsi (994…)</label><input class="in" name="elaqe_whatsapp" value="${esc(sis.elaqe_whatsapp || '')}"></div></div>
        <div class="row2"><div class="field"><label class="f">Qiymət (məs. "ayda 20 ₼")</label><input class="in" name="qiymet" value="${esc(sis.qiymet || '')}"></div>
        <div class="field"><label class="f">Pulsuz sınaq (gün)</label><input class="in" type="number" min="0" name="sinaq_gun" value="${esc(sis.sinaq_gun || '14')}"></div></div>
        <button class="btn primary">Yadda saxla</button></form></div>`;
    $$('[data-ac]').forEach(b => b.onclick = async () => {
      const r = rows.find(x => x.id === +b.dataset.ac); b.disabled = true; adminFirmaAc(r.id, r.ad);
    });
    $$('[data-uz]').forEach(b => b.onclick = async () => {
      const r = rows.find(x => x.id === +b.dataset.uz), ay = +b.dataset.ay;
      if (!await tesdiq(`${r.ad} — abunə ${ay === 12 ? '1 il' : '1 ay'} uzadılsın?`)) return;
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
        `<button class="btn danger" id="fsilbtn" style="margin-right:auto">Müəssisəni sil</button><button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yadda saxla</button>`, true);
      $('#fsilbtn', md).onclick = async () => {
        const yaz = await sorus(`"${r.ad}" müəssisəsi BÜTÜN məlumatları ilə (satışlar, qaimələr, ödənişlər, istifadəçi bağlantıları) həmişəlik silinəcək. Təsdiq üçün müəssisənin adını yazın:`, { input: '', ok: 'Sil', danger: true, legv: 'Ləğv et' });
        if (yaz == null) return; if (yaz.trim() !== r.ad.trim()) return toast('Ad düz yazılmayıb — silinmədi');
        try { await q(sb.rpc('admin_firma_sil', { m: r.id })); closeModal(); toast(`${r.ad} silindi`); pageAdmin(new URLSearchParams()); } catch (er) { fail(er); } };
      $$('[data-os]', md).forEach(x => x.onclick = async () => { if (!await tesdiq('Bu ödəniş qeydi silinsin? (bitmə tarixi dəyişmir)')) return;
        try { await q(sb.from('abune_odenisleri').delete().eq('id', +x.dataset.os)); closeModal(); pageAdmin(); } catch (er) { fail(er); } });
      if ($('#demo', md)) $('#demo', md).onclick = async () => { if (!await tesdiq(`"${r.ad}" dükanı 10 məhsul, 30 müştəri, ~45 satış, ödəniş və xərclərlə doldurulsun?`)) return;
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
  $$('#nov button').forEach(b => b.onclick = () => { nov = b.dataset.n; $$('#nov button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
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
    ['Kassa', ['Ay', 'İlkin ödənişlər', 'Müştəri ödənişləri', 'Digər mədaxil', 'Daxil olan', 'Xərc', 'Maaş', 'Direktor', 'Digər məxaric', 'Çıxan', 'Ay sonu'], kas.map(k => [k.ay, num(k.ilkin), num(k.musteri_odenisi), num(k.diger_medaxil), num(k.medaxil), num(k.rasxod), num(k.maas), num(k.sahib), num(k.diger_mexaric), num(k.mexaric), num(k.ay_sonu_kassa)])],
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
      if (ri === 0 && !s.basliqsiz) return `<c r="${ref}" s="1" t="inlineStr"><is><t>${x(v)}</t></is></c>`;
      if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${Number.isInteger(v) && Math.abs(v) < 1e6 && ci === 0 ? '' : ' s="3"'}><v>${v}</v></c>`;
      if (isDate(v)) return `<c r="${ref}" s="2"><v>${serial(v)}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    const widths = s.rows[0].map((h, ci) => Math.min(45, Math.max(10, ...s.rows.slice(0, 200).map(r => String(r[ci] == null ? '' : r[ci]).length + 2))));
    files[`xl/worksheets/sheet${i + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">${s.basliqsiz ? '' : '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'}</sheetView></sheetViews><cols>${widths.map((w2, ci) => `<col min="${ci + 1}" max="${ci + 1}" width="${w2}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData>${s.basliqsiz ? '' : `<autoFilter ref="A1:${col(s.rows[0].length - 1)}${s.rows.length}"/>`}</worksheet>`;
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
function idxalPencere({ basliq, izah, saheler, numune, yaz, ust, xam }) {
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
    { // başlıq sətri yuxarıda deyilsə (hesabat başlığı, boş sətirlər) — sahə adlarına ən çox uyğun gələn sətri tap
      const adlar = saheler.flatMap(sh => [sh.ad, ...(sh.ox || [])].map(normBas)).filter(x => x.length > 1);
      let en = 0, enI = 0;
      rows.slice(0, 20).forEach((r, i) => { const n = r.filter(c => { const b = normBas(c); return b && adlar.some(a => b === a || (b.length > 2 && a.length > 2 && (b.startsWith(a) || a.startsWith(b)))); }).length; if (n > en) { en = n; enI = i; } });
      if (ust) ust(rows.slice(0, enI));
      if (enI > 0) rows = rows.slice(enI);
    }
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
        if (xam) { o.__xam = {}; bas.forEach((h, hi) => { const v = r[hi]; if (h && v != null && String(v).trim() !== '') o.__xam[h] = v; }); }
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
  const cemSut = foot ? ths.map((th, i) => !!fCell[i] && i > 0 && fCell[i].classList.contains('n') && !fCell[i].classList.contains('sabit') && ededle(xanaMetni(fCell[i])) != null
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
  if (!icaze('hesabat')) $$('[data-x]', bar).forEach(b => b.remove()); else $('[data-x=xls]', bar).onclick = () => cedveliExcel(tb);
  const saySel = $('.flt-say select', bar);
  if (saySel) saySel.onchange = () => { try { localStorage.setItem('cedvel_say', saySel.value); } catch (_) {} SAY._v = +saySel.value; PG[acar] = 0; tetbiq(); };
  // səhifə keçidləri cədvəlin altında
  let pager = host.nextElementSibling && host.nextElementSibling.classList.contains('flt-pager') ? host.nextElementSibling : null;
  if (!pager) { pager = document.createElement('div'); pager.className = 'flt-pager no-print'; host.parentElement.insertBefore(pager, host.nextSibling); }
  const metnler = new Map(rows().map(r => [r, azLow(r.innerText)]));
  const xp = $('[data-x=pdf]', bar); if (xp) xp.onclick = () => cedveliPdf(tb);
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
