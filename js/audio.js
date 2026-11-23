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
}
