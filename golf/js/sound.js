// Tiny synthesized sound effects (no audio files needed).
let ac = null;

function ctx() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
  }
  return ac;
}

function noise(duration, { freq = 1000, q = 1, gain = 0.4, type = "bandpass", delay = 0 } = {}) {
  const a = ctx();
  if (!a || a.state !== "running") return;
  const len = Math.floor(a.sampleRate * duration);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(a.currentTime + delay);
}

function tone(freq, duration, { gain = 0.2, type = "sine", delay = 0, slide = 0 } = {}) {
  const a = ctx();
  if (!a || a.state !== "running") return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + duration);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + duration + 0.05);
}

export const sfx = {
  unlock() {
    const a = ctx();
    if (a && a.state !== "running") a.resume().catch(() => {});
  },
  hit(power) {
    noise(0.12, { freq: 2800, q: 0.8, gain: 0.5 + Math.min(power, 1) * 0.4 });
    tone(180, 0.12, { gain: 0.35, type: "triangle", slide: 0.5 });
  },
  putt() {
    tone(900, 0.08, { gain: 0.15, type: "triangle" });
  },
  land(surface) {
    if (surface === "sand") noise(0.25, { freq: 600, gain: 0.3, type: "lowpass" });
    else noise(0.08, { freq: 400, gain: 0.2, type: "lowpass" });
  },
  tree() {
    noise(0.3, { freq: 1500, q: 0.5, gain: 0.3 });
    tone(300, 0.1, { gain: 0.15, type: "square", slide: 0.6 });
  },
  splash() {
    noise(0.6, { freq: 800, q: 0.4, gain: 0.5, type: "lowpass" });
  },
  miss() {
    tone(330, 0.3, { gain: 0.15, type: "sawtooth", slide: 0.6 });
  },
  cup() {
    tone(1200, 0.05, { gain: 0.25, type: "triangle" });
    tone(880, 0.25, { gain: 0.25, delay: 0.12 });
    tone(1320, 0.4, { gain: 0.2, delay: 0.3 });
    noise(1.4, { freq: 2000, q: 0.3, gain: 0.25, delay: 0.4 });
  },
  join() {
    tone(660, 0.12, { gain: 0.15 });
    tone(990, 0.18, { gain: 0.15, delay: 0.1 });
  },
  cheer() {
    noise(2.2, { freq: 1800, q: 0.25, gain: 0.3 });
  }
};
