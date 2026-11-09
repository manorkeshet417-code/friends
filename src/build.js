// Assembles www/js/app.js from the parts of Nest's app that Friends keeps, plus the Friends code.
// Run once: node src/build.js (the result is edited directly afterwards).
const fs = require('fs'), path = require('path');
const here = __dirname, L = fs.readFileSync(path.join(here, 'nest-app.js'), 'utf8').replace(/\r\n/g, '\n').split('\n');
const lines = (a, b) => L.slice(a - 1, b).join('\n');
const part = n => fs.readFileSync(path.join(here, n), 'utf8').replace(/\r\n/g, '\n');

let out = [
  lines(1, 81),
  part('part-core.js').replace('@@NAV@@', lines(112, 133)),
  lines(185, 202),
  lines(203, 263),
  lines(264, 273),
  lines(342, 371),
  lines(433, 603),
  lines(913, 926),
  lines(927, 1013),
  lines(1014, 1043),
  lines(1056, 1123),
  lines(1143, 1174),
  lines(1221, 1263),
  lines(1272, 1310),
  lines(1417, 1637),
  part('part-friends.js'),
  lines(1638, 1712)
].join('\n');

const rep = (a, b) => { if (!out.includes(a)) throw new Error('missing: ' + a.slice(0, 100)); out = out.replace(a, () => b); };
out = out.replace(/'nest\./g, "'friends.").replace(/\bNest\b/g, 'Friends');
rep("// Friends app: state, screens and actions", "// Friends app: state, screens and actions (built on Nest's chat, calls and groups)");
rep("import { FIREBASE_CONFIG, VAPID_KEY, PUSH_URL } from './config.js';", "import { FIREBASE_CONFIG } from './config.js';");
rep("screen: 'root', tab: 'groups', gid: null, gtab: 'feed', cid: null,", "screen: 'root', tab: 'home', gid: null, gtab: 'chat', ch: 'main', cid: null, uid: null, watch: null,\n  posts: [], stories: [], story: null, fcount: {}, flist: {}, suggest: null,");
rep("data: { posts: [], messages: [], events: [], images: [], lists: [], capsules: [], quotes: [] }, dm: [],", "data: { messages: [], events: [], images: [], homework: [], exams: [], timetable: {} }, dm: [],");
rep("const unsub = { groups: null, chats: null, incoming: null, group: [], dm: null, comments: null };", "const unsub = { me: null, groups: null, chats: null, posts: null, stories: null, incoming: null, group: [], dm: null, comments: null };");
rep("const scope = () => S.screen === 'chat' ? { t: 'c', id: S.cid } : { t: 'g', id: S.gid };", "const scope = () => S.screen === 'chat' ? { t: 'c', id: S.cid } : { t: 'g', id: S.gid, ch: S.ch };");
rep("function draftKey() { return S.screen === 'chat' ? 'dm:' + S.cid : 'chat:' + S.gid; }", "function draftKey() { return S.screen === 'chat' ? 'dm:' + S.cid : 'chat:' + S.gid + ':' + S.ch; }");
// navigation: profiles and the video watch page
rep("  if (screen === 'chat') { closeGroup(); if (o.cid && o.cid !== S.cid) openDM(o.cid); }",
  "  if (screen === 'chat') { closeGroup(); if (o.cid && o.cid !== S.cid) openDM(o.cid); }\n  if (screen === 'group' && o.ch && o.ch !== S.ch) { S.ch = o.ch; watchChannel(); }\n  if (screen === 'user') { closeGroup(); closeDM(); if (o.uid) S.uid = o.uid; }\n  if (screen === 'watch') { closeGroup(); closeDM(); if (o.pid) S.watch = o.pid; }");
rep("history.pushState({ screen, gid: S.gid, cid: S.cid, tab: S.tab, gtab: S.gtab, hub: S.hub }, '')", "history.pushState({ screen, gid: S.gid, cid: S.cid, tab: S.tab, gtab: S.gtab, ch: S.ch, uid: S.uid, pid: S.watch }, '')");
rep("  if (closeForm) { closeForm(); return; }\n", "  if (S.story) { closeStory(); return; }\n  if (closeForm) { closeForm(); return; }\n");
// render: routes, accent, keep a playing video across re-renders
rep("function softRender(chatChanged) { if (S.booting) return; render(false, chatChanged); }",
  "function softRender(chatChanged) {\n  if (S.booting) return;\n  const v = S.screen === 'watch' && $('.yt-player video'); if (v && !v.paused) return; // never interrupt a video\n  render(false, chatChanged);\n}");
rep("g && g.color) || 'orange'})`", "g && g.color) || 'blue'})`");
rep("  else if (!S.user) { bare = true; html = viewLogin(); }", "  else if (!S.user) { bare = true; html = viewLogin(); }\n  else if (!S.user.username) { bare = true; html = viewUsername(); }");
rep("  else { S.screen = 'root'; html = S.tab === 'chats' ? viewChats() : S.tab === 'profile' ? viewProfile() : viewGroups(); tabs = rootTabs(); }",
  "  else if (S.screen === 'user' && S.uid) { html = viewProfilePage(S.uid, false); }\n  else if (S.screen === 'watch' && S.watch) { html = viewWatch(); }\n  else { S.screen = 'root'; html = S.tab === 'chats' ? viewChats() : S.tab === 'profile' ? viewProfilePage(me(), true) : S.tab === 'videos' ? viewVideos() : viewHome(); tabs = rootTabs(); }");
rep("const solo = S.screen === 'chat' || S.screen === 'groupInfo';", "const solo = S.screen === 'chat' || S.screen === 'groupInfo' || S.screen === 'user' || S.screen === 'watch';");
rep("  app.innerHTML = (S.booting ? '' : openInBrowserBanner()) + html;\n  // my live SOS / escort rides in the sticky top bar, so it stays in view while scrolling\n  const sbar = S.booting ? '' : safetyBar();\n  if (sbar) { const nb = app.querySelector('.navbar'); if (nb) nb.insertAdjacentHTML('beforeend', sbar); else app.insertAdjacentHTML('afterbegin', sbar); } navEl.innerHTML = tabs;",
  "  const keep = {}; app.querySelectorAll('[data-keep]').forEach(el => { keep[el.dataset.keep] = { el, playing: el.tagName === 'VIDEO' && !el.paused }; });\n  app.innerHTML = (S.booting ? '' : openInBrowserBanner()) + html;\n  app.querySelectorAll('[data-keep]').forEach(el => { const k = keep[el.dataset.keep]; if (k) { el.replaceWith(k.el); if (k.playing) k.el.play().catch(() => {}); } });\n  navEl.innerHTML = tabs;");
rep("  onScroll(); loadFullImages();\n}", "  onScroll(); loadFullImages(); loadPostImages();\n}");
// calls: no push sender in Friends
rep("    // wake the other phone even if Friends is closed there\n    pushOut({ cid: chatId(me(), uid), to: uid, urgent: true, tag: 'call:' + me(), title: nameOf(S.user), text: kind === 'video' ? '📹 שיחת וידאו נכנסת' : '📞 שיחה נכנסת' });\n", "");
// files picked for posts, videos, stories and the profile photo
rep("fileEl.addEventListener('change', async () => {\n", "fileEl.addEventListener('change', async () => {\n  if (await pickHook()) return;\n");
// boot
rep("    if (!u) { stopAll(); S.screen = 'root'; S.tab = 'groups'; S.anim = 'fade'; render(true); return; }", "    if (!u) { stopAll(); S.screen = 'root'; S.tab = 'home'; S.anim = 'fade'; render(true); return; }");
rep("    S.members[u.id] = u; watchAll(); setupPush(); S.anim = 'fade'; render(true);",
  "    S.members[u.id] = u; watchAll(); S.anim = 'fade'; render(true);\n    // a shared post link (?p=…) opens that post once the feed has loaded\n    const sp = params.get('p'); if (sp) { let n = 0; const t = setInterval(() => { if (postById(sp) || ++n > 30) { clearInterval(t); if (postById(sp)) openPost(sp); } }, 500); }");
rep("try { history.replaceState({ screen: 'root', tab: 'groups' }, ''); } catch (e) {}", "try { history.replaceState({ screen: 'root', tab: 'home' }, ''); } catch (e) {}");

// Nest-only actions (SOS, escort, capsules, quotes, lists, push) are dropped
function dropEntry(key) {
  const ls = out.split('\n'), i = ls.findIndex(l => l.startsWith(`  ${key}:`) || l.startsWith(`  '${key}':`));
  if (i < 0) throw new Error('no entry ' + key);
  let j = i;
  if (/\{\s*$/.test(ls[i])) { while (ls[j] !== '  },' && ls[j] !== '  }') j++; }
  ls.splice(i, j - i + 1); out = ls.join('\n');
}
['checkin', 'sos-help', 'sos-ack', 'sos-ok', 'escort', 'escort-done', 'escort-more', 'mute-toggle', 'notif-hide', 'sos-contacts', 'safety-toggle',
  'sos-add', 'sos-add-member', 'sos-del', 'sos-call', 'sos-alert-call', 'sos-alert-open', 'sos-alert-close', 'open-hub', 'new-capsule', 'open-capsule',
  'capsule-menu', 'new-quote', 'laugh', 'quote-menu', 'new-list', 'item-toggle', 'item-del', 'list-menu', 'push-test', 'sos-person',
  'attach', 'poll-toggle', 'poll-add', 'vote', 'clear-img', 'day-form', 'post-form', 'name-form', 'bday-form'].forEach(dropEntry);
rep("notif: async () => { LS.set('friends.notifAsked', 1); setTimeout(setupPush, 500); ", "notif: async () => { ");

fs.writeFileSync(path.join(here, '..', 'www', 'js', 'app.js'), out);
console.log('built app.js:', out.split('\n').length, 'lines');
