// Local backend for the preview (e.g. inside Claude): one person, kept only in this page.
// Same API as the live backend; private chats, other people and calls need the real site.
import { LS, newCode } from './util.js';

export function LocalBackend() {
  const me = { id: 'me', name: LS.get('friends.localName') || '', username: LS.get('friends.localUser') || '', photo: '', bio: '', following: [] };
  const groups = {}, sub = {}, L = new Map(), blobs = {}, posts = [], stories = [], comments = {}, images = {};
  let uid = 0;
  const id = () => 'l' + (++uid) + Math.random().toString(36).slice(2, 6);
  const emit = k => { const s = L.get(k); if (s) s.forEach(f => f()); };
  const on = (k, f) => { if (!L.has(k)) L.set(k, new Set()); L.get(k).add(f); f(); return () => L.get(k).delete(f); };
  const box = gid => sub[gid] || (sub[gid] = { messages: {}, events: [], images: [], imageData: {}, homework: [], exams: [], timetable: {} });
  const msgs = s => { const b = box(s.id); return b.messages[s.ch || 'main'] || (b.messages[s.ch || 'main'] = []); };
  const touch = (gid, text) => { const g = groups[gid]; if (g) { g.lastMessage = text.slice(0, 90); g.lastAt = Date.now(); g.lastBy = 'me'; emit('groups'); } };
  const sort = {
    images: (a, b) => b.createdAt - a.createdAt, homework: (a, b) => a.due < b.due ? -1 : 1, exams: (a, b) => a.date < b.date ? -1 : 1,
    events: (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  };
  const copy = x => JSON.parse(JSON.stringify(x));
  const noSite = () => { const e = new Error('local'); e.code = 'local'; throw e; };
  const vid = v => { const k = id(); blobs[k] = v.data; return { id: k, chunks: 1, thumb: v.thumb, dur: v.dur, w: v.w, h: v.h, mime: v.mime }; };
  let authCb = null;
  return {
    mode: 'local',
    rtc: null,
    onAuth(cb) { authCb = cb; setTimeout(() => cb(me.name ? copy(me) : null), 150); return () => {}; },
    async signIn(name) { me.name = name; LS.set('friends.localName', name); authCb && authCb(copy(me)); },
    async signOut() { me.name = ''; LS.set('friends.localName', ''); authCb && authCb(null); },
    async saveProfile(o) { Object.assign(me, o); LS.set('friends.localName', me.name); emit('me'); },
    async claimUsername(name) { me.username = name; LS.set('friends.localUser', name); emit('me'); },
    async users(ids) { const o = {}; ids.forEach(i => o[i] = i === 'me' ? copy(me) : { id: i, name: '' }); return o; },
    watchMe(cb) { return on('me', () => cb(copy(me))); },
    async searchUsers() { return [copy(me)]; },
    async follow() { noSite(); },
    async followers() { return []; },

    watchPosts(cb) { return on('posts', () => cb(copy(posts))); },
    async addPost(o, onProgress) {
      const p = { id: id(), authorId: 'me', kind: o.video ? 'video' : 'photo', text: o.text || '', title: o.title || '', likes: [], commentCount: 0, views: 0, createdAt: Date.now() };
      if (o.image) { images[p.id] = o.image.full.data; p.thumb = o.image.thumb.data; p.w = o.image.full.w; p.h = o.image.full.h; }
      if (o.video) { p.video = vid(o.video); if (onProgress) onProgress(1); }
      posts.unshift(p); emit('posts'); return p.id;
    },
    async postImage(pid) { return images[pid] || ''; },
    async likePost(p, on) { const x = posts.find(q => q.id === p.id); if (x) { x.likes = on ? ['me'] : []; emit('posts'); } },
    async viewPost(pid) { const x = posts.find(q => q.id === pid); if (x) { x.views++; emit('posts'); } },
    async deletePost(p) { const i = posts.findIndex(q => q.id === p.id); if (i >= 0) posts.splice(i, 1); emit('posts'); },
    async loadPostVideo(v) { return blobs[v.id] || ''; },
    watchPostComments(pid, cb) { return on('c:' + pid, () => cb(copy(comments[pid] || []))); },
    async addPostComment(pid, text) { (comments[pid] = comments[pid] || []).push({ id: id(), authorId: 'me', text, createdAt: Date.now() }); const p = posts.find(q => q.id === pid); if (p) p.commentCount++; emit('c:' + pid); emit('posts'); },
    async deletePostComment(pid, cid) { comments[pid] = (comments[pid] || []).filter(c => c.id !== cid); const p = posts.find(q => q.id === pid); if (p) p.commentCount = Math.max(0, p.commentCount - 1); emit('c:' + pid); emit('posts'); },

    watchStories(cb) { return on('stories', () => cb(copy(stories.filter(s => s.expiresAt > Date.now())))); },
    async addStory(img, text) { stories.push({ id: id(), authorId: 'me', image: img.full.data, text: text || '', seen: [], createdAt: Date.now(), expiresAt: Date.now() + 864e5 }); emit('stories'); },
    async seeStory() {},
    async deleteStory(sid) { const i = stories.findIndex(s => s.id === sid); if (i >= 0) stories.splice(i, 1); emit('stories'); },

    watchGroups(cb) { return on('groups', () => cb(Object.values(groups).filter(g => g.members.includes('me')).map(copy))); },
    async createGroup(o) { const gid = id(); groups[gid] = { id: gid, name: o.name, emoji: o.emoji, color: o.color, type: o.type || 'group', channels: o.channels || [{ id: 'main', name: 'כללי' }], ownerId: 'me', members: ['me'], inviteCode: newCode(), lastMessage: '', lastAt: Date.now(), lastBy: 'me', typing: {} }; box(gid); emit('groups'); return gid; },
    async findInvite(code) { const g = Object.values(groups).find(x => x.inviteCode === code); return g ? { groupId: g.id, groupName: g.name, emoji: g.emoji, color: g.color } : null; },
    async joinGroup(code, gid) { const g = groups[gid]; if (g && !g.members.includes('me')) g.members.push('me'); emit('groups'); },
    async updateGroup(g, p) { Object.assign(groups[g.id], copy(p)); emit('groups'); },
    async addMembers() { noSite(); },
    async newInviteCode(g) { groups[g.id].inviteCode = newCode(); emit('groups'); return groups[g.id].inviteCode; },
    async removeMember(gid, u) { const g = groups[gid]; g.members = g.members.filter(x => x !== u); emit('groups'); },
    async leaveGroup(gid) { const g = groups[gid]; g.members = g.members.filter(x => x !== 'me'); emit('groups'); },
    async deleteGroup(g) { delete groups[g.id]; delete sub[g.id]; emit('groups'); },

    watch(gid, kind, cb) { return on(gid + ':' + kind, () => cb(box(gid)[kind].slice().sort(sort[kind]).map(copy))); },
    async addPhoto(gid, img) { const iid = id(); box(gid).images.unshift({ id: iid, by: 'me', thumb: img.thumb.data, w: img.full.w, h: img.full.h, createdAt: Date.now() }); box(gid).imageData[iid] = img.full.data; emit(gid + ':images'); return iid; },
    async addPhotos(gid, imgs) { for (const im of imgs) await this.addPhoto(gid, im); touch(gid, `${me.name} הוסיף/ה ${imgs.length === 1 ? 'תמונה' : imgs.length + ' תמונות'} לאלבום`); },
    async addEvent(gid, o) { box(gid).events.push(Object.assign({ id: id(), createdBy: 'me', rsvp: { me: 'yes' }, createdAt: Date.now() }, o)); emit(gid + ':events'); touch(gid, `${me.name} הוסיף/ה אירוע: ${o.title}`); },
    async rsvp(gid, eid, v) { const e = box(gid).events.find(x => x.id === eid); if (e) { e.rsvp.me = v; emit(gid + ':events'); } },
    async deleteEvent(gid, eid) { box(gid).events = box(gid).events.filter(x => x.id !== eid); emit(gid + ':events'); },
    async imageData(gid, iid) { return box(gid).imageData[iid] || ''; },
    async deleteImage(gid, img) { const b = box(gid); b.images = b.images.filter(i => i.id !== img.id); emit(gid + ':images'); },
    async addHomework(gid, o) { box(gid).homework.push({ id: id(), subject: o.subject, text: o.text, due: o.due, by: 'me', done: [], createdAt: Date.now() }); emit(gid + ':homework'); },
    async toggleHomework(gid, h) { const x = box(gid).homework.find(q => q.id === h.id); if (x) { x.done = x.done.includes('me') ? [] : ['me']; emit(gid + ':homework'); } },
    async addExam(gid, o) { box(gid).exams.push({ id: id(), subject: o.subject, topics: o.topics || '', date: o.date, by: 'me', createdAt: Date.now() }); emit(gid + ':exams'); },
    async deleteSchoolItem(gid, kind, iid) { box(gid)[kind] = box(gid)[kind].filter(x => x.id !== iid); emit(gid + ':' + kind); },
    watchTimetable(gid, cb) { return on(gid + ':tt', () => cb(copy(box(gid).timetable))); },
    async saveTimetable(gid, days) { box(gid).timetable = days; emit(gid + ':tt'); },

    watchMessages(s, cb) { if (s.t !== 'g') return () => {}; return on(s.id + ':m:' + (s.ch || 'main'), () => cb(msgs(s).slice().sort((a, b) => b.createdAt - a.createdAt).map(copy))); },
    async sendMessage(s, m) {
      if (s.t !== 'g') noSite(); m = copy(m); if (m.video && m.video.data) m.video = vid(m.video);
      msgs(s).push(Object.assign({ id: id(), authorId: 'me', createdAt: Date.now(), reactions: {} }, m)); emit(s.id + ':m:' + (s.ch || 'main'));
      touch(s.id, `${me.name}: ${m.text || (m.image ? '📷 תמונה' : m.video ? '🎬 סרטון' : '🎤 הודעה קולית')}`);
    },
    async react(s, mid, emoji) { const m = msgs(s).find(x => x.id === mid); if (m) { if (emoji) m.reactions.me = emoji; else delete m.reactions.me; emit(s.id + ':m:' + (s.ch || 'main')); } },
    async deleteMessage(s, m) { const l = msgs(s), i = l.findIndex(x => x.id === m.id); if (i >= 0) l.splice(i, 1); emit(s.id + ':m:' + (s.ch || 'main')); },
    async loadVideo(s, v) { return blobs[v.id] || ''; },
    async setTyping() {},
    async markRead() {},
    watchChats(cb) { cb([]); return () => {}; },
    async openChat() { noSite(); }
  };
}
