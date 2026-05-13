// Firebase Configuration & Initialization (defer-loaded, non-blocking)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get, push, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDAisnBAmG3qGyjA_lkzSDrWccNxyr2jMc",
    authDomain: "slice-investment.firebaseapp.com",
    databaseURL: "https://slice-investment-default-rtdb.firebaseio.com",
    projectId: "slice-investment",
    storageBucket: "slice-investment.firebasestorage.app",
    messagingSenderId: "263752083276",
    appId: "1:263752083276:web:03b4f22872ccec55c3d1e9",
    measurementId: "G-4J9033N8WS"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

window.FB = { app, db, auth, user: null, ready: false };

signInAnonymously(auth).catch(err => {
    console.warn('Anonymous auth failed (offline mode):', err.message);
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        window.FB.user = user;
        window.FB.ready = true;
        document.dispatchEvent(new CustomEvent('firebase-ready', { detail: { uid: user.uid } }));
    } else {
        document.dispatchEvent(new CustomEvent('firebase-offline'));
    }
});

window.FB.savePrediction = async function (data) {
    if (!window.FB.user) return;
    try {
        await push(ref(db, `users/${window.FB.user.uid}/predictions`), { ...data, timestamp: Date.now() });
    } catch (e) { console.warn('save fail', e); }
};

window.FB.saveTraining = async function (records) {
    if (!window.FB.user) return;
    try {
        await set(ref(db, `users/${window.FB.user.uid}/training`), { records, updatedAt: Date.now() });
    } catch (e) { console.warn('train save fail', e); }
};

window.FB.loadTraining = async function () {
    if (!window.FB.user) return [];
    try {
        const s = await get(ref(db, `users/${window.FB.user.uid}/training`));
        if (s.exists()) return s.val().records || [];
    } catch (e) { console.warn('train load fail', e); }
    return [];
};

window.FB.saveStats = async function (stats) {
    if (!window.FB.user) return;
    try {
        await set(ref(db, `users/${window.FB.user.uid}/stats`), stats);
    } catch (e) { console.warn('stats save fail', e); }
};

window.FB.loadStats = async function () {
    if (!window.FB.user) return null;
    try {
        const s = await get(ref(db, `users/${window.FB.user.uid}/stats`));
        if (s.exists()) return s.val();
    } catch (e) { console.warn('stats load fail', e); }
    return null;
};

window.FB.clearAll = async function () {
    if (!window.FB.user) return;
    try { await remove(ref(db, `users/${window.FB.user.uid}/predictions`)); } catch (e) {}
};
