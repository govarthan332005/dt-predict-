// Lightweight Web Audio sound engine — zero file size, instant playback, 3 sound packs
// All sounds synthesized on the fly. AudioContext lazy-initialized (no autoplay issues).

const SoundEngine = {
    ctx: null,
    enabled: true,
    pack: 'casino',
    masterGain: null,
    initialized: false,

    init() {
        if (this.initialized) return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            this.ctx = new AC();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.4;
            this.masterGain.connect(this.ctx.destination);
            this.initialized = true;
        } catch (e) { console.warn('Audio init fail', e); }
    },

    _resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    _tone(freq, dur, type = 'sine', vol = 0.3, attack = 0.005) {
        if (!this.enabled || !this.ctx) return;
        this._resume();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain).connect(this.masterGain);
        osc.start(t);
        osc.stop(t + dur + 0.02);
    },

    _sweep(f1, f2, dur, type = 'sine', vol = 0.3) {
        if (!this.enabled || !this.ctx) return;
        this._resume();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(f1, t);
        osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain).connect(this.masterGain);
        osc.start(t);
        osc.stop(t + dur + 0.02);
    },

    // === SFX ===
    tap() {
        if (this.pack === 'casino') this._tone(900, 0.04, 'square', 0.15);
        else if (this.pack === 'arcade') this._tone(600, 0.05, 'square', 0.18);
        else this._tone(400, 0.06, 'sine', 0.12);
    },

    dragon() {
        if (this.pack === 'casino') { this._tone(523, 0.08, 'square', 0.18); setTimeout(()=>this._tone(659, 0.1, 'square', 0.15), 50); }
        else if (this.pack === 'arcade') this._sweep(200, 400, 0.15, 'sawtooth', 0.18);
        else this._tone(440, 0.12, 'sine', 0.15);
    },

    tiger() {
        if (this.pack === 'casino') { this._tone(659, 0.08, 'square', 0.18); setTimeout(()=>this._tone(784, 0.1, 'square', 0.15), 50); }
        else if (this.pack === 'arcade') this._sweep(300, 500, 0.15, 'sawtooth', 0.18);
        else this._tone(550, 0.12, 'sine', 0.15);
    },

    tie() {
        if (this.pack === 'casino') { this._tone(440, 0.08, 'triangle', 0.18); setTimeout(()=>this._tone(554, 0.1, 'triangle', 0.15), 50); }
        else if (this.pack === 'arcade') this._sweep(250, 350, 0.15, 'square', 0.15);
        else this._tone(330, 0.12, 'sine', 0.15);
    },

    predict() {
        // Cinematic build-up
        if (!this.enabled || !this.ctx) return;
        this._resume();
        if (this.pack === 'casino') {
            this._sweep(220, 880, 0.4, 'sine', 0.25);
            setTimeout(() => this._tone(1320, 0.15, 'triangle', 0.3), 380);
            setTimeout(() => this._tone(1760, 0.2, 'triangle', 0.25), 480);
        } else if (this.pack === 'arcade') {
            for (let i = 0; i < 5; i++) {
                setTimeout(() => this._tone(440 + i * 110, 0.05, 'square', 0.2), i * 40);
            }
            setTimeout(() => this._tone(1320, 0.25, 'square', 0.3), 250);
        } else {
            this._sweep(330, 660, 0.5, 'sine', 0.2);
            setTimeout(() => this._tone(880, 0.3, 'sine', 0.2), 450);
        }
    },

    win() {
        if (!this.enabled || !this.ctx) return;
        this._resume();
        const notes = [523, 659, 784, 1047]; // C E G C
        notes.forEach((n, i) => setTimeout(() => this._tone(n, 0.18, 'triangle', 0.3), i * 90));
    },

    loss() {
        if (!this.enabled || !this.ctx) return;
        this._resume();
        this._sweep(440, 110, 0.4, 'sawtooth', 0.2);
    },

    error() {
        this._tone(200, 0.15, 'square', 0.2);
    },

    success() {
        this._tone(880, 0.08, 'triangle', 0.2);
        setTimeout(() => this._tone(1320, 0.12, 'triangle', 0.2), 70);
    }
};

window.SFX = SoundEngine;
