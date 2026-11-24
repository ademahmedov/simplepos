/* =====================================================================
   SAT PROQRAM SAS — brauzer proqramı (1-ci mərhələ)
   Panel, Satışlar, Müştərilər. Məlumatlar Supabase bazasında saxlanır.
   ===================================================================== */
(function () {
'use strict';

const CFG = window.SAT_CONFIG || {};
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
const S = { user: null, rol: null, ad: '', cache: {} };
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
const canWrite = () => S.rol === 'muhasib';

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
  panel: '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>',
  sale: '<path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45C4.52 15.37 5.48 17 7 17h12v-2H7l1.1-2h7.45c.75 0 1.41-.41 1.75-1.03L21.7 4H5.21l-.94-2H1zm16 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>',
  users: '<path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>',
  exp: '<path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>',
  worker: '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>',
  cash: '<path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>',
  plus: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>',
  print: '<path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>'
};
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

/* ---------------- giriş ---------------- */
function loginView(msg) {
  app.innerHTML = `<div class="login-wrap"><form class="login-card" id="lf">
    <h1>${esc(CFG.FIRMA_ADI || 'Sat Proqram')}</h1><p>Hesabınıza daxil olun</p>
    <div class="field"><label class="f">E-poçt</label><input class="in" type="email" name="e" autocomplete="username" required></div>
    <div class="field"><label class="f">Şifrə</label><input class="in" type="password" name="p" autocomplete="current-password" required></div>
    <button class="btn primary" style="width:100%;justify-content:center;padding:11px">Daxil ol</button>
    <div class="err">${esc(msg || '')}</div></form></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const f = e.target; const btn = $('button', f); btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: f.e.value.trim(), password: f.p.value });
    btn.disabled = false;
    if (error) { $('.err', f).textContent = 'E-poçt və ya şifrə yanlışdır.'; return; }
    start();
  };
}

async function start() {
  const { data } = await sb.auth.getSession();
  const ses = data && data.session;
  if (!ses) return loginView();
  S.user = ses.user;
  try {
    const me = await q(sb.from('istifadeciler').select('rol,ad').eq('id', S.user.id).maybeSingle());
    if (!me) { await sb.auth.signOut(); return loginView('Bu hesaba hələ icazə verilməyib. Mühasibə müraciət edin.'); }
    S.rol = me.rol; S.ad = me.ad || S.user.email;
  } catch (e) { return loginView('Baza ilə əlaqə alınmadı: ' + e.message); }
  if (!location.hash) location.hash = '#/panel';
  route();
}

/* ---------------- çərçivə ---------------- */
const NAV = [
  ['panel', 'Panel', 'panel'], ['satislar', 'Satışlar', 'sale'], ['musteriler', 'Müştərilər', 'users'],
];
const SOON = [['Rasxodlar', 'exp'], ['İşçilər və maaş', 'worker'], ['Kassa', 'cash']];

function shell(active, title, sub, tools, body) {
  const navA = NAV.map(([k, t, i]) => `<a href="#/${k}" class="${active === k ? 'active' : ''}">${ico(i)}${t}</a>`).join('');
  app.innerHTML = `<div class="shell">
   <aside class="side"><div class="logo">${esc(CFG.FIRMA_ADI || 'Sat Proqram')}<small>${S.rol === 'sahibkar' ? 'Sahibkar baxışı' : 'Mühasib'}</small></div>
    <nav>${navA}<div class="sec">Növbəti mərhələ</div>${SOON.map(([t, i]) => `<a class="soon">${ico(i)}${t}</a>`).join('')}</nav>
    <div class="who"><b>${esc(S.ad)}</b>${esc(S.user.email)}<br><button id="out">Çıxış</button></div></aside>
   <div class="mobile-bar"><b>${esc(CFG.FIRMA_ADI || 'Sat Proqram')}</b><button id="out2">Çıxış</button></div>
   <main class="main"><div class="topbar"><div><h2>${title}</h2><div class="sub">${sub || ''}</div></div><div class="tools">${tools || ''}</div></div>
   <div id="page">${body || '<div class="empty"><div class="spinner" style="margin:auto"></div></div>'}</div></main>
   <nav class="bottom-nav">${NAV.map(([k, t, i]) => `<a href="#/${k}" class="${active === k ? 'active' : ''}">${ico(i)}${t}</a>`).join('')}</nav>
  </div>`;
  const out = async () => { await sb.auth.signOut(); S.cache = {}; location.hash = ''; loginView(); };
  $('#out').onclick = out; $('#out2').onclick = out;
}

function route() {
  if (!S.user) return;
  closeModal();
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const params = new URLSearchParams(qs || '');
  const [p, id] = path.split('/');
  const run = { panel: pagePanel, satislar: () => pageSatislar(params), musteriler: () => pageMusteriler(params), musteri: () => pageMusteri(id) }[p] || pagePanel;
  Promise.resolve(run()).catch(fail);
}
window.addEventListener('hashchange', route);

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

  const kpi = (lbl, v, prev, opt = {}) => `<div class="card kpi"><div class="lbl">${lbl}</div>
    <div class="val ${opt.sign && num(v) < 0 ? 'neg' : ''}">${opt.count ? fmt(v) : man(v)}</div>
    ${prev !== undefined ? `<div class="cmp">Keçən ay: ${opt.count ? fmt(prev) : man(prev)}</div>` : (opt.note ? `<div class="cmp">${opt.note}</div>` : '')}</div>`;

  const son12 = aylar.slice(-12);
  const mx = Math.max(1, ...son12.map(x => Math.max(num(x.satis), num(x.medaxil))));
  const chart = `<div class="bars">${son12.map(x => `<div class="col" title="${ayAdi(x.ay)}: satış ${man(x.satis)}, daxil olan ${man(x.medaxil)}">
      <div class="pair"><div class="bar" style="height:${num(x.satis) / mx * 100}%;background:var(--blue)"></div>
      <div class="bar" style="height:${num(x.medaxil) / mx * 100}%;background:#7fb3a0"></div></div>
      <div class="lbl">${ayQisa(x.ay)}</div></div>`).join('')}</div>
      <div class="legend"><span><i style="background:var(--blue)"></i>Satış</span><span><i style="background:#7fb3a0"></i>Kassaya daxil olan</span></div>`;

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
   <div class="grid kpis">
     ${kpi(`Satış — ${ayAdi(buAy)}`, A.satis, B.satis)}
     ${kpi('Satış sayı', A.satis_sayi, B.satis_sayi, { count: true })}
     ${kpi('Kassaya daxil olan pul', A.medaxil, B.medaxil)}
     ${kpi('Xərclər (rasxod)', A.rasxod, B.rasxod)}
     ${kpi('İşçilərə verilən maaş', A.maas, B.maas)}
     ${kpi('Sahib götürmələri', A.sahib, B.sahib)}
     ${kpi('Daxil olan − çıxan', xalis(A), xalis(B), { sign: true })}
     ${kpi('Hazırda kassada', kassa, undefined, { sign: true, note: 'Kassa hesabına görə' })}
     ${kpi('Ümumi müştəri borcu', borc, undefined, { note: mus.filter(m => num(m.qaliq) > 0).length + ' borclu müştəri' })}
     ${kpi('Gecikən borc (30+ gün)', gecCem, undefined, { note: gec.length + ' müştəri' })}
     ${kpi('İşçilərə veriləcək maaş', isciVer, undefined, { sign: true, note: 'İşləyən işçilər üzrə' })}
     ${kpi('Keçən ayın satışı', B.satis, undefined, { note: ayAdi(kecen) })}
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
     ${canWrite() ? `<button class="btn primary" id="yeni">${ico('plus')}Yeni satış</button>` : ''}
     <button class="btn" onclick="window.print()">${ico('print')}Çap</button>`);
  if (ay === 'hamisi') $('#ay').value = 'hamisi';
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
      <thead><tr><th>№</th><th>Tarix</th><th>Müştəri</th><th class="hide-m">Mal</th><th class="n">Dəyəri</th><th class="n hide-m">İlkin</th><th class="n hide-m">Ödənilən</th><th class="n">Qalıq</th><th class="hide-m">Son ödəniş</th></tr></thead>
      <tbody>${list.map(r => `<tr class="click" data-s="${r.id}">
        <td class="muted">${esc(r.satis_no)}</td><td>${fd(r.tarix)}</td>
        <td><div class="cell-main">${esc(r.musteri)}</div><div class="cell-sub">${esc(r.unvan || '')}${r.telefon ? ' · ' + esc(r.telefon) : ''}</div></td>
        <td class="hide-m">${esc(r.mal || '')}</td><td class="n">${fmt(r.deyer)}</td><td class="n hide-m">${fmt(r.ilkin)}</td>
        <td class="n hide-m">${fmt(r.odenilen)}</td><td class="n">${num(r.qaliq) > 0 ? `<b>${fmt(r.qaliq)}</b>` : '<span class="badge b-green">Bağlanıb</span>'}</td>
        <td class="hide-m">${fd(r.son_odenis)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">${list.length} satış</td><td></td><td class="hide-m"></td><td class="n">${fmt(sum('deyer'))}</td><td class="n hide-m">${fmt(sum('ilkin'))}</td><td class="n hide-m">${fmt(sum('odenilen'))}</td><td class="n">${fmt(sum('qaliq'))}</td><td class="hide-m"></td></tr></tfoot>
      </table></div>` : '<div class="card empty">Bu dövrdə satış yoxdur</div>';
    $$('[data-s]').forEach(tr => tr.onclick = () => satisModal(+tr.dataset.s));
  };
  $('#axtar').oninput = draw;
  draw();
}

async function satisModal(id) {
  const [s, pays] = await Promise.all([
    q(sb.from('v_satislar').select('*').eq('id', id).single()),
    q(sb.from('satis_odenisleri').select('*').eq('satis_id', id).order('tarix').order('id')),
  ]);
  const w = canWrite();
  const m = modal(`Satış ${esc(s.satis_no)}`, `
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <div><div class="cell-main" style="font-size:16px">${esc(s.musteri)}</div><div class="cell-sub">${esc(s.unvan || '')}${s.telefon ? ' · ' + esc(s.telefon) : ''}</div></div>
      <div style="text-align:right"><div>${fd(s.tarix)}</div><div class="cell-sub">${esc(s.mal || '')}</div></div></div>
    <div class="info"><div><span>Dəyəri</span><b>${man(s.deyer)}</b></div><div><span>İlkin ödəniş</span><b>${man(s.ilkin)}</b></div>
      <div><span>Kredit ödənişləri</span><b>${man(s.odenilen)}</b></div><div><span>Qalıq borc</span><b class="${num(s.qaliq) > 0 ? 'neg' : 'pos'}">${man(s.qaliq)}</b></div>
      <div><span>Ödəniş sayı</span><b>${s.odenis_sayi}</b></div><div><span>Son ödəniş</span><b>${fd(s.son_odenis) || '—'}</b></div></div>
    ${s.qeyd ? `<p class="muted">Qeyd: ${esc(s.qeyd)}</p>` : ''}
    <h4 style="margin:6px 0 8px">Ödənişlər</h4>
    ${pays.length ? `<div class="tbl-wrap" style="box-shadow:none;border:1px solid var(--line)"><table class="t"><thead><tr><th>#</th><th>Tarix</th><th class="n">Məbləğ</th><th>Qeyd</th>${w ? '<th></th>' : ''}</tr></thead><tbody>
      ${pays.map((p, i) => `<tr><td class="muted">${i + 1}</td><td>${fd(p.tarix)} ${p.texmini ? '<span class="badge b-gray" title="Excel-də tarixi yazılmamışdı, təxmini qoyulub">təxmini</span>' : ''}</td><td class="n">${fmt(p.mebleg)}</td><td>${esc(p.qeyd || '')}</td>
      ${w ? `<td class="n"><button class="btn sm danger" data-del="${p.id}">Sil</button></td>` : ''}</tr>`).join('')}</tbody></table></div>` : '<div class="muted">Hələ ödəniş yoxdur.</div>'}
    ${w && num(s.qaliq) > 0 ? `<form id="pf" style="margin-top:16px;background:#f8fafc;border-radius:10px;padding:14px">
      <b style="display:block;margin-bottom:10px">Yeni ödəniş</b>
      <div class="row2"><div class="field"><label class="f">Tarix</label><input class="in" type="date" name="t" value="${today()}" required></div>
      <div class="field"><label class="f">Məbləğ (qalıq ${fmt(s.qaliq)})</label><input class="in" type="number" step="0.01" min="0.01" name="m" required></div></div>
      <div class="field"><label class="f">Qeyd (istəyə bağlı)</label><input class="in" name="q"></div>
      <button class="btn green">Ödənişi yaz</button></form>` : ''}`,
    `<a class="btn" href="#/musteri/${s.musteri_id}">Müştəriyə bax</a>${w ? '<button class="btn" id="ed">Satışı düzəlt</button>' : ''}<button class="btn" data-close>Bağla</button>`, true);
  $$('[data-close]', m).forEach(b => b.onclick = closeModal);
  const pf = $('#pf', m);
  if (pf) pf.onsubmit = async e => {
    e.preventDefault();
    const mb = num(pf.m.value);
    if (mb > num(s.qaliq) + 0.001 && !confirm(`Məbləğ qalıq borcdan (${fmt(s.qaliq)}) çoxdur. Yenə də yazılsın?`)) return;
    $('button', pf).disabled = true;
    try {
      await q(sb.from('satis_odenisleri').insert({ satis_id: id, tarix: pf.t.value, mebleg: mb, qeyd: pf.q.value.trim() || null }));
      toast('Ödəniş yazıldı'); refresh(); satisModal(id);
    } catch (er) { fail(er); $('button', pf).disabled = false; }
  };
  $$('[data-del]', m).forEach(b => b.onclick = async () => {
    if (!confirm('Bu ödəniş silinsin?')) return;
    try { await q(sb.from('satis_odenisleri').delete().eq('id', +b.dataset.del)); toast('Ödəniş silindi'); refresh(); satisModal(id); } catch (er) { fail(er); }
  });
  if ($('#ed', m)) $('#ed', m).onclick = () => satisDuzelt(s);
}

function satisDuzelt(s) {
  const m = modal(`Satışı düzəlt — ${esc(s.satis_no)}`, `<form id="ef">
    <div class="row2"><div class="field"><label class="f">Tarix</label><input class="in" type="date" name="t" value="${s.tarix}" required></div>
    <div class="field"><label class="f">Götürdüyü mal</label><input class="in" name="mal" value="${esc(s.mal || '')}"></div></div>
    <div class="row2"><div class="field"><label class="f">Malın dəyəri</label><input class="in" type="number" step="0.01" min="0" name="d" value="${s.deyer}" required></div>
    <div class="field"><label class="f">İlkin ödəniş</label><input class="in" type="number" step="0.01" min="0" name="i" value="${s.ilkin}"></div></div>
    <div class="field"><label class="f">Qeyd</label><input class="in" name="q" value="${esc(s.qeyd || '')}"></div></form>`,
    `<button class="btn danger" id="sil" style="margin-right:auto">Satışı sil</button><button class="btn" data-close>Ləğv et</button><button class="btn primary" id="ok">Yadda saxla</button>`);
  $$('[data-close]', m).forEach(b => b.onclick = () => satisModal(s.id));
  $('#ok', m).onclick = async () => {
    const f = $('#ef', m); if (!f.reportValidity()) return;
    try {
      await q(sb.from('satislar').update({ tarix: f.t.value, mal: f.mal.value.trim() || null, deyer: num(f.d.value), ilkin: num(f.i.value), qeyd: f.q.value.trim() || null }).eq('id', s.id));
      toast('Satış yeniləndi'); refresh(); satisModal(s.id);
    } catch (er) { fail(er); }
  };
  $('#sil', m).onclick = async () => {
    if (!confirm(`${s.satis_no} satışı və onun bütün ödənişləri silinsin? Bu geri qaytarılmır.`)) return;
    try { await q(sb.from('satislar').delete().eq('id', s.id)); closeModal(); toast('Satış silindi'); refresh(); } catch (er) { fail(er); }
  };
}

async function yeniSatis(musteriId) {
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
    <div class="row2"><div class="field"><label class="f">Tarix</label><input class="in" type="date" name="t" value="${today()}" required></div>
    <div class="field"><label class="f">Götürdüyü mal</label><input class="in" name="mal" placeholder="məs. Mətbəx mebeli"></div></div>
    <div class="row2"><div class="field"><label class="f">Malın dəyəri</label><input class="in" type="number" step="0.01" min="0" name="d" required></div>
    <div class="field"><label class="f">İlkin ödəniş</label><input class="in" type="number" step="0.01" min="0" name="i" value="0"></div></div>
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
  const qal = () => { $('#qal', m).textContent = f.d.value ? `Kreditə qalan: ${man(num(f.d.value) - num(f.i.value))}` : ''; };
  f.d.oninput = qal; f.i.oninput = qal;
  $$('[data-close]', m).forEach(b => b.onclick = closeModal);
  $('#ok', m).onclick = async () => {
    if (!f.reportValidity()) return;
    if (tip === 'kohne' && !secilen) { toast('Müştərini seçin və ya "Yeni müştəri" yazın'); return; }
    if (tip === 'yeni' && !f.ad.value.trim()) { toast('Müştərinin adını yazın'); return; }
    if (num(f.i.value) > num(f.d.value)) { toast('İlkin ödəniş dəyərdən çox ola bilməz'); return; }
    const btn = $('#ok', m); btn.disabled = true;
    try {
      let mid = secilen && secilen.id;
      if (tip === 'yeni') {
        const nm = await q(sb.from('musteriler').insert({ ad: f.ad.value.trim(), unvan: f.un.value.trim() || null, telefon: f.tel.value.trim() || null }).select().single());
        mid = nm.id;
      }
      const ns = await q(sb.from('satislar').insert({ musteri_id: mid, tarix: f.t.value, mal: f.mal.value.trim() || null, deyer: num(f.d.value), ilkin: num(f.i.value), qeyd: f.q.value.trim() || null }).select().single());
      closeModal(); toast(`Satış yazıldı: ${ns.satis_no}`); refresh();
    } catch (er) { fail(er); btn.disabled = false; }
  };
}

function refresh() { S.cache = {}; route(); }

/* =====================================================================
   MÜŞTƏRİLƏR
   ===================================================================== */
async function pageMusteriler(params) {
  const fil = params.get('f') || 'borclu';
  shell('musteriler', 'Müştərilər', '', `<input class="in search" id="axtar" placeholder="Axtar: ad, telefon, ünvan">
    <div class="seg" id="fil">${[['borclu','Borclular'],['gecikenler','Gecikənlər'],['hamisi','Hamısı']].map(([k, t]) => `<button data-f="${k}" class="${fil === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    ${canWrite() ? `<button class="btn primary" id="yeni">${ico('plus')}Yeni satış</button>` : ''}
    <button class="btn" onclick="window.print()">${ico('print')}Çap</button>`);
  $$('#fil button').forEach(b => b.onclick = () => location.hash = '#/musteriler?f=' + b.dataset.f);
  if ($('#yeni')) $('#yeni').onclick = () => yeniSatis();
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

async function pageMusteri(id) {
  id = +id;
  shell('musteriler', 'Müştəri', '', '');
  const [m, sales] = await Promise.all([
    q(sb.from('v_musteriler').select('*').eq('id', id).single()),
    q(sb.from('v_satislar').select('*').eq('musteri_id', id).order('tarix').order('id')),
  ]);
  const pays = sales.length ? await q(sb.from('satis_odenisleri').select('*').in('satis_id', sales.map(s => s.id)).order('tarix').order('id')) : [];
  const w = canWrite();
  $('.topbar').innerHTML = `<div><h2>${esc(m.ad)}</h2><div class="sub">${esc(m.unvan || '')}${m.telefon ? ' · ' + esc(m.telefon) : ''}</div></div>
    <div class="tools"><a class="btn" href="#/musteriler">← Siyahı</a>${w ? `<button class="btn" id="ed">Məlumatı düzəlt</button><button class="btn primary" id="yeni">${ico('plus')}Yeni satış</button>` : ''}
    <button class="btn" onclick="window.print()">${ico('print')}Çap / PDF</button></div>`;
  const satNo = Object.fromEntries(sales.map(s => [s.id, s.satis_no]));
  // hesab çıxarışı: satışlar (+) və ödənişlər (−) tarix sırası ilə
  const hereket = [];
  sales.forEach(s => { hereket.push({ t: s.tarix, k: 0, ad: `Satış ${s.satis_no}${s.mal ? ' — ' + s.mal : ''}`, borc: num(s.deyer) });
    if (num(s.ilkin) > 0) hereket.push({ t: s.tarix, k: 1, ad: `İlkin ödəniş (${s.satis_no})`, od: num(s.ilkin) }); });
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
    <div class="tbl-wrap"><table class="t"><thead><tr><th>№</th><th>Tarix</th><th>Mal</th><th class="n">Dəyəri</th><th class="n hide-m">İlkin</th><th class="n hide-m">Ödənilən</th><th class="n">Qalıq</th></tr></thead>
      <tbody>${sales.map(s => `<tr class="click" data-s="${s.id}"><td class="muted">${esc(s.satis_no)}</td><td>${fd(s.tarix)}</td><td>${esc(s.mal || '')}</td><td class="n">${fmt(s.deyer)}</td><td class="n hide-m">${fmt(s.ilkin)}</td><td class="n hide-m">${fmt(s.odenilen)}</td><td class="n">${num(s.qaliq) > 0 ? `<b>${fmt(s.qaliq)}</b>` : '<span class="badge b-green">Bağlanıb</span>'}</td></tr>`).join('')}</tbody></table></div>
    <h3 style="margin:22px 0 10px">Hesab çıxarışı</h3>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>Tarix</th><th>Əməliyyat</th><th class="n">Borc</th><th class="n">Ödənilib</th><th class="n">Qalıq</th></tr></thead>
      <tbody>${hereket.map(h => { bal += (h.borc || 0) - (h.od || 0); return `<tr><td>${fd(h.t)}</td><td>${esc(h.ad)}</td><td class="n">${h.borc ? fmt(h.borc) : ''}</td><td class="n">${h.od ? fmt(h.od) : ''}</td><td class="n"><b>${fmt(bal)}</b></td></tr>`; }).join('')}</tbody></table></div>`;
  $$('[data-s]').forEach(tr => tr.onclick = () => satisModal(+tr.dataset.s));
  if ($('#yeni')) $('#yeni').onclick = () => yeniSatis(id);
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

/* ---------------- başla ---------------- */
if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes('SIZIN-LAYIHE')) {
  app.innerHTML = '<div class="login-wrap"><div class="login-card"><h1>Quraşdırma lazımdır</h1><p>config.js faylına Supabase ünvanını və açarını yazın.</p></div></div>';
} else {
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { S.user = null; } });
  start();
}
})();
