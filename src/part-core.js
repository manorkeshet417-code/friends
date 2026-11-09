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
  if (document.hidden) notify(title, body, key);
  else if (!viewing) hud(`${title}: ${body}`.slice(0, 70));
}
@@NAV@@
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
    S.chats = list.filter(c => c.lastBy || c.id === S.cid).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    await loadUsers(list.map(otherOf));
    list.forEach(c => activity('c:' + c.id, nameOf(S.members[otherOf(c)]), c.lastMessage || '', c.lastAt, c.lastBy, S.cid === c.id && S.screen === 'chat'));
    if (S.screen === 'chat') maybeRead();
    softRender();
  }, fail);
  unsub.posts = be.watchPosts(async list => { S.posts = list; await loadUsers(list.map(p => p.authorId)); softRender(); }, fail);
  unsub.stories = be.watchStories(async list => { S.stories = list; await loadUsers(list.map(s => s.authorId)); if (!S.story) softRender(); }, e => console.warn('stories', e));
  if (be.rtc) { calls = CallManager(be.rtc, callUI); unsub.incoming = calls.watchIncoming(); }
  loadUsers(following());
  refreshMediaPerm();
}
function stopAll() {
  closeGroup(); closeDM();
  ['me', 'groups', 'chats', 'incoming', 'posts', 'stories'].forEach(k => { if (unsub[k]) { try { unsub[k](); } catch (e) {} unsub[k] = null; } });
  S.groups = []; S.chats = []; S.posts = []; S.stories = []; S.suggest = null; S.fcount = {}; S.flist = {}; prevAct = {};
}
const emptyData = () => ({ messages: [], events: [], images: [], homework: [], exams: [], timetable: {} });
function openGroup(gid) {
  closeGroup(); S.gid = gid; S.ch = 'main'; S.gtab = 'chat'; S.data = emptyData();
  const g = group();
  const watchKind = k => be.watch(gid, k, list => { S.data[k] = list; softRender(); }, fail);
  ['events', 'images'].forEach(k => unsub.group.push(watchKind(k)));
  if (gtype(g) === 'school') { ['homework', 'exams'].forEach(k => unsub.group.push(watchKind(k))); unsub.group.push(be.watchTimetable(gid, d => { S.data.timetable = d; softRender(); }, fail)); }
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
    S.data.messages = list; await loadUsers(list.map(m => m.authorId));
    if (S.gtab === 'chat' && !document.hidden) markGroupChatSeen();
    softRender(true);
  }, fail);
}
function closeGroup() { unsub.group.forEach(u => { try { u(); } catch (e) {} }); unsub.group = []; if (unsubCh) { try { unsubCh(); } catch (e) {} unsubCh = null; } S.gid = null; S.data = emptyData(); }
