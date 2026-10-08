const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const token = () => localStorage.getItem('token');
const me = () => localStorage.getItem('username');
const when = d => new Date(d + 'Z').toLocaleString();
let scope = 'all';

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
  $('#nav').innerHTML = token()
    ? `<a href="#/u/${esc(me())}">@${esc(me())}</a><a href="#" id="logout">Logout</a>`
    : `<a href="#/login">Login</a><a href="#/register">Register</a>`;
  const lo = $('#logout');
  if (lo) lo.onclick = e => { e.preventDefault(); localStorage.clear(); renderNav(); location.hash = '#/'; route(); };
}

function postHTML(p) {
  return `<div class="box" data-post="${p.id}">
    <a class="user" href="#/u/${esc(p.username)}">@${esc(p.username)}</a> <span class="meta">· ${when(p.created_at)}</span>
    <p>${esc(p.content)}</p>
    <div class="actions">
      <button class="ghost ${p.liked ? 'liked' : ''}" data-like="${p.id}">${p.liked ? '❤️' : '🤍'} ${p.likes}</button>
      <button class="ghost" data-cm="${p.id}">💬 ${p.comments}</button>
      ${p.username === me() ? `<button class="ghost" data-del="${p.id}">🗑️</button>` : ''}
    </div><div class="cmbox" id="cm-${p.id}"></div></div>`;
}

function wirePosts(refresh) {
  app.querySelectorAll('[data-like]').forEach(b => b.onclick = async () => {
    try { await api(`/api/posts/${b.dataset.like}/like`, 'POST'); refresh(); } catch { location.hash = '#/login'; }
  });
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (confirm('Delete this post?')) { await api('/api/posts/' + b.dataset.del, 'DELETE'); refresh(); }
  });
  app.querySelectorAll('[data-cm]').forEach(b => b.onclick = () => toggleComments(b.dataset.cm, refresh));
}

async function toggleComments(id, refresh) {
  const box = $('#cm-' + id);
  if (box.innerHTML) { box.innerHTML = ''; return; }
  const list = await api(`/api/posts/${id}/comments`);
  box.innerHTML = list.map(c => `<div class="cm"><a class="user" href="#/u/${esc(c.username)}">@${esc(c.username)}</a> ${esc(c.content)}</div>`).join('') +
    (token() ? `<input id="ci-${id}" placeholder="Write a comment..."><button id="cb-${id}">Reply</button>` : '<p class="meta">Log in to comment.</p>');
  const cb = $('#cb-' + id);
  if (cb) cb.onclick = async () => {
    try { await api(`/api/posts/${id}/comments`, 'POST', { content: $('#ci-' + id).value }); await refresh(); toggleComments(id, refresh); }
    catch (e) { alert(e.message); }
  };
}

async function feed() {
  const posts = await api('/api/posts?scope=' + scope);
  app.innerHTML = (token() ? `<div class="box"><textarea id="content" rows="3" maxlength="280" placeholder="What's on your mind?"></textarea>
      <p class="err" id="err"></p><button id="post">Post</button></div>
      <div class="tabs"><button class="${scope === 'all' ? '' : 'alt'}" id="t-all">Everyone</button>
      <button class="${scope === 'following' ? '' : 'alt'}" id="t-fol">Following</button></div>`
    : '<div class="box">👋 <a href="#/login">Log in</a> or <a href="#/register">register</a> to post, like and follow.</div>') +
    (posts.map(postHTML).join('') || '<p>No posts yet.</p>');
  if (token()) {
    $('#post').onclick = async () => {
      try { await api('/api/posts', 'POST', { content: $('#content').value }); feed(); } catch (e) { $('#err').textContent = e.message; }
    };
    $('#t-all').onclick = () => { scope = 'all'; feed(); };
    $('#t-fol').onclick = () => { scope = 'following'; feed(); };
  }
  wirePosts(feed);
}

async function profile(username) {
  const u = await api('/api/users/' + encodeURIComponent(username));
  const mine = u.username === me();
  app.innerHTML = `<div class="box"><h2>@${esc(u.username)}</h2>
    <p id="bio">${esc(u.bio) || '<span class="meta">No bio yet.</span>'}</p>
    <div class="stats"><span><b>${u.posts.length}</b> posts</span><span><b>${u.followers}</b> followers</span><span><b>${u.following}</b> following</span></div>
    ${mine ? '<input id="bioin" maxlength="160" placeholder="Update your bio"><button id="savebio">Save bio</button>'
      : token() ? `<button id="follow">${u.isFollowing ? 'Unfollow' : 'Follow'}</button>` : ''}</div>` + u.posts.map(postHTML).join('');
  if (mine) $('#savebio').onclick = async () => { await api('/api/me', 'PUT', { bio: $('#bioin').value }); profile(username); };
  else if (token()) $('#follow').onclick = async () => { await api(`/api/users/${username}/follow`, 'POST'); profile(username); };
  wirePosts(() => profile(username));
}

function authForm(mode) {
  const reg = mode === 'register';
  app.innerHTML = `<div class="box"><h2>${reg ? 'Create account' : 'Login'}</h2>
    <input id="un" placeholder="Username"><input id="pw" type="password" placeholder="Password (6+ chars)">
    <p class="err" id="err"></p><button id="go">${reg ? 'Register' : 'Login'}</button></div>`;
  $('#go').onclick = async () => {
    try {
      const r = await api('/api/' + mode, 'POST', { username: $('#un').value.trim(), password: $('#pw').value });
      localStorage.setItem('token', r.token); localStorage.setItem('username', r.username);
      renderNav(); location.hash = '#/';
    } catch (e) { $('#err').textContent = e.message; }
  };
}

async function route() {
  const [, page, name] = (location.hash || '#/').split('/');
  try {
    if (page === 'u') await profile(decodeURIComponent(name));
    else if (page === 'login') authForm('login');
    else if (page === 'register') authForm('register');
    else await feed();
  } catch (e) { app.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
window.onhashchange = route;
renderNav(); route();
