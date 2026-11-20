// Sound effects, synthesised with Web Audio (no sound files to load).
// Browsers only allow audio after a tap or click; main.jsx unlocks it on the first one.

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = (() => { try { return localStorage.getItem('mello_muted') === '1'; } catch (e) { return false; } })();

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function unlockAudio() { ac(); }
export const isMuted = () => muted;
export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem('mello_muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
}
const ready = () => !muted && ac();

function env(g, t, attack, peak, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(freq, t, dur, { type = 'sine', gain = 0.3, attack = 0.005, dest = master } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  env(g, t, attack, gain, dur);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

function noise() {
  if (!noiseBuf) {
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

// A bell "ding"; level 0..2 gets brighter for bigger points.
export function ding(level = 0, delay = 0) {
  if (!ready()) return;
  const t = ctx.currentTime + 0.01 + delay;
  const base = [784, 988, 1319][level] || 784;
  tone(base, t, 0.9, { gain: 0.2 });
  tone(base * 2.01, t, 0.45, { gain: 0.06 });
  tone(base * 3.02, t, 0.2, { gain: 0.03 });
}

export function whoosh() {
  if (!ready()) return;
  const t = ctx.currentTime + 0.01;
  const s = noise();
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(3500, t + 0.45);
  const g = ctx.createGain();
  env(g, t, 0.18, 0.35, 0.4);
  s.connect(f);
  f.connect(g);
  g.connect(master);
  s.start(t);
  s.stop(t + 0.7);
}

// Snare roll that builds for a few seconds and holds until stop() is called.
export function drumroll(maxSeconds = 14) {
  if (!ready()) return () => {};
  const t0 = ctx.currentTime + 0.02;
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0.12, t0);
  bus.gain.linearRampToValueAtTime(0.55, t0 + 2.6);
  bus.connect(master);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1100;
  hp.connect(bus);
  const nodes = [];
  for (let t = t0, i = 0; t < t0 + maxSeconds; i++) {
    const s = noise();
    const g = ctx.createGain();
    env(g, t, 0.002, 0.45 + 0.35 * Math.random(), 0.05);
    s.connect(g);
    g.connect(hp);
    s.start(t, Math.random() * 1.5, 0.09);
    nodes.push(s);
    t += Math.max(0.035, 0.07 - 0.012 * (t - t0));
  }
  let stopped = false;
  return () => {
    if (stopped || !ctx) return;
    stopped = true;
    const now = ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), now);
    bus.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    for (const n of nodes) { try { n.stop(now + 0.08); } catch (e) { /* not started yet */ } }
  };
}

// Cymbal crash with a low boom: the 12-point moment.
export function crash() {
  if (!ready()) return;
  const t = ctx.currentTime + 0.01;
  const s = noise();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4500;
  const g = ctx.createGain();
  env(g, t, 0.004, 0.5, 1.6);
  s.connect(hp);
  hp.connect(g);
  g.connect(master);
  s.start(t);
  s.stop(t + 1.8);
  const o = ctx.createOscillator();
  const og = ctx.createGain();
  o.frequency.setValueAtTime(95, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.5);
  env(og, t, 0.005, 0.6, 0.55);
  o.connect(og);
  og.connect(master);
  o.start(t);
  o.stop(t + 0.7);
}

function brass(freq, t, dur, gain = 0.16) {
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(600, t);
  f.frequency.linearRampToValueAtTime(2600, t + 0.06);
  f.frequency.exponentialRampToValueAtTime(1200, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
  g.gain.setValueAtTime(gain, t + Math.max(0.04, dur - 0.08));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
  f.connect(g);
  g.connect(master);
  for (const det of [-6, 6]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = det;
    o.connect(f);
    o.start(t);
    o.stop(t + dur + 0.2);
  }
}

// "Ta-ta-ta-taaa!" for winners.
export function fanfare() {
  if (!ready()) return;
  const t = ctx.currentTime + 0.05;
  const G4 = 392, C5 = 523.25, E5 = 659.25, G5 = 784, C6 = 1046.5;
  brass(G4, t, 0.13); brass(G4, t + 0.16, 0.13); brass(G4, t + 0.32, 0.13);
  [C5, E5, G5].forEach((f) => brass(f, t + 0.48, 0.8, 0.11));
  brass(E5, t + 1.42, 0.13); brass(G5, t + 1.58, 0.13);
  [C5, E5, G5, C6].forEach((f) => brass(f, t + 1.74, 1.3, 0.09));
}

// Short bright sting for round intros.
export function sting() {
  if (!ready()) return;
  const t = ctx.currentTime + 0.02;
  [523.25, 784, 1046.5].forEach((f, i) => brass(f, t + i * 0.09, 0.22, 0.1));
}
