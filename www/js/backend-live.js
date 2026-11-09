// Firebase backend: Google sign-in + Firestore. firestore.rules enforces who may read/write what.
import { newCode, chatId, splitChunks } from './util.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2/';

export async function LiveBackend(cfg) {
  const [A, Au, F] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
  const fb = A.initializeApp(cfg), auth = Au.getAuth(fb);
  let db;
  try { db = F.initializeFirestore(fb, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
  catch (e) { db = F.getFirestore(fb); }
  const { doc, collection, query, where, orderBy, limit, onSnapshot, getDoc, getDocs, setDoc, updateDoc, addDoc, serverTimestamp, arrayUnion, arrayRemove, increment, writeBatch, deleteField, startAt, endAt } = F;
  const ms = v => v && v.toMillis ? v.toMillis() : (typeof v === 'number' ? v : Date.now());
  const read = d => {
    const x = d.data({ serverTimestamps: 'estimate' }); x.id = d.id;
    for (const k of ['createdAt', 'lastAt', 'updatedAt']) if (k in x) x[k] = ms(x[k]);
    return x;
  };
  const ucache = {};
  let me = null;
  const preview = m => m.text || (m.image ? '📷 תמונה' : m.video ? '🎬 סרטון' : m.audio ? '🎤 הודעה קולית' : m.kind === 'call' ? '📞 שיחה' : m.share ? '🔗 פוסט' : '');
  const touch = (gid, text) => updateDoc(doc(db, 'groups', gid), { lastMessage: text.slice(0, 90), lastAt: serverTimestamp(), lastBy: me.id }).catch(() => {});
  const order = { events: ['date', 'asc', 100], images: ['createdAt', 'desc', 150], homework: ['due', 'asc', 150], exams: ['date', 'asc', 100] };

  // videos: base64 split across documents (each under Firestore's 1 MB limit)
  const blobCol = s => s.t === 'p' ? collection(db, 'postBlobs') : s.t === 'g' ? collection(db, 'groups', s.id, 'blobs') : collection(db, 'chats', s.id, 'blobs');
  async function uploadVideo(s, v, onProgress) {
    const id = doc(blobCol(s)).id, parts = splitChunks(v.data);
    for (let i = 0; i < parts.length; i++) { await setDoc(doc(blobCol(s), id + '_' + i), { by: me.id, i, data: parts[i] }); if (onProgress) onProgress((i + 1) / parts.length); }
    return { id, chunks: parts.length, thumb: v.thumb, dur: v.dur, w: v.w, h: v.h, mime: v.mime };
  }
  function dropVideo(s, v) { if (!v) return; const b = writeBatch(db); for (let i = 0; i < v.chunks; i++) b.delete(doc(blobCol(s), v.id + '_' + i)); b.commit().catch(() => {}); }
  // a server's channels each keep their own messages; "main" is the group's own chat
  const msgCol = s => s.t === 'g' ? (s.ch && s.ch !== 'main' ? collection(db, 'groups', s.id, 'channels', s.ch, 'messages') : collection(db, 'groups', s.id, 'messages')) : collection(db, 'chats', s.id, 'messages');
  const scopeDoc = s => s.t === 'g' ? doc(db, 'groups', s.id) : doc(db, 'chats', s.id);

  return {
    mode: 'live',
    rtc: { db, F, me: () => me && me.id },

    /* auth & profiles */
    onAuth(cb) {
      return Au.onAuthStateChanged(auth, async u => {
        if (!u) { me = null; cb(null); return; }
        const ref = doc(db, 'users', u.uid);
        let saved = null;
        try { const s = await getDoc(ref); if (s.exists()) saved = s.data(); } catch (e) {}
        if (!saved) { saved = { name: u.displayName || '', photo: u.photoURL || '', following: [] }; try { await setDoc(ref, saved, { merge: true }); } catch (e) {} }
        me = Object.assign({ id: u.uid, following: [] }, saved);
        ucache[u.uid] = me;
        cb(Object.assign({}, me));
      });
    },
    async signIn() {
      const p = new Au.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
      try { await Au.signInWithPopup(auth, p); }
      catch (e) { if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) await Au.signInWithRedirect(auth, p); else throw e; }
    },
    signOut() { return Au.signOut(auth); },
    async saveProfile(o) { await setDoc(doc(db, 'users', me.id), o, { merge: true }); Object.assign(me, o); ucache[me.id] = me; },
    // a username is claimed by creating usernames/{name}; the rules refuse a name someone already has
    async claimUsername(name) {
      const b = writeBatch(db);
      b.set(doc(db, 'usernames', name), { uid: me.id });
      if (me.username && me.username !== name) b.delete(doc(db, 'usernames', me.username));
      b.set(doc(db, 'users', me.id), { username: name }, { merge: true });
      try { await b.commit(); } catch (e) { const t = await getDoc(doc(db, 'usernames', name)).catch(() => null); if (t && t.exists() && t.data().uid !== me.id) throw Object.assign(new Error('taken'), { code: 'taken' }); throw e; }
      me.username = name; ucache[me.id] = me;
    },
    async users(ids, fresh) {
      await Promise.all(ids.filter(i => fresh || !ucache[i]).map(async i => {
        try { const s = await getDoc(doc(db, 'users', i)); ucache[i] = s.exists() ? Object.assign({ id: i }, s.data()) : { id: i, name: '' }; }
        catch (e) { ucache[i] = ucache[i] || { id: i, name: '' }; }
      }));
      const o = {}; ids.forEach(i => o[i] = ucache[i]); return o;
    },
    watchMe(cb) { return onSnapshot(doc(db, 'users', me.id), s => { if (s.exists()) { Object.assign(me, s.data()); ucache[me.id] = me; cb(Object.assign({}, me)); } }, () => {}); },
    async searchUsers(q) {
      q = q.toLowerCase().replace(/^@/, '');
      if (!q) { const s = await getDocs(query(collection(db, 'users'), orderBy('username'), limit(30))); return s.docs.map(d => Object.assign({ id: d.id }, d.data())); }
      const s = await getDocs(query(collection(db, 'users'), orderBy('username'), startAt(q), endAt(q + ''), limit(20)));
      return s.docs.map(d => Object.assign({ id: d.id }, d.data()));
    },
    follow(uid, on) { me.following = on ? [...new Set((me.following || []).concat(uid))] : (me.following || []).filter(x => x !== uid); return updateDoc(doc(db, 'users', me.id), { following: on ? arrayUnion(uid) : arrayRemove(uid) }); },
    async followers(uid) { const s = await getDocs(query(collection(db, 'users'), where('following', 'array-contains', uid), limit(500))); return s.docs.map(d => d.id); },

    /* posts (photos) and videos: one public collection, newest first */
    watchPosts(cb, err) { return onSnapshot(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(200)), s => cb(s.docs.map(read)), err); },
    async addPost(o, onProgress) {
      const ref = doc(collection(db, 'posts'));
      const data = { authorId: me.id, kind: o.video ? 'video' : 'photo', text: o.text || '', title: o.title || '', likes: [], commentCount: 0, views: 0, createdAt: serverTimestamp() };
      if (o.image) { await setDoc(doc(db, 'postImages', ref.id), { by: me.id, data: o.image.full.data }); data.thumb = o.image.thumb.data; data.w = o.image.full.w; data.h = o.image.full.h; }
      if (o.video) data.video = await uploadVideo({ t: 'p' }, o.video, onProgress);
      await setDoc(ref, data); return ref.id;
    },
    async postImage(pid) { const s = await getDoc(doc(db, 'postImages', pid)); return s.exists() ? s.data().data : ''; },
    likePost(p, on) { return updateDoc(doc(db, 'posts', p.id), { likes: on ? arrayUnion(me.id) : arrayRemove(me.id) }); },
    viewPost(pid) { return updateDoc(doc(db, 'posts', pid), { views: increment(1) }).catch(() => {}); },
    async deletePost(p) {
      const b = writeBatch(db); b.delete(doc(db, 'posts', p.id)); if (p.kind === 'photo') b.delete(doc(db, 'postImages', p.id));
      await b.commit(); dropVideo({ t: 'p' }, p.video);
    },
    loadPostVideo(v) { return this.loadVideo({ t: 'p' }, v); },
    watchPostComments(pid, cb, err) { return onSnapshot(query(collection(db, 'posts', pid, 'comments'), orderBy('createdAt', 'asc'), limit(300)), s => cb(s.docs.map(read)), err); },
    async addPostComment(pid, text) {
      const b = writeBatch(db);
      b.set(doc(collection(db, 'posts', pid, 'comments')), { authorId: me.id, text, createdAt: serverTimestamp() });
      b.update(doc(db, 'posts', pid), { commentCount: increment(1) }); await b.commit();
    },
    async deletePostComment(pid, cid) {
      const b = writeBatch(db); b.delete(doc(db, 'posts', pid, 'comments', cid));
      b.update(doc(db, 'posts', pid), { commentCount: increment(-1) }); await b.commit();
    },

    /* stories: disappear after 24 hours */
    watchStories(cb, err) { return onSnapshot(query(collection(db, 'stories'), where('expiresAt', '>', Date.now()), orderBy('expiresAt', 'asc'), limit(200)), s => cb(s.docs.map(read)), err); },
    addStory(img, text) { return addDoc(collection(db, 'stories'), { authorId: me.id, image: img.full.data, text: text || '', seen: [], createdAt: serverTimestamp(), expiresAt: Date.now() + 864e5 }); },
    seeStory(id) { return updateDoc(doc(db, 'stories', id), { seen: arrayUnion(me.id) }).catch(() => {}); },
    deleteStory(id) { const b = writeBatch(db); b.delete(doc(db, 'stories', id)); return b.commit(); },

    /* groups and servers */
    watchGroups(cb, err) { return onSnapshot(query(collection(db, 'groups'), where('members', 'array-contains', me.id)), s => cb(s.docs.map(read)), err); },
    async createGroup(o) {
      const ref = doc(collection(db, 'groups')), code = newCode(), b = writeBatch(db);
      const members = [...new Set([me.id].concat(o.members || []))];
      b.set(ref, { name: o.name, emoji: o.emoji, color: o.color, type: o.type || 'group', channels: o.channels || [{ id: 'main', name: 'כללי' }], ownerId: me.id, members, inviteCode: code, createdAt: serverTimestamp(), lastAt: serverTimestamp(), lastMessage: '', lastBy: me.id });
      b.set(doc(db, 'invites', code), { groupId: ref.id, groupName: o.name, emoji: o.emoji, color: o.color });
      await b.commit(); return ref.id;
    },
    async findInvite(code) { const s = await getDoc(doc(db, 'invites', code)); return s.exists() ? s.data() : null; },
    joinGroup(code, gid) { return updateDoc(doc(db, 'groups', gid), { members: arrayUnion(me.id), joinCode: code }); },
    async updateGroup(g, p) {
      const b = writeBatch(db); b.update(doc(db, 'groups', g.id), p);
      const ip = {}; if ('name' in p) ip.groupName = p.name; if ('emoji' in p) ip.emoji = p.emoji; if ('color' in p) ip.color = p.color;
      if (Object.keys(ip).length) b.update(doc(db, 'invites', g.inviteCode), ip);
      await b.commit();
    },
    addMembers(gid, uids) { return updateDoc(doc(db, 'groups', gid), { members: arrayUnion(...uids) }); },
    async newInviteCode(g) {
      const code = newCode(), b = writeBatch(db);
      b.delete(doc(db, 'invites', g.inviteCode));
      b.set(doc(db, 'invites', code), { groupId: g.id, groupName: g.name, emoji: g.emoji, color: g.color });
      b.update(doc(db, 'groups', g.id), { inviteCode: code });
      await b.commit(); return code;
    },
    removeMember(gid, u) { return updateDoc(doc(db, 'groups', gid), { members: arrayRemove(u) }); },
    leaveGroup(gid) { return updateDoc(doc(db, 'groups', gid), { members: arrayRemove(me.id) }); },
    async deleteGroup(g) { const b = writeBatch(db); b.delete(doc(db, 'invites', g.inviteCode)); b.delete(doc(db, 'groups', g.id)); await b.commit(); },

    /* group content: events, album, school */
    watch(gid, kind, cb, err) { const o = order[kind]; return onSnapshot(query(collection(db, 'groups', gid, kind), orderBy(o[0], o[1]), limit(o[2])), s => cb(s.docs.map(read)), err); },
    async addPhoto(gid, img) {
      const ref = doc(collection(db, 'groups', gid, 'images')), b = writeBatch(db);
      b.set(doc(db, 'groups', gid, 'imageData', ref.id), { by: me.id, data: img.full.data });
      b.set(ref, { by: me.id, thumb: img.thumb.data, w: img.full.w, h: img.full.h, createdAt: serverTimestamp() });
      await b.commit(); return ref.id;
    },
    async addPhotos(gid, imgs) { for (const im of imgs) await this.addPhoto(gid, im); touch(gid, `${me.name} הוסיף/ה ${imgs.length === 1 ? 'תמונה' : imgs.length + ' תמונות'} לאלבום`); },
    async addEvent(gid, o) { await addDoc(collection(db, 'groups', gid, 'events'), Object.assign({ createdBy: me.id, rsvp: { [me.id]: 'yes' }, createdAt: serverTimestamp() }, o)); touch(gid, `${me.name} הוסיף/ה אירוע: ${o.title}`); },
    rsvp(gid, eid, v) { return updateDoc(doc(db, 'groups', gid, 'events', eid), { ['rsvp.' + me.id]: v }); },
    deleteEvent(gid, eid) { const b = writeBatch(db); b.delete(doc(db, 'groups', gid, 'events', eid)); return b.commit(); },
    async imageData(gid, iid) { const s = await getDoc(doc(db, 'groups', gid, 'imageData', iid)); return s.exists() ? s.data().data : ''; },
    async deleteImage(gid, img) { const b = writeBatch(db); b.delete(doc(db, 'groups', gid, 'images', img.id)); b.delete(doc(db, 'groups', gid, 'imageData', img.id)); await b.commit(); },
    async addHomework(gid, o) { await addDoc(collection(db, 'groups', gid, 'homework'), { subject: o.subject, text: o.text, due: o.due, by: me.id, done: [], createdAt: serverTimestamp() }); touch(gid, `${me.name} הוסיף/ה שיעורי בית ב${o.subject}`); },
    toggleHomework(gid, h) { return updateDoc(doc(db, 'groups', gid, 'homework', h.id), { done: (h.done || []).includes(me.id) ? arrayRemove(me.id) : arrayUnion(me.id) }); },
    async addExam(gid, o) { await addDoc(collection(db, 'groups', gid, 'exams'), { subject: o.subject, topics: o.topics || '', date: o.date, by: me.id, createdAt: serverTimestamp() }); touch(gid, `${me.name} הוסיף/ה מבחן ב${o.subject}`); },
    deleteSchoolItem(gid, kind, id) { const b = writeBatch(db); b.delete(doc(db, 'groups', gid, kind, id)); return b.commit(); },
    watchTimetable(gid, cb, err) { return onSnapshot(doc(db, 'groups', gid, 'school', 'timetable'), s => cb(s.exists() ? (s.data().days || {}) : {}), err); },
    saveTimetable(gid, days) { return setDoc(doc(db, 'groups', gid, 'school', 'timetable'), { days, by: me.id, updatedAt: serverTimestamp() }); },

    /* messages: scope {t:'g'|'c', id, ch?} */
    watchMessages(s, cb, err) { return onSnapshot(query(msgCol(s), orderBy('createdAt', 'desc'), limit(250)), q => cb(q.docs.map(read)), err); },
    async sendMessage(s, m) {
      if (m.video && m.video.data) m = Object.assign({}, m, { video: await uploadVideo(s, m.video) });
      await addDoc(msgCol(s), Object.assign({ authorId: me.id, createdAt: serverTimestamp(), reactions: {} }, m));
      const p = preview(m);
      if (s.t === 'g') touch(s.id, `${me.name}: ${p}`);
      else updateDoc(scopeDoc(s), { lastMessage: p.slice(0, 90), lastAt: serverTimestamp(), lastBy: me.id, ['reads.' + me.id]: Date.now() }).catch(() => {});
    },
    react(s, mid, emoji) { return updateDoc(doc(msgCol(s), mid), { ['reactions.' + me.id]: emoji || deleteField() }); },
    async deleteMessage(s, m) { const b = writeBatch(db); b.delete(doc(msgCol(s), m.id)); await b.commit(); dropVideo(s, m.video); },
    async loadVideo(s, v) {
      const parts = await Promise.all(Array.from({ length: v.chunks }, (_, i) => getDoc(doc(blobCol(s), v.id + '_' + i))));
      if (parts.some(p => !p.exists())) throw Object.assign(new Error('missing'), { code: 'missing' });
      return parts.map(p => p.data().data).join('');
    },
    setTyping(s) { return updateDoc(scopeDoc(s), { ['typing.' + me.id]: Date.now() }).catch(() => {}); },
    markRead(cid) { return updateDoc(doc(db, 'chats', cid), { ['reads.' + me.id]: Date.now() }).catch(() => {}); },

    /* private chats */
    watchChats(cb, err) { return onSnapshot(query(collection(db, 'chats'), where('members', 'array-contains', me.id)), s => cb(s.docs.map(read)), err); },
    async openChat(other) {
      const id = chatId(me.id, other), ref = doc(db, 'chats', id);
      const s = await getDoc(ref);
      if (!s.exists()) await setDoc(ref, { members: [me.id, other].sort(), lastMessage: '', lastAt: serverTimestamp(), lastBy: '', reads: {}, typing: {} });
      return id;
    }
  };
}
