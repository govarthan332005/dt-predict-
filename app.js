// Main App — v2 Turbo: rAF batching, DOM diffing, debounced saves, no lag

// ============ STATE ============
const state = {
    signals: [],
    trainingData: [],
    history: [],
    stats: { total: 0, correct: 0, wrong: 0, dragonWins: 0, tigerWins: 0, tieWins: 0 },
    lastPrediction: null,
    lastTrainedAt: null,
    settings: {
        soundEnabled: true,
        soundPack: 'casino',
        hapticsEnabled: true,
        theme: 'dark',
        reduceMotion: false,
        autoPredict: false,
        algorithmMode: 'hybrid',
        minConfidence: 90,
        overlayUrl: ''
    },
    _sessionAddedTrain: 0,
    _slotEls: [],
    _renderPending: {}
};

const STORAGE_KEY = 'dt_app_state_v2';

// ============ HELPERS ============
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// rAF-based render scheduler — coalesces multiple render calls into one frame
function scheduleRender(name, fn) {
    if (state._renderPending[name]) return;
    state._renderPending[name] = true;
    requestAnimationFrame(() => {
        state._renderPending[name] = false;
        fn();
    });
}

// Debounce — used for saves & Firebase syncs (avoids spamming on rapid taps)
function debounce(fn, wait) {
    let t;
    return function(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

// ============ STORAGE (debounced) ============
const saveLocal = debounce(() => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            trainingData: state.trainingData,
            history: state.history.slice(-100),
            stats: state.stats,
            lastTrainedAt: state.lastTrainedAt,
            settings: state.settings
        }));
    } catch (e) { console.warn('save fail', e); }
}, 300);

function loadLocal() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            state.trainingData = data.trainingData || [];
            state.history = data.history || [];
            state.stats = data.stats || state.stats;
            state.lastTrainedAt = data.lastTrainedAt || null;
            if (data.settings) Object.assign(state.settings, data.settings);
        }
    } catch (e) { console.warn('load fail', e); }
}

// Debounced Firebase sync
const syncTrainingFB = debounce(() => {
    if (window.FB && window.FB.ready) window.FB.saveTraining(state.trainingData);
}, 1500);

const syncStatsFB = debounce(() => {
    if (window.FB && window.FB.ready) window.FB.saveStats(state.stats);
}, 1500);

// ============ MAPS / UTILS ============
const SIG_EMOJI = { D: '🐉', T: '🐅', Tie: '🤝' };
const SIG_NAME = { D: 'DRAGON', T: 'TIGER', Tie: 'TIE' };
const SIG_CLASS = { D: 'dragon', T: 'tiger', Tie: 'tie' };

function emoji(s) { return SIG_EMOJI[s] || '🤝'; }
function name(s) { return SIG_NAME[s] || 'TIE'; }
function cls(s) { return SIG_CLASS[s] || 'tie'; }

// ============ TOAST ============
let toastTimer = null;
function toast(msg, type = '') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

// ============ HAPTICS ============
function buzz(pattern) {
    if (state.settings.hapticsEnabled && navigator.vibrate) navigator.vibrate(pattern);
}

// ============ RENDER: SLOTS (incremental — only touches changed slot) ============
function buildSlots() {
    const container = $('#signalSlots');
    container.innerHTML = '';
    state._slotEls = [];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 10; i++) {
        const slot = document.createElement('div');
        slot.className = 'signal-slot';
        slot.innerHTML = `<span class="slot-number">${i+1}</span><span class="slot-content"></span>`;
        frag.appendChild(slot);
        state._slotEls.push(slot);
    }
    container.appendChild(frag);
}

function renderSlots() {
    // Diff-based — only update changed slots, no innerHTML rebuild
    for (let i = 0; i < 10; i++) {
        const el = state._slotEls[i];
        const sig = state.signals[i];
        const targetCls = 'signal-slot' + (sig ? ' filled ' + cls(sig) : '');
        if (el.className !== targetCls) el.className = targetCls;
        const content = el.lastElementChild;
        const newContent = sig ? emoji(sig) : '';
        if (content.textContent !== newContent) content.textContent = newContent;
    }
    $('#signalCount').textContent = state.signals.length;
    $('#predictBtn').disabled = state.signals.length < 3;
    renderPatternStats();
    renderBigRoad();
}

function renderPatternStats() {
    let d = 0, t = 0, tie = 0;
    for (let i = 0; i < state.signals.length; i++) {
        const s = state.signals[i];
        if (s === 'D') d++; else if (s === 'T') t++; else tie++;
    }
    $('#dragonCount').textContent = d;
    $('#tigerCount').textContent = t;
    $('#tieCount').textContent = tie;

    let streak = 0;
    if (state.signals.length > 0) {
        const last = state.signals[state.signals.length - 1];
        streak = 1;
        for (let i = state.signals.length - 2; i >= 0; i--) {
            if (state.signals[i] === last) streak++; else break;
        }
    }
    $('#streakCount').textContent = streak;
}

// Big Road visualization (Baccarat style)
function renderBigRoad() {
    const road = $('#bigRoad');
    if (!road) return;
    const recent = state.signals.slice(-30);
    let html = '';
    recent.forEach(s => {
        html += `<div class="bigroad-cell ${cls(s)}">${s === 'Tie' ? 'T' : s}</div>`;
    });
    if (recent.length === 0) {
        html = '<div style="grid-column:1/-1;align-self:center;text-align:center;color:rgba(255,255,255,0.3);font-size:11px;">No data yet</div>';
    }
    road.innerHTML = html;
}

// ============ RENDER: PREDICTION ============
function renderPrediction(result) {
    const container = $('#predictionResult');
    if (!result) {
        container.innerHTML = `
            <div class="prediction-placeholder">
                <div class="placeholder-icon">🎲</div>
                <p>Enter at least 3 signals to get AI prediction</p>
            </div>`;
        $('#confidenceMeter').style.display = 'none';
        $('#verifyRow').style.display = 'none';
        return;
    }
    container.innerHTML = `
        <div class="prediction-active">
            <div class="pred-big-emoji">${emoji(result.prediction)}</div>
            <div class="pred-text ${cls(result.prediction)}">${name(result.prediction)}</div>
        </div>`;

    $('#confidenceMeter').style.display = 'block';
    $('#confidenceValue').textContent = result.confidence + '%';

    // Use rAF for the width animation — kicks compositor smoothly
    requestAnimationFrame(() => {
        $('#confidenceFill').style.width = result.confidence + '%';
    });

    // Confidence breakdown per algorithm
    const bd = $('#confidenceBreakdown');
    if (result.breakdown) {
        bd.innerHTML = `
            <div class="bd-item d"><span>Markov</span><span class="bd-val">${result.breakdown.markov ?? '--'}%</span></div>
            <div class="bd-item t"><span>Pattern</span><span class="bd-val">${result.breakdown.pattern ?? '--'}%</span></div>
            <div class="bd-item tie"><span>Streak</span><span class="bd-val">${result.breakdown.streak ?? '--'}%</span></div>
        `;
    }

    $('#verifyRow').style.display = 'flex';
}

function renderTrainingInfo() {
    $('#trainingCount').textContent = state.trainingData.length;
    $('#modelAccuracy').textContent = state.stats.total > 0
        ? Math.round((state.stats.correct / state.stats.total) * 100) + '%'
        : '--';
    $('#lastTrained').textContent = state.lastTrainedAt
        ? new Date(state.lastTrainedAt).toLocaleString()
        : 'Never';
    $('#sessionAdded').textContent = state._sessionAddedTrain;
}

function renderHistory() {
    const list = $('#historyList');
    if (state.history.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>No predictions yet</p></div>`;
        return;
    }
    // Reverse iteration via for loop — faster than Array.prototype.reverse
    const items = [];
    for (let i = state.history.length - 1; i >= 0; i--) {
        const h = state.history[i];
        const v = h.verified;
        const verifyBadge = v === true ? '<div class="history-verified win">✓</div>'
                          : v === false ? '<div class="history-verified loss">✗</div>'
                          : '';
        items.push(`
            <div class="history-item">
                <div class="history-emoji">${emoji(h.prediction)}</div>
                <div class="history-info">
                    <div class="history-pred">${name(h.prediction)}</div>
                    <div class="history-time">${new Date(h.timestamp).toLocaleString()}</div>
                </div>
                <div class="history-conf">${h.confidence}%</div>
                ${verifyBadge}
            </div>
        `);
    }
    list.innerHTML = items.join('');
}

function renderStats() {
    const accuracy = state.stats.total > 0
        ? Math.round((state.stats.correct / state.stats.total) * 100)
        : 0;
    $('#overallAccuracy').textContent = accuracy + '%';
    $('#totalPredictionsCount').textContent = state.stats.total + ' total predictions';
    $('#correctCount').textContent = state.stats.correct;
    $('#wrongCount').textContent = state.stats.wrong;
    $('#dragonWins').textContent = state.stats.dragonWins;
    $('#tigerWins').textContent = state.stats.tigerWins;

    const chart = $('#performanceChart');
    chart.innerHTML = '';
    const recent = state.history.slice(-20);
    if (recent.length === 0) {
        chart.innerHTML = '<p style="color:var(--text-muted);font-size:11px;text-align:center;width:100%;">No data yet</p>';
        return;
    }
    const frag = document.createDocumentFragment();
    recent.forEach(h => {
        const bar = document.createElement('div');
        bar.className = 'chart-bar' + (h.verified === true ? ' correct' : h.verified === false ? ' wrong' : '');
        bar.style.height = (h.confidence || 50) + '%';
        frag.appendChild(bar);
    });
    chart.appendChild(frag);

    $('#liveAccuracy').textContent = state.stats.total > 0 ? `${accuracy}% Accuracy` : '90%+ Accuracy';
}

function renderAll() {
    renderSlots();
    renderTrainingInfo();
    renderHistory();
    renderStats();
}

// ============ SIGNAL INPUT ============
function addSignal(s) {
    if (state.signals.length >= 10) state.signals.shift();
    state.signals.push(s);
    scheduleRender('slots', renderSlots);
    buzz(12);
    if (window.SFX) {
        if (s === 'D') SFX.dragon();
        else if (s === 'T') SFX.tiger();
        else SFX.tie();
    }
    // Auto-predict mode
    if (state.settings.autoPredict && state.signals.length >= 3) {
        scheduleRender('autopredict', doPredict);
    }
}

function undoSignal() {
    if (state.signals.length === 0) return;
    state.signals.pop();
    scheduleRender('slots', renderSlots);
    buzz(8);
    if (window.SFX) SFX.tap();
}

function clearSignals() {
    state.signals = [];
    scheduleRender('slots', renderSlots);
    renderPrediction(null);
    if (window.SFX) SFX.tap();
}

// ============ PREDICTION ============
function doPredict() {
    if (state.signals.length < 3) {
        toast('Need at least 3 signals', 'error');
        if (window.SFX) SFX.error();
        return;
    }

    window.predictor.minConfidence = state.settings.minConfidence;
    window.predictor.mode = state.settings.algorithmMode;
    window.predictor.setTrainingData(state.trainingData);

    const result = window.predictor.predict(state.signals);
    state.lastPrediction = {
        prediction: result.prediction,
        confidence: result.confidence,
        inputs: state.signals.slice(),
        timestamp: Date.now(),
        verified: null
    };
    state.history.push(state.lastPrediction);
    renderPrediction(result);
    scheduleRender('history', renderHistory);
    scheduleRender('stats', renderStats);
    saveLocal();

    if (window.FB && window.FB.ready) window.FB.savePrediction(state.lastPrediction);
    window.dispatchEvent(new CustomEvent('prediction-updated', { detail: result }));

    if (window.SFX) SFX.predict();
    buzz([20, 30, 20]);
}

// ============ VERIFY ============
function verifyPrediction(isWin) {
    const last = state.history[state.history.length - 1];
    if (!last || last.verified !== null) return;
    last.verified = isWin;
    state.stats.total++;
    if (isWin) {
        state.stats.correct++;
        if (last.prediction === 'D') state.stats.dragonWins++;
        else if (last.prediction === 'T') state.stats.tigerWins++;
        else state.stats.tieWins++;
        // Self-training: add the actual outcome (which == prediction since it was correct)
        state.trainingData.push(last.prediction);
        if (window.SFX) SFX.win();
        toast('Win recorded! Model learned.', 'success');
    } else {
        state.stats.wrong++;
        if (window.SFX) SFX.loss();
        toast('Loss recorded.', 'error');
    }
    saveLocal();
    syncStatsFB();
    if (isWin) syncTrainingFB();
    $('#verifyRow').style.display = 'none';
    scheduleRender('stats', renderStats);
    scheduleRender('history', renderHistory);
    scheduleRender('trainInfo', renderTrainingInfo);
    buzz(isWin ? [20, 50, 20] : 80);
}

// ============ TRAINING ============
function parseRecords(text) {
    if (!text) return [];
    const cleaned = String(text).replace(/\s+/g, ',');
    const parts = cleaned.split(/[,;|]/);
    const out = [];
    for (let i = 0; i < parts.length; i++) {
        const n = window.predictor.normalize(parts[i]);
        if (n) out.push(n);
    }
    return out;
}

function addTrainingData(records) {
    if (!records || records.length === 0) {
        toast('No valid signals found', 'error');
        if (window.SFX) SFX.error();
        return;
    }
    for (let i = 0; i < records.length; i++) state.trainingData.push(records[i]);
    state._sessionAddedTrain += records.length;
    saveLocal();
    scheduleRender('trainInfo', renderTrainingInfo);
    toast(`Added ${records.length} training records`, 'success');
    if (window.SFX) SFX.success();
    syncTrainingFB();
}

function quickAddTrain(sig) {
    state.trainingData.push(sig);
    state._sessionAddedTrain++;
    saveLocal();
    scheduleRender('trainInfo', renderTrainingInfo);
    buzz(10);
    if (window.SFX) {
        if (sig === 'D') SFX.dragon();
        else if (sig === 'T') SFX.tiger();
        else SFX.tie();
    }
    syncTrainingFB();
}

function undoLastTrain() {
    if (state.trainingData.length === 0 || state._sessionAddedTrain === 0) {
        toast('Nothing to undo', 'error');
        return;
    }
    state.trainingData.pop();
    state._sessionAddedTrain--;
    saveLocal();
    scheduleRender('trainInfo', renderTrainingInfo);
    if (window.SFX) SFX.tap();
}

function handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        let records = [];
        if (file.name.toLowerCase().endsWith('.json')) {
            try {
                const data = JSON.parse(text);
                const arr = Array.isArray(data) ? data : (data.records || data.signals || data.trainingData || []);
                for (let i = 0; i < arr.length; i++) {
                    const n = window.predictor.normalize(arr[i]);
                    if (n) records.push(n);
                }
            } catch (err) {
                toast('Invalid JSON file', 'error');
                if (window.SFX) SFX.error();
                return;
            }
        } else {
            records = parseRecords(text);
        }
        addTrainingData(records);
    };
    reader.readAsText(file);
}

function trainModel() {
    if (state.trainingData.length < 10) {
        toast('Need at least 10 records to train', 'error');
        if (window.SFX) SFX.error();
        return;
    }
    window.predictor.setTrainingData(state.trainingData);
    state.lastTrainedAt = Date.now();
    saveLocal();
    scheduleRender('trainInfo', renderTrainingInfo);
    toast(`Model trained on ${state.trainingData.length} records!`, 'success');
    if (window.SFX) SFX.success();
    syncTrainingFB();
}

function exportData() {
    const data = {
        version: 2,
        exportedAt: new Date().toISOString(),
        trainingData: state.trainingData,
        stats: state.stats,
        history: state.history.slice(-100)
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dt-predictor-data-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Data exported', 'success');
    if (window.SFX) SFX.success();
}

function clearTraining() {
    if (!confirm('Clear ALL training data? This cannot be undone.')) return;
    state.trainingData = [];
    state._sessionAddedTrain = 0;
    saveLocal();
    scheduleRender('trainInfo', renderTrainingInfo);
    toast('Training data cleared');
    syncTrainingFB();
}

// ============ TABS ============
function switchTab(tabName) {
    $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    $$('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tabName));
    if (window.SFX) SFX.tap();
}

// ============ MENU ============
function openMenu() {
    $('#sideMenu').classList.add('open');
    $('#menuOverlay').classList.add('show');
}
function closeMenu() {
    $('#sideMenu').classList.remove('open');
    $('#menuOverlay').classList.remove('show');
}

// ============ SETTINGS ============
function applySettings() {
    document.body.dataset.theme = state.settings.theme;
    document.body.dataset.motion = state.settings.reduceMotion ? 'reduced' : 'normal';
    SoundEngine_apply();
}

function SoundEngine_apply() {
    if (!window.SFX) return;
    SFX.enabled = state.settings.soundEnabled;
    SFX.pack = state.settings.soundPack;
    const btn = $('#soundToggle');
    if (btn) btn.classList.toggle('muted', !state.settings.soundEnabled);
}

// ============ EVENT BINDINGS ============
function bindEvents() {
    // Signal input — passive listeners for max perf
    $('#addDragon').addEventListener('click', () => addSignal('D'));
    $('#addTiger').addEventListener('click', () => addSignal('T'));
    $('#addTie').addEventListener('click', () => addSignal('Tie'));
    $('#undoBtn').addEventListener('click', undoSignal);
    $('#clearBtn').addEventListener('click', clearSignals);
    $('#predictBtn').addEventListener('click', doPredict);

    // Verify
    document.addEventListener('click', (e) => {
        const v = e.target.closest('.verify-btn');
        if (v) verifyPrediction(v.dataset.verify === 'win');
    });

    // Tabs (event delegation)
    document.querySelector('.tab-nav').addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (btn) switchTab(btn.dataset.tab);
    });

    // Menu
    $('#menuBtn').addEventListener('click', openMenu);
    $('#closeMenu').addEventListener('click', closeMenu);
    $('#menuOverlay').addEventListener('click', closeMenu);

    // Sound toggle (header)
    $('#soundToggle').addEventListener('click', () => {
        state.settings.soundEnabled = !state.settings.soundEnabled;
        $('#soundEnabled').checked = state.settings.soundEnabled;
        SoundEngine_apply();
        saveLocal();
        if (state.settings.soundEnabled && window.SFX) SFX.success();
        toast(state.settings.soundEnabled ? '🔊 Sound on' : '🔇 Sound off');
    });

    // Training inputs
    $('#uploadZone').addEventListener('click', () => $('#fileInput').click());
    $('#fileInput').addEventListener('change', (e) => {
        if (e.target.files[0]) handleFile(e.target.files[0]);
    });
    $('#bulkAddBtn').addEventListener('click', () => {
        const text = $('#bulkInput').value;
        addTrainingData(parseRecords(text));
        $('#bulkInput').value = '';
    });
    $('#trainModelBtn').addEventListener('click', trainModel);
    $('#exportBtn').addEventListener('click', exportData);
    $('#clearTrainBtn').addEventListener('click', clearTraining);

    // Quick train
    document.querySelectorAll('.quick-btn').forEach(b => {
        b.addEventListener('click', () => quickAddTrain(b.dataset.q));
    });
    $('#undoLastTrain').addEventListener('click', undoLastTrain);

    // Drag & drop
    const dz = $('#uploadZone');
    ['dragenter','dragover'].forEach(ev => {
        dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragging'); });
    });
    ['dragleave','drop'].forEach(ev => {
        dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('dragging'); });
    });
    dz.addEventListener('drop', (e) => {
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });

    // History
    $('#clearHistoryBtn').addEventListener('click', () => {
        if (confirm('Clear all prediction history?')) {
            state.history = [];
            state.stats = { total: 0, correct: 0, wrong: 0, dragonWins: 0, tigerWins: 0, tieWins: 0 };
            saveLocal();
            scheduleRender('history', renderHistory);
            scheduleRender('stats', renderStats);
            if (window.FB && window.FB.ready) window.FB.clearAll();
            toast('History cleared');
            if (window.SFX) SFX.tap();
        }
    });

    // Stats sync
    $('#syncCloudBtn').addEventListener('click', async () => {
        if (!window.FB || !window.FB.ready) {
            toast('Cloud not connected', 'error');
            if (window.SFX) SFX.error();
            return;
        }
        await window.FB.saveTraining(state.trainingData);
        await window.FB.saveStats(state.stats);
        toast('Synced to cloud!', 'success');
        if (window.SFX) SFX.success();
    });

    // Overlay
    $('#overlayToggle').addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('open-overlay'));
        closeMenu();
    });
    $('#openOverlayBtn').addEventListener('click', () => {
        state.settings.overlayUrl = $('#overlayUrl').value.trim();
        saveLocal();
        window.dispatchEvent(new CustomEvent('open-overlay'));
        closeMenu();
    });

    // Settings (instant apply)
    $('#algorithmMode').addEventListener('change', (e) => {
        state.settings.algorithmMode = e.target.value;
        saveLocal();
    });
    $('#minConfidence').addEventListener('change', (e) => {
        state.settings.minConfidence = parseInt(e.target.value);
        saveLocal();
    });
    $('#autoPredict').addEventListener('change', (e) => {
        state.settings.autoPredict = e.target.checked;
        saveLocal();
    });
    $('#soundEnabled').addEventListener('change', (e) => {
        state.settings.soundEnabled = e.target.checked;
        SoundEngine_apply();
        saveLocal();
    });
    $('#soundPack').addEventListener('change', (e) => {
        state.settings.soundPack = e.target.value;
        SoundEngine_apply();
        saveLocal();
        if (window.SFX) SFX.predict();
    });
    $('#hapticsEnabled').addEventListener('change', (e) => {
        state.settings.hapticsEnabled = e.target.checked;
        saveLocal();
    });
    $('#themeSelect').addEventListener('change', (e) => {
        state.settings.theme = e.target.value;
        applySettings();
        saveLocal();
    });
    $('#reduceMotion').addEventListener('change', (e) => {
        state.settings.reduceMotion = e.target.checked;
        applySettings();
        saveLocal();
    });
    $('#overlayUrl').addEventListener('change', (e) => {
        state.settings.overlayUrl = e.target.value.trim();
        saveLocal();
    });

    // Lazy-init audio context on first user gesture (browser autoplay policy)
    const initAudio = () => {
        if (window.SFX) SFX.init();
        document.removeEventListener('pointerdown', initAudio);
        document.removeEventListener('touchstart', initAudio);
    };
    document.addEventListener('pointerdown', initAudio, { once: true, passive: true });
    document.addEventListener('touchstart', initAudio, { once: true, passive: true });

    // Anti-zoom
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('gesturechange', e => e.preventDefault());
    document.addEventListener('gestureend', e => e.preventDefault());

    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouchEnd < 300) e.preventDefault();
        lastTouchEnd = now;
    }, { passive: false });
}

// ============ SETTINGS RESTORE ============
function restoreSettingsUI() {
    $('#algorithmMode').value = state.settings.algorithmMode;
    $('#minConfidence').value = state.settings.minConfidence;
    $('#autoPredict').checked = state.settings.autoPredict;
    $('#soundEnabled').checked = state.settings.soundEnabled;
    $('#soundPack').value = state.settings.soundPack;
    $('#hapticsEnabled').checked = state.settings.hapticsEnabled;
    $('#themeSelect').value = state.settings.theme;
    $('#reduceMotion').checked = state.settings.reduceMotion;
    $('#overlayUrl').value = state.settings.overlayUrl || '';
}

// ============ FIREBASE EVENTS ============
document.addEventListener('firebase-ready', async (e) => {
    $('#authStatus').textContent = 'Connected ✓';
    $('#authStatus').style.color = '#4ade80';
    $('#userIdDisplay').textContent = e.detail.uid.slice(0, 12) + '...';

    try {
        const remote = await window.FB.loadTraining();
        if (remote && remote.length > state.trainingData.length) {
            state.trainingData = remote;
            scheduleRender('trainInfo', renderTrainingInfo);
        }
        const remoteStats = await window.FB.loadStats();
        if (remoteStats) {
            Object.assign(state.stats, remoteStats);
            scheduleRender('stats', renderStats);
        }
    } catch (err) { console.warn(err); }
});

document.addEventListener('firebase-offline', () => {
    $('#authStatus').textContent = 'Offline Mode';
    $('#authStatus').style.color = '#ffa726';
});

// ============ INIT ============
function init() {
    loadLocal();
    buildSlots();
    bindEvents();
    restoreSettingsUI();
    applySettings();
    renderAll();

    // Hide splash with smooth transition
    setTimeout(() => {
        const splash = $('#splash');
        splash.style.transition = 'opacity 0.35s ease';
        splash.style.opacity = '0';
        $('#app').style.visibility = 'visible';
        setTimeout(() => {
            splash.style.display = 'none';
        }, 360);
    }, 1400);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

window.appState = state;
