// Solara Bay — sound: everything is synthesized with WebAudio, no audio files.
// Engine hum, sirens, gunshots, punches, pickups and a small music loop.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicTimer = null;
    this.engineNodes = null;
    this.sirenNodes = null;
    this.step = 0;
  }

  // Must be called from a user gesture (menu click) so the browser allows audio.
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, vol, filterFreq) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  click() { this.tone(880, 0.06, 'square', 0.08); }
  pickup() { this.tone(660, 0.09, 'sine', 0.18); setTimeout(() => this.tone(990, 0.12, 'sine', 0.18), 70); }
  punch() { this.noise(0.12, 0.35, 300); this.tone(120, 0.1, 'sine', 0.25, 60); }
  gunshot() { this.noise(0.16, 0.5, 2600); this.tone(180, 0.08, 'square', 0.12, 50); }
  crash() { this.noise(0.35, 0.5, 700); this.tone(90, 0.3, 'sine', 0.3, 40); }
  busted() { this.tone(392, 0.25, 'square', 0.15); setTimeout(() => this.tone(311, 0.4, 'square', 0.15), 220); }
  missionDone() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.2), i * 110));
  }
  denied() { this.tone(160, 0.16, 'square', 0.14, 110); }

  // Engine hum that follows the car's speed. Call every frame with speed 0..1.
  engine(speed01, on) {
    if (!this.ctx) return;
    if (!on) {
      if (this.engineNodes) { try { this.engineNodes.o1.stop(); this.engineNodes.o2.stop(); } catch (e) {} this.engineNodes = null; }
      return;
    }
    if (!this.engineNodes) {
      const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth';
      const o2 = this.ctx.createOscillator(); o2.type = 'square';
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      const g = this.ctx.createGain(); g.gain.value = 0.05;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
      o1.start(); o2.start();
      this.engineNodes = { o1, o2, g };
    }
    const t = this.ctx.currentTime;
    const freq = 55 + speed01 * 130;
    this.engineNodes.o1.frequency.setTargetAtTime(freq, t, 0.05);
    this.engineNodes.o2.frequency.setTargetAtTime(freq * 0.5 + 3, t, 0.05);
    this.engineNodes.g.gain.setTargetAtTime(0.03 + speed01 * 0.05, t, 0.08);
  }

  // Two-tone police siren, audible when a cop car is near.
  siren(on) {
    if (!this.ctx) return;
    if (!on) {
      if (this.sirenNodes) { try { this.sirenNodes.o.stop(); } catch (e) {} this.sirenNodes = null; }
      return;
    }
    if (!this.sirenNodes) {
      const o = this.ctx.createOscillator(); o.type = 'triangle';
      const g = this.ctx.createGain(); g.gain.value = 0.035;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.9;
      const lg = this.ctx.createGain(); lg.gain.value = 160;
      lfo.connect(lg); lg.connect(o.frequency);
      o.frequency.value = 820;
      o.connect(g); g.connect(this.master);
      o.start(); lfo.start();
      this.sirenNodes = { o, lfo };
    }
  }

  // A small sunset-drive loop: Am – F – C – G, bass + pluck lead.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const chords = [
      [220.0, 261.6, 329.6], [174.6, 220.0, 261.6],
      [196.0, 261.6, 329.6], [196.0, 246.9, 293.7],
    ];
    const bass = [110.0, 87.3, 130.8, 98.0];
    const leadNotes = [440, 523, 659, 587, 523, 440, 392, 523];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const bar = this.step % 4;
      const chord = chords[bar];
      chord.forEach((f) => this.tone(f, 1.9, 'triangle', 0.045));
      this.tone(bass[bar], 1.9, 'sine', 0.09);
      if (this.step % 2 === 0) this.tone(leadNotes[(this.step * 3) % leadNotes.length], 0.5, 'square', 0.03);
      this.step++;
    }, 500);
  }

  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
}
