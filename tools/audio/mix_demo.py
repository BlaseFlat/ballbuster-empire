#!/usr/bin/env python3
"""Offline re-creation of the in-game Web Audio mix from a logged sound timeline (window.__bb.audio.log),
used for the frame-stepped demo capture.  Mirrors js/audio.js: bus gains (+ setTargetAtTime ramps),
per-voice gain/rate/stop-fades, reverb send taken pre-bus, master volume, DynamicsCompressor-ish.
usage: mix_demo.py audio_log.json masters_dir out.wav [master_vol]"""
import json, sys, os, numpy as np, soundfile as sf
from scipy.signal import fftconvolve
log, masters, out = sys.argv[1:4]; VOL = float(sys.argv[4]) if len(sys.argv) > 4 else 0.8
SR = 44100
BUS = {'impact': 0.8, 'voice': 1.0, 'rus': 0.9, 'step': 0.42, 'amb': 0.55, 'music': 0.2}
d = json.load(open(log)); t0 = d['t0']; dur = d['frames'] / d['fps']; N = int(dur * SR) + 1
ev = d['events']
stops = {e['stop']: e for e in ev if 'stop' in e}
dry = {b: np.zeros(N) for b in BUS}; send = np.zeros(N)
cache = {}
def load(n):
    if n not in cache:
        x, sr = sf.read(os.path.join(masters, n + '.wav')); assert sr == SR
        cache[n] = x if x.ndim == 1 else x.mean(1)
    return cache[n]
for e in ev:
    if 'name' not in e: continue
    x = load(e['name']); r = e.get('rate', 1)
    if abs(r - 1) > 1e-4: x = np.interp(np.arange(0, len(x) - 1, r), np.arange(len(x)), x)
    s = int(round((e['t'] - t0) * SR))
    if e.get('loop'):
        reps = int(np.ceil((N - s) / len(x))) + 1; x = np.tile(x, reps)
    x = x * e.get('gain', 1)
    st = stops.get(e['id'])
    if st:
        a = int(round((st['t'] - e['t']) * SR)); f = max(1, int(st['fade'] * SR))
        if a < len(x): env = np.ones(len(x)); env[a:a + f] = np.linspace(1, 0, len(env[a:a + f])); env[a + f:] = 0; x = x * env
    a0 = max(0, s); b0 = min(N, s + len(x))
    if b0 <= a0: continue
    seg = x[a0 - s:b0 - s]
    dry[e['bus']][a0:b0] += seg
    send[a0:b0] += seg * e.get('send', 0)
# bus gain curves
mix = np.zeros(N)
for b in BUS:
    g = np.full(N, BUS[b]); lvl = BUS[b]
    for e in [e for e in ev if e.get('bus') == b and 'level' in e and 'name' not in e]:
        i = max(0, int((e['t'] - t0) * SR)); tau = max(1e-3, e['ramp'] / 3)
        if i >= N: continue
        cur = g[i]; tt = np.arange(N - i) / SR
        g[i:] = e['level'] + (cur - e['level']) * np.exp(-tt / tau)
    mix += dry[b] * g
# reverb (same recipe as js/audio.js: 1.1 s darkened stereo noise IR, return gain 0.55)
rng = np.random.default_rng(3); L = int(SR * 1.1); t = np.arange(L) / SR
def ir():
    w = rng.uniform(-1, 1, L); y = np.zeros(L); lp = 0.0
    k = 0.55 - 0.35 * t
    for i in range(L): lp += (w[i] - lp) * k[i]; y[i] = lp
    return y * np.exp(-t * 6.2) * np.minimum(1, t / 0.012)
irs = [ir(), ir()]
wet = [fftconvolve(send, h)[:N] * 0.55 for h in irs]
st = np.stack([mix + wet[0], mix + wet[1]], 1) * VOL
# compressor: threshold −12 dB, ratio 3.5, knee 10, attack 3 ms, release 200 ms
lvl = np.max(np.abs(st), 1); env = np.zeros(N); e = 0.0
aa, ar = np.exp(-1 / (0.003 * SR)), np.exp(-1 / (0.2 * SR))
for i in range(N):
    v = lvl[i]; c = aa if v > e else ar; e = c * e + (1 - c) * v; env[i] = e
ldb = 20 * np.log10(env + 1e-9); T, R, K = -12, 3.5, 10
over = ldb - T
gr = np.where(over <= -K / 2, 0, np.where(over >= K / 2, over * (1 - 1 / R), (1 - 1 / R) * (over + K / 2) ** 2 / (2 * K)))
st *= (10 ** (-gr / 20))[:, None]
pk = np.max(np.abs(st))
if pk > 10 ** (-1 / 20): st *= 10 ** (-1 / 20) / pk      # safety only; otherwise what the browser outputs
print(f'duration {dur:.2f}s  events {sum(1 for e in ev if "name" in e)}  pre-norm peak {20*np.log10(pk):.1f} dB  rms {20*np.log10(np.sqrt(np.mean(st**2))):.1f} dBFS')
sf.write(out, st.astype(np.float32), SR, subtype='FLOAT')
