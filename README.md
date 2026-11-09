# Friends

A social network for friends, as an installable web app (PWA) in Hebrew with an Apple-style design.

- **Home** – photo feed from people you follow, likes, comments, and 24-hour stories (Instagram-style)
- **Videos** – upload short videos with a title, watch, like, comment, view counts (YouTube-style)
- **Chats** – private chats, groups, servers with text channels (Discord-style), voice notes, photos, videos, reactions
- **Calls** – one-to-one voice and video calls (WebRTC)
- **Class groups** – timetable, homework with per-person "done", exam countdowns, focus timer
- **Profiles** – username, bio, followers/following, photo and video grids

Built on Firebase (Google sign-in + Firestore, free Spark plan) and published with GitHub Pages
(`.github/workflows/pages.yml`). `firestore.rules` holds the security rules.
Off the website (e.g. a local preview) the app runs with an in-page local backend.

`src/` keeps the one-off build script that assembled `www/js/app.js` from the Nest app; edit `www/` directly.
