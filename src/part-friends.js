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
const followBtn = (uid, wide) => uid === me() ? '' : `<button class="btn ${isFollowing(uid) ? 'tinted' : 'filled'} sm${wide ? ' grow' : ''}" data-a="follow" data-v="${esc(uid)}">${isFollowing(uid) ? 'עוקב/ת' : 'מעקב'}</button>`;

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
  ${live ? `<div class="btn-row"><button class="btn filled block" data-a="google">המשך עם Google</button></div>
    <p class="section-f" style="text-align:center">נכנסים עם חשבון Google. אחר כך בוחרים שם משתמש.</p>`
  : `<form id="local-login"><div class="section-h">איך קוראים לך?</div><div class="list"><div class="field"><input id="local-name" autocomplete="given-name" placeholder="השם שלך" aria-label="השם שלך" autofocus></div></div>
    <div class="btn-row"><button class="btn filled block">כניסה</button></div>
    <p class="section-f" style="text-align:center">זו תצוגה מקדימה: הנתונים נשמרים רק בדף הזה. באתר נכנסים עם Google.</p></form>`}`;
}
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
function circle() { return new Set(following().concat(me())); }
function storyGroups() {
  const fol = circle(), by = {};
  S.stories.forEach(s => { if (fol.has(s.authorId)) (by[s.authorId] = by[s.authorId] || []).push(s); });
  Object.values(by).forEach(l => l.sort((a, b) => a.createdAt - b.createdAt));
  const unseen = u => by[u].some(s => !(s.seen || []).includes(me()));
  const others = Object.keys(by).filter(u => u !== me()).sort((a, b) => unseen(b) - unseen(a));
  return { by, others, unseen };
}
function storiesRow() {
  const { by, others, unseen } = storyGroups(), mine = by[me()] || [];
  return `<div class="stories" role="list">
    <button class="story" role="listitem" data-a="${mine.length ? 'story-open' : 'new-story'}" data-v="${esc(me())}"><span class="ring${mine.length ? '' : ' none'}">${avatar(S.user, 62)}${mine.length ? '' : `<span class="st-plus">${icon('plus', 13, 3)}</span>`}</span><span class="st-n">הסטורי שלך</span></button>
    ${others.map(u => `<button class="story" role="listitem" data-a="story-open" data-v="${esc(u)}"><span class="ring${unseen(u) ? '' : ' seen'}">${avatar(S.members[u] || { id: u }, 62)}</span><span class="st-n">${esc(first(nameOf(S.members[u])))}</span></button>`).join('')}
  </div>`;
}
function viewHome() {
  const fol = circle(), feed = S.posts.filter(p => p.kind === 'photo' && fol.has(p.authorId));
  return bar({ title: 'Friends', eyebrow: local() ? '<span class="pill">תצוגה מקדימה</span>' : '', trail: `<button class="nb-btn" data-a="search" aria-label="חיפוש חברים">${icon('search', 23)}</button><button class="nb-btn" data-a="create" aria-label="יצירה">${icon('plusSq', 24)}</button>` }) +
  storiesRow() + permCard() +
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
    <header class="ig-h"><button class="ig-u" data-a="user" data-v="${esc(p.authorId)}">${avatar(a, 34)}<span class="ig-n"><b>${esc(nameOf(a))}</b><span>${esc(uname(a))}</span></span></button><span class="when">${ago(p.createdAt)}</span>${p.authorId === me() ? `<button class="icon-btn muted sm" data-a="post-menu" data-v="${esc(p.id)}" aria-label="אפשרויות">${icon('more', 20)}</button>` : ''}</header>
    <div class="ig-media" data-a="dbl-like" data-v="${esc(p.id)}" style="aspect-ratio:${ratio}"><img data-pid="${esc(p.id)}" src="${pimg[p.id] || p.thumb}" alt="${esc(p.text || 'תמונה')}"><span class="ig-heart">${icon('heartF', 96)}</span></div>
    <div class="ig-act"><button class="icon-btn${liked ? ' liked' : ''}" data-a="like" data-v="${esc(p.id)}" aria-pressed="${liked}" aria-label="לייק">${icon(liked ? 'heartF' : 'heart', 27)}</button><button class="icon-btn" data-a="comments" data-v="${esc(p.id)}" aria-label="תגובות">${icon('comment', 26)}</button><button class="icon-btn" data-a="share-post" data-v="${esc(p.id)}" aria-label="שליחה לחבר/ה">${icon('send', 24)}</button></div>
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
    <img class="sv-img" src="${s.image}" alt="">
    ${s.text ? `<div class="sv-text" dir="auto">${esc(s.text)}</div>` : ''}
    ${uid === me() ? `<div class="sv-seen">${icon('people', 16)} ${(s.seen || []).length} צפו</div>` : ''}
    <button class="sv-prev" data-a="story-step" data-v="-1" aria-label="הקודם"></button><button class="sv-next" data-a="story-step" data-v="1" aria-label="הבא"></button>`;
  storyT = setTimeout(() => storyStep(1), 5000);
}
function storyStep(d) {
  const st = S.story; if (!st) return;
  const list = st.by[st.order[st.u]] || [];
  st.i += d;
  if (st.i >= list.length) { st.u++; st.i = 0; if (st.u >= st.order.length) { closeStory(); return; } }
  else if (st.i < 0) { if (st.u > 0) { st.u--; st.i = (st.by[st.order[st.u]] || []).length - 1; } else st.i = 0; }
  renderStory();
}
function closeStory() { clearTimeout(storyT); S.story = null; renderStory(); softRender(); }

/* ---------- videos (YouTube) ---------- */
function videoCard(p, compact) {
  const a = S.members[p.authorId] || { id: p.authorId }, v = p.video || {};
  return `<div class="yt${compact ? ' sm' : ''}"><button class="yt-thumb" data-a="watch" data-v="${esc(p.id)}" aria-label="צפייה: ${esc(p.title || 'סרטון')}"><img src="${v.thumb}" alt=""><span class="yt-dur">${fmtDur(v.dur || 0)}</span></button>
    <div class="yt-meta">${compact ? '' : `<button class="yt-av" data-a="user" data-v="${esc(p.authorId)}" aria-label="${esc(nameOf(a))}">${avatar(a, 38)}</button>`}<button class="yt-txt" data-a="watch" data-v="${esc(p.id)}"><b dir="auto">${esc(p.title || p.text || 'סרטון')}</b><span>${esc(nameOf(a))} · ${views(p.views)} · ${ago(p.createdAt)}</span></button></div></div>`;
}
const views = n => !n ? 'אין צפיות' : n === 1 ? 'צפייה אחת' : n + ' צפיות';
function viewVideos() {
  const all = S.posts.filter(p => p.kind === 'video' && p.video), f = S.vfilter || 'all';
  const list = f === 'friends' ? all.filter(p => circle().has(p.authorId))
    : f === 'popular' ? all.slice().sort((a, b) => ((b.views || 0) + 4 * (b.likes || []).length) - ((a.views || 0) + 4 * (a.likes || []).length))
    : f === 'mine' ? all.filter(p => p.authorId === me()) : all;
  return bar({ title: 'סרטונים', trail: `<button class="nb-btn" data-a="new-video" aria-label="העלאת סרטון">${icon('plusSq', 24)}</button>` }) +
  `<div class="chips">${[['all', 'הכל'], ['friends', 'מהחברים'], ['popular', 'פופולרי'], ['mine', 'שלי']].map(([k, l]) => `<button class="chip${k === f ? ' on' : ''}" data-a="vfilter" data-v="${k}">${l}</button>`).join('')}</div>` +
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
  const more = S.posts.filter(x => x.kind === 'video' && x.video && x.id !== p.id).slice(0, 12);
  return bar({ inline: true, back: 'סרטונים', title: '' }) +
  `<div class="yt-player" style="aspect-ratio:${p.video.w && p.video.h ? Math.max(.56, Math.min(1.78, p.video.w / p.video.h)) : 1.78}">${src ? `<video data-keep="v-${esc(p.video.id)}" src="${src}" controls autoplay playsinline></video>` : `<img src="${p.video.thumb}" alt=""><div class="spinner"></div>`}</div>
  <div class="yt-info"><h2 dir="auto">${esc(p.title || 'סרטון')}</h2><span class="sub">${views(p.views)} · ${ago(p.createdAt)}</span>
    <div class="yt-ch"><button class="yt-chn" data-a="user" data-v="${esc(p.authorId)}">${avatar(a, 40)}<span><b>${esc(nameOf(a))}</b><span>${esc(uname(a))}</span></span></button>${followBtn(p.authorId)}</div>
    <div class="yt-acts"><button class="pill-btn${liked ? ' on' : ''}" data-a="like" data-v="${esc(p.id)}" aria-pressed="${liked}">${icon(liked ? 'heartF' : 'heart', 18)} ${likes.length || 'לייק'}</button><button class="pill-btn" data-a="comments" data-v="${esc(p.id)}">${icon('comment', 18)} ${p.commentCount || 'תגובות'}</button><button class="pill-btn" data-a="share-post" data-v="${esc(p.id)}">${icon('send', 17)} שליחה</button>${p.authorId === me() ? `<button class="pill-btn" data-a="post-menu" data-v="${esc(p.id)}" aria-label="מחיקה">${icon('trash', 18)}</button>` : ''}</div>
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
  const posts = S.posts.filter(p => p.authorId === uid), photos = posts.filter(p => p.kind === 'photo'), vids = posts.filter(p => p.kind === 'video' && p.video);
  const tab = S.ptab || 'photos', fc = S.fcount[uid];
  const head = isRoot
    ? bar({ title: uname(u) || nameOf(u), trail: `<button class="nb-btn" data-a="create" aria-label="יצירה">${icon('plusSq', 24)}</button><button class="nb-btn" data-a="settings" aria-label="הגדרות">${icon('gear', 24)}</button>` })
    : bar({ inline: true, back: 'חזרה', title: uname(u) || nameOf(u) });
  return head + `<div class="pf">
    <div class="pf-top">${avatar(u, 88)}<div class="pf-stats"><div><b>${posts.length}</b><span>פוסטים</span></div><button data-a="people-list" data-v="followers:${esc(uid)}"><b>${fc === null || fc === undefined ? '·' : fc}</b><span>עוקבים</span></button><button data-a="people-list" data-v="following:${esc(uid)}"><b>${(u.following || []).length}</b><span>נעקבים</span></button></div></div>
    <div class="pf-name">${esc(nameOf(u))}</div>${u.bio ? `<div class="pf-bio" dir="auto">${linkify(u.bio)}</div>` : ''}
    <div class="pf-btns">${mine ? `<button class="btn tinted sm grow" data-a="edit-profile">עריכת פרופיל</button><button class="btn tinted sm grow" data-a="share-profile">שיתוף פרופיל</button>`
      : `${followBtn(uid, true)}<button class="btn tinted sm grow" data-a="dm" data-v="${esc(uid)}">הודעה</button><button class="btn tinted sm" data-a="call-user" data-v="${esc(uid)}" data-k="audio" aria-label="שיחה קולית">${icon('phone', 18)}</button><button class="btn tinted sm" data-a="call-user" data-v="${esc(uid)}" data-k="video" aria-label="שיחת וידאו">${icon('video', 19)}</button>`}</div>
  </div>
  <div class="seg pf-seg" role="tablist"><button data-a="ptab" data-v="photos" class="${tab === 'photos' ? 'on' : ''}">${icon('grid', 17)} תמונות</button><button data-a="ptab" data-v="videos" class="${tab === 'videos' ? 'on' : ''}">${icon('playRect', 18)} סרטונים</button></div>
  ${tab === 'photos'
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
const personRow = u => `<div class="row">${avatar(u, 44)}<button class="body pr-open" data-open="${esc(u.id)}" style="text-align:start"><span class="t" style="font-weight:600">${esc(nameOf(u))}</span><span class="sub">${esc(uname(u))}</span></button>${u.id === me() ? '' : `<button class="btn ${isFollowing(u.id) ? 'tinted' : 'filled'} sm" data-fol="${esc(u.id)}">${isFollowing(u.id) ? 'עוקב/ת' : 'מעקב'}</button>`}</div>`;
function wirePeople(root) {
  root.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { if (closeForm) closeForm(); openUser(b.dataset.open); });
  root.querySelectorAll('[data-fol]').forEach(b => b.onclick = async () => { const on = !isFollowing(b.dataset.fol); await toggleFollow(b.dataset.fol, on); b.className = `btn ${on ? 'tinted' : 'filled'} sm`; b.textContent = on ? 'עוקב/ת' : 'מעקב'; });
}
function openUser(uid) { if (uid === me()) { go('root', { tab: 'profile' }); return; } S.ptab = 'photos'; loadUsers([uid], true).then(() => softRender()); go('user', { uid }); }
async function toggleFollow(uid, on) {
  if (local()) { hud('מעקב אחרי חברים עובד באתר, אחרי כניסה עם Google', true); return; }
  haptic(8);
  S.user.following = on ? [...new Set(following().concat(uid))] : following().filter(x => x !== uid);
  if (S.fcount[uid] != null) S.fcount[uid] += on ? 1 : -1;
  softRender();
  try { await be.follow(uid, on); } catch (e) { fail(e); }
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
      res.innerHTML = l.length ? `${q ? '' : '<div class="section-h">אנשים ב-Friends</div>'}<div class="list av">${l.map(personRow).join('')}</div>` : `<div class="empty" style="padding:30px 0"><b>${q ? 'לא נמצא אף אחד' : 'עוד אין אנשים'}</b><span>${q ? 'נסו את שם המשתמש בלי @' : 'הזמינו חברים להצטרף ל-Friends'}</span></div>`;
      wirePeople(res);
    } catch (e) { res.innerHTML = '<div class="empty"><b>החיפוש לא הצליח</b></div>'; }
  };
  inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 250); });
  run();
}

/* ---------- create: photo post, video, story, groups ---------- */
async function createSheet() {
  const acts = [{ label: '📷 פוסט תמונה', k: 'new-photo' }, { label: '🎬 סרטון', k: 'new-video' }, { label: '⭕ סטורי', k: 'new-story' }, { label: '💬 קבוצה', k: 'g:group' }, { label: '🎮 שרת עם ערוצים', k: 'g:server' }, { label: '🎒 קבוצת כיתה', k: 'g:school' }];
  const r = await confirmSheet({ title: 'מה יוצרים?', actions: acts }); const a = acts[r]; if (!a) return;
  if (a.k.startsWith('g:')) groupForm(null, a.k.slice(2)); else A[a.k]();
}
function pickFile(target, accept) { S.pickFor = target; fileEl.accept = accept; fileEl.multiple = false; fileEl.value = ''; fileEl.click(); }
async function pickHook() {
  const t = S.pickFor; if (!['np-photo', 'np-video', 'story', 'avatar'].includes(t)) return false;
  const file = fileEl.files[0]; if (!file) return true;
  try {
    if (t === 'np-video') { vprog('מעבד סרטון…', 0); const v = await prepVideo(file, p => vprog('מעבד סרטון…', p)); vprog(null); videoComposer(v); return true; }
    const im = await prepImage(file);
    if (t === 'np-photo') photoComposer(im); else if (t === 'story') storyComposer(im); else if (S.onAvatar) S.onAvatar(im.thumb.data);
  } catch (e) {
    vprog(null); const c = e && e.code;
    if (c === 'long') hud(`אפשר להעלות סרטון של עד ${VIDEO_MAX_SEC} שניות`, true);
    else if (c) hud('הדפדפן הזה לא מצליח לעבד את הסרטון', true); else hud('לא הצלחנו לפתוח את הקובץ', true);
  }
  return true;
}
function photoComposer(im) {
  formSheet({ title: 'פוסט חדש', action: 'שיתוף', tall: true,
    body: `<div class="cmp-img"><img src="${im.thumb.data}" alt=""></div><div class="list" style="margin-top:12px"><textarea id="np-text" class="tt-in" rows="3" maxlength="2000" dir="auto" placeholder="כיתוב…" autofocus></textarea></div>`,
    async onOk(f) { const text = f.querySelector('#np-text').value.trim(); hud('מפרסם…'); await be.addPost({ image: im, text }); haptic(12); hud('פורסם'); S.tab = 'home'; if (S.screen !== 'root') go('root', { tab: 'home' }); else render(true); } });
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
  formSheet({ title: 'סטורי חדש', action: 'שיתוף', tall: true,
    body: `<div class="cmp-img story"><img src="${im.full.data}" alt=""></div><div class="list" style="margin-top:12px"><div class="field"><input id="ns-text" maxlength="120" dir="auto" placeholder="טקסט על הסטורי (לא חובה)"></div></div><p class="section-f">הסטורי נעלם אחרי 24 שעות.</p>`,
    async onOk(f) { await be.addStory(im, f.querySelector('#ns-text').value.trim()); haptic(12); hud('הסטורי עלה'); } });
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
    box.innerHTML = list.map(c => { const a = S.members[c.authorId] || { id: c.authorId }; return `<div class="cmt">${avatar(a, 32)}<div style="flex:1;min-width:0"><div class="cb"><b>${esc(nameOf(a))}</b><p dir="auto">${linkify(c.text)}</p></div><div class="ct">${ago(c.createdAt)}${c.authorId === me() || (p && p.authorId === me()) ? ` · <button style="color:var(--red);font-size:12px" data-a="del-comment" data-v="${esc(c.id)}">מחיקה</button>` : ''}</div></div></div>`; }).join('') || '<div class="empty" style="padding:30px 0"><b>עוד אין תגובות</b><span>תהיו הראשונים להגיב.</span></div>';
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
  return `<button class="row" data-a="open-chat" data-v="${esc(c.id)}" style="padding:10px 16px">${avatar(o, 52)}<span class="body"><span class="t" style="font-weight:600">${esc(nameOf(o))}</span><span class="sub${typ ? ' acc' : ''}" dir="auto">${typ ? 'מקליד/ה…' : (c.lastBy === me() ? 'את/ה: ' : '') + esc(c.lastMessage || 'צ׳אט חדש')}</span></span><span class="when${un ? ' un' : ''}">${c.lastAt ? listTime(c.lastAt) : ''}${un ? '<span class="udot"></span>' : ''}</span></button>`;
}
function groupRow(g) {
  const un = groupUnread(g);
  return `<button class="row" data-a="open" data-v="${esc(g.id)}" style="padding:10px 16px">${gtile(g)}<span class="body"><span class="t" style="font-weight:600">${esc(g.name)}<span class="badge">${TYPES[gtype(g)][0]}</span></span><span class="sub" dir="auto">${esc(g.lastMessage || `${g.members.length} חברים`)}</span></span><span class="when${un ? ' un' : ''}">${g.lastAt ? listTime(g.lastAt) : ''}${un ? '<span class="udot"></span>' : ''}</span></button>`;
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
  const trail = (add ? `<button class="nb-btn" data-a="${add[0]}"${add[2] ? ` data-v="${add[2]}"` : ''} aria-label="${add[1]}">${icon('plus', 24, 2.2)}</button>` : '') + `<button class="nb-btn" data-a="group-info" aria-label="פרטים">${icon('info', 23)}</button>`;
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
  <div class="section-h">${g.members.length} חברים</div>
  <div class="list av">${owner && !local() ? `<button class="row" data-a="add-friends">${icon('plus', 22)}<span class="body t acc">הוספת חברים</span></button>` : ''}${ids.map(id => { const m = S.members[id] || { id }; return `<${id !== u.id ? 'button' : 'div'} class="row"${id !== u.id ? ` data-a="member" data-v="${esc(id)}"` : ''}>${avatar(m, 40)}<span class="body"><span class="t">${esc(nameOf(m))}${id === u.id ? ' <span style="color:var(--label2)">(את/ה)</span>' : ''}</span><span class="sub">${id === g.ownerId ? 'מנהל/ת · ' : ''}${esc(uname(m))}</span></span>${id !== u.id ? `<span class="chev">${icon('chev', 16)}</span>` : ''}</${id !== u.id ? 'button' : 'div'}>`; }).join('')}</div>
  ${owner ? `<div class="section-h">ניהול</div><div class="list"><button class="row blue" data-a="edit-group">עריכת שם, סוג, אייקון וצבע</button><button class="row blue" data-a="new-code">החלפת קוד ההזמנה</button><button class="row red" data-a="delete-group">מחיקה</button></div>
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
  const fs = formSheet({ title: 'הגדרות', tall: true,
    body: `<div class="section-h">מיקרופון ומצלמה</div><div class="list"><div class="row">${icon('video', 22)}<span class="body t">לשיחות ולהודעות קוליות</span>${mediaPermRow()}</div></div>
      <div class="section-h">התראות</div><div class="list"><div class="row">${icon('bell', 22)}<span class="body t">התראות על הודעות ושיחות</span>${perm === 'granted' ? '<span class="val">פעילות</span>' : perm === 'denied' ? '<span class="val">חסומות</span>' : perm === 'unsupported' ? '<span class="val">לא נתמך</span>' : '<button class="btn tinted sm" data-a="notif">הפעלה</button>'}</div></div>
      <p class="section-f">ההתראות מגיעות כש-Friends פתוח או ברקע.</p>
      ${canOfferInstall() ? `<div class="section-h"></div><div class="list"><button class="row" data-a="install">${icon('sparkles', 22)}<span class="body t">הוספה למסך הבית</span><span class="chev">${icon('chev', 16)}</span></button></div>` : ''}
      ${onSite && !standalone() ? `<div class="section-h">דפדפן</div><div class="list"><a class="row" href="${esc(chromeLink())}" style="text-decoration:none;color:inherit">${icon('link', 22)}<span class="body t">פתיחה ב-Chrome</span><span class="chev">${icon('chev', 16)}</span></a><button class="row" data-a="copy-link">${icon('copy', 22)}<span class="body t">העתקת הקישור</span></button></div>` : ''}
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
    const acts = [{ label: '📷 תמונה', k: 'pick' }, { label: '🎬 סרטון (עד דקה)', k: 'pick-video' }];
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
  'cmt-form': async f => { const el = f.querySelector('#cmt-in'), t = el.value.trim(); if (!t || !S.comments) return; el.value = ''; grow(el); try { await be.addPostComment(S.comments.pid, t); } catch (e) { el.value = t; fail(e); } }
});
