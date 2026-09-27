import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { asset } from '@bb/config';

// Weighted progress: each job has a weight (≈ MB) and a 0..1 fraction.
export class Progress {
  constructor(onChange) { this.jobs = new Map(); this.onChange = onChange; }
  add(id, w) { this.jobs.set(id, { w, f: 0 }); this.emit(); }
  set(id, f) { const j = this.jobs.get(id); if (j) { j.f = Math.max(j.f, Math.min(1, f)); this.emit(); } }
  emit() {
    let W = 0, F = 0; for (const j of this.jobs.values()) { W += j.w; F += j.w * j.f; }
    this.onChange && this.onChange(W ? F / W : 0);
  }
}

const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
const texLoader = new THREE.TextureLoader();
const rgbeLoader = new RGBELoader();

export function loadGLB(path, progress, id, weight = 2) {
  progress.add(id, weight);
  return new Promise((resolve) => {
    gltfLoader.load(asset(path), (g) => { progress.set(id, 1); resolve(g); },
      (e) => { if (e.total) progress.set(id, e.loaded / e.total * 0.95); },
      (err) => { console.error('[bb] GLB failed', path, err); progress.set(id, 1); resolve(null); });
  });
}

export function loadJSON(path) {
  return fetch(asset(path)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
}

export function loadTex(path, progress, { srgb = false } = {}) {
  const id = 'tex:' + path; progress.add(id, 0.15);
  return new Promise((resolve) => {
    texLoader.load(asset(path), (t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
      progress.set(id, 1); resolve(t);
    }, undefined, () => { console.warn('[bb] texture failed', path); progress.set(id, 1); resolve(null); });
  });
}

export function loadHDR(path, progress) {
  const id = 'hdr:' + path; progress.add(id, 1.7);
  return new Promise((resolve) => {
    rgbeLoader.load(asset(path), (t) => { progress.set(id, 1); resolve(t); },
      (e) => { if (e.total) progress.set(id, e.loaded / e.total * 0.95); },
      () => { console.warn('[bb] HDR failed', path); progress.set(id, 1); resolve(null); });
  });
}
