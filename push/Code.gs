// Friends push sender. Runs free on Google Apps Script, as the Firebase project owner.
//
// The app POSTs { idToken, cid | gid | to, title, body, kind }.
// The chat/group is read WITH THE CALLER'S OWN Firebase ID token, so Firestore's security rules
// decide whether the caller is a member; only then do the other members' phones get a notification
// through Firebase Cloud Messaging (free). It arrives even when Friends is closed. Nothing is stored here.

const PROJECT = 'nest-family-d163e';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/';

function doGet() { return out({ ok: true, service: 'friends-push' }); }
function doPost(e) {
  try { return out(sendFromClient(JSON.parse(e.postData.contents))); }
  catch (err) { console.error(err); return out({ ok: false, error: String(err) }); }
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// The token's signature is checked by Firestore on the first read; its payload names the caller.
function uidOf(idToken) {
  let p = String(idToken).split('.')[1] || '';
  p += '==='.slice((p.length + 3) % 4);
  return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(p)).getDataAsString()).user_id;
}
// with idToken: as the caller (security rules apply). Without: as the project owner.
function get(path, idToken) {
  const headers = idToken ? { Authorization: 'Bearer ' + idToken }
    : { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': PROJECT };
  const r = UrlFetchApp.fetch(FS + path, { headers: headers, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) { if (r.getResponseCode() !== 404) console.warn(path, r.getResponseCode(), r.getContentText().slice(0, 300)); return null; }
  return JSON.parse(r.getContentText()).fields || {};
}
const strs = f => ((f && f.arrayValue && f.arrayValue.values) || []).map(v => v.stringValue).filter(Boolean);
const str = f => (f && f.stringValue) || '';
const clip = (s, n) => String(s || '').slice(0, n);

function sendFromClient(q) {
  const me = uidOf(q.idToken);
  const kind = ['msg', 'call', 'activity', 'test'].indexOf(q.kind) >= 0 ? q.kind : 'msg';
  const data = { kind: kind, cid: clip(q.cid, 120), gid: clip(q.gid, 120), sender: me }; // not "from": FCM reserves that key
  const note = { title: clip(q.title || 'Friends', 80), body: clip(q.body, 180) };

  if (kind === 'test') { // "send me a test" from settings: the read proves the token is valid
    if (!get('fr_users/' + me, q.idToken)) return { ok: false, error: 'denied' };
    // a notification only shows while Friends is in the background, so the test waits for the app to be closed
    if (q.delay) Utilities.sleep(Math.min(15, Number(q.delay) || 0) * 1000);
    return { ok: true, sent: pushTo([me], note, data) };
  }
  if (q.to && !q.cid && !q.gid) { // likes, comments, follows: one person, titled with the sender's real name
    const u = get('fr_users/' + me, q.idToken);
    if (!u) return { ok: false, error: 'denied' };
    note.title = clip(str(u.name) || 'Friends', 80);
    return { ok: true, sent: pushTo([String(q.to)], note, data) };
  }
  const path = q.gid ? 'fr_groups/' + q.gid : q.cid ? 'fr_chats/' + q.cid : '';
  if (!path) return { ok: false, error: 'no target' };
  const d = get(path, q.idToken); // refused unless the caller is a member
  if (!d) return { ok: false, error: 'denied' };
  const members = strs(d.members);
  if (members.indexOf(me) < 0) return { ok: false, error: 'denied' };
  return { ok: true, sent: pushTo(members.filter(u => u !== me), note, data) };
}

// Every registered phone of these people (the newest 5 per person)
function pushTo(uids, note, data) {
  const reqs = [], auth = 'Bearer ' + ScriptApp.getOAuthToken();
  const call = data.kind === 'call';
  uids.slice(0, 200).forEach(u => {
    const p = get('fr_push/' + u); if (!p) return;
    // muted chat or group: no notification (calls and school reminders still come)
    if (!call && data.kind !== 'school' && (data.cid || data.gid) && strs(p.muted).indexOf(data.cid || data.gid) >= 0) return;
    // the person blocked the sender
    if (data.sender) { const usr = get('fr_users/' + u); if (usr && strs(usr.blocked).indexOf(data.sender) >= 0) return; }
    strs(p.tokens).slice(-5).forEach(t => reqs.push({
      url: 'https://fcm.googleapis.com/v1/projects/' + PROJECT + '/messages:send', method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: auth, 'x-goog-user-project': PROJECT },
      payload: JSON.stringify({ message: {
        token: t, notification: note, data: data,
        android: { priority: 'high', ttl: call ? '45s' : '86400s',
          notification: { channel_id: call ? 'calls' : 'msgs', tag: data.cid || data.gid || data.kind, sound: 'default', default_vibrate_timings: true, icon: 'ic_stat_friends', color: '#0A84FF' } },
        webpush: { headers: { Urgency: 'high', TTL: call ? '45' : '86400' } }
      } })
    }));
  });
  if (!reqs.length) return 0;
  let n = 0;
  UrlFetchApp.fetchAll(reqs).forEach(r => { if (r.getResponseCode() === 200) n++; else console.warn('fcm', r.getResponseCode(), r.getContentText().slice(0, 300)); });
  return n;
}

/* ---------- school reminders: every afternoon, homework due and exams tomorrow ---------- */
const OWNER = () => ({ Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': PROJECT });
function listDocs(path) {
  const r = UrlFetchApp.fetch(FS + path + '?pageSize=300', { headers: OWNER(), muteHttpExceptions: true });
  return r.getResponseCode() === 200 ? (JSON.parse(r.getContentText()).documents || []) : [];
}
function schoolReminders() {
  const t = Utilities.formatDate(new Date(Date.now() + 864e5), 'Asia/Jerusalem', 'yyyy-MM-dd');
  const r = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents:runQuery', {
    method: 'post', contentType: 'application/json', headers: OWNER(), muteHttpExceptions: true,
    payload: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'fr_groups' }], where: { fieldFilter: { field: { fieldPath: 'type' }, op: 'EQUAL', value: { stringValue: 'school' } } }, limit: 500 } })
  });
  if (r.getResponseCode() !== 200) { console.warn('school query', r.getResponseCode(), r.getContentText().slice(0, 300)); return; }
  let sent = 0;
  JSON.parse(r.getContentText()).forEach(row => {
    if (!row.document) return;
    const gid = row.document.name.split('/').pop(), g = row.document.fields || {};
    const hw = listDocs('fr_groups/' + gid + '/homework').filter(d => str((d.fields || {}).due) === t);
    const ex = listDocs('fr_groups/' + gid + '/exams').filter(d => str((d.fields || {}).date) === t);
    if (!hw.length && !ex.length) return;
    strs(g.members).forEach(u => {
      const items = hw.filter(h => strs(h.fields.done).indexOf(u) < 0).map(h => 'שיעורי בית ב' + str(h.fields.subject))
        .concat(ex.map(x => 'מבחן ב' + str(x.fields.subject)));
      if (items.length) sent += pushTo([u], { title: '🎒 ' + clip(str(g.name), 60), body: clip('מחר: ' + items.join(', '), 180) }, { kind: 'school', gid: gid, cid: '', sender: '' });
    });
  });
  console.log('school reminders sent', sent);
}
// Run once from the editor: asks Google for the permissions above and schedules the daily reminders (17:00)
function setup() {
  ScriptApp.getProjectTriggers().filter(x => x.getHandlerFunction() === 'schoolReminders').forEach(x => ScriptApp.deleteTrigger(x));
  ScriptApp.newTrigger('schoolReminders').timeBased().everyDays(1).atHour(17).inTimezone('Asia/Jerusalem').create();
  console.log('ok: daily school reminders at 17:00');
}
