// Firebase web config (shared with Nest: project nest-family-d163e; Friends keeps its data in the fr_* collections).
// These values are public; firestore.rules is what protects the data. Off the website (e.g. a local preview) the app runs locally.
// The free push sender (push/Code.gs deployed as a Google Apps Script web app). Empty = no push.
export const PUSH_URL = 'https://script.google.com/macros/s/AKfycbwdlxOe4i8OZ9Aib6WwMvT602USPzHxP14paHDe94Ip1HDeXWN2iVkAPwgAUZyxWpOh/exec';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDkGS4U9-2hugToYYNvAEzUdMC6gXhjkAI',
  authDomain: 'nest-family-d163e.firebaseapp.com',
  projectId: 'nest-family-d163e',
  storageBucket: 'nest-family-d163e.firebasestorage.app',
  messagingSenderId: '706079879278',
  appId: '1:706079879278:web:571f2795a863deeecd767f'
};
