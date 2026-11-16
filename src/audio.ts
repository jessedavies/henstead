// All sound is synthesised with WebAudio so the game ships with no audio assets.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let lastCluck = 0;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    loadSamples();
  } catch { ctx = null; }
}

export function setMuted(m: boolean) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}
export const isMuted = () => muted;

function tone(type: OscillatorType, pts: [number, number][], vol: number, opts: { vib?: number; at?: number } = {}) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + (opts.at || 0);
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(pts[0][1], t0);
  for (const [t, f] of pts) o.frequency.linearRampToValueAtTime(f, t0 + t);
  const end = pts[pts.length - 1][0];
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
  g.gain.setValueAtTime(vol, t0 + Math.max(0.02, end - 0.04));
  g.gain.linearRampToValueAtTime(0, t0 + end);
  if (opts.vib) {
    const l = ctx.createOscillator();
    const lg = ctx.createGain();
    l.frequency.value = 28; lg.gain.value = opts.vib;
    l.connect(lg); lg.connect(o.frequency);
    l.start(t0); l.stop(t0 + end);
  }
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + end + 0.02);
}

function noise(dur: number, freq: number, vol: number, at = 0) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + at;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t0);
}

// ---------- recorded samples (optional; the synth below is the fallback) ----------
const SAMPLES = ['cluck1', 'cluck2', 'cluck3', 'cluck4', 'cackle', 'bark', 'crow', 'pop1', 'pop2', 'pop3', 'birds', 'music'];
const buffers: Record<string, AudioBuffer> = {};
let sampleBase = '', musicOn = true, ambience = 1;
let musicGain: GainNode | null = null, birdGain: GainNode | null = null;
export function useSamples(base: string) { sampleBase = base; }
function loadSamples() {
  if (!ctx || !sampleBase) return;
  for (const name of SAMPLES) {
    fetch(sampleBase + name + '.mp3').then(r => (r.ok ? r.arrayBuffer() : Promise.reject())).then(b => ctx!.decodeAudioData(b)).then(buf => {
      buffers[name] = buf;
      if (name === 'music') musicGain = loop(buf, musicOn ? 0.3 : 0);
      if (name === 'birds') birdGain = loop(buf, 0.4 * ambience);
    }).catch(() => { /* file missing or blocked: keep the synth */ });
  }
}
function loop(buf: AudioBuffer, vol: number) {
  const s = ctx!.createBufferSource(), g = ctx!.createGain();
  s.buffer = buf; s.loop = true; g.gain.value = vol; s.connect(g); g.connect(master!); s.start();
  return g;
}
function play(name: string, vol = 1, rate = 1) {
  const buf = buffers[name];
  if (!ctx || !master || !buf) return false;
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = buf; s.playbackRate.value = rate; g.gain.value = vol; s.connect(g); g.connect(master); s.start();
  return true;
}
export function setMusic(on: boolean) { musicOn = on; if (musicGain && ctx) musicGain.gain.setTargetAtTime(on ? 0.3 : 0, ctx.currentTime, 0.4); }
export const isMusicOn = () => musicOn;
/** 1 by day, towards 0 at night: birdsong fades out after dark. */
export function setAmbience(level: number) { if (Math.abs(level - ambience) < 0.02) return; ambience = level; if (birdGain && ctx) birdGain.gain.setTargetAtTime(0.4 * level, ctx.currentTime, 0.5); }

export const sfx = {
  gather() { tone('sine', [[0, 1300], [0.22, 2300], [0.4, 2300]], 0.22, { vib: 12 }); noise(0.4, 3000, 0.03); },
  steady() { tone('sine', [[0, 1500], [0.12, 1500]], 0.2); tone('sine', [[0, 1500], [0.12, 1500]], 0.2, { at: 0.18 }); },
  lie() { tone('sine', [[0, 2200], [0.5, 1000]], 0.22, { vib: 8 }); },
  bark() {
    if (play('bark', 0.7)) return;
    for (const at of [0, 0.17]) {
      tone('sawtooth', [[0, 260], [0.11, 130]], 0.3, { at });
      noise(0.1, 700, 0.35, at);
    }
  },
  cluck(panic = 0) {
    if (!ctx || ctx.currentTime - lastCluck < 0.09) return;
    lastCluck = ctx.currentTime;
    if (play('cluck' + (1 + ((Math.random() * 4) | 0)), 0.35 + panic * 0.35, 0.9 + Math.random() * 0.3 + panic * 0.15)) return;
    const f = 500 + Math.random() * 350 + panic * 300;
    tone('square', [[0, f], [0.05, f * 1.5], [0.09, f * 0.9]], 0.035 + panic * 0.03);
  },
  hawk() { tone('sawtooth', [[0, 2600], [0.5, 1700], [0.7, 1500]], 0.09, { vib: 60 }); },
  cackle() { play('cackle', 0.5); },
  crow() { if (play('crow', 0.55)) return; tone('sawtooth', [[0, 500], [0.12, 800], [0.3, 760], [0.42, 900], [0.9, 620]], 0.1, { vib: 25 }); },
  fox() { tone('sawtooth', [[0, 900], [0.1, 1400], [0.22, 700]], 0.1); tone('sawtooth', [[0, 900], [0.1, 1400], [0.22, 700]], 0.1, { at: 0.3 }); },
  buy() { tone('triangle', [[0, 990], [0.08, 990]], 0.15); tone('triangle', [[0, 1480], [0.18, 1480]], 0.13, { at: 0.07 }); },
  dig() { noise(0.09, 400, 0.25); },
  pop() { if (play('pop' + (1 + ((Math.random() * 3) | 0)), 0.8)) return; tone('triangle', [[0, 300], [0.12, 700]], 0.2); noise(0.15, 1500, 0.12); },
  home() { tone('triangle', [[0, 880], [0.12, 880]], 0.14); tone('triangle', [[0, 1320], [0.2, 1320]], 0.12, { at: 0.08 }); },
  dusk() { [523, 392, 330].forEach((f, i) => tone('triangle', [[0, f], [0.5, f]], 0.16, { at: i * 0.28 })); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', [[0, f], [0.22, f]], 0.16, { at: i * 0.13 })); },
  lose() { [392, 330, 262].forEach((f, i) => tone('triangle', [[0, f], [0.35, f]], 0.16, { at: i * 0.25 })); },
};
