export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.droneOsc1 = null;
    this.droneOsc2 = null;
    this.droneGain = null;
    this.lastStepAt = 0;
    this.lastBeatAt = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.65 : 0;
    this.master.connect(this.ctx.destination);
    this._startDrone();
  }

  setEnabled(val) {
    this.enabled = val;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(val ? 0.65 : 0, this.ctx.currentTime, 0.06);
    }
  }

  _startDrone() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.08, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(190, now);

    this.droneOsc1 = this.ctx.createOscillator();
    this.droneOsc1.type = "sawtooth";
    this.droneOsc1.frequency.setValueAtTime(55, now); // A1

    this.droneOsc2 = this.ctx.createOscillator();
    this.droneOsc2.type = "triangle";
    this.droneOsc2.frequency.setValueAtTime(58.2, now); // eerie beat detune

    this.droneOsc1.connect(filter);
    this.droneOsc2.connect(filter);
    filter.connect(this.droneGain);
    this.droneGain.connect(this.master);

    this.droneOsc1.start(now);
    this.droneOsc2.start(now);
  }

  updateAmbience(dangerLevel, isPlaying) {
    if (!this.ctx || !this.droneGain) return;
    const targetGain = isPlaying ? (0.06 + dangerLevel * 0.08) : 0.03;
    this.droneGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.2);

    if (isPlaying && dangerLevel > 0.12 && this.enabled) {
      const nowMs = performance.now();
      const interval = 1050 - dangerLevel * 670; // 1050ms down to 380ms
      if (nowMs - this.lastBeatAt > interval) {
        this.lastBeatAt = nowMs;
        this.playHeartbeat(0.18 + dangerLevel * 0.45);
      }
    }
  }

  playHeartbeat(volume = 0.35) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const thump = (offset, freq, gainPeak) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t + offset);
      osc.frequency.exponentialRampToValueAtTime(28, t + offset + 0.14);
      g.gain.setValueAtTime(0.001, t + offset);
      g.gain.linearRampToValueAtTime(gainPeak, t + offset + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.16);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t + offset);
      osc.stop(t + offset + 0.18);
    };
    thump(0, 74, volume);
    thump(0.14, 62, volume * 0.7);
  }

  playFootstep(quiet = false) {
    if (!this.ctx || !this.enabled) return;
    const nowMs = performance.now();
    if (nowMs - this.lastStepAt < (quiet ? 420 : 280)) return;
    this.lastStepAt = nowMs;

    const t = this.ctx.currentTime;
    const bufSize = Math.floor(this.ctx.sampleRate * 0.06);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.35));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = quiet ? 420 : 720 + Math.random() * 140;

    const g = this.ctx.createGain();
    g.gain.value = quiet ? 0.08 : 0.16;

    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  playGlassCrunch() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const bufSize = Math.floor(this.ctx.sampleRate * 0.24);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.28));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2400;
    const g = this.ctx.createGain();
    g.gain.value = 0.42;
    src.connect(hp);
    hp.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  playDouse(lit) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(lit ? 320 : 520, t);
    osc.frequency.exponentialRampToValueAtTime(lit ? 640 : 190, t + 0.12);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  playFlare() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.45);
    g.gain.setValueAtTime(0.38, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.46);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.48);
  }

  playPage() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    [440, 554.37, 659.25].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t + idx * 0.08);
      g.gain.setValueAtTime(0.14, t + idx * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.45);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t + idx * 0.08);
      osc.stop(t + idx * 0.08 + 0.48);
    });
  }

  playAlert() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    [311, 329, 622].forEach((freq) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.linearRampToValueAtTime(freq * 1.18, t + 0.25);
      g.gain.setValueAtTime(0.11, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.45);
    });
  }

  playDeath() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    [146.8, 138.6, 98.0].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, t + i * 0.14);
      osc.frequency.exponentialRampToValueAtTime(42, t + i * 0.14 + 0.7);
      g.gain.setValueAtTime(0.2, t + i * 0.14);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.14 + 0.75);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t + i * 0.14);
      osc.stop(t + i * 0.14 + 0.78);
    });
  }

  playWin() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    [293.66, 369.99, 440, 587.33].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t + i * 0.1);
      g.gain.setValueAtTime(0.18, t + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.85);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 0.9);
    });
  }

  _noise(dur, { type = "bandpass", freq = 800, q = 1, gain = 0.2, decay = 0.3, delay = 0 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * decay));
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  _tone(freq, dur, { type = "sine", gain = 0.15, to = null, delay = 0 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  playSwing(kind) {
    if (kind === "crossbow") {
      this._tone(180, 0.12, { type: "square", gain: 0.12, to: 90 });
      this._noise(0.08, { type: "highpass", freq: 3000, gain: 0.15 });
      return;
    }
    const heavy = kind === "mace";
    this._noise(heavy ? 0.28 : 0.14, { type: "bandpass", freq: heavy ? 500 : 1600, q: 0.8, gain: heavy ? 0.22 : 0.16, decay: 0.5 });
    if (kind === "staff") this._noise(0.25, { type: "lowpass", freq: 900, gain: 0.1, decay: 0.6 });
  }

  playHit(heavy = false) {
    this._tone(heavy ? 90 : 150, 0.16, { type: "triangle", gain: 0.3, to: 45 });
    this._noise(0.1, { type: "highpass", freq: heavy ? 1800 : 3200, gain: 0.22, decay: 0.25 });
  }

  playClang() {
    this._tone(880, 0.35, { type: "square", gain: 0.06 });
    this._tone(1320, 0.3, { type: "sine", gain: 0.08 });
  }

  playMonsterSpot(kind) {
    if (kind === "bats") { for (let i = 0; i < 4; i++) this._tone(3200 + Math.random() * 1500, 0.05, { type: "square", gain: 0.035, delay: i * 0.06 }); return; }
    if (kind === "maiden") { this._tone(700, 0.5, { type: "sawtooth", gain: 0.05, to: 1200 }); return; }
    if (kind === "dweller") { this._tone(70, 0.9, { type: "sine", gain: 0.12, to: 40 }); this._noise(0.7, { type: "lowpass", freq: 250, gain: 0.16, decay: 0.7 }); return; }
    this._tone(110, 0.6, { type: "sawtooth", gain: 0.08, to: 70 });
  }

  playMonsterDie() {
    this._tone(300, 0.6, { type: "sawtooth", gain: 0.08, to: 40 });
    this._noise(0.5, { type: "lowpass", freq: 700, gain: 0.18, decay: 0.6 });
  }

  playHurt() {
    this._tone(70, 0.25, { type: "sine", gain: 0.4, to: 35 });
    this._noise(0.12, { type: "bandpass", freq: 600, gain: 0.25 });
  }

  playMirror(tier) {
    this._noise(0.5, { type: "highpass", freq: 4200, gain: 0.32, decay: 0.35 });
    const base = { cracked: 660, silver: 880, gilded: 990, obsidian: 440 }[tier] || 880;
    [1, 1.5, 2].forEach((m, i) => this._tone(base * m, 1.2, { type: "sine", gain: 0.1, delay: i * 0.05 }));
  }

  playPickup() {
    this._tone(988, 0.15, { gain: 0.1 });
    this._tone(1318, 0.25, { gain: 0.1, delay: 0.08 });
  }

  playSpawn() {
    this._noise(0.9, { type: "lowpass", freq: 300, gain: 0.12, decay: 0.7 });
    this._tone(55, 0.9, { type: "sawtooth", gain: 0.05, to: 40 });
  }
  playWellToss() {
    this._noise(0.4, { type: "bandpass", freq: 1400, q: 0.6, gain: 0.18, decay: 0.4 });
    this._tone(900, 0.15, { type: "sine", gain: 0.08, to: 400 });
    this._tone(180, 0.6, { type: "sine", gain: 0.08, to: 70, delay: 0.12 });
  }
  playBoon() {
    this._tone(523, 0.2, { gain: 0.1 });
    this._tone(784, 0.35, { gain: 0.1, delay: 0.08 });
    this._tone(1046, 0.4, { gain: 0.08, delay: 0.16 });
  }
  playCurse() {
    this._tone(220, 0.7, { type: "sawtooth", gain: 0.08, to: 70 });
    this._noise(0.8, { type: "lowpass", freq: 400, gain: 0.16, decay: 0.7 });
  }
  playWellSpawn() {
    this._noise(1.2, { type: "lowpass", freq: 220, gain: 0.2, decay: 0.9 });
    this._tone(48, 1.4, { type: "sine", gain: 0.12, to: 32 });
    this._tone(90, 0.8, { type: "triangle", gain: 0.06, to: 40, delay: 0.3 });
  }
  playSecretOpen() {
    this._noise(1.4, { type: "lowpass", freq: 500, gain: 0.28, decay: 0.8 });
    this._tone(90, 0.5, { type: "square", gain: 0.06, to: 40 });
    this._noise(0.6, { type: "bandpass", freq: 800, q: 0.5, gain: 0.12, decay: 0.5, delay: 0.4 });
    this._tone(60, 1.0, { type: "sine", gain: 0.08, to: 35, delay: 0.2 });
  }

  // ---- v0.5: crates, keys, puzzle chambers ----
  playCrateHit() {
    this._noise(0.12, { type: "bandpass", freq: 420, q: 1.4, gain: 0.3, decay: 0.25 });
    this._tone(140, 0.1, { type: "triangle", gain: 0.08, to: 90 });
  }
  playCrateBreak() {
    this._noise(0.4, { type: "bandpass", freq: 650, q: 0.7, gain: 0.36, decay: 0.3 });
    this._noise(0.25, { type: "highpass", freq: 1800, gain: 0.12, decay: 0.2, delay: 0.04 });
    this._tone(110, 0.25, { type: "triangle", gain: 0.1, to: 55 });
  }
  playSlime() {
    this._tone(220, 0.25, { type: "sine", gain: 0.12, to: 90 });
    this._noise(0.3, { type: "lowpass", freq: 400, gain: 0.18, decay: 0.4, delay: 0.05 });
  }
  playArmor() {
    this._tone(660, 0.18, { type: "square", gain: 0.05 });
    this._tone(990, 0.3, { type: "triangle", gain: 0.06, delay: 0.08 });
  }
  playKey() {
    [784, 988, 1175, 1568].forEach((f, i) => this._tone(f, 0.5, { type: "triangle", gain: 0.07, delay: i * 0.09 }));
    this._tone(98, 1.2, { type: "sine", gain: 0.1, to: 65 });
  }
  playUnlock() {
    this._noise(0.08, { type: "highpass", freq: 2500, gain: 0.2, decay: 0.2 });
    this._tone(320, 0.12, { type: "square", gain: 0.06, delay: 0.1 });
    this._noise(1.0, { type: "lowpass", freq: 420, gain: 0.22, decay: 0.7, delay: 0.25 });
  }
  playDoorSlam() {
    this._noise(0.6, { type: "lowpass", freq: 260, gain: 0.45, decay: 0.35 });
    this._tone(55, 0.7, { type: "sine", gain: 0.2, to: 32 });
  }
  playCandle(good = true) {
    this._noise(0.2, { type: "bandpass", freq: 1500, q: 0.8, gain: 0.12, decay: 0.4 });
    if (good) this._tone(523 + Math.random() * 40, 0.5, { type: "sine", gain: 0.06, delay: 0.05 });
  }
  playSnuff() {
    this._noise(0.7, { type: "highpass", freq: 900, gain: 0.2, decay: 0.5 });
    this._tone(300, 0.6, { type: "sawtooth", gain: 0.05, to: 80 });
  }
  playPlate() {
    this._tone(180, 0.18, { type: "square", gain: 0.07, to: 120 });
    this._noise(0.2, { type: "lowpass", freq: 600, gain: 0.16, decay: 0.3 });
  }
  playGrind() {
    this._noise(0.9, { type: "lowpass", freq: 220, q: 2, gain: 0.22, decay: 0.9 });
    this._tone(42 + Math.random() * 6, 0.9, { type: "sawtooth", gain: 0.035 });
  }
  playSolve() {
    [392, 494, 587, 784].forEach((f, i) => this._tone(f, 0.7, { type: "triangle", gain: 0.08, delay: i * 0.12 }));
    this._noise(1.2, { type: "lowpass", freq: 500, gain: 0.2, decay: 0.8, delay: 0.3 });
  }

  // ---- v0.6: shop, stage transition, graveyard ----
  playUiTick() { this._tone(1200, 0.06, { type: "square", gain: 0.03 }); }
  playShopOpen() {
    this._tone(660, 0.3, { type: "triangle", gain: 0.06 });
    this._tone(990, 0.4, { type: "triangle", gain: 0.05, delay: 0.1 });
    this._noise(0.3, { type: "highpass", freq: 5000, gain: 0.05, decay: 0.4 });
  }
  playShopBuy() {
    for (let i = 0; i < 4; i++) this._tone(1800 + Math.random() * 900, 0.08, { type: "square", gain: 0.025, delay: i * 0.05 });
    this._tone(784, 0.25, { type: "triangle", gain: 0.08, delay: 0.18 });
  }
  playDeny() {
    this._tone(180, 0.18, { type: "square", gain: 0.06 });
    this._tone(140, 0.25, { type: "square", gain: 0.06, delay: 0.12 });
  }
  playStage() {
    this._tone(98, 2.2, { type: "sawtooth", gain: 0.06, to: 65 });
    [196, 233, 294].forEach((f, i) => this._tone(f, 1.6, { type: "triangle", gain: 0.05, delay: 0.2 + i * 0.25 }));
    this._noise(2.0, { type: "lowpass", freq: 300, gain: 0.16, decay: 0.8 });
  }
  playWail() {
    this._tone(900, 1.1, { type: "sawtooth", gain: 0.05, to: 1500 });
    this._tone(1240, 1.0, { type: "sine", gain: 0.06, to: 700, delay: 0.1 });
    this._noise(1.0, { type: "bandpass", freq: 2400, q: 3, gain: 0.08, decay: 0.7 });
  }
  playHands() {
    this._noise(0.35, { type: "lowpass", freq: 380, gain: 0.3, decay: 0.4 });
    this._tone(60, 0.4, { type: "sine", gain: 0.12, to: 35 });
  }
  playCoffin(ok = true) {
    this._noise(0.5, { type: "lowpass", freq: ok ? 600 : 300, gain: 0.25, decay: 0.5 });
    this._tone(ok ? 110 : 70, 0.3, { type: "triangle", gain: 0.1, to: ok ? 80 : 40, delay: 0.25 });
  }
  playBell(metal = "silver") {
    const f = { silver: 1046, bronze: 698, iron: 440, bone: 262 }[metal] || 660;
    [1, 2.4, 3.1].forEach((m, i) => this._tone(f * m, metal === "bone" ? 0.6 : 2.0, { type: "sine", gain: 0.09 / (i + 1) }));
    if (metal === "bone") this._noise(0.2, { type: "bandpass", freq: 900, q: 2, gain: 0.12, decay: 0.3 });
  }
  playSurge() {
    this._noise(1.0, { type: "lowpass", freq: 500, gain: 0.3, decay: 0.6 });
    this._tone(55, 0.8, { type: "sine", gain: 0.12, to: 40 });
  }
  playWater() { this._noise(0.9, { type: "bandpass", freq: 700, q: 0.4, gain: 0.07, decay: 0.8 }); }

  // ---- v0.7: the Climb ----
  playStairs() {
    for (let i = 0; i < 6; i++) this._noise(0.09, { type: "lowpass", freq: 520 - i * 30, gain: 0.16, decay: 0.25, delay: i * 0.13 });
    this._tone(65, 1.0, { type: "sine", gain: 0.06, to: 49, delay: 0.3 });
  }
  playMirrorTurn() {
    this._noise(0.22, { type: "bandpass", freq: 1800, q: 2, gain: 0.08, decay: 0.4 });
    this._tone(1568, 0.35, { type: "sine", gain: 0.04, delay: 0.05 });
  }
  playBeam(ok = true) {
    this._tone(ok ? 880 : 330, 1.2, { type: "triangle", gain: 0.06, to: ok ? 1320 : 220 });
    this._noise(0.6, { type: "highpass", freq: 3000, gain: 0.06, decay: 0.5 });
  }
  playTick() { this._tone(2200, 0.03, { type: "square", gain: 0.02 }); }
  playStrike() {
    [1, 2.76, 5.4].forEach((m, i) => this._tone(196 * m, 2.2, { type: "sine", gain: 0.1 / (i + 1) }));
  }
  playBookPull() {
    this._noise(0.25, { type: "bandpass", freq: 900, q: 0.7, gain: 0.14, decay: 0.4 });
    this._tone(140, 0.15, { type: "triangle", gain: 0.06, delay: 0.12 });
  }
  playScreech() {
    this._tone(1400, 0.6, { type: "sawtooth", gain: 0.05, to: 600 });
    this._noise(0.5, { type: "bandpass", freq: 2200, q: 2, gain: 0.1, decay: 0.5 });
  }
}
