// Guy AI (stage 1 «умный парень»): personality-driven defenses with readable telegraphs.
//   guard  — hands over the groin (pose layer sampled from 'stun'), blocks while raised ≥ COMBAT.guardBlock
//   turn   — turns the hip away (facing offset) → strikes land at an angle → glancing
//   step   — quick step back (evade) → distance error at contact
//   flee   — runs off (procedural gait), then stands winded = opening
//   catch  — reads a kick (more likely when she spams) and catches the leg → Rusana staggers
//   feint  — fake guard, drops it and taunts = opening
//   taunt  — says a line, smug = opening
//   shove  — (злой) wind-up (opening!) then shoves Rusana back
// The brain only acts while the guy is standing and not in a hit reaction; main.js owns reactions.
import * as THREE from 'three';
import { TRAITS, COMBAT } from '@bb/config';

const TAU = Math.PI * 2;
const wrap = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const angDamp = (a, b, k, dt) => a + wrap(b - a) * (1 - Math.exp(-k * dt));
const rnd = (a, b) => a + Math.random() * (b - a);
const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);

export const MODE_RU = { guard: 'закрылся', turn: 'отвернулся', step: 'отскок', flee: 'убегает', winded: 'выдохся', feint: 'финт',
  taunt: 'дразнит', windup: 'замахивается!', shove: 'толкает!', catch: 'ловит ногу', home: '' };

export class Brain {
  constructor(guy, world) {
    this.g = guy; this.w = world;
    this.tr = TRAITS[guy.def.trait] || TRAITS.cocky;
    this.mode = 'idle'; this.t = 0; this.dur = 0;
    this.next = rnd(0.4, 1.0);            // decision timer
    this.turnOff = 0; this.turnWant = 0;
    this.alert = 0; this.fear = 0;
    this.openUntil = 0; this.openWhy = '';
    this.catching = false;
    this.vel = new THREE.Vector3(); this.speed = 0;
    this.gait = 0; this.gaitAmp = 0;
    this.pose = { shove: 0, windup: 0 };   // procedural arm poses 0..1
    this.react = null;                   // pending reaction to an incoming strike
    this.lastSay = -99;
  }

  get guard() { return this.g.layerW('guard'); }
  isOpen(now) { return now < this.openUntil ? this.openWhy : (this.alert < 0.35 ? 'unaware' : ''); }
  open(dur, why) { this.openUntil = this.w.now() + dur; this.openWhy = why; }
  status() { return MODE_RU[this.mode] || ''; }

  say(text, p = 1) {
    const now = this.w.now();
    if (now - this.lastSay < 2.2 || Math.random() > p) return;
    this.lastSay = now; this.w.say(this.g, text);
  }
  line() { const L = this.tr.lines; return L[(Math.random() * L.length) | 0]; }

  setMode(m, dur = 0) {
    this.mode = m; this.t = 0; this.dur = dur;
    const g = this.g;
    if (m !== 'guard' && m !== 'catch' && m !== 'feint') g.setLayer('guard', 0, 5);
    if (m !== 'turn') this.turnWant = 0;
    if (m !== 'catch') this.catching = false;
  }

  // strike incoming (called when Rusana starts a strike / dash at him). eta = seconds to contact.
  onStrike(move, eta, { spam = false, clinch = false } = {}) {
    if (!this.w.free(this.g) || this.mode === 'windup' || this.mode === 'shove') return;
    const tr = this.tr;
    let p = tr.react * (0.35 + 0.65 * this.alert) * (spam ? 1.8 : 1) + this.fear * 0.15;
    if (Math.random() > Math.min(0.9, p)) return;
    if (clinch) {   // knee: she already has him by the neck — the only defense left is dropping the hands
      if (Math.random() < 0.6) { this.setMode('guard', 0.9); this.g.setLayer('guard', 1, 4.5); }
      return;
    }
    const delay = 0.14 + Math.random() * 0.06;
    const opts = [];
    if (move === 'kick') opts.push(['catch', tr.grab * (spam ? 3 : 0.7)]);
    opts.push(['guard', tr.guard + this.fear * 0.3], ['step', tr.step], ['turn', tr.turn]);
    this.react = { at: this.w.now() + delay, what: pick(opts) };
  }

  // after his hit reaction finished (grade of the strike that hit him)
  afterHit(grade, painFrac) {
    const tr = this.tr;
    if (grade === 'perfect' || grade === 'clean') this.fear = Math.min(1, this.fear + 0.25);
    this.alert = 1;
    this.next = rnd(0.25, 0.6);
    const d = this.w.dist(this.g);
    if (tr.flee > 0 && Math.random() < tr.flee * (0.6 + painFrac)) { this.startFlee(); return; }
    if (tr.shove > 0.3 && d < 1.4 && Math.random() < tr.shove) { this.setMode('windup', 0.5); this.open(0.5, 'windup'); this.say(this.line(), 0.8); return; }
    if (grade === 'miss' || grade === 'block' || grade === 'caught' || grade === 'glance') { if (Math.random() < tr.taunt + 0.2) this.say(this.line(), 1); }
    else if (tr.tough > 1.3 && Math.random() < 0.5) this.say(this.line(), 1);
  }

  startFlee() {
    const g = this.g, rp = this.w.rusPos(), p = g.group.position;
    const away = Math.atan2(p.x - rp.x, p.z - rp.z) + rnd(-0.7, 0.7);
    const len = rnd(3, 5);
    const dest = new THREE.Vector3(p.x + Math.sin(away) * len, 0, p.z + Math.cos(away) * len);
    this.w.clampPoint(dest);
    this.dest = dest; this.setMode('flee', rnd(1.6, 2.6));
    this.say(this.line(), 0.7);
  }

  update(dt, now) {
    const g = this.g, w = this.w, tr = this.tr;
    const free = w.free(g);
    const p = g.group.position, rp = w.rusPos();
    const d = Math.hypot(rp.x - p.x, rp.z - p.z);
    const faceYaw = Math.atan2(rp.x - p.x, rp.z - p.z);
    let move = 0, moveDir = 0;               // speed (m/s) and heading this frame

    if (!free) {                             // hit reaction / beaten: the brain lets go
      if (this.mode !== 'idle') this.setMode('idle');
      this.react = null; this.turnOff = 0; this.pose.shove = this.pose.windup = 0; this.speed = 0;
      g.setLayer('guard', 0, 6);
      return;
    }
    // perception: alert when she is near and roughly in front of him
    const inView = Math.abs(wrap(faceYaw - g.yaw)) < 1.9;
    this.alert = THREE.MathUtils.clamp(this.alert + (d < 3.2 && inView ? dt / 1.2 : -dt / 6), 0, 1);
    this.fear = Math.max(0, this.fear - dt * 0.02);

    // queued reaction to an incoming strike
    if (this.react && now >= this.react.at) {
      const r = this.react.what; this.react = null;
      if (r === 'catch') { this.setMode('catch', 0.7); this.catching = true; g.setLayer('guard', 0.8, 9); }
      else if (r === 'guard') { this.setMode('guard', rnd(0.7, 1.1)); g.setLayer('guard', 1, 5.5); }
      else if (r === 'step') { this.setMode('step', 0.32); this.stepDir = faceYaw + Math.PI; }
      else if (r === 'turn') { this.setMode('turn', 0.9); this.turnWant = (Math.random() < 0.5 ? -1 : 1) * 0.95; }
    }

    this.t += dt;
    switch (this.mode) {
      case 'guard': if (this.t > this.dur) this.setMode('idle'); break;
      case 'catch': if (this.t > this.dur) this.setMode('idle'); break;
      case 'turn': if (this.t > this.dur) this.setMode('idle'); break;
      case 'step': move = 1.3 * (1 - this.t / this.dur) + 0.2; moveDir = this.stepDir; if (this.t > this.dur) this.setMode('idle'); break;
      case 'feint':
        if (this.t < 0.4) g.setLayer('guard', 1, 10);
        else if (this.t < 0.5) { g.setLayer('guard', 0, 7); }
        if (this.t > 0.45 && !this.feintOpen) { this.feintOpen = true; this.open(0.8, 'feint'); this.say(this.line(), 0.8); }
        if (this.t > 1.2) { this.feintOpen = false; this.setMode('idle'); }
        break;
      case 'taunt': if (this.t > this.dur) this.setMode('idle'); break;
      case 'windup':
        this.pose.windup = Math.min(1, this.t / 0.35);
        if (this.t > this.dur) { this.setMode('shove', 0.45); this.shoved = false; }
        break;
      case 'shove': {
        const k = this.t / this.dur;
        this.pose.windup = Math.max(0, 1 - this.t / 0.1);
        this.pose.shove = k < 0.35 ? k / 0.35 : Math.max(0, 1 - (k - 0.35) / 0.65);
        if (k < 0.4) { move = 1.2; moveDir = faceYaw; }
        if (!this.shoved && k > 0.3) { this.shoved = true; if (d < 1.15) w.shoveRus(g); }
        if (this.t > this.dur) { this.pose.shove = 0; this.setMode('idle'); }
        break;
      }
      case 'flee': {
        const dx = this.dest.x - p.x, dz = this.dest.z - p.z, left = Math.hypot(dx, dz);
        move = tr.speed; moveDir = Math.atan2(dx, dz);
        if (left < 0.3 || this.t > this.dur) { this.setMode('winded', 1.5); this.open(1.5, 'winded'); }
        break;
      }
      case 'winded': if (this.t > this.dur) this.setMode('idle'); break;
      case 'home': {
        const h = g.home, dx = h.x - p.x, dz = h.z - p.z, left = Math.hypot(dx, dz);
        move = 0.9; moveDir = Math.atan2(dx, dz);
        if (left < 0.2 || d < 2.8) this.setMode('idle');
        break;
      }
      default: {  // idle: decide
        this.next -= dt;
        if (d > 6 && g.home.distanceTo(p) > 1.2) { this.setMode('home'); break; }
        if (d < 3.2 && this.next <= 0 && !w.rusStriking(g)) this.decide(d);
      }
    }

    // facing
    if (this.mode === 'turn') this.turnOff = angDamp(this.turnOff, this.turnWant, 7, dt);
    else this.turnOff = angDamp(this.turnOff, 0, 5, dt);
    let wantYaw = null;
    if (move > 0.05 && this.mode !== 'step' && this.mode !== 'shove') wantYaw = moveDir;
    else if (d < 4.5) wantYaw = faceYaw + this.turnOff;
    if (wantYaw !== null) { g.yaw = angDamp(g.yaw, wantYaw, this.mode === 'turn' ? 8 : 5, dt); g.group.rotation.y = g.yaw; }

    // locomotion
    this.speed += (move - this.speed) * (1 - Math.exp(-10 * dt));
    if (this.speed > 0.02) {
      const hd = move > 0.05 ? moveDir : (this.lastDir ?? g.yaw); this.lastDir = hd;
      p.x += Math.sin(hd) * this.speed * dt; p.z += Math.cos(hd) * this.speed * dt;
      w.collideGuy(g);
    }
    this.applyPose(dt);
  }

  decide(d) {
    const tr = this.tr;
    const pain = this.w.painFrac(this.g);
    const opts = [
      ['none', 0.55],
      ['guard', tr.guard * (1 + this.fear)],
      ['turn', tr.turn],
      ['feint', tr.feint],
      ['taunt', tr.taunt],
      ['shove', d < 1.3 ? tr.shove : 0],
      ['flee', tr.flee * (0.25 + this.fear + pain) * (d < 2 ? 1 : 0.4)],
      ['step', d < 1.2 ? tr.step * 0.6 : 0],
    ];
    const c = pick(opts);
    this.next = rnd(0.6, 1.4);
    switch (c) {
      case 'guard': this.setMode('guard', rnd(0.8, 1.6)); this.g.setLayer('guard', 1, 7); break;
      case 'turn': this.setMode('turn', rnd(0.8, 1.3)); this.turnWant = (Math.random() < 0.5 ? -1 : 1) * rnd(0.8, 1.1); break;
      case 'feint': this.setMode('feint'); break;
      case 'taunt': this.setMode('taunt', 1.0); this.open(1.0, 'taunt'); this.say(this.line(), 1); break;
      case 'shove': this.setMode('windup', 0.5); this.open(0.5, 'windup'); break;
      case 'flee': this.startFlee(); break;
      case 'step': this.setMode('step', 0.32); this.stepDir = Math.atan2(this.g.group.position.x - this.w.rusPos().x, this.g.group.position.z - this.w.rusPos().z); break;
      default: this.next = rnd(0.4, 1.0);
    }
  }

  // procedural gait (legs/arms swing while he moves) + shove / wind-up arm poses
  applyPose(dt) {
    const g = this.g, s = this.speed;
    const amp = Math.min(0.6, 0.34 * s);
    this.gaitAmp += (amp - this.gaitAmp) * (1 - Math.exp(-8 * dt));
    const A = this.gaitAmp;
    if (A > 0.01) {
      this.gait += dt * (4.2 + 2.6 * s);
      const ph = this.gait, sn = Math.sin(ph);
      g.addRot('spine_01', X, A * 0.25);
      g.addRot('thigh_l', X, -sn * A); g.addRot('thigh_r', X, sn * A);
      g.addRot('thigh_l', Z, -A * 0.35); g.addRot('thigh_r', Z, A * 0.35);   // narrow the wide idle stance
      g.addRot('calf_l', X, Math.max(0, Math.sin(ph + 1.3)) * A * 1.6);
      g.addRot('calf_r', X, Math.max(0, Math.sin(ph + 1.3 + Math.PI)) * A * 1.6);
      g.addRot('upperarm_l', X, sn * A * 0.7); g.addRot('upperarm_r', X, -sn * A * 0.7);
    }
    const wu = this.pose.windup, sh = this.pose.shove;
    if (wu > 0.01 || sh > 0.01) {
      g.addRot('spine_01', X, -0.16 * wu + 0.2 * sh); g.addRot('spine_03', X, -0.08 * wu);
      for (const s2 of ['l', 'r']) {
        g.addRot('upperarm_' + s2, X, 0.8 * wu - 1.35 * sh);
        g.addRot('lowerarm_' + s2, X, -1.1 * wu - 0.25 * sh);
      }
    }
  }
}

function pick(opts) {
  let tot = 0; for (const [, w] of opts) tot += Math.max(0, w);
  let r = Math.random() * tot;
  for (const [k, w] of opts) { r -= Math.max(0, w); if (r <= 0) return k; }
  return opts[0][0];
}
