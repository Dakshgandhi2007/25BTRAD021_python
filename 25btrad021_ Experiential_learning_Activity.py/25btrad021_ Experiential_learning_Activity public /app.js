const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const ICON = { clothes: '👗', shoes: '👟', accessories: '👜', jewellery: '💍' };
const inr = n => '₹' + Number(n).toLocaleString('en-IN');
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
let user = null, filter = { category: '', mode: '', q: '' }, current = null, authMode = 'login', listMode = 'rent';
gsap.registerPlugin(ScrollTrigger, Draggable);

async function api(url, opts = {}) {
  const isF = opts.body instanceof FormData;
  const r = await fetch('/api' + url, { headers: isF ? {} : { 'Content-Type': 'application/json' }, ...opts, body: isF ? opts.body : opts.body && JSON.stringify(opts.body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}
function toast(m) {
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: m }); $('#toasts').append(t);
  gsap.fromTo(t, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: .4, ease: 'back.out(2)' });
  gsap.to(t, { opacity: 0, y: -10, delay: 2.6, duration: .4, onComplete: () => t.remove() });
}
function openM(id) {
  const m = $(id); m.hidden = false;
  gsap.fromTo(m, { opacity: 0 }, { opacity: 1, duration: .25 });
  gsap.fromTo(m.firstElementChild, { y: 50, scale: .9, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: .55, ease: 'back.out(1.6)' });
}
const closeM = m => gsap.to(m, { opacity: 0, duration: .2, onComplete: () => (m.hidden = true) });
$$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m || e.target.dataset.close !== undefined) closeM(m); }));
addEventListener('keydown', e => e.key === 'Escape' && $$('.modal:not([hidden])').forEach(closeM));

function confetti(x, y) {
  const cols = ['#3552F5', '#FFB48A', '#E8E2FB', '#FF9468'];
  for (let i = 0; i < 28; i++) {
    const d = Object.assign(document.createElement('div'), { className: 'dot' }); d.style.background = cols[i % 4]; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.append(d);
    gsap.to(d, { x: gsap.utils.random(-180, 180), y: gsap.utils.random(-220, 60), rotation: gsap.utils.random(-360, 360), opacity: 0, duration: gsap.utils.random(.8, 1.4), ease: 'power3.out', onComplete: () => d.remove() });
  }
}

/* ---------- nav & auth ---------- */
function renderNav() {
  $('#navLinks').innerHTML = user
    ? `<span>Hi, ${user.name.split(' ')[0]}</span><button class="btn ghost sm" id="nMine">My stuff</button><button class="btn peach sm" id="nList">List an item</button><button class="btn sm" id="nOut">Log out</button>`
    : `<button class="btn ghost sm" id="nLogin">Log in</button><button class="btn primary sm" id="nSign">Sign up</button>`;
  gsap.from('#navLinks > *', { y: -16, opacity: 0, stagger: .08, duration: .4 });
  $('#nLogin')?.addEventListener('click', () => showAuth('login'));
  $('#nSign')?.addEventListener('click', () => showAuth('signup'));
  $('#nList')?.addEventListener('click', openList);
  $('#nMine')?.addEventListener('click', openMine);
  $('#nOut')?.addEventListener('click', async () => { await api('/logout', { method: 'POST' }); user = null; renderNav(); toast('Logged out'); });
}
function showAuth(mode) {
  authMode = mode; $('#authF').classList.toggle('signup', mode === 'signup');
  $$('#authTabs button').forEach(b => b.classList.toggle('on', b.dataset.v === mode));
  $('#authB').textContent = mode === 'signup' ? 'Create account' : 'Log in'; $('#authE').textContent = ''; openM('#authM');
}
$$('#authTabs button').forEach(b => b.onclick = () => showAuth(b.dataset.v));
$('#authF').onsubmit = async e => {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
  try {
    user = (await api('/' + authMode, { method: 'POST', body: f })).user; closeM($('#authM')); renderNav(); e.target.reset();
    toast(authMode === 'signup' ? 'Welcome to Lendloom!' : 'Welcome back!');
  } catch (err) { $('#authE').textContent = err.message; gsap.fromTo('#authM .sheet', { x: -10 }, { x: 0, duration: .5, ease: 'elastic.out(1,.3)' }); }
};

/* ---------- listing ---------- */
const needLogin = () => { if (!user) { toast('Log in or sign up first'); showAuth('login'); return true; } };
function openList() { if (!needLogin()) { $('#listE').textContent = ''; openM('#listM'); } }
$('#heroList').onclick = openList;
$$('#listMode button').forEach(b => b.onclick = () => {
  listMode = b.dataset.v; $$('#listMode button').forEach(x => x.classList.toggle('on', x === b));
  $('#priceL').textContent = listMode === 'rent' ? 'Price per day (₹)' : 'Selling price (₹)';
});
$('#listF').onsubmit = async e => {
  e.preventDefault(); const f = new FormData(e.target); f.set('mode', listMode);
  const img = f.get('image'); if (img && img.size > 3 * 1024 * 1024) return ($('#listE').textContent = 'Image must be under 3 MB');
  try { await api('/items', { method: 'POST', body: f }); closeM($('#listM')); e.target.reset(); $('#prev').hidden = true; toast('Your item is live'); confetti(innerWidth / 2, innerHeight / 2); loadItems(); }
  catch (err) { $('#listE').textContent = err.message; }
};

$('#listF [name=image]').onchange = e => {
  const f = e.target.files[0], p = $('#prev'); if (!f) return (p.hidden = true);
  p.src = URL.createObjectURL(f); p.hidden = false; gsap.fromTo(p, { scale: .8, opacity: 0 }, { scale: 1, opacity: 1, duration: .4, ease: 'back.out(2)' });
};

/* ---------- browse ---------- */
async function loadItems() {
  const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v));
  const items = await api('/items?' + qs);
  $('#grid').innerHTML = items.length ? items.map(i => `<article class="card"><div class="tile ${i.category}"><em class="${i.mode}">${i.mode === 'rent' ? 'For rent' : 'For sale'}</em>${i.has_image ? `<img src="/api/items/${i.id}/image" alt="${esc(i.title)}" loading="lazy">` : `<span>${ICON[i.category]}</span>`}</div>
    <div class="info"><h3>${esc(i.title)}</h3><small>${esc(i.description)}</small><small>by ${esc(i.owner)}</small>
    <div class="buy"><b>${inr(i.price)}${i.mode === 'rent' ? '<small>/day</small>' : ''}</b><button class="btn primary sm magnetic" data-id="${i.id}">${i.mode === 'rent' ? 'Rent' : 'Buy'}</button></div></div></article>`).join('')
    : '<div class="empty">Nothing matches yet. Try another filter, or list the first one.</div>';
  window._items = items;
  gsap.from('.card', { y: 50, opacity: 0, scale: .94, stagger: .06, duration: .6, ease: 'power3.out' });
  $$('.card').forEach(tilt); $$('.magnetic').forEach(magnet);
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
$('#cats').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; $$('.chip').forEach(x => x.classList.toggle('on', x === b)); filter.category = b.dataset.v; loadItems(); };
$('#modes').onclick = e => { const b = e.target.closest('button'); if (!b) return; $$('#modes button').forEach(x => x.classList.toggle('on', x === b)); filter.mode = b.dataset.v; loadItems(); };
let st; $('#search').oninput = e => { clearTimeout(st); st = setTimeout(() => { filter.q = e.target.value.trim(); loadItems(); }, 300); };
$('#grid').onclick = e => {
  const b = e.target.closest('[data-id]'); if (!b || needLogin()) return;
  current = window._items.find(i => i.id == b.dataset.id); const rent = current.mode === 'rent';
  $('#oTitle').textContent = current.title; $('#oSub').textContent = (rent ? 'Rent for ' : 'Buy for ') + inr(current.price) + (rent ? ' per day' : '');
  $('#oDaysL').style.display = rent ? '' : 'none'; $('#oE').textContent = ''; $('#oGo').textContent = rent ? 'Confirm rental' : 'Confirm purchase'; calc(); openM('#orderM');
};
const calc = () => { const d = current.mode === 'rent' ? Math.min(Math.max(+$('#oDays').value || 1, 1), 30) : 1; const t = $('#oTotal'); const o = { v: +t.dataset.v || 0 }; gsap.to(o, { v: current.price * d, duration: .4, onUpdate: () => t.textContent = 'Total ' + inr(Math.round(o.v)) }); t.dataset.v = current.price * d; };
$('#oDays').oninput = calc;
$('#oGo').onclick = async e => {
  try { await api(`/items/${current.id}/order`, { method: 'POST', body: { days: $('#oDays').value } }); closeM($('#orderM')); toast('Done! The owner will be in touch'); confetti(e.clientX, e.clientY); loadItems(); }
  catch (err) { $('#oE').textContent = err.message; }
};
async function openMine() {
  const { items, orders } = await api('/mine');
  $('#mine').innerHTML = `<h4>My listings</h4>` + (items.map(i => `<div class="li"><div>${ICON[i.category]} ${esc(i.title)}<small>${i.mode} · ${inr(i.price)} · ${i.status}</small></div><button class="btn ghost sm" data-del="${i.id}">Remove</button></div>`).join('') || '<small>No listings yet.</small>')
    + `<h4>My orders</h4>` + (orders.map(o => `<div class="li"><div>${esc(o.title)}<small>${o.kind === 'rent' ? o.days + ' days' : 'purchase'} · ${inr(o.total)}</small></div></div>`).join('') || '<small>No orders yet.</small>');
  openM('#mineM');
}
$('#mine').onclick = async e => { const id = e.target.dataset.del; if (id) { await api('/items/' + id, { method: 'DELETE' }); openMine(); loadItems(); } };

/* ---------- interactions ---------- */
function tilt(el) {
  const rx = gsap.quickTo(el, 'rotationX', { duration: .4 }), ry = gsap.quickTo(el, 'rotationY', { duration: .4 });
  el.onmousemove = e => { const r = el.getBoundingClientRect(); ry(((e.clientX - r.left) / r.width - .5) * 14); rx(-((e.clientY - r.top) / r.height - .5) * 14); };
  el.onmouseleave = () => { rx(0); ry(0); };
}
function magnet(el) {
  el.onmousemove = e => { const r = el.getBoundingClientRect(); gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * .3, y: (e.clientY - r.top - r.height / 2) * .4, duration: .3 }); };
  el.onmouseleave = () => gsap.to(el, { x: 0, y: 0, duration: .6, ease: 'elastic.out(1,.4)' });
}
if (!reduce) {
  gsap.set('h1 span', { yPercent: 110 });
  gsap.timeline({ defaults: { ease: 'power4.out' } })
    .to('h1 span', { yPercent: 0, duration: 1, stagger: .15 })
    .from('.hero p, .cta, .stats', { y: 30, opacity: 0, stagger: .12, duration: .7 }, '-=.5')
    .from('.float', { scale: 0, rotation: -40, stagger: .1, duration: .9, ease: 'back.out(2)' }, '-=.9')
    .from('.blob', { scale: .3, opacity: 0, duration: 1.2 }, '-=1');
  $$('.float').forEach((f, i) => gsap.to(f, { y: '+=' + (14 + i * 3), rotation: i % 2 ? 6 : -6, duration: 2 + i * .4, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
  gsap.to('.blob', { rotation: 360, duration: 30, repeat: -1, ease: 'none' });
  gsap.to('.marquee div', { xPercent: -33.3, duration: 18, repeat: -1, ease: 'none' });
  gsap.from('.step', { scrollTrigger: { trigger: '.stepgrid', start: 'top 80%' }, y: 60, opacity: 0, stagger: .15, duration: .7 });
  gsap.from('h2', { scrollTrigger: { trigger: '#browse', start: 'top 80%' }, x: -40, opacity: 0, duration: .7 });
  addEventListener('mousemove', e => { gsap.to('.cursor', { x: e.clientX, y: e.clientY, duration: .25 }); gsap.to('.blob', { x: (e.clientX / innerWidth - .5) * 60, y: (e.clientY / innerHeight - .5) * 60, duration: 1 }); });
  addEventListener('click', e => { if (e.target.closest('.btn,.chip')) confetti(e.clientX, e.clientY); });
} else { $('.cursor').remove(); }
Draggable.create('.float', { bounds: '#play', inertia: false, onDragStart() { gsap.killTweensOf(this.target, 'y,rotation'); gsap.to(this.target, { scale: 1.15, duration: .2 }); }, onDragEnd() { gsap.to(this.target, { scale: 1, duration: .6, ease: 'elastic.out(1,.4)' }); } });
$$('.stats b').forEach(b => ScrollTrigger.create({ trigger: b, once: true, start: 'top 95%', onEnter: () => { const o = { v: 0 }; gsap.to(o, { v: +b.dataset.n, duration: 2, ease: 'power2.out', onUpdate: () => b.textContent = Math.round(o.v).toLocaleString() }); } }));
$$('.magnetic').forEach(magnet);

/* ---------- start ---------- */
api('/me').then(d => { user = d.user; renderNav(); });
loadItems();
