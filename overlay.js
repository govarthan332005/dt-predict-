// Floating Draggable Overlay — Turbo (pointer events, rAF drag, no jank)

const overlay = {
    el: null,
    bubble: null,
    signals: [],
    isMinimized: false,
    isExpanded: false
};

function $o(s) { return document.querySelector(s); }

function initOverlay() {
    overlay.el = $o('#floatingOverlay');
    overlay.bubble = $o('#floatingBubble');

    makeDraggable(overlay.el, $o('#overlayHeader'));
    makeDraggable(overlay.bubble, overlay.bubble);
    initResize();

    $o('#overlayMinimize').addEventListener('click', minimizeOverlay);
    $o('#overlayClose').addEventListener('click', closeOverlay);
    $o('#overlayExpand').addEventListener('click', toggleExpand);

    overlay.bubble.addEventListener('click', () => {
        if (overlay.bubble.dataset.dragged === 'true') {
            overlay.bubble.dataset.dragged = 'false';
            return;
        }
        restoreOverlay();
    });

    document.querySelectorAll('.overlay-input-btn').forEach(b => {
        b.addEventListener('click', () => addOverlaySignal(b.dataset.val));
    });

    $o('#overlayUndo').addEventListener('click', () => {
        overlay.signals.pop();
        renderOverlayHistory();
        if (window.SFX) SFX.tap();
    });
    $o('#overlayPredict').addEventListener('click', doOverlayPredict);

    window.addEventListener('open-overlay', openOverlay);
    window.addEventListener('prediction-updated', (e) => showOverlayResult(e.detail));
}

// Pointer events + rAF — silky-smooth drag on all devices
function makeDraggable(target, handle) {
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;
    let curLeft = 0, curTop = 0;
    let moved = false;
    let rafId = null;

    function tick() {
        target.style.left = curLeft + 'px';
        target.style.top = curTop + 'px';
        target.style.right = 'auto';
        rafId = null;
    }

    function onDown(e) {
        if (e.target.closest('.overlay-btn') || e.target.closest('.overlay-controls')) return;
        dragging = true;
        moved = false;
        const p = e.touches ? e.touches[0] : e;
        startX = p.clientX;
        startY = p.clientY;
        const rect = target.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        target.style.transition = 'none';
        if (e.cancelable) e.preventDefault();
    }

    function onMove(e) {
        if (!dragging) return;
        const p = e.touches ? e.touches[0] : e;
        const dx = p.clientX - startX;
        const dy = p.clientY - startY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;

        const maxLeft = window.innerWidth - target.offsetWidth;
        const maxTop = window.innerHeight - target.offsetHeight;
        curLeft = Math.max(0, Math.min(startLeft + dx, maxLeft));
        curTop = Math.max(0, Math.min(startTop + dy, maxTop));

        if (rafId == null) rafId = requestAnimationFrame(tick);
        if (e.cancelable) e.preventDefault();
    }

    function onUp() {
        if (dragging && moved) target.dataset.dragged = 'true';
        dragging = false;
        target.style.transition = '';
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
}

function initResize() {
    const handle = $o('#overlayResize');
    let resizing = false;
    let startX = 0, startY = 0, startW = 0, startH = 0;
    let curW = 0, curH = 0;
    let rafId = null;

    function tick() {
        overlay.el.style.width = curW + 'px';
        overlay.el.style.height = curH + 'px';
        rafId = null;
    }

    function onDown(e) {
        resizing = true;
        const p = e.touches ? e.touches[0] : e;
        startX = p.clientX;
        startY = p.clientY;
        startW = overlay.el.offsetWidth;
        startH = overlay.el.offsetHeight;
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
    }
    function onMove(e) {
        if (!resizing) return;
        const p = e.touches ? e.touches[0] : e;
        curW = Math.max(220, Math.min(window.innerWidth - 20, startW + (p.clientX - startX)));
        curH = Math.max(200, Math.min(window.innerHeight - 20, startH + (p.clientY - startY)));
        if (rafId == null) rafId = requestAnimationFrame(tick);
        if (e.cancelable) e.preventDefault();
    }
    function onUp() {
        resizing = false;
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
}

function openOverlay() {
    overlay.el.style.display = 'block';
    overlay.bubble.style.display = 'none';
    overlay.isMinimized = false;

    const url = (window.appState && window.appState.settings.overlayUrl) || ($o('#overlayUrl') ? $o('#overlayUrl').value.trim() : '');
    const iframe = $o('#overlayIframe');
    if (url) {
        try {
            const u = new URL(url);
            if (iframe.src !== u.href) iframe.src = u.href;
        } catch (e) {}
    }
}

function closeOverlay() {
    overlay.el.style.display = 'none';
    overlay.bubble.style.display = 'none';
    if (window.SFX) SFX.tap();
}

function minimizeOverlay() {
    overlay.el.style.display = 'none';
    overlay.bubble.style.display = 'flex';
    overlay.isMinimized = true;
    const rect = overlay.el.getBoundingClientRect();
    if (rect.left > 0) {
        overlay.bubble.style.left = rect.left + 'px';
        overlay.bubble.style.top = rect.top + 'px';
        overlay.bubble.style.right = 'auto';
    }
}

function restoreOverlay() {
    overlay.el.style.display = 'block';
    overlay.bubble.style.display = 'none';
    overlay.isMinimized = false;
    const rect = overlay.bubble.getBoundingClientRect();
    if (rect.left > 0) {
        overlay.el.style.left = rect.left + 'px';
        overlay.el.style.top = rect.top + 'px';
        overlay.el.style.right = 'auto';
    }
}

function toggleExpand() {
    overlay.isExpanded = !overlay.isExpanded;
    overlay.el.classList.toggle('expanded', overlay.isExpanded);
    const iframe = $o('#overlayIframe');
    const url = (window.appState && window.appState.settings.overlayUrl) || ($o('#overlayUrl') ? $o('#overlayUrl').value.trim() : '');
    if (overlay.isExpanded && url) {
        iframe.style.display = 'block';
        if (!iframe.src || iframe.src === 'about:blank') {
            try { iframe.src = new URL(url).href; } catch (e) {}
        }
    } else {
        iframe.style.display = 'none';
    }
}

function addOverlaySignal(val) {
    if (overlay.signals.length >= 10) overlay.signals.shift();
    overlay.signals.push(val);
    renderOverlayHistory();
    if (navigator.vibrate && (!window.appState || window.appState.settings.hapticsEnabled)) navigator.vibrate(8);
    if (window.SFX) {
        if (val === 'D') SFX.dragon();
        else if (val === 'T') SFX.tiger();
        else SFX.tie();
    }
}

function renderOverlayHistory() {
    const container = $o('#overlayHistory');
    const items = [];
    for (let i = 0; i < overlay.signals.length; i++) {
        const s = overlay.signals[i];
        const cls = s === 'D' ? 'd' : s === 'T' ? 't' : 'tie';
        const emoji = s === 'D' ? '🐉' : s === 'T' ? '🐅' : '🤝';
        items.push(`<div class="overlay-history-item ${cls}">${emoji}</div>`);
    }
    container.innerHTML = items.join('');
}

function doOverlayPredict() {
    if (overlay.signals.length < 3) {
        showOverlayMessage('Need 3+ signals');
        if (window.SFX) SFX.error();
        return;
    }
    if (!window.predictor) return;

    window.predictor.setTrainingData(window.appState ? window.appState.trainingData : []);
    const result = window.predictor.predict(overlay.signals);
    showOverlayResult(result);

    if (window.appState) {
        window.appState.history.push({
            prediction: result.prediction,
            confidence: result.confidence,
            inputs: overlay.signals.slice(),
            timestamp: Date.now(),
            verified: null,
            source: 'overlay'
        });
        if (window.FB && window.FB.ready) {
            window.FB.savePrediction({
                prediction: result.prediction,
                confidence: result.confidence,
                inputs: overlay.signals.slice(),
                source: 'overlay'
            });
        }
    }
    if (window.SFX) SFX.predict();
    if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
}

function showOverlayResult(result) {
    const emoji = result.prediction === 'D' ? '🐉' : result.prediction === 'T' ? '🐅' : '🤝';
    const name = result.prediction === 'D' ? 'DRAGON' : result.prediction === 'T' ? 'TIGER' : 'TIE';
    $o('#overlayPrediction').innerHTML = `
        <div class="overlay-emoji">${emoji}</div>
        <div class="overlay-result-text">${name} • ${result.confidence}%</div>
    `;
}

function showOverlayMessage(msg) {
    $o('#overlayPrediction').innerHTML = `
        <div class="overlay-emoji">⚠️</div>
        <div class="overlay-result-text">${msg}</div>
    `;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOverlay);
} else {
    initOverlay();
}
