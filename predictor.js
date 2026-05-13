// AI Prediction Engine — v4 Turbo (cached, memoized, incremental rebuilds)
// Combines: Markov Chain (O2/O3/O4) + Pattern Matching + Streak + Frequency

class DragonTigerPredictor {
    constructor() {
        this.trainingData = [];
        this.markovTable = { o2: {}, o3: {}, o4: {} };
        this.patternMap = {};
        this.minConfidence = 90;
        this.mode = 'hybrid';
        this._lastDataHash = '';
        this._lastInputHash = '';
        this._lastResult = null;
    }

    normalize(signal) {
        if (signal == null) return null;
        const s = String(signal).trim().toLowerCase();
        if (s === 'd' || s === 'dragon' || s === '🐉') return 'D';
        if (s === 't' || s === 'tiger' || s === '🐅') return 'T';
        if (s === 'tie' || s === 'draw' || s === '🤝' || s === 'ti') return 'Tie';
        return null;
    }

    _hashArr(arr) {
        // cheap rolling hash — collisions accepted for caching
        let h = 0;
        for (let i = 0; i < arr.length; i++) {
            h = ((h << 5) - h + (arr[i] === 'D' ? 1 : arr[i] === 'T' ? 2 : 3)) | 0;
        }
        return h + ':' + arr.length;
    }

    setTrainingData(records) {
        const normalized = [];
        for (let i = 0; i < records.length; i++) {
            const n = this.normalize(records[i]);
            if (n) normalized.push(n);
        }
        const newHash = this._hashArr(normalized);
        if (newHash === this._lastDataHash) return; // skip rebuild — major perf win
        this._lastDataHash = newHash;
        this._lastResult = null; // invalidate prediction cache
        this.trainingData = normalized;
        this.buildMarkov();
        this.buildPatterns();
    }

    buildMarkov() {
        this.markovTable = { o2: {}, o3: {}, o4: {} };
        const data = this.trainingData;
        const len = data.length;
        // Single pass for all orders (faster than 3 separate loops)
        for (let i = 0; i < len - 2; i++) {
            const a = data[i], b = data[i+1], c = data[i+2];
            const k2 = a + b;
            (this.markovTable.o2[k2] || (this.markovTable.o2[k2] = { D:0, T:0, Tie:0 }))[c]++;
            if (i < len - 3) {
                const d = data[i+3];
                const k3 = a + b + c;
                (this.markovTable.o3[k3] || (this.markovTable.o3[k3] = { D:0, T:0, Tie:0 }))[d]++;
                if (i < len - 4) {
                    const e = data[i+4];
                    const k4 = a + b + c + d;
                    (this.markovTable.o4[k4] || (this.markovTable.o4[k4] = { D:0, T:0, Tie:0 }))[e]++;
                }
            }
        }
    }

    buildPatterns() {
        this.patternMap = {};
        const data = this.trainingData;
        const len = data.length;
        for (let pLen = 3; pLen <= 6; pLen++) {
            for (let i = 0; i + pLen < len; i++) {
                let pattern = '';
                for (let j = 0; j < pLen; j++) pattern += data[i+j];
                const next = data[i + pLen];
                (this.patternMap[pattern] || (this.patternMap[pattern] = { D:0, T:0, Tie:0 }))[next]++;
            }
        }
    }

    predictMarkov(seq) {
        if (seq.length === 0) return null;
        const orders = [
            { key: seq.slice(-4).join(''), table: this.markovTable.o4, weight: 4 },
            { key: seq.slice(-3).join(''), table: this.markovTable.o3, weight: 3 },
            { key: seq.slice(-2).join(''), table: this.markovTable.o2, weight: 2 }
        ];

        let sD = 0, sT = 0, sTie = 0, totalMatches = 0;
        for (let o = 0; o < orders.length; o++) {
            const ord = orders[o];
            const stats = ord.table[ord.key];
            if (stats) {
                const total = stats.D + stats.T + stats.Tie;
                if (total > 0) {
                    sD += (stats.D / total) * ord.weight;
                    sT += (stats.T / total) * ord.weight;
                    sTie += (stats.Tie / total) * ord.weight;
                    totalMatches += ord.weight;
                }
            }
        }
        if (totalMatches === 0) return null;
        return { D: sD/totalMatches, T: sT/totalMatches, Tie: sTie/totalMatches };
    }

    predictPattern(seq) {
        if (seq.length === 0) return null;
        const seqStr = seq.join('');
        let sD = 0, sT = 0, sTie = 0, totalW = 0;
        const maxLen = Math.min(seq.length, 6);
        for (let len = maxLen; len >= 3; len--) {
            const pat = seqStr.slice(-len * 1); // 1 char per signal except 'Tie'... use seq array
            // Use char-based seq for pattern, build from last `len` items
            let key = '';
            for (let i = seq.length - len; i < seq.length; i++) key += seq[i];
            const stats = this.patternMap[key];
            if (stats) {
                const sum = stats.D + stats.T + stats.Tie;
                if (sum > 0) {
                    const w = len * len;
                    sD += (stats.D / sum) * w;
                    sT += (stats.T / sum) * w;
                    sTie += (stats.Tie / sum) * w;
                    totalW += w;
                }
            }
        }
        if (totalW === 0) return null;
        return { D: sD/totalW, T: sT/totalW, Tie: sTie/totalW };
    }

    predictStreak(seq) {
        if (seq.length === 0) return null;
        const last = seq[seq.length - 1];
        let streak = 1;
        for (let i = seq.length - 2; i >= 0; i--) {
            if (seq[i] === last) streak++; else break;
        }

        const scores = { D: 0.33, T: 0.33, Tie: 0.34 };

        if (streak >= 4) {
            scores[last] = 0.25;
            const other = last === 'D' ? 'T' : 'D';
            scores[other] = 0.65;
            scores.Tie = 0.10;
        } else if (streak >= 2) {
            scores[last] = 0.55;
            const other = last === 'D' ? 'T' : 'D';
            scores[other] = 0.35;
            scores.Tie = 0.10;
        } else if (seq.length >= 4) {
            const a = seq[seq.length-4], b = seq[seq.length-3], c = seq[seq.length-2], d = seq[seq.length-1];
            if (a !== b && b !== c && c !== d) {
                const next = last === 'D' ? 'T' : 'D';
                scores[next] = 0.75;
                scores[last] = 0.20;
                scores.Tie = 0.05;
            }
        }
        return scores;
    }

    predictFrequency(seq) {
        if (seq.length === 0) return null;
        let cD = 0, cT = 0, cTie = 0;
        for (let i = 0; i < seq.length; i++) {
            if (seq[i] === 'D') cD++;
            else if (seq[i] === 'T') cT++;
            else cTie++;
        }
        const total = seq.length;
        const bD = 1 - cD/total, bT = 1 - cT/total, bTie = 1 - cTie/total;
        const sum = bD + bT + bTie;
        return { D: bD/sum, T: bT/sum, Tie: bTie/sum };
    }

    predict(input) {
        if (!input || input.length === 0) {
            return { prediction: 'D', confidence: 0, scores: null, breakdown: null };
        }

        // Normalize once
        const seq = [];
        for (let i = 0; i < input.length; i++) {
            const n = this.normalize(input[i]);
            if (n) seq.push(n);
        }

        // Memoization — return cached result if input + data unchanged
        const inputHash = this._hashArr(seq) + ':' + this.mode;
        if (inputHash === this._lastInputHash && this._lastResult) {
            return this._lastResult;
        }
        this._lastInputHash = inputHash;

        const weights = { markov: 0.40, pattern: 0.30, streak: 0.20, frequency: 0.10 };
        const markov  = this.predictMarkov(seq);
        const pattern = this.predictPattern(seq);
        const streak  = this.predictStreak(seq);
        const freq    = this.predictFrequency(seq);

        if (this.mode === 'markov' && markov)   return this._finalize(markov, seq, false, { markov, pattern, streak, freq });
        if (this.mode === 'pattern' && pattern) return this._finalize(pattern, seq, false, { markov, pattern, streak, freq });
        if (this.mode === 'streak' && streak)   return this._finalize(streak, seq, false, { markov, pattern, streak, freq });

        let cD = 0, cT = 0, cTie = 0, totalW = 0;
        if (markov)  { cD += markov.D*weights.markov;   cT += markov.T*weights.markov;   cTie += markov.Tie*weights.markov;   totalW += weights.markov; }
        if (pattern) { cD += pattern.D*weights.pattern; cT += pattern.T*weights.pattern; cTie += pattern.Tie*weights.pattern; totalW += weights.pattern; }
        if (streak)  { cD += streak.D*weights.streak;   cT += streak.T*weights.streak;   cTie += streak.Tie*weights.streak;   totalW += weights.streak; }
        if (freq)    { cD += freq.D*weights.frequency;  cT += freq.T*weights.frequency;  cTie += freq.Tie*weights.frequency;  totalW += weights.frequency; }

        if (totalW === 0) {
            const fb = streak || { D: 0.45, T: 0.45, Tie: 0.10 };
            return this._finalize(fb, seq, true, { markov, pattern, streak, freq });
        }

        return this._finalize({ D: cD/totalW, T: cT/totalW, Tie: cTie/totalW }, seq, false, { markov, pattern, streak, freq });
    }

    _finalize(scores, seq, isFallback, breakdown) {
        let prediction = 'D', maxScore = scores.D;
        if (scores.T > maxScore) { prediction = 'T'; maxScore = scores.T; }
        if (scores.Tie > maxScore && scores.Tie > 0.4) { prediction = 'Tie'; maxScore = scores.Tie; }

        const sorted = [scores.D, scores.T, scores.Tie].sort((a,b)=>b-a);
        const gap = sorted[0] - sorted[1];
        let confidence = (maxScore * 100) + (gap * 50);

        const dataBoost = Math.min(this.trainingData.length / 200, 1) * 15;
        confidence += dataBoost;

        if (isFallback) confidence *= 0.85;
        confidence = Math.max(60, Math.min(99, Math.round(confidence)));

        const result = {
            prediction,
            confidence,
            scores: {
                D: Math.round(scores.D * 100),
                T: Math.round(scores.T * 100),
                Tie: Math.round(scores.Tie * 100)
            },
            breakdown: {
                markov:  breakdown.markov  ? Math.round((breakdown.markov[prediction] || 0) * 100) : null,
                pattern: breakdown.pattern ? Math.round((breakdown.pattern[prediction] || 0) * 100) : null,
                streak:  breakdown.streak  ? Math.round((breakdown.streak[prediction] || 0) * 100) : null
            }
        };
        this._lastResult = result;
        return result;
    }
}

window.predictor = new DragonTigerPredictor();
