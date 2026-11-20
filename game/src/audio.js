// Synthesised sound effects with the Web Audio API: no audio files, no network.
// Everything is created lazily on the first user gesture; muted until then.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(ctx.destination);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, duration, type, volume) {
    if (!ensure() || muted) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume || 0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio is decoration; a failure never stops the game.
    }
  }

  function noise(duration, volume, lowpass) {
    if (!ensure() || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass || 1200;
      const gain = ctx.createGain();
      gain.gain.value = volume || 0.2;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    } catch {
      // Audio is decoration; a failure never stops the game.
    }
  }

  let sirenPhase = 0;
  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    toggleMute() {
      muted = !muted;
      if (engineGain) engineGain.gain.value = 0;
      if (sirenGain) sirenGain.gain.value = 0;
      return muted;
    },
    /** Continuous engine hum and police siren, called every frame with the live state. */
    update(speed, wanted, dt) {
      if (!ctx || muted) return;
      try {
        const target = speed > 10 ? 0.028 + Math.min(0.05, speed * 0.00008) : 0;
        engineGain.gain.value += (target - engineGain.gain.value) * 0.2;
        if (engineOsc) engineOsc.frequency.value = 55 + Math.abs(speed) * 0.22;
        if (wanted > 0) {
          sirenPhase += dt;
          sirenOsc.frequency.value = Math.sin(sirenPhase * 4.4) > 0 ? 920 : 660;
          sirenGain.gain.value = 0.018;
        } else {
          sirenGain.gain.value = 0;
        }
      } catch {
        // Ignore.
      }
    },
    shot() {
      noise(0.12, 0.25, 2400);
    },
    crash() {
      noise(0.25, 0.3, 500);
    },
    pickup() {
      blip(880, 0.12, 'sine', 0.12);
      setTimeout(() => blip(1320, 0.14, 'sine', 0.1), 70);
    },
    mission() {
      blip(523, 0.12, 'triangle', 0.12);
      setTimeout(() => blip(659, 0.12, 'triangle', 0.12), 110);
      setTimeout(() => blip(784, 0.2, 'triangle', 0.12), 220);
    },
    busted() {
      blip(220, 0.4, 'sawtooth', 0.12);
    },
  };
}
