#!/usr/bin/env python3
"""Build the game's audio set (assets/audio/*.ogg + *.m4a + audio.json).

Sources (all CC0 / own synthesis / TTS — see CREDITS.md):
  * Freesound CC0 HQ previews, cached in SRC/fs/<id>.mp3 (decoded to SRC/wav/<id>.wav)
  * Kenney "Impact Sounds" (CC0) in SRC/kenney/Audio
  * Rusana TTS lines (edge-tts ru-RU-SvetlanaNeural) in SRC/tts/*.mp3
  * procedural: sub thumps, finisher boom, room tone, distant music (numpy, this script)
"""
import json, os, subprocess, sys, numpy as np, soundfile as sf

SRC = os.environ.get('BB_AUDIO_SRC', '/workspace/tmp_inspect/snd')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'audio')
OUT = os.path.abspath(OUT); os.makedirs(OUT, exist_ok=True)
TMP = os.path.join(SRC, 'build'); os.makedirs(TMP, exist_ok=True)
SR = 44100
rng = np.random.default_rng(7)

def load(path):
    x, sr = sf.read(path, always_2d=True); x = x.mean(1)
    if sr != SR: raise SystemExit(f'{path}: {sr}')
    return x

def ff(x, chain):
    """run a mono float signal through an ffmpeg filter chain"""
    a, b = os.path.join(TMP, '_in.wav'), os.path.join(TMP, '_out.wav')
    sf.write(a, x, SR, subtype='FLOAT')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', a, '-af', chain, '-ar', str(SR), '-ac', '1', b], check=True)
    return load(b)

def db(v): return 20 * np.log10(max(v, 1e-12))
def active_rms(x):
    h = 441; fr = np.array([np.sqrt(np.mean(x[i:i + h] ** 2)) for i in range(0, max(1, len(x) - h), h)])
    if not len(fr): return np.sqrt(np.mean(x ** 2))
    thr = fr.max() * 0.1
    return np.sqrt(np.mean(fr[fr >= thr] ** 2))

def norm(x, rms_db=None, peak_db=-1.0):
    x = x - np.mean(x)
    if rms_db is not None: x = x * (10 ** (rms_db / 20) / (active_rms(x) + 1e-12))
    pk = np.max(np.abs(x)) + 1e-12; lim = 10 ** (peak_db / 20)
    if pk > lim:   # soft-knee limit instead of hard scaling everything down
        x = np.tanh(x / lim * 0.9) * lim / np.tanh(0.9) if pk < lim * 2.2 else x * lim / pk
    return x

def fades(x, fin=0.01, fout=None):
    n = len(x); fi = int(fin * SR)
    fo = int((fout if fout is not None else min(0.25, max(0.06, 0.25 * n / SR))) * SR)
    x = x.copy()
    if fi: x[:fi] *= np.linspace(0, 1, fi) ** 2
    if fo: x[-fo:] *= np.linspace(1, 0, fo) ** 1.5
    return x

def seg(sid, t0, t1, pad=0.02):
    x = load(os.path.join(SRC, 'wav', f'{sid}.wav'))
    a = max(0, int((t0 - pad) * SR)); b = min(len(x), int((t1 + pad) * SR))
    return x[a:b]

manifest = {'cats': {}, 'dur': {}}
sizes = 0
def emit(cat, name, x, loop=False):
    global sizes
    wav = os.path.join(TMP, name + '.wav'); sf.write(wav, x.astype(np.float32), SR, subtype='FLOAT')
    q = '3' if loop else '2'
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-c:a', 'libvorbis', '-q:a', q, os.path.join(OUT, name + '.ogg')], check=True)
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-c:a', 'aac', '-b:a', '64k' if not loop else '80k', '-movflags', '+faststart', os.path.join(OUT, name + '.m4a')], check=True)
    manifest['cats'].setdefault(cat, []).append(name)
    manifest['dur'][name] = round(len(x) / SR, 3)
    sizes += os.path.getsize(os.path.join(OUT, name + '.ogg')) + os.path.getsize(os.path.join(OUT, name + '.m4a'))

VOX_CHAIN = 'highpass=f=75,afftdn=nr=12:nf=-50,equalizer=f=3000:t=q:w=1.2:g=1.5'
# ---------------------------------------------------------------- guy vocals (Freesound CC0, real men)
VOX = {
    'v_flinch':  (-15, [('344407', .13, .50), ('344416', .17, .62), ('344415', .07, .55), ('464677', .04, .58),
                        ('464679', .04, .60), ('464685', .09, .50), ('257709', .20, .75), ('800984', .0, .30)]),
    'v_groan':   (-17, [('171758', .35, 2.3), ('464684', .08, 1.72), ('464676', .04, .98), ('675807', .30, 1.6),
                        ('257706', 1.15, 3.1), ('869084', 1.15, 1.85), ('869084', 3.65, 4.45)]),
    'v_whimper': (-19, [('867172', 1.50, 2.85), ('867172', 3.55, 5.45), ('867172', 6.10, 7.50), ('344680', .60, 1.60),
                        ('344680', 2.15, 3.35), ('103072', .9, 1.95)]),
    'v_scream':  (-13, [('221544', .33, 1.6), ('401210', .40, 2.3), ('564253', 3.55, 4.6), ('564253', .80, 1.95),
                        ('416546', 1.15, 1.85)]),
    'v_floor':   (-20, [('867174', .9, 2.2), ('867172', 8.9, 11.7), ('344682', 4.65, 7.0), ('481763', 4.7, 7.1),
                        ('675807', 6.9, 8.7)]),
    'v_tap':     (-19, [('318077', .38, .95), ('344680', 5.95, 6.45), ('344680', 8.95, 9.5), ('803168', 13.3, 14.1),
                        ('803168', 5.55, 6.15)]),
}
credits_used = {}
for cat, (target, lst) in VOX.items():
    for i, (sid, t0, t1) in enumerate(lst, 1):
        x = ff(seg(sid, t0, t1), VOX_CHAIN)
        x = fades(norm(x, target, -1.5))
        emit(cat, f'{cat}_{i}', x); credits_used.setdefault(sid, []).append(f'{cat}_{i}')

# ---------------------------------------------------------------- impacts
K = os.path.join(SRC, 'kenney', 'Audio')
def kload(n): return load_any(os.path.join(K, n + '.ogg'))
def load_any(p):
    w = os.path.join(TMP, '_any.wav'); subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', p, '-ac', '1', '-ar', str(SR), w], check=True)
    return load(w)
def trim_sil(x, thr_db=-50, pre=0.004):
    idx = np.where(np.abs(x) > 10 ** (thr_db / 20))[0]
    if not len(idx): return x
    a = max(0, idx[0] - int(pre * SR)); b = idx[-1] + int(0.02 * SR)
    return x[a:b]

# body thud (Freesound 586841 "Power Kick, Body Impact" by Kinoton)
for i, t in enumerate([0.55, 2.56, 4.57, 6.57, 8.54], 1):
    x = ff(seg('586841', t - 0.02, t + 0.55, 0), 'highpass=f=35')
    x = trim_sil(x, -45); emit('imp_body', f'imp_body_{i}', fades(norm(x, None, -1), 0.002, 0.12)); credits_used.setdefault('586841', []).append(f'imp_body_{i}')
# punch layer (Kenney impactPunch_heavy)
for i in range(5):
    x = trim_sil(kload(f'impactPunch_heavy_00{i}'), -50); emit('imp_punch', f'imp_punch_{i+1}', fades(norm(x, None, -1), 0.001, 0.1))
# soft layer (Kenney impactSoft_heavy) – dull body
for i in range(3):
    x = trim_sil(kload(f'impactSoft_heavy_00{i}'), -50); emit('imp_soft', f'imp_soft_{i+1}', fades(norm(x, None, -1), 0.001, 0.1))
# flesh slap (Freesound 346931 "Slap on Skin" by dav0r)
for i, t in enumerate([4.65, 7.95, 13.65], 1):
    x = ff(seg('346931', t - 0.01, t + 0.33, 0), 'highpass=f=120')
    x = trim_sil(x, -45); emit('imp_slap', f'imp_slap_{i}', fades(norm(x, None, -1), 0.001, 0.1)); credits_used.setdefault('346931', []).append(f'imp_slap_{i}')
# finisher layers: 399183 "Major punch" + 564230 "Huge Slap in the Face"
x = trim_sil(ff(seg('399183', 0.05, 0.9, 0), 'highpass=f=35'), -48); emit('imp_fin', 'imp_fin_punch', fades(norm(x, None, -1), 0.001, 0.2)); credits_used.setdefault('399183', []).append('imp_fin_punch')
x = trim_sil(ff(seg('564230', 0.40, 1.1, 0), 'highpass=f=60'), -48); emit('imp_fin', 'imp_fin_slap', fades(norm(x, None, -1), 0.001, 0.2)); credits_used.setdefault('564230', []).append('imp_fin_slap')
# thigh (miss): Freesound 860386/860387 thigh slap one-shots + 636490 + Kenney impactSoft_medium
for i, (sid, t0, t1) in enumerate([('860386', 0, .21), ('860387', 0, .115), ('636490', 5.97, 6.3), ('636490', 1.47, 1.8)], 1):
    x = trim_sil(ff(seg(sid, t0, t1, 0), 'highpass=f=90'), -48)
    emit('imp_thigh', f'imp_thigh_{i}', fades(norm(x, None, -1), 0.001, 0.05)); credits_used.setdefault(sid, []).append(f'imp_thigh_{i}')

# procedural sub thumps + finisher boom (own synthesis)
def thump(f0, f1, dur, decay):
    t = np.arange(int(dur * SR)) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    env = (1 - np.exp(-t / 0.0015)) * np.exp(-t / decay)
    click = rng.standard_normal(len(t)) * np.exp(-t / 0.004) * 0.25
    return np.sin(ph) * env + click
for i, (a, b, d) in enumerate([(110, 44, 0.11), (95, 40, 0.13), (125, 50, 0.10)], 1):
    x = ff(thump(a, b, 0.45, d), 'lowpass=f=900'); emit('imp_sub', f'imp_sub_{i}', fades(norm(x, None, -1), 0.0005, 0.08))
t = np.arange(int(1.9 * SR)) / SR
f = 26 + 70 * np.exp(-t / 0.12); boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * (1 - np.exp(-t / 0.002)) * np.exp(-t / 0.45)
noise = rng.standard_normal(len(t)) * np.exp(-t / 0.35) * 0.35
noise = ff(noise, 'lowpass=f=420,lowpass=f=420')
x = norm(boom + noise * 1.6, None, -1); emit('imp_fin', 'imp_fin_boom', fades(x, 0.0005, 0.5))

# ---------------------------------------------------------------- footsteps (Kenney CC0)
for i in range(5):
    x = trim_sil(kload(f'footstep_carpet_00{i}'), -55); emit('step_mat', f'step_mat_{i+1}', fades(norm(ff(x, 'lowpass=f=5000'), None, -3), 0.001, 0.04))
for i in range(5):
    x = trim_sil(kload(f'footstep_concrete_00{i}'), -55); emit('step_floor', f'step_floor_{i+1}', fades(norm(ff(x, 'lowpass=f=3200,equalizer=f=180:t=q:w=1:g=3'), None, -3), 0.001, 0.04))

# ---------------------------------------------------------------- Rusana TTS lines
TTS = os.path.join(SRC, 'tts')
for fn in sorted(os.listdir(TTS)):
    if not fn.endswith('.mp3') or fn.startswith('test'): continue
    name = fn[:-4]; cat = 'rus_' + name.split('_')[0]
    x = load_any(os.path.join(TTS, fn))
    x = ff(x, 'highpass=f=95,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=4200:t=q:w=1.5:g=1.5,acompressor=threshold=0.1:ratio=3:attack=5:release=80')
    x = trim_sil(x, -46, 0.01)
    emit(cat, f'rus_{name}', fades(norm(x, -17, -1.5), 0.008, 0.08))

# ---------------------------------------------------------------- ambience (procedural, seamless loops)
def circ_reverb(x, rt=1.2, wet=0.35):
    n = len(x); t = np.arange(int(rt * SR)) / SR
    ir = rng.standard_normal(len(t)) * np.exp(-t * 6.9 / rt); ir[0] = 0
    ir = ir / np.sqrt(np.sum(ir ** 2))
    h = np.zeros(n); h[:len(ir)] = ir
    y = np.real(np.fft.ifft(np.fft.fft(x) * np.fft.fft(h)))
    return x * (1 - wet) + y * wet
def seamless(x, xf=1.0):
    k = int(xf * SR); head, tail = x[:k], x[-k:]
    w = np.linspace(0, 1, k)
    y = x[:-k].copy(); y[:k] = head * w + tail * (1 - w)
    return y
L = 12.0; n = int((L + 1.0) * SR)
brown = np.cumsum(rng.standard_normal(n)); brown -= np.convolve(brown, np.ones(4410) / 4410, 'same'); brown /= np.max(np.abs(brown))
vent = ff(rng.standard_normal(n), 'bandpass=f=420:width_type=q:w=0.7,lowpass=f=1400')
tt = np.arange(n) / SR
vent *= 0.75 + 0.25 * np.sin(2 * np.pi * tt / 6.5)             # slow air-flow swell (period divides loop)
hum = 0.5 * np.sin(2 * np.pi * 50 * tt) + 0.25 * np.sin(2 * np.pi * 100 * tt) + 0.12 * np.sin(2 * np.pi * 150 * tt + 1)
hiss = ff(rng.standard_normal(n), 'highpass=f=3500') * 0.05
room = ff(brown, 'lowpass=f=300') * 0.9 + vent * 0.8 + hum * 0.06 + hiss
room = seamless(room / np.max(np.abs(room)), 1.0)
emit('amb_room', 'amb_room', norm(room, -26, -6), loop=True)

# distant music: 4 bars @ 124 bpm heard through a wall (muffled, band-limited, reverberant)
bpm = 124; beat = 60 / bpm; bars = 4; N = int(bars * 4 * beat * SR)
mus = np.zeros(N); tb = np.arange(int(0.5 * SR)) / SR
kick = np.sin(2 * np.pi * np.cumsum(45 + 90 * np.exp(-tb / 0.03)) / SR) * np.exp(-tb / 0.16)
clap = ff(rng.standard_normal(len(tb)), 'bandpass=f=1500:width_type=q:w=1') * np.exp(-tb / 0.06) * 0.5
bassnotes = [41.2, 41.2, 49.0, 36.7]      # E1 E1 G1 D1 per bar
for b in range(bars * 4):
    s = int(b * beat * SR); e = min(N, s + len(tb)); mus[s:e] += kick[:e - s]
    if b % 2 == 1: mus[s:e] += clap[:e - s]
    # off-beat bass
    so = int((b + 0.5) * beat * SR); ln = int(0.45 * beat * SR); tn = np.arange(ln) / SR
    f = bassnotes[(b // 4) % 4]
    saw = 2 * ((tn * f * 2) % 1) - 1
    seg_ = saw * np.exp(-tn / 0.12) * 0.45
    e2 = min(N, so + ln); mus[so:e2] += seg_[:e2 - so]
mus = ff(mus, 'highpass=f=70,lowpass=f=650,lowpass=f=900')
mus = circ_reverb(mus, 1.4, 0.45)
emit('amb_music', 'amb_music', norm(mus, -22, -4), loop=True)

manifest['v'] = 1
manifest['credits_used'] = credits_used
json.dump(manifest, open(os.path.join(OUT, 'audio.json'), 'w'), indent=1)
print('files:', sum(len(v) for v in manifest['cats'].values()), 'total bytes (ogg+m4a):', sizes)
for c, v in manifest['cats'].items(): print(f'  {c}: {len(v)}')
