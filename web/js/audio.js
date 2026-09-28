// Web Audio sound system: preloaded buffers, per-category buses, room reverb send,
// a game-time scheduler (so vocal delays stay tied to the fight timeline, incl. hit-stop),
// one voice per guy with priorities, no immediate repeats, mute/volume persisted.
import { asset } from '@bb/config';

const LS_KEY = 'bb3d.audio';
const BUS = { impact: 0.8, voice: 1.0, rus: 0.9, step: 0.42, amb: 0.55, music: 0.2 };
const PRIO = { v_scream: 5, v_flinch: 4, v_groan: 3, v_tap: 3, v_whimper: 2, v_floor: 1 };
const rnd = (a, b) => a + Math.random() * (b - a);

export class GameAudio {
  constructor(now) {
    this.now = now;                 // () => game real time, seconds (hit-stop / slow-mo do not stretch it)
    this.ctx = null; this.bufs = new Map(); this.cats = {}; this.dur = {}; this.last = {};
    this.pending = []; this.voices = new Map(); this.moaners = new Map(); this.rusLine = null;
    this.log = null; this.loaded = false; this.ids = 0; this.busLv = { ...BUS }; this.onChange = null;
    let s = {}; try { s = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (_) {}
    this.vol = typeof s.vol === 'number' ? Math.min(1, Math.max(0, s.vol)) : 0.8;
    this.muted = !!s.muted;
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {}); else this.ctx.resume().catch(() => {});
    });
  }

  // ------------------------------------------------------------ loading (no AudioContext yet → no autoplay warning)
  async preload(progress) {
    progress && progress.add('audio', 1.2);
    const man = await fetch(asset('audio/audio.json')).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!man) { console.warn('[bb] audio manifest missing – sound off'); progress && progress.set('audio', 1); return; }
    this.cats = man.cats; this.dur = man.dur;
    const probe = document.createElement('audio');
    const ogg = probe.canPlayType && probe.canPlayType('audio/ogg; codecs="vorbis"') !== '';
    this.ext = ogg ? 'ogg' : 'm4a';
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Off) { progress && progress.set('audio', 1); return; }
    const dec = new Off(1, 1, 44100);
    const decode = (ab) => new Promise((res, rej) => { const p = dec.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
    const names = Object.values(man.cats).flat();
    let done = 0;
    await Promise.all(names.map(async (n) => {
      for (const ext of [this.ext, this.ext === 'ogg' ? 'm4a' : 'ogg']) {
        try {
          const r = await fetch(asset(`audio/${n}.${ext}`)); if (!r.ok) continue;
          this.bufs.set(n, await decode(await r.arrayBuffer())); break;
        } catch (_) { /* try the other container */ }
      }
      progress && progress.set('audio', ++done / names.length);
    }));
    this.loaded = true;
    if (this.ctx) this.startAmbience();
  }

  // ------------------------------------------------------------ unlock on first gesture
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.vol;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    // small gym room: synthetic stereo IR (≈1.1 s, darkened)
    const len = Math.floor(ctx.sampleRate * 1.1), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c); let lp = 0;
      for (let i = 0; i < len; i++) { const t = i / ctx.sampleRate; lp += (Math.random() * 2 - 1 - lp) * (0.55 - 0.35 * t); d[i] = lp * Math.exp(-t * 6.2) * (t < 0.012 ? t / 0.012 : 1); }
    }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    const vg = ctx.createGain(); vg.gain.value = 0.55; this.verb.connect(vg); vg.connect(this.master);
    this.bus = {};
    for (const [k, v] of Object.entries(this.busLv)) { const g = ctx.createGain(); g.gain.value = v; g.connect(this.master); this.bus[k] = g; }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (this.loaded) this.startAmbience();
  }

  startAmbience() {
    if (this.ambOn) return; this.ambOn = true;
    this.play('amb_room', { bus: 'amb', loop: true, send: 0 });
    this.play('amb_music', { bus: 'music', loop: true, send: 0.05 });
  }

  // ------------------------------------------------------------ settings
  setMuted(m) { this.muted = !!m; this._applyMaster(); this._save(); }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }
  setVolume(v) { this.vol = Math.min(1, Math.max(0, v)); if (this.vol > 0 && this.muted) this.muted = false; this._applyMaster(); this._save(); }
  _applyMaster() {
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol, this.ctx.currentTime, 0.03);
    this.onChange && this.onChange(this);
  }
  _save() { try { localStorage.setItem(LS_KEY, JSON.stringify({ vol: this.vol, muted: this.muted })); } catch (_) {} }
  setBus(name, level, ramp = 0.4) {
    if (Math.abs((this.busLv[name] ?? 0) - level) < 1e-3) return;
    this.busLv[name] = level;
    if (this.log) this.log.push({ t: this.now(), bus: name, level, ramp });
    if (this.bus) this.bus[name].gain.setTargetAtTime(level, this.ctx.currentTime, ramp / 3);
  }

  // ------------------------------------------------------------ playback
  pick(cat) {
    const list = this.cats[cat]; if (!list) return cat;            // exact file name
    if (list.length === 1) return list[0];
    const hist = this.last[cat] || [];
    const avoid = list.length >= 4 ? hist.slice(-2) : hist.slice(-1);
    const pool = list.filter((n) => !avoid.includes(n));
    const n = pool[Math.floor(Math.random() * pool.length)];
    this.last[cat] = [...hist, n].slice(-3);
    return n;
  }

  // opts: gain, rate, bus, send (reverb), delay (game-time s), pan, loop
  play(cat, o = {}) {
    const name = this.pick(cat);
    const rate = o.rate || 1;
    const h = { id: ++this.ids, name, cat, bus: o.bus || 'impact', gain: o.gain ?? 1, rate, send: o.send ?? 0.1, pan: o.pan || 0, loop: !!o.loop,
      at: this.now() + (o.delay || 0), dur: (this.dur[name] || 0.5) / rate, started: false, stopped: false };
    h.end = h.at + h.dur;
    if (o.delay > 0) this.pending.push(h); else this._start(h);
    return h;
  }

  _start(h) {
    h.started = true; h.at = this.now(); h.end = h.at + h.dur;
    if (this.log) this.log.push({ t: h.at, id: h.id, name: h.name, bus: h.bus, gain: h.gain, rate: h.rate, send: h.send, pan: h.pan, loop: h.loop });
    const buf = this.bufs.get(h.name);
    if (!this.ctx || !buf) return;
    const ctx = this.ctx, src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; src.playbackRate.value = h.rate; src.loop = h.loop; g.gain.value = h.gain;
    src.connect(g);
    let out = g;
    if (h.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = h.pan; g.connect(p); out = p; }
    out.connect(this.bus[h.bus] || this.master);
    if (h.send > 0) { const s = ctx.createGain(); s.gain.value = h.send; g.connect(s); s.connect(this.verb); }
    src.start();
    h.src = src; h.g = g;
    src.onended = () => { h.src = null; };
  }

  stop(h, fade = 0.08) {
    if (!h || h.stopped) return;
    h.stopped = true; h.end = Math.min(h.end, this.now() + fade);
    const i = this.pending.indexOf(h); if (i >= 0) { this.pending.splice(i, 1); return; }
    if (this.log) this.log.push({ t: this.now(), stop: h.id, fade });
    if (h.src && this.ctx) {
      const t = this.ctx.currentTime;
      h.g.gain.cancelScheduledValues(t); h.g.gain.setValueAtTime(h.g.gain.value, t); h.g.gain.linearRampToValueAtTime(0, t + fade);
      try { h.src.stop(t + fade + 0.02); } catch (_) {}
    }
  }

  update() {
    const now = this.now();
    if (this.pending.length) {
      this.pending.sort((a, b) => a.at - b.at);
      while (this.pending.length && this.pending[0].at <= now) this._start(this.pending.shift());
    }
    for (const [key, m] of this.moaners) {
      if (now < m.next) continue;
      if (m.n >= m.max) { this.moaners.delete(key); continue; }
      const cur = this.voices.get(key);
      if (cur && !cur.stopped && now < cur.end) { m.next = cur.end + 0.4; continue; }
      const h = this.voice(key, 'v_floor', { gain: m.gain * Math.pow(0.82, m.n), rate: m.rate * rnd(0.97, 1.03) });
      m.n++; m.next = now + (h ? h.dur : 1) + rnd(1.6, 3.2);
    }
  }

  // ------------------------------------------------------------ game-level helpers
  // one voice per guy; higher priority cuts, lower waits for a short remainder, else dropped
  voice(key, cat, o = {}) {
    const now = this.now(), pr = PRIO[cat] || 1;
    const cur = this.voices.get(key);
    const at = now + (o.delay || 0);
    if (cur && !cur.stopped && cur.end > at) {
      const rem = cur.end - at;
      if (pr >= (cur.prio || 0) || rem < 0.25) this.stop(cur, 0.09);
      else if (rem < 1.2) o = { ...o, delay: (o.delay || 0) + rem - 0.06 };
      else return null;
    }
    const h = this.play(cat, { bus: 'voice', send: 0.16, ...o });
    h.prio = pr; this.voices.set(key, h);
    return h;
  }
  moan(key, { gain = 0.8, rate = 1, first = 2.5, max = 4 } = {}) { this.moaners.set(key, { next: this.now() + first, n: 0, max, gain, rate }); }
  stopMoan(key) { this.moaners.delete(key); }

  impact(kind, { perfect = false } = {}) {
    const r = () => rnd(0.92, 1.08);
    if (perfect) {   // «Идеально»: heavier layer on top of the normal hit
      this.play('imp_fin_punch', { gain: 0.55, rate: 1.02 * r(), send: 0.25 });
      this.play('imp_fin_slap', { gain: 0.35, rate: 1.05, send: 0.2 });
    }
    if (kind === 'thigh') {
      this.play('imp_thigh', { gain: 0.8, rate: r(), send: 0.08 });
      this.play('imp_soft', { gain: 0.25, rate: 1.15 * r(), send: 0.04 });
      return;
    }
    const fin = kind === 'fin', knee = kind === 'knee', k = fin ? 0.88 : 1;
    this.play('imp_body', { gain: 0.9, rate: k * r(), send: fin ? 0.3 : 0.12 });
    this.play('imp_punch', { gain: knee ? 0.6 : 0.45, rate: k * r(), send: 0.1 });
    this.play('imp_sub', { gain: knee ? 0.85 : 0.7, rate: r(), send: 0 });
    this.play('imp_slap', { gain: knee ? 0.28 : 0.5, rate: r(), send: 0.06 });
    this.play('imp_soft', { gain: 0.3, rate: r(), send: 0.05 });
    if (fin) {
      this.play('imp_fin_punch', { gain: 0.8, rate: 0.9, send: 0.35 });
      this.play('imp_fin_slap', { gain: 0.55, rate: 0.94, send: 0.3 });
      this.play('imp_fin_boom', { gain: 0.9, send: 0.25 });
    }
  }

  footstep(surface, gain = 1) {
    this.play(surface === 'mat' ? 'step_mat' : 'step_floor', { bus: 'step', gain: gain * rnd(0.8, 1), rate: rnd(0.9, 1.1), send: 0.05 });
  }

  // Rusana: never talks over herself
  rus(cat, o = {}) {
    const now = this.now();
    if (this.rusLine && !this.rusLine.stopped && this.rusLine.end > now + (o.delay || 0)) return null;
    return (this.rusLine = this.play(cat, { bus: 'rus', send: 0.12, ...o }));
  }
}
