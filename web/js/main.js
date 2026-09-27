import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CFG, GUYS, STATE_RU, DEBUG, V } from '@bb/config';
import { Progress, loadGLB, loadTex, loadHDR, loadJSON } from '@bb/loader';
import { buildGym, collide } from '@bb/gym';
import { Character } from '@bb/character';
import { FX } from '@bb/fx';
import { Bout, GUY_STATES } from '@bb/rules';
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
  keys: {}, rus: null, guys: [], gym: null, fx: null, near: null, fight: null, contact: null,
  cam: { yaw: 0, pitch: 0.28, dist: 3.4, side: 1, pos: new THREE.Vector3(), look: new THREE.Vector3() },
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
  for (const def of GUYS) {
    const c = new Character(guyG, { name: def.name, clone: true, meta: A.meta, prefix: 'guy_', idle: 'guy_idle' });
    c.tint('M_shirt', def.shirt);
    c.group.position.set(...def.pos); c.yaw = def.rot; c.group.rotation.y = def.rot;
    scene.add(c.group);
    const a = c.play('guy_idle', { fade: 0 });
    if (a) a.time = Math.random() * a.getClip().duration;
    c.setExpr({ smug: 0.6 });
    c.def = def; c.state = 'idle'; c.beaten = false; c.queue = [];
    c.home = new THREE.Vector3(...def.pos);
    const lab = document.createElement('div'); lab.className = 'npc-label'; lab.textContent = `${def.name}, ${def.age}`;
    $('#labels').appendChild(lab); c.label = lab;
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
addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && !e.repeat) { G.audio.toggleMute(); G.fx && G.fx.popup && G.fx.popup(G.audio.muted ? 'Звук выкл.' : 'Звук вкл.', { x: innerWidth - 90, y: innerHeight - 90 }, 'small'); }
  if (e.repeat && !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return;
  G.keys[e.code] = true;
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.code === 'Backquote' || e.code === 'F2') $('#fps').classList.toggle('hidden');
  if (G.mode === 'menu' && e.code === 'Enter') startGame();
  else if (G.mode === 'explore' && (e.code === 'KeyE' || e.code === 'Enter')) tryInteract();
  else if (G.mode === 'fight') {
    if (e.code === 'KeyJ' || e.code === 'Digit1' || e.code === 'Numpad1') attack('kick');
    else if (e.code === 'KeyK' || e.code === 'Digit2' || e.code === 'Numpad2') attack('knee');
    else if (e.code === 'Escape') leaveFight();
    else if (e.code === 'KeyC') G.cam.side *= -1;
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
  drag.x = e.clientX; drag.y = e.clientY;
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

// ---------------------------------------------------------------- exploration
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

function updateExplore(dt) {
  const k = G.keys, rus = G.rus;
  let ix = 0, iz = 0;
  if (k.KeyW || k.ArrowUp) iz += 1; if (k.KeyS || k.ArrowDown) iz -= 1;
  if (k.KeyA || k.ArrowLeft) ix -= 1; if (k.KeyD || k.ArrowRight) ix += 1;
  const yaw = G.cam.yaw;
  const fwd = _v1.set(-Math.sin(yaw), 0, -Math.cos(yaw)), right = _v2.set(Math.cos(yaw), 0, -Math.sin(yaw));
  const dir = _v3.set(0, 0, 0).addScaledVector(fwd, iz).addScaledVector(right, ix);
  const moving = dir.lengthSq() > 0.01;
  if (moving) dir.normalize();
  G.vel.x = damp(G.vel.x, moving ? dir.x * CFG.walkSpeed : 0, 10, dt);
  G.vel.z = damp(G.vel.z, moving ? dir.z * CFG.walkSpeed : 0, 10, dt);
  const speed = Math.hypot(G.vel.x, G.vel.z);
  const p = rus.group.position;
  p.x += G.vel.x * dt; p.z += G.vel.z * dt;
  const circles = G.guys.map((g) => ({ x: g.group.position.x, z: g.group.position.z, r: g.beaten ? 0.55 : 0.32 }));
  collide(p, 0.28, G.gym, circles);
  if (moving) { rus.yaw = angDamp(rus.yaw, Math.atan2(dir.x, dir.z), CFG.turnSpeed, dt); rus.group.rotation.y = rus.yaw; }
  if (speed > 0.25) {
    const a = rus.play('rus_walk', { fade: 0.22, restart: false, loop: true });
    if (a && rus.currentName && /walk/.test(rus.currentName)) a.timeScale = THREE.MathUtils.clamp(speed / CFG.walkClipSpeed, 0.6, 2.4);
  } else rus.play('rus_idle', { fade: 0.3, restart: false, loop: true });

  // guys: idle, turn toward Rusana when close
  let best = null, bestD = 1e9;
  for (const g of G.guys) {
    const d = g.group.position.distanceTo(p);
    if (!g.beaten && d < 4.5) { g.yaw = angDamp(g.yaw, Math.atan2(p.x - g.group.position.x, p.z - g.group.position.z), 2.5, dt); g.group.rotation.y = g.yaw; }
    if (!g.beaten && d < CFG.interactDist && d < bestD) { best = g; bestD = d; }
  }
  G.near = best;
  const pr = $('#prompt');
  if (best) { pr.innerHTML = `E — подойти<small>${best.def.name}, ${best.def.age}</small>`; pr.classList.remove('hidden'); }
  else pr.classList.add('hidden');
}

function updateExploreCamera(dt) {
  const c = G.cam, p = G.rus.group.position;
  const target = _v1.set(p.x, 1.25, p.z);
  const off = _v2.set(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch)).multiplyScalar(c.dist);
  const want = _v3.copy(target).add(off);
  const B = G.gym.bounds;
  want.x = THREE.MathUtils.clamp(want.x, B.x0 - 0.1, B.x1 + 0.1); want.z = THREE.MathUtils.clamp(want.z, B.z0 - 0.1, B.z1 + 0.1); want.y = THREE.MathUtils.clamp(want.y, 0.4, 5.2);
  c.pos.lerp(want, 1 - Math.exp(-8 * dt));
  c.look.lerp(target, 1 - Math.exp(-10 * dt));
}

function tryInteract() { if (G.near) enterFight(G.near); }

// ---------------------------------------------------------------- fight
function fightFrame(f) {
  // f.dir: unit vector Rusana → guy (xz). Positions: guy stays, Rusana placed at dist.
  const gp = f.guy.group.position;
  const right = new THREE.Vector3(f.dir.z, 0, -f.dir.x);
  return { gp, right };
}

function enterFight(guy) {
  const rus = G.rus;
  const dir = new THREE.Vector3().subVectors(guy.group.position, rus.group.position).setY(0);
  if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
  dir.normalize();
  guy.timeline = guy.timeline || []; guy.queue = guy.queue || [];
  const f = G.fight = {
    guy, dir, bout: new Bout(guy.def), attack: null, queued: null, ended: false, snapDur: 0.2, stepping: false,
    dist: G.contact.kick.dist, side: G.contact.kick.side || 0,
    rusFrom: rus.group.position.clone(), snapT: 0, victoryAt: 0,
  };
  // guy faces Rusana; if there's no room behind Rusana, the axis stays as is (room is large)
  guy.yaw = Math.atan2(-dir.x, -dir.z); guy.group.rotation.y = guy.yaw;
  rus.yaw = Math.atan2(dir.x, dir.z); rus.group.rotation.y = rus.yaw;
  rus.queue = [];
  if (rus.has('rus_approach')) { rus.play('rus_approach', { fade: 0.15, loop: false }); rus.queue.push({ name: 'rus_idle', loop: true, fade: 0.2 }); }
  else rus.play('rus_idle', { fade: 0.2 });
  guy.queue = []; guy.timeline = []; guy.play('guy_idle', { fade: 0.2, restart: false });
  G.mode = 'fight';
  G.vel.set(0, 0, 0);
  // choose camera side with more room
  G.cam.side = pickCamSide(f);
  UI.show('#hud-explore', false); UI.show('#hud-fight', true);
  UI.text('#fight-name', `${guy.def.name}, ${guy.def.age}`);
  UI.text('#f-log', guy.def.taunt);
  updateFightHud();
  if (talk(0.75)) { G.audio.rus('rus_start', { delay: 0.45 }); f.lastLine = G.realTime; }
  log('fight start', guy.def.name);
}

function combatCamPose(f, side, out, look) {
  const rp = G.rus.group.position, gp = f.guy.group.position;
  const mid = _v1.copy(rp).add(gp).multiplyScalar(0.5);
  const right = _v2.set(f.dir.z, 0, -f.dir.x).multiplyScalar(side);
  const a = THREE.MathUtils.degToRad(20);
  // side view rotated ~20° toward the guy's front: groin line + her strike leg read clearly, her face in 3/4 profile
  const d = _v3.copy(right).multiplyScalar(Math.cos(a)).addScaledVector(f.dir, -Math.sin(a)).normalize();
  out.copy(mid).addScaledVector(d, 3.35); out.y = 1.08;
  look.copy(mid); look.y = 0.9;
  return out;
}

function pickCamSide(f) {
  const B = G.gym.bounds, o = new THREE.Vector3(), l = new THREE.Vector3();
  let bestS = 1, bestScore = -1e9;
  for (const s of [1, -1]) {
    combatCamPose(f, s, o, l);
    const m = Math.min(o.x - B.x0, B.x1 - o.x, o.z - B.z0, B.z1 - o.z);
    let score = m;
    for (const b of G.gym.colliders) if (o.x > b.x0 - 0.3 && o.x < b.x1 + 0.3 && o.z > b.z0 - 0.3 && o.z < b.z1 + 0.3) score -= 5;
    if (score > bestScore) { bestScore = score; bestS = s; }
  }
  return bestS;
}

const STANDING_CLIPS = new Set(['idle', 'hurt', 'stun']);
function guyReady(g) {
  return !g.timeline.length && !g.queue.length && STANDING_CLIPS.has(String(g.currentName).replace(/^guy_/, ''));
}

function attack(move) {
  const f = G.fight; if (!f || f.ended) return;
  const rus = G.rus;
  if (f.attack) {
    const ci = f.attack.ci;
    const canCancel = f.attack.contactDone && rus.time >= ci.time + CFG.cancelAfterContact;
    if (!canCancel) { f.queued = move; return; }
  }
  // strikes are authored against a standing guy: wait until he has recovered (hurt / idle)
  if (!guyReady(f.guy) || f.stepping) { f.queued = move; UI.text('#f-log', 'Ждёт, пока он выпрямится…'); return; }
  const ci = G.contact[move];
  const clean = G.forceClean !== undefined ? G.forceClean : Math.random() < CFG.cleanChance[move];
  const finishing = clean && f.bout.nextState === 'floor';   // floor → he taps out → victory
  f.attack = { move, ci, clean, finishing, contactDone: false, t0: G.time };
  if (finishing && talk(0.85)) { G.audio.rus('rus_fin'); f.lastLine = G.realTime; }
  f.queued = null;
  f.dist = ci.dist; f.side = ci.side || 0; f.snapT = 0; f.snapDur = 0.15; f.rusFrom = rus.group.position.clone();
  rus.queue = [];
  rus.play(ci.clip, { fade: ci.fadeIn ?? 0.1, loop: false });
  // guy sync: contact was fit against 'idle' (kick) / 'clinched' started together with rus_knee (knee)
  const g = f.guy; g.queue = []; g.timeline = [];
  const pre = (ci.pre || []).find((x) => !/idle/.test(x.name) && g.has(x.name));
  if (pre) g.play(pre.name, { fade: 0.1, loop: false });
  else if (move === 'knee' && g.has('clinched')) g.play('clinched', { fade: 0.1, loop: false });
  else g.play('guy_idle', { fade: 0.12 });
  UI.text('#f-log', move === 'kick' ? 'Ап-кик снизу…' : 'Клинч — колено…');
}

function guyClip(state) {
  return { idle: ['guy_idle', true], flinch: ['guy_hurt', true], double_over: ['guy_double_over', false], knees: ['guy_knees', false], floor: ['guy_floor', true], tap: ['guy_tap', false] }[state];
}

// Reaction after contact. Timeline times are seconds after contact in *real* time (hit-stop included):
//   0–0.06 freeze both · flinch / flinch_knee · double_over at clip time 0.40 (+hit-stop).
// Then a finish-driven queue: double_over staggers him 0.30 m back → baked into his root (no pop),
// knees / getup / floor / tap are authored in place from that spot, and he always recovers to a
// standing 'hurt' loop before the next strike so it lines up. Floor = fight over (he taps out).
function guyReact(guy, prev, next, clean, move, ci) {
  guy.queue = []; guy.timeline = []; guy.tl = 0;
  const hs = clean ? (ci.hitStop ?? CFG.hitStop) : 0;
  const flinch = move === 'knee' && guy.has('flinch_knee') ? 'flinch_knee' : 'guy_flinch';
  const at = (t, name, loop = false, fade = 0.05) => guy.timeline.push({ at: t + hs, name, loop, fade });
  const q = (o) => guy.queue.push(o);
  const standClip = guy.has('guy_hurt') ? 'guy_hurt' : 'guy_idle';
  let stateAt = 0.4;
  if (ci.seq) { const d = ci.seq.find((x) => /double_over/.test(x.name)); if (d) stateAt = d.at; }
  if (!clean) {
    at(0, flinch, false, 0.05);
    at(Math.min(stateAt, 0.4), prev === 'idle' ? 'guy_idle' : standClip, true, 0.25);
    return;
  }
  at(0, flinch, false, 0.04);
  if (next === 'flinch') {
    at(stateAt, standClip, true, 0.2);
  } else {
    at(stateAt, 'guy_double_over', false, 0.05);     // flinch last frame == double_over f0
    q({ bake: true });
    if (next === 'double_over') {
      q({ name: standClip, loop: true, fade: 0.35, hold: 0.3 });
    } else if (next === 'knees') {
      q({ name: 'guy_knees', loop: false, fade: 0.1 });
      q({ name: 'guy_getup', loop: false, fade: 0.15, hold: 0.45 });
      q({ name: standClip, loop: true, fade: 0.25 });
    } else if (next === 'floor' || next === 'tap') {
      q({ name: 'guy_knees', loop: false, fade: 0.1 });
      q({ name: 'guy_floor', loop: true, fade: 0.25, hold: 0.15 });
      q({ name: 'guy_tap', loop: false, fade: 0.2, hold: 0.7, onStart: () => tapOut() });
      q({ name: 'guy_floor', loop: true, fade: 0.3 });
    }
  }
  guy.state = next;
}

// root-motion bake for double_over: move the object back along HIS facing and compensate the model
// offset by the double_over action weight, so the pose never pops while it crossfades out.
function bakeStagger(ch) {
  const a = ch.current; if (!a || !/double_over/.test(ch.currentName)) return;
  const d = CFG.staggerBack ?? 0.3;
  ch.group.position.x -= Math.sin(ch.yaw) * d; ch.group.position.z -= Math.cos(ch.yaw) * d;
  ch.stagger = { action: a, d };
  ch.model.position.z = d;
  const f = G.fight;
  if (f && f.guy === ch && G.mode === 'fight') {       // Rusana closes the distance
    f.rusFrom = G.rus.group.position.clone(); f.snapT = 0; f.snapDur = 0.5; f.stepping = true;
    if (!f.attack) { const w = G.rus.play('rus_walk', { fade: 0.2, loop: true }); if (w && /walk/.test(G.rus.currentName)) w.timeScale = 0.75; }
  }
}

function tapOut() {
  const f = G.fight; if (!f) return;
  f.bout.autoTap(); updateFightHud();
  UI.text('#f-log', `${f.guy.def.name} тапает — сдаётся!`);
  f.victoryAt = G.realTime + 1.4;
}

function strikePoint(move, out) {
  // groin: just below the guy's pelvis bone, on his front side; nudged toward Rusana's striking bone
  const rus = G.rus, guy = G.fight.guy;
  guy.boneWorld('pelvis', out); out.y -= 0.09; out.addScaledVector(G.fight.dir, -0.08);
  const bone = move === 'kick' ? (rus.bones.ball_r ? 'ball_r' : 'foot_r') : 'calf_r';
  if (rus.bones[bone]) out.lerp(rus.boneWorld(bone, new THREE.Vector3()), 0.25);
  return out;
}

function toScreen(p) {
  const v = p.clone().project(camera);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
}

function onContact(f) {
  const a = f.attack; a.contactDone = true;
  const res = f.bout.resolve(a.clean);
  const fin = res.clean && (a.finishing || res.finished);
  f.lastHit = { clean: res.clean, finishing: fin, move: a.move, next: res.next };
  G.audio.impact(res.clean ? (fin ? 'fin' : a.move) : 'thigh');
  if (res.clean && !fin && G.realTime - (f.lastLine ?? -99) > 5 && talk(0.4)) { G.audio.rus('rus_hit', { delay: 1.05 }); f.lastLine = G.realTime; }
  const p = strikePoint(a.move, new THREE.Vector3());
  const scr = toScreen(p);
  if (res.clean) {
    G.hitStopUntil = G.realTime + (a.ci.hitStop ?? CFG.hitStop);
    G.fx.impact(p, a.finishing ? 1.6 : 1.0);
    G.fx.popup(a.finishing || res.finished ? 'ДОБИВАНИЕ!' : 'ЧИСТЫЙ!', { x: scr.x, y: scr.y - 40 });
    G.fx.popup(`+${res.gained}`, { x: scr.x + 70, y: scr.y + 10 }, 'small');
    if (res.comboMult > 1) G.fx.popup(`КОМБО ×${res.comboMult}`, { x: scr.x - 90, y: scr.y + 30 }, 'small');
    UI.text('#f-log', `Чистый! ${STATE_RU[res.prev]} → ${STATE_RU[res.next]}` + (res.comboMult > 1 ? ` · комбо ×${res.comboMult}` : '') + (res.painMult > 1 ? ` · отёк ×${res.painMult}` : ''));
  } else {
    G.fx.smallHit(p);
    G.fx.popup('Бедро! +0', { x: scr.x, y: scr.y - 30 }, 'miss');
    UI.text('#f-log', 'Мимо — попала в бедро. +0 Hit.');
  }
  guyReact(f.guy, res.prev, res.next, res.clean, a.move, a.ci);
  updateFightHud();
  if (res.finished) { f.ended = true; f.victoryAt = G.realTime + 1.1; }
  else if (res.clean && res.next === 'floor') f.ended = true;     // no more strikes; tapOut() → victory
}

function updateFight(dt) {
  const f = G.fight, rus = G.rus;
  // combo clock only runs while the guy is strikeable (his scripted recovery is not a player pause)
  if ((guyReady(f.guy) || f.attack) && f.bout.tick(dt)) updateFightHud();
  // position Rusana relative to the guy (snap/tween)
  f.snapT = Math.min(1, f.snapT + dt / (f.snapDur || 0.15));
  if (f.stepping && f.snapT >= 1) { f.stepping = false; if (!f.attack) rus.play('rus_idle', { fade: 0.25 }); }
  const gp = f.guy.group.position;
  const right = _v2.set(f.dir.z, 0, -f.dir.x);
  const want = _v1.copy(gp).addScaledVector(f.dir, -f.dist).addScaledVector(right, -f.side);
  const e = 1 - Math.pow(1 - f.snapT, 3);
  rus.group.position.lerpVectors(f.rusFrom, want, e);
  const a = f.attack;
  if (a) {
    const t = rus.time;
    if (a.finishing && !a.slow && t >= a.ci.time - 0.28) { a.slow = true; G.slowUntil = G.realTime + 1.0; G.slowScale = 0.3; }
    if (!a.contactDone && t >= a.ci.time) onContact(f);
    if (a.contactDone && f.queued && !f.ended && !f.stepping && guyReady(f.guy) && t >= a.ci.time + CFG.cancelAfterContact) { const q = f.queued; f.queued = null; attack(q); }
    else if (rus.finished) {
      f.attack = null;
      if (!f.stepping) rus.play('rus_idle', { fade: 0.3 });
    }
  }
  if (!f.attack && f.queued && !f.ended && guyReady(f.guy) && !f.stepping) { const q = f.queued; f.queued = null; attack(q); }
  if (f.ended && f.victoryAt && G.realTime >= f.victoryAt) { f.victoryAt = 0; startVictory(); }
}

function updateFightHud() {
  const f = G.fight; if (!f) return;
  const b = f.bout;
  UI.text('#f-hits', String(b.hits));
  UI.text('#f-combo', `×${b.comboMult}`);
  UI.text('#f-swell', b.swell >= 1 ? `×1.25 (${b.swell})` : '—');
  UI.text('#f-score', String(b.score));
  UI.text('#f-state', `Состояние: ${STATE_RU[b.guyState]}`);
  const tr = $('#state-track'); tr.innerHTML = '';
  const idx = GUY_STATES.indexOf(b.guyState);
  GUY_STATES.forEach((s, i) => { const el = document.createElement('span'); el.className = 'st' + (i < idx ? ' done' : i === idx ? ' cur' : ''); el.textContent = STATE_RU[s]; tr.appendChild(el); });
}

function updateCombatCamera(dt) {
  const f = G.fight; const c = G.cam;
  const pos = new THREE.Vector3(), look = new THREE.Vector3();
  combatCamPose(f, c.side, pos, look);
  const k = G.mode === 'fight' && f.snapT < 1 ? 5 : 6;
  c.pos.lerp(pos, 1 - Math.exp(-k * dt));
  c.look.lerp(look, 1 - Math.exp(-k * dt));
}

function leaveFight() {
  const f = G.fight; if (!f || f.ended) return;
  f.guy.queue = []; f.guy.timeline = []; f.guy.state = 'idle'; f.guy.stagger = null; f.guy.model.position.z = 0; f.guy.play('guy_idle', { fade: 0.4 }); f.guy.setExpr({ smug: 0.6 });
  G.rus.play('rus_idle', { fade: 0.3 });
  // step back a little
  G.rus.group.position.addScaledVector(f.dir, -0.4);
  G.fight = null; G.mode = 'explore';
  G.cam.yaw = G.rus.yaw + Math.PI;
  UI.show('#hud-fight', false); UI.show('#hud-explore', true);
}

// ---------------------------------------------------------------- victory
function startVictory() {
  const f = G.fight;
  const gain = f.bout.repGain();
  G.rep += gain;
  f.guy.beaten = true;
  G.rus.play('rus_victory', { fade: 0.35, loop: false });
  G.rus.setExpr({ smirk: 0.9 });
  G.mode = 'victory'; G.victoryT = 0;
  UI.show('#hud-fight', false);
  UI.text('#victory-text', f.guy.def.win);
  UI.text('#victory-stats', `Удары: ${f.bout.hits} · Очки: ${f.bout.score} · Репутация +${gain} (всего ${G.rep})`);
  G.victoryCardAt = G.realTime + 0.9;
  G.audio.rus('rus_vic', { delay: 0.9 });
  UI.text('#rep-display', `Репутация: ${G.rep}`);
}

function updateVictoryCamera(dt) {
  const f = G.fight; G.victoryT += dt;
  const rp = G.rus.group.position;
  const ang = G.rus.yaw + 0.75 * G.cam.side + Math.sin(G.victoryT * 0.25) * 0.25;
  const pos = _v1.set(rp.x + Math.sin(ang) * 2.5, 1.35, rp.z + Math.cos(ang) * 2.5);
  const look = _v2.set(rp.x, 1.05, rp.z).addScaledVector(f.dir, 0.25);
  G.cam.pos.lerp(pos, 1 - Math.exp(-2.5 * dt)); G.cam.look.lerp(look, 1 - Math.exp(-3 * dt));
}

function continueAfterVictory() {
  if (G.mode !== 'victory') return;
  UI.show('#victory', false); UI.show('#hud-explore', true);
  const f = G.fight;
  G.rus.play('rus_idle', { fade: 0.4 }); G.rus.setExpr({ cold: 0.6 });
  G.rus.group.position.addScaledVector(f.dir, -0.35);
  f.guy.label.classList.add('beaten'); f.guy.label.textContent = `${f.guy.def.name} — повержен`;
  G.fight = null; G.mode = 'explore';
  G.cam.yaw = G.rus.yaw + Math.PI;
}

// ---------------------------------------------------------------- menu camera
function updateMenuCamera(dt) {
  const t = G.time * 0.05;
  const pos = _v1.set(Math.sin(t) * 7.5, 2.4 + Math.sin(t * 2) * 0.3, 1.5 + Math.cos(t) * 4.5);
  G.cam.pos.lerp(pos, 1 - Math.exp(-2 * dt));
  G.cam.look.lerp(_v2.set(0, 1.2, -1), 1 - Math.exp(-2 * dt));
}

// ---------------------------------------------------------------- labels
function updateLabels() {
  const show = G.mode === 'explore';
  for (const g of G.guys) {
    if (!show) { g.label.style.display = 'none'; continue; }
    const p = g.group.position.clone(); p.y += g.beaten ? 0.6 : 2.05;
    const v = p.clone().project(camera);
    const dist = p.distanceTo(camera.position);
    if (v.z > 1 || dist > 14) { g.label.style.display = 'none'; continue; }
    g.label.style.display = 'block';
    g.label.style.left = ((v.x * 0.5 + 0.5) * innerWidth).toFixed(1) + 'px';
    g.label.style.top = ((-v.y * 0.5 + 0.5) * innerHeight).toFixed(1) + 'px';
    g.label.style.opacity = String(THREE.MathUtils.clamp(1.4 - dist / 10, 0.3, 1));
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
  const f = G.fight && G.fight.guy === g ? G.fight : null;
  const hit = f && f.lastHit;
  const r = () => vr * (0.97 + Math.random() * 0.06);
  if (/^flinch/.test(n)) {
    if (!hit) return;
    if (hit.finishing) A.voice(key, 'v_scream', { delay: 0.05, rate: r() * 0.98, gain: 1 });
    else if (hit.clean) A.voice(key, 'v_flinch', { delay: 0.03 + Math.random() * 0.05, rate: r(), gain: 0.95 });
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
  const walking = /walk/.test(rus.currentName || '') && (G.mode === 'explore' || (G.mode === 'fight' && G.fight && G.fight.stepping));
  const st = rus.steps || (rus.steps = { l: { armed: false, min: 0.2 }, r: { armed: false, min: 0.2 } });
  const speed = G.mode === 'explore' ? Math.hypot(G.vel.x, G.vel.z) : 0.8;
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
  G.time += realDt;

  if (G.mode === 'explore') { updateExplore(dt || realDt * 0); updateExploreCamera(realDt); }
  else if (G.mode === 'fight') { updateFight(dt); updateCombatCamera(realDt); }
  else if (G.mode === 'victory') updateVictoryCamera(realDt);
  else if (G.mode === 'menu') updateMenuCamera(realDt);

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
        if ((looping || ch.finished) && since >= (q.hold || 0)) { ch.queue.shift(); ch.play(q.name, { fade: q.fade, loop: q.loop }); if (q.onStart) q.onStart(); }
      }
    }
    if (ch.stagger) {   // keep the baked double_over offset glued to the action weight
      const w = ch.stagger.action.enabled ? ch.stagger.action.getEffectiveWeight() : 0;
      ch.model.position.z = ch.stagger.d * w;
      if (w <= 1e-3) { ch.stagger = null; ch.model.position.z = 0; }
    }
    if (ch.blob) {
      const pv = ch.bones.pelvis ? ch.boneWorld('pelvis', _v1) : ch.group.position;
      const lying = ch.state === 'floor' || ch.state === 'tap' || ch.beaten;
      ch.blob.position.set(pv.x, 0.036, pv.z);
      ch.blob.scale.setScalar(lying ? 1.9 : 0.95);
    }
  }
  updateFootsteps(realDt);
  G.audio.setBus('music', G.mode === 'fight' || G.mode === 'victory' ? 0.11 : 0.2, 1.2);
  if (G.victoryCardAt && G.realTime >= G.victoryCardAt) { G.victoryCardAt = 0; if (G.mode === 'victory') UI.show('#victory', true); }
  G.gym.update(G.time, dt);
  G.fx.update(dt, realDt);

  camera.position.copy(G.cam.pos).add(G.fx.shakeOffset);
  camera.lookAt(G.cam.look);
  updateLabels();
  if (G.onFrame) G.onFrame();
  renderer.info.reset();
  composer.render(realDt);
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

// test / automation hooks
Object.assign(G, {
  startGame, enterFight, attack, leaveFight, continueAfterVictory,
  goTo(i) { const g = G.guys[i]; const p = g.group.position; const d = new THREE.Vector3(Math.sin(g.yaw), 0, Math.cos(g.yaw)); G.rus.group.position.copy(p).addScaledVector(d, 1.3); G.rus.yaw = Math.atan2(-d.x, -d.z); G.rus.group.rotation.y = G.rus.yaw; G.cam.yaw = G.rus.yaw + Math.PI; },
  info() { return { mode: G.mode, rep: G.rep, near: G.near && G.near.def.name, fight: G.fight && { state: G.fight.bout.guyState, hits: G.fight.bout.hits, score: G.fight.bout.score }, assets: G.assetsInfo, contact: G.contact, fps: G.fps, dpr }; },
});

init().catch((e) => { console.error(e); const el = $('#err'); el.textContent = 'Ошибка загрузки: ' + e.message; el.classList.remove('hidden'); });
if (DEBUG) $('#fps').classList.remove('hidden');
