const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + Number(n).toFixed(2);
const getCart = () => JSON.parse(localStorage.getItem('cart') || '[]');
const setCart = c => { localStorage.setItem('cart', JSON.stringify(c)); renderNav(); };
const token = () => localStorage.getItem('token');

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1800); }

async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function renderNav() {
  const count = getCart().reduce((n, i) => n + i.qty, 0);
  $('#nav').innerHTML = `<a href="#/cart">🛒 Cart (${count})</a>` + (token()
    ? `<a href="#/orders">Orders</a><a href="#" id="logout">Logout (${esc(localStorage.getItem('name'))})</a>`
    : `<a href="#/login">Login</a><a href="#/register">Register</a>`);
  const lo = $('#logout');
  if (lo) lo.onclick = e => { e.preventDefault(); localStorage.removeItem('token'); localStorage.removeItem('name'); renderNav(); location.hash = '#/'; };
}

function addToCart(p, qty = 1) {
  const cart = getCart(); const it = cart.find(i => i.id === p.id);
  it ? it.qty += qty : cart.push({ id: p.id, name: p.name, price: p.price, emoji: p.emoji, qty });
  setCart(cart); toast(`${p.name} added to cart`);
}

async function home() {
  const products = await api('/api/products?q=' + encodeURIComponent($('#search').value));
  app.innerHTML = `<h2>Products</h2><div class="grid">${products.map(p => `
    <div class="card"><div class="emoji">${p.emoji}</div><h3>${esc(p.name)}</h3>
    <p class="price">${money(p.price)}</p>
    <a class="btn alt" href="#/product/${p.id}">Details</a>
    <button data-add="${p.id}">Add</button></div>`).join('') || '<p>No products found.</p>'}</div>`;
  app.querySelectorAll('[data-add]').forEach(b => b.onclick = () => addToCart(products.find(p => p.id == b.dataset.add)));
}

async function product(id) {
  const p = await api('/api/products/' + id);
  app.innerHTML = `<div class="box"><div class="big">${p.emoji}</div><h2>${esc(p.name)}</h2>
    <p>${esc(p.description)}</p><p class="price">${money(p.price)}</p>
    <p>${p.stock > 0 ? p.stock + ' in stock' : 'Out of stock'}</p>
    <input id="qty" type="number" min="1" max="${p.stock}" value="1" style="width:80px">
    <button id="add" ${p.stock < 1 ? 'disabled' : ''}>Add to cart</button>
    <a class="btn alt" href="#/">Back</a></div>`;
  $('#add').onclick = () => addToCart(p, Math.max(1, parseInt($('#qty').value) || 1));
}

function cart() {
  const c = getCart();
  if (!c.length) { app.innerHTML = '<div class="box"><h2>Your cart is empty</h2><a class="btn" href="#/">Shop now</a></div>'; return; }
  const total = c.reduce((s, i) => s + i.price * i.qty, 0);
  app.innerHTML = `<div class="box"><h2>Shopping Cart</h2>${c.map(i => `
    <div class="row"><span>${i.emoji} ${esc(i.name)}</span>
    <input type="number" min="1" value="${i.qty}" data-qty="${i.id}" style="width:70px;margin:0">
    <span>${money(i.price * i.qty)}</span><button class="danger" data-rm="${i.id}">✕</button></div>`).join('')}
    <h3>Total: ${money(total)}</h3>
    <label>Shipping address</label><textarea id="addr" rows="2"></textarea>
    <p class="err" id="err"></p><button id="checkout">Place order</button></div>`;
  app.querySelectorAll('[data-qty]').forEach(i => i.onchange = () => {
    const cc = getCart(); cc.find(x => x.id == i.dataset.qty).qty = Math.max(1, parseInt(i.value) || 1); setCart(cc); cart();
  });
  app.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { setCart(getCart().filter(x => x.id != b.dataset.rm)); cart(); });
  $('#checkout').onclick = async () => {
    if (!token()) { location.hash = '#/login'; return; }
    try {
      const r = await api('/api/orders', 'POST', { items: getCart().map(i => ({ id: i.id, qty: i.qty })), address: $('#addr').value.trim() });
      setCart([]);
      app.innerHTML = `<div class="box"><h2>🎉 Order #${r.orderId} placed!</h2><p>Total paid: ${money(r.total)}</p><a class="btn" href="#/orders">View orders</a></div>`;
    } catch (e) { $('#err').textContent = e.message; }
  };
}

function authForm(mode) {
  const reg = mode === 'register';
  app.innerHTML = `<div class="box" style="max-width:380px;margin:auto"><h2>${reg ? 'Create account' : 'Login'}</h2>
    ${reg ? '<input id="name" placeholder="Full name">' : ''}
    <input id="email" type="email" placeholder="Email"><input id="pw" type="password" placeholder="Password (6+ chars)">
    <p class="err" id="err"></p><button id="go">${reg ? 'Register' : 'Login'}</button></div>`;
  $('#go').onclick = async () => {
    try {
      const r = await api('/api/' + mode, 'POST', { name: reg ? $('#name').value : undefined, email: $('#email').value, password: $('#pw').value });
      localStorage.setItem('token', r.token); localStorage.setItem('name', r.name);
      renderNav(); location.hash = getCart().length ? '#/cart' : '#/';
    } catch (e) { $('#err').textContent = e.message; }
  };
}

async function orders() {
  if (!token()) { location.hash = '#/login'; return; }
  const list = await api('/api/orders');
  app.innerHTML = `<h2>My Orders</h2>` + (list.map(o => `<div class="box" style="margin-bottom:12px">
    <b>Order #${o.id}</b> — ${new Date(o.created_at + 'Z').toLocaleString()}<br>
    ${o.items.map(i => `${i.emoji} ${esc(i.name)} × ${i.qty}`).join('<br>')}
    <p>Ship to: ${esc(o.address)}</p><b class="price">${money(o.total)}</b></div>`).join('') || '<p>No orders yet.</p>');
}

async function route() {
  const [, page, id] = (location.hash || '#/').split('/');
  try {
    if (page === 'product') await product(id);
    else if (page === 'cart') cart();
    else if (page === 'login') authForm('login');
    else if (page === 'register') authForm('register');
    else if (page === 'orders') await orders();
    else await home();
  } catch (e) { app.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
$('#search').oninput = () => { if (location.hash && location.hash !== '#/') location.hash = '#/'; else route(); };
window.onhashchange = route;
renderNav(); route();
