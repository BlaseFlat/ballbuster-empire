import * as THREE from 'three';

// Impact FX: spark particles, shockwave ring, impact light, screen flash, camera shake, popups.
export class FX {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    const N = 220;
    this.N = N;
    this.pos = new Float32Array(N * 3); this.col = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3); this.life = new Float32Array(N); this.maxLife = new Float32Array(N);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.035, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false; scene.add(this.points);
    for (let i = 0; i < N; i++) this.pos[i * 3 + 1] = -100;
    // shockwave ring (billboard)
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 2.4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.ring.visible = false; scene.add(this.ring); this.ringT = 0;
    this.core = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.6, 3.2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.core.visible = false; scene.add(this.core);
    this.light = new THREE.PointLight(0xffe8d0, 0, 4, 2); scene.add(this.light);
    this.flashEl = document.getElementById('flash');
    this.popEl = document.getElementById('popups');
    this.flash = 0; this.shake = 0; this.shakeT = 0;
    this.shakeOffset = new THREE.Vector3();
    this.cursor = 0;
  }

  impact(p, strength = 1) {
    const N = this.N, n = Math.round(90 * strength);
    for (let k = 0; k < n; k++) {
      const i = this.cursor = (this.cursor + 1) % N;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = (0.7 + Math.random() * 2.0) * strength;
      this.vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp; this.vel[i * 3 + 1] = Math.abs(Math.cos(ph)) * sp * 0.9 + 0.6; this.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      this.life[i] = this.maxLife[i] = 0.18 + Math.random() * 0.35;
      const w = Math.random();
      this.col[i * 3] = 3; this.col[i * 3 + 1] = 2.2 + w * 0.8; this.col[i * 3 + 2] = 1.2 + w * 1.6;
    }
    this.ring.position.copy(p); this.ring.visible = true; this.ringT = 0; this.ringStrength = strength;
    this.core.position.copy(p); this.core.visible = true;
    this.light.position.copy(p); this.light.intensity = 30 * strength;
    this.flash = Math.min(0.85, 0.55 * strength + 0.2);
    this.shake = 0.06 * strength; this.shakeT = 0;
  }

  smallHit(p) {
    this.shake = 0.02; this.shakeT = 0;
    this.light.position.copy(p); this.light.intensity = 4;
  }

  popup(text, screen, cls = '') {
    const el = document.createElement('div');
    el.className = 'popup ' + cls; el.textContent = text;
    el.style.left = screen.x + 'px'; el.style.top = screen.y + 'px';
    this.popEl.appendChild(el);
    // removed when its CSS animation ends (works with the frame-stepped demo capture too); fallback for safety
    el.addEventListener('animationend', () => el.remove(), { once: true });
    const kill = () => { if (!el.isConnected) return; if (window.__bb && window.__bb.manual) setTimeout(kill, 1500); else el.remove(); };
    setTimeout(kill, 2500);
  }

  update(dt, realDt) {
    const N = this.N;
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const a = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] -= 6.5 * dt;
      const drag = Math.exp(-dt * 2.5);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.3; }
      this.col[i * 3] *= 0.9 + 0.1 * a; this.col[i * 3 + 1] *= 0.88 + 0.12 * a; this.col[i * 3 + 2] *= 0.82 + 0.18 * a;
      if (this.life[i] <= 0) this.pos[i * 3 + 1] = -100;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    // ring + core use real time so they read even during hit-stop
    if (this.ring.visible) {
      this.ringT += realDt;
      const t = this.ringT / 0.3, s = (0.04 + t * 0.32) * (this.ringStrength || 1);
      this.ring.scale.setScalar(s); this.ring.quaternion.copy(this.camera.quaternion);
      this.ring.material.opacity = Math.max(0, 1 - t) * 0.75;
      const ct = this.ringT / 0.16;
      this.core.scale.setScalar(0.06 + ct * 0.1); this.core.material.opacity = Math.max(0, 1 - ct);
      if (t >= 1) { this.ring.visible = false; this.core.visible = false; }
    }
    this.light.intensity *= Math.exp(-realDt * 14);
    this.flash = Math.max(0, this.flash - realDt * 4.5);
    this.flashEl.style.opacity = this.flash.toFixed(3);
    this.shakeT += realDt;
    const s = this.shake * Math.exp(-this.shakeT * 9);
    this.shakeOffset.set((Math.random() - 0.5) * 2 * s, (Math.random() - 0.5) * 2 * s, (Math.random() - 0.5) * s);
  }
}
