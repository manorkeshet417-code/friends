// Group voice/video calls in a group (up to 6 people). Everyone connects directly to everyone else ("mesh").
// Firestore carries the signaling, under fr_groups/{gid}/rooms/live:
//   the room doc lists who is in the call (people.<uid> = last heartbeat),
//   pairs/{id} holds one offer/answer between two people, pairs/{id}/c holds their ICE candidates.
// Whoever joins sends an offer to everyone already there; the others answer.
import { ICE } from './calls.js';

export const GROUP_CALL_MAX = 6;
const STALE_MS = 45000, BEAT_MS = 15000;

export function GroupCall(rtc, gid, ui) {
  const { db, F } = rtc;
  const { doc, collection, setDoc, updateDoc, onSnapshot, query, where, getDoc, deleteField, addDoc } = F;
  const room = doc(db, (rtc.prefix || 'fr_') + 'groups', gid, 'rooms', 'live');
  const me = rtc.me();
  const st = { gid, kind: 'audio', local: null, peers: {}, people: {}, unsubs: [], muted: false, camOff: false, joinedAt: 0, beat: null, done: false };
  const fresh = ppl => { const now = Date.now(), o = {}; Object.entries(ppl || {}).forEach(([u, t]) => { if (now - t < STALE_MS) o[u] = t; }); return o; };

  async function media(kind) {
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    try { return await navigator.mediaDevices.getUserMedia({ audio, video: kind === 'video' ? { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 640 } } : false }); }
    catch (e) {
      if (kind !== 'video' || !/NotReadable|NotFound|Overconstrained|NotAllowed|Permission|Abort/.test(e.name || '')) throw e;
      const s = await navigator.mediaDevices.getUserMedia({ audio }); st.camOff = true; ui.toast('המצלמה לא זמינה, ממשיכים בקול'); return s;
    }
  }

  function peer(u) {
    if (st.peers[u]) drop(u);
    const pc = new RTCPeerConnection(ICE), stream = new MediaStream();
    const p = { u, pc, stream, unsubs: [], pending: [], state: 'connecting' };
    st.local.getTracks().forEach(t => pc.addTrack(t, st.local));
    pc.ontrack = e => { (e.streams[0] || { getTracks: () => [e.track] }).getTracks().forEach(t => { if (!stream.getTracks().includes(t)) stream.addTrack(t); }); ui.update(); };
    pc.onconnectionstatechange = () => {
      p.state = pc.connectionState;
      if (pc.connectionState === 'failed') { try { pc.restartIce(); } catch (e) {} }
      ui.update();
    };
    st.peers[u] = p;
    return p;
  }
  function addCand(p, c) {
    const cand = Object.assign({}, c); delete cand.by;
    if (!p.pc.remoteDescription) { p.pending.push(cand); return; }
    p.pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
  }
  function flush(p) { const q = p.pending; p.pending = []; q.forEach(c => p.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})); }
  function listenCands(p, ref) {
    p.unsubs.push(onSnapshot(collection(ref, 'c'), s => s.docChanges().forEach(ch => {
      if (ch.type !== 'added') return; const c = ch.doc.data(); if (c.by === me) return; addCand(p, c);
    }), () => {}));
  }

  // I joined later: I call everyone who is already in the room
  async function offerTo(u) {
    const p = peer(u), ref = doc(collection(room, 'pairs'));
    p.pc.onicecandidate = e => { if (e.candidate) addDoc(collection(ref, 'c'), Object.assign({ by: me }, e.candidate.toJSON())).catch(() => {}); };
    const o = await p.pc.createOffer();
    await p.pc.setLocalDescription(o);
    await setDoc(ref, { from: me, to: u, t: Date.now(), offer: { type: o.type, sdp: o.sdp } });
    p.unsubs.push(onSnapshot(ref, s => {
      const d = s.data();
      if (d && d.answer && !p.pc.currentRemoteDescription) p.pc.setRemoteDescription(new RTCSessionDescription(d.answer)).then(() => flush(p)).catch(() => {});
    }, () => {}));
    listenCands(p, ref);
  }
  // someone joined after me and sent an offer
  async function answer(snap) {
    const d = snap.data(); if (!d || !d.offer || d.from === me || st.done) return;
    if (d.t < st.joinedAt - 5000) return; // an old offer from an earlier call
    const p = peer(d.from), ref = snap.ref;
    p.pc.onicecandidate = e => { if (e.candidate) addDoc(collection(ref, 'c'), Object.assign({ by: me }, e.candidate.toJSON())).catch(() => {}); };
    listenCands(p, ref);
    await p.pc.setRemoteDescription(new RTCSessionDescription(d.offer)); flush(p);
    const a = await p.pc.createAnswer();
    await p.pc.setLocalDescription(a);
    await updateDoc(ref, { answer: { type: a.type, sdp: a.sdp } });
  }
  function drop(u) {
    const p = st.peers[u]; if (!p) return;
    p.unsubs.forEach(f => { try { f(); } catch (e) {} });
    try { p.pc.close(); } catch (e) {}
    delete st.peers[u]; ui.update();
  }

  async function join(kind) {
    st.joinedAt = Date.now();
    const snap = await getDoc(room), d = snap.exists() ? snap.data() : {}, already = fresh(d.people);
    if (Object.keys(already).filter(u => u !== me).length >= GROUP_CALL_MAX - 1) throw Object.assign(new Error('full'), { code: 'full' });
    const live = Object.keys(already).length > 0;
    st.kind = live ? (d.kind || kind) : kind;
    st.local = await media(st.kind);
    await setDoc(room, Object.assign({ people: { [me]: Date.now() } }, live ? {} : { kind: st.kind, startedBy: me, startedAt: Date.now() }), { merge: true });
    st.people = Object.assign({}, already, { [me]: Date.now() });
    ui.open();
    // the room: who is here, who left
    st.unsubs.push(onSnapshot(room, s => {
      const ppl = fresh((s.data() || {}).people);
      if (!st.done && !ppl[me]) ppl[me] = Date.now();
      Object.keys(st.peers).forEach(u => { if (!ppl[u]) drop(u); });
      st.people = ppl; ui.update();
    }, () => {}));
    // offers sent to me (filtered by time here: one equality filter needs no extra index)
    st.unsubs.push(onSnapshot(query(collection(room, 'pairs'), where('to', '==', me)), s => s.docChanges().forEach(ch => { if (ch.type === 'added') answer(ch.doc).catch(e => console.warn('gcall answer', e)); }), () => {}));
    await Promise.all(Object.keys(already).filter(u => u !== me).map(u => offerTo(u).catch(e => console.warn('gcall offer', e))));
    st.beat = setInterval(() => { updateDoc(room, { ['people.' + me]: Date.now() }).catch(() => {}); Object.keys(st.peers).forEach(u => { if (!fresh(st.people)[u]) drop(u); }); }, BEAT_MS);
    ui.update();
    return st.kind;
  }

  async function leave() {
    if (st.done) return; st.done = true;
    clearInterval(st.beat);
    st.unsubs.forEach(f => { try { f(); } catch (e) {} });
    Object.keys(st.peers).forEach(drop);
    if (st.local) st.local.getTracks().forEach(t => t.stop());
    await updateDoc(room, { ['people.' + me]: deleteField() }).catch(() => {});
    ui.close();
  }
  function toggleMute() { st.muted = !st.muted; if (st.local) st.local.getAudioTracks().forEach(t => t.enabled = !st.muted); ui.update(); }
  function toggleCam() { st.camOff = !st.camOff; if (st.local) st.local.getVideoTracks().forEach(t => t.enabled = !st.camOff); ui.update(); }

  return { join, leave, toggleMute, toggleCam, get state() { return st; } };
}

// Who is in a group's call right now (for the "join" banner); calls cb(people) on every change
export function watchRoom(rtc, gid, cb) {
  const { db, F } = rtc;
  const room = F.doc(db, (rtc.prefix || 'fr_') + 'groups', gid, 'rooms', 'live');
  return F.onSnapshot(room, s => {
    const d = s.data() || {}, now = Date.now(), ppl = {};
    Object.entries(d.people || {}).forEach(([u, t]) => { if (now - t < STALE_MS) ppl[u] = t; });
    cb({ people: ppl, kind: d.kind || 'audio' });
  }, () => cb({ people: {}, kind: 'audio' }));
}
