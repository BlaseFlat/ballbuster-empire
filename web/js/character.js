import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _ax = new THREE.Vector3();

// Wrapper around a rigged GLB: animation mixer with defensive clip lookup + crossfades,
// facial morph expressions (driven by anim_meta.json if present, else by game state), blinking.
export class Character {
  constructor(gltf, { name, clone = false, meta = null, prefix = '', idle = 'idle' } = {}) {
    this.name = name;
    this.model = clone ? SkeletonUtils.clone(gltf.scene) : gltf.scene;
    this.group = new THREE.Group();
    this.group.name = name;
    this.group.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = gltf.animations || [];
    this.meta = meta && meta.clips ? meta : null;
    this.fps = (meta && meta.fps) || 30;
    this.prefix = prefix;
    this.idleName = idle;
    this.actions = new Map();
    this.current = null;
    this.currentName = null;
    this.morphMeshes = [];
    this.bones = {};
    this.materials = [];
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.isSkinnedMesh) o.frustumCulled = false;
        if (o.morphTargetDictionary && o.morphTargetInfluences) this.morphMeshes.push(o);
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (!m) return;
          // COLOR_0 on the character GLBs is a region mask, not albedo → never multiply it in.
          if (m.vertexColors) { m.vertexColors = false; m.needsUpdate = true; }
          if (m.transparent && /hair/i.test(m.name)) { m.alphaTest = 0.35; m.depthWrite = true; }
          this.materials.push({ mesh: o, mat: m });
        });
      }
      if (o.isBone) this.bones[o.name] = o;
    });
    this.expr = {};
    this.baseExpr = {};
    this.blinkT = 1 + Math.random() * 3;
    this.blink = 0;
    this.warned = new Set();
    this.speed = 1; // per-character time scale multiplier (hit-stop / slow-mo applied globally)
    // procedural overlays applied on top of the mixer every frame (see applyOverlays)
    this.rest = new Map(); for (const b of Object.values(this.bones)) this.rest.set(b, b.quaternion.clone());
    this.touched = new Set();
    this.layers = {};     // name → { pose: [{bone, q, k}], w, target, speed }
    this.adds = [];       // one-frame additive rotations [{bone, axis (character space), angle}]
    this.glues = [];      // baked root motion: [{action, off (model-local)}], model offset = Σ off · action weight (see main.js bakeRoot)
    this.onLeave = null;  // (prevAction) => void, called before a different clip takes over (root-motion bake hook)
    if (!this.clips.length) console.warn(`[bb] ${name}: GLB has no animation clips — static pose`);
  }

  listClips() { return this.clips.map((c) => c.name); }

  findClip(name) {
    if (!name) return null;
    const strip = (s) => s.toLowerCase().replace(/^(guy|rus)_/, '');
    const tries = [name, this.prefix + name, name.replace(/^(guy|rus)_/, '')];
    for (const n of tries) { const c = this.clips.find((c) => c.name === n); if (c) return c; }
    const low = strip(name);
    return this.clips.find((c) => strip(c.name) === low) || null;
  }

  has(name) { return !!this.findClip(name); }

  clipDuration(name) { const c = this.findClip(name); return c ? c.duration : 0; }

  // anim_meta.json entry for a clip (extra fields of the v3 action clips: speed, root_track, travel, catch …)
  clipMeta(name) {
    const mc = this.meta && this.meta.clips; if (!mc || !name) return null;
    const base = String(name).replace(/^(guy|rus)_/, '');
    return mc[name] || mc[this.prefix + base] || mc[base] || null;
  }
  isPlaying(name) { const c = this.findClip(name); return !!c && this.currentName === c.name; }

  addGlue(action, off) { this.glues.push({ action, off: off.clone() }); this.applyGlues(); }
  applyGlues() {
    if (!this.glues.length) return;
    this.model.position.set(0, 0, 0);
    this.glues = this.glues.filter((g) => {
      const w = g.action.enabled ? g.action.getEffectiveWeight() : 0;
      if (w <= 1e-3) return false;
      this.model.position.addScaledVector(g.off, w);
      return true;
    });
    if (!this.glues.length) this.model.position.set(0, 0, 0);
  }

  getAction(clip) {
    let a = this.actions.get(clip.name);
    if (!a) { a = this.mixer.clipAction(clip); this.actions.set(clip.name, a); }
    return a;
  }

  play(name, { fade = 0.25, loop = true, timeScale = 1, restart = true, startAt = 0 } = {}) {
    let clip = this.findClip(name);
    if (!clip) {
      if (!this.warned.has(name)) { console.warn(`[bb] ${this.name}: clip "${name}" missing → fallback "${this.idleName}"`); this.warned.add(name); }
      clip = this.findClip(this.idleName) || this.clips[0];
      loop = true;
      if (!clip) return null;
      if (this.current && this.currentName === clip.name) return this.current;
    }
    const a = this.getAction(clip);
    if (this.current === a && !restart) { a.timeScale = timeScale; return a; }
    const prev = this.current;
    if (prev && prev !== a && this.onLeave) this.onLeave(prev);
    // replaying a clip whose root motion was already baked: its offset is in the object position now → drop the glue
    if (this.glues.some((g) => g.action === a)) { this.glues = this.glues.filter((g) => g.action !== a); this.applyGlues(); if (!this.glues.length) this.model.position.set(0, 0, 0); }
    this.playT = 0;
    a.reset();
    a.enabled = true;
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.timeScale = timeScale;
    a.time = startAt;
    a.setEffectiveWeight(1);
    if (prev && prev !== a && fade > 0) a.crossFadeFrom(prev, fade, false);
    else if (prev && prev !== a) prev.stop();
    a.play();
    this.current = a;
    this.currentName = clip.name;
    if (this.onPlay) this.onPlay(clip.name);
    return a;
  }

  get time() { return this.current ? this.current.time : 0; }
  get finished() {
    const a = this.current; if (!a) return true;
    return a.loop === THREE.LoopOnce && a.time >= a.getClip().duration - 1e-3;
  }

  boneWorld(name, out = new THREE.Vector3()) {
    const b = this.bones[name];
    if (!b) return this.group.getWorldPosition(out);
    return b.getWorldPosition(out);
  }

  // Multiply-tint a material by name (clones it so clones don't share the tint).
  tint(matName, color) {
    for (const e of this.materials) {
      if (e.mat.name === matName) {
        const m = e.mat.clone();
        m.color = new THREE.Color(color);
        if (Array.isArray(e.mesh.material)) e.mesh.material = e.mesh.material.map((x) => (x === e.mat ? m : x));
        else e.mesh.material = m;
        e.mat = m;
      }
    }
  }

  setExpr(obj) { this.baseExpr = obj || {}; }

  update(dt, realDt = dt) {
    this.playT = (this.playT || 0) + dt;
    for (const b of this.touched) b.quaternion.copy(this.rest.get(b));   // un-do last frame's overlays
    this.mixer.update(dt);
    this.applyGlues();
    this.applyOverlays(realDt);
    this.updateExpr(dt);
  }

  // ---- procedural overlays -------------------------------------------------------------
  // Pose layer: bone rotations sampled from a clip at time t (e.g. hands-over-groin from 'stun'),
  // blended over whatever the mixer plays with a per-bone factor k. Used for the guard.
  samplePose(clipName, t, weights) {
    const clip = this.findClip(clipName); if (!clip) return null;
    const out = [];
    for (const tr of clip.tracks) {
      const m = /^(.+)\.quaternion$/.exec(tr.name); if (!m) continue;
      const bone = this.bones[m[1]]; if (!bone) continue;
      const k = typeof weights === 'function' ? weights(m[1]) : weights[m[1]];
      if (!k) continue;
      const v = tr.createInterpolant().evaluate(Math.min(t, clip.duration));
      out.push({ bone, q: new THREE.Quaternion(v[0], v[1], v[2], v[3]), k });
    }
    return out;
  }
  defineLayer(name, pose, speed = 8) { if (pose) this.layers[name] = { pose, w: 0, target: 0, speed }; return this.layers[name]; }
  setLayer(name, target, speed) { const l = this.layers[name]; if (!l) return; l.target = target; if (speed) l.speed = speed; }
  layerW(name) { const l = this.layers[name]; return l ? l.w : 0; }
  // Additive rotation for this frame, axis given in the character's own space (x = his left, y = up, z = forward).
  addRot(boneName, axis, angle) { const b = this.bones[boneName]; if (b && angle) this.adds.push({ bone: b, axis, angle }); }

  applyOverlays(dt) {
    for (const l of Object.values(this.layers)) {
      l.w += (l.target - l.w) * (1 - Math.exp(-l.speed * dt));
      if (Math.abs(l.w - l.target) < 1e-3) l.w = l.target;
      if (l.w <= 1e-3) continue;
      for (const p of l.pose) { p.bone.quaternion.slerp(p.q, l.w * p.k); this.touched.add(p.bone); }
    }
    if (!this.adds.length) return;
    this.group.updateMatrixWorld(true);
    const gq = this.group.getWorldQuaternion(_q2);
    for (const a of this.adds) {
      const par = a.bone.parent;
      _ax.copy(a.axis).applyQuaternion(gq);                       // character space → world
      par.getWorldQuaternion(_q).invert(); _ax.applyQuaternion(_q).normalize();   // → parent space
      a.bone.quaternion.premultiply(_q.setFromAxisAngle(_ax, a.angle));
      a.bone.updateMatrixWorld(true);
      this.touched.add(a.bone);
    }
    this.adds.length = 0;
  }

  updateExpr(dt) {
    if (!this.morphMeshes.length) return;
    // Clips that key the morph weights themselves (final GLBs) drive the face via the mixer;
    // we only layer blinking on top.
    const clip = this.current && this.current.getClip();
    if (clip && clip.userData_hasMorph === undefined) clip.userData_hasMorph = clip.tracks.some((t) => t.name.endsWith('.morphTargetInfluences'));
    const clipDrives = clip && clip.userData_hasMorph;
    let target = this.baseExpr;
    const mc = this.meta && this.meta.clips;
    const cn = this.currentName;
    const m = !clipDrives && mc && cn && (mc[cn] || mc[this.prefix + cn] || mc[cn.replace(/^(guy|rus)_/, '')]);
    if (m && m.expr && m.expr.frames && m.expr.frames.length) {
      const f = (this.current ? this.current.time : 0) * this.fps;
      const fr = m.expr.frames; let i = 0;
      while (i < fr.length - 2 && f > fr[i + 1]) i++;
      const t = THREE.MathUtils.clamp((f - fr[i]) / Math.max(1, fr[i + 1] - fr[i]), 0, 1);
      target = {};
      m.expr.names.forEach((n, k) => {
        const a = m.expr.vals[i][k], b = (m.expr.vals[i + 1] || m.expr.vals[i])[k];
        target[n] = a + (b - a) * t;
      });
    }
    // blink
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 0.16; this.blinkT = 2 + Math.random() * 3.5; }
    let blinkVal = 0;
    if (this.blink > 0) { this.blink -= dt; blinkVal = 1 - Math.abs(this.blink - 0.08) / 0.08; }
    const k = 1 - Math.exp(-dt * 14);
    for (const mesh of this.morphMeshes) {
      const dict = mesh.morphTargetDictionary, inf = mesh.morphTargetInfluences;
      for (const key in dict) {
        const idx = dict[key];
        if (clipDrives) { if (key === 'blink') inf[idx] = Math.max(inf[idx], blinkVal); continue; }
        const tv = key === 'blink' ? Math.max(blinkVal, target.blink || 0) : (target[key] || 0);
        inf[idx] = key === 'blink' ? tv : inf[idx] + (tv - inf[idx]) * k;
      }
    }
  }
}
