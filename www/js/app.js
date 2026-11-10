// Friends app: state, screens and actions (built on Nest's chat, calls and groups)
import { $, $$, esc, haptic, LS, linkify, MONTHS, DAYS, iso, dayKey, hhmm, fmtDur, ago, listTime, dayLabel, daysTo, nextBirthday,
  COLORS, EMOJIS, REACTIONS, first, nameOf, userColor, chatId, avatar, gtile, prepImage, chatImage, blobToDataURL, recorderMime, icon,
  EMOJI_SETS, isJumbo, prepVideo, dataURLToObjectURL, questionFor, VIDEO_MAX_SEC, mediaHelp, inAppBrowser, isNative } from './util.js';
import { FIREBASE_CONFIG, PUSH_URL, VAPID_KEY } from './config.js';
import { LiveBackend } from './backend-live.js';
import { LocalBackend } from './backend-local.js';
import { CallManager } from './calls.js';
import { GroupCall, watchRoom, GROUP_CALL_MAX } from './groupcalls.js';

const root = document.documentElement; root.lang = 'he'; root.dir = 'rtl';
const standalone = () => isNative() || matchMedia('(display-mode: standalone), (display-mode: minimal-ui)').matches || navigator.standalone === true;
if (standalone()) root.classList.add('native');
const app = $('#app'), navEl = $('#nav'), sheetEl = $('#sheet'), screenEl = $('#screen'), fileEl = $('#file'), phoneEl = $('.phone');
const onSite = /\.github\.io$/.test(location.hostname);
const params = new URLSearchParams(location.search);

let be = null, calls = null;
const S = {
  booting: true, user: null, groups: [], chats: [], members: {},
  screen: 'root', tab: 'home', gid: null, gtab: 'chat', ch: 'main', cid: null, uid: null, watch: null,
  posts: [], stories: [], story: null, fcount: {}, flist: {}, suggest: null,
  data: { messages: [], events: [], images: [], homework: [], exams: [], timetable: {} }, dm: [],
  drafts: {}, img: null, vid: null, hub: null, day: { answers: {} }, poll: null, reply: null, rec: null, viewer: null, comments: null, incoming: null,
  anim: '', busy: false, joinCode: params.get('join') || ''
};
const full = {}, loadedFull = new Set();
const unsub = { me: null, groups: null, chats: null, posts: null, stories: null, incoming: null, group: [], dm: null, comments: null };
const seen = LS.get('friends.seen') || {}, seenChat = LS.get('friends.seenChat') || {};
const me = () => S.user && S.user.id;
const group = () => S.groups.find(g => g.id === S.gid);
const chat = () => S.chats.find(c => c.id === S.cid);
const otherOf = c => c && c.members.find(m => m !== me());
const isOwner = g => g && S.user && g.ownerId === S.user.id;
const scope = () => S.screen === 'chat' ? { t: 'c', id: S.cid } : { t: 'g', id: S.gid, ch: S.ch };
const curMsgs = () => S.screen === 'chat' ? S.dm : S.data.messages;
const isFrame = () => getComputedStyle(screenEl).overflowY === 'auto';
const scrollY = () => isFrame() ? screenEl.scrollTop : window.scrollY;
const scrollTo = y => { if (isFrame()) screenEl.scrollTop = y; else window.scrollTo(0, y); };
const scrollMax = () => isFrame() ? screenEl.scrollHeight - screenEl.clientHeight : document.documentElement.scrollHeight - innerHeight;
const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
const chatVisible = () => S.screen === 'chat' || (S.screen === 'group' && S.gtab === 'chat');
const local = () => be && be.mode === 'local';

/* ---------- HUD & sheets ---------- */
let hudT;
function hud(msg, warn) {
  const h = $('#hud'); h.className = 'hud' + (warn ? ' warn' : '');
  h.innerHTML = `<span class="hud-ic">${icon(warn ? 'warn' : 'check', 18, 2.2)}</span><span>${esc(msg)}</span>`;
  requestAnimationFrame(() => h.classList.add('show'));
  clearTimeout(hudT); hudT = setTimeout(() => h.classList.remove('show'), 2600);
}
function fail(e) {
  console.error(e);
  const c = (e && e.code) || '';
  hud(c.includes('permission') ? 'אין הרשאה לפעולה הזו' : c.includes('unavailable') || !navigator.onLine ? 'אין חיבור. נסו שוב בעוד רגע' : 'משהו השתבש. נסו שוב', true);
}
function confirmSheet(o) {
  return new Promise(res => {
    sheetEl.innerHTML = `<div class="scrim"></div><div class="asheet" role="dialog" aria-modal="true"><div class="ag glass">${o.title || o.msg ? `<div class="am">${o.title ? `<b>${esc(o.title)}</b>` : ''}${esc(o.msg || '')}</div>` : ''}${o.top || ''}${o.actions.map((a, i) => `<button type="button" class="aa${a.destructive ? ' destructive' : ''}" data-r="${i}">${esc(a.label)}</button>`).join('')}</div><button type="button" class="aa cancel glass" data-r="-1">ביטול</button></div>`;
    const sc = sheetEl.querySelector('.scrim'), as = sheetEl.querySelector('.asheet');
    requestAnimationFrame(() => { sc.classList.add('show'); as.classList.add('show'); });
    const close = v => { sc.classList.remove('show'); as.classList.remove('show'); setTimeout(() => { if (sheetEl.contains(as)) sheetEl.innerHTML = ''; }, 320); res(v); };
    sc.onclick = () => close(-1);
    as.querySelectorAll('[data-r]').forEach(b => b.onclick = () => close(+b.dataset.r));
    as.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => close(b.dataset.pick));
    as.querySelector('.cancel').focus({ preventScroll: true });
  });
}
let closeForm = null;
function formSheet(o) {
  sheetEl.innerHTML = `<div class="scrim"></div><div class="fsheet${o.tall ? ' tall' : ''}" role="dialog" aria-modal="true" aria-label="${esc(o.title)}"><div class="grab"></div><div class="fh"><button type="button" class="nb-btn" data-f="cancel" style="justify-self:start">ביטול</button><b>${esc(o.title)}</b>${o.action ? `<button type="button" class="nb-btn" data-f="ok" style="font-weight:600">${esc(o.action)}</button>` : '<span></span>'}</div><div class="fb">${o.body}</div>${o.footer || ''}</div>`;
  const sc = sheetEl.querySelector('.scrim'), fs = sheetEl.querySelector('.fsheet');
  requestAnimationFrame(() => { sc.classList.add('show'); fs.classList.add('show'); });
  const close = () => { closeForm = null; sc.classList.remove('show'); fs.classList.remove('show'); setTimeout(() => { if (sheetEl.contains(fs)) sheetEl.innerHTML = ''; }, 340); o.onClose && o.onClose(); };
  closeForm = close; sc.onclick = close; fs.querySelector('[data-f=cancel]').onclick = close;
  const ok = fs.querySelector('[data-f=ok]');
  if (ok) ok.onclick = async () => { ok.disabled = true; try { if (await o.onOk(fs) !== false) close(); } catch (e) { fail(e); } finally { ok.disabled = false; } };
  const f = fs.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 350);
  return fs;
}
async function copyText(t) { try { await navigator.clipboard.writeText(t); haptic(); hud('הועתק'); } catch (e) { hud('לא הצלחנו להעתיק. סמנו והעתיקו ידנית', true); } }

/* ---------- notifications ---------- */
let swReg = null, prevAct = {};
if (onSite && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(r => { swReg = r; }).catch(() => {});
  // a new version took over: reload when nothing is in progress
  let hadController = !!navigator.serviceWorker.controller, updatePending = false;
  const applyUpdate = () => { if (!updatePending) return; if ((calls && calls.state) || S.incoming || S.rec || S.story || closeForm || typing() || S.screen === 'watch') { setTimeout(applyUpdate, 5000); return; } location.reload(); };
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadController) { hadController = true; return; } updatePending = true; applyUpdate(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && swReg) swReg.update().catch(() => {}); });
  setInterval(() => { if (swReg) swReg.update().catch(() => {}); }, 30 * 60 * 1000);
}
function notify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !swReg) return;
  swReg.showNotification(title, { body, tag, renotify: true, icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', lang: 'he', dir: 'rtl' }).catch(() => {});
}
// New activity from someone else: a system notification when the app is in the background, a banner when elsewhere in the app
function activity(key, title, body, lastAt, lastBy, viewing) {
  const prev = prevAct[key]; prevAct[key] = lastAt || 0;
  if (prev === undefined || !lastAt || lastAt <= prev || !lastBy || lastBy === me()) return;
  if (isMuted(key.slice(2)) || iBlocked(lastBy)) return;
  if (document.hidden) notify(title, body, key);
  else if (!viewing) hud(`${title}: ${body}`.slice(0, 70));
}
/* ---------- navigation ---------- */
function go(screen, o, push) {
  o = o || {};
  const from = S.screen;
  S.anim = screen !== 'root' && from === 'root' ? 'push' : screen === 'root' && from !== 'root' ? 'pop' : screen === 'groupInfo' ? 'push' : from === 'groupInfo' ? 'pop' : 'fade';
  if (screen === 'root') { closeGroup(); closeDM(); if (o.tab) S.tab = o.tab; }
  if (screen === 'group' || screen === 'groupInfo') { closeDM(); if (o.gid && o.gid !== S.gid) openGroup(o.gid); if (o.gtab) S.gtab = o.gtab; S.hub = o.hub || null; }
  if (screen === 'chat') { closeGroup(); if (o.cid && o.cid !== S.cid) openDM(o.cid); }
  if (screen === 'group' && o.ch && o.ch !== S.ch) { S.ch = o.ch; watchChannel(); }
  if (screen === 'user') { closeGroup(); closeDM(); if (o.uid) S.uid = o.uid; }
  if (screen === 'watch') { closeGroup(); closeDM(); if (o.pid) S.watch = o.pid; }
  if (screen === 'events' || screen === 'activity') { closeGroup(); closeDM(); }
  if (screen === 'event') { closeGroup(); closeDM(); if (o.eid && o.eid !== S.eid) openEvent(o.eid); }
  if (screen !== 'event' && S.eid) closeEvent();
  S.screen = screen; S.reply = null;
  if (push !== false) { try { history.pushState({ screen, gid: S.gid, cid: S.cid, tab: S.tab, gtab: S.gtab, ch: S.ch, uid: S.uid, pid: S.watch, eid: S.eid }, ''); } catch (e) {} }
  render(true);
}
window.addEventListener('popstate', e => {
  if (S.story) { closeStory(); return; }
  if ($('#shorts')) { closeShorts(); return; }
  if (closeForm) { closeForm(); return; }
  if (S.viewer) { S.viewer = null; renderViewer(); return; }
  const st = e.state || { screen: 'root' };
  go(st.screen || 'root', st, false);
});
function back() { if (history.state && history.state.screen && history.state.screen !== 'root') history.back(); else go('root'); }
function onScroll() { const nb = $('.navbar'); if (nb) nb.classList.toggle('scrolled', scrollY() > (nb.classList.contains('inline') ? 2 : 44)); }
screenEl.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('scroll', onScroll, { passive: true });

/* ---------- subscriptions ---------- */
async function loadUsers(ids, fresh) {
  const need = [...new Set(ids)].filter(i => i && (fresh || !S.members[i]));
  if (need.length) Object.assign(S.members, await be.users(need, fresh));
}
const allMemberIds = () => [...new Set(S.groups.flatMap(g => g.members))];
function watchAll() {
  unsub.me = be.watchMe(u => { S.user = Object.assign({}, S.user, u); S.members[u.id] = Object.assign({}, S.members[u.id], u); softRender(); });
  unsub.groups = be.watchGroups(async list => {
    S.groups = list.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    list.forEach(g => activity('g:' + g.id, `${g.emoji} ${g.name}`, g.lastMessage || '', g.lastAt, g.lastBy, S.gid === g.id));
    const g = group();
    if ((S.screen === 'group' || S.screen === 'groupInfo') && !g && S.gid) { hud('כבר אין לך גישה לקבוצה הזו', true); go('root'); return; }
    if (g) markGroupSeen();
    await loadUsers(allMemberIds());
    softRender();
  }, fail);
  unsub.chats = be.watchChats(async list => {
    await loadUsers(list.map(otherOf));
    S.chats = list.filter(c => (c.lastBy || c.id === S.cid) && !iBlocked(otherOf(c))).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    list.forEach(c => activity('c:' + c.id, nameOf(S.members[otherOf(c)]), c.lastMessage || '', c.lastAt, c.lastBy, S.cid === c.id && S.screen === 'chat'));
    if (S.screen === 'chat') maybeRead();
    softRender();
  }, fail);
  unsub.posts = be.watchPosts(async list => { S.posts = list; await loadUsers(list.map(p => p.authorId)); softRender(); }, fail);
  watchNotifs();
  unsub.events = be.watchEventPages(async list => { S.events = list; await loadUsers(list.map(p => p.ownerId)); softRender(); }, e => console.warn('events', e));
  unsub.stories = be.watchStories(async list => { S.stories = list; await loadUsers(list.map(s => s.authorId)); if (!S.story) softRender(); }, e => console.warn('stories', e));
  if (be.rtc) { calls = CallManager(be.rtc, callUI); unsub.incoming = calls.watchIncoming(); }
  loadUsers(following());
  refreshMediaPerm(); refreshPerms();
}
function stopAll() {
  closeGroup(); closeDM();
  closeEvent();
  closeShorts(true); S.notifs = [];
  ['me', 'groups', 'chats', 'incoming', 'posts', 'stories', 'events', 'notifs'].forEach(k => { if (unsub[k]) { try { unsub[k](); } catch (e) {} unsub[k] = null; } });
  S.groups = []; S.chats = []; S.posts = []; S.stories = []; S.suggest = null; S.fcount = {}; S.flist = {}; prevAct = {};
}
const emptyData = () => ({ messages: [], events: [], images: [], homework: [], exams: [], files: [], timetable: {} });
function openGroup(gid) {
  closeGroup(); S.gid = gid; S.ch = 'main'; S.gtab = 'chat'; S.data = emptyData();
  const g = group();
  const watchKind = k => be.watch(gid, k, list => { S.data[k] = list; softRender(); }, fail);
  ['events', 'images'].forEach(k => unsub.group.push(watchKind(k)));
  S.room = null;
  if (be.rtc) unsub.group.push(watchRoom(be.rtc, gid, r => { if (S.gid !== gid) return; S.room = r; softRender(); }));
  if (gtype(g) === 'school') { ['homework', 'exams', 'files'].forEach(k => unsub.group.push(watchKind(k))); unsub.group.push(be.watchTimetable(gid, d => { S.data.timetable = d; softRender(); }, fail)); }
  watchChannel();
  markGroupSeen();
  if (g) loadUsers(g.members.concat(g.ownerId), true).then(() => softRender());
}
let unsubCh = null;
function watchChannel() {
  if (unsubCh) { try { unsubCh(); } catch (e) {} }
  S.data.messages = [];
  const gid = S.gid, ch = S.ch;
  unsubCh = be.watchMessages({ t: 'g', id: gid, ch }, async list => {
    if (S.gid !== gid || S.ch !== ch) return;
    S.data.messages = list; sweepExpired(list, { t: 'g', id: gid, ch }); await loadUsers(list.map(m => m.authorId));
    if (S.gtab === 'chat' && !document.hidden) markGroupChatSeen();
    softRender(true);
  }, fail);
}
function closeGroup() { unsub.group.forEach(u => { try { u(); } catch (e) {} }); unsub.group = []; if (unsubCh) { try { unsubCh(); } catch (e) {} unsubCh = null; } S.gid = null; S.data = emptyData(); }

function openDM(cid) {
  closeDM(); S.cid = cid; S.dm = [];
  unsub.dm = be.watchMessages({ t: 'c', id: cid }, async list => { S.dm = list; sweepExpired(list, { t: 'c', id: cid }); await loadUsers(list.map(m => m.authorId)); maybeRead(); softRender(true); }, fail);
}
function closeDM() { if (unsub.dm) { try { unsub.dm(); } catch (e) {} } unsub.dm = null; S.cid = null; S.dm = []; }
function markGroupSeen() { const g = group(); if (g) { seen[g.id] = Math.max(g.lastAt || 0, Date.now()); LS.set('friends.seen', seen); } }
function markGroupChatSeen() {
  const m = S.data.messages[0]; if (!m || !S.gid) return;
  seenChat[S.gid] = m.createdAt; LS.set('friends.seenChat', seenChat);
  // "read by" for the others: stamp my time when there is something new from someone else (main chat only)
  const g = group(), mine = ((g && g.reads) || {})[me()] || 0;
  if (g && S.ch === 'main' && m.authorId !== me() && m.createdAt > mine && !document.hidden && be.markGroupRead) be.markGroupRead(g.id);
}
let readT = 0;
function maybeRead() {
  const c = chat(); if (!c || document.hidden || S.screen !== 'chat') return;
  const mine = (c.reads || {})[me()] || 0;
  if (c.lastAt > mine && Date.now() - readT > 1500) { readT = Date.now(); be.markRead(c.id); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { maybeRead(); if (S.gtab === 'chat' && S.screen === 'group') markGroupChatSeen(); softRender(); } });
const groupUnread = g => g.lastAt > (seen[g.id] || 0) && g.lastBy && g.lastBy !== me();
const chatUnread = c => c.lastAt > ((c.reads || {})[me()] || 0) && c.lastBy && c.lastBy !== me();
const groupChatUnread = () => { const last = seenChat[S.gid] || 0; return S.data.messages.filter(m => m.createdAt > last && m.authorId !== me()).length; };

/* ---------- render ---------- */
function softRender(chatChanged) {
  if (S.booting) return;
  const v = S.screen === 'watch' && $('.yt-player video'); if (v && !v.paused) return; // never interrupt a video
  render(false, chatChanged);
}
function render(navigated, chatChanged) {
  if (S.viewer) renderViewer();
  const a = document.activeElement, fid = a && a.id, sel = a && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
  const y = scrollY(), nearBottom = scrollMax() - y < 140;
  const g = group();
  root.style.setProperty('--accent', `var(--g-${((S.screen === 'group' || S.screen === 'groupInfo') && g && g.color) || 'blue'})`);
  let html, bare = false, tabs = '';
  if (S.booting) { bare = true; html = `<div class="loading"><div class="spinner" aria-label="טוען"></div></div>`; }
  else if (params.has('native_login') && !isNative()) { bare = true; html = viewNativeLogin(); }
  else if (!S.user) { bare = true; html = viewLogin(); }
  else if (!S.user.username) { bare = true; html = viewUsername(); }
  else if (S.screen === 'group' && g) { html = viewGroup(g); tabs = groupTabs(); }
  else if (S.screen === 'groupInfo' && g) { html = viewGroupInfo(g); }
  else if (S.screen === 'chat' && S.cid) { html = viewDM(); }
  else if (S.screen === 'user' && S.uid) { html = viewProfilePage(S.uid, false); }
  else if (S.screen === 'watch' && S.watch) { html = viewWatch(); }
  else if (S.screen === 'events') { html = viewEventList(); }
  else if (S.screen === 'activity') { html = viewActivity(); }
  else if (S.screen === 'event' && S.eid) { html = viewEventPage(); }
  else { S.screen = 'root'; html = S.tab === 'chats' ? viewChats() : S.tab === 'profile' ? viewProfilePage(me(), true) : S.tab === 'videos' ? viewVideos() : viewHome(); tabs = rootTabs(); }
  const solo = S.screen === 'chat' || S.screen === 'groupInfo' || S.screen === 'user' || S.screen === 'watch' || S.screen === 'events' || S.screen === 'event' || S.screen === 'activity';
  app.className = (bare ? 'bare ' : '') + (chatVisible() ? (S.screen === 'chat' ? 'chat-pad solo ' : 'chat-pad ') : solo ? 'solo ' : '') + (navigated && S.anim ? 'anim-' + S.anim : '');
  S.anim = '';
  const keep = {}; app.querySelectorAll('[data-keep]').forEach(el => { keep[el.dataset.keep] = { el, playing: el.tagName === 'VIDEO' && !el.paused }; });
  app.innerHTML = (S.booting ? '' : openInBrowserBanner()) + html;
  app.querySelectorAll('[data-keep]').forEach(el => { const k = keep[el.dataset.keep]; if (k) { el.replaceWith(k.el); if (k.playing) k.el.play().catch(() => {}); } });
  navEl.innerHTML = tabs;
  $$('[data-draft]').forEach(el => { el.value = S.drafts[el.dataset.draft] || ''; grow(el); });
  updateSend(); updateTyping(); syncAudioUI();
  if (fid && !navigated) { const n = document.getElementById(fid); if (n) { n.focus({ preventScroll: true }); if (sel && n.setSelectionRange) try { n.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
  if (navigated) { scrollTo(0); if (chatVisible()) requestAnimationFrame(() => scrollTo(scrollMax())); }
  else if (chatVisible() && (nearBottom || (chatChanged && isMineLatest()))) requestAnimationFrame(() => scrollTo(scrollMax()));
  else scrollTo(y);
  onScroll(); loadFullImages(); loadPostImages();
}
const isMineLatest = () => { const m = curMsgs()[0]; return m && m.authorId === me(); };
function grow(el) { if (el.tagName !== 'TEXTAREA') return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, parseInt(getComputedStyle(el).maxHeight) || 200) + 'px'; }
function draftKey() { return S.screen === 'chat' ? 'dm:' + S.cid : 'chat:' + S.gid + ':' + S.ch; }
function updateSend() {
  const b = $('#chat-send');
  if (b) {
    const has = !!(S.drafts[draftKey()] || '').trim();
    b.type = has ? 'submit' : 'button';
    if (has) { b.removeAttribute('data-a'); b.setAttribute('aria-label', 'שליחה'); b.innerHTML = icon('send', 18); b.disabled = false; }
    else { b.dataset.a = 'rec-start'; b.setAttribute('aria-label', 'הקלטת הודעה קולית'); b.innerHTML = icon('mic', 19, 2); b.disabled = recorderMime() === null; }
  }
  const p = $('#post-btn'); if (p) p.disabled = S.busy || !((S.drafts.post || '').trim() || S.img || S.vid);
}

// Inside the Google app (or WhatsApp/Instagram) the page runs in a built-in browser that can't install,
// sign in with Google or use the microphone. These links hand the same address to the real browser.
function chromeLink() {
  const host = location.host, path = location.pathname + location.search;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'googlechromes://' + host + path
    : 'intent://' + host + path + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(location.href) + ';end';
}
function openInBrowserBanner() {
  if (!inAppBrowser()) return '';
  const host = location.host, path = location.pathname + location.search;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const chrome = chromeLink();
  return '<div class="openin" role="alert"><div class="openin-t"><b>פתחו את Friends ב-Chrome</b><span>כאן, בתוך ' + (/GSA\//.test(navigator.userAgent) ? 'אפליקציית Google' : 'האפליקציה הזו') + ', אי אפשר להתקין, להיכנס עם Google או להתקשר.</span></div>' +
    '<div class="openin-b"><a class="btn filled sm" href="' + esc(chrome) + '">פתיחה ב-Chrome</a>' +
    (ios ? '<a class="btn tinted sm" href="' + esc('x-safari-https://' + host + path) + '">פתיחה ב-Safari</a>' : '') +
    '<button class="btn tinted sm" data-a="copy-link">העתקת הקישור</button></div></div>';
}
function bar(o) {
  return `<header class="navbar${o.inline ? ' inline' : ''}"><div class="nb-in">
    <div class="nb-lead">${o.back ? `<button class="nb-btn" data-a="back" aria-label="חזרה ל${esc(o.back)}">${icon('back', 20)}<span class="nb-back-t">${esc(o.back)}</span></button>` : ''}</div>
    <div class="nb-title">${o.titleHtml || esc(o.title)}</div>
    <div class="nb-trail">${o.trail || ''}</div></div></header>
  ${o.inline ? '' : `<div class="large"><div>${o.eyebrow ? `<div class="eyebrow">${o.eyebrow}</div>` : ''}<h1>${esc(o.title)}</h1></div>${o.side || ''}</div>`}`;
}
function tabbar(items, cur, act) {
  return `<nav class="tabbar" aria-label="ניווט"><div class="tb-in glass" style="grid-template-columns:repeat(${items.length},1fr)">${items.map(([k, l, ic, badge]) => `<button class="tab${cur === k ? ' on' : ''}" data-a="${act}" data-v="${k}"${cur === k ? ' aria-current="page"' : ''}>${icon(cur === k ? ic + 'F' : ic, 24)}<span>${l}</span>${badge ? `<span class="dot">${badge > 9 ? '9+' : badge}</span>` : ''}</button>`).join('')}</div></nav>`;
}
/* ---------- root: profile ---------- */
let installEvt = null;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// In-app browsers (the Google app, WhatsApp, Instagram…) cannot install web apps (inAppBrowser, from util)
const canOfferInstall = () => onSite && !standalone();
function installHelp() {
  const link = location.origin + location.pathname;
  if (inAppBrowser()) return { title: 'צריך לפתוח בדפדפן', msg: 'האפליקציה פתוחה עכשיו בתוך אפליקציה אחרת (גוגל, וואטסאפ או אינסטגרם), ומשם אי אפשר להתקין. פתחו את התפריט (⋮ או ···) ובחרו "פתיחה ב-Chrome"' + (isIOS() ? ' או "פתיחה ב-Safari"' : '') + '. אפשר גם להעתיק את הקישור ולהדביק אותו בדפדפן.', link };
  if (isIOS()) return { title: 'הוספה למסך הבית', msg: 'הקישו על כפתור השיתוף (ריבוע עם חץ למעלה; ב-Chrome הוא בשורת הכתובת), גללו ובחרו "הוספה למסך הבית", ואז "הוסף".', link };
  return { title: 'התקנת Friends', msg: 'ב-Chrome: הקישו על ⋮ בפינה העליונה ובחרו "התקנת אפליקציה" או "הוספה למסך הבית". אם האפשרות לא מופיעה, רעננו את הדף ונסו שוב בעוד רגע.', link };
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (!S.booting && !typing()) softRender(); });
window.addEventListener('appinstalled', () => { installEvt = null; hud('Friends נוספה למסך הבית'); softRender(); });
// Camera/microphone permission as the browser reports it (not every browser can tell)
async function refreshMediaPerm() {
  if (!navigator.permissions || !navigator.permissions.query) { S.mediaPerm = { mic: 'prompt', cam: 'prompt', unknown: true }; return; }
  const q = async n => { try { const p = await navigator.permissions.query({ name: n }); p.onchange = () => refreshMediaPerm(); return p.state; } catch (e) { return 'prompt'; } };
  const [mic, cam] = await Promise.all([q('microphone'), q('camera')]);
  const changed = !S.mediaPerm || S.mediaPerm.mic !== mic || S.mediaPerm.cam !== cam;
  S.mediaPerm = { mic, cam };
  if (changed && S.screen === 'root' && S.tab === 'profile' && !typing()) softRender();
}
function mediaPermRow() {
  const p = S.mediaPerm || {};
  if (p.mic === 'granted' && p.cam === 'granted') return '<span class="val" style="color:var(--ok)">מאושר</span>';
  if (p.mic === 'granted') return '<span class="val" style="color:var(--ok)">מיקרופון ✓</span><button class="btn tinted sm" data-a="media-check">מצלמה</button>';
  // the browser's stored answer can be stale, so always offer a real retry
  if (p.mic === 'denied') return '<button class="btn tinted sm" data-a="media-check">ניסיון שוב</button><button class="btn tinted sm" data-a="media-fix">איך מתקנים</button>';
  return '<button class="btn tinted sm" data-a="media-check">אישור</button>';
}
/* ---------- chat (group chat and private chats share this) ---------- */
function viewGroupChat(g) { return roomBanner(g) + chatBody(S.data.messages, 'g', g) + chatBar(false); }
function viewDM() {
  const c = chat(), oid = otherOf(c) || (S.cid || '').split('_').find(x => x !== me()), o = S.members[oid] || { id: oid };
  const head = bar({ inline: true, back: 'שיחות', titleHtml: `<button class="nb-person" data-a="chat-info" data-v="${esc(oid)}" aria-label="פרטי הצ׳אט">${avatar(o, 30)}<span class="ell">${esc(nameOf(o))}</span>${isMuted(S.cid) ? `<span class="mute-ic">${icon('bellOff', 13)}</span>` : ''}</button>`,
    trail: `<button class="nb-btn" data-a="call" data-v="audio" aria-label="שיחה קולית">${icon('phone', 22)}</button><button class="nb-btn" data-a="call" data-v="video" aria-label="שיחת וידאו">${icon('video', 24)}</button>` });
  return head + chatBody(S.dm, 'c', c) + chatBar(true);
}
function chatBody(desc, kind, ctx) {
  const msgs = desc.slice().reverse(), u = S.user;
  const otherRead = kind === 'c' && ctx ? ((ctx.reads || {})[otherOf(ctx)] || 0) : 0;
  let html = '', lastDay = '', lastA = '';
  const lastMine = msgs.filter(m => m.authorId === u.id && m.kind !== 'call').pop();
  const now = Date.now();
  if (ctx && ctx.vanish) html += `<div class="sys"><span class="sys-pill">${icon('timer', 15)} הודעות חדשות נעלמות אחרי ${vanishLabel(ctx.vanish)}</span></div>`;
  const lastMineG = kind === 'g' ? msgs.filter(m => m.authorId === u.id && !m.kind).pop() : null;
  msgs.forEach(m => {
    if (m.authorId !== u.id && iBlocked(m.authorId)) return; // someone you blocked, in a shared group
    if (m.expireAt && m.expireAt < now) return; // a disappearing message whose time is up
    const d = dayKey(m.createdAt);
    if (d !== lastDay) { html += `<div class="day-sep"><span>${esc(dayLabel(m.createdAt))}</span></div>`; lastDay = d; lastA = ''; }
    if (m.kind === 'call') {
      const c = m.call || {}, missed = c.status !== 'done', who = m.authorId === u.id ? 'יוצאת' : 'נכנסת';
      html += `<div class="sys"><button class="sys-pill${missed ? ' miss' : ''}" data-a="call" data-v="${esc(c.kind || 'audio')}">${icon(c.kind === 'video' ? 'video' : 'phone', 16)} ${missed ? (c.status === 'declined' ? 'שיחה שנדחתה' : 'שיחה שלא נענתה') : `שיחה ${c.kind === 'video' ? 'בווידאו' : 'קולית'} ${who} · ${fmtDur(c.dur)}`} · ${hhmm(m.createdAt)}</button></div>`;
      lastA = ''; return;
    }
    if (m.kind === 'sos') {
      const nm = esc(first(nameOf(S.members[m.authorId])));
      html += m.loc ? `<div class="sys"><a class="sys-pill sos" href="https://maps.google.com/?q=${+m.loc.lat},${+m.loc.lng}" target="_blank" rel="noopener">📍 ${m.authorId === u.id ? 'המיקום שלך' : 'המיקום של ' + nm} · פתיחה במפות · ${hhmm(m.createdAt)}</a></div>`
        : `<div class="sys"><span class="sys-pill sos">🆘 ${m.authorId === u.id ? 'שלחת' : nm + ' שלח/ה'} קריאת SOS · ${hhmm(m.createdAt)}</span>${m.authorId !== u.id && !local() ? `<button class="btn filled sm sos-btn" data-a="sos-person" data-v="${esc(m.authorId)}">${icon('phoneF', 16)} התקשרות</button>` : ''}</div>`;
      lastA = ''; return;
    }
    if (m.kind === 'sosok' || m.kind === 'escort') {
      const nm = m.authorId === u.id ? 'את/ה' : esc(first(nameOf(S.members[m.authorId])));
      html += `<div class="sys"><span class="sys-pill ok">${m.kind === 'sosok' ? `${icon('shield', 16)} ${nm} בסדר · ה-SOS בוטל` : `${icon('route', 16)} ${nm} יצא/ה לדרך${m.text ? ' · ' + esc(m.text) : ''}${m.until ? ' · צפי ' + hhmm(m.until) : ''}`} · ${hhmm(m.createdAt)}</span></div>`;
      lastA = ''; return;
    }
    if (m.kind === 'checkin') {
      html += `<div class="sys"><span class="sys-pill ok">${icon('shield', 16)} ${m.authorId === u.id ? 'עדכנת שהגעת' : esc(first(nameOf(S.members[m.authorId]))) + ' הגיע/ה'} בשלום · ${hhmm(m.createdAt)}</span></div>`;
      lastA = ''; return;
    }
    const mine = m.authorId === u.id, a = S.members[m.authorId] || { id: m.authorId }, firstOf = m.authorId !== lastA;
    lastA = m.authorId;
    const jumbo = !m.image && !m.video && !m.audio && !m.replyTo && !m.poll && isJumbo(m.text);
    const reacts = Object.entries(m.reactions || {}), agg = {};
    reacts.forEach(([who, e]) => { agg[e] = agg[e] || { n: 0, mine: false }; agg[e].n++; if (who === u.id) agg[e].mine = true; });
    const r = m.replyTo, rName = r ? (r.authorId === u.id ? 'את/ה' : nameOf(S.members[r.authorId])) : '';
    const seenIt = kind === 'c' && mine && lastMine && m.id === lastMine.id;
    html += `<div class="msg${mine ? ' mine' : ''}${firstOf ? ' first' : ''}" id="m-${esc(m.id)}">${!mine && kind === 'g' ? `<span class="msg-av">${firstOf ? avatar(a, 28) : ''}</span>` : ''}<div class="mcol">
      <div class="bubble${(m.image || m.video) && !m.text ? ' pic' : ''}${jumbo ? ' jumbo' : ''}${m.sticker ? ' stk' : ''}${m.poll ? ' pollb' : ''}${m.loc ? ' locb' : ''}" data-mid="${esc(m.id)}">
        ${!mine && firstOf && kind === 'g' ? `<div class="msg-name" style="color:${userColor(m.authorId)}">${esc(nameOf(a))}</div>` : ''}
        ${r ? `<button class="quote" data-a="jump" data-v="${esc(r.id)}"><b>${esc(rName)}</b><span>${esc(r.text || '')}</span></button>` : ''}
        ${m.image ? `<button class="mimg" data-a="view-src" data-v="${esc(m.id)}"><img src="${m.image}" alt="תמונה" style="aspect-ratio:${m.w || 4}/${m.h || 3}"></button>` : ''}
        ${m.video ? videoThumb(m.video, m.id, 'msg', 'mvid') : ''}
        ${m.audio ? `<div class="aud" data-aid="${esc(m.id)}"><button class="aud-btn" data-a="play" data-v="${esc(m.id)}" aria-label="ניגון הודעה קולית">${icon('play', 18)}</button><span class="aud-bar"><span></span></span><span class="aud-t">${fmtDur(m.audio.dur)}</span></div>` : ''}
        ${m.poll ? pollHTML(m) : ''}${m.loc ? locHTML(m) : ''}${m.sticker ? `<span class="stk-e">${esc(m.sticker)}</span>` : ''}
        ${m.text ? `<span class="mtext" dir="auto">${linkify(m.text)}</span>` : ''}
        <span class="msg-time">${m.expireAt ? icon('timer', 11) + ' ' : ''}${hhmm(m.createdAt)}${mine && kind === 'c' ? `<span class="rcpt${m.createdAt <= otherRead ? ' read' : ''}">${icon(m.createdAt <= otherRead ? 'checks' : 'check', 14, 2.2)}</span>` : ''}</span>
      </div>
      ${Object.keys(agg).length ? `<div class="reacts">${Object.entries(agg).map(([e, v]) => `<button class="rchip${v.mine ? ' on' : ''}" data-a="react" data-v="${esc(m.id)}" data-e="${e}">${e}${v.n > 1 ? ` ${v.n}` : ''}</button>`).join('')}</div>` : ''}
      ${seenIt && m.createdAt <= otherRead ? '<div class="seen">נקרא</div>' : ''}
      ${lastMineG && m.id === lastMineG.id ? groupSeenHTML(ctx, m) : ''}
    </div></div>`;
  });
  const empty = kind === 'c' ? `<div class="empty">${icon('chats', 48, 1.4)}<b>שיחה חדשה</b><span>כתבו הודעה, שלחו הודעה קולית או התקשרו.</span></div>`
    : `<div class="empty">${icon('chat', 48, 1.4)}<b>עוד אין הודעות</b><span>כתבו משהו ל${esc(ctx ? ctx.name : 'קבוצה')}.</span></div>`;
  return `<div class="chat" id="chat">${html || empty}</div><div class="typing" id="typing" aria-live="polite"></div>`;
}
function chatBar(solo) {
  const r = S.reply;
  if (S.rec) return `<form id="chat-form" class="chat-bar glass rec${solo ? ' solo' : ''}"><div class="crow"><button type="button" class="link-btn red" data-a="rec-cancel">ביטול</button><span class="rec-dot"></span><span class="rec-t" id="rec-t">0:00</span><span class="body" style="color:var(--label2);font-size:15px">מקליט…</span><button type="button" class="send" data-a="rec-send" aria-label="שליחת ההקלטה">${icon('send', 18)}</button></div></form>`;
  return `<form id="chat-form" class="chat-bar glass${solo ? ' solo' : ''}">
    ${r ? `<div class="reply-bar">${icon('reply', 18)}<span class="body"><b>תשובה ל${esc(r.authorId === me() ? 'עצמך' : nameOf(S.members[r.authorId]))}</b><span>${esc(r.text)}</span></span><button type="button" class="icon-btn muted" data-a="reply-cancel" aria-label="ביטול התשובה">${icon('xmark', 16)}</button></div>` : ''}
    <div class="crow"><button type="button" class="icon-btn" data-a="attach" aria-label="צירוף תמונה, סרטון או עדכון">${icon('plus', 24, 2.2)}</button><button type="button" class="icon-btn" data-a="emoji" data-v="chat-in" aria-label="אימוג׳י">${icon('smile', 23)}</button><textarea id="chat-in" data-draft="${draftKey()}" rows="1" placeholder="הודעה" aria-label="הודעה" dir="auto" enterkeyhint="send"></textarea><button id="chat-send" class="send" type="button" aria-label="הקלטת הודעה קולית">${icon('mic', 19, 2)}</button></div></form>`;
}
function typingNames(map, ids) {
  const now = Date.now();
  return Object.entries(map || {}).filter(([id, t]) => id !== me() && now - t < 6000 && (!ids || ids.includes(id))).map(([id]) => first(nameOf(S.members[id])));
}
function updateTyping() {
  const el = $('#typing'); if (!el) return;
  const map = S.screen === 'chat' ? (chat() || {}).typing : (group() || {}).typing;
  const n = typingNames(map);
  el.textContent = !n.length ? '' : S.screen === 'chat' ? 'מקליד/ה…' : n.length === 1 ? `${n[0]} מקליד/ה…` : `${n.slice(0, 2).join(' ו')} מקלידים…`;
}
setInterval(() => { if (chatVisible()) updateTyping(); if (S.screen === 'root' && S.tab === 'chats' && !typing()) softRender(); }, 2500);
let typedAt = 0;
function sentTyping() { if (Date.now() - typedAt > 3000) { typedAt = Date.now(); be.setTyping(scope()); } }

async function send(m) {
  const sc = scope();
  const v = vanishOf(sc); if (v) m.expireAt = Date.now() + v * 1000;
  if (S.reply) { m.replyTo = { id: S.reply.id, authorId: S.reply.authorId, text: S.reply.text }; S.reply = null; }
  try { await be.sendMessage(sc, m); haptic(6); pushMsg(sc, m); if (sc.t === 'g') markGroupChatSeen(); }
  catch (e) { if (e && e.code === 'local') hud('זמין באתר, אחרי כניסה עם Google', true); else fail(e); throw e; }
  finally { render(); }
}
function msgById(id) { return curMsgs().find(m => m.id === id); }
function msgPreview(m) { return m.text || (m.image ? '📷 תמונה' : m.video ? '🎬 סרטון' : m.audio ? '🎤 הודעה קולית' : m.poll ? '📊 ' + m.poll.q : m.loc ? '📍 מיקום' : m.sticker || ''); }

// long press / right click on a bubble: reactions, reply, copy, delete
async function msgMenu(mid) {
  const m = msgById(mid); if (!m) return;
  haptic(12);
  const mineR = (m.reactions || {})[me()], g = group();
  const canDel = m.authorId === me() || (S.screen === 'group' && isOwner(g));
  const acts = [{ label: 'תשובה', k: 'reply' }].concat(m.text ? [{ label: 'העתקה', k: 'copy' }] : []).concat(m.authorId !== me() ? [{ label: 'דיווח על ההודעה', k: 'report' }] : []).concat(canDel ? [{ label: 'מחיקה', k: 'delete', destructive: true }] : []);
  const top = `<div class="react-row">${REACTIONS.map(e => `<button type="button" class="${mineR === e ? 'on' : ''}" data-pick="r:${e}" aria-label="תגובה ${e}">${e}</button>`).join('')}</div>`;
  const r = await confirmSheet({ top, actions: acts });
  if (typeof r === 'string' && r.startsWith('r:')) { const e = r.slice(2); try { await be.react(scope(), mid, mineR === e ? null : e); } catch (x) { fail(x); } return; }
  const a = acts[r]; if (!a) return;
  if (a.k === 'reply') { S.reply = { id: m.id, authorId: m.authorId, text: msgPreview(m).slice(0, 80) }; render(); const t = $('#chat-in'); if (t) t.focus({ preventScroll: true }); }
  if (a.k === 'copy') copyText(m.text);
  if (a.k === 'report') reportForm({ kind: 'message', target: m.authorId, ref: (S.screen === 'chat' ? 'chat/' + S.cid : 'group/' + S.gid + '/' + S.ch) + '/' + m.id, text: msgPreview(m).slice(0, 300) });
  if (a.k === 'delete') { try { await be.deleteMessage(scope(), m); hud('ההודעה נמחקה'); } catch (x) { fail(x); } }
}
let pressT = null, pressXY = null;
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('[data-mid]'); if (!b || e.target.closest('button,a')) return;
  pressXY = [e.clientX, e.clientY]; clearTimeout(pressT);
  pressT = setTimeout(() => { pressT = null; msgMenu(b.dataset.mid); }, 480);
});
document.addEventListener('pointermove', e => { if (pressT && pressXY && Math.hypot(e.clientX - pressXY[0], e.clientY - pressXY[1]) > 10) { clearTimeout(pressT); pressT = null; } });
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => { clearTimeout(pressT); pressT = null; }));
document.addEventListener('contextmenu', e => { const b = e.target.closest('[data-mid]'); if (b) { e.preventDefault(); msgMenu(b.dataset.mid); } });
document.addEventListener('dblclick', e => {
  const b = e.target.closest('[data-mid]'); if (!b) return;
  const m = msgById(b.dataset.mid); if (!m) return;
  be.react(scope(), m.id, (m.reactions || {})[me()] === '❤️' ? null : '❤️').catch(fail); haptic(10);
});

/* ---------- voice notes ---------- */
let recTick = null;
async function recStart() {
  const mime = recorderMime();
  if (mime === null) { hud('הדפדפן לא תומך בהקלטה', true); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { showMediaHelp(e, 'audio'); return; }
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  S.rec = { rec, stream, chunks, start: Date.now(), mime: rec.mimeType || mime || 'audio/webm', cancel: false };
  rec.onstop = async () => {
    stream.getTracks().forEach(t => t.stop()); clearInterval(recTick);
    const r = S.rec; S.rec = null; render();
    if (!r || r.cancel || !chunks.length) return;
    const dur = (Date.now() - r.start) / 1000;
    if (dur < 1) { hud('ההקלטה קצרה מדי', true); return; }
    const data = await blobToDataURL(new Blob(chunks, { type: r.mime }));
    if (data.length > 950000) { hud('ההקלטה ארוכה מדי', true); return; }
    send({ audio: { data, dur: Math.round(dur), mime: r.mime } }).catch(() => {});
  };
  rec.start(250); haptic(15); render();
  recTick = setInterval(() => {
    const el = $('#rec-t'); if (el && S.rec) el.textContent = fmtDur((Date.now() - S.rec.start) / 1000);
    if (S.rec && Date.now() - S.rec.start > 120000) recStop();
  }, 250);
}
function recStop() { if (S.rec && S.rec.rec.state !== 'inactive') S.rec.rec.stop(); }
function recCancel() { if (S.rec) { S.rec.cancel = true; recStop(); } }
const player = new Audio(); let playingId = null;
player.addEventListener('timeupdate', syncAudioUI);
player.addEventListener('ended', () => { playingId = null; syncAudioUI(); });
function syncAudioUI() {
  $$('.aud').forEach(el => {
    const on = el.dataset.aid === playingId, btn = el.querySelector('.aud-btn'), fill = el.querySelector('.aud-bar span'), t = el.querySelector('.aud-t');
    btn.innerHTML = icon(on && !player.paused ? 'pause' : 'play', 18);
    fill.style.width = on && player.duration ? (player.currentTime / player.duration * 100) + '%' : '0%';
    if (on && player.duration && isFinite(player.duration)) t.textContent = fmtDur(player.paused ? player.duration : player.currentTime);
  });
}
function playAudio(id) {
  const m = msgById(id); if (!m || !m.audio) return;
  if (playingId === id) { if (player.paused) player.play().catch(() => {}); else player.pause(); syncAudioUI(); return; }
  player.pause(); player.src = m.audio.data; playingId = id;
  player.play().catch(() => { hud('לא הצלחנו לנגן את ההקלטה במכשיר הזה', true); playingId = null; });
  syncAudioUI();
}

// Say what's coming before the browser's own prompt: a dismissed prompt makes Chrome block automatically
async function prePermission(kind) {
  await refreshMediaPerm();
  const p = S.mediaPerm || {};
  if (p.unknown || p.mic !== 'prompt') return true;
  const r = await confirmSheet({ title: 'הדפדפן ישאל על המיקרופון' + (kind === 'video' ? ' והמצלמה' : ''), msg: 'לחצו "אפשר". אם סוגרים את החלון בלי לבחור, Chrome חוסם את השיחות אוטומטית.', actions: [{ label: 'הבנתי, להמשיך' }] });
  return r === 0;
}
function permCard() {
  const p = S.mediaPerm || {};
  if (local() || LS.get('friends.permAsked') || inAppBrowser() || p.unknown || p.mic !== 'prompt') return '';
  return `<div class="tip">${icon('phone', 24)}<span class="body"><b>הכנה לשיחות</b><br><span style="color:var(--label2);font-size:13px">אשרו מיקרופון עכשיו, כדי שהשיחות יעבדו מיד</span></span><button class="btn filled sm" data-a="perm-go">אישור</button><button class="icon-btn muted sm" data-a="perm-hide" aria-label="סגירה">${icon('xmark', 16)}</button></div>`;
}

/* ---------- calls ---------- */
let ringTimer = null, callTick = null, actx = null;
function ring(on) {
  clearInterval(ringTimer);
  if (!on) return;
  const beep = () => {
    haptic([400, 200, 400]);
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      [0, .25].forEach(d => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(actx.destination); const t = actx.currentTime + d; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.2, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .2); o.start(t); o.stop(t + .22); });
    } catch (e) {}
  };
  beep(); ringTimer = setInterval(beep, 2200);
}
const callUI = {
  async incoming(c) {
    if (S.incoming || (calls && calls.state)) return;
    await loadUsers([c.from]);
    if (iBlocked(c.from)) { try { await calls.decline(c); } catch (e) {} return; } // blocked: never rings
    S.incoming = c; renderIncoming(); ring(true);
    if (document.hidden) notify('שיחה נכנסת', `${nameOf(S.members[c.from])} · ${c.kind === 'video' ? 'שיחת וידאו' : 'שיחה קולית'}`, 'call');
  },
  incomingGone(id) { if (S.incoming && S.incoming.id === id) { const from = S.members[S.incoming.from]; S.incoming = null; ring(false); renderIncoming(); hud(`שיחה שלא נענתה מ${first(nameOf(from))}`, true); } },
  open: () => renderCall(), update: () => renderCall(), close: () => renderCall(),
  toast: m => hud(m, true),
  mediaError: (e, kind) => showMediaHelp(e, kind),
  ended(info) {
    if (info.role !== 'caller') return;
    const status = info.status === 'ended' && info.dur > 0 ? 'done' : info.status === 'declined' ? 'declined' : 'missed';
    be.sendMessage({ t: 'c', id: chatId(me(), info.other) }, { kind: 'call', call: { kind: info.kind, dur: info.dur, status } }).catch(() => {});
  }
};
// Why the camera/microphone can't be used, and how to fix it on this device
async function showMediaHelp(e, kind) {
  const h = mediaHelp(e, kind);
  if (e && /NotAllowed|Permission/.test(e.name || '') && !inAppBrowser()) { permHelp(kind === 'video' ? 'cam' : 'mic'); return; }
  const r = await confirmSheet({ title: h.title, msg: h.msg, actions: [{ label: 'פתיחה בדפדפן' }, { label: 'העתקת הקישור' }, { label: 'הבנתי' }] });
  if (r === 0) openInBrowser();
  if (r === 1) copyText(location.origin + location.pathname);
}
async function startCall(uid, kind) {
  if (isBlockedPair(uid)) { hud(iBlocked(uid) ? 'חסמת את המשתמש הזה' : 'המשתמש לא זמין', true); return; }
  if (!calls) { hud('שיחות קול ווידאו זמינות באתר, אחרי כניסה עם Google', true); return; }
  if (calls.state) return;
  if (inAppBrowser()) { showMediaHelp(null, kind); return; }
  if (!navigator.mediaDevices || !window.RTCPeerConnection) { hud('הדפדפן הזה לא תומך בשיחות', true); return; }
  if (!(await prePermission(kind))) return;
  try {
    await be.openChat(uid); await loadUsers([uid]);
    await calls.start(uid, kind);
    pushOut({ kind: 'call', cid: chatId(me(), uid), title: nameOf(S.members[me()]), body: kind === 'video' ? '📹 שיחת וידאו נכנסת' : '📞 שיחה נכנסת' });
  }
  catch (e) { fail(e); }
}
function renderIncoming() {
  let el = $('#incoming'); const c = S.incoming;
  if (!c) { if (el) el.remove(); return; }
  const u = S.members[c.from] || { id: c.from };
  if (!el) { el = document.createElement('div'); el.id = 'incoming'; el.className = 'call incoming'; el.setAttribute('role', 'alertdialog'); phoneEl.appendChild(el); }
  el.innerHTML = `<div class="call-top"><div class="call-av">${avatar(u, 110)}</div><div class="call-name">${esc(nameOf(u))}</div><div class="call-st">${c.kind === 'video' ? 'שיחת וידאו נכנסת…' : 'שיחה קולית נכנסת…'}</div></div>
    <div class="call-ctl two"><div class="cbtn-w"><button class="cbtn red" data-a="call-decline" aria-label="דחייה">${icon('phoneDown', 34)}</button><span>דחייה</span></div><div class="cbtn-w"><button class="cbtn green" data-a="call-accept" aria-label="מענה">${icon(c.kind === 'video' ? 'videoF' : 'phoneF', 30)}</button><span>מענה</span></div></div>`;
}
function renderCall() {
  const st = calls && calls.state; let el = $('#call');
  if (!st) { if (el) el.remove(); clearInterval(callTick); callTick = null; return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'call'; el.className = 'call'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'שיחה');
    el.innerHTML = `<video class="rv" id="rv" autoplay playsinline></video><video class="lv" id="lv" autoplay playsinline muted></video><audio id="ra" autoplay></audio>
      <div class="call-top"><div class="call-av" id="call-av"></div><div class="call-name" id="call-name"></div><div class="call-st" id="call-st"></div></div><div class="call-ctl" id="call-ctl"></div>`;
    phoneEl.appendChild(el);
    callTick = setInterval(updCallStatus, 1000);
  }
  const u = S.members[st.other] || { id: st.other }, video = st.kind === 'video', hasRemoteVideo = st.remote.getVideoTracks().length > 0;
  el.classList.toggle('video', video); el.classList.toggle('live', video && hasRemoteVideo);
  $('#call-av').innerHTML = avatar(u, 110); $('#call-name').textContent = nameOf(u);
  const rv = $('#rv'), lv = $('#lv'), ra = $('#ra');
  if (video) { if (rv.srcObject !== st.remote) rv.srcObject = st.remote; ra.srcObject = null; }
  else { if (ra.srcObject !== st.remote) ra.srcObject = st.remote; rv.srcObject = null; }
  if (video && st.local) { if (lv.srcObject !== st.local) lv.srcObject = st.local; lv.hidden = st.camOff; } else lv.hidden = true;
  $('#call-ctl').innerHTML = `<div class="cbtn-w"><button class="cbtn${st.muted ? ' on' : ''}" data-a="call-mute" aria-pressed="${st.muted}" aria-label="השתקה">${icon(st.muted ? 'micOff' : 'mic', 28)}</button><span>${st.muted ? 'מושתק' : 'השתקה'}</span></div>
    ${video ? `<div class="cbtn-w"><button class="cbtn${st.camOff ? ' on' : ''}" data-a="call-cam" aria-pressed="${st.camOff}" aria-label="מצלמה">${icon(st.camOff ? 'videoOff' : 'video', 28)}</button><span>מצלמה</span></div>${canShareScreen() ? `<div class="cbtn-w"><button class="cbtn${st.screen ? ' on' : ''}" data-a="call-screen" aria-pressed="${!!st.screen}" aria-label="שיתוף מסך">${icon('grid', 26)}</button><span>${st.screen ? 'עצירת שיתוף' : 'שיתוף מסך'}</span></div>` : `<div class="cbtn-w"><button class="cbtn" data-a="call-flip" aria-label="החלפת מצלמה">${icon('flip', 28)}</button><span>החלפה</span></div>`}` : ''}
    <div class="cbtn-w"><button class="cbtn red" data-a="call-end" aria-label="ניתוק">${icon('phoneDown', 34)}</button><span>ניתוק</span></div>`;
  updCallStatus();
}
function updCallStatus() {
  const st = calls && calls.state, el = $('#call-st'); if (!st || !el) return;
  el.textContent = st.status === 'ringing' ? 'מצלצל…' : st.status === 'live' ? fmtDur((Date.now() - st.startedAt) / 1000) : 'מתחבר…';
}

/* ---------- events ---------- */
function viewEvents(g) {
  const u = S.user, evs = S.data.events;
  const bdays = g.members.map(id => S.members[id]).filter(m => m && m.birthday).map(m => { const b = nextBirthday(m.birthday); return b && b.days <= 60 ? { bday: true, id: 'b-' + m.id, uid: m.id, date: b.date, age: b.age, title: m.id === u.id ? 'יום ההולדת שלך' : `יום הולדת ל${nameOf(m)}` } : null; }).filter(Boolean);
  const up = evs.filter(e => daysTo(e.date) >= 0).concat(bdays).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const past = evs.filter(e => daysTo(e.date) < 0).reverse();
  const card = e => {
    const p = e.date.split('-').map(Number), dt = new Date(p[0], p[1] - 1, p[2]), n = daysTo(e.date);
    const when = n >= 0 ? `<span class="when">${n === 0 ? 'היום' : n === 1 ? 'מחר' : `בעוד ${n} ימים`}</span>` : '';
    if (e.bday) return `<div class="ev bd"><div class="ev-date"><span class="m">${MONTHS[dt.getMonth()]}</span><span class="d">${dt.getDate()}</span></div><div class="body">${when}<b>🎂 ${esc(e.title)}</b><span class="sub">יום ${DAYS[dt.getDay()]}${e.age ? ` · ${e.uid === u.id ? 'את/ה חוגג/ת' : 'חוגג/ת'} ${e.age}` : ''}</span>${e.uid !== u.id && !local() ? `<div><button class="btn tinted sm" data-a="dm" data-v="${esc(e.uid)}" style="margin-top:6px">${icon('chat', 16)} ברכה בפרטי</button></div>` : ''}</div></div>`;
    const r = e.rsvp || {}, mine = r[u.id] || '', cnt = v => Object.values(r).filter(x => x === v).length;
    return `<div class="ev${n < 0 ? ' past' : ''}"><div class="ev-date"><span class="m">${MONTHS[dt.getMonth()]}</span><span class="d">${dt.getDate()}</span></div><div class="body">
      ${when}<b dir="auto">${esc(e.title)}</b>
      <span class="sub">יום ${DAYS[dt.getDay()]}${e.time ? ` · ${esc(e.time)}` : ''}${e.place ? ` · ${esc(e.place)}` : ''}</span>
      ${n >= 0 ? `<div class="seg" role="group" aria-label="אישור הגעה">${[['yes', 'מגיע/ה'], ['maybe', 'אולי'], ['no', 'לא']].map(([v, l]) => `<button class="${mine === v ? 'on' : ''}" data-a="rsvp" data-v="${esc(e.id)}" data-r="${v}" aria-pressed="${mine === v}">${l}</button>`).join('')}</div>` : ''}
      <span class="sub">${cnt('yes')} מגיעים${cnt('maybe') ? ` · ${cnt('maybe')} אולי` : ''}${cnt('no') ? ` · ${cnt('no')} לא` : ''}</span></div>
      ${e.createdBy === u.id || isOwner(g) ? `<button class="icon-btn muted" data-a="event-menu" data-v="${esc(e.id)}" aria-label="אפשרויות">${icon('more', 22)}</button>` : ''}</div>`;
  };
  return (up.length ? `<div class="events">${up.map(card).join('')}</div>` : `<div class="empty">${icon('cal', 48, 1.4)}<b>אין אירועים קרובים</b><span>הוסיפו ארוחת שישי, יום הולדת או מפגש.</span><button class="btn filled sm" data-a="new-event">אירוע חדש</button></div>`) +
    (bdays.length || up.length ? '' : `<p class="section-f" style="text-align:center">ימי הולדת מופיעים כאן אוטומטית, כשכל אחד מוסיף את התאריך שלו בפרופיל.</p>`) +
    (past.length ? `<div class="section-h">עברו</div><div class="events">${past.slice(0, 10).map(card).join('')}</div>` : '');
}

/* ---------- album ---------- */
function viewAlbum() {
  const imgs = S.data.images;
  return imgs.length ? `<div class="section-h" style="padding-top:4px">${imgs.length} תמונות</div><div class="grid">${imgs.map((im, i) => `<button data-a="view-img" data-v="${esc(im.id)}" aria-label="תמונה ${i + 1}"><img src="${im.thumb}" alt="" loading="lazy"></button>`).join('')}</div>`
    : `<div class="empty">${icon('photo', 48, 1.4)}<b>האלבום ריק</b><span>כל תמונה שמשתפים בפיד מגיעה גם לכאן.</span><button class="btn filled sm" data-a="pick" data-v="album">הוספת תמונות</button></div>`;
}

/* ---------- school ---------- */
const HEB_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];
function dueLabel(d) {
  const n = daysTo(d);
  return n < 0 ? 'עבר' : n === 0 ? 'היום' : n === 1 ? 'מחר' : n < 7 ? 'יום ' + DAYS[new Date(d + 'T12:00').getDay()] : `בעוד ${n} ימים`;
}
function viewSchool(g) {
  const today = new Date().getDay(), day = S.ttDay !== undefined ? S.ttDay : (today === 6 ? 0 : today);
  const tt = S.data.timetable || {}, lessons = tt[day] || [];
  const hw = (S.data.homework || []).filter(h => daysTo(h.due) >= -1 || !(h.done || []).includes(me()));
  const open = hw.filter(h => !(h.done || []).includes(me())).length;
  const exams = (S.data.exams || []).filter(x => daysTo(x.date) >= 0);
  const f = S.focus, left = f ? Math.max(0, Math.round((f.end - Date.now()) / 1000)) : 0;
  return `<div class="school-top">
    <div class="focus-card">${icon('timer', 26)}<div class="body"><b>זמן ריכוז</b><span id="focus-left">${f ? fmtDur(left) + ' נשארו' : 'בלי טלפון, רק לימוד'}</span></div>
      ${f ? '<button class="btn tinted sm" data-a="focus-stop">עצירה</button>' : '<button class="btn filled sm" data-a="focus" data-v="25">25 דק׳</button><button class="btn tinted sm" data-a="focus" data-v="45">45</button>'}</div>
  </div>
  <div class="section-h"><span>שיעורי בית${open ? ` · ${open} פתוחים` : ''}</span><button class="nb-btn" data-a="hw-add">הוספה</button></div>
  ${hw.length ? `<div class="list lst">${hw.map(h => { const done = (h.done || []).includes(me()), n = daysTo(h.due), cnt = (h.done || []).length; return `<div class="row li${done ? ' done' : ''}"><button class="check" data-a="hw-toggle" data-v="${esc(h.id)}" aria-pressed="${done}" aria-label="סיימתי">${icon('check', 15, 2.6)}</button><span class="body"><span class="t" dir="auto"><b class="subj">${esc(h.subject)}</b> ${esc(h.text)}</span><span class="sub">${dueLabel(h.due)}${cnt ? ` · ${cnt} סיימו` : ''}</span></span>${!done && n <= 1 && n >= 0 ? '<span class="due-hot">דחוף</span>' : ''}${h.by === me() || isOwner(g) ? `<button class="icon-btn muted sm" data-a="school-del" data-v="homework:${esc(h.id)}" aria-label="מחיקה">${icon('xmark', 14)}</button>` : ''}</div>`; }).join('')}</div>`
    : '<div class="list"><button class="row" data-a="hw-add"><span class="body t acc">אין שיעורי בית. הוספה</span></button></div>'}
  <div class="section-h"><span>מבחנים</span><button class="nb-btn" data-a="exam-add">הוספה</button></div>
  ${exams.length ? `<div class="exam-row">${exams.map(x => { const n = daysTo(x.date); return `<div class="exam${n <= 3 ? ' soon' : ''}"><span class="exam-n">${n === 0 ? 'היום' : n}</span><span class="exam-u">${n === 0 ? '' : n === 1 ? 'יום' : 'ימים'}</span><b dir="auto">${esc(x.subject)}</b>${x.topics ? `<span class="exam-t" dir="auto">${esc(x.topics)}</span>` : ''}${x.by === me() || isOwner(g) ? `<button class="exam-x" data-a="school-del" data-v="exams:${esc(x.id)}" aria-label="מחיקה">${icon('xmark', 12)}</button>` : ''}</div>`; }).join('')}</div>`
    : '<div class="list"><button class="row" data-a="exam-add"><span class="body t acc">אין מבחנים קרובים. הוספה</span></button></div>'}
  ${schoolFilesHTML(g)}
  <div class="section-h"><span>מערכת שעות</span><button class="nb-btn" data-a="tt-edit">עריכה</button></div>
  <div class="seg tt-days">${HEB_DAYS.map((d, i) => `<button data-a="tt-day" data-v="${i}" class="${i === day ? 'on' : ''}" aria-label="${d}">${'אבגדהו'[i]}׳</button>`).join('')}</div>
  <div class="list" style="margin-top:8px">${lessons.length ? lessons.map((l, i) => `<div class="row"><span class="lesson-n">${i + 1}</span><span class="body t" dir="auto">${esc(l)}</span></div>`).join('') : `<button class="row" data-a="tt-edit"><span class="body t acc">${Object.keys(tt).length ? 'אין שיעורים ביום ' + HEB_DAYS[day] : 'הוספת מערכת שעות'}</span></button>`}</div>
  <p class="section-f">כל חברי הקבוצה רואים ועורכים. כל אחד מסמן לעצמו מה סיים. יום לפני הגשה או מבחן תגיע תזכורת.</p>`;
}
function homeworkForm() {
  const tomorrow = iso(new Date(Date.now() + 864e5));
  formSheet({ title: 'שיעורי בית', action: 'הוספה', body: `<div class="list"><div class="field"><input id="hw-subj" placeholder="מקצוע (למשל: מתמטיקה)" maxlength="30" autofocus></div><div class="field"><input id="hw-text" placeholder="מה צריך לעשות" maxlength="200"></div><div class="field"><label for="hw-due">להגשה</label><input id="hw-due" type="date" value="${tomorrow}"></div></div>`,
    onOk: async fs => {
      const subject = fs.querySelector('#hw-subj').value.trim(), text = fs.querySelector('#hw-text').value.trim(), due = fs.querySelector('#hw-due').value;
      if (!subject || !text || !due) { hud('צריך מקצוע, משימה ותאריך', true); return false; }
      await be.addHomework(S.gid, { subject, text, due }); haptic(10);
    } });
}
function examForm() {
  formSheet({ title: 'מבחן', action: 'הוספה', body: `<div class="list"><div class="field"><input id="ex-subj" placeholder="מקצוע" maxlength="30" autofocus></div><div class="field"><input id="ex-top" placeholder="חומר למבחן (לא חובה)" maxlength="120"></div><div class="field"><label for="ex-date">תאריך</label><input id="ex-date" type="date" value="${iso(new Date(Date.now() + 7 * 864e5))}"></div></div>`,
    onOk: async fs => {
      const subject = fs.querySelector('#ex-subj').value.trim(), topics = fs.querySelector('#ex-top').value.trim(), date = fs.querySelector('#ex-date').value;
      if (!subject || !date) { hud('צריך מקצוע ותאריך', true); return false; }
      await be.addExam(S.gid, { subject, topics, date }); haptic(10);
    } });
}
function timetableForm() {
  const tt = S.data.timetable || {};
  formSheet({ title: 'מערכת שעות', action: 'שמירה', tall: true, body: `<p class="section-f" style="padding-top:0">שיעור בכל שורה, לפי הסדר.</p>${HEB_DAYS.map((d, i) => `<div class="section-h">${d}</div><div class="list"><textarea class="tt-in" data-d="${i}" rows="4" dir="auto" placeholder="מתמטיקה&#10;אנגלית&#10;…">${esc((tt[i] || []).join('\n'))}</textarea></div>`).join('')}`,
    onOk: async fs => {
      const days = {};
      fs.querySelectorAll('.tt-in').forEach(t => { const l = t.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 12).map(x => x.slice(0, 40)); if (l.length) days[t.dataset.d] = l; });
      await be.saveTimetable(S.gid, days); hud('המערכת נשמרה');
    } });
}
let focusT = null;
function focusStart(min) {
  S.focus = { end: Date.now() + min * 60000, min }; haptic(10);
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  clearInterval(focusT); focusT = setInterval(focusTick, 1000); render();
}
function focusStop() { S.focus = null; clearInterval(focusT); render(); }
function focusTick() {
  if (!S.focus) return;
  const left = Math.round((S.focus.end - Date.now()) / 1000), el = $('#focus-left');
  if (left <= 0) { const m = S.focus.min; focusStop(); chime(); notify('זמן הריכוז נגמר', `${m} דקות של לימוד. הגיע זמן הפסקה!`, 'focus'); hud(`כל הכבוד! ${m} דקות של ריכוז`); return; }
  if (el) el.textContent = fmtDur(left) + ' נשארו';
}

/* ---------- photos ---------- */
function loadFullImages() {
  $$('img[data-iid]').forEach(async el => {
    const iid = el.dataset.iid;
    if (full[iid]) { el.src = full[iid]; return; }
    if (loadedFull.has(iid) || !S.gid) return;
    loadedFull.add(iid);
    try { const d = await be.imageData(S.gid, iid); if (d) { full[iid] = d; $$(`img[data-iid="${CSS.escape(iid)}"]`).forEach(x => x.src = d); } }
    catch (e) { loadedFull.delete(iid); }
  });
}
function renderViewer() {
  const v = S.viewer;
  if (!v) { const o = $('.viewer'); if (o) o.remove(); return; }
  let src, info, idx = -1, list = [], canDel = false;
  if (v.src || v.video) { src = v.src; info = v.info || ''; }
  else {
    list = S.data.images; idx = list.findIndex(x => x.id === v.id);
    if (idx < 0) { S.viewer = null; renderViewer(); return; }
    const im = list[idx], by = S.members[im.by] || { id: im.by };
    src = full[im.id] || im.thumb; info = `${nameOf(by)} · ${dayLabel(im.createdAt)}`; canDel = S.user && (im.by === S.user.id || isOwner(group()));
  }
  let o = $('.viewer');
  if (!o) { o = document.createElement('div'); o.className = 'viewer'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'תמונה'); phoneEl.appendChild(o); }
  o.innerHTML = `<div class="vt"><button class="nb-btn" data-a="viewer-close" style="color:#fff">סגירה</button><span style="font-size:15px;font-weight:600">${idx >= 0 ? `${idx + 1} מתוך ${list.length}` : ''}</span>${canDel ? `<button class="icon-btn" data-a="viewer-del" aria-label="מחיקת התמונה" style="color:#fff">${icon('trash', 22)}</button>` : '<span style="width:44px"></span>'}</div>
    <div class="vimg">${v.video ? `<video src="${v.video}" controls autoplay playsinline></video>` : `<img ${idx >= 0 ? `data-iid="${esc(list[idx].id)}"` : ''} src="${src}" alt="">`}
      ${idx > 0 ? `<button class="vnav" style="right:10px" data-a="viewer-step" data-v="-1" aria-label="הקודמת">${icon('prev', 22)}</button>` : ''}
      ${idx >= 0 && idx < list.length - 1 ? `<button class="vnav" style="left:10px" data-a="viewer-step" data-v="1" aria-label="הבאה">${icon('next', 22)}</button>` : ''}</div>
    <div class="vinfo">${esc(info)}</div>`;
  loadFullImages();
}

function joinForm(code) {
  let found = null;
  const fs = formSheet({ title: 'הצטרפות לקבוצה', action: 'הצטרפות',
    body: `<div class="section-h">קוד הזמנה</div><div class="list"><div class="field"><input id="jf-code" maxlength="6" placeholder="6 תווים" value="${esc(code || '')}" aria-label="קוד הזמנה" autocapitalize="characters" autocomplete="off" spellcheck="false" dir="ltr" style="text-align:left;letter-spacing:.15em;font-weight:600" autofocus></div></div>
      <p class="section-f">את הקוד מקבלים ממי שפתח את הקבוצה, בפרטי הקבוצה.</p><div id="jf-res" style="margin-top:16px"></div>`,
    async onOk() {
      if (!found) { await look(); if (!found) return false; }
      if (S.groups.some(g => g.id === found.groupId)) { hud('את/ה כבר בקבוצה הזו'); setTimeout(() => go('group', { gid: found.groupId }), 300); return; }
      await be.joinGroup(found.code, found.groupId); haptic(15); hud(`הצטרפת ל${found.groupName}`);
      if (params.has('join')) { params.delete('join'); history.replaceState(history.state, '', location.pathname + (params.toString() ? '?' + params : '')); }
      setTimeout(() => go('group', { gid: found.groupId }), 500);
    } });
  const inp = fs.querySelector('#jf-code'), res = fs.querySelector('#jf-res');
  async function look() {
    const c = inp.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); found = null;
    if (c.length !== 6) { res.innerHTML = ''; if (c.length) hud('הקוד צריך להיות 6 תווים', true); return; }
    res.innerHTML = '<div class="loading" style="min-height:60px"><div class="spinner"></div></div>';
    try {
      const inv = await be.findInvite(c);
      if (!inv) { res.innerHTML = '<p class="err" style="text-align:center">לא מצאנו קבוצה עם הקוד הזה. בדקו אותו ונסו שוב.</p>'; return; }
      found = Object.assign({ code: c }, inv);
      res.innerHTML = `<div class="invite">${gtile({ emoji: inv.emoji, color: inv.color }, 'lg')}<b style="font-size:20px">${esc(inv.groupName)}</b><span style="color:var(--label2);font-size:14px">לחצו "הצטרפות" למעלה כדי להיכנס.</span></div>`;
    } catch (e) { res.innerHTML = ''; fail(e); }
  }
  inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase(); if (inp.value.replace(/[^A-Z0-9]/g, '').length === 6) look(); else { found = null; res.innerHTML = ''; } });
  if (code && code.length === 6) look();
}
function eventForm() {
  const d = new Date(); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  formSheet({ title: 'אירוע חדש', action: 'הוספה',
    body: `<div class="section-h">פרטים</div><div class="list">
      <div class="field"><label for="ef-t">מה</label><input id="ef-t" maxlength="60" placeholder="ארוחת שישי" autofocus></div>
      <div class="field"><label for="ef-d">תאריך</label><input id="ef-d" type="date" value="${iso(d)}"></div>
      <div class="field"><label for="ef-h">שעה</label><input id="ef-h" type="time" value="19:30"></div>
      <div class="field"><label for="ef-p">איפה</label><input id="ef-p" maxlength="80" placeholder="אצל סבתא"></div></div>
      <p class="section-f">כל חברי הקבוצה יראו את האירוע ויוכלו לאשר הגעה.</p>`,
    async onOk(f) {
      const t = f.querySelector('#ef-t').value.trim(), date = f.querySelector('#ef-d').value;
      if (!t) { hud('כתבו מה האירוע', true); return false; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { hud('בחרו תאריך', true); return false; }
      await be.addEvent(S.gid, { title: t, date, time: f.querySelector('#ef-h').value || '', place: f.querySelector('#ef-p').value.trim() }); haptic(12); hud('האירוע נוסף');
    } });
}
/* ---------- videos ---------- */
const vcache = {};
// A small floating pill while a video is being compressed, uploaded or downloaded
function vprog(text, p) {
  let el = $('#vprog');
  if (!text) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'vprog'; el.className = 'vprog glass'; el.setAttribute('role', 'status'); phoneEl.appendChild(el); }
  el.innerHTML = `${icon('film', 18)}<span>${esc(text)}</span>${p !== undefined ? `<b>${Math.round(p * 100)}%</b>` : '<span class="spinner sm"></span>'}`;
}
function videoThumb(v, ownerId, kind, cls) {
  return `<button class="vthumb ${cls || ''}" data-a="play-video" data-v="${esc(ownerId)}" data-k="${kind}" style="aspect-ratio:${v.w || 16}/${v.h || 9}" aria-label="ניגון סרטון, ${fmtDur(v.dur)}"><img src="${v.thumb}" alt=""><span class="vplay">${icon('play', 24)}</span><span class="vdur">${fmtDur(v.dur)}</span></button>`;
}

/* ---------- emoji picker ---------- */
function emojiSheet(targetId) {
  const recent = (LS.get('friends.recentEmoji') || []).slice(0, 16);
  const sets = (recent.length ? [{ icon: '🕘', name: 'אחרונים', list: recent }] : []).concat(EMOJI_SETS);
  const fs = formSheet({ title: 'אימוג׳י', action: 'סיום',
    body: `<div class="emo-tabs" role="tablist">${sets.map((x, i) => `<button type="button" role="tab" data-et="${i}" aria-selected="${i === 0}" aria-label="${esc(x.name)}">${x.icon}</button>`).join('')}</div>
      <div class="emo-grid" id="emo-grid"></div>`,
    onOk() {} });
  const grid = fs.querySelector('#emo-grid');
  const show = i => { grid.innerHTML = `<div class="emo-h">${esc(sets[i].name)}</div>` + sets[i].list.map(e => `<button type="button" data-em="${e}" aria-label="${e}">${e}</button>`).join(''); fs.querySelectorAll('[data-et]').forEach(t => t.setAttribute('aria-selected', t.dataset.et == i)); };
  show(0);
  fs.querySelectorAll('[data-et]').forEach(t => t.onclick = () => show(+t.dataset.et));
  grid.onclick = e => {
    const b = e.target.closest('[data-em]'); if (!b) return;
    const em = b.dataset.em, el = document.getElementById(targetId);
    haptic(4);
    LS.set('friends.recentEmoji', [em].concat((LS.get('friends.recentEmoji') || []).filter(x => x !== em)).slice(0, 24));
    if (!el) return;
    const a = el.selectionStart ?? el.value.length, z = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, a) + em + el.value.slice(z);
    el.selectionStart = el.selectionEnd = a + em.length;
    if (el.dataset.draft) S.drafts[el.dataset.draft] = el.value;
    grow(el); updateSend();
  };
}

/* ---------- actions ---------- */
const listOf = id => S.data.lists.find(l => l.id === id);
const A = {
  google: async b => { if (isNative()) { nativeSignIn(); return; } b.disabled = true; LS.set('friends.joined', 1); try { await be.signIn(); if (!S.user) location.reload(); } catch (e) { if (!(e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request'))) fail(e); } finally { b.disabled = false; } },
  back,
  'root-tab': b => { if (S.tab === b.dataset.v) { scrollTo(0); return; } S.tab = b.dataset.v; if (S.tab === 'profile') refreshMediaPerm(); S.anim = 'fade'; try { history.replaceState({ screen: 'root', tab: S.tab }, ''); } catch (e) {} render(true); },
  gtab: b => {
    if (S.gtab === b.dataset.v && !S.hub) { scrollTo(S.gtab === 'chat' ? scrollMax() : 0); return; }
    S.gtab = b.dataset.v; S.reply = null; S.hub = null; if (S.gtab === 'chat') markGroupChatSeen(); S.anim = 'fade';
    try { history.replaceState(Object.assign({}, history.state, { gtab: S.gtab }), ''); } catch (e) {}
    render(true);
  },
  open: b => go('group', { gid: b.dataset.v }),
  'open-chat': b => go('chat', { cid: b.dataset.v }),
  'group-info': () => go('groupInfo'),
  'new-group': () => groupForm(null),
  'new-chat': () => newChatSheet(),
  join: () => joinForm(''),
  'edit-group': () => groupForm(group()),
  dm: b => startDM(b.dataset.v),
  call: b => { const c = chat(); if (c) startCall(otherOf(c), b.dataset.v); },
  member: async b => {
    const id = b.dataset.v, g = group(), m = S.members[id] || {};
    const acts = [{ label: 'הודעה פרטית', k: 'dm' }, { label: 'שיחה קולית', k: 'audio' }, { label: 'שיחת וידאו', k: 'video' }].concat(isOwner(g) ? [{ label: 'הוצאה מהקבוצה', k: 'remove', destructive: true }] : []);
    const r = await confirmSheet({ title: nameOf(m), actions: acts }); const a = acts[r]; if (!a) return;
    if (a.k === 'dm') startDM(id);
    else if (a.k === 'remove') {
      if (await confirmSheet({ title: `להוציא את ${nameOf(m)}?`, msg: 'הגישה לפיד, לצ׳אט, לאלבום ולרשימות של הקבוצה תיחסם.', actions: [{ label: 'הוצאה מהקבוצה', destructive: true }] }) === 0) {
        try { await be.removeMember(g.id, id); hud(`${first(nameOf(m))} הוצא/ה מהקבוצה`); } catch (e) { fail(e); }
      }
    } else startCall(id, a.k);
  },
  pick: b => { S.pickFor = b.dataset.v; fileEl.accept = 'image/*'; fileEl.multiple = b.dataset.v === 'album'; fileEl.value = ''; fileEl.click(); },
  'pick-video': b => { S.pickFor = b.dataset.v + '-video'; fileEl.accept = 'video/*'; fileEl.multiple = false; fileEl.value = ''; fileEl.click(); },
  'clear-vid': () => { S.vid = null; render(); },
  'school-add': async () => { const r = await confirmSheet({ actions: [{ label: '📚 שיעורי בית' }, { label: '📝 מבחן' }, { label: '🗓️ עריכת מערכת שעות' }] }); if (r === 0) homeworkForm(); if (r === 1) examForm(); if (r === 2) timetableForm(); },
  'hw-add': () => homeworkForm(),
  'exam-add': () => examForm(),
  'tt-edit': () => timetableForm(),
  'hw-toggle': async b => { const h = S.data.homework.find(x => x.id === b.dataset.v); if (!h) return; haptic(8); try { await be.toggleHomework(S.gid, h); } catch (e) { fail(e); } },
  'school-del': async b => { const [kind, iid] = b.dataset.v.split(':'); const r = await confirmSheet({ actions: [{ label: 'מחיקה', destructive: true }] }); if (r !== 0) return; try { await be.deleteSchoolItem(S.gid, kind, iid); } catch (e) { fail(e); } },
  'tt-day': b => { S.ttDay = +b.dataset.v; render(); },
  'focus': b => focusStart(+b.dataset.v),
  'focus-stop': () => focusStop(),
  'perm-go': async () => { LS.set('friends.permAsked', 1); await A['media-check'](); },
  'perm-hide': () => { LS.set('friends.permAsked', 1); render(); },
  emoji: b => emojiSheet(b.dataset.v),
  'play-video': async b => {
    const kind = b.dataset.k, id = b.dataset.v;
    const owner = kind === 'msg' ? msgById(id) : S.data.posts.find(p => p.id === id);
    const v = owner && owner.video; if (!v) return;
    const sc = kind === 'msg' ? scope() : { t: 'g', id: S.gid };
    try {
      if (!vcache[v.id]) { vprog('טוען סרטון…'); vcache[v.id] = await dataURLToObjectURL(await be.loadVideo(sc, v)); }
      S.viewer = { video: vcache[v.id], info: `${nameOf(S.members[owner.authorId])} · ${dayLabel(owner.createdAt)}` }; renderViewer();
    } catch (e) { hud(e && e.code === 'missing' ? 'הסרטון כבר לא זמין' : 'לא הצלחנו לטעון את הסרטון', true); }
    finally { vprog(null); }
  },
  // Together tab
  like: async b => { const p = S.data.posts.find(x => x.id === b.dataset.v); if (!p) return; haptic(); try { await be.toggleLike(S.gid, p); } catch (e) { fail(e); } },
  comments: b => openComments(b.dataset.v),
  'del-comment': async b => { const pid = S.comments && S.comments.pid; if (!pid) return; try { await be.deleteComment(S.gid, pid, b.dataset.v); } catch (e) { fail(e); } },
  'post-menu': async b => {
    const p = S.data.posts.find(x => x.id === b.dataset.v); if (!p) return;
    if (await confirmSheet({ title: 'למחוק את הפוסט?', msg: p.imageId ? 'גם התמונה תימחק מהאלבום.' : '', actions: [{ label: 'מחיקת הפוסט', destructive: true }] }) === 0) { try { await be.deletePost(S.gid, p); hud('הפוסט נמחק'); } catch (e) { fail(e); } }
  },
  'view-img': b => { S.viewer = { id: b.dataset.v }; renderViewer(); },
  'view-src': b => { const m = msgById(b.dataset.v); if (m && m.image) { S.viewer = { src: m.image, info: `${nameOf(S.members[m.authorId])} · ${dayLabel(m.createdAt)}` }; renderViewer(); } },
  'viewer-close': () => { const vv = $('.viewer video'); if (vv) vv.pause(); S.viewer = null; renderViewer(); },
  'viewer-step': b => { const l = S.data.images, i = l.findIndex(x => x.id === S.viewer.id) + +b.dataset.v; if (l[i]) { S.viewer.id = l[i].id; renderViewer(); } },
  'viewer-del': async () => {
    const im = S.data.images.find(x => x.id === S.viewer.id); if (!im) return;
    if (await confirmSheet({ title: 'למחוק את התמונה?', msg: 'היא תימחק מהאלבום של כל הקבוצה.', actions: [{ label: 'מחיקת התמונה', destructive: true }] }) === 0) { try { await be.deleteImage(S.gid, im); hud('התמונה נמחקה'); A['viewer-close'](); } catch (e) { fail(e); } }
  },
  rsvp: async b => { haptic(); try { await be.rsvp(S.gid, b.dataset.v, b.dataset.r); } catch (e) { fail(e); } },
  'new-event': () => eventForm(),
  'event-menu': async b => {
    const e = S.data.events.find(x => x.id === b.dataset.v); if (!e) return;
    if (await confirmSheet({ title: e.title, actions: [{ label: 'מחיקת האירוע', destructive: true }] }) === 0) { try { await be.deleteEvent(S.gid, e.id); hud('האירוע נמחק'); } catch (x) { fail(x); } }
  },
  'share-invite': async () => {
    const g = group(), url = inviteLink(g), text = `הצטרפו לקבוצה "${g.name}" ב-Friends. קוד ההזמנה: ${g.inviteCode}`;
    if (navigator.share) { try { await navigator.share({ title: 'הזמנה ל-Friends', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    copyText(text + '\n' + url);
  },
  'copy-invite': () => copyText(inviteLink(group())),
  'new-code': async () => { const g = group(); if (await confirmSheet({ title: 'להחליף את קוד ההזמנה?', msg: 'הקישור הישן יפסיק לעבוד.', actions: [{ label: 'החלפת הקוד' }] }) === 0) { try { await be.newInviteCode(g); hud('קוד חדש נוצר'); } catch (e) { fail(e); } } },
  'delete-group': async () => { const g = group(); if (await confirmSheet({ title: `למחוק את "${g.name}"?`, msg: 'הקבוצה תיעלם לכל החברים, עם הפיד, הצ׳אט, האירועים, האלבום והרשימות. אי אפשר לבטל.', actions: [{ label: 'מחיקת הקבוצה', destructive: true }] }) === 0) { try { await be.deleteGroup(g); go('root'); hud('הקבוצה נמחקה'); } catch (e) { fail(e); } } },
  'leave-group': async () => { const g = group(); if (await confirmSheet({ title: `לצאת מ"${g.name}"?`, msg: 'כדי לחזור תצטרכו קוד הזמנה חדש.', actions: [{ label: 'יציאה מהקבוצה', destructive: true }] }) === 0) { try { await be.leaveGroup(g.id); go('root'); hud('יצאת מהקבוצה'); } catch (e) { fail(e); } } },
  'sign-out': async () => { if (await confirmSheet({ title: 'להתנתק?', msg: be.mode === 'live' ? 'הקבוצות והשיחות שלך נשארות. אפשר להיכנס שוב עם Google.' : 'בתצוגה המקדימה הכול יתחיל מחדש.', actions: [{ label: 'התנתקות' }] }) === 0) { stopAll(); if (pushToken && be.dropPushToken) await be.dropPushToken(pushToken); pushReady = false; pushToken = ''; await be.signOut(); } },
  'media-check': async () => {
    if (inAppBrowser()) { showMediaHelp(null, 'video'); return; }
    let mic = false;
    try { const a = await navigator.mediaDevices.getUserMedia({ audio: true }); a.getTracks().forEach(t => t.stop()); mic = true; }
    catch (e) { showMediaHelp(e, 'audio'); }
    if (mic) {
      try { const v = await navigator.mediaDevices.getUserMedia({ video: true }); v.getTracks().forEach(t => t.stop()); hud('המיקרופון והמצלמה מאושרים'); }
      catch (e) { hud('המיקרופון מאושר, אפשר להתקשר. המצלמה לא אושרה', true); }
    }
    await refreshMediaPerm(); render();
  },
  'copy-link': () => copyText(location.origin + location.pathname),
  'media-fix': () => showMediaHelp({ name: 'NotAllowedError' }, 'video'),
  notif: async () => { try { const p = await Notification.requestPermission(); hud(p === 'granted' ? 'ההתראות הופעלו' : 'ההתראות לא הופעלו', p !== 'granted'); } catch (e) {} render(); },
  install: async () => {
    if (installEvt) { const e = installEvt; e.prompt(); try { const c = await e.userChoice; if (c && c.outcome === 'accepted') LS.set('friends.noInstall', 1); } catch (x) {} installEvt = null; render(); return; }
    const h = installHelp();
    const r = await confirmSheet({ title: h.title, msg: h.msg, actions: [{ label: 'העתקת הקישור' }, { label: 'הבנתי' }] });
    if (r === 0) copyText(h.link);
  },
  'install-hide': () => { LS.set('friends.noInstall', 1); render(); },
  // chat
  react: async b => { const m = msgById(b.dataset.v); if (!m) return; const mine = (m.reactions || {})[me()]; haptic(); try { await be.react(scope(), m.id, mine === b.dataset.e ? null : b.dataset.e); } catch (e) { fail(e); } },
  jump: b => { const el = document.getElementById('m-' + b.dataset.v); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); } },
  'reply-cancel': () => { S.reply = null; render(); },
  play: b => playAudio(b.dataset.v),
  'rec-start': () => recStart(),
  'rec-send': () => recStop(),
  'rec-cancel': () => recCancel(),
  // calls
  'call-accept': async () => { const c = S.incoming; if (!c) return; S.incoming = null; ring(false); renderIncoming(); if (S.mediaPerm && S.mediaPerm.mic === 'prompt') hud('לחצו "אפשר" כשהדפדפן שואל על המיקרופון'); try { await calls.accept(c); } catch (e) { fail(e); } },
  'call-decline': () => { const c = S.incoming; if (!c) return; S.incoming = null; ring(false); renderIncoming(); calls.decline(c); },
  'call-end': () => calls && calls.hangup(),
  'call-mute': () => calls && calls.toggleMute(),
  'call-cam': () => calls && calls.toggleCam(),
  'call-flip': () => calls && calls.flip()
};
const F = {
  'local-login': async () => { const n = $('#local-name').value.trim(); if (!n) { $('#local-name').focus(); hud('כתבו את השם שלכם', true); return; } await be.signIn(n); },
  'chat-form': async () => {
    const k = draftKey(), t = (S.drafts[k] || '').trim(); if (!t) return;
    S.drafts[k] = ''; const el = $('#chat-in'); if (el) { el.value = ''; grow(el); }
    updateSend();
    try { await send({ text: t }); } catch (e) { S.drafts[k] = t; render(); }
  },
  'cmt-form': async f => { const el = f.querySelector('#cmt-in'), t = el.value.trim(); if (!t || !S.comments) return; el.value = ''; grow(el); try { await be.addComment(S.gid, S.comments.pid, t); } catch (e) { el.value = t; fail(e); } },
};

/* ====================== Friends: the social layer ====================== */
// Group kinds: a plain chat group, a Discord-style server with channels, a school class with study tools
const TYPES = { group: ['קבוצה', '💬'], server: ['שרת', '🎮'], school: ['כיתה', '🎒'] };
const gtype = g => (g && TYPES[g.type]) ? g.type : 'group';
const DEFAULT_CHANNELS = {
  group: [{ id: 'main', name: 'כללי' }],
  server: [{ id: 'main', name: 'כללי' }, { id: 'gaming', name: 'גיימינג' }, { id: 'memes', name: 'ממים' }, { id: 'music', name: 'מוזיקה' }],
  school: [{ id: 'main', name: 'כללי' }, { id: 'homework', name: 'שיעורי-בית' }, { id: 'questions', name: 'שאלות' }]
};
const following = () => (S.user && S.user.following) || [];
const isFollowing = uid => following().includes(uid);
const uname = u => u && u.username ? '@' + u.username : '';
const postById = id => S.posts.find(p => p.id === id);
const pimg = {};
function chime() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    [0, .16].forEach((d, i) => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = i ? 1320 : 880; o.connect(g); g.connect(actx.destination); const t = actx.currentTime + d; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.15, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .16); o.start(t); o.stop(t + .18); });
  } catch (e) {}
  haptic([60, 80, 60]);
}
const followLabel = uid => pending(uid) ? 'ממתין לאישור' : isFollowing(uid) ? 'עוקב/ת' : 'מעקב';
const followBtn = (uid, wide) => uid === me() ? '' : `<button class="btn ${isFollowing(uid) ? 'tinted' : 'filled'} sm${wide ? ' grow' : ''}" data-a="follow" data-v="${esc(uid)}">${followLabel(uid)}</button>`;

/* ---------- root tabs ---------- */
function rootTabs() {
  const cu = S.chats.filter(chatUnread).length + S.groups.filter(groupUnread).length;
  return tabbar([['home', 'בית', 'house', 0], ['videos', 'סרטונים', 'playRect', 0], ['create', 'יצירה', 'plusSq', 0], ['chats', 'צ׳אטים', 'chats', cu], ['profile', 'פרופיל', 'user', 0]], S.tab, 'root-tab');
}
function groupTabs() {
  const g = group(), t = gtype(g), n = S.gtab === 'chat' ? 0 : groupChatUnread();
  const items = [['chat', t === 'group' ? 'צ׳אט' : '#' + ((g.channels || []).find(c => c.id === S.ch) || { name: 'כללי' }).name, 'chat', n]];
  if (t !== 'group') items.unshift(['channels', 'ערוצים', 'hash', 0]);
  if (t === 'school') items.push(['school', 'לימודים', 'book', 0]);
  items.push(['events', 'אירועים', 'cal', 0], ['album', 'אלבום', 'photo', 0]);
  return tabbar(items, S.gtab, 'gtab');
}

/* ---------- sign in & username ---------- */
function viewLogin() {
  const live = be.mode === 'live';
  return `<div class="onb">
    <div class="app-icon fr">${icon('people', 56, 1.7)}</div>
    <h1 dir="ltr">Friends</h1>
    <p class="lead">הרשת החברתית שלך ושל החברים: תמונות, סרטונים, צ׳אטים, שרתים ושיחות.</p>
  </div>
  <div class="features">
    <div class="feature"><span class="fi">${icon('photo', 30)}</span><div><b>פיד וסטוריז</b><span>תמונות מהחברים שלך, לייקים, תגובות וסטורי ל-24 שעות.</span></div></div>
    <div class="feature"><span class="fi">${icon('playRect', 30)}</span><div><b>סרטונים</b><span>מעלים סרטונים, צופים, עושים לייק ועוקבים אחרי ערוצים.</span></div></div>
    <div class="feature"><span class="fi">${icon('hash', 30)}</span><div><b>צ׳אטים ושרתים</b><span>הודעות פרטיות, קבוצות, שרתים עם ערוצים ושיחות וידאו.</span></div></div>
    <div class="feature"><span class="fi">${icon('book', 30)}</span><div><b>קבוצת כיתה</b><span>מערכת שעות, שיעורי בית, מבחנים וטיימר ריכוז.</span></div></div>
  </div>
  ${live ? (S.pending
    ? `<div class="btn-row" style="flex-direction:column"><button class="gbtn" data-a="continue-as">${avatar(S.pending, 28)}<span>המשך כ-${esc(nameOf(S.pending))}</span></button><button class="gbtn alt" data-a="google">${GLOGO}<span>חשבון Google אחר</span></button></div>
    <p class="section-f" style="text-align:center">כבר מחובר/ת עם Google במכשיר הזה. אפשר להמשיך או לבחור חשבון אחר.</p>`
    : `<div class="btn-row"><button class="gbtn" data-a="google">${GLOGO}<span>התחברות עם Google</span></button></div>
    <p class="section-f" style="text-align:center">נכנסים עם חשבון Google. אחר כך בוחרים שם משתמש.</p>`)
  : `<form id="local-login"><div class="section-h">איך קוראים לך?</div><div class="list"><div class="field"><input id="local-name" autocomplete="given-name" placeholder="השם שלך" aria-label="השם שלך" autofocus></div></div>
    <div class="btn-row"><button class="btn filled block">כניסה</button></div>
    <p class="section-f" style="text-align:center">זו תצוגה מקדימה: הנתונים נשמרים רק בדף הזה. באתר נכנסים עם Google.</p></form>`}
  <div class="btn-row" style="justify-content:center"><button class="nb-btn" data-a="open-browser">${icon('link', 18)} פתיחה בדפדפן</button></div>`;
}
const GLOGO = '<svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.2-8.5 2.2-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';
function viewUsername() {
  return `<div class="onb" style="padding-top:40px"><div class="app-icon fr">${avatar(S.user, 72)}</div><h1>שלום ${esc(first(nameOf(S.user)))}!</h1><p class="lead">בחרו שם משתמש. כך החברים ימצאו אתכם.</p></div>
  <form id="uname-form"><div class="list"><div class="field"><span class="at" dir="ltr">@</span><input id="un-in" dir="ltr" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="20" placeholder="username" aria-label="שם משתמש" autofocus></div></div>
  <p class="section-f">3 עד 20 תווים: אותיות באנגלית, מספרים, נקודה וקו תחתון.</p>
  <div class="btn-row"><button class="btn filled block">המשך</button></div></form>`;
}
const UNAME_RE = /^[a-z0-9._]{3,20}$/;
async function saveUsername(raw) {
  const n = raw.trim().toLowerCase().replace(/^@/, '');
  if (!UNAME_RE.test(n)) { hud('3–20 תווים: a-z, 0-9, נקודה וקו תחתון', true); return false; }
  try { await be.claimUsername(n); S.user.username = n; S.members[me()] = Object.assign({}, S.members[me()], { username: n }); haptic(12); return true; }
  catch (e) { if (e && e.code === 'taken') hud('השם הזה כבר תפוס. נסו אחר', true); else fail(e); return false; }
}

/* ---------- home: stories + photo feed (Instagram) ---------- */
function circle() { return new Set(following().filter(canSee).concat(me())); }
function storyGroups() {
  const fol = circle(), by = {};
  S.stories.forEach(s => { if (fol.has(s.authorId) && storyVisible(s)) (by[s.authorId] = by[s.authorId] || []).push(s); });
  Object.values(by).forEach(l => l.sort((a, b) => a.createdAt - b.createdAt));
  const unseen = u => by[u].some(s => !(s.seen || []).includes(me()));
  const others = Object.keys(by).filter(u => u !== me()).sort((a, b) => unseen(b) - unseen(a));
  return { by, others, unseen };
}
function storiesRow() {
  const { by, others, unseen } = storyGroups(), mine = by[me()] || [];
  return `<div class="stories" role="list">
    <button class="story" role="listitem" data-a="${mine.length ? 'story-open' : 'new-story'}" data-v="${esc(me())}"><span class="ring${mine.length ? '' : ' none'}">${avatar(S.user, 62)}${mine.length ? '' : `<span class="st-plus">${icon('plus', 13, 3)}</span>`}</span><span class="st-n">הסטורי שלך</span></button>
    ${others.map(u => `<button class="story" role="listitem" data-a="story-open" data-v="${esc(u)}"><span class="ring${unseen(u) ? '' : ' seen'}${unseen(u) && by[u].some(s => s.close && !(s.seen || []).includes(me())) ? ' close' : ''}">${avatar(S.members[u] || { id: u }, 62)}</span><span class="st-n">${esc(first(nameOf(S.members[u])))}</span></button>`).join('')}
  </div>`;
}
function viewHome() {
  const fol = circle(), feed = S.posts.filter(p => p.kind === 'photo' && fol.has(p.authorId));
  return bar({ title: 'Friends', eyebrow: local() ? '<span class="pill">תצוגה מקדימה</span>' : '', trail: `<button class="nb-btn nb-dot" data-a="activity" aria-label="פעילות${unreadNotifs() ? `, ${unreadNotifs()} חדשות` : ''}">${icon('heart', 24)}${unreadNotifs() ? `<span class="dot">${unreadNotifs() > 9 ? '9+' : unreadNotifs()}</span>` : ''}</button><button class="nb-btn" data-a="search" aria-label="חיפוש חברים">${icon('search', 23)}</button><button class="nb-btn" data-a="events" aria-label="אירועים">${icon('cal', 23)}</button><button class="nb-btn" data-a="create" aria-label="יצירה">${icon('plusSq', 24)}</button>` }) +
  storiesRow() + permCard() + eventsStrip() +
  (canOfferInstall() && !LS.get('friends.noInstall') ? `<div class="tip">${icon('sparkles', 24)}<span class="body"><b>התקינו את Friends</b><br><span style="color:var(--label2);font-size:13px">${inAppBrowser() ? 'פתחו בדפדפן Chrome כדי להתקין' : 'אייקון במסך הבית, מסך מלא'}</span></span><button class="btn filled sm" data-a="install">התקנה</button><button class="icon-btn muted sm" data-a="install-hide" aria-label="סגירה">${icon('xmark', 16)}</button></div>` : '') +
  (feed.length ? feed.map(feedCard).join('') + (following().length < 3 ? suggestBox() : '')
    : `<div class="empty">${icon('photo', 56, 1.4)}<b>${following().length ? 'עוד אין פוסטים' : 'ברוכים הבאים ל-Friends'}</b><span>${following().length ? 'החברים שלך עוד לא פרסמו. תהיו הראשונים!' : 'עקבו אחרי חברים כדי לראות כאן את התמונות שלהם.'}</span><div class="btn-row" style="justify-content:center"><button class="btn filled sm" data-a="search">${icon('search', 16)} חיפוש חברים</button><button class="btn tinted sm" data-a="new-photo">פוסט ראשון</button></div></div>` + suggestBox());
}
function suggestBox() {
  if (local()) return '';
  if (!S.suggest) { S.suggest = []; be.searchUsers('').then(l => { S.suggest = l.filter(u => u.id !== me()); softRender(); }).catch(() => {}); }
  const l = S.suggest.filter(u => !isFollowing(u.id)).slice(0, 8);
  if (!l.length) return '';
  return `<div class="section-h">אנשים ב-Friends</div><div class="sugg">${l.map(u => `<div class="sg"><button data-a="user" data-v="${esc(u.id)}" class="sg-u">${avatar(u, 60)}<b>${esc(first(nameOf(u)))}</b><span>${esc(uname(u))}</span></button>${followBtn(u.id)}</div>`).join('')}</div>`;
}
function feedCard(p) {
  const a = S.members[p.authorId] || { id: p.authorId }, likes = p.likes || [], liked = likes.includes(me());
  const ratio = p.w && p.h ? Math.max(.8, Math.min(1.91, p.w / p.h)) : 1;
  return `<article class="ig" id="p-${esc(p.id)}">
    <header class="ig-h"><button class="ig-u" data-a="user" data-v="${esc(p.authorId)}">${avatar(a, 34)}<span class="ig-n"><b>${esc(nameOf(a))}</b><span>${esc(uname(a))}</span></span></button><span class="when">${ago(p.createdAt)}</span><button class="icon-btn muted sm" data-a="post-menu" data-v="${esc(p.id)}" aria-label="אפשרויות">${icon('more', 20)}</button></header>
    <div class="ig-media" data-a="dbl-like" data-v="${esc(p.id)}" style="aspect-ratio:${ratio}"><img data-pid="${esc(p.id)}" src="${pimg[p.id] || p.thumb}" alt="${esc(p.text || 'תמונה')}"><span class="ig-heart">${icon('heartF', 96)}</span></div>
    <div class="ig-act"><button class="icon-btn${liked ? ' liked' : ''}" data-a="like" data-v="${esc(p.id)}" aria-pressed="${liked}" aria-label="לייק">${icon(liked ? 'heartF' : 'heart', 27)}</button><button class="icon-btn" data-a="comments" data-v="${esc(p.id)}" aria-label="תגובות">${icon('comment', 26)}</button><button class="icon-btn" data-a="share-post" data-v="${esc(p.id)}" aria-label="שליחה לחבר/ה">${icon('send', 24)}</button><button class="icon-btn ig-save" data-a="save" data-v="${esc(p.id)}" aria-pressed="${isSaved(p.id)}" aria-label="שמירה">${icon(isSaved(p.id) ? 'bookmarkF' : 'bookmark', 25)}</button></div>
    ${likes.length ? `<div class="ig-likes">${likes.length === 1 ? 'לייק אחד' : likes.length + ' לייקים'}</div>` : ''}
    ${p.text ? `<div class="ig-cap"><b>${esc(first(nameOf(a)))}</b> <span dir="auto">${linkify(p.text)}</span></div>` : ''}
    ${p.commentCount ? `<button class="ig-more" data-a="comments" data-v="${esc(p.id)}">${p.commentCount === 1 ? 'תגובה אחת' : `צפייה בכל ${p.commentCount} התגובות`}</button>` : ''}
  </article>`;
}
// Full-size photos load after the thumbnail is on screen
function loadPostImages() {
  $$('img[data-pid]').forEach(async el => {
    const id = el.dataset.pid; if (pimg[id]) { el.src = pimg[id]; return; }
    if (loadedFull.has('p:' + id)) return; loadedFull.add('p:' + id);
    try { const d = await be.postImage(id); if (d) { pimg[id] = d; $$(`img[data-pid="${CSS.escape(id)}"]`).forEach(x => x.src = d); } } catch (e) { loadedFull.delete('p:' + id); }
  });
}

/* ---------- stories viewer ---------- */
let storyT = null;
function openStories(uid) {
  const { by, others } = storyGroups();
  if (!by[uid]) return;
  const order = uid === me() ? [me()] : others.slice(others.indexOf(uid));
  const list = by[uid], i = Math.max(0, list.findIndex(s => !(s.seen || []).includes(me())));
  S.story = { order, u: 0, i: uid === me() ? 0 : i, by }; renderStory();
}
function renderStory() {
  clearTimeout(storyT);
  let el = $('#story');
  const st = S.story;
  if (!st) { if (el) el.remove(); return; }
  const uid = st.order[st.u], list = st.by[uid] || [], s = list[st.i];
  if (!s) { closeStory(); return; }
  if (uid !== me()) be.seeStory(s.id);
  if (!el) { el = document.createElement('div'); el.id = 'story'; el.className = 'story-v'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'סטורי'); phoneEl.appendChild(el); }
  const u = S.members[uid] || { id: uid };
  el.innerHTML = `<div class="sv-bars">${list.map((x, k) => `<span class="sv-bar"><i class="${k < st.i ? 'done' : k === st.i ? 'run' : ''}"></i></span>`).join('')}</div>
    <div class="sv-top"><button class="sv-u" data-a="story-user" data-v="${esc(uid)}">${avatar(u, 34)}<b>${esc(nameOf(u))}</b><span>${ago(s.createdAt)}</span></button>${uid === me() ? `<button class="icon-btn" data-a="story-del" aria-label="מחיקת הסטורי" style="color:#fff">${icon('trash', 22)}</button>` : ''}<button class="icon-btn" data-a="story-close" aria-label="סגירה" style="color:#fff">${icon('xmark', 24)}</button></div>
    ${s.audio ? `<div class="sv-voice" style="background:${esc(s.bg || STORY_BG[0])}"><span class="sv-wave">${icon('mic', 54, 1.6)}</span>${s.text ? `<b dir="auto">${esc(s.text)}</b>` : ''}<span class="sv-dur">${fmtDur(s.audio.dur || 0)}</span></div><audio id="sv-audio" src="${s.audio.data}" autoplay playsinline></audio>` : `<img class="sv-img" src="${s.image}" alt="">`}
    ${s.text && !s.audio ? `<div class="sv-text" dir="auto">${esc(s.text)}</div>` : ''}
    ${s.close ? `<span class="sv-close-tag">${icon('star', 13)} חברים קרובים</span>` : ''}
    ${uid === me() ? `<div class="sv-seen">${icon('people', 16)} ${(s.seen || []).length} צפו</div>` : `<div class="sv-reply"><div class="sv-reacts">${['❤️', '😂', '😮', '😢', '🔥', '👏'].map(e => `<button data-a="story-react" data-v="${e}" aria-label="תגובה ${e}">${e}</button>`).join('')}</div><form id="sv-form" class="sv-in"><input dir="auto" maxlength="300" placeholder="שליחת הודעה ל${esc(first(nameOf(u)))}…" aria-label="תשובה לסטורי" autocomplete="off"><button aria-label="שליחה">${icon('send', 20)}</button></form></div>`}
    <button class="sv-prev" data-a="story-step" data-v="-1" aria-label="הקודם"></button><button class="sv-next" data-a="story-step" data-v="1" aria-label="הבא"></button>`;
  storyT = setTimeout(() => storyStep(1), s.audio ? Math.min(31, (s.audio.dur || 5) + 1) * 1000 : 5000);
  const au = el.querySelector('#sv-audio'); if (au) au.play().catch(() => {});
  // typing a reply holds the story on screen
  const inp = el.querySelector('#sv-form input');
  if (inp) { inp.onfocus = () => { clearTimeout(storyT); el.classList.add('hold'); }; inp.onblur = () => { el.classList.remove('hold'); if (!inp.value) { clearTimeout(storyT); storyT = setTimeout(() => storyStep(1), 4000); } }; }
}
function storyStep(d) {
  const st = S.story; if (!st) return;
  const list = st.by[st.order[st.u]] || [];
  st.i += d;
  if (st.i >= list.length) { st.u++; st.i = 0; if (st.u >= st.order.length) { closeStory(); return; } }
  else if (st.i < 0) { if (st.u > 0) { st.u--; st.i = (st.by[st.order[st.u]] || []).length - 1; } else st.i = 0; }
  renderStory();
}
function closeStory() { clearTimeout(storyT); const au = $('#sv-audio'); if (au) au.pause(); S.story = null; renderStory(); softRender(); }

/* ---------- videos (YouTube) ---------- */
function videoCard(p, compact) {
  const a = S.members[p.authorId] || { id: p.authorId }, v = p.video || {};
  return `<div class="yt${compact ? ' sm' : ''}"><button class="yt-thumb" data-a="watch" data-v="${esc(p.id)}" aria-label="צפייה: ${esc(p.title || 'סרטון')}"><img src="${v.thumb}" alt=""><span class="yt-dur">${fmtDur(v.dur || 0)}</span></button>
    <div class="yt-meta">${compact ? '' : `<button class="yt-av" data-a="user" data-v="${esc(p.authorId)}" aria-label="${esc(nameOf(a))}">${avatar(a, 38)}</button>`}<button class="yt-txt" data-a="watch" data-v="${esc(p.id)}"><b dir="auto">${esc(p.title || p.text || 'סרטון')}</b><span>${esc(nameOf(a))} · ${views(p.views)} · ${ago(p.createdAt)}</span></button></div></div>`;
}
const views = n => !n ? 'אין צפיות' : n === 1 ? 'צפייה אחת' : n + ' צפיות';
function viewVideos() {
  const all = S.posts.filter(p => p.kind === 'video' && p.video && canSee(p.authorId)), f = S.vfilter || 'all';
  const list = f === 'friends' ? all.filter(p => circle().has(p.authorId))
    : f === 'popular' ? all.slice().sort((a, b) => ((b.views || 0) + 4 * (b.likes || []).length) - ((a.views || 0) + 4 * (a.likes || []).length))
    : f === 'mine' ? all.filter(p => p.authorId === me()) : all;
  return bar({ title: 'סרטונים', trail: `<button class="nb-btn" data-a="new-video" aria-label="העלאת סרטון">${icon('plusSq', 24)}</button>` }) +
  `<div class="chips"><button class="chip shorts-chip" data-a="shorts">${icon('play', 14)} שורטס</button>${[['all', 'הכל'], ['friends', 'מהחברים'], ['popular', 'פופולרי'], ['mine', 'שלי']].map(([k, l]) => `<button class="chip${k === f ? ' on' : ''}" data-a="vfilter" data-v="${k}">${l}</button>`).join('')}</div>` +
  (list.length ? `<div class="yt-list">${list.map(p => videoCard(p)).join('')}</div>`
    : `<div class="empty">${icon('playRect', 56, 1.4)}<b>${f === 'mine' ? 'עוד לא העלית סרטונים' : 'עוד אין סרטונים'}</b><span>סרטון של עד דקה, עם כותרת ותיאור. כולם יכולים לצפות ולעשות לייק.</span><button class="btn filled sm" data-a="new-video">העלאת סרטון</button></div>`);
}
async function openWatch(pid) {
  const p = postById(pid); if (!p || !p.video) { hud('הסרטון לא נמצא', true); return; }
  if (S.screen === 'watch') { S.watch = pid; try { history.replaceState(Object.assign({}, history.state, { watch: pid }), ''); } catch (e) {} render(true); }
  else go('watch', { pid });
  if (!S.viewed) S.viewed = new Set();
  if (!S.viewed.has(pid)) { S.viewed.add(pid); be.viewPost(pid); }
  if (!vcache[p.video.id]) {
    try { vcache[p.video.id] = await dataURLToObjectURL(await be.loadPostVideo(p.video)); }
    catch (e) { hud(e && e.code === 'missing' ? 'הסרטון כבר לא זמין' : 'לא הצלחנו לטעון את הסרטון', true); return; }
    if (S.screen === 'watch' && S.watch === pid) render();
  }
}
function viewWatch() {
  const p = postById(S.watch);
  if (!p || !p.video) return bar({ inline: true, back: 'סרטונים', title: '' }) + `<div class="empty"><b>הסרטון לא נמצא</b><span>אולי הוא נמחק.</span></div>`;
  const a = S.members[p.authorId] || { id: p.authorId }, likes = p.likes || [], liked = likes.includes(me()), src = vcache[p.video.id];
  const more = S.posts.filter(x => x.kind === 'video' && x.video && x.id !== p.id && canSee(x.authorId)).slice(0, 12);
  return bar({ inline: true, back: 'סרטונים', title: '' }) +
  `<div class="yt-player" style="aspect-ratio:${p.video.w && p.video.h ? Math.max(.56, Math.min(1.78, p.video.w / p.video.h)) : 1.78}">${src ? `<video data-keep="v-${esc(p.video.id)}" src="${src}" controls autoplay playsinline></video>` : `<img src="${p.video.thumb}" alt=""><div class="spinner"></div>`}</div>
  <div class="yt-info"><h2 dir="auto">${esc(p.title || 'סרטון')}</h2><span class="sub">${views(p.views)} · ${ago(p.createdAt)}</span>
    <div class="yt-ch"><button class="yt-chn" data-a="user" data-v="${esc(p.authorId)}">${avatar(a, 40)}<span><b>${esc(nameOf(a))}</b><span>${esc(uname(a))}</span></span></button>${followBtn(p.authorId)}</div>
    <div class="yt-acts"><button class="pill-btn${liked ? ' on' : ''}" data-a="like" data-v="${esc(p.id)}" aria-pressed="${liked}">${icon(liked ? 'heartF' : 'heart', 18)} ${likes.length || 'לייק'}</button><button class="pill-btn" data-a="comments" data-v="${esc(p.id)}">${icon('comment', 18)} ${p.commentCount || 'תגובות'}</button><button class="pill-btn" data-a="share-post" data-v="${esc(p.id)}">${icon('send', 17)} שליחה</button><button class="pill-btn${isSaved(p.id) ? ' on' : ''}" data-a="save" data-v="${esc(p.id)}">${icon(isSaved(p.id) ? 'bookmarkF' : 'bookmark', 17)} ${isSaved(p.id) ? 'נשמר' : 'שמירה'}</button>${p.authorId === me() ? `<button class="pill-btn" data-a="post-menu" data-v="${esc(p.id)}" aria-label="מחיקה">${icon('trash', 18)}</button>` : ''}</div>
    ${p.text ? `<div class="yt-desc" dir="auto">${linkify(p.text)}</div>` : ''}</div>
  ${more.length ? `<div class="section-h">עוד סרטונים</div><div class="yt-list">${more.map(x => videoCard(x)).join('')}</div>` : ''}`;
}

/* ---------- profiles ---------- */
async function loadFollowers(uid) {
  if (local()) { S.fcount[uid] = 0; return; }
  try { const l = await be.followers(uid); S.fcount[uid] = l.length; S.flist[uid] = l; await loadUsers(l); softRender(); } catch (e) {}
}
function viewProfilePage(uid, isRoot) {
  const mine = uid === me(), u = mine ? Object.assign({}, S.members[uid], S.user) : (S.members[uid] || { id: uid });
  if (S.fcount[uid] === undefined) { S.fcount[uid] = null; loadFollowers(uid); }
  const visible = canSee(uid);
  const posts = visible ? S.posts.filter(p => p.authorId === uid) : [], photos = posts.filter(p => p.kind === 'photo'), vids = posts.filter(p => p.kind === 'video' && p.video);
  const tab = S.ptab || 'photos', fc = S.fcount[uid];
  const head = isRoot
    ? bar({ title: uname(u) || nameOf(u), trail: `<button class="nb-btn" data-a="create" aria-label="יצירה">${icon('plusSq', 24)}</button><button class="nb-btn" data-a="settings" aria-label="הגדרות">${icon('gear', 24)}</button>` })
    : bar({ inline: true, back: 'חזרה', title: uname(u) || nameOf(u), trail: `<button class="nb-btn" data-a="user-menu" data-v="${esc(uid)}" aria-label="אפשרויות">${icon('more', 24)}</button>` });
  if (!mine && iBlocked(uid)) return head + `<div class="empty">${icon('block', 56, 1.4)}<b>חסמת את ${esc(nameOf(u))}</b><span>לא תראו אחד את השני, ולא תוכלו לשלוח הודעות או להתקשר.</span><button class="btn tinted sm" data-a="block" data-v="${esc(uid)}">ביטול החסימה</button></div>`;
  if (!mine && blocksMe(uid)) return head + `<div class="empty">${icon('block', 56, 1.4)}<b>המשתמש לא זמין</b></div>`;
  return head + `<div class="pf">
    <div class="pf-top">${avatar(u, 88)}<div class="pf-stats"><div><b>${posts.length}</b><span>פוסטים</span></div><button data-a="people-list" data-v="followers:${esc(uid)}"><b>${fc === null || fc === undefined ? '·' : fc}</b><span>עוקבים</span></button><button data-a="people-list" data-v="following:${esc(uid)}"><b>${(u.following || []).length}</b><span>נעקבים</span></button></div></div>
    <div class="pf-name">${esc(nameOf(u))}${u.private ? ` <span class="pf-lock" title="חשבון פרטי">${icon('lock', 15)}</span>` : ''}</div>${u.bio ? `<div class="pf-bio" dir="auto">${linkify(u.bio)}</div>` : ''}
    <div class="pf-btns">${mine ? `<button class="btn tinted sm grow" data-a="edit-profile">עריכת פרופיל</button><button class="btn tinted sm grow" data-a="share-profile">שיתוף פרופיל</button>`
      : `${followBtn(uid, true)}<button class="btn tinted sm grow" data-a="dm" data-v="${esc(uid)}">הודעה</button><button class="btn tinted sm" data-a="call-user" data-v="${esc(uid)}" data-k="audio" aria-label="שיחה קולית">${icon('phone', 18)}</button><button class="btn tinted sm" data-a="call-user" data-v="${esc(uid)}" data-k="video" aria-label="שיחת וידאו">${icon('video', 19)}</button>`}</div>
    ${mine ? `<div class="pf-btns"><button class="btn tinted sm grow" data-a="settings">${icon('shield', 16)} הרשאות</button><button class="btn tinted sm grow" data-a="open-browser">${icon('link', 16)} פתיחה בדפדפן</button></div>` : ''}
  </div>
  <div class="seg pf-seg" role="tablist"><button data-a="ptab" data-v="photos" class="${tab === 'photos' ? 'on' : ''}">${icon('grid', 17)} תמונות</button><button data-a="ptab" data-v="videos" class="${tab === 'videos' ? 'on' : ''}">${icon('playRect', 18)} סרטונים</button>${mine ? `<button data-a="ptab" data-v="saved" class="${tab === 'saved' ? 'on' : ''}">${icon('bookmark', 17)} שמורים</button>` : ''}</div>
  ${!visible ? `<div class="empty">${icon('lock', 56, 1.4)}<b>החשבון הזה פרטי</b><span>${pending(uid) ? 'בקשת המעקב נשלחה. כשיאשרו, תראו את התמונות והסרטונים.' : 'עקבו כדי לבקש לראות את התמונות והסרטונים.'}</span></div>` : tab === 'saved' && mine ? savedGrid() : tab === 'photos'
    ? (photos.length ? `<div class="pgrid">${photos.map(p => `<button class="pg" data-a="open-post" data-v="${esc(p.id)}" aria-label="פוסט"><img src="${p.thumb}" alt="">${(p.likes || []).length ? `<span class="pg-l">${icon('heartF', 12)} ${p.likes.length}</span>` : ''}</button>`).join('')}</div>` : `<div class="empty"><b>אין עדיין תמונות</b>${mine ? '<button class="btn filled sm" data-a="new-photo">פוסט ראשון</button>' : ''}</div>`)
    : (vids.length ? `<div class="yt-grid">${vids.map(p => videoCard(p, true)).join('')}</div>` : `<div class="empty"><b>אין עדיין סרטונים</b>${mine ? '<button class="btn filled sm" data-a="new-video">העלאת סרטון</button>' : ''}</div>`)}`;
}
function profileForm() {
  let photo = S.user.photo || '';
  const fs = formSheet({ title: 'עריכת פרופיל', action: 'שמירה', tall: true,
    body: `<div style="display:grid;justify-items:center;gap:8px;padding:8px 0 4px"><span id="ef-av">${avatar(S.user, 88)}</span><button type="button" class="nb-btn" id="ef-pick">שינוי תמונה</button></div>
      <div class="section-h">שם</div><div class="list"><div class="field"><input id="ef-name" maxlength="40" value="${esc(S.user.name || '')}" aria-label="שם"></div></div>
      <div class="section-h">שם משתמש</div><div class="list"><div class="field"><span class="at" dir="ltr">@</span><input id="ef-un" dir="ltr" maxlength="20" autocapitalize="none" spellcheck="false" value="${esc(S.user.username || '')}" aria-label="שם משתמש"></div></div>
      <div class="section-h">ביו</div><div class="list"><textarea id="ef-bio" class="tt-in" rows="3" maxlength="150" dir="auto" placeholder="משהו עליך…">${esc(S.user.bio || '')}</textarea></div>`,
    async onOk(f) {
      const name = f.querySelector('#ef-name').value.trim(), un = f.querySelector('#ef-un').value.trim().toLowerCase(), bio = f.querySelector('#ef-bio').value.trim();
      if (!name) { hud('השם לא יכול להיות ריק', true); return false; }
      if (un !== (S.user.username || '') && !(await saveUsername(un))) return false;
      await be.saveProfile({ name, bio, photo }); Object.assign(S.user, { name, bio, photo }); S.members[me()] = Object.assign({}, S.members[me()], S.user); hud('הפרופיל נשמר'); render();
    } });
  fs.querySelector('#ef-pick').onclick = () => { S.pickFor = 'avatar'; S.onAvatar = d => { photo = d; fs.querySelector('#ef-av').innerHTML = avatar(Object.assign({}, S.user, { photo: d }), 88); }; fileEl.accept = 'image/*'; fileEl.multiple = false; fileEl.value = ''; fileEl.click(); };
}
async function peopleSheet(kind, uid) {
  const ids = kind === 'followers' ? (S.flist[uid] || []) : ((uid === me() ? S.user : S.members[uid] || {}).following || []);
  await loadUsers(ids);
  const fs = formSheet({ title: kind === 'followers' ? 'עוקבים' : 'נעקבים', tall: true,
    body: ids.length ? `<div class="list av">${ids.map(id => personRow(S.members[id] || { id })).join('')}</div>` : '<div class="empty"><b>הרשימה ריקה</b></div>' });
  wirePeople(fs);
}
const personRow = u => `<div class="row">${avatar(u, 44)}<button class="body pr-open" data-open="${esc(u.id)}" style="text-align:start"><span class="t" style="font-weight:600">${esc(nameOf(u))}${u.private ? ` ${icon('lock', 13)}` : ''}</span><span class="sub">${esc(uname(u))}</span></button>${u.id === me() ? '' : `<button class="btn ${isFollowing(u.id) ? 'tinted' : 'filled'} sm" data-fol="${esc(u.id)}">${followLabel(u.id)}</button>`}</div>`;
function wirePeople(root) {
  root.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { if (closeForm) closeForm(); openUser(b.dataset.open); });
  root.querySelectorAll('[data-fol]').forEach(b => b.onclick = async () => { const on = !isFollowing(b.dataset.fol); await toggleFollow(b.dataset.fol, on); b.className = `btn ${on ? 'tinted' : 'filled'} sm`; b.textContent = followLabel(b.dataset.fol); });
}
function openUser(uid) { if (uid === me()) { go('root', { tab: 'profile' }); return; } S.ptab = 'photos'; loadUsers([uid], true).then(() => softRender()); go('user', { uid }); }
async function toggleFollow(uid, on) {
  if (local()) { hud('מעקב אחרי חברים עובד באתר, אחרי כניסה עם Google', true); return; }
  if (on && isBlockedPair(uid)) { hud('אי אפשר לעקוב: יש חסימה', true); return; }
  haptic(8);
  S.user.following = on ? [...new Set(following().concat(uid))] : following().filter(x => x !== uid);
  if (S.fcount[uid] != null) S.fcount[uid] += on ? 1 : -1;
  softRender();
  // a private account gets a request instead; the follow counts once they approve
  try { await be.follow(uid, on); if (on) sendNotif(uid, { type: isPrivate(uid) ? 'request' : 'follow' }); } catch (e) { fail(e); }
}
function searchSheet() {
  const fs = formSheet({ title: 'חיפוש חברים', tall: true,
    body: `<div class="list"><div class="field">${icon('search', 20)}<input id="srch" dir="auto" autocomplete="off" autocapitalize="none" placeholder="שם משתמש" aria-label="חיפוש לפי שם משתמש" autofocus></div></div><div id="srch-res" style="margin-top:12px"></div>` });
  const inp = fs.querySelector('#srch'), res = fs.querySelector('#srch-res');
  let t = null, n = 0;
  const run = async () => {
    const my = ++n, q = inp.value.trim();
    try {
      const l = (await be.searchUsers(q)).filter(u => u.id !== me());
      if (my !== n) return;
      l.forEach(u => { S.members[u.id] = Object.assign({}, S.members[u.id], u); });
      res.innerHTML = (l.length ? `${q ? '' : '<div class="section-h">אנשים ב-Friends</div>'}<div class="list av">${l.map(personRow).join('')}</div>` : `<div class="empty" style="padding:30px 0"><b>${q ? 'לא נמצא אף אחד' : 'עוד אין אנשים'}</b><span>${q ? 'נסו את שם המשתמש בלי @' : 'הזמינו חברים להצטרף ל-Friends'}</span></div>`) + (q ? '' : exploreGrid());
      wirePeople(res);
      res.querySelectorAll('[data-open-post]').forEach(b => b.onclick = () => { const id = b.dataset.openPost; if (closeForm) closeForm(); setTimeout(() => openPost(id), 350); });
    } catch (e) { res.innerHTML = '<div class="empty"><b>החיפוש לא הצליח</b></div>'; }
  };
  inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 250); });
  run();
}

/* ---------- create: photo post, video, story, groups ---------- */
async function createSheet() {
  const acts = [{ label: '📷 פוסט תמונה', k: 'new-photo' }, { label: '🎬 סרטון', k: 'new-video' }, { label: '⭕ סטורי', k: 'new-story' }, { label: '🎙️ סטורי קולי', k: 'new-voice-story' }, { label: '📅 דף אירוע', k: 'new-event-page' }, { label: '💬 קבוצה', k: 'g:group' }, { label: '🎮 שרת עם ערוצים', k: 'g:server' }, { label: '🎒 קבוצת כיתה', k: 'g:school' }];
  const r = await confirmSheet({ title: 'מה יוצרים?', actions: acts }); const a = acts[r]; if (!a) return;
  if (a.k.startsWith('g:')) groupForm(null, a.k.slice(2)); else A[a.k]();
}
function pickFile(target, accept) { S.pickFor = target; fileEl.accept = accept; fileEl.multiple = false; fileEl.value = ''; fileEl.click(); }
async function pickHook() {
  const t = S.pickFor; if (!['np-photo', 'np-video', 'story', 'avatar', 'cb'].includes(t)) return false;
  const file = fileEl.files[0]; if (!file) return true;
  try {
    if (t === 'np-video') { vprog('מעבד סרטון…', 0); const v = await prepVideo(file, p => vprog('מעבד סרטון…', p)); vprog(null); videoComposer(v); return true; }
    const im = await prepImage(file);
    if (t === 'cb') { if (S.onPick) S.onPick(im); }
    else if (t === 'np-photo') photoComposer(im); else if (t === 'story') storyComposer(im); else if (S.onAvatar) S.onAvatar(im.thumb.data);
  } catch (e) {
    vprog(null); const c = e && e.code;
    if (c === 'long') hud(`אפשר להעלות סרטון של עד ${VIDEO_MAX_SEC} שניות`, true);
    else if (c) hud('הדפדפן הזה לא מצליח לעבד את הסרטון', true); else hud('לא הצלחנו לפתוח את הקובץ', true);
  }
  return true;
}
function photoComposer(im) {
  const fs = formSheet({ title: 'פוסט חדש', action: 'שיתוף', tall: true,
    body: `<div class="cmp-img"><img id="cmp-prev" src="${im.thumb.data}" alt=""></div>${filterChips(im.thumb.data)}<div class="list" style="margin-top:12px"><textarea id="np-text" class="tt-in" rows="3" maxlength="2000" dir="auto" placeholder="כיתוב…"></textarea></div>`,
    async onOk(f) { const text = f.querySelector('#np-text').value.trim(); hud('מפרסם…'); const img = await applyFilter(im, fs.dataset.flt); await be.addPost({ image: img, text }); haptic(12); hud('פורסם'); S.tab = 'home'; if (S.screen !== 'root') go('root', { tab: 'home' }); else render(true); } });
  wireFilters(fs);
}
function videoComposer(v) {
  formSheet({ title: 'סרטון חדש', action: 'העלאה', tall: true,
    body: `<div class="cmp-img vid"><img src="${v.thumb}" alt=""><span class="yt-dur">${fmtDur(v.dur)}</span></div>
      <div class="section-h">כותרת</div><div class="list"><div class="field"><input id="nv-title" maxlength="100" dir="auto" placeholder="על מה הסרטון?" autofocus></div></div>
      <div class="section-h">תיאור</div><div class="list"><textarea id="nv-text" class="tt-in" rows="3" maxlength="2000" dir="auto" placeholder="לא חובה"></textarea></div>`,
    async onOk(f) {
      const title = f.querySelector('#nv-title').value.trim(), text = f.querySelector('#nv-text').value.trim();
      if (!title) { hud('תנו לסרטון כותרת', true); f.querySelector('#nv-title').focus(); return false; }
      setTimeout(async () => {
        vprog('מעלה סרטון…', 0);
        try { const pid = await be.addPost({ video: v, title, text }, p => vprog('מעלה סרטון…', p)); haptic(12); hud('הסרטון עלה'); vprog(null); S.vfilter = 'mine'; go('root', { tab: 'videos' }); }
        catch (e) { vprog(null); fail(e); }
      }, 50);
    } });
}
function storyComposer(im) {
  const fs = formSheet({ title: 'סטורי חדש', action: 'שיתוף', tall: true,
    body: `<div class="cmp-img story"><img id="cmp-prev" src="${im.full.data}" alt=""></div>${filterChips(im.thumb.data)}<div class="list" style="margin-top:12px"><div class="field"><input id="ns-text" maxlength="120" dir="auto" placeholder="טקסט על הסטורי (לא חובה)"></div></div>${closeToggle()}<p class="section-f">הסטורי נעלם אחרי 24 שעות.</p>`,
    async onOk(f) { const img = await applyFilter(im, fs.dataset.flt); await be.addStory(img, f.querySelector('#ns-text').value.trim(), closeExtra(f)); haptic(12); hud('הסטורי עלה'); } });
  wireFilters(fs);
}
async function sharePost(p) {
  if (local()) { hud('שליחה לחברים עובדת באתר, אחרי כניסה עם Google', true); return; }
  const ids = [...new Set(following().concat(S.chats.map(otherOf)))].filter(i => i && i !== me());
  await loadUsers(ids);
  if (!ids.length) { hud('עקבו אחרי חברים כדי לשלוח להם', true); return; }
  const r = await confirmSheet({ title: 'שליחה ל…', actions: ids.map(i => ({ label: nameOf(S.members[i]) })) });
  if (r < 0) return;
  try {
    const cid = await be.openChat(ids[r]), link = location.origin + location.pathname + '?p=' + p.id;
    await be.sendMessage({ t: 'c', id: cid }, { image: p.kind === 'video' ? p.video.thumb : p.thumb, text: `${p.kind === 'video' ? '🎬 ' + (p.title || 'סרטון') : '📷 פוסט'} של ${nameOf(S.members[p.authorId])}\n${link}`, share: { pid: p.id } });
    hud('נשלח');
  } catch (e) { fail(e); }
}
function openPost(pid) {
  const p = postById(pid); if (!p) { hud('הפוסט לא נמצא', true); return; }
  if (p.kind === 'video') { openWatch(pid); return; }
  formSheet({ title: 'פוסט', tall: true, body: `<div class="post-sheet">${feedCard(p)}</div>` });
  loadPostImages();
}

/* ---------- comments on posts ---------- */
function openComments(pid) {
  S.comments = { pid, list: [] };
  const fs = formSheet({ title: 'תגובות', tall: true, body: '<div class="cmts" id="cmts"><div class="loading" style="min-height:120px"><div class="spinner"></div></div></div>',
    footer: `<form id="cmt-form" class="cmt-bar"><textarea id="cmt-in" rows="1" placeholder="הוספת תגובה" aria-label="תגובה" dir="auto"></textarea><button class="send" aria-label="שליחת תגובה">${icon('send', 18)}</button></form>`,
    onClose() { if (unsub.comments) unsub.comments(); unsub.comments = null; S.comments = null; } });
  unsub.comments = be.watchPostComments(pid, async list => {
    if (!S.comments) return; S.comments.list = list;
    await loadUsers(list.map(c => c.authorId));
    const box = fs.querySelector('#cmts'), p = postById(pid); if (!box) return;
    box.innerHTML = list.filter(c => !isBlockedPair(c.authorId)).map(c => { const a = S.members[c.authorId] || { id: c.authorId }; return `<div class="cmt">${avatar(a, 32)}<div style="flex:1;min-width:0"><div class="cb"><b>${esc(nameOf(a))}</b><p dir="auto">${linkify(c.text)}</p></div><div class="ct">${ago(c.createdAt)}${c.authorId === me() || (p && p.authorId === me()) ? ` · <button style="color:var(--red);font-size:12px" data-a="del-comment" data-v="${esc(c.id)}">מחיקה</button>` : ''}</div></div></div>`; }).join('') || '<div class="empty" style="padding:30px 0"><b>עוד אין תגובות</b><span>תהיו הראשונים להגיב.</span></div>';
    const fb = fs.querySelector('.fb'); fb.scrollTop = fb.scrollHeight;
  }, fail);
  setTimeout(() => { const t = fs.querySelector('#cmt-in'); if (t) t.focus({ preventScroll: true }); }, 380);
}

/* ---------- chats: private chats, groups, servers and classes in one list ---------- */
function viewChats() {
  const f = S.cfilter || 'all';
  const rows = [];
  if (f !== 'groups') S.chats.forEach(c => rows.push({ at: c.lastAt || 0, html: dmRow(c) }));
  if (f !== 'dms') S.groups.forEach(g => rows.push({ at: g.lastAt || 0, html: groupRow(g) }));
  rows.sort((a, b) => b.at - a.at);
  return bar({ title: 'צ׳אטים', trail: `<button class="nb-btn" data-a="join" aria-label="הצטרפות עם קוד">${icon('key', 22)}</button><button class="nb-btn" data-a="new-chat" aria-label="צ׳אט חדש">${icon('compose', 24)}</button>` }) +
  `<div class="chips">${[['all', 'הכל'], ['dms', 'פרטיים'], ['groups', 'קבוצות ושרתים']].map(([k, l]) => `<button class="chip${k === f ? ' on' : ''}" data-a="cfilter" data-v="${k}">${l}</button>`).join('')}</div>` +
  (local() && f !== 'groups' ? `<div class="tip">${icon('info', 22)}<span class="body">הודעות פרטיות ושיחות עובדות באתר, אחרי כניסה עם Google. קבוצות ושרתים אפשר לנסות כאן.</span></div>` : '') +
  (rows.length ? `<div class="list av" style="--inset:80px">${rows.map(r => r.html).join('')}</div>`
    : `<div class="empty">${icon('chats', 56, 1.4)}<b>עוד אין צ׳אטים</b><span>הודעה לחבר/ה, קבוצה, שרת עם ערוצים או קבוצת כיתה.</span><div class="btn-row" style="justify-content:center"><button class="btn filled sm" data-a="new-chat">צ׳אט חדש</button><button class="btn tinted sm" data-a="create">קבוצה או שרת</button></div></div>`);
}
function dmRow(c) {
  const o = S.members[otherOf(c)] || { id: otherOf(c) }, un = chatUnread(c), typ = typingNames(c.typing, [otherOf(c)]);
  return `<button class="row" data-a="open-chat" data-v="${esc(c.id)}" style="padding:10px 16px">${avatar(o, 52)}<span class="body"><span class="t" style="font-weight:600">${esc(nameOf(o))}${isMuted(c.id) ? ` <span class="mute-ic">${icon('bellOff', 14)}</span>` : ''}</span><span class="sub${typ ? ' acc' : ''}" dir="auto">${typ ? 'מקליד/ה…' : (c.lastBy === me() ? 'את/ה: ' : '') + esc(c.lastMessage || 'צ׳אט חדש')}</span></span><span class="when${un ? ' un' : ''}">${c.lastAt ? listTime(c.lastAt) : ''}${un ? '<span class="udot"></span>' : ''}</span></button>`;
}
function groupRow(g) {
  const un = groupUnread(g);
  return `<button class="row" data-a="open" data-v="${esc(g.id)}" style="padding:10px 16px">${gtile(g)}<span class="body"><span class="t" style="font-weight:600">${esc(g.name)}<span class="badge">${TYPES[gtype(g)][0]}</span>${isMuted(g.id) ? ` <span class="mute-ic">${icon('bellOff', 14)}</span>` : ''}</span><span class="sub" dir="auto">${esc(g.lastMessage || `${g.members.length} חברים`)}</span></span><span class="when${un ? ' un' : ''}">${g.lastAt ? listTime(g.lastAt) : ''}${un ? '<span class="udot"></span>' : ''}</span></button>`;
}
function newChatSheet() {
  if (local()) { hud('הודעות פרטיות זמינות באתר, אחרי כניסה עם Google', true); return; }
  const ids = [...new Set(following().concat(allMemberIds()))].filter(i => i !== me()).sort((a, b) => nameOf(S.members[a]).localeCompare(nameOf(S.members[b]), 'he'));
  const fs = formSheet({ title: 'צ׳אט חדש', tall: true,
    body: (ids.length ? `<div class="section-h">החברים שלך</div><div class="list av">${ids.map(id => { const u = S.members[id] || { id }; return `<div class="row">${avatar(u, 40)}<span class="body"><span class="t">${esc(nameOf(u))}</span><span class="sub">${esc(uname(u))}</span></span><button class="icon-btn" data-call="audio" data-u="${esc(id)}" aria-label="שיחה קולית עם ${esc(nameOf(u))}">${icon('phone', 21)}</button><button class="icon-btn" data-call="video" data-u="${esc(id)}" aria-label="שיחת וידאו עם ${esc(nameOf(u))}">${icon('video', 22)}</button><button class="icon-btn" data-dm="${esc(id)}" aria-label="הודעה ל${esc(nameOf(u))}">${icon('chat', 22)}</button></div>`; }).join('')}</div>`
      : `<div class="empty"><b>עוד אין עם מי לדבר</b><span>עקבו אחרי חברים, והם יופיעו כאן.</span></div>`) + `<div class="btn-row"><button type="button" class="btn tinted block" id="nc-search">${icon('search', 18)} חיפוש לפי שם משתמש</button></div>` });
  fs.querySelectorAll('[data-dm]').forEach(b => b.onclick = () => { closeForm && closeForm(); startDM(b.dataset.dm); });
  fs.querySelectorAll('[data-call]').forEach(b => b.onclick = () => { closeForm && closeForm(); startCall(b.dataset.u, b.dataset.call); });
  fs.querySelector('#nc-search').onclick = () => { closeForm && closeForm(); setTimeout(searchSheet, 350); };
}
async function startDM(uid) {
  if (isBlockedPair(uid)) { hud(iBlocked(uid) ? 'חסמת את המשתמש הזה. אפשר לבטל בפרופיל שלו' : 'המשתמש לא זמין', true); return; }
  try { const cid = await be.openChat(uid); go('chat', { cid }); }
  catch (e) { if (e && e.code === 'local') hud('הודעות פרטיות זמינות באתר, אחרי כניסה עם Google', true); else fail(e); }
}

/* ---------- a group / server / class ---------- */
function viewGroup(g) {
  const t = gtype(g), ch = (g.channels || []).find(c => c.id === S.ch) || { id: 'main', name: 'כללי' };
  const title = S.gtab === 'chat' && t !== 'group'
    ? `<button class="nb-tbtn" data-a="group-tab" data-v="channels"><span class="ch-hash">#</span><span class="ell">${esc(ch.name)}</span></button>`
    : `<button class="nb-tbtn" data-a="group-info"><span>${esc(g.emoji)}</span><span class="ell">${esc(g.name)}</span></button>`;
  const add = { events: ['new-event', 'אירוע חדש'], album: ['pick', 'הוספת תמונות', 'album'], school: ['school-add', 'הוספה'], channels: isOwner(g) ? ['new-channel', 'ערוץ חדש'] : null }[S.gtab];
  const trail = (add ? `<button class="nb-btn" data-a="${add[0]}"${add[2] ? ` data-v="${add[2]}"` : ''} aria-label="${add[1]}">${icon('plus', 24, 2.2)}</button>` : '') + `<button class="nb-btn" data-a="gcall-start" aria-label="שיחה קבוצתית">${icon('phone', 22)}</button><button class="nb-btn" data-a="group-info" aria-label="פרטים">${icon('info', 23)}</button>`;
  return bar({ inline: true, back: 'צ׳אטים', titleHtml: title, trail }) + ({ chat: viewGroupChat, channels: viewChannels, events: viewEvents, album: viewAlbum, school: viewSchool }[S.gtab] || viewGroupChat)(g);
}
function viewChannels(g) {
  const chs = g.channels || DEFAULT_CHANNELS.group;
  return `<div class="srv-head">${gtile(g, 'lg')}<div class="srv-t"><b>${esc(g.name)}</b><span>${TYPES[gtype(g)][0]} · ${g.members.length} חברים</span></div><button class="btn tinted sm" data-a="share-invite">${icon('share', 16)} הזמנה</button></div>
  <div class="section-h">ערוצי טקסט</div>
  <div class="list">${chs.map(c => `<button class="row ch-row${c.id === S.ch ? ' on' : ''}" data-a="open-channel" data-v="${esc(c.id)}"><span class="ch-hash">#</span><span class="body t">${esc(c.name)}</span>${isOwner(g) && c.id !== 'main' ? `<span class="icon-btn muted sm" data-a="channel-menu" data-v="${esc(c.id)}" role="button" aria-label="אפשרויות לערוץ">${icon('more', 18)}</span>` : ''}<span class="chev">${icon('chev', 16)}</span></button>`).join('')}
  ${isOwner(g) ? `<button class="row" data-a="new-channel">${icon('plus', 20)}<span class="body t acc">ערוץ חדש</span></button>` : ''}</div>
  <div class="section-h">חברים · ${g.members.length}</div>
  <div class="list av">${g.members.map(id => { const m = S.members[id] || { id }; return `<${id !== me() ? 'button' : 'div'} class="row"${id !== me() ? ` data-a="member" data-v="${esc(id)}"` : ''}>${avatar(m, 36)}<span class="body"><span class="t">${esc(nameOf(m))}${id === g.ownerId ? ' 👑' : ''}</span><span class="sub">${esc(uname(m))}</span></span></${id !== me() ? 'button' : 'div'}>`; }).join('')}</div>`;
}
function channelForm(c) {
  const g = group();
  formSheet({ title: c ? 'שינוי שם הערוץ' : 'ערוץ חדש', action: c ? 'שמירה' : 'יצירה',
    body: `<div class="list"><div class="field"><span class="ch-hash">#</span><input id="cf-name" maxlength="30" dir="auto" placeholder="שם הערוץ" value="${esc(c ? c.name : '')}" autofocus></div></div>`,
    async onOk(f) {
      const name = f.querySelector('#cf-name').value.trim().replace(/\s+/g, '-'); if (!name) { hud('תנו שם לערוץ', true); return false; }
      const chs = (g.channels || DEFAULT_CHANNELS.group).map(x => Object.assign({}, x));
      if (c) chs.find(x => x.id === c.id).name = name; else chs.push({ id: Math.random().toString(36).slice(2, 9), name });
      await be.updateGroup(g, { channels: chs }); hud(c ? 'נשמר' : 'הערוץ נוצר');
    } });
}
function openChannel(chId) {
  S.ch = chId; S.gtab = 'chat'; S.reply = null; S.anim = 'fade';
  try { history.replaceState(Object.assign({}, history.state, { gtab: 'chat', ch: chId }), ''); } catch (e) {}
  watchChannel(); render(true);
}
function inviteLink(g) { return location.origin + location.pathname + '?join=' + g.inviteCode; }
function viewGroupInfo(g) {
  const u = S.user, owner = isOwner(g), ids = g.members.slice().sort((a, b) => (b === g.ownerId) - (a === g.ownerId));
  return bar({ inline: true, back: g.name, titleHtml: 'פרטים' }) +
  `<div class="invite">${gtile(g, 'lg')}<b style="font-size:22px">${esc(g.name)}</b><span class="pill">${TYPES[gtype(g)][1]} ${TYPES[gtype(g)][0]}</span><span class="eyebrow">קוד הזמנה</span><span class="code">${esc(g.inviteCode)}</span>
    <span style="color:var(--label2);font-size:14px;max-width:32ch">שלחו את הקישור לחברים. הם נכנסים עם Google ומצטרפים.</span>
    <div class="btn-row" style="width:100%"><button class="btn filled" data-a="share-invite">${icon('share', 18)} שליחת הזמנה</button><button class="btn tinted" data-a="copy-invite">${icon('link', 18)} העתקה</button></div></div>
  <div class="section-h">התראות</div><div class="list"><label class="row">${icon('bellOff', 22)}<span class="body"><span class="t">השתקת הקבוצה</span><span class="sub">לא יגיעו התראות על הודעות (שיחות כן)</span></span><input type="checkbox" class="sw" data-c="mute" data-v="${esc(g.id)}" ${isMuted(g.id) ? 'checked' : ''}></label></div>
  <div class="section-h">${g.members.length} חברים</div>
  <div class="list av">${owner && !local() ? `<button class="row" data-a="add-friends">${icon('plus', 22)}<span class="body t acc">הוספת חברים</span></button>` : ''}${ids.map(id => { const m = S.members[id] || { id }; return `<${id !== u.id ? 'button' : 'div'} class="row"${id !== u.id ? ` data-a="member" data-v="${esc(id)}"` : ''}>${avatar(m, 40)}<span class="body"><span class="t">${esc(nameOf(m))}${id === u.id ? ' <span style="color:var(--label2)">(את/ה)</span>' : ''}</span><span class="sub">${id === g.ownerId ? 'מנהל/ת · ' : ''}${esc(uname(m))}</span></span>${id !== u.id ? `<span class="chev">${icon('chev', 16)}</span>` : ''}</${id !== u.id ? 'button' : 'div'}>`; }).join('')}</div>
  ${owner ? `<div class="section-h">ניהול</div><div class="list"><button class="row blue" data-a="edit-group">עריכת שם, סוג, אייקון וצבע</button><button class="row blue" data-a="vanish-group">הודעות נעלמות: ${g.vanish ? vanishLabel(g.vanish) : 'כבוי'}</button><button class="row blue" data-a="new-code">החלפת קוד ההזמנה</button><button class="row red" data-a="delete-group">מחיקה</button></div>
    <p class="section-f">החלפת הקוד מבטלת את הקישור הישן. מי שכבר בפנים נשאר.</p>`
  : `<div class="section-h"></div><div class="list"><button class="row red" data-a="leave-group">יציאה</button></div>`}`;
}
function groupForm(g, presetType) {
  let color = g ? g.color : 'blue', type = g ? gtype(g) : (presetType || 'group'), emoji = g ? g.emoji : TYPES[type][1];
  const picked = new Set();
  const friends = g ? [] : following().filter(i => i !== me());
  const fs = formSheet({ title: g ? 'עריכה' : TYPES[type][0] + ' חדשה', action: g ? 'שמירה' : 'יצירה', tall: true,
    body: `<div style="display:flex;justify-content:center;padding:10px 0 4px" id="gf-prev"></div>
      <div class="section-h">סוג</div><div class="seg gtype" role="group" aria-label="סוג">${Object.entries(TYPES).map(([k, [l, e]]) => `<button type="button" data-t="${k}" class="${k === type ? 'on' : ''}">${e} ${l}</button>`).join('')}</div>
      <p class="section-f" id="gf-type-f"></p>
      <div class="section-h">שם</div><div class="list"><div class="field"><input id="gf-name" maxlength="40" placeholder="למשל: החבר׳ה" value="${esc(g ? g.name : '')}" aria-label="שם" autofocus></div></div>
      <div class="section-h">אייקון</div><div class="emojis">${['💬', '🎮', '🎒', '🔥', '⚽', '🎵', '🎨', '📚', '🍕', '🚀', '😎', '🌟'].map(e => `<button type="button" data-e="${e}" aria-pressed="${e === emoji}" aria-label="אייקון ${e}">${e}</button>`).join('')}</div>
      <div class="section-h">צבע</div><div class="colors">${COLORS.map(c => `<button type="button" data-c="${c}" style="--c:var(--g-${c})" aria-pressed="${c === color}" aria-label="צבע ${c}"></button>`).join('')}</div>
      ${friends.length ? `<div class="section-h">להוסיף חברים</div><div class="list av">${friends.map(id => { const u = S.members[id] || { id }; return `<label class="row">${avatar(u, 36)}<span class="body t">${esc(nameOf(u))}</span><input type="checkbox" data-f="${esc(id)}" class="ck"></label>`; }).join('')}</div>` : ''}`,
    async onOk(f) {
      const name = f.querySelector('#gf-name').value.trim();
      if (!name) { hud('תנו שם', true); f.querySelector('#gf-name').focus(); return false; }
      if (g) {
        const p = { name, emoji, color, type };
        if (type !== 'group' && (!g.channels || g.channels.length < 2)) p.channels = DEFAULT_CHANNELS[type];
        await be.updateGroup(g, p); hud('נשמר');
      } else {
        const gid = await be.createGroup({ name, emoji, color, type, channels: DEFAULT_CHANNELS[type], members: [...picked] });
        haptic(15); hud(TYPES[type][0] + ' נוצרה'); setTimeout(() => go('group', { gid }), 300);
      }
    } });
  const prev = () => { fs.querySelector('#gf-prev').innerHTML = gtile({ emoji, color }, 'lg'); }; prev();
  const syncType = () => {
    fs.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x.dataset.t === type));
    fs.querySelector('#gf-type-f').textContent = { group: 'צ׳אט אחד לכולם, עם אירועים ואלבום.', server: 'כמו בדיסקורד: כמה ערוצים, כל אחד לנושא אחר.', school: 'ערוצים + לשונית "לימודים": מערכת שעות, שיעורי בית, מבחנים.' }[type];
  };
  fs.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { type = b.dataset.t; if (!g) { emoji = TYPES[type][1]; prev(); fs.querySelectorAll('[data-e]').forEach(x => x.setAttribute('aria-pressed', x.dataset.e === emoji)); } syncType(); });
  fs.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { emoji = b.dataset.e; fs.querySelectorAll('[data-e]').forEach(x => x.setAttribute('aria-pressed', x === b)); prev(); });
  fs.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { color = b.dataset.c; fs.querySelectorAll('[data-c]').forEach(x => x.setAttribute('aria-pressed', x === b)); prev(); });
  fs.querySelectorAll('[data-f]').forEach(c => c.onchange = () => { if (c.checked) picked.add(c.dataset.f); else picked.delete(c.dataset.f); });
  syncType();
}
async function addFriendsSheet() {
  const g = group(); if (!g) return;
  const ids = following().filter(i => !g.members.includes(i));
  await loadUsers(ids);
  if (!ids.length) { hud('כל החברים שלך כבר כאן', true); return; }
  const picked = new Set();
  formSheet({ title: 'הוספת חברים', action: 'הוספה', tall: true,
    body: `<div class="list av">${ids.map(id => { const u = S.members[id] || { id }; return `<label class="row">${avatar(u, 36)}<span class="body t">${esc(nameOf(u))}</span><input type="checkbox" class="ck" data-f="${esc(id)}"></label>`; }).join('')}</div>`,
    async onOk(f) { f.querySelectorAll('[data-f]').forEach(c => { if (c.checked) picked.add(c.dataset.f); }); if (!picked.size) return false; await be.addMembers(g.id, [...picked]); hud(picked.size === 1 ? 'נוסף/ה' : `${picked.size} חברים נוספו`); } });
}

/* ---------- settings ---------- */
function settingsSheet() {
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  refreshPerms();
  const fs = formSheet({ title: 'הגדרות', tall: true,
    body: `${privacySection()}<div class="section-h">הרשאות</div><div id="perm-box">${permsHTML()}</div>
      <p class="section-f">${perm === 'granted' ? 'ההתראות מגיעות כש-Friends פתוח או ברקע. ' : ''}משהו חסום? "איך משחררים" מראה בדיוק איפה בהגדרות הטלפון, ו"פתיחה בדפדפן" למטה פותח את Friends בדפדפן.</p>
      ${canOfferInstall() ? `<div class="section-h"></div><div class="list"><button class="row" data-a="install">${icon('sparkles', 22)}<span class="body t">הוספה למסך הבית</span><span class="chev">${icon('chev', 16)}</span></button></div>` : ''}
      ${browserSection()}
      <div class="section-h"></div><div class="list"><button class="row red" data-a="sign-out">התנתקות</button></div>
      <p class="section-f" style="text-align:center;padding-top:20px">Friends · הרשת של החברים</p>` });
  return fs;
}

/* ---------- the Friends actions ---------- */
Object.assign(A, {
  'root-tab': b => {
    const v = b.dataset.v;
    if (v === 'create') { createSheet(); return; }
    if (S.tab === v) { scrollTo(0); return; }
    S.tab = v; S.anim = 'fade'; try { history.replaceState({ screen: 'root', tab: S.tab }, ''); } catch (e) {} render(true);
  },
  gtab: b => {
    if (S.gtab === b.dataset.v) { scrollTo(S.gtab === 'chat' ? scrollMax() : 0); return; }
    S.gtab = b.dataset.v; S.reply = null; if (S.gtab === 'chat') markGroupChatSeen(); S.anim = 'fade';
    try { history.replaceState(Object.assign({}, history.state, { gtab: S.gtab }), ''); } catch (e) {}
    render(true);
  },
  'group-tab': b => A.gtab(b),
  create: () => createSheet(),
  search: () => searchSheet(),
  settings: () => settingsSheet(),
  'new-photo': () => pickFile('np-photo', 'image/*'),
  'new-video': () => pickFile('np-video', 'video/*'),
  'new-story': () => pickFile('story', 'image/*'),
  'new-voice-story': () => voiceStoryComposer(),
  'new-group': () => groupForm(null),
  'story-open': b => openStories(b.dataset.v),
  'story-step': b => storyStep(+b.dataset.v),
  'story-close': () => closeStory(),
  'story-user': b => { const u = b.dataset.v; closeStory(); openUser(u); },
  'story-del': async () => {
    const st = S.story; if (!st) return; const s = (st.by[st.order[st.u]] || [])[st.i]; if (!s) return;
    clearTimeout(storyT);
    if (await confirmSheet({ title: 'למחוק את הסטורי?', actions: [{ label: 'מחיקה', destructive: true }] }) === 0) { try { await be.deleteStory(s.id); hud('הסטורי נמחק'); } catch (e) { fail(e); } closeStory(); }
    else renderStory();
  },
  user: b => openUser(b.dataset.v),
  follow: b => toggleFollow(b.dataset.v, !isFollowing(b.dataset.v)),
  'people-list': b => { const [k, uid] = b.dataset.v.split(':'); peopleSheet(k, uid); },
  'edit-profile': () => profileForm(),
  'share-profile': () => { const u = S.user; copyText(`עקבו אחריי ב-Friends: ${uname(u)}\n${location.origin + location.pathname}`); },
  ptab: b => { S.ptab = b.dataset.v; render(); },
  vfilter: b => { S.vfilter = b.dataset.v; render(); },
  cfilter: b => { S.cfilter = b.dataset.v; render(); },
  watch: b => openWatch(b.dataset.v),
  'open-post': b => openPost(b.dataset.v),
  like: async b => {
    const p = postById(b.dataset.v); if (!p) return;
    const on = !(p.likes || []).includes(me()); haptic(on ? 10 : 4);
    p.likes = on ? (p.likes || []).concat(me()) : p.likes.filter(x => x !== me()); render();
    if (on) sendNotif(p.authorId, { type: p.kind === 'video' ? 'vlike' : 'like', pid: p.id });
    try { await be.likePost(p, on); } catch (e) { fail(e); }
  },
  'dbl-like': b => {
    const now = Date.now(), id = b.dataset.v;
    if (S.lastTap && S.lastTap.id === id && now - S.lastTap.t < 320) {
      S.lastTap = null; const h = b.querySelector('.ig-heart'); if (h) { h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop'); }
      const p = postById(id); if (p && !(p.likes || []).includes(me())) A.like({ dataset: { v: id } });
    } else S.lastTap = { id, t: now };
  },
  comments: b => openComments(b.dataset.v),
  'del-comment': async b => { const pid = S.comments && S.comments.pid; if (!pid) return; try { await be.deletePostComment(pid, b.dataset.v); } catch (e) { fail(e); } },
  'share-post': b => { const p = postById(b.dataset.v); if (p) sharePost(p); },
  'post-menu': async b => {
    const p = postById(b.dataset.v); if (!p) return;
    if (p.authorId !== me()) { postSafetyMenu(p); return; }
    if (await confirmSheet({ title: p.kind === 'video' ? 'למחוק את הסרטון?' : 'למחוק את הפוסט?', actions: [{ label: 'מחיקה', destructive: true }] }) === 0) {
      try { await be.deletePost(p); if (closeForm) closeForm(); hud('נמחק'); if (S.screen === 'watch') back(); } catch (e) { fail(e); }
    }
  },
  'call-user': b => startCall(b.dataset.v, b.dataset.k || 'audio'),
  'open-channel': b => openChannel(b.dataset.v),
  'new-channel': () => channelForm(null),
  'channel-menu': async b => {
    const g = group(); if (!g) return; const c = (g.channels || []).find(x => x.id === b.dataset.v); if (!c) return;
    const r = await confirmSheet({ title: '#' + c.name, actions: [{ label: 'שינוי שם' }, { label: 'מחיקת הערוץ', destructive: true }] });
    if (r === 0) channelForm(c);
    if (r === 1 && await confirmSheet({ title: `למחוק את #${c.name}?`, msg: 'הערוץ ייעלם מהרשימה.', actions: [{ label: 'מחיקה', destructive: true }] }) === 0) {
      try { await be.updateGroup(g, { channels: g.channels.filter(x => x.id !== c.id) }); if (S.ch === c.id) { S.ch = 'main'; watchChannel(); } hud('הערוץ נמחק'); } catch (e) { fail(e); }
    }
  },
  'add-friends': () => addFriendsSheet(),
  attach: async () => {
    const acts = [{ label: '📷 תמונה', k: 'pick' }, { label: '🎬 סרטון (עד דקה)', k: 'pick-video' }, { label: '📊 סקר', k: 'chat-poll' }, { label: '📍 המיקום שלי', k: 'chat-loc' }, { label: '😺 מדבקה', k: 'chat-sticker' }];
    const r = await confirmSheet({ actions: acts }); const a = acts[r]; if (!a) return;
    A[a.k]({ dataset: { v: 'chat' } });
  },
  'share-invite': async () => {
    const g = group(), url = inviteLink(g), text = `הצטרפו ל"${g.name}" ב-Friends. קוד ההזמנה: ${g.inviteCode}`;
    if (navigator.share) { try { await navigator.share({ title: 'הזמנה ל-Friends', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    copyText(text + '\n' + url);
  },
  'install-hide': () => { LS.set('friends.noInstall', 1); render(); }
});
Object.assign(F, {
  'uname-form': async () => { if (await saveUsername($('#un-in').value)) { S.anim = 'fade'; render(true); } },
  'cmt-form': async f => { const el = f.querySelector('#cmt-in'), t = el.value.trim(); if (!t || !S.comments) return; el.value = ''; grow(el); try { await be.addPostComment(S.comments.pid, t); const p = postById(S.comments.pid); if (p) sendNotif(p.authorId, { type: 'comment', pid: p.id, text: t.slice(0, 80) }); } catch (e) { el.value = t; fail(e); } }
});

document.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b && A[b.dataset.a]) { e.preventDefault(); A[b.dataset.a](b); } });
document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.list) { // add an item to a shared list
    const inp = f.querySelector('input'), t = inp.value.trim(), l = listOf(f.dataset.list); if (!t || !l) return;
    inp.value = '';
    try { await be.saveList(S.gid, l.id, (l.items || []).concat({ id: Math.random().toString(36).slice(2, 9), t, d: false, by: me() })); const n = document.getElementById(inp.id); if (n) n.focus({ preventScroll: true }); } catch (x) { inp.value = t; fail(x); }
    return;
  }
  const fn = F[f.id]; if (fn) fn(f);
});
// switches (checkboxes) act on change; the click handler above would cancel their toggle
document.addEventListener('change', e => { const el = e.target; if (el && el.dataset && el.dataset.c && A[el.dataset.c]) A[el.dataset.c](el); });
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset && el.dataset.draft) { S.drafts[el.dataset.draft] = el.value; updateSend(); if (el.id === 'chat-in' && el.value) sentTyping(); }
  if (el.dataset && el.dataset.poll !== undefined && S.poll) S.poll.options[+el.dataset.poll] = el.value;
  if (el.tagName === 'TEXTAREA') grow(el);
});
document.addEventListener('keydown', e => {
  const t = e.target;
  if (e.key === 'Enter' && !e.shiftKey && t && (t.id === 'chat-in' || t.id === 'cmt-in') && !e.isComposing && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); t.form.requestSubmit(); }
  if (e.key === 'Escape') { if (S.viewer) A['viewer-close'](); else if (closeForm) closeForm(); else { const c = sheetEl.querySelector('.cancel'); if (c) c.click(); } }
  if (S.viewer && !S.viewer.src && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) A['viewer-step']({ dataset: { v: e.key === 'ArrowLeft' ? '1' : '-1' } });
});
fileEl.addEventListener('change', async () => {
  if (await pickHook()) return;
  if (S.pickFor && S.pickFor.endsWith('-video')) {
    const file = fileEl.files[0], target = S.pickFor.replace('-video', ''); if (!file) return;
    try {
      vprog('מעבד סרטון…', 0);
      const vid = await prepVideo(file, p => vprog('מעבד סרטון…', p));
      if (target === 'post') { S.vid = vid; S.img = null; S.poll = null; vprog(null); render(); return; }
      vprog('שולח סרטון…');
      const k = draftKey(), cap = (S.drafts[k] || '').trim(); S.drafts[k] = '';
      await send(Object.assign({ video: vid }, cap ? { text: cap } : {}));
    } catch (e) {
      const c = e && e.code;
      if (c === 'long') hud(`אפשר לשלוח סרטון של עד ${VIDEO_MAX_SEC} שניות`, true);
      else if (c === 'unsupported' || c === 'decode' || c === 'type') hud('הדפדפן הזה לא מצליח לעבד את הסרטון', true);
      else if (c !== 'local') fail(e);
    } finally { vprog(null); }
    return;
  }
  const files = [...fileEl.files].filter(f => f.type.startsWith('image/')); if (!files.length) return;
  if (S.pickFor === 'post') { try { S.img = await prepImage(files[0]); render(); const t = $('#post-text'); if (t) t.focus({ preventScroll: true }); } catch (e) { hud('לא הצלחנו לפתוח את התמונה', true); } return; }
  if (S.pickFor === 'chat') {
    try {
      const im = await chatImage(files[0]), k = draftKey(), cap = (S.drafts[k] || '').trim();
      S.drafts[k] = '';
      await send(Object.assign({ image: im.data, w: im.w, h: im.h }, cap ? { text: cap } : {}));
    } catch (e) { if (!(e && e.code)) hud('לא הצלחנו לשלוח את התמונה', true); }
    return;
  }
  hud(files.length === 1 ? 'מעלה תמונה…' : `מעלה ${files.length} תמונות…`);
  try { const imgs = []; for (const f of files) imgs.push(await prepImage(f)); await be.addPhotos(S.gid, imgs); haptic(12); hud(imgs.length === 1 ? 'התמונה נוספה' : `${imgs.length} תמונות נוספו`); } catch (e) { fail(e); }
});

function clock() { const el = $('#sb-time'); if (el) { const d = new Date(); el.textContent = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); } }
clock(); setInterval(clock, 30000);
setInterval(() => { if (!typing() && !closeForm && !S.viewer && !S.rec && S.screen !== 'chat') softRender(); }, 60000);

/* ====================== Event pages ====================== */
// A public page per event: the creator picks a look and builds it from sections;
// everyone RSVPs, votes (Eurovision-style points or polls) and comments.
const EV_THEMES = { euro: 'אירוויזיון ✨', party: 'מסיבה 🎉', sport: 'ספורט 🏆', night: 'ערב גאלה 🌙', minimal: 'נקי' };
const EV_POINTS = [12, 10, 8, 7, 6, 5, 4, 3, 2, 1];
const evId = () => Math.random().toString(36).slice(2, 9);
const evPage = () => S.ev && S.ev.page;
const evMine = () => { const p = evPage(); return !!p && p.ownerId === me(); };
const myVote = () => (S.ev && S.ev.votes.find(v => v.id === me())) || { points: {}, poll: {} };
const evTime = p => p && p.date ? new Date(p.date).getTime() : 0;
function evWhen(p) {
  if (!p.date) return '';
  const d = new Date(p.date);
  return `יום ${DAYS[d.getDay()]}, ${d.getDate()} ב${MONTHS[d.getMonth()]} · ${hhmm(d.getTime())}`;
}
function evTemplates(kind) {
  const sched = items => ({ id: evId(), type: 'schedule', title: 'לוח זמנים', items });
  if (kind === 'euro') return [
    { id: evId(), type: 'entries', title: 'השירים', items: [] },
    sched([{ t: '20:00', text: 'פתיחת המשדר' }, { t: '22:30', text: 'ההצבעה נפתחת' }, { t: '00:00', text: 'הכרזת המנצח' }]),
    { id: evId(), type: 'text', title: 'חדשות ועדכונים', body: 'כאן יופיעו עדכונים מהמארגנים.' }];
  if (kind === 'party') return [
    sched([{ t: '20:00', text: 'מתחילים' }, { t: '21:00', text: 'אוכל' }, { t: '22:00', text: 'עוגה 🎂' }]),
    { id: evId(), type: 'poll', title: 'מה אוכלים?', options: ['פיצה', 'המבורגר', 'סושי'] },
    { id: evId(), type: 'text', title: 'מה להביא', body: '' }];
  if (kind === 'sport') return [
    { id: evId(), type: 'entries', title: 'הקבוצות', items: [] },
    sched([{ t: '16:00', text: 'שלב הבתים' }, { t: '18:00', text: 'חצי גמר' }, { t: '19:00', text: 'גמר 🏆' }]),
    { id: evId(), type: 'poll', title: 'מי לוקחת את הגביע?', options: [] }];
  return [];
}

/* ---------- subscriptions ---------- */
function openEvent(eid) {
  closeEvent(); S.eid = eid; S.ev = { page: (S.events || []).find(e => e.id === eid) || null, votes: [], comments: [], cover: '' };
  unsub.ev = [
    be.watchEventPage(eid, async p => { if (S.eid !== eid) return; S.ev.page = p; if (p) await loadUsers([p.ownerId].concat(Object.keys(p.rsvp || {}))); softRender(); }, fail),
    be.watchEventSub(eid, 'votes', list => { if (S.eid !== eid) return; S.ev.votes = list; softRender(); }, () => {}),
    be.watchEventSub(eid, 'comments', async list => { if (S.eid !== eid) return; S.ev.comments = list; await loadUsers(list.map(c => c.authorId)); softRender(); }, () => {})
  ];
  be.eventMedia(eid, 'cover').then(d => { if (S.eid === eid && d) { S.ev.cover = d; softRender(); } }).catch(() => {});
}
function closeEvent() { (unsub.ev || []).forEach(u => { try { u(); } catch (e) {} }); unsub.ev = []; S.eid = null; S.ev = null; }

/* ---------- the list of events ---------- */
function evCard(p, wide) {
  const going = Object.values(p.rsvp || {}).filter(v => v === 'yes').length, t = evTime(p), soon = t > Date.now();
  return `<button class="evc ev-${esc(p.theme || 'minimal')}${wide ? ' wide' : ''}" data-a="open-event" data-v="${esc(p.id)}">
    <span class="evc-img"${p.coverThumb ? ` style="background-image:url(${p.coverThumb})"` : ''}><span class="evc-tag">${esc(EV_THEMES[p.theme] || '')}</span></span>
    <span class="evc-b"><b dir="auto">${esc(p.title)}</b><span>${esc(evWhen(p))}</span><span>${going} מגיעים${soon ? '' : ' · הסתיים'}</span></span></button>`;
}
function viewEventList() {
  const now = Date.now() - 6 * 36e5, all = S.events || [];
  const up = all.filter(p => evTime(p) >= now).sort((a, b) => evTime(a) - evTime(b));
  const past = all.filter(p => evTime(p) < now).sort((a, b) => evTime(b) - evTime(a));
  return bar({ inline: true, back: 'בית', title: 'אירועים', trail: `<button class="nb-btn" data-a="new-event-page" aria-label="אירוע חדש">${icon('plus', 24, 2.2)}</button>` }) +
  (all.length ? `${up.length ? `<div class="section-h">בקרוב</div><div class="evc-list">${up.map(p => evCard(p, true)).join('')}</div>` : ''}
    ${past.length ? `<div class="section-h">היו</div><div class="evc-list">${past.map(p => evCard(p, true)).join('')}</div>` : ''}`
  : `<div class="empty">${icon('cal', 56, 1.4)}<b>עוד אין אירועים</b><span>צרו דף לאירוע: אירוויזיון עם הצבעות, מסיבה, טורניר או כל דבר אחר.</span><button class="btn filled sm" data-a="new-event-page">אירוע חדש</button></div>`);
}
// a strip on the home screen
function eventsStrip() {
  const up = (S.events || []).filter(p => evTime(p) >= Date.now() - 6 * 36e5).sort((a, b) => evTime(a) - evTime(b)).slice(0, 6);
  if (!up.length) return '';
  return `<div class="section-h" style="display:flex;justify-content:space-between;align-items:center"><span>אירועים קרובים</span><button class="nb-btn" data-a="events" style="font-size:15px;min-height:0;padding:0">הכל</button></div><div class="evc-row">${up.map(p => evCard(p)).join('')}</div>`;
}

/* ---------- an event page ---------- */
function viewEventPage() {
  const p = evPage();
  if (!p) return bar({ inline: true, back: 'אירועים', title: '' }) + (S.ev && S.ev.page === null ? `<div class="empty"><b>האירוע לא נמצא</b><span>אולי הוא נמחק.</span></div>` : `<div class="loading" style="min-height:200px"><div class="spinner"></div></div>`);
  const t = evTime(p), owner = S.members[p.ownerId] || { id: p.ownerId }, mine = evMine();
  const rs = p.rsvp || {}, my = rs[me()], going = Object.keys(rs).filter(k => rs[k] === 'yes'), maybe = Object.keys(rs).filter(k => rs[k] === 'maybe').length;
  const cover = S.ev.cover || p.coverThumb;
  return bar({ inline: true, back: 'אירועים', title: '', trail: `<button class="nb-btn" data-a="share-event" aria-label="שיתוף">${icon('share', 22)}</button>${mine ? `<button class="nb-btn" data-a="event-menu" aria-label="ניהול האירוע">${icon('more', 24)}</button>` : ''}` }) +
  `<div class="evp ev-${esc(p.theme || 'minimal')}">
    <header class="ev-hero"${cover ? ` style="--cover:url(${cover})"` : ''}>
      <span class="ev-badge">${esc(EV_THEMES[p.theme] || 'אירוע')}</span>
      <h1 dir="auto">${esc(p.title)}</h1>${p.subtitle ? `<div class="ev-sub" dir="auto">${esc(p.subtitle)}</div>` : ''}
      <div class="ev-meta">${p.date ? `<span>${icon('cal', 16)} ${esc(evWhen(p))}</span>` : ''}${p.place ? `<span>📍 ${esc(p.place)}</span>` : ''}</div>
      ${t > Date.now() ? `<div class="ev-cd" data-cd="${t}">${cdParts(t)}</div>` : t ? `<div class="ev-live">${Date.now() - t < 6 * 36e5 ? '● עכשיו' : 'האירוע הסתיים'}</div>` : ''}
      <button class="ev-host" data-a="user" data-v="${esc(p.ownerId)}">${avatar(owner, 24)}<span>מארגן/ת: ${esc(nameOf(owner))}</span></button>
    </header>
    <section class="ev-card ev-rsvp">
      <div class="ev-rs-btns">${[['yes', 'מגיע/ה'], ['maybe', 'אולי'], ['no', 'לא']].map(([v, l]) => `<button class="${my === v ? 'on' : ''}" data-a="ev-rsvp" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="ev-going">${going.slice(0, 8).map(id => avatar(S.members[id] || { id }, 28)).join('')}<span>${going.length} מגיעים${maybe ? ` · ${maybe} אולי` : ''}</span></div>
    </section>
    ${p.desc ? `<section class="ev-card"><div class="ev-text" dir="auto">${linkify(p.desc)}</div></section>` : ''}
    ${(p.blocks || []).map((b, i) => evBlock(b, i, p.blocks.length)).join('')}
    ${mine ? `<button class="ev-add" data-a="ev-add-block">${icon('plus', 20, 2.2)} הוספת חלק לדף</button>` : ''}
    <section class="ev-card"><h2>תגובות${S.ev.comments.length ? ` · ${S.ev.comments.length}` : ''}</h2>
      <div class="ev-cmts">${S.ev.comments.map(c => { const a = S.members[c.authorId] || { id: c.authorId }; return `<div class="cmt">${avatar(a, 30)}<div style="flex:1;min-width:0"><div class="cb"><b>${esc(nameOf(a))}</b><p dir="auto">${linkify(c.text)}</p></div><div class="ct">${ago(c.createdAt)}${c.authorId === me() || mine ? ` · <button style="color:var(--red);font-size:12px" data-a="ev-del-cmt" data-v="${esc(c.id)}">מחיקה</button>` : ''}</div></div></div>`; }).join('') || '<p class="ev-muted">עוד אין תגובות. תהיו הראשונים!</p>'}</div>
      <form id="evc-form" class="ev-cbar"><input id="evc-in" dir="auto" maxlength="1000" placeholder="כתבו משהו…" aria-label="תגובה" autocomplete="off"><button class="btn filled sm">שליחה</button></form>
    </section>
  </div>`;
}
function cdParts(t) {
  const s = Math.max(0, Math.floor((t - Date.now()) / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return [[d, 'ימים'], [h, 'שעות'], [m, 'דקות'], [x, 'שניות']].map(([n, l]) => `<span><b>${String(n).padStart(2, '0')}</b><i>${l}</i></span>`).join('');
}
setInterval(() => { $$('[data-cd]').forEach(el => { const t = +el.dataset.cd; if (t > Date.now()) el.innerHTML = cdParts(t); else softRender(); }); }, 1000);

function evBlockHead(b, i, n, extra) {
  return `<div class="ev-bh"><h2 dir="auto">${esc(b.title || '')}</h2>${extra || ''}${evMine() ? `<button class="icon-btn muted sm" data-a="ev-block-menu" data-v="${esc(b.id)}" aria-label="עריכת החלק">${icon('more', 18)}</button>` : ''}</div>`;
}
function evBlock(b, i, n) {
  if (b.type === 'text') return `<section class="ev-card">${evBlockHead(b, i, n)}<div class="ev-text" dir="auto">${b.body ? linkify(b.body) : '<span class="ev-muted">(ריק)</span>'}</div></section>`;
  if (b.type === 'schedule') return `<section class="ev-card">${evBlockHead(b, i, n)}<ol class="ev-sched">${(b.items || []).map(x => `<li><b dir="ltr">${esc(x.t)}</b><span dir="auto">${esc(x.text)}</span></li>`).join('')}</ol></section>`;
  if (b.type === 'poll') {
    const opts = b.options || [], counts = opts.map(() => 0);
    S.ev.votes.forEach(v => { const k = (v.poll || {})[b.id]; if (k != null && counts[k] != null) counts[k]++; });
    const total = counts.reduce((a, c) => a + c, 0), mineI = myVote().poll ? myVote().poll[b.id] : undefined;
    return `<section class="ev-card">${evBlockHead(b, i, n)}${opts.length ? `<div class="ev-poll">${opts.map((o, k) => { const pc = total ? Math.round(counts[k] * 100 / total) : 0; return `<button class="ev-po${mineI === k ? ' on' : ''}" data-a="ev-poll" data-v="${esc(b.id)}" data-i="${k}"><span class="ev-po-bar" style="width:${pc}%"></span><span class="ev-po-t" dir="auto">${esc(o)}</span><span class="ev-po-n">${total ? pc + '%' : ''}</span></button>`; }).join('')}</div><p class="ev-muted">${total} הצבעות</p>` : '<p class="ev-muted">עוד אין אפשרויות.</p>'}</section>`;
  }
  if (b.type === 'entries') {
    const view = (S.evView || {})[b.id] || 'vote', items = b.items || [];
    const totals = {}; items.forEach(e => totals[e.id] = 0);
    const voters = S.ev.votes.filter(v => Object.keys(v.points || {}).length);
    voters.forEach(v => Object.entries(v.points || {}).forEach(([eid, pts]) => { if (eid in totals) totals[eid] += +pts || 0; }));
    const mp = myVote().points || {}, used = Object.keys(mp).filter(k => k in totals).length;
    const seg = `<div class="seg ev-seg"><button class="${view === 'vote' ? 'on' : ''}" data-a="ev-view" data-v="${esc(b.id)}" data-w="vote">הצבעה</button><button class="${view === 'board' ? 'on' : ''}" data-a="ev-view" data-v="${esc(b.id)}" data-w="board">טבלה</button></div>`;
    let body;
    if (!items.length) body = `<p class="ev-muted">${evMine() ? 'הוסיפו את המתמודדים, ואז כולם יוכלו להצביע.' : 'המארגנים עוד לא הוסיפו מתמודדים.'}</p>`;
    else if (view === 'board') {
      const sorted = items.slice().sort((a, c) => totals[c.id] - totals[a.id]), max = Math.max(1, ...Object.values(totals));
      body = `<ol class="ev-board">${sorted.map((e, k) => `<li class="${k < 3 && totals[e.id] ? 'top' + (k + 1) : ''}"><span class="ev-rank">${k < 3 && totals[e.id] ? ['🥇', '🥈', '🥉'][k] : k + 1}</span>${entryFace(e)}<span class="ev-en"><b dir="auto">${e.img && e.flag ? esc(e.flag) + ' ' : ''}${esc(e.name)}</b><span class="ev-bar"><i style="width:${Math.round(totals[e.id] * 100 / max)}%"></i></span></span><span class="ev-pts">${totals[e.id]}</span></li>`).join('')}</ol><p class="ev-muted">${voters.length} מצביעים · מתעדכן בזמן אמת</p>`;
    } else {
      body = `<p class="ev-hint">חלקו 12, 10 ו-8 עד 1 נקודות לאהובים עליכם. בחרתם ${used} מתוך ${EV_POINTS.length}.</p>
        <ol class="ev-entries">${items.map((e, k) => `<li><span class="ev-num">${k + 1}</span>${entryFace(e)}<button class="ev-en" ${evMine() ? `data-a="ev-entry-menu" data-v="${esc(b.id)}" data-i="${esc(e.id)}"` : 'tabindex="-1"'}><b dir="auto">${e.img && e.flag ? esc(e.flag) + ' ' : ''}${esc(e.name)}</b>${e.sub ? `<span dir="auto">${esc(e.sub)}</span>` : ''}</button>${e.link ? `<a class="icon-btn muted sm" href="${esc(e.link)}" target="_blank" rel="noopener" aria-label="צפייה">${icon('play', 18)}</a>` : ''}<button class="ev-chip${mp[e.id] ? ' on' : ''}" data-a="ev-points" data-v="${esc(b.id)}" data-i="${esc(e.id)}" aria-label="נקודות ל${esc(e.name)}">${mp[e.id] || '+'}</button></li>`).join('')}</ol>`;
    }
    return `<section class="ev-card">${evBlockHead(b, i, n, items.length ? seg : '')}${body}${evMine() ? `<button class="ev-mini" data-a="ev-add-entry" data-v="${esc(b.id)}">${icon('plus', 16, 2.4)} הוספת מתמודד</button>` : ''}</section>`;
  }
  return '';
}
const entryFace = e => e.img ? `<img class="ev-face" src="${e.img}" alt="">` : `<span class="ev-face ph">${esc(e.flag || (e.name || '?').slice(0, 1))}</span>`;

/* ---------- editing ---------- */
function pickImage(cb) { S.pickFor = 'cb'; S.onPick = cb; fileEl.accept = 'image/*'; fileEl.multiple = false; fileEl.value = ''; fileEl.click(); }
async function tinyImage(src, max) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', .74);
}
function eventEditor(p) {
  const isNew = !p;
  let theme = p ? p.theme || 'minimal' : 'euro', tpl = 'euro', cover = null;
  const d = p && p.date ? p.date : (() => { const x = new Date(Date.now() + 864e5); x.setHours(20, 0, 0, 0); return iso(x) + 'T20:00'; })();
  const fs = formSheet({ title: isNew ? 'אירוע חדש' : 'עריכת האירוע', action: isNew ? 'יצירה' : 'שמירה', tall: true,
    body: `${isNew ? `<div class="section-h">תבנית</div><div class="seg" id="ee-tpl">${[['euro', 'אירוויזיון'], ['party', 'מסיבה'], ['sport', 'טורניר'], ['blank', 'ריק']].map(([k, l]) => `<button type="button" data-tpl="${k}" class="${k === tpl ? 'on' : ''}">${l}</button>`).join('')}</div><p class="section-f" id="ee-tpl-f"></p>` : ''}
      <div class="section-h">שם האירוע</div><div class="list"><div class="field"><input id="ee-title" maxlength="80" dir="auto" placeholder="למשל: אירוויזיון 2027 – ערב צפייה" value="${esc(p ? p.title : '')}" autofocus></div></div>
      <div class="section-h">שורת משנה</div><div class="list"><div class="field"><input id="ee-sub" maxlength="120" dir="auto" placeholder="לא חובה" value="${esc(p ? p.subtitle || '' : '')}"></div></div>
      <div class="section-h">מתי ואיפה</div><div class="list"><div class="field"><input id="ee-date" type="datetime-local" value="${esc(d)}"></div><div class="field"><input id="ee-place" maxlength="80" dir="auto" placeholder="מקום (לא חובה)" value="${esc(p ? p.place || '' : '')}"></div></div>
      <div class="section-h">תיאור</div><div class="list"><textarea id="ee-desc" class="tt-in" rows="3" maxlength="2000" dir="auto" placeholder="על מה האירוע?">${esc(p ? p.desc || '' : '')}</textarea></div>
      <div class="section-h">עיצוב</div><div class="ev-themes">${Object.entries(EV_THEMES).map(([k, l]) => `<button type="button" class="ev-sw ev-${k}${k === theme ? ' on' : ''}" data-th="${k}"><span></span>${l}</button>`).join('')}</div>
      <div class="section-h">תמונת שער</div><div class="list"><button type="button" class="row" id="ee-cover">${icon('photo', 22)}<span class="body t acc" id="ee-cover-t">${p && p.coverThumb ? 'החלפת התמונה' : 'בחירת תמונה (לא חובה)'}</span></button></div>`,
    async onOk(f) {
      const title = f.querySelector('#ee-title').value.trim(); if (!title) { hud('תנו שם לאירוע', true); return false; }
      const data = { title, subtitle: f.querySelector('#ee-sub').value.trim(), date: f.querySelector('#ee-date').value, place: f.querySelector('#ee-place').value.trim(), desc: f.querySelector('#ee-desc').value.trim(), theme };
      if (cover) data.coverThumb = cover.thumb.data;
      if (isNew) {
        data.blocks = evTemplates(tpl);
        const eid = await be.createEventPage(data);
        if (cover) await be.setEventMedia(eid, 'cover', cover.full.data);
        haptic(15); hud('דף האירוע נוצר'); setTimeout(() => go('event', { eid }), 250);
      } else {
        await be.updateEventPage(p.id, data);
        if (cover) { await be.setEventMedia(p.id, 'cover', cover.full.data); if (S.ev) S.ev.cover = cover.full.data; }
        hud('נשמר');
      }
    } });
  const syncTpl = () => { const f = fs.querySelector('#ee-tpl-f'); if (f) f.textContent = { euro: 'שירים עם הצבעת 12 נקודות וטבלה חיה, לוח זמנים ועדכונים.', party: 'לוח זמנים, סקר ו"מה להביא".', sport: 'קבוצות עם ניקוד, לוח משחקים וסקר.', blank: 'דף ריק. מוסיפים חלקים אחרי היצירה.' }[tpl]; };
  fs.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => { tpl = b.dataset.tpl; fs.querySelectorAll('[data-tpl]').forEach(x => x.classList.toggle('on', x === b)); if (tpl !== 'blank') { theme = { euro: 'euro', party: 'party', sport: 'sport' }[tpl]; fs.querySelectorAll('[data-th]').forEach(x => x.classList.toggle('on', x.dataset.th === theme)); } syncTpl(); });
  fs.querySelectorAll('[data-th]').forEach(b => b.onclick = () => { theme = b.dataset.th; fs.querySelectorAll('[data-th]').forEach(x => x.classList.toggle('on', x === b)); });
  fs.querySelector('#ee-cover').onclick = () => pickImage(im => { cover = im; fs.querySelector('#ee-cover-t').textContent = 'התמונה נבחרה ✓'; });
  syncTpl();
}
async function saveBlocks(blocks) { const p = evPage(); if (!p) return; p.blocks = blocks; softRender(); await be.updateEventPage(p.id, { blocks }); }
function blockForm(type, b) {
  const isNew = !b; b = b || { id: evId(), type, title: { text: 'עדכון', schedule: 'לוח זמנים', poll: 'סקר', entries: 'המתמודדים' }[type] };
  const fields = {
    text: `<div class="section-h">תוכן</div><div class="list"><textarea id="bf-body" class="tt-in" rows="5" maxlength="3000" dir="auto">${esc(b.body || '')}</textarea></div>`,
    schedule: `<div class="section-h">שורה לכל פריט: שעה ואז מה קורה</div><div class="list"><textarea id="bf-items" class="tt-in" rows="6" dir="auto" placeholder="20:00 פתיחה&#10;21:30 הופעה">${esc((b.items || []).map(x => x.t + ' ' + x.text).join('\n'))}</textarea></div>`,
    poll: `<div class="section-h">אפשרויות (שורה לכל אחת)</div><div class="list"><textarea id="bf-opts" class="tt-in" rows="5" dir="auto">${esc((b.options || []).join('\n'))}</textarea></div>`,
    entries: `<p class="section-f">אחרי השמירה מוסיפים מתמודדים עם "הוספת מתמודד". כל צופה מחלק 12, 10, 8–1 נקודות.</p>`
  }[b.type];
  formSheet({ title: isNew ? 'חלק חדש' : 'עריכת החלק', action: 'שמירה', tall: true,
    body: `<div class="section-h">${b.type === 'poll' ? 'השאלה' : 'כותרת'}</div><div class="list"><div class="field"><input id="bf-title" maxlength="80" dir="auto" value="${esc(b.title || '')}" autofocus></div></div>${fields}`,
    async onOk(f) {
      const nb = Object.assign({}, b, { title: f.querySelector('#bf-title').value.trim() });
      if (b.type === 'text') nb.body = f.querySelector('#bf-body').value.trim();
      if (b.type === 'schedule') nb.items = f.querySelector('#bf-items').value.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 30).map(l => { const m = l.match(/^(\S+)\s+(.*)$/); return m ? { t: m[1], text: m[2] } : { t: '', text: l }; });
      if (b.type === 'poll') { nb.options = f.querySelector('#bf-opts').value.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 10); if (nb.options.length < 2) { hud('צריך לפחות שתי אפשרויות', true); return false; } }
      if (b.type === 'entries') nb.items = b.items || [];
      const blocks = (evPage().blocks || []).slice(), k = blocks.findIndex(x => x.id === b.id);
      if (k >= 0) blocks[k] = nb; else blocks.push(nb);
      await saveBlocks(blocks); hud('נשמר');
    } });
}
function entryForm(bid, e) {
  const isNew = !e; e = e || { id: evId(), name: '', flag: '', sub: '', link: '', img: '' };
  let img = e.img || '';
  const fs = formSheet({ title: isNew ? 'מתמודד חדש' : 'עריכת מתמודד', action: 'שמירה', tall: true,
    body: `<div style="display:grid;justify-items:center;gap:8px;padding:6px 0"><span id="nf-face">${entryFace(e)}</span><button type="button" class="nb-btn" id="nf-pick">תמונה (לא חובה)</button></div>
      <div class="section-h">שם</div><div class="list"><div class="field"><input id="nf-name" maxlength="60" dir="auto" placeholder="שם השיר / הקבוצה / המתמודד" value="${esc(e.name)}" autofocus></div></div>
      <div class="section-h">דגל או אימוג׳י</div><div class="list"><div class="field"><input id="nf-flag" maxlength="8" placeholder="🇮🇱" value="${esc(e.flag || '')}"></div></div>
      <div class="section-h">שורה נוספת</div><div class="list"><div class="field"><input id="nf-sub" maxlength="80" dir="auto" placeholder="מדינה, אמן…" value="${esc(e.sub || '')}"></div></div>
      <div class="section-h">קישור לצפייה</div><div class="list"><div class="field"><input id="nf-link" type="url" dir="ltr" placeholder="https://youtube.com/…" value="${esc(e.link || '')}"></div></div>`,
    async onOk(f) {
      const name = f.querySelector('#nf-name').value.trim(); if (!name) { hud('צריך שם', true); return false; }
      let link = f.querySelector('#nf-link').value.trim(); if (link && !/^https?:\/\//.test(link)) link = 'https://' + link;
      const ne = { id: e.id, name, flag: f.querySelector('#nf-flag').value.trim(), sub: f.querySelector('#nf-sub').value.trim(), link, img };
      const blocks = (evPage().blocks || []).map(b => b.id !== bid ? b : Object.assign({}, b, { items: (b.items || []).some(x => x.id === e.id) ? b.items.map(x => x.id === e.id ? ne : x) : (b.items || []).concat(ne).slice(0, 40) }));
      await saveBlocks(blocks); hud(isNew ? 'נוסף' : 'נשמר');
    } });
  fs.querySelector('#nf-pick').onclick = () => pickImage(async im => { img = await tinyImage(im.thumb.data, 160); fs.querySelector('#nf-face').innerHTML = entryFace({ img }); });
}

/* ---------- actions ---------- */
Object.assign(A, {
  events: () => go('events'),
  'open-event': b => go('event', { eid: b.dataset.v }),
  'new-event-page': () => eventEditor(null),
  'ev-rsvp': async b => { const p = evPage(); if (!p) return; haptic(8); p.rsvp = Object.assign({}, p.rsvp, { [me()]: b.dataset.v }); render(); try { await be.rsvpEvent(p.id, b.dataset.v); } catch (e) { fail(e); } },
  'ev-view': b => { S.evView = Object.assign({}, S.evView, { [b.dataset.v]: b.dataset.w }); render(); },
  'ev-poll': async b => {
    const p = evPage(); if (!p) return; const v = myVote(), poll = Object.assign({}, v.poll), k = +b.dataset.i;
    if (poll[b.dataset.v] === k) delete poll[b.dataset.v]; else poll[b.dataset.v] = k;
    haptic(8); await saveVote({ points: v.points || {}, poll });
  },
  'ev-points': async b => {
    const p = evPage(); if (!p) return;
    const bl = (p.blocks || []).find(x => x.id === b.dataset.v), e = bl && (bl.items || []).find(x => x.id === b.dataset.i); if (!e) return;
    const v = myVote(), pts = Object.assign({}, v.points), who = {};
    Object.entries(pts).forEach(([id, n]) => { const x = (bl.items || []).find(y => y.id === id); if (x) who[n] = x.name; });
    const acts = EV_POINTS.map(n => ({ label: `${n} נקודות${who[n] && who[n] !== e.name ? ` (עכשיו אצל ${who[n]})` : pts[e.id] === n ? ' ✓' : ''}`, n })).concat(pts[e.id] ? [{ label: 'הסרת הניקוד', n: 0, destructive: true }] : []);
    const r = await confirmSheet({ title: `${e.flag || ''} ${e.name}`.trim(), msg: 'כמה נקודות תתנו?', actions: acts }); const a = acts[r]; if (!a) return;
    Object.keys(pts).forEach(id => { if (pts[id] === a.n || id === e.id) delete pts[id]; });
    if (a.n) pts[e.id] = a.n;
    haptic(a.n === 12 ? [30, 40, 30] : 10); if (a.n === 12) hud('12 נקודות! 🎉');
    await saveVote({ points: pts, poll: v.poll || {} });
  },
  'ev-add-block': async () => {
    const acts = [{ label: '🏆 מתמודדים והצבעה', t: 'entries' }, { label: '📊 סקר', t: 'poll' }, { label: '🕘 לוח זמנים', t: 'schedule' }, { label: '📝 טקסט / עדכון', t: 'text' }];
    const r = await confirmSheet({ title: 'מה מוסיפים לדף?', actions: acts }); if (acts[r]) blockForm(acts[r].t, null);
  },
  'ev-block-menu': async b => {
    const p = evPage(); const blocks = (p.blocks || []).slice(), k = blocks.findIndex(x => x.id === b.dataset.v); if (k < 0) return;
    const acts = [{ label: 'עריכה', k: 'edit' }].concat(k > 0 ? [{ label: 'הזזה למעלה', k: 'up' }] : [], k < blocks.length - 1 ? [{ label: 'הזזה למטה', k: 'down' }] : [], [{ label: 'מחיקת החלק', k: 'del', destructive: true }]);
    const r = await confirmSheet({ title: blocks[k].title, actions: acts }); const a = acts[r]; if (!a) return;
    if (a.k === 'edit') { blockForm(blocks[k].type, blocks[k]); return; }
    if (a.k === 'up' || a.k === 'down') { const j = a.k === 'up' ? k - 1 : k + 1; [blocks[k], blocks[j]] = [blocks[j], blocks[k]]; }
    if (a.k === 'del') { if (await confirmSheet({ title: 'למחוק את החלק?', actions: [{ label: 'מחיקה', destructive: true }] }) !== 0) return; blocks.splice(k, 1); }
    try { await saveBlocks(blocks); } catch (e) { fail(e); }
  },
  'ev-add-entry': b => entryForm(b.dataset.v, null),
  'ev-entry-menu': async b => {
    const p = evPage(), bl = (p.blocks || []).find(x => x.id === b.dataset.v), e = bl && (bl.items || []).find(x => x.id === b.dataset.i); if (!e) return;
    const r = await confirmSheet({ title: e.name, actions: [{ label: 'עריכה' }, { label: 'מחיקה', destructive: true }] });
    if (r === 0) entryForm(bl.id, e);
    if (r === 1) { try { await saveBlocks(p.blocks.map(x => x.id !== bl.id ? x : Object.assign({}, x, { items: x.items.filter(y => y.id !== e.id) }))); } catch (x) { fail(x); } }
  },
  'event-menu': async () => {
    const p = evPage(); if (!p) return;
    const r = await confirmSheet({ title: p.title, actions: [{ label: 'עריכת פרטים ועיצוב' }, { label: 'הוספת חלק לדף' }, { label: 'מחיקת האירוע', destructive: true }] });
    if (r === 0) eventEditor(p);
    if (r === 1) A['ev-add-block']();
    if (r === 2 && await confirmSheet({ title: `למחוק את "${p.title}"?`, msg: 'הדף, ההצבעות והתגובות יימחקו לכולם.', actions: [{ label: 'מחיקה', destructive: true }] }) === 0) {
      try { await be.deleteEventPage(p.id); hud('האירוע נמחק'); back(); } catch (e) { fail(e); }
    }
  },
  'share-event': async () => {
    const p = evPage(); if (!p) return; const url = location.origin + location.pathname + '?e=' + p.id, text = `${p.title} – ${evWhen(p)}`;
    if (navigator.share) { try { await navigator.share({ title: p.title, text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    copyText(text + '\n' + url);
  },
  'ev-del-cmt': async b => { const p = evPage(); if (!p) return; try { await be.deleteEventComment(p.id, b.dataset.v); } catch (e) { fail(e); } }
});
async function saveVote(v) {
  const p = evPage(); if (!p) return;
  const mineDoc = S.ev.votes.find(x => x.id === me());
  if (mineDoc) Object.assign(mineDoc, v); else S.ev.votes.push(Object.assign({ id: me() }, v));
  render();
  try { await be.saveEventVote(p.id, v); } catch (e) { fail(e); }
}
Object.assign(F, {
  'evc-form': async () => { const el = $('#evc-in'), t = el.value.trim(), p = evPage(); if (!t || !p) return; el.value = ''; try { await be.addEventComment(p.id, t); } catch (e) { el.value = t; fail(e); } }
});


/* ====================== Activity, shorts, saved, story replies, explore ====================== */

/* ---------- activity: likes, comments and follows from others ---------- */
let notifsLoaded = false;
const notifSeen = () => LS.get('friends.notifSeen') || 0;
const unreadNotifs = () => (S.notifs || []).filter(n => n.createdAt > notifSeen()).length;
function watchNotifs() {
  notifsLoaded = false;
  unsub.notifs = be.watchNotifs(async list => {
    const prev = new Set((S.notifs || []).map(n => n.id));
    S.notifs = list;
    await loadUsers(list.map(n => n.from));
    if (notifsLoaded) list.filter(n => !prev.has(n.id)).slice(0, 1).forEach(n => { if (S.screen !== 'activity') { hud(notifText(n, true)); if (document.hidden) notify('Friends', notifText(n, true), 'n:' + n.id); } });
    notifsLoaded = true; softRender();
  }, () => {});
}
function notifText(n, plain) {
  const who = plain ? nameOf(S.members[n.from]) : `<b>${esc(nameOf(S.members[n.from]))}</b>`;
  const t = { like: 'עשה/תה לייק לפוסט שלך', vlike: 'עשה/תה לייק לסרטון שלך', comment: 'הגיב/ה', follow: 'התחיל/ה לעקוב אחריך', story: 'הגיב/ה לסטורי שלך', request: 'ביקש/ה לעקוב אחריך', accepted: 'אישר/ה את בקשת המעקב שלך' }[n.type] || '';
  return `${who} ${t}${n.text ? (plain ? ': ' : ': ') + (plain ? n.text : `<span dir="auto">${esc(n.text)}</span>`) : ''}`;
}
function sendNotif(to, n) {
  if (!to || to === me() || local()) return;
  be.sendNotif(to, n).catch(() => {});
  // the push sender titles it with the sender's real name, so the body leaves the name out
  const who = nameOf(S.members[me()]);
  pushOut({ kind: 'activity', to, body: notifText(Object.assign({}, n, { from: me() }), true).slice(who.length + 1) });
}
function viewActivity() {
  const l = S.notifs || [], seen = notifSeen();
  setTimeout(() => { if (l[0] && l[0].createdAt > notifSeen()) { LS.set('friends.notifSeen', l[0].createdAt); } }, 800);
  return bar({ inline: true, back: 'בית', title: 'פעילות' }) +
  (l.length ? `<div class="list av">${l.filter(n => !isBlockedPair(n.from)).map(n => {
    const u = S.members[n.from] || { id: n.from }, p = n.pid && postById(n.pid);
    const thumb = p ? `<img class="nt-th" src="${p.kind === 'video' && p.video ? p.video.thumb : p.thumb}" alt="">` : '';
    const end = n.type === 'request' ? (approvedList().includes(n.from) ? '<span class="val">אושר</span>' : `<button class="btn filled sm" data-a="req-ok" data-v="${esc(n.from)}" data-n="${esc(n.id)}">אישור</button><button class="btn tinted sm" data-a="req-no" data-v="${esc(n.from)}" data-n="${esc(n.id)}">דחייה</button>`)
      : n.type === 'follow' || n.type === 'accepted' ? (isFollowing(n.from) ? '' : `<button class="btn filled sm" data-a="follow" data-v="${esc(n.from)}">מעקב בחזרה</button>`) : thumb;
    return `<div class="row nt${n.createdAt > seen ? ' new' : ''}"><button data-a="user" data-v="${esc(n.from)}" aria-label="${esc(nameOf(u))}">${avatar(u, 44)}</button><button class="body nt-b" ${p ? `data-a="open-post" data-v="${esc(p.id)}"` : `data-a="user" data-v="${esc(n.from)}"`}><span class="nt-t">${notifText(n)}</span><span class="sub">${ago(n.createdAt)}</span></button>${end}</div>`;
  }).join('')}</div>`
  : `<div class="empty">${icon('bell', 56, 1.4)}<b>עוד אין פעילות</b><span>כשמישהו יעשה לייק, יגיב או יתחיל לעקוב אחריך, זה יופיע כאן.</span></div>`);
}

/* ---------- shorts: full-screen videos, swipe up for the next one ---------- */
let shortsObs = null;
function openShorts(startId) {
  const list = (S.shortsList = S.posts.filter(p => p.kind === 'video' && p.video && canSee(p.authorId)));
  if (!list.length) { hud('עוד אין סרטונים', true); return; }
  closeShorts(true);
  const el = document.createElement('div'); el.id = 'shorts'; el.className = 'shorts'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'שורטס');
  el.innerHTML = `<button class="sh-close" data-a="shorts-close" aria-label="סגירה">${icon('xmark', 26)}</button><div class="sh-feed">${list.map(shortSlide).join('')}</div>`;
  phoneEl.appendChild(el);
  shortsObs = new IntersectionObserver(es => es.forEach(e => {
    const v = e.target.querySelector('video');
    if (e.isIntersecting && e.intersectionRatio > .6) playShort(e.target); else if (v) v.pause();
  }), { root: el.querySelector('.sh-feed'), threshold: [0, .6, 1] });
  el.querySelectorAll('.sh-slide').forEach(s => shortsObs.observe(s));
  try { history.pushState(Object.assign({}, history.state, { shorts: 1 }), ''); } catch (e) {}
  if (startId) { const s = el.querySelector(`[data-sid="${CSS.escape(startId)}"]`); if (s) s.scrollIntoView(); }
}
function shortSlide(p) {
  const a = S.members[p.authorId] || { id: p.authorId }, liked = (p.likes || []).includes(me()), saved = isSaved(p.id);
  return `<section class="sh-slide" data-sid="${esc(p.id)}"><img class="sh-poster" src="${p.video.thumb}" alt=""><video playsinline loop preload="none"></video><div class="sh-tap" data-a="shorts-tap"></div>
    <div class="sh-side"><button data-a="sh-like" data-v="${esc(p.id)}" class="${liked ? 'on' : ''}" aria-label="לייק">${icon(liked ? 'heartF' : 'heart', 30)}<span>${(p.likes || []).length || ''}</span></button>
      <button data-a="sh-comments" data-v="${esc(p.id)}" aria-label="תגובות">${icon('comment', 30)}<span>${p.commentCount || ''}</span></button>
      <button data-a="sh-save" data-v="${esc(p.id)}" class="${saved ? 'on' : ''}" aria-label="שמירה">${icon(saved ? 'bookmarkF' : 'bookmark', 28)}</button>
      <button data-a="share-post" data-v="${esc(p.id)}" aria-label="שליחה">${icon('send', 27)}</button></div>
    <div class="sh-meta"><button class="sh-u" data-a="sh-user" data-v="${esc(p.authorId)}">${avatar(a, 34)}<b>${esc(nameOf(a))}</b></button><b class="sh-title" dir="auto">${esc(p.title || '')}</b>${p.text ? `<span dir="auto">${esc(p.text.slice(0, 120))}</span>` : ''}</div></section>`;
}
async function playShort(slide) {
  const p = postById(slide.dataset.sid), v = slide.querySelector('video'); if (!p || !v) return;
  if (!S.viewed) S.viewed = new Set();
  if (!S.viewed.has(p.id)) { S.viewed.add(p.id); be.viewPost(p.id); }
  if (!v.src) {
    slide.classList.add('loading');
    try { if (!vcache[p.video.id]) vcache[p.video.id] = await dataURLToObjectURL(await be.loadPostVideo(p.video)); v.src = vcache[p.video.id]; }
    catch (e) { hud('לא הצלחנו לטעון את הסרטון', true); return; } finally { slide.classList.remove('loading'); }
  }
  const r = slide.getBoundingClientRect(), box = $('#shorts .sh-feed'); if (!box) return;
  const br = box.getBoundingClientRect(); if (Math.abs(r.top - br.top) > r.height * .4) return;
  $$('#shorts video').forEach(x => { if (x !== v) x.pause(); });
  slide.classList.add('ready'); v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
}
function closeShorts(silent) {
  if (shortsObs) { shortsObs.disconnect(); shortsObs = null; }
  const el = $('#shorts'); if (el) { el.querySelectorAll('video').forEach(v => v.pause()); el.remove(); }
  if (!silent) softRender();
}

/* ---------- saved posts ---------- */
const isSaved = pid => ((S.user && S.user.saved) || []).includes(pid);
async function toggleSave(pid) {
  if (local()) { hud('שמירה עובדת באתר, אחרי כניסה עם Google', true); return false; }
  const on = !isSaved(pid); haptic(8);
  S.user.saved = on ? [...new Set(((S.user.saved) || []).concat(pid))] : S.user.saved.filter(x => x !== pid);
  hud(on ? 'נשמר בשמורים' : 'הוסר מהשמורים');
  try { await be.savePost(pid, on); } catch (e) { fail(e); }
  return on;
}
function savedGrid() {
  const l = ((S.user && S.user.saved) || []).map(postById).filter(Boolean).reverse();
  if (!l.length) return `<div class="empty">${icon('bookmark', 48, 1.4)}<b>אין עדיין שמורים</b><span>לחצו על הסימנייה בפוסט או בסרטון כדי לשמור אותו כאן. רק את/ה רואה את הרשימה.</span></div>`;
  return `<div class="pgrid">${l.map(p => `<button class="pg" data-a="open-post" data-v="${esc(p.id)}" aria-label="פוסט שמור"><img src="${p.kind === 'video' ? p.video.thumb : p.thumb}" alt="">${p.kind === 'video' ? `<span class="pg-l">${icon('play', 12)} ${fmtDur(p.video.dur || 0)}</span>` : ''}</button>`).join('')}</div>`;
}

/* ---------- replies to stories go to the private chat ---------- */
async function storyReply(text) {
  const st = S.story; if (!st) return; const uid = st.order[st.u], s = (st.by[uid] || [])[st.i]; if (!s || uid === me()) return;
  if (local()) { hud('תגובות לסטורי עובדות באתר, אחרי כניסה עם Google', true); return; }
  try {
    const cid = await be.openChat(uid), img = await tinyImage(s.image, 360);
    await be.sendMessage({ t: 'c', id: cid }, { image: img, text: `הגיב/ה לסטורי שלך: ${text}` });
    sendNotif(uid, { type: 'story', text: text.slice(0, 80) });
    haptic(12); hud('נשלח');
  } catch (e) { fail(e); }
}

/* ---------- explore: photos from people you don't follow yet ---------- */
function exploreGrid() {
  const l = S.posts.filter(p => p.authorId !== me() && !isFollowing(p.authorId) && canSee(p.authorId) && (p.kind === 'photo' || p.video)).slice(0, 24);
  if (!l.length) return '';
  return `<div class="section-h">גלו</div><div class="pgrid">${l.map(p => `<button class="pg" data-open-post="${esc(p.id)}" aria-label="פוסט"><img src="${p.kind === 'video' ? p.video.thumb : p.thumb}" alt="">${p.kind === 'video' ? `<span class="pg-l">${icon('play', 12)}</span>` : ''}</button>`).join('')}</div>`;
}

Object.assign(A, {
  activity: () => go('activity'),
  shorts: b => openShorts(b && b.dataset ? b.dataset.v : null),
  'shorts-close': () => { if (history.state && history.state.shorts) history.back(); else closeShorts(); },
  'shorts-tap': b => { const v = b.parentElement.querySelector('video'); if (!v || !v.src) return; if (v.paused) v.play().catch(() => {}); else v.pause(); },
  'sh-like': async b => {
    const p = postById(b.dataset.v); if (!p) return; const on = !(p.likes || []).includes(me());
    p.likes = on ? (p.likes || []).concat(me()) : p.likes.filter(x => x !== me());
    b.classList.toggle('on', on); b.innerHTML = `${icon(on ? 'heartF' : 'heart', 30)}<span>${p.likes.length || ''}</span>`; haptic(on ? 10 : 4);
    if (on) sendNotif(p.authorId, { type: 'vlike', pid: p.id });
    try { await be.likePost(p, on); } catch (e) { fail(e); }
  },
  'sh-comments': b => openComments(b.dataset.v),
  'sh-save': async b => { await toggleSave(b.dataset.v); const on = isSaved(b.dataset.v); b.classList.toggle('on', on); b.innerHTML = icon(on ? 'bookmarkF' : 'bookmark', 28); },
  'sh-user': b => { closeShorts(true); openUser(b.dataset.v); },
  save: async b => { await toggleSave(b.dataset.v); render(); },
  'story-react': b => { const e = b.dataset.v; storyReply(e); const el = b.closest('.story-v'); if (el) { const f = document.createElement('span'); f.className = 'sv-float'; f.textContent = e; el.appendChild(f); setTimeout(() => f.remove(), 1200); } }
});
Object.assign(F, {
  'sv-form': async f => { const inp = f.querySelector('input'), t = inp.value.trim(); if (!t) return; inp.value = ''; inp.blur(); await storyReply(t); renderStory(); }
});

/* ====================== Permissions center & open in the browser ====================== */
// A web app has no permissions page of its own in the phone's settings: on Android Chrome holds them,
// on iPhone Safari does. So the app shows every permission here, asks for it, and explains exactly where to change it.
const APP_NAME = 'Friends';
const PERM_KEYS = ['mic', 'cam', 'notif'];
const isAndroid = () => /android/i.test(navigator.userAgent);
const isIPhone = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function browserLinks() {
  const host = location.host, path = location.pathname + location.search;
  // The installed app owns only /friends/app.html (its manifest scope); /friends/ itself is a normal
  // browser page, so a link there opens in Chrome instead of bouncing back into the app.
  const out = location.pathname.replace(/(app|index)\.html$/, '') + '?ob=1';
  // Inside the installed app Android blocks intent:// to Chrome, but a plain outside link opens in a Chrome window
  if (isAndroid()) return standalone() ? [
    { label: 'פתיחה בדפדפן', href: 'https://' + host + out, blank: true },
    { label: 'פתיחה ב-Chrome (ישירות)', href: 'intent://' + host + out + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent('https://' + host + out) + ';end' }
  ] : [
    { label: 'פתיחה בדפדפן (Chrome)', href: 'intent://' + host + out + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent('https://' + host + out) + ';end' },
    { label: 'פתיחה בדפדפן אחר', href: 'https://' + host + out, blank: true }
  ];
  if (isIPhone()) return [{ label: 'פתיחה בדפדפן (Safari)', href: 'x-safari-https://' + host + path }, { label: 'פתיחה ב-Chrome', href: 'googlechromes://' + host + path }];
  return [{ label: 'פתיחה בדפדפן', href: location.href, blank: true }];
}
// Opens the link with a real tap-like click; if the app is still in front a moment later, nothing opened:
// offer another way and the copy-paste route, which always works.
function openInBrowser(i) {
  const links = browserLinks(), l = links[+i || 0] || links[0];
  const a = document.createElement('a'); a.href = l.href; if (l.blank) { a.target = '_blank'; a.rel = 'noopener'; }
  document.body.appendChild(a); a.click(); a.remove();
  let left = false; const onHide = () => { if (document.hidden) left = true; };
  document.addEventListener('visibilitychange', onHide);
  setTimeout(() => { document.removeEventListener('visibilitychange', onHide); if (!left && !document.hidden) browserFallback(); }, 2200);
}
async function browserFallback() {
  const plain = 'https://' + location.host + location.pathname.replace(/\/(index\.html)?$/, '') + '?ob=1';
  const r = await confirmSheet({ title: 'הדפדפן לא נפתח?', msg: `אפשר בדרך אחרת, או ידנית:\n1. "העתקת הקישור".\n2. פתחו את ${isIPhone() ? 'Safari' : 'Chrome'}.\n3. הדביקו בשורת הכתובת ולחצו "עבור".\nשם, ליד הכתובת (🔒) ← "הרשאות".`, actions: [{ label: 'ניסיון בדרך אחרת' }, { label: 'העתקת הקישור' }, { label: 'הבנתי' }] });
  if (r === 0) { const a = document.createElement('a'); a.href = plain; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
  if (r === 1) copyText(plain);
}
/* ---------- the Friends Android app (Capacitor shell that loads this site) ---------- */
const capPlugin = n => window.Capacitor.registerPlugin ? window.Capacitor.registerPlugin(n) : window.Capacitor.Plugins[n];
function openAppSettings() { try { capPlugin('NativeSettings').openAndroid({ option: 'application_details' }).catch(() => hud('פתחו: הגדרות ← אפליקציות ← Friends ← הרשאות', true)); } catch (e) { hud('פתחו: הגדרות ← אפליקציות ← Friends ← הרשאות', true); } }
const NATIVE_LOGIN = 'https://' + location.host + '/friends/?native_login=1';
function nativeSignIn() { try { capPlugin('Browser').open({ url: NATIVE_LOGIN }); } catch (e) { location.href = NATIVE_LOGIN; } }
if (isNative()) {
  try {
    // Chrome signed in and sent us back friends://auth?gid=<Google ID token>
    capPlugin('App').addListener('appUrlOpen', async ({ url }) => {
      const m = /[?&#]gid=([^&#]+)/.exec(url || ''); if (!m) return;
      try { capPlugin('Browser').close(); } catch (e) {}
      try { hud('מתחבר…'); LS.set('friends.joined', 1); await be.signInWithGoogleToken(decodeURIComponent(m[1])); } catch (e) { fail(e); }
    });
  } catch (e) { console.warn('native bridge', e); }
}
// In Chrome: the page the Android app opens for signing in
function viewNativeLogin() {
  const back = S.nativeTok ? 'friends://auth?gid=' + encodeURIComponent(S.nativeTok) : '';
  return `<div class="onb"><div class="app-icon fr">${icon('people', 56, 1.7)}</div><h1 dir="ltr">Friends</h1><p class="lead">${back ? 'התחברת! חוזרים לאפליקציה.' : 'התחברות לאפליקציית Friends באנדרואיד'}</p></div>
  <div class="btn-row" style="flex-direction:column">${back ? `<a class="gbtn" href="${esc(back)}">${icon('chev', 18)}<span>חזרה לאפליקציה</span></a>` : `<button class="gbtn" data-a="native-login">${GLOGO}<span>התחברות עם Google</span></button>`}</div>
  <p class="section-f" style="text-align:center">${back ? 'אם האפליקציה לא נפתחה לבד, לחצו "חזרה לאפליקציה".' : 'אחרי ההתחברות תחזרו אוטומטית לאפליקציה.'}</p>`;
}
async function nativeLoginDone(tok) {
  if (!tok) return; S.nativeTok = tok; render(true);
  setTimeout(() => { location.href = 'friends://auth?gid=' + encodeURIComponent(tok); }, 300);
}
/* ---------- notifications while Friends is closed (free: Firebase Cloud Messaging, sent by a Google Apps Script) ---------- */
let pushReady = false, pushToken = '';
const BUILD_TAG = 'push-3';
async function setupPush() {
  if (!isNative()) { setupWebPush(); return; }
  if (pushReady || !S.user || be.mode !== 'live' || !be.savePushToken) return;
  pushReady = true;
  try {
    const P = capPlugin('PushNotifications');
    let st = await P.checkPermissions();
    if (st.receive !== 'granted' && st.receive !== 'denied') st = await P.requestPermissions();
    if (st.receive !== 'granted') { pushReady = false; return; }
    await P.createChannel({ id: 'msgs', name: 'הודעות ועדכונים', importance: 4, visibility: 1, vibration: true }).catch(() => {});
    await P.createChannel({ id: 'calls', name: 'שיחות נכנסות', importance: 5, visibility: 1, vibration: true }).catch(() => {});
    await P.addListener('registration', t => { pushToken = t.value; be.savePushToken(t.value).catch(e => console.warn('push token', e)); });
    await P.addListener('registrationError', e => console.warn('push', e));
    // arrived while Friends is open: Android doesn't show it, so a banner does
    await P.addListener('pushNotificationReceived', n => { const d = n.data || {}; if (d.kind === 'test' || !(d.cid && d.cid === S.cid) && !(d.gid && d.gid === S.gid)) hud(`${n.title || 'Friends'}: ${n.body || ''}`.slice(0, 80)); });
    await P.addListener('pushNotificationActionPerformed', a => openFromPush((a.notification && a.notification.data) || {}));
    await P.register();
  } catch (e) { pushReady = false; console.warn('push', e); }
}
function openFromPush(d) {
  if (!S.user) return;
  if (d.cid) go('chat', { cid: d.cid });
  else if (d.gid) go('group', { gid: d.gid });
  else if (d.kind === 'activity') go('activity');
}
// Returns the sender's answer ({ ok, sent } or { ok:false, error }), or { ok:false, error } when it couldn't be reached
async function pushOut(o) {
  if (!PUSH_URL) return { ok: false, error: 'no sender' };
  if (be.mode !== 'live' || !be.idToken) return { ok: false, error: 'not live' };
  try {
    const idToken = await be.idToken(); if (!idToken) return { ok: false, error: 'not signed in' };
    // text/plain: a "simple" request (no preflight); Apps Script answers with Access-Control-Allow-Origin: *
    const r = await fetch(PUSH_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(Object.assign({ idToken }, o)) });
    const j = await r.json().catch(() => ({ ok: false, error: 'http ' + r.status }));
    if (!j.ok) console.warn('push out', o.kind, j);
    return j;
  } catch (e) { console.warn('push out', e); return { ok: false, error: String((e && e.message) || e) }; }
}
function pushMsg(sc, m) {
  const p = m.text || (m.image ? '📷 תמונה' : m.video ? '🎬 סרטון' : m.audio ? '🎤 הודעה קולית' : m.share ? '🔗 פוסט' : m.poll ? '📊 סקר: ' + m.poll.q : m.loc ? '📍 שיתף/ה מיקום' : m.sticker ? m.sticker : 'הודעה חדשה');
  const mine = nameOf(S.members[me()]);
  if (sc.t === 'g') { const g = S.groups.find(x => x.id === sc.id); pushOut({ kind: 'msg', gid: sc.id, title: (g && g.name) || 'Friends', body: `${mine}: ${p}` }); }
  else pushOut({ kind: 'msg', cid: sc.id, title: mine, body: p });
}
/* ---------- updates of the Android app itself (the screens already update on their own, from the site) ---------- */
const RELEASES = 'https://api.github.com/repos/manorkeshet417-code/friends/releases/latest';
let appBuild = 0, newApk = null;
async function checkAppUpdate(manual) {
  if (!isNative()) return;
  try {
    if (!appBuild) appBuild = Number((await capPlugin('App').getInfo()).build) || 0;
    const r = await fetch(RELEASES, { cache: 'no-store' }).then(x => x.json());
    const n = Number(String(r.tag_name || '').replace(/\D/g, '')) || 0, a = (r.assets || []).find(x => /\.apk$/.test(x.name));
    if (!a || n <= appBuild) { if (manual) hud(`Friends מעודכן (גרסה ${appBuild})`); return; }
    newApk = { n, url: a.browser_download_url };
    if (!manual && LS.get('friends.skipApk') === n) return;
    const c = await confirmSheet({ title: 'גרסה חדשה של Friends', msg: `גרסה ${n} מוכנה (יש לך ${appBuild}).\n1. לחצו "עדכון" – הקובץ יורד.\n2. פתחו אותו מההתראה של ההורדה ← "עדכון".\nההודעות והקבוצות שלך נשמרות.`, actions: [{ label: 'עדכון' }, { label: 'אחר כך' }] });
    if (c === 0) { try { await capPlugin('Browser').open({ url: newApk.url }); } catch (e) { location.href = newApk.url; } }
    else LS.set('friends.skipApk', n);
  } catch (e) { if (manual) hud('לא הצלחנו לבדוק עדכונים', true); }
}
A['app-update'] = () => checkAppUpdate(true);

A['push-test'] = async () => {
  if (!isNative() && 'Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) {} }
  await setupPush();
  if (!pushToken) { permHelp('notif'); return; }
  // Android shows a notification only while Friends is in the background: the sender waits 10 seconds
  await confirmSheet({ title: 'בדיקת התראות', msg: 'אחרי "הבנתי" יש לך 10 שניות:\nצאו מ-Friends (כפתור הבית או החלקה למעלה).\nתוך כמה שניות תגיע התראה אמיתית לטלפון.', actions: [{ label: 'הבנתי' }] });
  const r = await pushOut({ kind: 'test', delay: 10, title: 'Friends', body: 'ההתראות עובדות 🎉 הן יגיעו גם כשהאפליקציה סגורה' });
  if (r.ok && r.sent) hud('ההתראה נשלחה');
  else await confirmSheet({ title: 'ההתראה לא נשלחה', msg: `תשובת השרת: ${r.ok ? 'לא נמצא מכשיר רשום' : r.error}\nגרסת האתר: ${BUILD_TAG}`, actions: [{ label: 'הבנתי' }] });
};

A['native-login'] = async b => { b.disabled = true; try { await nativeLoginDone(await be.googleTokenViaPopup()); } catch (e) { if (!(e && /popup-closed|cancelled-popup/.test(e.code || ''))) fail(e); } finally { b.disabled = false; } };

function browserSection() {
  if (isNative()) return `<div class="section-h">הגדרות הטלפון</div><div class="list"><button class="row" data-a="app-settings">${icon('gear', 22)}<span class="body t">פתיחת הגדרות האפליקציה</span><span class="chev">${icon('chev', 16)}</span></button><button class="row" data-a="app-update">${icon('sparkles', 22)}<span class="body t">בדיקת עדכונים לאפליקציה</span><span class="chev">${icon('chev', 16)}</span></button>${PUSH_URL ? `<button class="row" data-a="push-test">${icon('bell', 22)}<span class="body t">בדיקת התראות</span><span class="chev">${icon('chev', 16)}</span></button>` : ''}</div><p class="section-f">שם: "הרשאות" ← מיקרופון, מצלמה, התראות.</p>`;
  return `<div class="section-h">פתיחה בדפדפן</div><div class="list">${browserLinks().map((l, i) => `<button class="row" data-a="open-browser" data-v="${i}">${icon('link', 22)}<span class="body t">${l.label}</span><span class="chev">${icon('chev', 16)}</span></button>`).join('')}<button class="row" data-a="copy-link">${icon('copy', 22)}<span class="body t">העתקת הקישור</span></button></div>
  <p class="section-f">${standalone() ? `פותח את ${APP_NAME} בדפדפן. שם, ליד הכתובת (🔒 או ⓘ) ← "הרשאות", רואים ומשנים כל הרשאה.` : inAppBrowser() ? 'את/ה עכשיו בתוך אפליקציה אחרת. בדפדפן אפשר להתקין, להיכנס עם Google ולהתקשר.' : 'בדפדפן, ליד הכתובת (🔒 או ⓘ) ← "הרשאות", רואים ומשנים כל הרשאה של האתר.'}</p>`;
}

const PERMS = {
  mic: { label: 'מיקרופון', sub: 'שיחות והודעות קוליות', ic: 'mic', chrome: 'מיקרופון', ios: 'מיקרופון' },
  cam: { label: 'מצלמה', sub: 'שיחות וידאו', ic: 'video', chrome: 'מצלמה', ios: 'מצלמה' },
  notif: { label: 'התראות', sub: 'הודעות, שיחות ועדכונים', ic: 'bell', chrome: 'התראות', ios: 'התראות' },
  geo: { label: 'מיקום', sub: 'שליחת מיקום ב-SOS ובליווי', ic: 'route', chrome: 'מיקום', ios: 'מיקום' }
};
async function refreshPerms() {
  const has = !!(navigator.permissions && navigator.permissions.query);
  const q = async n => { if (!has) return 'unknown'; try { const p = await navigator.permissions.query({ name: n }); p.onchange = () => refreshPerms(); return p.state; } catch (e) { return 'unknown'; } };
  const [mic, cam, geo] = await Promise.all([q('microphone'), q('camera'), q('geolocation')]);
  const notif = 'Notification' in window ? ({ granted: 'granted', denied: 'denied', default: 'prompt' })[Notification.permission] : 'unsupported';
  const next = { mic, cam, geo, notif }, changed = JSON.stringify(next) !== JSON.stringify(S.perms);
  S.perms = next; S.mediaPerm = { mic, cam, unknown: mic === 'unknown' };
  if (changed) { const box = $('#perm-box'); if (box) box.innerHTML = permsHTML(); else if (!typing()) softRender(); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshPerms(); });
function permsHTML() {
  const st = S.perms || {};
  return `<div class="list">${PERM_KEYS.map(k => {
    const p = PERMS[k], s = st[k] || 'unknown';
    const pill = s === 'granted' ? '<span class="pm ok">מאושר</span>' : s === 'denied' ? '<span class="pm no">חסום</span>' : s === 'unsupported' ? '<span class="pm">לא נתמך</span>' : '<span class="pm">לא אושר עדיין</span>';
    const act = s === 'granted' || s === 'unsupported' ? '' : s === 'denied' ? `<button class="btn tinted sm" data-a="perm-help" data-v="${k}">איך משחררים</button>` : `<button class="btn filled sm" data-a="perm-ask" data-v="${k}">אישור</button>`;
    return `<div class="row">${icon(p.ic, 22)}<span class="body"><span class="t">${p.label}</span><span class="sub">${p.sub}</span></span>${pill}${act}</div>`;
  }).join('')}<button class="row" data-a="perm-help" data-v="all">${icon('info', 22)}<span class="body t acc">איך מנהלים הרשאות בהגדרות הטלפון</span><span class="chev">${icon('chev', 16)}</span></button></div>`;
}
function permSteps(k) {
  const what = k === 'all' ? 'מיקרופון / מצלמה / מיקום / התראות' : PERMS[k].chrome;
  if (isNative()) return `באפליקציית ${APP_NAME} ההרשאות נמצאות בהגדרות הטלפון:\n1. לחצו "פתיחת הגדרות האפליקציה" (או: הגדרות ← אפליקציות ← ${APP_NAME}).\n2. "הרשאות" ← ${what}.\n3. בחרו "אפשר רק בזמן השימוש באפליקציה".\n4. חזרו ל-${APP_NAME}.`;
  if (isAndroid()) {
    const notif = k === 'notif' || k === 'all' ? `\n\nהתראות אפשר לנהל גם מהגדרות הטלפון: הגדרות ← אפליקציות ← ${APP_NAME} ← התראות ← הפעלה.` : '';
    return `באנדרואיד ההרשאות של ${APP_NAME} שמורות ב-Chrome. הדרך הבטוחה:\n1. פתחו את אפליקציית Chrome (מהמסך הראשי).\n2. ⋮ למעלה ← הגדרות ← הגדרות אתרים ← כל האתרים.\n3. בחרו ${location.host}.\n4. ${what} ← "אפשר".\n5. חזרו ל-${APP_NAME}.\n\nאו: "פתיחה בדפדפן" ← הסמל שליד הכתובת (🔒) ← "הרשאות".\n\nאם גם שם זה חסום, Chrome עצמו חסום בטלפון: הגדרות הטלפון ← אפליקציות ← Chrome ← הרשאות ← ${what} ← "אפשר".${notif}`;
  }
  if (isIPhone()) {
    const notif = k === 'notif' || k === 'all' ? `\n\nהתראות: הגדרות ← התראות ← ${APP_NAME} ← "אפשר התראות".` : '';
    return `באייפון ההרשאות של ${APP_NAME} שמורות ב-Safari:\n1. פתחו את הגדרות הטלפון ← Safari.\n2. גללו ל"הגדרות לאתרים" ← ${what}.\n3. בחרו "אפשר" או "שאל".\n4. חזרו ל-${APP_NAME} ונסו שוב.\n\nאפשר גם: "פתיחה בדפדפן" ← aA ליד הכתובת ← "הגדרות אתר".${notif}`;
  }
  return `לחצו על הסמל שליד הכתובת (🔒 או ⓘ) ← "הרשאות האתר" ← ${what} ← "אפשר", ואז רעננו את הדף.`;
}
async function permHelp(k) {
  if (isNative()) {
    const r = await confirmSheet({ title: k === 'all' ? 'ניהול הרשאות' : `${PERMS[k].label} חסום/ה`, msg: permSteps(k), actions: [{ label: 'פתיחת הגדרות האפליקציה' }, { label: 'הבנתי' }] });
    if (r === 0) openAppSettings();
    return;
  }
  const r = await confirmSheet({ title: k === 'all' ? 'ניהול הרשאות' : `${PERMS[k].label} חסום/ה`, msg: permSteps(k), actions: [{ label: 'פתיחה בדפדפן' }, { label: 'העתקת הקישור' }, { label: 'הבנתי' }] });
  if (r === 0) openInBrowser();
  if (r === 1) copyText(location.origin + location.pathname);
}
async function permAsk(k) {
  if (inAppBrowser()) { permHelp(k); return; }
  try {
    if (k === 'mic' || k === 'cam') { const s = await navigator.mediaDevices.getUserMedia(k === 'mic' ? { audio: true } : { video: true }); s.getTracks().forEach(t => t.stop()); hud(`${PERMS[k].label} אושר/ה`); }
    else if (k === 'notif') { const p = await Notification.requestPermission(); if (p !== 'granted') throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); hud('ההתראות הופעלו'); setupPush(); }
    else if (k === 'geo') { await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 15000 })); hud('המיקום אושר'); }
  } catch (e) {
    const n = (e && (e.name || e.code)) || '';
    if (/NotFound/.test(n)) hud(`לא נמצא/ה ${PERMS[k].label} במכשיר`, true);
    else if (/NotReadable/.test(n)) hud(`${PERMS[k].label} תפוס/ה באפליקציה אחרת`, true);
    else permHelp(k);
  }
  refreshPerms();
}
Object.assign(A, {
  'perm-ask': b => permAsk(b.dataset.v),
  'perm-help': b => permHelp(b.dataset.v),
  'open-browser': b => { if (isNative()) openAppSettings(); else openInBrowser(b && b.dataset ? b.dataset.v : 0); },
  'app-settings': () => openAppSettings()
});

/* ====================== Safety: block, report, private account ====================== */
// Blocking hides the other person everywhere (feed, stories, chats, comments, activity) both ways,
// and stops messages and calls. A private account's posts and stories are only shown to followers it approved.
function blockedByMe() { return (S.user && S.user.blocked) || []; }
function iBlocked(uid) { return !!uid && blockedByMe().includes(uid); }
function blocksMe(uid) { return !!uid && ((S.members[uid] || {}).blocked || []).includes(me()); }
function isBlockedPair(uid) { return !!uid && uid !== me() && (iBlocked(uid) || blocksMe(uid)); }
function isPrivate(uid) { return !!(S.members[uid] || {}).private; }
function approvedList() { return (S.user && S.user.approved) || []; }
function approvedBy(uid) { return ((S.members[uid] || {}).approved || []).includes(me()); }
function canSee(uid) { return uid === me() || (!isBlockedPair(uid) && (!isPrivate(uid) || (isFollowing(uid) && approvedBy(uid)))); }
function pending(uid) { return isFollowing(uid) && isPrivate(uid) && !approvedBy(uid); }

async function saveMine(patch) {
  Object.assign(S.user, patch); S.members[me()] = Object.assign({}, S.members[me()], patch);
  softRender();
  await be.saveProfile(patch);
}
async function setBlock(uid, on) {
  if (local()) { hud('חסימה עובדת באתר, אחרי כניסה עם Google', true); return; }
  const u = S.members[uid] || { id: uid };
  if (on && await confirmSheet({ title: `לחסום את ${nameOf(u)}?`, msg: 'לא תראו אחד את השני בפיד, בסטוריז ובתגובות. הוא/היא לא יוכלו לשלוח לך הודעות או להתקשר. לא נודיע לו/ה.', actions: [{ label: 'חסימה', destructive: true }] }) !== 0) return;
  try {
    const blocked = on ? [...new Set(blockedByMe().concat(uid))] : blockedByMe().filter(x => x !== uid);
    await saveMine(on ? { blocked, approved: approvedList().filter(x => x !== uid) } : { blocked });
    if (on && isFollowing(uid)) { S.user.following = following().filter(x => x !== uid); await be.follow(uid, false); }
    haptic(12); hud(on ? 'נחסם/ה' : 'החסימה בוטלה');
    if (on && S.screen === 'chat' && otherOf(chat()) === uid) go('root', { tab: 'chats' });
  } catch (e) { fail(e); }
}
const REPORT_REASONS = ['הטרדה או בריונות', 'תוכן לא הולם', 'ספאם', 'התחזות', 'אלימות או איומים', 'משהו אחר'];
function reportForm(o) {
  if (local()) { hud('דיווח עובד באתר, אחרי כניסה עם Google', true); return; }
  let reason = '';
  const fs = formSheet({ title: 'דיווח', action: 'שליחה', tall: true,
    body: `<div class="section-h">מה הבעיה?</div><div class="list">${REPORT_REASONS.map((r, i) => `<button type="button" class="row rr" data-rr="${i}"><span class="body t">${r}</span><span class="rr-ck">${icon('check', 18)}</span></button>`).join('')}</div>
      <div class="section-h">פרטים (לא חובה)</div><div class="list"><textarea id="rp-text" class="tt-in" rows="3" maxlength="500" dir="auto" placeholder="מה קרה?"></textarea></div>
      <p class="section-f">הדיווח נשלח למנהלי Friends ולא נחשף למי שדיווחת עליו. אם מישהו מאיים עליך, ספרו גם למבוגר שאתם סומכים עליו.</p>`,
    async onOk(f) {
      if (!reason) { hud('בחרו סיבה', true); return false; }
      await be.report({ kind: o.kind, target: o.target || '', ref: o.ref || '', reason, text: f.querySelector('#rp-text').value.trim().slice(0, 500), quote: (o.text || '').slice(0, 300) });
      haptic(12); hud('תודה. הדיווח נשלח');
      if (o.target && !iBlocked(o.target)) setTimeout(async () => { if (await confirmSheet({ title: 'לחסום גם?', msg: `אפשר לחסום את ${nameOf(S.members[o.target])} כדי שלא תראו אחד את השני.`, actions: [{ label: 'חסימה', destructive: true }] }) === 0) setBlockNow(o.target); }, 400);
    } });
  fs.querySelectorAll('[data-rr]').forEach(b => b.onclick = () => { reason = REPORT_REASONS[+b.dataset.rr]; fs.querySelectorAll('[data-rr]').forEach(x => x.classList.toggle('on', x === b)); });
}
// block without asking again (already confirmed)
async function setBlockNow(uid) {
  try {
    await saveMine({ blocked: [...new Set(blockedByMe().concat(uid))], approved: approvedList().filter(x => x !== uid) });
    if (isFollowing(uid)) { S.user.following = following().filter(x => x !== uid); await be.follow(uid, false); }
    hud('נחסם/ה');
  } catch (e) { fail(e); }
}
async function postSafetyMenu(p) {
  const u = S.members[p.authorId] || { id: p.authorId };
  const r = await confirmSheet({ actions: [{ label: 'דיווח על הפוסט' }, { label: `חסימת ${first(nameOf(u))}`, destructive: true }] });
  if (r === 0) reportForm({ kind: p.kind === 'video' ? 'video' : 'post', target: p.authorId, ref: 'post/' + p.id, text: p.title || p.text || '' });
  if (r === 1) setBlock(p.authorId, true);
}
function privacySection() {
  const u = S.user || {}, bl = blockedByMe();
  return `<div class="section-h">פרטיות ובטיחות</div><div class="list">
    <label class="row">${icon('lock', 22)}<span class="body"><span class="t">חשבון פרטי</span><span class="sub">רק עוקבים שאישרת רואים את הפוסטים והסטוריז</span></span><input type="checkbox" class="sw" data-c="set-private" ${u.private ? 'checked' : ''}></label>
    <button class="row" data-a="close-list">${icon('star', 22)}<span class="body t">חברים קרובים</span><span class="val">${((S.user || {}).close || []).length || ''}</span><span class="chev">${icon('chev', 16)}</span></button>
    <button class="row" data-a="blocked-list">${icon('block', 22)}<span class="body t">משתמשים חסומים</span><span class="val">${bl.length || ''}</span><span class="chev">${icon('chev', 16)}</span></button>
    ${u.private ? `<button class="row" data-a="approved-list">${icon('people', 22)}<span class="body t">עוקבים מאושרים</span><span class="val">${approvedList().length || ''}</span><span class="chev">${icon('chev', 16)}</span></button>` : ''}
  </div>`;
}
async function managedList(title, ids, btn, onTap) {
  await loadUsers(ids);
  const fs = formSheet({ title, tall: true, body: ids.length ? `<div class="list av">${ids.map(id => { const u = S.members[id] || { id }; return `<div class="row">${avatar(u, 44)}<span class="body"><span class="t" style="font-weight:600">${esc(nameOf(u))}</span><span class="sub">${esc(uname(u))}</span></span><button class="btn tinted sm" data-ml="${esc(id)}">${btn}</button></div>`; }).join('')}</div>` : '<div class="empty"><b>הרשימה ריקה</b></div>' });
  fs.querySelectorAll('[data-ml]').forEach(b => b.onclick = async () => { b.disabled = true; try { await onTap(b.dataset.ml); b.closest('.row').remove(); } catch (e) { b.disabled = false; fail(e); } });
}
Object.assign(A, {
  'user-menu': async b => {
    const uid = b.dataset.v, u = S.members[uid] || { id: uid }, theyFollow = approvedList().includes(uid);
    const acts = [{ label: iBlocked(uid) ? 'ביטול החסימה' : `חסימת ${first(nameOf(u))}`, k: 'block', destructive: !iBlocked(uid) }, { label: 'דיווח על המשתמש', k: 'report' }]
      .concat(theyFollow ? [{ label: 'הסרה מהעוקבים', k: 'remove' }] : []).concat([{ label: 'העתקת שם המשתמש', k: 'copy' }]);
    const r = await confirmSheet({ title: nameOf(u), actions: acts }); const a = acts[r]; if (!a) return;
    if (a.k === 'block') setBlock(uid, !iBlocked(uid));
    if (a.k === 'report') reportForm({ kind: 'user', target: uid, ref: 'user/' + uid, text: uname(u) });
    if (a.k === 'remove') { try { await saveMine({ approved: approvedList().filter(x => x !== uid) }); hud('הוסר/ה מהעוקבים'); } catch (e) { fail(e); } }
    if (a.k === 'copy') copyText(uname(u));
  },
  block: b => setBlock(b.dataset.v, !iBlocked(b.dataset.v)),
  'set-private': async b => {
    const on = !!b.checked;
    if (local()) { b.checked = !on; hud('חשבון פרטי עובד באתר, אחרי כניסה עם Google', true); return; }
    try {
      // going private keeps everyone who already follows as approved, so nobody loses access by surprise
      const patch = { private: on };
      if (on && !(S.user.approved || []).length) { const fl = await be.followers(me()).catch(() => []); patch.approved = fl.filter(x => !iBlocked(x)).slice(0, 2000); }
      await saveMine(patch); hud(on ? 'החשבון פרטי עכשיו' : 'החשבון ציבורי עכשיו');
      if (closeForm) { closeForm(); setTimeout(settingsSheet, 360); }
    } catch (e) { b.checked = !on; fail(e); }
  },
  'blocked-list': () => managedList('משתמשים חסומים', blockedByMe(), 'ביטול חסימה', async uid => { await saveMine({ blocked: blockedByMe().filter(x => x !== uid) }); }),
  'approved-list': () => managedList('עוקבים מאושרים', approvedList(), 'הסרה', async uid => { await saveMine({ approved: approvedList().filter(x => x !== uid) }); }),
  'req-ok': async b => {
    const uid = b.dataset.v;
    try { await saveMine({ approved: [...new Set(approvedList().concat(uid))] }); sendNotif(uid, { type: 'accepted' }); hud('אושר/ה'); } catch (e) { fail(e); }
  },
  'req-no': async b => { try { await be.deleteNotif(b.dataset.n); S.notifs = (S.notifs || []).filter(n => n.id !== b.dataset.n); render(); } catch (e) { fail(e); } }
});

/* ====================== Notifications: mute, web push, badge ====================== */
// Muted chats and groups live on this device and in fr_push (so the push sender skips them too)
let mutedSet = new Set(LS.get('friends.muted') || []);
function isMuted(id) { return !!id && mutedSet.has(id); }
async function setMuted(id, on) {
  if (on) mutedSet.add(id); else mutedSet.delete(id);
  LS.set('friends.muted', [...mutedSet]); haptic(8); softRender();
  hud(on ? 'ההתראות הושתקו' : 'ההתראות פעילות');
  if (be.savePushPrefs && be.mode === 'live') be.savePushPrefs({ muted: [...mutedSet] }).catch(e => console.warn('mute', e));
}
A.mute = b => setMuted(b.dataset.v, !!b.checked);

// The website and iPhone (added to the home screen): Firebase Messaging through our service worker
async function setupWebPush() {
  if (pushReady || !S.user || be.mode !== 'live' || !be.webPushToken || !onSite || !('serviceWorker' in navigator) || !('Notification' in window) || Notification.permission !== 'granted') return;
  pushReady = true;
  try {
    const reg = swReg || await navigator.serviceWorker.ready;
    const t = await be.webPushToken(reg, VAPID_KEY);
    if (!t) { pushReady = false; return; }
    pushToken = t; await be.savePushToken(t);
    be.savePushPrefs({ muted: [...mutedSet] }).catch(() => {});
  } catch (e) { pushReady = false; console.warn('web push', e); }
}
// a notification tapped while the site was open in the background
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { const d = e.data || {}; if (d.type === 'open-push') openFromPush(d.data || {}); });
// the number on the app icon (installed web app; Android shows its own dot for notifications)
let badgeN = -1;
function updateBadge() {
  if (!S.user || !('setAppBadge' in navigator)) return;
  const n = S.chats.filter(c => chatUnread(c) && !isMuted(c.id)).length + S.groups.filter(g => groupUnread(g) && !isMuted(g.id)).length + unreadNotifs();
  if (n === badgeN) return; badgeN = n;
  (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}
setInterval(updateBadge, 4000);

// chat info: tap the name at the top of a private chat
A['chat-info'] = async b => {
  const uid = b.dataset.v, u = S.members[uid] || { id: uid }, cid = S.cid;
  const acts = [{ label: 'צפייה בפרופיל', k: 'profile' }, { label: isMuted(cid) ? 'ביטול ההשתקה' : 'השתקת ההתראות', k: 'mute' }]
    .concat(chatExtraActs(cid))
    .concat([{ label: 'דיווח', k: 'report' }, { label: iBlocked(uid) ? 'ביטול החסימה' : `חסימת ${first(nameOf(u))}`, k: 'block', destructive: !iBlocked(uid) }]);
  const r = await confirmSheet({ title: nameOf(u), actions: acts }); const a = acts[r]; if (!a) return;
  if (a.k === 'profile') openUser(uid);
  if (a.k === 'mute') setMuted(cid, !isMuted(cid));
  if (a.k === 'report') reportForm({ kind: 'user', target: uid, ref: 'chat/' + cid, text: uname(u) });
  if (a.k === 'block') setBlock(uid, !iBlocked(uid));
  if (a.run) a.run();
};

/* ====================== Chats: polls, location, stickers, disappearing messages, "read by" ====================== */
function pollHTML(m) {
  const opts = m.poll.options || [], votes = m.votes || {}, counts = opts.map(() => 0);
  Object.entries(votes).forEach(([who, k]) => { if (counts[k] != null && !iBlocked(who)) counts[k]++; });
  const total = counts.reduce((a, c) => a + c, 0), mine = votes[me()];
  return `<div class="cpoll"><b class="cpoll-q" dir="auto">📊 ${esc(m.poll.q)}</b>${opts.map((o, k) => { const pc = total ? Math.round(counts[k] * 100 / total) : 0; return `<button class="cpo${mine === k ? ' on' : ''}" data-a="cvote" data-v="${esc(m.id)}" data-i="${k}"><span class="cpo-bar" style="width:${mine != null ? pc : 0}%"></span><span class="cpo-t" dir="auto">${esc(o)}</span><span class="cpo-n">${mine != null ? counts[k] : ''}</span></button>`; }).join('')}<span class="cpoll-f">${total === 1 ? 'הצבעה אחת' : total + ' הצבעות'}${mine == null ? ' · בחרו כדי לראות תוצאות' : ''}</span></div>`;
}
// a small OpenStreetMap tile around the point, and a link to open it in maps
function locHTML(m) {
  const { lat, lng } = m.loc, z = 15, n = 2 ** z;
  const x = Math.floor((lng + 180) / 360 * n), r = lat * Math.PI / 180, y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
  const fx = ((lng + 180) / 360 * n - x) * 100, fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n - y) * 100;
  return `<a class="cloc" href="https://maps.google.com/?q=${+lat},${+lng}" target="_blank" rel="noopener"><span class="cloc-map"><img src="https://tile.openstreetmap.org/${z}/${x}/${y}.png" alt="מפה" loading="lazy"><span class="cloc-pin" style="left:${fx.toFixed(1)}%;top:${fy.toFixed(1)}%">${icon('pin', 30)}</span></span><span class="cloc-t">📍 ${m.authorId === me() ? 'המיקום שלך' : 'מיקום'} · פתיחה במפות</span><span class="cloc-c">© OpenStreetMap</span></a>`;
}
function groupSeenHTML(g, m) {
  if (!g || S.ch !== 'main') return '';
  const reads = g.reads || {}, who = (g.members || []).filter(id => id !== me() && (reads[id] || 0) >= m.createdAt && !iBlocked(id));
  if (!who.length) return '';
  return `<button class="seen gseen" data-a="seen-by" data-v="${esc(m.id)}">${who.length >= (g.members || []).length - 1 ? 'כולם קראו' : `נקרא ע״י ${who.length}`}</button>`;
}
const VANISH = [[0, 'כבוי'], [3600, 'שעה'], [86400, '24 שעות'], [604800, 'שבוע']];
function vanishLabel(v) { const x = VANISH.find(([s]) => s === v); return x ? x[1] : Math.round(v / 3600) + ' שעות'; }
function vanishOf(sc) { const x = sc.t === 'c' ? chat() : group(); return (x && x.vanish) || 0; }
async function vanishPicker(cur, save) {
  const r = await confirmSheet({ title: 'הודעות נעלמות', msg: 'הודעות חדשות יימחקו אחרי הזמן שבוחרים. הודעות ישנות לא משתנות.', actions: VANISH.map(([s, l]) => ({ label: (s === cur ? '✓ ' : '') + l })) });
  if (r < 0) return;
  try { await save(VANISH[r][0]); hud(VANISH[r][0] ? `הודעות נעלמות: ${VANISH[r][1]}` : 'ההודעות נשארות'); } catch (e) { fail(e); }
}
function chatExtraActs(cid) {
  const c = chat();
  return [{ label: `הודעות נעלמות: ${c && c.vanish ? vanishLabel(c.vanish) : 'כבוי'}`, k: 'vanish', run: () => vanishPicker((c && c.vanish) || 0, v => be.setChatVanish(cid, v)) }];
}
// my own expired messages get deleted for real (each person cleans up what they sent)
const vanishing = new Set();
function sweepExpired(list, sc) {
  const now = Date.now();
  list.filter(m => m.expireAt && m.expireAt < now && m.authorId === me() && !vanishing.has(m.id)).slice(0, 20).forEach(m => { vanishing.add(m.id); be.deleteMessage(sc, m).catch(() => {}); });
}
const STICKERS = ['😂', '🥹', '😍', '🥳', '😎', '🤯', '😭', '😡', '🤔', '🫠', '😴', '🤡', '👻', '💀', '🤖', '👽', '🐶', '🐱', '🦊', '🐼', '🐸', '🦄', '🐙', '🦖', '🍕', '🍔', '🍟', '🍩', '🍿', '🧋', '⚽', '🏀', '🎮', '🎧', '🎉', '🎂', '🔥', '💯', '❤️', '💔', '✨', '🌈', '👍', '👎', '👏', '🙏', '💪', '🫶'];
Object.assign(A, {
  'chat-poll': () => {
    formSheet({ title: 'סקר', action: 'שליחה', tall: true,
      body: `<div class="section-h">השאלה</div><div class="list"><div class="field"><input id="cp-q" maxlength="120" dir="auto" placeholder="מה שואלים?" autofocus></div></div>
        <div class="section-h">אפשרויות (שורה לכל אחת, 2 עד 8)</div><div class="list"><textarea id="cp-o" class="tt-in" rows="5" dir="auto" placeholder="כן&#10;לא&#10;אולי"></textarea></div>`,
      async onOk(f) {
        const q = f.querySelector('#cp-q').value.trim(), options = f.querySelector('#cp-o').value.split('\n').map(x => x.trim().slice(0, 60)).filter(Boolean).slice(0, 8);
        if (!q) { hud('כתבו שאלה', true); return false; }
        if (options.length < 2) { hud('צריך לפחות שתי אפשרויות', true); return false; }
        await send({ poll: { q, options }, votes: {} });
      } });
  },
  cvote: async b => {
    const m = msgById(b.dataset.v); if (!m) return; const k = +b.dataset.i, mine = (m.votes || {})[me()];
    haptic(8); m.votes = Object.assign({}, m.votes); if (mine === k) delete m.votes[me()]; else m.votes[me()] = k; render();
    try { await be.vote(scope(), m.id, mine === k ? null : k); } catch (e) { fail(e); }
  },
  'chat-loc': async () => {
    if (!navigator.geolocation) { hud('המכשיר לא תומך במיקום', true); return; }
    if (await confirmSheet({ title: 'לשלוח את המיקום שלך?', msg: 'המיקום הנוכחי יישלח פעם אחת לצ׳אט הזה. שתפו מיקום רק עם אנשים שאתם מכירים.', actions: [{ label: 'שליחת המיקום' }] }) !== 0) return;
    hud('מאתר מיקום…');
    navigator.geolocation.getCurrentPosition(async p => {
      try { await send({ loc: { lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5), acc: Math.round(p.coords.accuracy || 0) } }); } catch (e) {}
    }, e => { if (e && e.code === 1) permHelp('geo'); else hud('לא הצלחנו לאתר מיקום. נסו שוב בחוץ', true); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  },
  'chat-sticker': async () => {
    const top = `<div class="stk-grid">${STICKERS.map(s => `<button type="button" data-pick="s:${s}" aria-label="מדבקה ${s}">${s}</button>`).join('')}</div>`;
    const r = await confirmSheet({ title: 'מדבקות', top, actions: [] });
    if (typeof r === 'string' && r.startsWith('s:')) { try { await send({ sticker: r.slice(2) }); } catch (e) {} }
  },
  'seen-by': async () => {
    const g = group(); if (!g) return; const m = S.data.messages.filter(x => x.authorId === me())[0]; if (!m) return;
    const reads = g.reads || {}, ids = g.members.filter(id => id !== me());
    await loadUsers(ids);
    const yes = ids.filter(id => (reads[id] || 0) >= m.createdAt), no = ids.filter(id => !yes.includes(id));
    formSheet({ title: 'מי קרא', tall: true, body: `<div class="section-h">קראו (${yes.length})</div><div class="list av">${yes.map(id => `<div class="row">${avatar(S.members[id] || { id }, 36)}<span class="body t">${esc(nameOf(S.members[id]))}</span><span class="val">${hhmm(reads[id])}</span></div>`).join('') || '<div class="row"><span class="body sub">עוד אף אחד</span></div>'}</div>
      ${no.length ? `<div class="section-h">עוד לא (${no.length})</div><div class="list av">${no.map(id => `<div class="row">${avatar(S.members[id] || { id }, 36)}<span class="body t">${esc(nameOf(S.members[id]))}</span></div>`).join('')}</div>` : ''}` });
  },
  'vanish-group': () => { const g = group(); if (g) vanishPicker(g.vanish || 0, v => be.updateGroup(g, { vanish: v })); }
});

/* ====================== Social: close friends, photo filters, voice stories ====================== */
const closeList = () => (S.user && S.user.close) || [];
// a close-friends story shows only to the people on its author's list
function storyVisible(s) { return !s.close || s.authorId === me() || ((S.members[s.authorId] || {}).close || []).includes(me()); }
function closeToggle() { return `<div class="list" style="margin-top:12px"><label class="row">${icon('star', 22)}<span class="body"><span class="t">רק לחברים קרובים</span><span class="sub">${closeList().length ? closeList().length + ' אנשים ברשימה' : 'הרשימה ריקה. אפשר לערוך בהגדרות'}</span></span><input type="checkbox" class="sw" id="ns-close"></label></div>`; }
function closeExtra(f) { const c = f.querySelector('#ns-close'); return c && c.checked ? { close: true } : {}; }
A['close-list'] = async () => {
  const ids = [...new Set(following().concat(closeList()))].filter(x => x !== me() && !isBlockedPair(x));
  await loadUsers(ids);
  const fs = formSheet({ title: 'חברים קרובים', tall: true, body: `<p class="section-f" style="padding-top:0">סטורי "לחברים קרובים" יוצג רק להם. אף אחד לא מקבל הודעה כשמוסיפים או מסירים.</p>` + (ids.length ? `<div class="list av">${ids.map(id => { const u = S.members[id] || { id }; return `<label class="row">${avatar(u, 40)}<span class="body"><span class="t">${esc(nameOf(u))}</span><span class="sub">${esc(uname(u))}</span></span><input type="checkbox" class="sw" data-cl="${esc(id)}" ${closeList().includes(id) ? 'checked' : ''}></label>`; }).join('')}</div>` : '<div class="empty"><b>עקבו אחרי חברים כדי להוסיף אותם</b></div>') });
  fs.querySelectorAll('[data-cl]').forEach(c => c.onchange = async () => {
    const id = c.dataset.cl, next = c.checked ? [...new Set(closeList().concat(id))] : closeList().filter(x => x !== id);
    try { await saveMine({ close: next }); } catch (e) { c.checked = !c.checked; fail(e); }
  });
};

// photo filters: a CSS filter for the preview, the same filter baked into the picture when posting
const FILTERS = [['', 'מקור'], ['sepia(.25) saturate(1.35) brightness(1.05)', 'חם'], ['hue-rotate(-14deg) saturate(1.15) brightness(1.04)', 'קר'], ['grayscale(1) contrast(1.1)', 'שחור-לבן'], ['sepia(.55) contrast(1.1) brightness(.98)', 'וינטג׳'], ['contrast(1.35) saturate(1.25)', 'דרמטי'], ['brightness(1.18) contrast(.94) saturate(1.1)', 'בהיר'], ['saturate(1.8)', 'צבעוני']];
function filterChips(thumb) {
  return `<div class="flt-row" role="listbox" aria-label="פילטרים">${FILTERS.map(([f, l], i) => `<button type="button" class="flt${i ? '' : ' on'}" data-flt="${i}"><img src="${thumb}" alt="" style="filter:${f || 'none'}"><span>${l}</span></button>`).join('')}</div>`;
}
function wireFilters(fs) {
  fs.dataset.flt = '0';
  fs.querySelectorAll('[data-flt]').forEach(b => b.onclick = () => {
    fs.dataset.flt = b.dataset.flt; fs.querySelectorAll('[data-flt]').forEach(x => x.classList.toggle('on', x === b));
    const p = fs.querySelector('#cmp-prev'); if (p) p.style.filter = FILTERS[+b.dataset.flt][0] || 'none'; haptic(5);
  });
}
async function bake(src, f) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d'); x.filter = f; x.drawImage(img, 0, 0);
  return c.toDataURL('image/jpeg', .82);
}
async function applyFilter(im, k) {
  const f = (FILTERS[+k || 0] || FILTERS[0])[0];
  if (!f || !('filter' in CanvasRenderingContext2D.prototype)) return im; // no filter, or a browser that can't bake one
  try {
    const [full, thumb] = await Promise.all([bake(im.full.data, f), bake(im.thumb.data, f)]);
    return { full: Object.assign({}, im.full, { data: full }), thumb: Object.assign({}, im.thumb, { data: thumb }) };
  } catch (e) { return im; }
}

// voice story: up to 30 seconds of sound on a colored background
const STORY_BG = ['linear-gradient(135deg,#ff2d55,#ff9500)', 'linear-gradient(135deg,#5856d6,#0a84ff)', 'linear-gradient(135deg,#34c759,#30b0c7)', 'linear-gradient(135deg,#af52de,#ff2d55)', 'linear-gradient(135deg,#1c1c1e,#48484a)'];
function voiceStoryComposer() {
  if (local()) { hud('סטורי עובד באתר, אחרי כניסה עם Google', true); return; }
  let rec = null, audio = null, bg = 0, tick = null;
  const fs = formSheet({ title: 'סטורי קולי', action: 'שיתוף', tall: true, onClose() { stop(true); },
    body: `<div class="vs-prev" id="vs-prev" style="background:${STORY_BG[0]}"><span class="sv-wave">${icon('mic', 48, 1.6)}</span><b id="vs-t" dir="auto"></b><span class="vs-time" id="vs-time">0:00 / 0:30</span></div>
      <div class="vs-bgs">${STORY_BG.map((b, i) => `<button type="button" class="vs-bg${i ? '' : ' on'}" data-bg="${i}" style="background:${b}" aria-label="רקע ${i + 1}"></button>`).join('')}</div>
      <div class="btn-row" style="justify-content:center"><button type="button" class="btn filled" id="vs-rec">${icon('mic', 18)} הקלטה</button><button type="button" class="btn tinted" id="vs-play" disabled>${icon('play', 16)} השמעה</button></div>
      <div class="list" style="margin-top:12px"><div class="field"><input id="vs-text" maxlength="80" dir="auto" placeholder="כותרת (לא חובה)"></div></div>${closeToggle()}<p class="section-f">עד 30 שניות. הסטורי נעלם אחרי 24 שעות.</p>`,
    async onOk(f) {
      if (!audio) { hud('הקליטו משהו קודם', true); return false; }
      await be.addStory(null, f.querySelector('#vs-text').value.trim(), Object.assign({ audio, bg: STORY_BG[bg] }, closeExtra(f)));
      haptic(12); hud('הסטורי עלה');
    } });
  const recBtn = fs.querySelector('#vs-rec'), playBtn = fs.querySelector('#vs-play'), timeEl = fs.querySelector('#vs-time');
  fs.querySelector('#vs-text').oninput = e => { fs.querySelector('#vs-t').textContent = e.target.value; };
  fs.querySelectorAll('[data-bg]').forEach(b => b.onclick = () => { bg = +b.dataset.bg; fs.querySelector('#vs-prev').style.background = STORY_BG[bg]; fs.querySelectorAll('[data-bg]').forEach(x => x.classList.toggle('on', x === b)); });
  function stop(discard) { clearInterval(tick); if (rec && rec.state === 'recording') { rec.discard = !!discard; rec.stop(); } }
  recBtn.onclick = async () => {
    if (rec && rec.state === 'recording') { stop(false); return; }
    const mime = recorderMime(); if (mime === null) { hud('הדפדפן לא תומך בהקלטה', true); return; }
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch (e) { showMediaHelp(e, 'audio'); return; }
    const chunks = [], start = Date.now();
    rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 });
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop()); recBtn.innerHTML = `${icon('mic', 18)} הקלטה מחדש`; recBtn.classList.remove('red');
      if (rec.discard || !chunks.length) return;
      const dur = Math.max(1, Math.round((Date.now() - start) / 1000));
      audio = { data: await blobToDataURL(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' })), dur: Math.min(30, dur), mime: rec.mimeType || mime || 'audio/webm' };
      playBtn.disabled = false; timeEl.textContent = fmtDur(audio.dur);
    };
    rec.start(); haptic(10); recBtn.innerHTML = `${icon('xmark', 16)} עצירה`; recBtn.classList.add('red');
    tick = setInterval(() => { const s = Math.round((Date.now() - start) / 1000); timeEl.textContent = `${fmtDur(s)} / 0:30`; if (s >= 30) stop(false); }, 250);
  };
  playBtn.onclick = () => { if (audio) new Audio(audio.data).play().catch(() => {}); };
}

/* ====================== School: summaries and files by subject ====================== */
const FILE_MAX = 700 * 1024;
const fsize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const fileIcon = m => /pdf/.test(m) ? '📕' : /image/.test(m) ? '🖼️' : /word|document/.test(m) ? '📘' : /sheet|excel/.test(m) ? '📗' : /presentation|powerpoint/.test(m) ? '📙' : /audio/.test(m) ? '🎧' : '📄';
function schoolFilesHTML(g) {
  const all = S.data.files || [], subs = [...new Set(all.map(f => f.subject))].sort();
  const cur = subs.includes(S.fsub) ? S.fsub : '', list = cur ? all.filter(f => f.subject === cur) : all;
  return `<div class="section-h"><span>סיכומים וקבצים</span><button class="nb-btn" data-a="file-add">העלאה</button></div>
  ${subs.length > 1 ? `<div class="chips" style="padding-top:0"><button class="chip${cur ? '' : ' on'}" data-a="fsub" data-v="">הכל</button>${subs.map(s => `<button class="chip${s === cur ? ' on' : ''}" data-a="fsub" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
  ${list.length ? `<div class="list">${list.map(f => `<div class="row"><span class="file-ic">${fileIcon(f.mime || '')}</span><button class="body" data-a="file-open" data-v="${esc(f.id)}" style="text-align:start"><span class="t" dir="auto"><b class="subj">${esc(f.subject)}</b> ${esc(f.name)}</span><span class="sub">${esc(first(nameOf(S.members[f.by])))} · ${fsize(f.size || 0)} · ${ago(f.createdAt)}</span></button>${f.by === me() || isOwner(g) ? `<button class="icon-btn muted sm" data-a="file-del" data-v="${esc(f.id)}" aria-label="מחיקה">${icon('xmark', 14)}</button>` : ''}</div>`).join('')}</div>`
    : '<div class="list"><button class="row" data-a="file-add"><span class="body t acc">אין עדיין קבצים. העלו סיכום, דף עבודה או תמונה של הלוח</span></button></div>'}`;
}
Object.assign(A, {
  fsub: b => { S.fsub = b.dataset.v; render(); },
  'file-add': () => {
    if (local()) { hud('קבצים עובדים באתר, אחרי כניסה עם Google', true); return; }
    const subs = [...new Set((S.data.files || []).map(f => f.subject).concat((S.data.homework || []).map(h => h.subject)))].slice(0, 12);
    let picked = null;
    const fs = formSheet({ title: 'קובץ חדש', action: 'העלאה', tall: true,
      body: `<div class="section-h">מקצוע</div><div class="list"><div class="field"><input id="fl-subj" maxlength="30" dir="auto" placeholder="למשל: היסטוריה" value="${esc(S.fsub || '')}" list="fl-subs"><datalist id="fl-subs">${subs.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div></div>
        <div class="section-h">הקובץ</div><div class="list"><button type="button" class="row" id="fl-pick">${icon('file', 22)}<span class="body t acc" id="fl-name">בחירת קובץ (PDF, תמונה, Word…)</span></button></div>
        <p class="section-f">עד 700KB. תמונות מוקטנות אוטומטית. כל חברי הקבוצה יוכלו לפתוח ולהוריד.</p>`,
      async onOk(f) {
        const subject = f.querySelector('#fl-subj').value.trim();
        if (!subject) { hud('כתבו מקצוע', true); return false; }
        if (!picked) { hud('בחרו קובץ', true); return false; }
        hud('מעלה…'); await be.addFile(S.gid, Object.assign({ subject }, picked)); haptic(12); hud('הקובץ עלה'); S.fsub = subject; render();
      } });
    fs.querySelector('#fl-pick').onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file';
      inp.accept = 'application/pdf,image/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,audio/*';
      inp.onchange = async () => {
        const file = inp.files[0]; if (!file) return;
        try {
          let data, size = file.size, mime = file.type || 'application/octet-stream';
          if (/^image\//.test(mime) && !/gif|svg/.test(mime)) { const im = await chatImage(file); data = im.data; mime = 'image/jpeg'; size = Math.round(data.length * .75); }
          else { if (file.size > FILE_MAX) { hud('הקובץ גדול מדי (עד 700KB). נסו לצלם או לשמור כ-PDF קטן יותר', true); return; } data = await blobToDataURL(file); }
          picked = { name: file.name.slice(0, 80), mime, size, data };
          fs.querySelector('#fl-name').textContent = `${fileIcon(mime)} ${picked.name} · ${fsize(size)}`;
        } catch (e) { hud('לא הצלחנו לקרוא את הקובץ', true); }
      };
      inp.click();
    };
  },
  'file-open': async b => {
    const f = (S.data.files || []).find(x => x.id === b.dataset.v); if (!f) return;
    hud('פותח…');
    try {
      const d = await be.fileData(S.gid, f.id); if (!d) { hud('הקובץ כבר לא זמין', true); return; }
      if (/^image\//.test(f.mime)) { S.viewer = { src: d }; renderViewer(); return; }
      const blob = await (await fetch(d)).blob(), url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = f.name; a.target = '_blank'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { fail(e); }
  },
  'file-del': async b => {
    const f = (S.data.files || []).find(x => x.id === b.dataset.v); if (!f) return;
    if (await confirmSheet({ title: `למחוק את "${f.name}"?`, actions: [{ label: 'מחיקה', destructive: true }] }) !== 0) return;
    try { await be.deleteFile(S.gid, f.id); hud('נמחק'); } catch (e) { fail(e); }
  }
});

/* ====================== Group calls (mesh, up to 6) and screen sharing ====================== */
// screen sharing exists only in desktop browsers (not on phones)
function canShareScreen() { return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !matchMedia('(pointer:coarse)').matches; }
A['call-screen'] = () => { if (calls) calls.shareScreen(); };
let gcall = null, gTick = null;
function roomBanner(g) {
  const r = S.room, ids = r ? Object.keys(r.people) : [];
  if (!ids.length || (gcall && gcall.state.gid === g.id)) return '';
  return `<div class="room-bn"><span class="room-avs">${ids.slice(0, 4).map(id => avatar(S.members[id] || { id }, 26)).join('')}</span><span class="body"><b>${r.kind === 'video' ? '📹 שיחת וידאו' : '📞 שיחה קבוצתית'} פעילה</b><span>${ids.length === 1 ? 'משתתף/ת אחד/ת' : ids.length + ' משתתפים'}</span></span><button class="btn filled sm" data-a="gcall-join">הצטרפות</button></div>`;
}
const gcallUI = {
  open: () => renderGCall(), update: () => renderGCall(), toast: m => hud(m, true),
  close: () => { gcall = null; clearInterval(gTick); gTick = null; renderGCall(); softRender(); }
};
async function joinGroupCall(kind) {
  const g = group(); if (!g) return;
  if (!be.rtc) { hud('שיחות זמינות באתר, אחרי כניסה עם Google', true); return; }
  if (gcall || (calls && calls.state)) { hud('כבר יש שיחה פעילה', true); return; }
  if (inAppBrowser()) { showMediaHelp(null, kind); return; }
  if (!(await prePermission(kind))) return;
  const wasEmpty = !S.room || !Object.keys(S.room.people).length;
  gcall = GroupCall(be.rtc, g.id, gcallUI);
  try {
    await loadUsers(g.members);
    const k = await gcall.join(kind);
    if (wasEmpty) pushOut({ kind: 'call', gid: g.id, title: `${g.emoji} ${g.name}`, body: `${k === 'video' ? '📹' : '📞'} ${first(nameOf(S.members[me()]))} התחיל/ה שיחה קבוצתית. הצטרפו!` });
  } catch (e) {
    const c = gcall; gcall = null; if (c) c.leave().catch(() => {});
    renderGCall();
    if (e && e.code === 'full') hud(`השיחה מלאה (עד ${GROUP_CALL_MAX} משתתפים)`, true); else showMediaHelp(e, kind);
  }
}
function renderGCall() {
  let el = $('#gcall'); const st = gcall && gcall.state;
  if (!st || st.done) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'gcall'; el.className = 'gcall'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'שיחה קבוצתית');
    el.innerHTML = `<div class="gc-top"><b id="gc-title"></b><span id="gc-sub"></span></div><div class="gc-grid" id="gc-grid"></div><div class="call-ctl" id="gc-ctl"></div>`;
    phoneEl.appendChild(el);
    gTick = setInterval(renderGCall, 3000);
  }
  const g = S.groups.find(x => x.id === st.gid) || { name: '', emoji: '' };
  const ids = [...new Set([me()].concat(Object.keys(st.people || {})).concat(Object.keys(st.peers)))];
  $('#gc-title').textContent = `${g.emoji} ${g.name}`;
  $('#gc-sub').textContent = ids.length === 1 ? 'מחכים שעוד מישהו יצטרף…' : `${ids.length} בשיחה`;
  const grid = $('#gc-grid'); grid.dataset.n = Math.min(ids.length, 6);
  // keep each person's tile (re-creating a <video> would cut the sound)
  [...grid.children].forEach(t => { if (!ids.includes(t.dataset.u)) t.remove(); });
  ids.forEach(id => {
    let t = grid.querySelector(`[data-u="${CSS.escape(id)}"]`);
    const mine = id === me(), p = st.peers[id], stream = mine ? st.local : p && p.stream, u = S.members[id] || { id };
    if (!t) { t = document.createElement('div'); t.className = 'gc-tile'; t.dataset.u = id; t.innerHTML = `<video autoplay playsinline${mine ? ' muted' : ''}></video><span class="gc-av">${avatar(u, 72)}</span><span class="gc-n"></span>`; grid.appendChild(t); }
    const v = t.querySelector('video');
    if (stream && v.srcObject !== stream) { v.srcObject = stream; v.play().catch(() => {}); }
    const hasVideo = !!stream && stream.getVideoTracks().some(x => x.enabled && x.readyState === 'live') && !(mine && st.camOff);
    t.classList.toggle('vid', hasVideo); t.classList.toggle('me', mine);
    t.querySelector('.gc-n').textContent = (mine ? 'את/ה' : first(nameOf(u))) + (mine && st.muted ? ' 🔇' : '') + (!mine && p && p.state !== 'connected' ? ' · מתחבר…' : '') + (!mine && !p ? ' · מתחבר…' : '');
  });
  $('#gc-ctl').innerHTML = `<div class="cbtn-w"><button class="cbtn${st.muted ? ' on' : ''}" data-a="gcall-mute" aria-pressed="${st.muted}" aria-label="השתקה">${icon(st.muted ? 'micOff' : 'mic', 28)}</button><span>${st.muted ? 'מושתק' : 'השתקה'}</span></div>
    ${st.kind === 'video' ? `<div class="cbtn-w"><button class="cbtn${st.camOff ? ' on' : ''}" data-a="gcall-cam" aria-pressed="${st.camOff}" aria-label="מצלמה">${icon(st.camOff ? 'videoOff' : 'video', 28)}</button><span>מצלמה</span></div>` : ''}
    <div class="cbtn-w"><button class="cbtn red" data-a="gcall-leave" aria-label="יציאה מהשיחה">${icon('phoneDown', 34)}</button><span>יציאה</span></div>`;
}
Object.assign(A, {
  'gcall-start': async () => {
    if (S.room && Object.keys(S.room.people).length) { joinGroupCall(S.room.kind); return; }
    const r = await confirmSheet({ title: 'שיחה קבוצתית', msg: `כל חברי הקבוצה יקבלו התראה ויוכלו להצטרף (עד ${GROUP_CALL_MAX}).`, actions: [{ label: '📞 שיחה קולית' }, { label: '📹 שיחת וידאו' }] });
    if (r === 0) joinGroupCall('audio'); if (r === 1) joinGroupCall('video');
  },
  'gcall-join': () => joinGroupCall((S.room && S.room.kind) || 'audio'),
  'gcall-mute': () => { if (gcall) gcall.toggleMute(); },
  'gcall-cam': () => { if (gcall) gcall.toggleCam(); },
  'gcall-leave': () => { if (gcall) gcall.leave(); }
});
window.addEventListener('pagehide', () => { if (gcall) gcall.leave(); });

/* ---------- boot ---------- */
async function boot() {
  render(true);
  const live = FIREBASE_CONFIG && onSite;
  try { be = live ? await LiveBackend(FIREBASE_CONFIG) : LocalBackend(); }
  catch (e) { console.error(e); be = LocalBackend(); hud('לא הצלחנו להתחבר לשרת. בדקו את החיבור ונסו שוב.', true); }
  // Chrome came back from Google (redirect sign-in) for the Android app: hand the token back
  if (params.has('native_login') && !isNative() && be.googleTokenFromRedirect) be.googleTokenFromRedirect().then(t => { if (t) nativeLoginDone(t); });
  be.onAuth(u => {
    S.booting = false; S.user = u; S.pending = null;
    if (!u) { stopAll(); S.screen = 'root'; S.tab = 'home'; S.anim = 'fade'; render(true); return; }
    // already signed in to Google here (e.g. from Nest): ask once before using that account
    if (be.mode === 'live' && !LS.get('friends.joined')) { S.pending = u; S.user = null; S.anim = 'fade'; render(true); return; }
    enter(u);
  });
}
A['continue-as'] = () => { const u = S.pending; if (!u) return; LS.set('friends.joined', 1); S.pending = null; S.user = u; enter(u); };
function enter(u) {
  {
    S.members[u.id] = u; watchAll(); S.anim = 'fade'; render(true);
    setTimeout(setupPush, 1500);
    // opened from a notification on the website: ?pc=<chat> or ?pg=<group>
    const pc = params.get('pc'), pg = params.get('pg');
    if (pc || pg) setTimeout(() => openFromPush({ cid: pc, gid: pg }), 900);
    if (be.savePushPrefs && be.mode === 'live' && mutedSet.size) be.savePushPrefs({ muted: [...mutedSet] }).catch(() => {});
    setTimeout(checkAppUpdate, 4000);
    // a shared post link (?p=…) opens that post once the feed has loaded
    const se = params.get('e'); if (se) setTimeout(() => go('event', { eid: se }), 300);
    if (params.has('ob') && !standalone()) setTimeout(() => hud('פתוח בדפדפן. הרשאות: 🔒 ליד הכתובת ← הרשאות'), 1200);
    const sp = params.get('p'); if (sp) { let n = 0; const t = setInterval(() => { if (postById(sp) || ++n > 30) { clearInterval(t); if (postById(sp)) openPost(sp); } }, 500); }
    if (S.joinCode) { const c = S.joinCode; S.joinCode = ''; setTimeout(() => joinForm(c), 400); }
  }
}
try { history.replaceState({ screen: 'root', tab: 'home' }, ''); } catch (e) {}
boot();