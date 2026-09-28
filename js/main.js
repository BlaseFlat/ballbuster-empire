import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CFG, GUYS, STATE_RU, DEBUG, V, COMBAT, TRAITS } from '@bb/config';
import { Progress, loadGLB, loadTex, loadHDR, loadJSON } from '@bb/loader';
import { buildGym, collide } from '@bb/gym';
import { Character } from '@bb/character';
import { FX } from '@bb/fx';
import { Bout, GUY_STATES } from '@bb/rules';
import { gradeStrike, Pain, GRADE_RU } from '@bb/combat';
import { Brain } from '@bb/ai';
import { GameAudio } from '@bb/audio';

const $ = (s) => document.querySelector(s);
const log = (...a) => console.log('[bb]', ...a);
const TAU = Math.PI * 2;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const angDamp = (a, b, k, dt) => { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * (1 - Math.exp(-k * dt)); };

// ---------------------------------------------------------------- renderer
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;
const maxDPR = Math.min(window.devicePixelRatio || 1, 1.75);
let dpr = Math.min(maxDPR, 1.5);
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0a0d);
scene.fog = new THREE.Fog(0x16110f, 16, 42);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 80);
camera.position.set(0, 2, 8);

const rt = new THREE.WebGLRenderTarget(innerWidth * dpr, innerHeight * dpr, { type: THREE.HalfFloatType, samples: renderer.capabilities.isWebGL2 ? 4 : 0 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(dpr);
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.32, 0.55, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setPixelRatio(dpr); composer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);

// ---------------------------------------------------------------- UI helpers
const UI = {
  show(id, on = true) { const el = $(id); if (el) el.classList.toggle('active', on); },
  text(id, t) { const el = $(id); if (el) el.textContent = t; },
};

// ---------------------------------------------------------------- loading
const progress = new Progress((f) => {
  $('#load-fill').style.width = (f * 100).toFixed(1) + '%';
  $('#load-text').textContent = `Загрузка… ${Math.round(f * 100)}%`;
});

const TEXSETS = { rubber: 'rubber_tiles', brick: 'red_brick', leather: 'leather_red_02', concrete: 'concrete_floor_painted', wood: 'wood_floor', plaster: 'painted_plaster_wall' };

async function loadAll() {
  const tex = {};
  const texJobs = Object.entries(TEXSETS).map(async ([k, n]) => {
    const [diff, nor, arm] = await Promise.all([
      loadTex(`tex/${n}_diff_1k.jpg`, progress, { srgb: true }),
      loadTex(`tex/${n}_nor_gl_1k.jpg`, progress),
      loadTex(`tex/${n}_arm_1k.jpg`, progress),
    ]);
    tex[k] = { diff, nor, arm };
  });
  const manifest = await loadJSON('models/manifest.json');
  const [hdr, rus, guy, contact, meta] = await Promise.all([
    loadHDR('hdri/gym_01_1k.hdr', progress),
    loadGLB('models/rusana.glb', progress, 'rusana', 4),
    loadGLB('models/guy.glb', progress, 'guy', 4),
    (!manifest || manifest.contact) ? loadJSON('models/CONTACT.json') : Promise.resolve(null),
    (!manifest || manifest.meta) ? loadJSON('models/anim_meta.json') : Promise.resolve(null),
    document.fonts ? document.fonts.load('40px "Russo One"').catch(() => 0) : 0,
    G.audio.preload(progress).catch((e) => console.warn('[bb] audio preload failed', e)),
    ...texJobs,
  ]);
  return { tex, hdr, rus, guy, contact, meta, manifest };
}

function placeholderGLTF(color, h) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, h - 0.4, 6, 16), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  m.position.y = h / 2; g.add(m);
  return { scene: g, animations: [] };
}

// ---------------------------------------------------------------- game state
const G = {
  mode: 'loading', rep: 0, time: 0, timeScale: 1, hitStopUntil: 0, slowUntil: 0, slowScale: 1,
  keys: {}, rus: null, guys: [], gym: null, fx: null, near: null, contact: null,
  gt: 0,            // game clock (scaled by hit-stop / slow-mo) for AI, pain and combat timing
  act: null,        // Rusana's current action: dash / strike / stagger (null = free to walk)
  buffer: null,     // buffered strike press {move, until}
  presses: [],      // recent strike presses (spam detection)
  engaged: null, engagedUntil: 0, duel: null, lastContact: null,
  cam: { yaw: 0, pitch: 0.28, dist: 3.4, side: 1, eng: 0, engGuy: null, lastDrag: -99, pos: new THREE.Vector3(), look: new THREE.Vector3() },
  vel: new THREE.Vector3(), assetsInfo: {},
};
window.__bb = G;
G.realTime = 0;
G.audio = new GameAudio(() => G.realTime);

// guy reaction sequence from CONTACT.json: strings or {clip|name, at|t|start_s|time_s} (seconds after contact)
function parseSeq(seq) {
  const dflt = [0.06, 0.25, 0.5, 0.9];
  return seq.map((x, i) => {
    if (typeof x === 'string') return { name: x, at: dflt[Math.min(i, 3)] };
    const name = x.clip || x.name || x.anim;
    const at = x.start_rel_contact_s ?? x.at ?? x.t ?? x.start_s ?? x.time_s ?? x.time ?? x.from_s ?? (Array.isArray(x.window_s) ? x.window_s[0] : undefined) ?? dflt[Math.min(i, 3)];
    return name ? { name, at, loop: x.loop, optional: !!x.optional } : null;
  }).filter(Boolean);
}

// idle-pose pelvis forward offsets (local), to convert pelvis-to-pelvis distances into root distances
const pelvisOffsets = { rus: 0, guy: 0 };
function measurePelvis(ch) {
  const a = ch.play(ch.idleName, { fade: 0 }); if (a) a.time = 0; ch.mixer.update(0); ch.group.updateMatrixWorld(true);
  const w = ch.boneWorld('pelvis', new THREE.Vector3()); const l = ch.group.worldToLocal(w.clone());
  return THREE.MathUtils.clamp(l.z, -0.2, 0.2);
}

function computeContact(contactJson, meta, rus) {
  const out = {};
  const guyM = meta && typeof meta.guy_m === 'number' ? Math.abs(meta.guy_m) : null;
  for (const move of ['kick', 'knee']) {
    const base = { ...CFG.contact[move] };
    let src = 'fallback';
    // meta: contact = first key frame where guy reacts ("flinch")
    const mc = meta && meta.clips && meta.clips[base.clip];
    if (mc && mc.keys) {
      const k = mc.keys.find((x) => x[1] === 'flinch');
      if (k) { base.time = k[0] / (meta.fps || 30); src = 'anim_meta'; }
      if (guyM) base.dist = guyM;
    }
    if (contactJson) {
      const cj = contactJson;
      const key2 = move === 'kick' ? 'kick_up' : 'knee';
      const e = cj[key2] || cj[base.clip] || cj[base.clip.replace(/^rus_/, '')] || cj[move] || (cj.clips && !Array.isArray(cj.clips[base.clip]) && cj.clips[base.clip]) || null;
      const pl = cj.placement || {};
      if (e && typeof e === 'object') {
        const fps = e.fps || cj.fps || 30;
        const t = e.contact_time_s ?? e.time ?? e.contact_time ?? e.t;
        const f = e.contact_frame ?? e.frame ?? (Array.isArray(e.frames) ? e.frames[0] : undefined);
        if (typeof t === 'number') base.time = t; else if (typeof f === 'number') base.time = f / fps;
        if (typeof e.rusana_crossfade_in_s === 'number') base.fadeIn = e.rusana_crossfade_in_s;
        const hs = e.hitstop_s ?? e.hit_stop_s ?? cj.hitstop_s ?? (cj.hit_stop && cj.hit_stop.duration_s);
        if (typeof hs === 'number') base.hitStop = hs;
        const seq = e.guy_sequence || e.guy_clips || e.guy_timeline || e.reaction_sequence || (Array.isArray(e.guy_reaction) ? e.guy_reaction : null);
        if (Array.isArray(seq)) { const all = parseSeq(seq); base.pre = all.filter((x) => x.at < 0); base.seq = all.filter((x) => x.at >= 0); }
        src = 'CONTACT.json';
      }
      const ep = (e && e.placement) || pl;
      // pelvis-to-pelvis distance (converted to root distance below) or root distance
      const pd = (e && (e.pelvis_distance_m ?? e.pelvis_to_pelvis_m)) ?? ep.pelvis_distance_m ?? ep.pelvis_to_pelvis_m;
      const d = (e && (e.distance_m ?? e.root_distance_m ?? e.distance ?? e.guy_distance)) ?? ep.distance_m ?? ep.distance;
      // prefer the root-to-root distance (what the engine sets); pelvis distance only if nothing else is given
      if (typeof d === 'number') { base.dist = Math.abs(d); base.pelvisRef = /pelvis/i.test(String(ep.distance_is || (e && e.distance_is) || '')); }
      else if (typeof pd === 'number') { base.dist = Math.abs(pd); base.pelvisRef = true; }
      if (cj.double_over_root_motion && typeof cj.double_over_root_motion.stagger_back_m === 'number') CFG.staggerBack = cj.double_over_root_motion.stagger_back_m;
      const lat = ep.lateral_offset_m ?? (e && e.lateral_offset_m);
      if (typeof lat === 'number') base.side = lat;
      else {
        const arr = e && (e.guy_offset || e.offset || e.guy_pos || e.relative);
        if (Array.isArray(arr) && arr.length >= 3) { base.dist = Math.abs(arr[2]); base.side = arr[0]; }
      }
      if (typeof d !== 'number' && typeof cj.guy_m === 'number') base.dist = Math.abs(cj.guy_m);
      if (cj.walk && typeof cj.walk.speed_mps_no_foot_slide === 'number') CFG.walkClipSpeed = cj.walk.speed_mps_no_foot_slide;
    }
    if (base.pelvisRef) base.dist += pelvisOffsets.rus + pelvisOffsets.guy;
    const dur = rus.clipDuration(base.clip);
    if (dur && base.time > dur) base.time = dur * 0.45;
    base.dist = THREE.MathUtils.clamp(base.dist, 0.25, 1.3);
    base.src = src;
    out[move] = base;
  }
  log('contact placement', out);
  return out;
}

// ---------------------------------------------------------------- init
let sun;
async function init() {
  const A = await loadAll();
  G.assetsInfo = { rusClips: A.rus ? A.rus.animations.map((c) => c.name) : [], guyClips: A.guy ? A.guy.animations.map((c) => c.name) : [], contact: !!A.contact, meta: !!A.meta, manifest: A.manifest };
  log('assets', G.assetsInfo, 'v', V);

  // environment
  const pmrem = new THREE.PMREMGenerator(renderer);
  if (A.hdr) { A.hdr.mapping = THREE.EquirectangularReflectionMapping; scene.environment = pmrem.fromEquirectangular(A.hdr).texture; A.hdr.dispose(); }
  else scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;
  pmrem.dispose();

  G.gym = buildGym(scene, A.tex, renderer);
  // sun through the windows
  sun = new THREE.DirectionalLight(0xffe9cf, 3.2);
  sun.position.copy(G.gym.sunDir).multiplyScalar(-26);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15; sc.near = 5; sc.far = 60;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x4a3326, 0.7));

  // characters
  const rusG = A.rus || placeholderGLTF(0x9b1c31, 1.6);
  const rus = new Character(rusG, { name: 'Русана', meta: A.meta, prefix: 'rus_', idle: 'rus_idle' });
  rus.group.position.set(0, 0, 4.6); rus.yaw = Math.PI; rus.group.rotation.y = rus.yaw;
  scene.add(rus.group);
  rus.play('rus_idle', { fade: 0 });
  rus.setExpr({ cold: 0.6 });
  G.rus = rus;
  const bb = new THREE.Box3().setFromObject(rus.group); log('Rusana bbox', bb.min.toArray().map((v) => v.toFixed(2)), bb.max.toArray().map((v) => v.toFixed(2)));

  const guyG = A.guy || placeholderGLTF(0x445566, 1.8);
  const guardWeights = (n) => /^(clavicle|upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)/.test(n) ? 1 : /^spine/.test(n) ? 0.45 : /^(neck|head)/.test(n) ? 0.3 : 0;
  for (const def of GUYS) {
    const c = new Character(guyG, { name: def.name, clone: true, meta: A.meta, prefix: 'guy_', idle: 'guy_idle' });
    c.tint('M_shirt', def.shirt);
    c.group.position.set(...def.pos); c.yaw = def.rot; c.group.rotation.y = def.rot;
    scene.add(c.group);
    const a = c.play('guy_idle', { fade: 0 });
    if (a) a.time = Math.random() * a.getClip().duration;
    c.setExpr({ smug: 0.6 });
    c.def = def; c.state = 'idle'; c.beaten = false; c.queue = []; c.timeline = [];
    c.trait = TRAITS[def.trait] || TRAITS.cocky;
    c.home = new THREE.Vector3(...def.pos);
    // guard = hands over the groin, sampled from the 'stun' clip and layered over idle / hurt
    c.defineLayer('guard', c.samplePose(c.has('stun') ? 'stun' : 'guy_hurt', 0.2, guardWeights), 7);
    c.pain = new Pain(c.trait.tough);
    c.bout = null;
    c.brain = new Brain(c, world);
    const lab = document.createElement('div'); lab.className = 'npc-label';
    lab.innerHTML = '<div class="nl-say"></div><div class="nl-name"></div><div class="nl-status"></div><div class="nl-pain"><i></i></div>';
    lab.querySelector('.nl-name').innerHTML = `${def.name}, ${def.age} <span class="nl-trait">· ${c.trait.ru}</span>`;
    $('#labels').appendChild(lab); c.label = lab;
    c.labelEls = { say: lab.querySelector('.nl-say'), status: lab.querySelector('.nl-status'), pain: lab.querySelector('.nl-pain i'), painBox: lab.querySelector('.nl-pain') };
    c.onPlay = (clip) => guyVoice(c, clip);
    G.guys.push(c);
  }
  const gb = new THREE.Box3().setFromObject(G.guys[0].group); log('Guy bbox', gb.min.toArray().map((v) => v.toFixed(2)), gb.max.toArray().map((v) => v.toFixed(2)));
  pelvisOffsets.rus = measurePelvis(rus); pelvisOffsets.guy = measurePelvis(G.guys[0]);
  G.contact = computeContact(A.contact, A.meta, rus);
  rus.queue = [];

  // blob shadows (contact grounding)
  const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, fog: false });
  for (const ch of [rus, ...G.guys]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobMat);
    b.rotation.x = -Math.PI / 2; b.renderOrder = 2; scene.add(b); ch.blob = b;
  }

  G.fx = new FX(scene, camera);

  // compile shaders up front (avoid hitches)
  renderer.compile(scene, camera);
  setTimeout(() => {
    UI.show('#loading', false); UI.show('#menu', true); G.mode = 'menu';
  }, 150);
}

// ---------------------------------------------------------------- sound UI (M / speaker icon), unlock on first gesture
const unlockAudio = () => G.audio.unlock();
for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, unlockAudio, { capture: true, passive: true });
function syncSoundUI() {
  const a = G.audio, el = $('#snd'); if (!el) return;
  el.classList.toggle('muted', a.muted || a.vol === 0);
  $('#snd-vol').value = String(Math.round(a.vol * 100));
  $('#snd-btn').title = (a.muted ? 'Включить звук' : 'Выключить звук') + ' (M)';
}
G.audio.onChange = syncSoundUI;
$('#snd-btn').addEventListener('click', (e) => { e.stopPropagation(); e.currentTarget.blur(); G.audio.unlock(); G.audio.toggleMute(); });
$('#snd-vol').addEventListener('input', (e) => { G.audio.unlock(); G.audio.setVolume(+e.target.value / 100); });
$('#snd').addEventListener('pointerdown', (e) => e.stopPropagation());
syncSoundUI();

// ---------------------------------------------------------------- input
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && !e.repeat) { G.audio.toggleMute(); G.fx && G.fx.popup && G.fx.popup(G.audio.muted ? 'Звук выкл.' : 'Звук вкл.', { x: innerWidth - 90, y: innerHeight - 90 }, 'small'); }
  if (e.repeat && !MOVE_KEYS.includes(e.code)) return;
  G.keys[e.code] = true;
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.code === 'Backquote' || e.code === 'F2') $('#fps').classList.toggle('hidden');
  if (G.mode === 'menu' && e.code === 'Enter') startGame();
  else if (G.mode === 'explore') {
    if (e.code === 'KeyJ' || e.code === 'Digit1' || e.code === 'Numpad1') pressStrike('kick');
    else if (e.code === 'KeyK' || e.code === 'Digit2' || e.code === 'Numpad2') pressStrike('knee');
    else if (e.code === 'KeyC') { G.cam.side *= -1; G.cam.sideLocked = true; }
  } else if (G.mode === 'victory' && (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space')) continueAfterVictory();
});
addEventListener('keyup', (e) => { G.keys[e.code] = false; });
addEventListener('blur', () => { G.keys = {}; });
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', (e) => { drag = null; try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} });
canvas.addEventListener('pointermove', (e) => {
  if (!drag || G.mode !== 'explore') return;
  G.cam.yaw -= (e.clientX - drag.x) * 0.006; G.cam.pitch = THREE.MathUtils.clamp(G.cam.pitch + (e.clientY - drag.y) * 0.004, 0.05, 1.0);
  drag.x = e.clientX; drag.y = e.clientY; G.cam.lastDrag = G.realTime;
});
canvas.addEventListener('wheel', (e) => { if (G.mode === 'explore') G.cam.dist = THREE.MathUtils.clamp(G.cam.dist + Math.sign(e.deltaY) * 0.3, 2.0, 6.5); }, { passive: true });
$('#btn-start').addEventListener('click', () => startGame());
$('#btn-continue').addEventListener('click', () => continueAfterVictory());

function startGame() {
  if (G.mode !== 'menu') return;
  UI.show('#menu', false); UI.show('#hud-explore', true);
  G.mode = 'explore';
  G.cam.yaw = G.rus.yaw + Math.PI;
  canvas.focus();
}

// ---------------------------------------------------------------- helpers
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wrapA = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const STANDING_CLIPS = new Set(['idle', 'hurt', 'stun']);
const clipBase = (ch) => String(ch.currentName).replace(/^guy_/, '');

// guy is standing on his own (AI may act)
function guyFree(g) {
  return G.mode === 'explore' && !g.beaten && !g.timeline.length && !g.queue.length && STANDING_CLIPS.has(clipBase(g)) && !g.caughtLeg;
}
// bent over and holding (double_over finished, waiting in his recovery queue): knee-able
function guyBent(g) {
  return !g.beaten && !g.timeline.length && clipBase(g) === 'double_over' && g.finished && !g.queue.some((q) => /knees|floor|tap/.test(q.name || ''));
}
// can a strike be started on him right now? → 'stand' | 'bent' | null
function strikeable(g) {
  if (!g || g.beaten || g.state === 'tap') return null;
  if (!g.timeline.length && STANDING_CLIPS.has(clipBase(g)) && !(g.queue.length && g.queue.some((q) => /knees|floor|tap/.test(q.name || '')))) return 'stand';
  if (guyBent(g)) return 'bent';
  return null;
}
// root-equivalent distance Rusana→guy measured at his pelvis (handles hips-back poses: bent over, stagger offset)
function effDist(g) {
  const pv = g.boneWorld('pelvis', _v4);
  return flatDist(G.rus.group.position, pv) + pelvisOffsets.guy;
}
// angle (deg) between his facing and the direction to Rusana (0 = she is in front of him)
function facingAngle(g) {
  const p = g.group.position, r = G.rus.group.position;
  return Math.abs(THREE.MathUtils.radToDeg(wrapA(Math.atan2(r.x - p.x, r.z - p.z) - g.yaw)));
}
function guyCircles(except) {
  return G.guys.filter((g) => g !== except).map((g) => ({ x: g.group.position.x, z: g.group.position.z, r: g.beaten ? 0.55 : 0.32 }));
}

// world interface for the guy AI
const world = {
  now: () => G.gt,
  rusPos: () => G.rus.group.position,
  dist: (g) => flatDist(g.group.position, G.rus.group.position),
  free: (g) => guyFree(g),
  rusStriking: (g) => !!(G.act && G.act.target === g),
  painFrac: (g) => g.pain.frac,
  say: (g, text) => speech(g, text),
  shoveRus: (g) => shoveRus(g),
  collideGuy(g) {
    const c = guyCircles(g); if (G.rus) c.push({ x: G.rus.group.position.x, z: G.rus.group.position.z, r: 0.28 });
    collide(g.group.position, 0.3, G.gym, c);
  },
  clampPoint: (p) => collide(p, 0.6, G.gym, []),
};

function speech(g, text) {
  const el = g.labelEls.say; el.textContent = `«${text}»`; el.classList.add('on');
  g.sayUntil = G.realTime + 1.9;
}

// ---------------------------------------------------------------- exploration (movement + open combat)
function updateExplore(dt, realDt) {
  const k = G.keys, rus = G.rus;
  let ix = 0, iz = 0;
  if (k.KeyW || k.ArrowUp) iz += 1; if (k.KeyS || k.ArrowDown) iz -= 1;
  if (k.KeyA || k.ArrowLeft) ix -= 1; if (k.KeyD || k.ArrowRight) ix += 1;
  const yaw = G.cam.yaw;
  const fwd = _v1.set(-Math.sin(yaw), 0, -Math.cos(yaw)), right = _v2.set(Math.cos(yaw), 0, -Math.sin(yaw));
  const dir = _v3.set(0, 0, 0).addScaledVector(fwd, iz).addScaledVector(right, ix);
  const moving = dir.lengthSq() > 0.01 && !G.act;
  if (moving) dir.normalize();
  G.inputDir = moving ? Math.atan2(dir.x, dir.z) : null;
  G.moving = moving;
  if (!G.act) {
    G.vel.x = damp(G.vel.x, moving ? dir.x * CFG.walkSpeed : 0, 10, dt);
    G.vel.z = damp(G.vel.z, moving ? dir.z * CFG.walkSpeed : 0, 10, dt);
    const speed = Math.hypot(G.vel.x, G.vel.z);
    const p = rus.group.position;
    p.x += G.vel.x * dt; p.z += G.vel.z * dt;
    collide(p, 0.28, G.gym, guyCircles(null));
    if (moving) { rus.yaw = angDamp(rus.yaw, Math.atan2(dir.x, dir.z), CFG.turnSpeed, dt); rus.group.rotation.y = rus.yaw; }
    if (speed > 0.25) {
      const a = rus.play('rus_walk', { fade: 0.22, restart: false, loop: true });
      if (a && rus.currentName && /walk/.test(rus.currentName)) a.timeScale = THREE.MathUtils.clamp(speed / CFG.walkClipSpeed, 0.6, 2.4);
    } else if (dt > 0) rus.play('rus_idle', { fade: 0.3, restart: false, loop: true });
  } else G.vel.set(0, 0, 0);

  updateAct(dt);
  // buffered strike (pressed while busy / while he was still reacting)
  if (G.buffer) {
    if (G.gt > G.buffer.until) G.buffer = null;
    else if (canStartNewStrike()) { const b = G.buffer; G.buffer = null; tryStrike(b.move, true); }
  }

  // guys: AI, pain decay, bout reset
  for (const g of G.guys) {
    if (g.beaten) continue;
    // safety net: a clinch that was never resolved (strike cancelled) returns to standing
    if (clipBase(g) === 'clinched' && g.finished && !g.timeline.length && !(G.act && G.act.target === g)) g.play('guy_idle', { fade: 0.3 });
    if (!G.aiOff) g.brain.update(dt, G.gt);
    else if (guyFree(g)) { g.brain.speed = 0; g.brain.applyPose(dt); }
    const down = g.state === 'knees' || g.state === 'floor' || g.state === 'tap' || !guyFree(g);
    g.pain.update(dt, G.gt, down);
    if (g.afterHit && guyFree(g) && G.gt >= g.afterHit.at) { g.brain.afterHit(g.afterHit.grade, g.pain.frac); g.afterHit = null; }
    if (g.bout && !g.bout.ended && g.pain.value <= 0 && G.gt - g.pain.lastHit > COMBAT.resetAfter && guyFree(g)) { g.bout = null; g.state = 'idle'; if (G.engaged === g) updateFightHud(); }
    if (g.bout && (strikeable(g) || (G.act && G.act.target === g)) && g.bout.tick(dt) && G.engaged === g) updateFightHud();
  }

  // engagement (HUD + camera framing) and the strike prompt
  const tgt = G.act && G.act.target ? G.act.target : pickTarget();
  if (tgt) { G.engaged = tgt; G.engagedUntil = G.gt + 2.5; }
  else if (G.engaged && (G.gt > G.engagedUntil || G.engaged.beaten || flatDist(G.engaged.group.position, rus.group.position) > 4)) G.engaged = null;
  G.near = tgt;
  const pr = $('#prompt');
  if (tgt && !G.act) {
    const s = strikeable(tgt);
    pr.innerHTML = s === 'bent' ? `K — колено по согнувшемуся<small>${tgt.def.name} · ${tgt.trait.ru}</small>` : s ? `J — ап-кик · K — колено<small>${tgt.def.name} · ${tgt.trait.ru}</small>` : `Ждём, пока встанет…<small>${tgt.def.name}</small>`;
    pr.classList.remove('hidden');
  } else pr.classList.add('hidden');
  UI.show('#hud-fight', !!G.engaged);
  if (G.engaged !== G.hudGuy) { G.hudGuy = G.engaged; updateFightHud(); }
  if (G.engaged) updatePainHud();
}

// auto-target: nearest guy inside the cone in front of Rusana (or the input direction) within reach;
// a guy right next to her counts from any side
function pickTarget() {
  const rus = G.rus, rp = rus.group.position;
  const face = G.inputDir ?? rus.yaw;
  let best = null, bestS = 1e9;
  for (const g of G.guys) {
    if (g.beaten) continue;
    const d = flatDist(g.group.position, rp);
    if (d > COMBAT.reach) continue;
    const ang = Math.abs(THREE.MathUtils.radToDeg(wrapA(Math.atan2(g.group.position.x - rp.x, g.group.position.z - rp.z) - face)));
    if (ang > COMBAT.cone && d > 1.0) continue;
    const sc = d + ang / 60 - (g === G.engaged ? 0.35 : 0);
    if (sc < bestS) { bestS = sc; best = g; }
  }
  return best;
}

function canStartNewStrike() {
  const a = G.act; if (!a) return true;
  if (a.type === 'strike' && a.contactDone && G.rus.time >= a.ci.time + CFG.cancelAfterContact && !a.caught) return true;
  return false;
}

function pressStrike(move) {
  G.presses.push(G.gt); G.presses = G.presses.filter((t) => G.gt - t < COMBAT.spamWindow);
  G.lastPress = G.gt;
  if (!canStartNewStrike()) { if (!G.act || G.act.type !== 'stagger') G.buffer = { move, until: G.gt + 0.45 }; return; }
  tryStrike(move, false);
}

function tryStrike(move, fromBuffer) {
  const target = pickTarget();
  if (!target) { if (!fromBuffer) startStrike(move, null, {}); return; }       // strike into the air
  const s = strikeable(target);
  if (!s) { G.buffer = { move, until: G.gt + (fromBuffer ? 0.3 : 0.9) }; UI.text('#f-log', 'Ждём, пока он встанет…'); return; }
  if (s === 'bent') move = 'knee';        // a doubled-over guy only takes the knee (adjusted contact)
  const ci = G.contact[move];
  const err = effDist(target) - ci.dist;
  const spam = G.presses.length >= 3;
  if (err > COMBAT.lungeMax) {
    G.act = { type: 'dash', target, move, t: 0, from: G.rus.group.position.clone(), spam };
    target.brain.onStrike(move, ci.time + (err - COMBAT.dashStop) / COMBAT.dashSpeed, { spam });
    const w = G.rus.play('rus_walk', { fade: 0.1, loop: true }); if (w) w.timeScale = 2.5;
    return;
  }
  startStrike(move, target, { spam, bent: s === 'bent' });
}

function updateAct(dt) {
  const a = G.act, rus = G.rus; if (!a) return;
  a.t += dt;
  if (a.type === 'dash') {
    const g = a.target;
    if (!strikeable(g) && !guyBent(g)) { G.act = null; return; }
    const gp = g.group.position, rp = rus.group.position;
    const dx = gp.x - rp.x, dz = gp.z - rp.z, d = Math.hypot(dx, dz) || 1;
    const want = Math.atan2(dx, dz);
    rus.yaw = angDamp(rus.yaw, want, 18, dt); rus.group.rotation.y = rus.yaw;
    const left = effDist(g) - G.contact[a.move].dist - COMBAT.dashStop;
    if (left <= 0 || a.t > 0.8) {
      const s = strikeable(g);
      if (!s) { G.act = null; return; }
      startStrike(s === 'bent' ? 'knee' : a.move, g, { spam: a.spam, dashLen: flatDist(a.from, rp), bent: s === 'bent' });
      return;
    }
    const step = Math.min(left, COMBAT.dashSpeed * dt);
    rp.x += dx / d * step; rp.z += dz / d * step;
    collide(rp, 0.28, G.gym, guyCircles(g));
    return;
  }
  if (a.type === 'strike') {
    const t = rus.time;
    const e = Math.min(1, a.t / a.lungeT), ease = 1 - Math.pow(1 - e, 3);
    rus.group.position.copy(a.from).addScaledVector(a.dir, a.lunge * ease);
    collide(rus.group.position, 0.28, G.gym, []);
    if (a.target) { rus.yaw = angDamp(rus.yaw, a.yaw, 25, dt); rus.group.rotation.y = rus.yaw; }
    if (a.finishing && !a.slow && t >= a.ci.time - 0.28) { a.slow = true; G.slowUntil = G.realTime + 1.0; G.slowScale = 0.3; }
    if (!a.contactDone && t >= a.ci.time) onContact(a);
    if (a.caught) {
      a.caughtT += dt;
      if (a.caughtT > 0.55) { const g = a.target; g.caughtLeg = false; g.setLayer('guard', 0, 5); rus.current && (rus.current.timeScale = 1); startStagger(g, 0.55, 'Поймал ногу — толкнул!'); }
      return;
    }
    if (rus.finished) { G.act = null; rus.play('rus_idle', { fade: 0.3 }); }
    return;
  }
  if (a.type === 'stagger') {
    const k = Math.min(1, a.t / 0.38), ease = 1 - Math.pow(1 - k, 2);
    rus.group.position.copy(a.from).addScaledVector(a.vec, ease);
    collide(rus.group.position, 0.28, G.gym, guyCircles(null));
    const env = Math.sin(Math.min(1, a.t / a.dur) * Math.PI);
    rus.addRot('spine_01', _X, -0.32 * env); rus.addRot('spine_03', _X, -0.12 * env);
    if (a.t >= a.dur) { G.act = null; }
  }
}
const _X = new THREE.Vector3(1, 0, 0);

function startStrike(move, target, { spam = false, dashLen = 0, bent = false } = {}) {
  const rus = G.rus, ci = G.contact[move];
  const a = G.act = { type: 'strike', move, ci, target, t: 0, contactDone: false, from: rus.group.position.clone(), dir: new THREE.Vector3(), lunge: 0, lungeT: move === 'knee' ? 0.3 : 0.2, yaw: rus.yaw, spam, dashLen, bent, pressT: G.lastPress ?? G.gt };
  if (target) {
    const gp = target.group.position;
    a.dir.set(gp.x - a.from.x, 0, gp.z - a.from.z); if (a.dir.lengthSq() < 1e-6) a.dir.set(Math.sin(rus.yaw), 0, Math.cos(rus.yaw)); a.dir.normalize();
    a.yaw = Math.atan2(a.dir.x, a.dir.z);
    const err = effDist(target) - ci.dist;
    a.lunge = THREE.MathUtils.clamp(err * COMBAT.magnet, -0.3, COMBAT.lungeMax);
    a.open = target.brain.isOpen(G.gt) || (bent ? 'bent' : '');
    if (!bent) target.brain.onStrike(move, ci.time, { spam, clinch: move === 'knee' });
    // finisher prediction → slow-mo + her line
    const pred = predictPain(target, move, Math.abs(err - a.lunge), a);
    a.finishing = pred >= COMBAT.pain.floor && (!target.bout || target.bout.guyState !== 'floor');
    if (a.finishing && talk(0.85)) { G.audio.rus('rus_fin'); G.lastLine = G.realTime; }
    // guy sync: contact was fit against 'idle' (kick) / 'clinched' started together with rus_knee (knee)
    if (move === 'knee' && !bent && target.has('clinched') && strikeable(target) === 'stand') {
      target.queue = []; target.play('clinched', { fade: 0.1, loop: false });
    }
    if (!target.bout && !target.greeted) { target.greeted = true; if (!a.finishing && talk(0.75)) { G.audio.rus('rus_start'); G.lastLine = G.realTime; } }
    G.engaged = target; G.engagedUntil = G.gt + 3;
  }
  rus.queue = [];
  rus.play(ci.clip, { fade: ci.fadeIn ?? 0.1, loop: false });
  UI.text('#f-log', move === 'kick' ? 'Ап-кик снизу…' : bent ? 'Колено по согнувшемуся…' : 'Клинч — колено…');
}

function predictPain(g, move, residual, a) {
  const res = gradeStrike({ move, distErr: residual, angleDeg: facingAngle(g), timing: timingFor(g, a), defense: {} });
  const P = new Pain(g.trait.tough); P.value = g.pain.value; P.lastHit = g.pain.lastHit; P.chain = g.pain.chain;
  P.hit(res.grade, move, G.gt + (a.ci.time || 0));
  return P.value;
}
function timingFor(g, a) {
  const lc = G.lastContact;
  return {
    open: !!a.open,
    rhythm: !!(lc && lc.target === g && (lc.grade === 'clean' || lc.grade === 'perfect') && a.pressT - lc.t >= 0.2 && a.pressT - lc.t <= 0.9),
    dash: a.dashLen > 0.5,
  };
}

function startStagger(by, dist, text) {
  const rus = G.rus, rp = rus.group.position, gp = by.group.position;
  const v = new THREE.Vector3(rp.x - gp.x, 0, rp.z - gp.z); if (v.lengthSq() < 1e-6) v.set(-Math.sin(rus.yaw), 0, -Math.cos(rus.yaw)); v.normalize().multiplyScalar(dist);
  G.act = { type: 'stagger', t: 0, dur: 0.75, from: rp.clone(), vec: v };
  rus.play('rus_idle', { fade: 0.18 });
  G.buffer = null;
  const scr = toScreen(_v1.set(rp.x, 1.5, rp.z));
  G.fx.popup(text, { x: scr.x, y: scr.y - 20 }, 'block');
  G.fx.smallHit(_v1.set(rp.x, 1.1, rp.z));
  G.audio.impact('thigh');
  UI.text('#f-log', text);
}

function shoveRus(g) {
  const a = G.act;
  if (a && (a.type === 'stagger' || (a.type === 'strike' && a.contactDone && a.target === g))) return;
  startStagger(g, 0.7, `${g.def.name} толкнул!`);
}

function guyClip(state) {
  return { idle: ['guy_idle', true], flinch: ['guy_hurt', true], double_over: ['guy_double_over', false], knees: ['guy_knees', false], floor: ['guy_floor', true], tap: ['guy_tap', false] }[state];
}

// Reaction after contact. Timeline times are seconds after contact in *real* time (hit-stop included):
//   0–0.06 freeze both · flinch / flinch_knee · double_over at clip time 0.40 (+hit-stop).
// Then a finish-driven queue: double_over staggers him 0.30 m back → baked into his root (no pop, clamped
// against walls), knees / getup / floor / tap are authored in place from that spot. Recovery is short: he
// holds the bent-over pose ~0.7 s (knee-able!), getup plays 1.35× faster. Floor = he taps out → victory.
function guyReact(guy, prev, next, clean, move, ci, { bent = false, hs: hsOverride } = {}) {
  guy.queue = []; guy.timeline = []; guy.tl = 0;
  const hs = clean ? (hsOverride ?? ci.hitStop ?? CFG.hitStop) : 0;
  const flinch = (move === 'knee' || bent) && guy.has('flinch_knee') ? 'flinch_knee' : 'guy_flinch';
  const f0 = bent ? 0.14 : 0.05;
  const at = (t, name, loop = false, fade = 0.05) => guy.timeline.push({ at: t + hs, name, loop, fade });
  const q = (o) => guy.queue.push(o);
  const standClip = guy.has('guy_hurt') ? 'guy_hurt' : 'guy_idle';
  let stateAt = 0.4;
  if (ci.seq) { const d = ci.seq.find((x) => /double_over/.test(x.name)); if (d) stateAt = d.at; }
  if (!clean) {
    at(0, flinch, false, f0);
    at(Math.min(stateAt, 0.4), prev === 'idle' ? 'guy_idle' : standClip, true, 0.25);
    return;
  }
  at(0, flinch, false, bent ? 0.14 : 0.04);
  if (next === 'flinch') {
    at(stateAt, standClip, true, 0.2);
  } else {
    at(stateAt, 'guy_double_over', false, 0.05);     // flinch last frame == double_over f0
    q({ bake: true });
    if (next === 'double_over') {
      q({ name: standClip, loop: true, fade: 0.4, hold: 0.7 });
    } else if (next === 'knees') {
      q({ name: 'guy_knees', loop: false, fade: 0.1 });
      q({ name: 'guy_getup', loop: false, fade: 0.15, hold: 0.3, ts: 1.35 });
      q({ name: standClip, loop: true, fade: 0.25 });
    } else if (next === 'floor' || next === 'tap') {
      q({ name: 'guy_knees', loop: false, fade: 0.1 });
      q({ name: 'guy_floor', loop: true, fade: 0.25, hold: 0.15 });
      q({ name: 'guy_tap', loop: false, fade: 0.2, hold: 0.7, onStart: () => tapOut(guy) });
      q({ name: 'guy_floor', loop: true, fade: 0.3 });
    }
  }
  guy.state = next;
}

// root-motion bake for double_over: move the object back along HIS facing (clamped against walls / props)
// and compensate the model offset by the double_over action weight, so the pose never pops while it
// crossfades out. If a wall stops him, he slides the remaining bit smoothly during the crossfade.
function bakeStagger(ch) {
  const a = ch.current; if (!a || !/double_over/.test(ch.currentName)) return;
  const d = CFG.staggerBack ?? 0.3;
  const p = ch.group.position, p0 = p.clone();
  p.x -= Math.sin(ch.yaw) * d; p.z -= Math.cos(ch.yaw) * d;
  collide(p, 0.3, G.gym, guyCircles(ch).concat([{ x: G.rus.group.position.x, z: G.rus.group.position.z, r: 0.2 }]));
  const off = p0.sub(p);                                       // world offset that keeps the visual in place
  off.applyAxisAngle(_Y, -ch.yaw);                             // → local
  ch.stagger = { action: a, off };
  ch.model.position.copy(off);
}
const _Y = new THREE.Vector3(0, 1, 0);

function tapOut(g) {
  if (!g.bout) return;
  g.bout.autoTap(); if (G.engaged === g) updateFightHud();
  UI.text('#f-log', `${g.def.name} тапает — сдаётся!`);
  g.victoryAt = G.realTime + 1.4;
}

function strikePoint(move, target, out) {
  // groin: just below the guy's pelvis bone, on his front side; nudged toward Rusana's striking bone
  const rus = G.rus;
  target.boneWorld('pelvis', out); out.y -= 0.09;
  const d = _v2.subVectors(target.group.position, rus.group.position).setY(0).normalize();
  out.addScaledVector(d, -0.08);
  const bone = move === 'kick' ? (rus.bones.ball_r ? 'ball_r' : 'foot_r') : 'calf_r';
  if (rus.bones[bone]) out.lerp(rus.boneWorld(bone, new THREE.Vector3()), 0.25);
  return out;
}

function toScreen(p) {
  const v = p.clone().project(camera);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
}

const GRADE_CLS = { perfect: 'perfect', clean: '', glance: 'glance', miss: 'miss', block: 'block', caught: 'block' };

function onContact(a) {
  a.contactDone = true;
  const g = a.target;
  if (!g) { G.audio.play && 0; return; }                   // air strike
  const ci = a.ci;
  const distErr = Math.abs(effDist(g) - ci.dist);
  const angleDeg = a.bent ? 0 : facingAngle(g);
  const timing = timingFor(g, a);
  const defense = a.bent ? {} : { guard: g.layerW('guard'), catching: g.brain.catching };
  let res = gradeStrike({ move: a.move, distErr, angleDeg, timing, defense });
  if (G.forceGrade) res = { ...res, grade: G.forceGrade };
  else if (G.forceClean !== undefined) res = { ...res, grade: G.forceClean ? 'clean' : 'glance' };
  const grade = res.grade;
  const now = G.gt;
  g.pain.hit(grade === 'caught' ? 'miss' : grade, a.move, now);
  if (!g.bout) g.bout = new Bout(g.def);
  const r = g.bout.resolveHit(grade, g.pain.state);
  const fin = r.clean && r.next === 'floor';
  g.lastHit = { clean: r.clean, finishing: fin, move: a.move, grade };
  G.lastContact = { t: now, target: g, grade };
  G.lastGrade = { ...res, grade, distErr: +distErr.toFixed(3), angleDeg: +angleDeg.toFixed(1), timing, guard: +(defense.guard || 0).toFixed(2), pain: +g.pain.value.toFixed(1), next: r.next, open: a.open };
  log('contact', g.def.name, G.lastGrade);
  const p = strikePoint(a.move, g, new THREE.Vector3());
  const scr = toScreen(p);
  const label = fin ? 'ДОБИВАНИЕ!' : GRADE_RU[grade];
  G.fx.popup(label, { x: scr.x, y: scr.y - 44 }, fin ? 'perfect' : GRADE_CLS[grade]);
  if (r.clean) {
    const hs = grade === 'perfect' ? COMBAT.hitStopPerfect : (ci.hitStop ?? CFG.hitStop);
    G.hitStopUntil = G.realTime + hs;
    G.audio.impact(fin ? 'fin' : a.move, { perfect: grade === 'perfect' });
    G.fx.impact(p, fin ? 1.6 : grade === 'perfect' ? 1.35 : 1.0);
    G.fx.popup(`+${r.gained}`, { x: scr.x + 80, y: scr.y + 6 }, 'small');
    if (r.comboMult > 1) G.fx.popup(`КОМБО ×${r.comboMult}`, { x: scr.x - 100, y: scr.y + 30 }, 'small');
    if (!fin && G.realTime - (G.lastLine ?? -99) > 5 && talk(0.4)) { G.audio.rus('rus_hit', { delay: 1.05 }); G.lastLine = G.realTime; }
    UI.text('#f-log', `${GRADE_RU[grade]} ${STATE_RU[r.prev]} → ${STATE_RU[r.next]}` + (r.comboMult > 1 ? ` · комбо ×${r.comboMult}` : '') + (r.painMult > 1 ? ` · отёк ×${r.painMult}` : '') + (timing.open ? ' · в раскрытие' : timing.rhythm ? ' · в ритм' : ''));
    guyReact(g, r.prev, r.next, true, a.move, ci, { bent: a.bent, hs });
    g.afterHit = { grade, at: now + 0.2 };
  } else if (grade === 'glance') {
    G.audio.impact('thigh'); G.fx.smallHit(p);
    UI.text('#f-log', angleDeg > COMBAT.angOk * 2 ? 'Скользом — он стоял боком.' : 'Скользом — не та дистанция.');
    guyReact(g, r.prev, r.next, false, a.move, ci, { bent: a.bent });
    g.afterHit = { grade, at: now + 0.1 };
  } else if (grade === 'block') {
    G.audio.impact('thigh'); G.fx.smallHit(p);
    UI.text('#f-log', `${g.def.name} закрылся руками — блок.`);
    g.setLayer('guard', 1, 12); g.brain.setMode('guard', 0.6); g.setLayer('guard', 1, 12);
    g.afterHit = { grade, at: now + 0.35 };
  } else if (grade === 'caught') {
    UI.text('#f-log', `${g.def.name} поймал ногу! Не спамь удары.`);
    a.caught = true; a.caughtT = 0; g.caughtLeg = true;
    G.rus.current && (G.rus.current.timeScale = 0);             // her leg is held at the contact pose
    G.audio.impact('thigh');
    g.afterHit = { grade, at: now + 0.9 };
  } else {
    UI.text('#f-log', distErr > 0.3 ? 'Мимо — далеко.' : 'Мимо.');
    g.afterHit = { grade, at: now + 0.1 };
  }
  // knee that didn't land: let go of the clinch
  if ((grade === 'block' || grade === 'miss') && clipBase(g) === 'clinched') g.play(g.pain.value > 10 ? 'guy_hurt' : 'guy_idle', { fade: 0.3 });
  if (G.engaged === g || !G.engaged) { G.engaged = g; updateFightHud(); }
}

function updateFightHud() {
  const g = G.engaged; if (!g) return;
  const b = g.bout || { hits: 0, comboMult: 1, swell: 0, score: 0, guyState: 'idle' };
  UI.text('#fight-name', `${g.def.name}, ${g.def.age} · ${g.trait.ru}`);
  UI.text('#f-hits', String(b.hits));
  UI.text('#f-combo', `×${b.comboMult}`);
  UI.text('#f-swell', b.swell >= 1 ? `×1.25 (${b.swell})` : '—');
  UI.text('#f-score', String(b.score));
  UI.text('#f-state', `Состояние: ${STATE_RU[b.guyState]}`);
  const tr = $('#state-track'); tr.innerHTML = '';
  const idx = GUY_STATES.indexOf(b.guyState);
  GUY_STATES.forEach((s, i) => { const el = document.createElement('span'); el.className = 'st' + (i < idx ? ' done' : i === idx ? ' cur' : ''); el.textContent = STATE_RU[s]; tr.appendChild(el); });
}
function updatePainHud() {
  const g = G.engaged; if (!g) return;
  $('#f-pain').style.width = (g.pain.frac * 100).toFixed(1) + '%';
  $('#f-pain').parentElement.classList.toggle('series', g.pain.chain > 0 && G.gt - g.pain.lastHit < COMBAT.seriesWindow);
}

// ---------------------------------------------------------------- camera
// Third-person follow. When a guy is engaged the look point moves toward the pair and, while Rusana stands
// still and the mouse wasn't used for 2 s, the yaw drifts to a 3/4 side view (C flips the side).
function updateExploreCamera(dt) {
  const c = G.cam, p = G.rus.group.position;
  const e = G.engaged && !G.engaged.beaten && flatDist(G.engaged.group.position, p) < 3.4 ? G.engaged : null;
  if (e && !c.engGuy) { c.side = c.sideLocked ? c.side : pickSideNearest(e); }
  if (e) c.engGuy = e;
  c.eng = damp(c.eng, e ? 1 : 0, 3, dt);
  if (c.eng < 0.02 && !e) c.engGuy = null;
  const target = _v1.set(p.x, 1.25, p.z);
  if (c.engGuy) {
    const gp = c.engGuy.group.position;
    target.lerp(_v4.set((p.x + gp.x) / 2, 1.0, (p.z + gp.z) / 2), c.eng * 0.85);
    if (e && !G.moving && G.realTime - c.lastDrag > 2) c.yaw = angDamp(c.yaw, sideYaw(e, c.side), 1.8, dt);
  }
  const pitch = THREE.MathUtils.lerp(c.pitch, 0.17, c.eng * 0.7), dist = c.dist * (1 - 0.1 * c.eng);
  const off = _v2.set(Math.sin(c.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(c.yaw) * Math.cos(pitch)).multiplyScalar(dist);
  const want = _v3.copy(target).add(off);
  const B = G.gym.bounds;
  want.x = THREE.MathUtils.clamp(want.x, B.x0 - 0.1, B.x1 + 0.1); want.z = THREE.MathUtils.clamp(want.z, B.z0 - 0.1, B.z1 + 0.1); want.y = THREE.MathUtils.clamp(want.y, 0.4, 5.2);
  c.pos.lerp(want, 1 - Math.exp(-8 * dt));
  c.look.lerp(target, 1 - Math.exp(-10 * dt));
}
function sideYaw(g, side) {
  const rp = G.rus.group.position, gp = g.group.position;
  const dir = _v3.set(gp.x - rp.x, 0, gp.z - rp.z); if (dir.lengthSq() < 1e-6) return G.cam.yaw; dir.normalize();
  const a = THREE.MathUtils.degToRad(20);
  const dx = dir.z * side * Math.cos(a) - dir.x * Math.sin(a), dz = -dir.x * side * Math.cos(a) - dir.z * Math.sin(a);
  return Math.atan2(dx, dz);
}
function pickSideNearest(g) {
  const a = Math.abs(wrapA(sideYaw(g, 1) - G.cam.yaw)), b = Math.abs(wrapA(sideYaw(g, -1) - G.cam.yaw));
  return a <= b ? 1 : -1;
}

// ---------------------------------------------------------------- victory
function startVictory(g) {
  const gain = g.bout.repGain();
  G.rep += gain;
  g.beaten = true;
  const rp = G.rus.group.position;
  G.duel = { guy: g, dir: new THREE.Vector3(g.group.position.x - rp.x, 0, g.group.position.z - rp.z).normalize() };
  G.act = null; G.buffer = null;
  G.rus.play('rus_victory', { fade: 0.35, loop: false });
  G.rus.setExpr({ smirk: 0.9 });
  G.mode = 'victory'; G.victoryT = 0;
  UI.show('#hud-fight', false); $('#prompt').classList.add('hidden');
  UI.text('#victory-text', g.def.win);
  UI.text('#victory-stats', `Удары: ${g.bout.hits}` + (g.bout.perfects ? ` (идеальных ${g.bout.perfects})` : '') + ` · Очки: ${g.bout.score} · Репутация +${gain} (всего ${G.rep})`);
  G.victoryCardAt = G.realTime + 0.9;
  G.audio.rus('rus_vic', { delay: 0.9 });
  UI.text('#rep-display', `Репутация: ${G.rep}`);
}

function updateVictoryCamera(dt) {
  const f = G.duel; G.victoryT += dt;
  const rp = G.rus.group.position;
  const ang = G.rus.yaw + 0.75 * G.cam.side + Math.sin(G.victoryT * 0.25) * 0.25;
  const pos = _v1.set(rp.x + Math.sin(ang) * 2.5, 1.35, rp.z + Math.cos(ang) * 2.5);
  const look = _v2.set(rp.x, 1.05, rp.z).addScaledVector(f.dir, 0.25);
  G.cam.pos.lerp(pos, 1 - Math.exp(-2.5 * dt)); G.cam.look.lerp(look, 1 - Math.exp(-3 * dt));
}

function continueAfterVictory() {
  if (G.mode !== 'victory') return;
  UI.show('#victory', false); UI.show('#hud-explore', true);
  const f = G.duel;
  G.rus.play('rus_idle', { fade: 0.4 }); G.rus.setExpr({ cold: 0.6 });
  G.rus.group.position.addScaledVector(f.dir, -0.35);
  collide(G.rus.group.position, 0.28, G.gym, guyCircles(null));
  f.guy.label.classList.add('beaten');
  f.guy.label.querySelector('.nl-name').textContent = `${f.guy.def.name} — повержен`;
  f.guy.labelEls.status.textContent = ''; f.guy.labelEls.painBox.style.display = 'none';
  G.mode = 'explore'; G.engaged = null;
  G.cam.yaw = G.rus.yaw + Math.PI;
}

// ---------------------------------------------------------------- menu camera
function updateMenuCamera(dt) {
  const t = G.time * 0.05;
  const pos = _v1.set(Math.sin(t) * 7.5, 2.4 + Math.sin(t * 2) * 0.3, 1.5 + Math.cos(t) * 4.5);
  G.cam.pos.lerp(pos, 1 - Math.exp(-2 * dt));
  G.cam.look.lerp(_v2.set(0, 1.2, -1), 1 - Math.exp(-2 * dt));
}

// ---------------------------------------------------------------- labels (name · trait, status / state, pain, speech)
function updateLabels() {
  const show = G.mode === 'explore';
  for (const g of G.guys) {
    if (!show) { g.label.style.display = 'none'; continue; }
    const p = _v1.copy(g.group.position); p.y += g.beaten ? 0.6 : 2.05;
    const v = _v2.copy(p).project(camera);
    const dist = p.distanceTo(camera.position);
    if (v.z > 1 || dist > 14) { g.label.style.display = 'none'; continue; }
    g.label.style.display = 'block';
    g.label.style.left = ((v.x * 0.5 + 0.5) * innerWidth).toFixed(1) + 'px';
    const eng = g === G.engaged && !g.beaten;
    g.label.classList.toggle('eng', eng);                // the fight HUD already shows his name · trait
    g.label.style.top = Math.max(eng ? 150 : 40, (-v.y * 0.5 + 0.5) * innerHeight).toFixed(1) + 'px';
    g.label.style.opacity = String(THREE.MathUtils.clamp(1.4 - dist / 10, 0.3, 1));
    if (g.beaten) continue;
    const st = guyFree(g) ? g.brain.status() : g.caughtLeg ? 'держит ногу' : (g.state !== 'idle' ? STATE_RU[g.state] : '');
    if (st !== g.lastStatus) {
      g.lastStatus = st; g.labelEls.status.textContent = st;
      g.labelEls.status.className = 'nl-status' + (/замах|толкает/.test(st) ? ' danger' : /закрылся|ловит|отвернулся|держит/.test(st) ? ' guard' : /дразнит|выдохся|финт/.test(st) ? ' open' : '');
    }
    const pf = g.pain.frac;
    g.labelEls.painBox.style.display = pf > 0.005 ? 'block' : 'none';
    g.labelEls.pain.style.width = (pf * 100).toFixed(1) + '%';
    if (g.sayUntil && G.realTime > g.sayUntil) { g.sayUntil = 0; g.labelEls.say.classList.remove('on'); }
  }
}

// ---------------------------------------------------------------- sound hooks
// probability gate for Rusana's lines (G.alwaysTalk = test hook)
function talk(p) { return G.alwaysTalk || Math.random() < p; }

// Guy vocals ride on his reaction clips, so they land exactly on the animation timeline:
// flinch/flinch_knee (starts at contact + hit-stop) → gasp/grunt (+30–80 ms pain delay) or the scream on a finisher,
// double_over → choked groan/wheeze, knees → whimper, getup → strained whimper, floor → moaning (repeats), tap → whimper.
function guyVoice(g, clip) {
  const A = G.audio, key = g.def.id, vr = g.def.voice || 1;
  const n = String(clip).replace(/^guy_/, '');
  const hit = g.lastHit;
  const r = () => vr * (0.97 + Math.random() * 0.06);
  if (/^flinch/.test(n)) {
    if (!hit) return;
    if (hit.finishing) A.voice(key, 'v_scream', { delay: 0.05, rate: r() * 0.98, gain: 1 });
    else if (hit.clean) A.voice(key, 'v_flinch', { delay: 0.03 + Math.random() * 0.05, rate: r(), gain: hit.grade === 'perfect' ? 1 : 0.95 });
    else if (Math.random() < 0.7) A.voice(key, 'v_flinch', { delay: 0.05, rate: r() * 1.04, gain: 0.45 });
  } else if (n === 'double_over') {
    if (hit && hit.clean && !hit.finishing) A.voice(key, 'v_groan', { delay: 0.1, rate: r(), gain: 0.95 });
  } else if (n === 'knees') {
    if (hit && hit.clean) A.voice(key, 'v_whimper', { delay: 0.12, rate: r(), gain: 0.95 });
  } else if (n === 'getup') {
    if (Math.random() < 0.6) A.voice(key, 'v_whimper', { delay: 0.2, rate: r(), gain: 0.45 });
  } else if (n === 'floor') {
    if (!g.floorVoiced) { g.floorVoiced = true; A.voice(key, 'v_floor', { delay: 0.2, rate: r(), gain: 0.9 }); A.moan(key, { rate: vr, gain: 0.75, first: 3.4, max: 5 }); }
  } else if (n === 'tap') {
    A.voice(key, 'v_tap', { delay: 0.1, rate: r(), gain: 1 });
  }
}

// footsteps from Rusana's foot bones (heel-down detection with hysteresis), surface = mats / rubber floor
const _fv = new THREE.Vector3();
function updateFootsteps(dt) {
  const rus = G.rus; if (!rus || !rus.bones.foot_l) return;
  const dashing = G.act && G.act.type === 'dash';
  const walking = /walk/.test(rus.currentName || '') && G.mode === 'explore';
  const st = rus.steps || (rus.steps = { l: { armed: false, min: 0.2 }, r: { armed: false, min: 0.2 } });
  const speed = dashing ? 2.5 : Math.hypot(G.vel.x, G.vel.z);
  for (const s of ['l', 'r']) {
    const fs = st[s];
    const h = rus.boneWorld('foot_' + s, _fv).y - rus.group.position.y;
    fs.min = Math.min(fs.min + 0.03 * dt, h);
    if (h > fs.min + 0.045) fs.armed = true;
    else if (fs.armed && h < fs.min + 0.012) {
      fs.armed = false;
      if (walking && speed > 0.2) G.audio.footstep(G.gym.surfaceAt ? G.gym.surfaceAt(_fv.x, _fv.z) : 'mat', Math.min(1, 0.55 + speed * 0.3));
    }
  }
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0, fpsT = 0, qualT = 0;
function frame(fixedDt) {
  const wallDt = clock.getDelta();
  const realDt = fixedDt || Math.min(wallDt, 1 / 20);
  G.realTime += realDt;
  G.audio.update();
  if (G.mode === 'loading') { return; }
  if (G.paused) { composer.render(0); return; }   // test hook: full freeze
  // time scale: hit-stop (freeze) > slow-mo > normal
  let ts = 1;
  if (G.realTime < G.hitStopUntil) ts = 0;
  else if (G.realTime < G.slowUntil) ts = G.slowScale;
  G.timeScale = damp(G.timeScale, ts, ts === 0 ? 1e3 : 12, realDt);
  if (ts === 0) G.timeScale = 0;
  const dt = realDt * G.timeScale;
  G.time += realDt; G.gt += dt;

  if (G.mode === 'explore') { updateExplore(dt, realDt); updateExploreCamera(realDt); }
  else if (G.mode === 'victory') updateVictoryCamera(realDt);
  else if (G.mode === 'menu') updateMenuCamera(realDt);
  for (const g of G.guys) if (g.victoryAt && G.realTime >= g.victoryAt && G.mode === 'explore') { g.victoryAt = 0; startVictory(g); }

  // characters
  for (const ch of [G.rus, ...G.guys]) {
    ch.update(dt);
    if (ch.timeline && ch.timeline.length) {
      ch.tl += G.timeScale === 0 ? realDt : dt;
      while (ch.timeline.length && ch.tl >= ch.timeline[0].at) { const q = ch.timeline.shift(); ch.play(q.name, { fade: q.fade, loop: q.loop }); }
    } else if (ch.queue && ch.queue.length) {
      while (ch.queue.length && ch.queue[0].bake && ch.finished) { ch.queue.shift(); bakeStagger(ch); }
      const q = ch.queue[0];
      if (q && !q.bake) {
        const a = ch.current, dur = a ? a.getClip().duration : 0;
        const looping = a && a.loop !== THREE.LoopOnce;
        const since = looping ? ch.playT : ch.playT - dur / Math.max(1e-3, Math.abs(a ? a.timeScale : 1));
        if ((looping || ch.finished) && since >= (q.hold || 0)) { ch.queue.shift(); ch.play(q.name, { fade: q.fade, loop: q.loop, timeScale: q.ts || 1 }); if (q.onStart) q.onStart(); }
      }
    }
    if (ch.stagger) {   // keep the baked double_over offset glued to the action weight
      const w = ch.stagger.action.enabled ? ch.stagger.action.getEffectiveWeight() : 0;
      ch.model.position.copy(ch.stagger.off).multiplyScalar(w);
      if (w <= 1e-3) { ch.stagger = null; ch.model.position.set(0, 0, 0); }
    }
    if (ch.blob) {
      const pv = ch.bones.pelvis ? ch.boneWorld('pelvis', _v1) : ch.group.position;
      const lying = ch.state === 'floor' || ch.state === 'tap' || ch.beaten;
      ch.blob.position.set(pv.x, 0.036, pv.z);
      ch.blob.scale.setScalar(lying ? 1.9 : 0.95);
    }
  }
  updateFootsteps(realDt);
  G.audio.setBus('music', G.engaged || G.mode === 'victory' ? 0.11 : 0.2, 1.2);
  if (G.victoryCardAt && G.realTime >= G.victoryCardAt) { G.victoryCardAt = 0; if (G.mode === 'victory') UI.show('#victory', true); }
  G.gym.update(G.time, dt);
  G.fx.update(dt, realDt);

  camera.position.copy(G.cam.pos).add(G.fx.shakeOffset);
  camera.lookAt(G.cam.look);
  updateLabels();
  if (G.onFrame) G.onFrame();
  renderer.info.reset();
  if (!G.noRender) composer.render(realDt);     // G.noRender = test hook (fast headless logic runs)
  if ((G.frameN = (G.frameN || 0) + 1) % 30 === 0) G.renderInfo = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, progs: renderer.info.programs.length };

  // perf: fps counter + adaptive resolution
  fpsAcc += realDt; fpsN++; fpsT += realDt; qualT += realDt;
  if (fpsT > 0.5) { const fps = fpsN / fpsAcc; $('#fps').textContent = `${fps.toFixed(0)} fps · dpr ${dpr.toFixed(2)}`; G.fps = fps; fpsT = 0; if (qualT > 2.5) { adapt(fps); qualT = 0; } fpsAcc = 0; fpsN = 0; }
}
function adapt(fps) {
  if (G.lockDPR) return;
  let nd = dpr;
  if (fps < 50 && dpr > 0.7) nd = Math.max(0.7, dpr - 0.15);
  else if (fps > 58 && dpr < maxDPR) nd = Math.min(maxDPR, dpr + 0.1);
  if (Math.abs(nd - dpr) > 0.01) { dpr = nd; renderer.setPixelRatio(dpr); onResize(); }
}
renderer.setAnimationLoop(() => { if (!G.manual) frame(); });
// deterministic stepping for offline capture (demo video): G.manual = true; G.step(1/30)
G.step = (dt = 1 / 30) => frame(dt);

// test / automation hooks (console): see README «Test hooks»
Object.assign(G, {
  startGame, continueAfterVictory,
  strike: pressStrike,                       // __bb.strike('kick' | 'knee') — same as pressing J / K
  // place Rusana in front of guy i (d = root distance, default = ideal contact distance), both facing each other
  goTo(i, d, { angle = 0 } = {}) {
    const g = G.guys[i]; const p = g.group.position;
    const dist = d ?? G.contact.kick.dist;
    const yaw = g.yaw + THREE.MathUtils.degToRad(angle);
    const dv = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    G.rus.group.position.copy(p).addScaledVector(dv, dist);
    G.rus.yaw = Math.atan2(-dv.x, -dv.z); G.rus.group.rotation.y = G.rus.yaw;
    G.cam.yaw = G.rus.yaw + Math.PI * 0.75;
    G.act = null; G.buffer = null; G.vel.set(0, 0, 0);
  },
  guy(i) { return typeof i === 'number' ? G.guys[i] : G.guys.find((g) => g.def.id === i || g.def.name === i); },
  // force an AI behaviour: 'guard' | 'turn' | 'step' | 'flee' | 'feint' | 'taunt' | 'windup' | 'catch'
  guyDo(i, mode) {
    const g = G.guy(i), b = g.brain;
    if (mode === 'flee') b.startFlee();
    else if (mode === 'windup') { b.setMode('windup', 0.5); b.open(0.5, 'windup'); }
    else if (mode === 'taunt') { b.setMode('taunt', 1.0); b.open(1.0, 'taunt'); b.say(b.line(), 1); }
    else if (mode === 'catch') { b.setMode('catch', 1.5); b.catching = true; g.setLayer('guard', 0.8, 9); }
    else if (mode === 'guard') { b.setMode('guard', 2.0); g.setLayer('guard', 1, 7); }
    else if (mode === 'turn') { b.setMode('turn', 1.5); b.turnWant = 1.0; }
    else b.setMode(mode, 1);
  },
  setPain(i, v) { const g = G.guy(i); g.pain.value = v; g.pain.lastHit = G.gt; },
  info() {
    const e = G.engaged;
    return { mode: G.mode, rep: G.rep, act: G.act && { type: G.act.type, move: G.act.move, target: G.act.target && G.act.target.def.name }, engaged: e && e.def.name,
      lastGrade: G.lastGrade,
      guys: G.guys.map((g) => ({ name: g.def.name, trait: g.def.trait, beaten: g.beaten, state: g.state, clip: g.currentName, ai: g.brain.mode, guard: +g.layerW('guard').toFixed(2), pain: +g.pain.value.toFixed(1), bout: g.bout && { state: g.bout.guyState, hits: g.bout.hits, score: g.bout.score }, dist: +flatDist(g.group.position, G.rus.group.position).toFixed(2), eff: +effDist(g).toFixed(3), angle: +facingAngle(g).toFixed(1), strikeable: strikeable(g) })),
      contact: { kick: G.contact.kick.dist, knee: G.contact.knee.dist }, fps: G.fps, dpr };
  },
});

init().catch((e) => { console.error(e); const el = $('#err'); el.textContent = 'Ошибка загрузки: ' + e.message; el.classList.remove('hidden'); });
if (DEBUG) $('#fps').classList.remove('hidden');
