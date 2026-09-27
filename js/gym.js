import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Procedural gym "Империя": rubber floor + puzzle mats, brick walls with industrial windows,
// steel beams, warm hanging lamps, punching bags on chains, dumbbell rack, power rack, plate tree,
// kettlebells, med balls, plyo boxes, lockers, mirror, boxing ring, neon sign, posters, dust.
// Textures: Poly Haven (CC0). Everything else is generated here.

export const ROOM = { w: 24, d: 16, h: 6 };
const HX = ROOM.w / 2, HZ = ROOM.d / 2;

function pbr(set, repX, repY, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, ...opts });
  if (!set) return m;
  const rep = (t) => { if (!t) return null; const c = t.clone(); c.repeat.set(repX, repY); c.needsUpdate = true; return c; };
  if (set.diff) m.map = rep(set.diff);
  if (set.nor) { m.normalMap = rep(set.nor); m.normalScale = new THREE.Vector2(1, 1).multiplyScalar(opts.normalStrength || 1); }
  if (set.arm) { const a = rep(set.arm); m.roughnessMap = a; m.metalnessMap = a; m.aoMap = null; }
  return m;
}

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function box(w, h, d, mat, x, y, z, { cast = true, recv = true } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = recv; return m;
}

export function buildGym(scene, tex, renderer) {
  const root = new THREE.Group(); root.name = 'gym'; scene.add(root);
  const colliders = [];   // AABBs {x0,x1,z0,z1}
  const updaters = [];
  const aabb = (x0, x1, z0, z1) => colliders.push({ x0, x1, z0, z1 });

  // ---------- materials ----------
  const M = {
    floor: pbr(tex.rubber, ROOM.w / 1.2, ROOM.d / 1.2, { color: 0x9a9a9a }),
    brick: pbr(tex.brick, 8, 3, { color: 0xc9b3a8 }),
    brickEnd: pbr(tex.brick, 5.3, 3, { color: 0xc9b3a8 }),
    paint: pbr(tex.plaster, 8, 0.6, { color: 0x2b2f38 }),
    paintEnd: pbr(tex.plaster, 5.3, 0.6, { color: 0x2b2f38 }),
    ceil: new THREE.MeshStandardMaterial({ color: 0x1c1d21, roughness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.45, metalness: 0.75 }),
    steelRed: new THREE.MeshStandardMaterial({ color: 0x8e1b22, roughness: 0.45, metalness: 0.5 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8e8ec, roughness: 0.18, metalness: 1 }),
    rubberBlack: new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.75 }),
    leatherBlack: pbr(tex.leather, 2, 2, { color: 0x2a2a2e }),
    wood: pbr(tex.wood, 1, 1, { color: 0xd8b48a }),
    mat: pbr({ nor: tex.rubber && tex.rubber.nor, arm: tex.rubber && tex.rubber.arm }, 1, 1, { color: 0xffffff }),
    canvasBlue: pbr(tex.concrete, 3, 3, { color: 0x3b64b8, roughness: 0.9 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.6, metalness: 0.6 }),
    glass: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.35, 2.6), fog: false }),
    mirror: new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.03, metalness: 1, envMapIntensity: 1.2 }),
  };
  M.floor.envMapIntensity = 0.5;

  // ---------- floor & ceiling ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), M.floor);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);
  root.add(box(ROOM.w + 1, 0.4, ROOM.d + 1, M.ceil, 0, ROOM.h + 0.2, 0, { cast: true, recv: false }));

  // puzzle mats (instanced, red/blue checker) – training zone
  {
    const nx = 9, nz = 7, s = 1.0, cx = -1.2, cz = -1.4;
    const g = new THREE.BoxGeometry(s * 0.985, 0.03, s * 0.985);
    const im = new THREE.InstancedMesh(g, M.mat, nx * nz);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    let i = 0;
    for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) {
      m4.makeTranslation(cx + (x - (nx - 1) / 2) * s, 0.015, cz + (z - (nz - 1) / 2) * s);
      im.setMatrixAt(i, m4);
      col.set((x + z) % 2 ? 0x7d1620 : 0x1b2f66); im.setColorAt(i, col); i++;
    }
    im.receiveShadow = true; root.add(im);
    // border strip
    const bm = new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: 0.8 });
    const W = nx * s + 0.3, D = nz * s + 0.3;
    [[W, 0.3, cx, cz - D / 2 + 0.15], [W, 0.3, cx, cz + D / 2 - 0.15]].forEach(([w, d, x, z]) => root.add(box(w, 0.035, d, bm, x, 0.017, z, { cast: false })));
    [[0.3, D, cx - W / 2 + 0.15, cz], [0.3, D, cx + W / 2 - 0.15, cz]].forEach(([w, d, x, z]) => root.add(box(w, 0.035, d, bm, x, 0.017, z, { cast: false })));
  }

  // ---------- walls (north wall has 4 big window openings) ----------
  const T = 0.3, H = ROOM.h;
  // south / east / west solid
  root.add(box(ROOM.w, H, T, M.brick, 0, H / 2, HZ + T / 2));
  root.add(box(T, H, ROOM.d, M.brickEnd, HX + T / 2, H / 2, 0));
  root.add(box(T, H, ROOM.d, M.brickEnd, -HX - T / 2, H / 2, 0));
  // dark painted wainscot
  root.add(box(ROOM.w, 1.1, 0.04, M.paint, 0, 0.55, HZ - 0.02, { cast: false }));
  root.add(box(0.04, 1.1, ROOM.d, M.paintEnd, HX - 0.02, 0.55, 0, { cast: false }));
  root.add(box(0.04, 1.1, ROOM.d, M.paintEnd, -HX + 0.02, 0.55, 0, { cast: false }));
  const winXs = [-9, -4.8, 4.8, 9], winW = 3.0, winY0 = 1.5, winY1 = 4.6;
  {
    const zc = -HZ - T / 2;
    // lower & upper bands
    const lowerMat = pbr(tex.brick, 8, winY0 / H * 3, { color: 0xc9b3a8 });
    const upperMat = pbr(tex.brick, 8, (H - winY1) / H * 3, { color: 0xc9b3a8 });
    root.add(box(ROOM.w, winY0, T, lowerMat, 0, winY0 / 2, zc));
    root.add(box(ROOM.w, H - winY1, T, upperMat, 0, (winY1 + H) / 2, zc));
    root.add(box(ROOM.w, 1.1, 0.04, M.paint, 0, 0.55, -HZ + 0.02, { cast: false }));
    // piers between windows
    const edges = [-HX, ...winXs.flatMap((x) => [x - winW / 2, x + winW / 2]), HX];
    for (let i = 0; i < edges.length; i += 2) {
      const x0 = edges[i], x1 = edges[i + 1], w = x1 - x0; if (w <= 0.01) continue;
      const pm = pbr(tex.brick, w / 3, (winY1 - winY0) / H * 3, { color: 0xc9b3a8 });
      root.add(box(w, winY1 - winY0, T, pm, (x0 + x1) / 2, (winY0 + winY1) / 2, zc));
    }
    // window frames + glass (glass emissive → bloom)
    for (const x of winXs) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(winW, winY1 - winY0), M.glass);
      g.position.set(x, (winY0 + winY1) / 2, -HZ - T + 0.02); g.castShadow = false; root.add(g);
      const fw = 0.07;
      const add = (w, h, px, py) => { const b = box(w, h, 0.12, M.frame, px, py, -HZ - 0.06); root.add(b); };
      add(winW, fw, x, winY0); add(winW, fw, x, winY1); add(winW, fw, x, (winY0 + winY1) / 2 + 0.4);
      add(fw, winY1 - winY0, x - winW / 2, (winY0 + winY1) / 2); add(fw, winY1 - winY0, x + winW / 2, (winY0 + winY1) / 2);
      for (let k = 1; k < 4; k++) add(0.045, winY1 - winY0, x - winW / 2 + k * winW / 4, (winY0 + winY1) / 2);
      // sill
      root.add(box(winW + 0.2, 0.06, 0.32, M.steel, x, winY0 - 0.03, -HZ + 0.12));
    }
  }

  // ---------- ceiling beams + hanging lamps ----------
  const lamps = [];
  {
    for (let x = -10; x <= 10.01; x += 4) {
      root.add(box(0.22, 0.45, ROOM.d, M.steel, x, H - 0.25, 0, { cast: false, recv: true }));
    }
    for (const z of [-4, 0, 4]) root.add(box(ROOM.w, 0.18, 0.14, M.steel, 0, H - 0.55, z, { cast: false }));
    // ducts
    const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, ROOM.w, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x8d9097, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide }));
    duct.rotation.z = Math.PI / 2; duct.position.set(0, H - 0.95, 5.8); root.add(duct);

    const shadeGeo = new THREE.CylinderGeometry(0.12, 0.42, 0.34, 28, 1, true);
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0x1f2226, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide });
    const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.2, 2.4) });
    const cableMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });
    const spots = [[-6.5, -3.5], [-1.2, -1.4], [4.2, -3.5], [-6.5, 3.8], [1.8, 3.2], [8.8, 4.5], [8.8, -5]];
    const lampY = 4.55;
    spots.forEach(([x, z], i) => {
      const g = new THREE.Group(); g.position.set(x, lampY, z);
      const shade = new THREE.Mesh(shadeGeo, shadeMat); shade.position.y = 0.12; g.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), bulbMat); bulb.position.y = 0.02; g.add(bulb);
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, H - lampY - 0.3, 5), cableMat);
      cable.position.y = (H - lampY - 0.3) / 2 + 0.28; g.add(cable);
      root.add(g);
      const s = new THREE.SpotLight(0xffb870, i === 1 ? 160 : 110, 0, 0.82, 0.7, 2);
      s.position.set(x, lampY - 0.05, z); s.target.position.set(x, 0, z);
      if (false) { s.castShadow = true; s.shadow.mapSize.set(1024, 1024); s.shadow.bias = -0.0004; s.shadow.normalBias = 0.02; s.shadow.camera.near = 0.5; s.shadow.camera.far = 8; }
      root.add(s, s.target); lamps.push(s);
    });
  }

  // ---------- punching bags on chains (west wall) ----------
  const bags = [];
  {
    const bagTex = (base, band) => canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      g.fillStyle = band; g.fillRect(0, h * 0.18, w, h * 0.1); g.fillRect(0, h * 0.78, w, h * 0.05);
      g.font = 'bold 64px "Russo One", Rubik, sans-serif'; g.textAlign = 'center'; g.fillStyle = band;
      g.save(); g.translate(w * 0.25, h * 0.52); g.rotate(-Math.PI / 2); g.fillText('ИМПЕРИЯ', 0, 22); g.restore();
      g.save(); g.translate(w * 0.75, h * 0.52); g.rotate(-Math.PI / 2); g.fillText('ИМПЕРИЯ', 0, 22); g.restore();
    });
    const prof = [[0, 0], [0.16, 0], [0.195, 0.035], [0.2, 0.12], [0.2, 1.0], [0.19, 1.08], [0.15, 1.12], [0, 1.12]].map(([r, y]) => new THREE.Vector2(r, y));
    const bagGeo = new THREE.LatheGeometry(prof, 40);
    const linkGeo = new THREE.TorusGeometry(0.022, 0.0055, 6, 12); linkGeo.scale(1, 1.6, 1);
    const beamY = 3.55, bagZs = [-5.2, -2.6, 0.0, 2.6, 5.2], bx = -HX + 0.95;
    root.add(box(0.16, 0.24, ROOM.d - 1, M.steel, bx, beamY + 0.12, 0));
    for (let z = -6.5; z <= 6.51; z += 3.25) root.add(box(0.9, 0.12, 0.12, M.steel, bx - 0.4, beamY + 0.12, z));
    const chainLen = 0.75, perChain = Math.round(chainLen / 0.06);
    const links = new THREE.InstancedMesh(linkGeo, M.chrome, bagZs.length * 4 * perChain + bagZs.length * 5);
    links.castShadow = true;
    let li = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1);
    const colors = [['#8a1420', '#f2d9a0'], ['#151517', '#e0243c'], ['#6e1016', '#ffffff'], ['#151517', '#f2c14e'], ['#8a1420', '#111111']];
    bagZs.forEach((z, bi) => {
      const pivot = new THREE.Group(); pivot.position.set(bx, beamY, z); root.add(pivot);
      const [base, band] = colors[bi % colors.length];
      const mat = pbr({ nor: tex.leather && tex.leather.nor, arm: tex.leather && tex.leather.arm }, 3, 3, { color: 0xffffff });
      mat.map = bagTex(base, band); mat.roughness = 1; mat.envMapIntensity = 0.8;
      const bag = new THREE.Mesh(bagGeo, mat); bag.position.y = -chainLen - 0.05 - 1.12; bag.castShadow = true; bag.receiveShadow = true;
      bag.rotation.y = Math.PI / 2;
      pivot.add(bag);
      const ringY = -chainLen - 0.05 + 0.0;
      pivot.userData = { bag, links: [] };
      // 4 chains from swivel (0,-0.06,0) to top points
      for (let c = 0; c < 4; c++) {
        const a = c * Math.PI / 2 + Math.PI / 4;
        const top = new THREE.Vector3(0, -0.08, 0), bot = new THREE.Vector3(Math.cos(a) * 0.13, ringY, Math.sin(a) * 0.13);
        const dir = bot.clone().sub(top); const len = dir.length(); dir.normalize();
        const qd = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        for (let k = 0; k < perChain; k++) {
          const p = top.clone().addScaledVector(dir, (k + 0.5) * len / perChain);
          const qk = qd.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), k % 2 ? Math.PI / 2 : 0));
          pivot.userData.links.push({ i: li, p, q: qk }); li++;
        }
      }
      // short top chain to beam
      for (let k = 0; k < 5; k++) {
        const p = new THREE.Vector3(0, -0.02 - k * 0.0 + (4 - k) * 0.0, 0); p.y = 0.1 - k * 0.045;
        const qk = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), k % 2 ? Math.PI / 2 : 0);
        pivot.userData.links.push({ i: li, p, q: qk, fixed: true }); li++;
      }
      bags.push({ pivot, phase: bi * 1.7, amp: 0.012 + 0.01 * (bi % 2), hit: 0 });
      aabb(bx - 0.35, bx + 0.35, z - 0.35, z + 0.35);
    });
    links.count = li;
    root.add(links);
    const tmpM = new THREE.Matrix4(), wp = new THREE.Vector3();
    const bagUpdate = (t) => {
      for (const b of bags) {
        const sw = Math.sin(t * 1.1 + b.phase) * b.amp + Math.sin(t * 2.3 + b.phase * 2) * b.amp * 0.3 + b.hit * Math.sin(t * 5) ;
        b.hit *= 0.985;
        b.pivot.rotation.z = sw; b.pivot.rotation.x = Math.cos(t * 0.9 + b.phase) * b.amp * 0.6;
        b.pivot.updateMatrixWorld(true);
        for (const L of b.pivot.userData.links) {
          if (L.fixed) { tmpM.compose(wp.copy(L.p).add(b.pivot.position), L.q, s1); }
          else { tmpM.compose(L.p, L.q, s1); tmpM.premultiply(b.pivot.matrixWorld); }
          links.setMatrixAt(L.i, tmpM);
        }
      }
      links.instanceMatrix.needsUpdate = true;
    };
    bagUpdate(0);
    updaters.push(bagUpdate);
  }

  // ---------- mirror + dumbbell rack (south wall) ----------
  {
    const mx0 = -8.2, mx1 = -0.6, my0 = 0.35, my1 = 2.6;
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(mx1 - mx0, my1 - my0), M.mirror);
    mirror.position.set((mx0 + mx1) / 2, (my0 + my1) / 2, HZ - 0.05); mirror.rotation.y = Math.PI; root.add(mirror);
    root.add(box(mx1 - mx0 + 0.12, 0.06, 0.06, M.frame, (mx0 + mx1) / 2, my1, HZ - 0.06, { cast: false }));
    root.add(box(mx1 - mx0 + 0.12, 0.06, 0.06, M.frame, (mx0 + mx1) / 2, my0, HZ - 0.06, { cast: false }));
    for (let x = mx0; x <= mx1 + 0.01; x += (mx1 - mx0) / 4) root.add(box(0.04, my1 - my0, 0.05, M.frame, x, (my0 + my1) / 2, HZ - 0.06, { cast: false }));

    // rack
    const rx0 = -7.6, rx1 = -1.2, rz = HZ - 0.75;
    for (const x of [rx0, (rx0 + rx1) / 2, rx1]) {
      root.add(box(0.06, 0.95, 0.06, M.steel, x, 0.475, rz + 0.2));
      root.add(box(0.06, 0.6, 0.06, M.steel, x, 0.3, rz - 0.2));
      root.add(box(0.06, 0.06, 0.55, M.steel, x, 0.03, rz));
    }
    root.add(box(rx1 - rx0, 0.04, 0.06, M.steel, (rx0 + rx1) / 2, 0.58, rz - 0.18));
    root.add(box(rx1 - rx0, 0.04, 0.06, M.steel, (rx0 + rx1) / 2, 0.58, rz - 0.02));
    root.add(box(rx1 - rx0, 0.04, 0.06, M.steel, (rx0 + rx1) / 2, 0.92, rz + 0.14));
    root.add(box(rx1 - rx0, 0.04, 0.06, M.steel, (rx0 + rx1) / 2, 0.92, rz + 0.3));
    aabb(rx0 - 0.1, rx1 + 0.1, rz - 0.35, HZ);
    // dumbbells: hex heads instanced + chrome handles
    const headGeo = new THREE.CylinderGeometry(1, 1, 1, 6); headGeo.rotateZ(Math.PI / 2);
    const handleGeo = new THREE.CylinderGeometry(0.016, 0.016, 1, 10); handleGeo.rotateZ(Math.PI / 2);
    const N = 12;
    const heads = new THREE.InstancedMesh(headGeo, M.rubberBlack, N * 4);
    const handles = new THREE.InstancedMesh(handleGeo, M.chrome, N * 2);
    heads.castShadow = handles.castShadow = true; heads.receiveShadow = true;
    const m4 = new THREE.Matrix4(); let hi = 0, ha = 0;
    for (let tier = 0; tier < 2; tier++) for (let i = 0; i < N; i++) {
      const w = 0.1 + i * 0.005 + tier * 0.04; // radius-ish
      const r = 0.05 + i * 0.004 + tier * 0.012, L = 0.07 + i * 0.004 + tier * 0.01, hl = 0.13;
      const x = rx0 + 0.3 + i * ((rx1 - rx0 - 0.6) / (N - 1));
      const y = (tier ? 0.92 : 0.58) + r + 0.02, z = rz + (tier ? 0.22 : -0.1);
      for (const s of [-1, 1]) {
        m4.compose(new THREE.Vector3(x, y, z + 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(L, r, r));
        m4.setPosition(x, y, z + s * (hl / 2 + L / 2));
        heads.setMatrixAt(hi++, m4);
      }
      m4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(hl + L * 2, 1, 1));
      handles.setMatrixAt(ha++, m4);
      void w;
    }
    heads.count = hi; handles.count = ha; root.add(heads, handles);
  }

  // ---------- power rack + bench + plate tree (south-east) ----------
  const plateGeo = new THREE.CylinderGeometry(1, 1, 1, 36); plateGeo.rotateZ(Math.PI / 2);
  const plateMats = [0xb21c26, 0x1f4fb0, 0xd9a520, 0x2a8c3c, 0x151517].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
  const plate = (r, t, mi, x, y, z, ry = 0) => {
    const p = new THREE.Mesh(plateGeo, plateMats[mi]); p.scale.set(t, r, r); p.position.set(x, y, z); p.rotation.y = ry; p.castShadow = true; p.receiveShadow = true; return p;
  };
  {
    const px = 5.2, pz = 5.6, w = 1.2, d = 1.1, h = 2.3;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) root.add(box(0.075, h, 0.075, M.steelRed, px + sx * w / 2, h / 2, pz + sz * d / 2));
    for (const sz of [-1, 1]) root.add(box(w, 0.075, 0.075, M.steelRed, px, h, pz + sz * d / 2));
    for (const sx of [-1, 1]) root.add(box(0.075, 0.075, d, M.steelRed, px + sx * w / 2, h, pz));
    for (const sx of [-1, 1]) root.add(box(0.075, 0.06, d + 0.3, M.steel, px + sx * w / 2, 0.03, pz));
    // barbell on hooks
    const by = 1.35, bz = pz - d / 2 - 0.03;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 2.2, 12), M.chrome); bar.rotation.z = Math.PI / 2; bar.position.set(px, by, bz); bar.castShadow = true; root.add(bar);
    for (const s of [-1, 1]) {
      root.add(plate(0.225, 0.06, 0, px + s * 0.8, by, bz));
      root.add(plate(0.225, 0.05, 1, px + s * 0.86, by, bz));
      root.add(plate(0.2, 0.04, 2, px + s * 0.915, by, bz));
    }
    aabb(px - w / 2 - 0.25, px + w / 2 + 0.25, pz - d / 2 - 0.2, pz + d / 2 + 0.3);
    // bench
    const bx = 1.8, bz2 = 5.9;
    root.add(box(0.32, 0.09, 1.25, M.leatherBlack, bx, 0.46, bz2));
    root.add(box(0.06, 0.4, 0.06, M.steel, bx, 0.2, bz2 - 0.5));
    root.add(box(0.06, 0.4, 0.06, M.steel, bx, 0.2, bz2 + 0.5));
    root.add(box(0.5, 0.05, 0.06, M.steel, bx, 0.03, bz2 - 0.5));
    root.add(box(0.5, 0.05, 0.06, M.steel, bx, 0.03, bz2 + 0.5));
    root.add(box(0.06, 0.05, 1.0, M.steel, bx, 0.3, bz2));
    aabb(bx - 0.3, bx + 0.3, bz2 - 0.7, bz2 + 0.7);
    // plate tree
    const tx = 8.2, tz = 6.6;
    root.add(box(0.07, 1.3, 0.07, M.steel, tx, 0.65, tz));
    root.add(box(0.6, 0.05, 0.6, M.steel, tx, 0.025, tz));
    [[0.225, 0.06, 0, 0.35, 1], [0.225, 0.05, 1, 0.75, -1], [0.2, 0.04, 2, 0.35, -1], [0.18, 0.035, 3, 1.1, 1], [0.225, 0.06, 0, 0.75, 1]].forEach(([r, t, mi, y, s], k) =>
      root.add(plate(r, t, mi, tx + s * (0.09 + (k > 3 ? 0.07 : 0)), y, tz)));
    aabb(tx - 0.45, tx + 0.45, tz - 0.4, tz + 0.4);
    // loose plates leaning on wall
    for (let k = 0; k < 4; k++) { const p = plate(0.225, 0.06, k % 4, 10.2 + k * 0.08, 0.225, 7.35, Math.PI / 2); p.rotation.x = 0.12; root.add(p); }
  }

  // ---------- kettlebells + medicine balls (north wall under windows) ----------
  {
    const bell = new THREE.SphereGeometry(0.13, 20, 14); bell.translate(0, 0.13, 0);
    const handle = new THREE.TorusGeometry(0.075, 0.017, 8, 20, Math.PI); handle.translate(0, 0.25, 0);
    const kb = mergeGeometries([bell.toNonIndexed(), handle.toNonIndexed()]);
    const im = new THREE.InstancedMesh(kb, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.3 }), 8);
    const col = new THREE.Color(), m4 = new THREE.Matrix4(), cols = [0x1a1a1c, 0x1a1a1c, 0xd24a1e, 0xd24a1e, 0x2b6fd6, 0x2b6fd6, 0xe0b02a, 0x46a04a];
    for (let i = 0; i < 8; i++) {
      const s = 0.8 + i * 0.06; m4.compose(new THREE.Vector3(-2.4 + i * 0.5, 0, -HZ + 0.5), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      im.setMatrixAt(i, m4); im.setColorAt(i, col.set(cols[i]));
    }
    im.castShadow = im.receiveShadow = true; root.add(im);
    aabb(-2.7, 1.5, -HZ, -HZ + 0.8);
    const mb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), 5);
    const mcols = [0x7a1a1a, 0x222226, 0x1d3f8a, 0x222226, 0x3b7a2a];
    for (let i = 0; i < 5; i++) { m4.makeTranslation(-11.1 + (i % 2) * 0.12, 0.17, -7.0 + i * 0.38); mb.setMatrixAt(i, m4); mb.setColorAt(i, col.set(mcols[i])); }
    mb.castShadow = mb.receiveShadow = true; root.add(mb);
  }

  // ---------- plyo boxes (south-west) ----------
  {
    const wm = M.wood;
    [[0.75, 0.6, 0.9, -9.8, 6.5, 0.2], [0.6, 0.45, 0.75, -8.7, 6.7, -0.3], [0.5, 0.3, 0.6, -9.7, 6.35, 0.5]].forEach(([w, h, d, x, z, ry], k) => {
      const b = box(w, h, d, wm, x, h / 2 + (k === 2 ? 0.6 : 0), z); b.rotation.y = ry; root.add(b);
    });
    aabb(-10.4, -8.2, 5.9, 7.3);
  }

  // ---------- lockers (east wall) ----------
  {
    const lt = canvasTex(1024, 512, (g, w, h) => {
      g.fillStyle = '#3d4d5e'; g.fillRect(0, 0, w, h);
      const n = 8, dw = w / n;
      for (let i = 0; i < n; i++) {
        g.strokeStyle = '#1b222b'; g.lineWidth = 6; g.strokeRect(i * dw + 3, 3, dw - 6, h - 6);
        g.fillStyle = '#24303c';
        for (let k = 0; k < 5; k++) g.fillRect(i * dw + dw * 0.25, 40 + k * 16, dw * 0.5, 7);
        g.fillStyle = '#c9ccd1'; g.fillRect(i * dw + dw * 0.8, h * 0.5, 8, 40);
        g.fillStyle = '#e8e2d0'; g.font = 'bold 26px Rubik, sans-serif'; g.fillText(String(i + 1), i * dw + dw * 0.42, h * 0.35);
      }
    });
    const lm = new THREE.MeshStandardMaterial({ map: lt, roughness: 0.5, metalness: 0.6 });
    const side = new THREE.MeshStandardMaterial({ color: 0x3d4d5e, roughness: 0.5, metalness: 0.6 });
    const L = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.9, 4), [lm, side, side, side, side, side]);
    L.position.set(HX - 0.27, 0.95, 3.2); L.rotation.y = Math.PI; L.castShadow = L.receiveShadow = true; root.add(L);
    aabb(HX - 0.55, HX, 1.1, 5.3);
  }

  // ---------- boxing ring (north-east corner) ----------
  {
    const rx = 7.6, rz = -4.2, S = 4.6, rh = 0.55;
    const apronTex = canvasTex(1024, 128, (g, w, h) => {
      g.fillStyle = '#101014'; g.fillRect(0, 0, w, h); g.fillStyle = '#e0243c'; g.fillRect(0, h - 10, w, 10);
      g.font = '64px "Russo One", Rubik, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffffff';
      g.fillText('ИМПЕРИЯ ПАХА', w / 2, 84);
    });
    const apron = new THREE.MeshStandardMaterial({ map: apronTex, roughness: 0.85 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(S, rh, S), [apron, apron, M.canvasBlue, M.canvasBlue, apron, apron]);
    base.position.set(rx, rh / 2, rz); base.castShadow = base.receiveShadow = true; root.add(base);
    const postMat = [0xb21c26, 0x1f4fb0, 0xdddddd, 0xdddddd].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
    const corners = [[-1, -1], [1, 1], [1, -1], [-1, 1]];
    corners.forEach(([sx, sz], i) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 12), M.steel);
      p.position.set(rx + sx * (S / 2 - 0.08), rh + 0.7, rz + sz * (S / 2 - 0.08)); p.castShadow = true; root.add(p);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 0.16), postMat[i]); pad.position.copy(p.position).setY(rh + 0.65); pad.castShadow = true; root.add(pad);
    });
    const ropeCols = [0xc21d2a, 0xf0f0f0, 0x1f4fb0];
    const ropeGeo = new THREE.CylinderGeometry(0.018, 0.018, S - 0.16, 8); ropeGeo.rotateZ(Math.PI / 2);
    ropeCols.forEach((c, k) => {
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 });
      const y = rh + 0.42 + k * 0.33, e = S / 2 - 0.08;
      const a = new THREE.Mesh(ropeGeo, m); a.position.set(rx, y, rz - e); root.add(a);
      const b = a.clone(); b.position.set(rx, y, rz + e); root.add(b);
      const cL = a.clone(); cL.rotation.y = Math.PI / 2; cL.position.set(rx - e, y, rz); root.add(cL);
      const d = cL.clone(); d.position.set(rx + e, y, rz); root.add(d);
      [a, b, cL, d].forEach((r) => (r.castShadow = true));
    });
    // steps
    root.add(box(0.8, 0.18, 0.35, M.steel, rx - S / 2 - 0.2, 0.09, rz + 1.2));
    root.add(box(0.8, 0.36, 0.35, M.steel, rx - S / 2 - 0.05, 0.18, rz + 0.85).translateX(0.0));
    aabb(rx - S / 2 - 0.1, rx + S / 2, rz - S / 2, rz + S / 2 + 0.1);
  }

  // ---------- neon sign + posters + clock ----------
  {
    const neonTex = canvasTex(1024, 256, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      g.font = '120px "Russo One", Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = '#ff2a4a'; g.shadowBlur = 40; g.fillStyle = '#ff6d82';
      g.fillText('ИМПЕРИЯ', w / 2, h / 2 + 4); g.shadowBlur = 12; g.fillStyle = '#ffe3e8'; g.fillText('ИМПЕРИЯ', w / 2, h / 2 + 4);
    });
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: neonTex, color: new THREE.Color(2.4, 2.4, 2.4), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    neon.position.set(0, 4.25, -HZ + 0.03); root.add(neon);
    const sub = canvasTex(1024, 160, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      g.font = '84px "Russo One", Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = '#ffb040'; g.shadowBlur = 30; g.fillStyle = '#ffd080'; g.fillText('ПАХА · 21+', w / 2, h / 2);
      g.shadowBlur = 8; g.fillStyle = '#fff4de'; g.fillText('ПАХА · 21+', w / 2, h / 2);
    });
    const neon2 = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.4), new THREE.MeshBasicMaterial({ map: sub, color: new THREE.Color(2, 2, 2), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    neon2.position.set(0, 3.55, -HZ + 0.03); root.add(neon2);
    const neonLight = new THREE.PointLight(0xff3050, 6, 7, 2); neonLight.position.set(0, 3.8, -HZ + 0.6); root.add(neonLight);
    updaters.push((t) => { const f = 0.92 + 0.08 * Math.sin(t * 31) * Math.sin(t * 7.3); neon.material.color.setScalar(2.4 * (Math.sin(t * 0.7) > 0.985 ? 0.4 : f)); });

    const poster = (lines, bg, fg, accent) => canvasTex(512, 768, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, bg[0]); gr.addColorStop(1, bg[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = accent; g.lineWidth = 14; g.strokeRect(20, 20, w - 40, h - 40);
      g.textAlign = 'center'; g.fillStyle = fg;
      lines.forEach(([txt, size, y, col]) => { g.font = `${size}px "Russo One", Rubik, sans-serif`; g.fillStyle = col || fg; g.fillText(txt, w / 2, y); });
    });
    const posters = [
      [[['БЕЙ', 130, 250], ['ПЕРВОЙ', 110, 380, '#e0243c'], ['— Русана', 40, 640, '#bbbbbb']], ['#15151a', '#2a0c12'], '#ffffff', '#e0243c', [HX - 0.02, 2.6, -1.6, -Math.PI / 2]],
      [[['ПРАВИЛА', 70, 140], ['ЗАЛА', 70, 215], ['1. Не спорь', 40, 350], ['   с Русаной', 40, 400], ['2. Тапаешь —', 40, 480], ['   значит всё', 40, 530], ['3. Только 21+', 40, 610, '#ffc46b']], ['#f1e7d0', '#d8c9a8'], '#1a1a1a', '#1a1a1a', [HX - 0.02, 2.5, -6.2, -Math.PI / 2]],
      [[['НИКАКОЙ', 84, 300], ['ПОЩАДЫ', 96, 410, '#ffc46b'], ['ИМПЕРИЯ', 40, 650, '#e0243c']], ['#0e0f14', '#181c28'], '#ffffff', '#ffc46b', [-HX + 0.02, 2.7, 6.3, Math.PI / 2]],
      [[['ПАХ —', 96, 280], ['ЭТО', 96, 390], ['ЦЕЛЬ', 110, 510, '#e0243c']], ['#1b1b1b', '#000000'], '#ffffff', '#ffffff', [2.9, 2.2, HZ - 0.02, Math.PI]],
    ];
    posters.forEach(([lines, bg, fg, accent, [x, y, z, ry]]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.5), new THREE.MeshStandardMaterial({ map: poster(lines, bg, fg, accent), roughness: 0.6 }));
      m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; root.add(m);
    });
    // wall clock
    const clockTex = canvasTex(256, 256, (g) => {
      g.fillStyle = '#f4f1ea'; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill();
      g.lineWidth = 10; g.strokeStyle = '#111'; g.stroke();
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillStyle = '#111'; g.fillRect(128 + Math.sin(a) * 96 - 3, 128 - Math.cos(a) * 96 - 10, 6, 20); }
    });
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.35, 40), new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.4 }));
    clock.position.set(6.5, 4.0, HZ - 0.03); clock.rotation.y = Math.PI; root.add(clock);
    const handMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const hh = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.18), handMat); hh.geometry.translate(0, 0.08, 0); hh.position.set(6.5, 4.0, HZ - 0.035); hh.rotation.y = Math.PI; root.add(hh);
    const mh = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.27), handMat); mh.geometry.translate(0, 0.12, 0); mh.position.set(6.5, 4.0, HZ - 0.036); mh.rotation.y = Math.PI; root.add(mh);
    hh.userData.dynamic = mh.userData.dynamic = true;
    updaters.push(() => { const d = new Date(); hh.rotation.z = (d.getHours() % 12 + d.getMinutes() / 60) / 12 * Math.PI * 2; mh.rotation.z = (d.getMinutes() / 60) * Math.PI * 2; });
  }

  // ---------- light shafts from windows (additive, fake volumetrics) ----------
  const sunDir = new THREE.Vector3(0.28, -0.62, 0.73).normalize(); // direction light travels (from north-west, high)
  {
    const shaftTex = canvasTex(64, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.08, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.2, 'rgba(0,0,0,0)'); gx.addColorStop(0.8, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, w, h);
    }, false);
    const sm = new THREE.MeshBasicMaterial({ map: shaftTex, color: 0xffe2b8, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (const x of winXs) {
      const len = 7.5;
      const g = new THREE.PlaneGeometry(winW * 0.95, len); g.translate(0, -len / 2, 0);
      const shaft = new THREE.Mesh(g, sm);
      shaft.position.set(x, winY1 - 0.1, -HZ + 0.05);
      shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), sunDir);
      shaft.renderOrder = 5; root.add(shaft);
      // second, slightly offset for thickness
      const s2 = shaft.clone(); s2.position.y = (winY0 + winY1) / 2; s2.material = sm; root.add(s2);
    }
  }

  // ---------- dust motes ----------
  {
    const N = 700, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * ROOM.w; pos[i * 3 + 1] = Math.random() * 4.5; pos[i * 3 + 2] = (Math.random() - 0.5) * ROOM.d; seed[i] = Math.random() * 100; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = canvasTex(32, 32, (c) => { const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 32, 32); });
    const pm = new THREE.PointsMaterial({ size: 0.025, map: dot, color: 0xffe6c4, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const pts = new THREE.Points(g, pm); pts.frustumCulled = false; root.add(pts);
    updaters.push((t, dt) => {
      for (let i = 0; i < N; i++) {
        pos[i * 3] += Math.sin(t * 0.2 + seed[i]) * 0.002; pos[i * 3 + 1] += (Math.sin(t * 0.3 + seed[i] * 2) * 0.5 + 0.1) * dt * 0.05;
        if (pos[i * 3 + 1] > 4.8) pos[i * 3 + 1] = 0.1;
      }
      g.attributes.position.needsUpdate = true;
    });
  }

  mergeStatic(root);

  // world bounds collider (inner walls)
  const bounds = { x0: -HX + 0.35, x1: HX - 0.35, z0: -HZ + 0.35, z1: HZ - 0.35 };

  return {
    root, colliders, bounds, bags, lamps, sunDir, M,
    update(t, dt) { for (const u of updaters) u(t, dt); },
  };
}

// Merge static single-material opaque meshes that are direct children of root, grouped by
// material + shadow flags → far fewer draw calls (and shadow-pass calls).
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  for (const o of [...root.children]) {
    if (!o.isMesh || o.isInstancedMesh || o.userData.dynamic || Array.isArray(o.material) || o.material.transparent || o.children.length) continue;
    const g = o.geometry; if (!g.index) continue;
    const sig = Object.keys(g.attributes).sort().join(',');
    const key = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}|${sig}|${o.renderOrder}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }
  let before = 0, after = 0;
  for (const list of groups.values()) {
    before += list.length;
    if (list.length < 2) { after++; continue; }
    const geos = list.map((o) => { const c = o.geometry.clone(); c.applyMatrix4(o.matrixWorld); return c; });
    const merged = mergeGeometries(geos, false);
    if (!merged) { after += list.length; continue; }
    const m = new THREE.Mesh(merged, list[0].material);
    m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow; m.renderOrder = list[0].renderOrder;
    list.forEach((o) => root.remove(o));
    geos.forEach((g) => g.dispose());
    root.add(m); after++;
  }
  console.log(`[bb] gym static meshes merged: ${before} → ${after}`);
}

// Push a circle (x,z,r) out of AABBs & keep in bounds. Returns corrected {x,z}.
export function collide(p, r, gym, extraCircles = []) {
  for (const b of gym.colliders) {
    const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.z, b.z1));
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
      else { // inside: push along smallest axis
        const opts = [[b.x0 - r - p.x, 0], [b.x1 + r - p.x, 0], [0, b.z0 - r - p.z], [0, b.z1 + r - p.z]];
        opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1])); p.x += opts[0][0]; p.z += opts[0][1];
      }
    }
  }
  for (const c of extraCircles) {
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = r + c.r;
    if (d < m && d > 1e-6) { p.x += dx / d * (m - d); p.z += dz / d * (m - d); }
  }
  const B = gym.bounds;
  p.x = Math.max(B.x0, Math.min(B.x1, p.x)); p.z = Math.max(B.z0, Math.min(B.z1, p.z));
  return p;
}
