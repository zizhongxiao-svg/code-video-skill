import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const W = 1920, H = 1080;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const prog = (t, a, b) => ease((t - a) / (b - a));
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function track(keys) {
  const n = keys.length, T = keys.map(k => k[0]), V = keys.map(k => k[1]), h = [], d = [];
  for (let i = 0; i < n - 1; i++) { h.push(T[i + 1] - T[i]); d.push((V[i + 1] - V[i]) / h[i]); }
  const m = new Array(n); m[0] = 0; m[n - 1] = 0;
  for (let i = 1; i < n - 1; i++) {
    const p = (d[i - 1] * h[i] + d[i] * h[i - 1]) / (h[i - 1] + h[i]);
    m[i] = (Math.sign(d[i - 1]) + Math.sign(d[i])) * Math.min(Math.abs(d[i - 1]), Math.abs(d[i]), 0.5 * Math.abs(p));
  }
  return t => {
    if (t <= T[0]) return V[0];
    if (t >= T[n - 1]) return V[n - 1];
    let i = 0; while (t > T[i + 1]) i++;
    const hh = h[i], s = (t - T[i]) / hh, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * V[i] + (s3 - 2 * s2 + s) * hh * m[i] + (-2 * s3 + 3 * s2) * V[i + 1] + (s3 - s2) * hh * m[i + 1];
  };
}
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let r = Math.imul(a ^ a >>> 15, 1 | a); r = r + Math.imul(r ^ r >>> 7, 61 | r) ^ r; return ((r ^ r >>> 14) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const BG = 0x15181d;
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 26, 62);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 200);

const key = new THREE.DirectionalLight(0xfff3e6, 2.6); key.position.set(-8, 16, 10);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -13, right: 13, top: 12, bottom: -12, near: 1, far: 50 });
key.shadow.radius = 6; key.shadow.bias = -0.0005;
const fill = new THREE.DirectionalLight(0xc6d6ff, 0.9); fill.position.set(12, 4, 8);
const rim = new THREE.DirectionalLight(0xffffff, 2.4); rim.position.set(3, 7, -12);
scene.add(key, fill, rim);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x0f1115, roughness: 0.95, envMapIntensity: 0.3 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

// ---------------------------------------------------------------- materials
function weave() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const a = ((i + j) & 1) === 0, x = i * 16, y = j * 16;
    const gr = a ? g.createLinearGradient(x, y, x + 16, y) : g.createLinearGradient(x, y, x, y + 16);
    gr.addColorStop(0, '#2a2d33'); gr.addColorStop(0.5, '#575c66'); gr.addColorStop(1, '#2a2d33');
    g.fillStyle = gr; g.fillRect(x, y, 16, 16);
  }
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(6, 3); tx.anisotropy = 8;
  return tx;
}
const M = {
  glass: new THREE.MeshPhysicalMaterial({ color: 0x7a5a24, metalness: 0.85, roughness: 0.05, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide }),
  wing: new THREE.MeshPhysicalMaterial({ color: 0x14161a, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1, transparent: true }),
  tail: new THREE.MeshStandardMaterial({ color: 0x400606, emissive: 0xff2a1e, emissiveIntensity: 2.2, transparent: true }),
  head: new THREE.MeshStandardMaterial({ color: 0x555555, emissive: 0xe8f2ff, emissiveIntensity: 1.6, transparent: true }),
  tire: new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.85 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xb9bcc2, metalness: 1, roughness: 0.25 }),
  tray: new THREE.MeshStandardMaterial({ color: 0x2c3038, metalness: 0.6, roughness: 0.45 }),
  cell: new THREE.MeshStandardMaterial({ color: 0xa8b0ba, metalness: 0.9, roughness: 0.3, emissive: 0xff9a2e, emissiveIntensity: 0 }),
  motor: new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 1, roughness: 0.3, emissive: 0xff9a2e, emissiveIntensity: 0 }),
  copper: new THREE.MeshStandardMaterial({ color: 0xc8743a, metalness: 1, roughness: 0.32 }),
  fan: new THREE.MeshStandardMaterial({ color: 0xc9c4ba, metalness: 1, roughness: 0.28, emissive: 0xff9a2e, emissiveIntensity: 0, side: THREE.DoubleSide }),
  carbon: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: weave(), roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0xff9a2e, emissiveIntensity: 0 }),
  boss: new THREE.MeshStandardMaterial({ color: 0xd6d0c4, metalness: 1, roughness: 0.22 }),
  seat: new THREE.MeshPhysicalMaterial({ color: 0xe9eaec, roughness: 0.55, clearcoat: 0.2 }),
  seat2: new THREE.MeshStandardMaterial({ color: 0x6d737c, roughness: 0.8 }),
  pipe: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 1, roughness: 0.3, transparent: true }),
};

// glossy dark paint; the shell variant discards the door, canopy and wheel-arch openings
const DOOR = { u0: 0.405, u1: 0.595, s0: -0.55, s1: 0.62 };
const CANOPY = { u0: 0.29, u1: 0.665, s: 0.62 };
const WHEEL = { x: 2.95, y: 0.6, r: 0.6, z: 1.5, arch: 0.72 };
const CUT = `
  if (abs(vLoc.z) > 1.15 && vBuv.y < 0.42 && vLoc.y < 1.08) {
    vec2 a = vLoc.xy - vec2(${WHEEL.x.toFixed(3)}, ${WHEEL.y.toFixed(3)});
    vec2 b = vLoc.xy - vec2(${(-WHEEL.x).toFixed(3)}, ${WHEEL.y.toFixed(3)});
    if (dot(a, a) < ${(WHEEL.arch ** 2).toFixed(4)} || dot(b, b) < ${(WHEEL.arch ** 2).toFixed(4)}) discard;
  }
  if (vBuv.x > ${DOOR.u0.toFixed(4)} && vBuv.x < ${DOOR.u1.toFixed(4)} && vBuv.y > ${DOOR.s0.toFixed(4)} && vBuv.y < ${DOOR.s1.toFixed(4)}) discard;
  if (vBuv.x > ${CANOPY.u0.toFixed(4)} && vBuv.x < ${CANOPY.u1.toFixed(4)} && vBuv.y > ${CANOPY.s.toFixed(4)}) discard;
`;
function paint(cut) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0x0d0f13, metalness: 0.2, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.45, side: THREE.DoubleSide, transparent: true });
  if (cut) {
    m.onBeforeCompile = sh => {
      sh.vertexShader = 'attribute vec2 buv;\nvarying vec2 vBuv;\nvarying vec3 vLoc;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBuv = buv; vLoc = position;');
      sh.fragmentShader = 'varying vec2 vBuv;\nvarying vec3 vLoc;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n' + CUT);
    };
    m.customProgramCacheKey = () => 'bodycut';
  }
  return m;
}
M.paint = paint(true); M.door = paint(false);
const SHELL_MATS = [M.paint, M.door, M.wing, M.tail, M.head];

// ---------------------------------------------------------------- body surface (schematic coupe, front = +X)
const X0 = -4.5, LEN = 9;
const topK = track([[0, 1.15], [0.1, 1.22], [0.25, 1.47], [0.36, 1.76], [0.46, 1.84], [0.56, 1.74], [0.67, 1.33], [0.8, 1.12], [0.92, 0.95], [1, 0.78]]);
const botK = track([[0, 0.62], [0.05, 0.44], [0.5, 0.38], [0.95, 0.42], [1, 0.58]]);
const belK = track([[0, 0.94], [0.5, 0.9], [1, 0.7]]);
const hwK = track([[0, 1.6], [0.06, 1.86], [0.18, 1.97], [0.5, 1.93], [0.82, 1.95], [0.94, 1.75], [1, 1.25]]);
const tapK = track([[0, 0.16], [0.25, 0.26], [0.45, 0.32], [0.62, 0.26], [0.8, 0.14], [1, 0.1]]);
const uR = (-WHEEL.x - X0) / LEN, uF = (WHEEL.x - X0) / LEN;
const fb = u => 0.2 * (Math.exp(-(((u - uR) / 0.11) ** 2)) + Math.exp(-(((u - uF) / 0.11) ** 2)));
function bodyPt(p, th, o = new THREE.Vector3()) {
  const s = Math.sin(th), c = Math.cos(th);
  const top = topK(p), bot = botK(p), yb = belK(p), hw = hwK(p);
  const sp = Math.pow(Math.abs(s), s > 0 ? 2 / 3 : 2 / 5);
  let y = s > 0 ? yb + (top + fb(p) * c * c - yb) * sp : yb - (yb - bot) * sp;
  let z = Math.sign(c) * hw * Math.pow(Math.abs(c), 2 / 3.5) * (1 - tapK(p) * Math.pow(Math.max(s, 0), 1.5));
  const R = 0.03; let k = 1;
  if (p < R) k = Math.sqrt(Math.max(0, 1 - (1 - p / R) ** 2));
  else if (p > 1 - R) k = Math.sqrt(Math.max(0, 1 - (1 - (1 - p) / R) ** 2));
  const yc = (top + bot) / 2;
  return o.set(X0 + LEN * p, yc + (y - yc) * k, z * k);
}
function surf(ps, ths) {
  const pos = [], buv = [], idx = [], v = new THREE.Vector3();
  for (const p of ps) for (const th of ths) { bodyPt(p, th, v); pos.push(v.x, v.y, v.z); buv.push(p, Math.sin(th)); }
  const nv = ths.length;
  for (let i = 0; i < ps.length - 1; i++) for (let j = 0; j < nv - 1; j++) {
    const a = i * nv + j, b = a + 1, c = a + nv, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('buv', new THREE.Float32BufferAttribute(buv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const range = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; return o; };

const car = new THREE.Group(); scene.add(car);
const parts = {};
const add = (name, obj) => { parts[name] = obj; car.add(obj); return obj; };

// shell = body + canopy + light strips
const shell = new THREE.Group();
{
  const ps = range(0, 1, 280).map(i => 0.5 - 0.5 * Math.cos(Math.PI * i));
  shell.add(mesh(surf(ps, range(-Math.PI / 2, Math.PI * 1.5, 176)), M.paint));
  const gs = Math.asin(CANOPY.s);
  const glass = mesh(surf(range(CANOPY.u0, CANOPY.u1, 60), range(gs, Math.PI - gs, 60)), M.glass);
  glass.castShadow = false; shell.add(glass);
  // full-width light strips around the rear and front noses (beltline of the end caps)
  const strip = (front, mat) => {
    const pts = [];
    for (let i = -24; i <= 24; i++) {
      const k = 0.95 * i / 24, q = 0.03 * (1 - Math.sqrt(1 - k * k));
      const v = bodyPt(front ? 1 - q : q, k >= 0 ? 0 : Math.PI); v.x += front ? 0.014 : -0.014; pts.push(v);
    }
    shell.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, front ? 0.022 : 0.03, 8), mat));
  };
  strip(false, M.tail); strip(true, M.head);
}
add('shell', shell);

// butterfly doors: patches of the same surface, hinged along the A-pillar
const doors = [];
for (const side of [1, -1]) {
  const a0 = Math.asin(DOOR.s0), a1 = Math.asin(DOOR.s1);
  const ths = side > 0 ? range(a0, a1, 40) : range(Math.PI - a1, Math.PI - a0, 40);
  const g = surf(range(DOOR.u0, DOOR.u1, 40), ths);
  const hinge = bodyPt(DOOR.u1, side > 0 ? a1 : Math.PI - a1);
  const pillarTop = bodyPt(CANOPY.u1 - 0.09, side > 0 ? 1.15 : Math.PI - 1.15);
  const axis = pillarTop.clone().sub(hinge).normalize();
  g.translate(-hinge.x, -hinge.y, -hinge.z);
  const m = mesh(g, M.door);
  const pivot = new THREE.Group(); pivot.position.copy(hinge); pivot.add(m);
  const root = new THREE.Group(); root.add(pivot);
  // pick the rotation sense that swings the door up
  g.computeBoundingBox(); const cen = g.boundingBox.getCenter(new THREE.Vector3());
  const up = cen.clone().applyAxisAngle(axis, 1).y > cen.y ? 1 : -1;
  doors.push({ root, pivot, axis, up, side });
  add('door' + side, root);
}

// rear wing (variable pitch) on two struts
const wing = new THREE.Group();
{
  const s = new THREE.Shape();
  s.moveTo(0.48, 0); s.bezierCurveTo(0.3, 0.07, -0.2, 0.09, -0.46, 0.02); s.lineTo(-0.47, -0.01); s.bezierCurveTo(-0.2, 0.0, 0.3, -0.03, 0.48, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 3.2, bevelEnabled: false, curveSegments: 24 }); g.translate(0, 0, -1.6);
  const foil = mesh(g, M.wing);
  const pitch = new THREE.Group(); pitch.position.set(-4.0, 1.58, 0); pitch.add(foil); wing.userData.pitch = pitch;
  wing.add(pitch);
  for (const z of [-0.85, 0.85]) {
    const st = mesh(new THREE.BoxGeometry(0.22, 0.34, 0.035), M.wing); st.position.set(-3.98, 1.41, z); wing.add(st);
  }
}
add('wing', wing);

// wheels: thin-spoke rims
function wheel() {
  const g = new THREE.Group(), R = WHEEL.r;
  const prof = [[R * 0.72, -0.25], [R * 0.95, -0.27], [R, -0.18], [R, 0.18], [R * 0.95, 0.27], [R * 0.72, 0.25], [R * 0.72, -0.25]];
  const tire = mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 64), M.tire); tire.rotation.x = Math.PI / 2; g.add(tire);
  const lip = mesh(new THREE.TorusGeometry(R * 0.72, 0.022, 8, 64), M.rim); lip.position.z = 0.24; g.add(lip);
  for (let i = 0; i < 12; i++) {
    const sp = mesh(new THREE.BoxGeometry(R * 0.66, 0.035, 0.03), M.rim);
    const a = i / 12 * Math.PI * 2; sp.position.set(Math.cos(a) * R * 0.36, Math.sin(a) * R * 0.36, 0.22); sp.rotation.z = a; g.add(sp);
  }
  const hub = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 24), M.rim); hub.rotation.x = Math.PI / 2; hub.position.z = 0.22; g.add(hub);
  return g;
}
{
  const g = new THREE.Group();
  for (const x of [WHEEL.x, -WHEEL.x]) for (const s of [1, -1]) {
    const w = wheel(); w.position.set(x, WHEEL.y, s * WHEEL.z); if (s < 0) w.rotation.y = Math.PI; g.add(w);
  }
  add('wheels', g);
}

// battery pack in the floor: tray + cylindrical cells
const PACK = { x0: -1.6, x1: 2.2, z: 1.3 };
{
  const g = new THREE.Group();
  const tray = mesh(new THREE.BoxGeometry(PACK.x1 - PACK.x0, 0.14, PACK.z * 2), M.tray); tray.position.set((PACK.x0 + PACK.x1) / 2, 0.44, 0); g.add(tray);
  const nx = 15, nz = 10, cg = new THREE.CylinderGeometry(0.105, 0.105, 0.22, 20);
  const cells = new THREE.InstancedMesh(cg, M.cell, nx * nz); cells.castShadow = cells.receiveShadow = true;
  const mt = new THREE.Matrix4(); let n = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    mt.makeTranslation(PACK.x0 + 0.17 + i * (PACK.x1 - PACK.x0 - 0.34) / (nx - 1), 0.62, -PACK.z + 0.17 + j * (2 * PACK.z - 0.34) / (nz - 1));
    cells.setMatrixAt(n++, mt);
  }
  g.add(cells);
  for (const z of [-PACK.z + 0.03, PACK.z - 0.03]) { const r = mesh(new THREE.BoxGeometry(PACK.x1 - PACK.x0, 0.12, 0.06), M.tray); r.position.set((PACK.x0 + PACK.x1) / 2, 0.6, z); g.add(r); }
  add('pack', g);
}

// two rear motors on the rear axle + half-shafts
{
  const g = new THREE.Group();
  for (const s of [1, -1]) {
    const m = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.5, 40), M.motor); m.rotation.x = Math.PI / 2; m.position.set(-WHEEL.x, WHEEL.y, s * 0.42); g.add(m);
    const ring = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 40), M.copper); ring.rotation.x = Math.PI / 2; ring.position.set(-WHEEL.x, WHEEL.y, s * 0.7); g.add(ring);
    for (let i = 0; i < 6; i++) {
      const fin = mesh(new THREE.BoxGeometry(0.5, 0.04, 0.46), M.motor); const a = i / 6 * Math.PI;
      fin.position.set(-WHEEL.x, WHEEL.y, s * 0.42); fin.rotation.z = a; fin.scale.set(1.5, 1, 1); g.add(fin);
    }
    const sh = mesh(new THREE.CylinderGeometry(0.055, 0.055, WHEEL.z - 0.74, 16), M.boss); sh.rotation.x = Math.PI / 2; sh.position.set(-WHEEL.x, WHEEL.y, s * (0.74 + WHEEL.z) / 2); g.add(sh);
  }
  add('motors', g);
}

// four underbody suction fans, rear of the floor, axis vertical
const FAN_Z = [-1.0, -0.34, 0.34, 1.0], FAN_X = -1.95;
const fanRotors = [];
{
  const g = new THREE.Group();
  for (const z of FAN_Z) {
    const duct = mesh(new THREE.LatheGeometry([[0.27, -0.09], [0.31, -0.09], [0.31, 0.09], [0.27, 0.09], [0.27, -0.09]].map(([r, y]) => new THREE.Vector2(r, y)), 48), M.fan);
    duct.position.set(FAN_X, 0.46, z); g.add(duct);
    const rot = new THREE.Group(); rot.position.set(FAN_X, 0.46, z);
    for (let i = 0; i < 7; i++) {
      const b = mesh(new THREE.BoxGeometry(0.2, 0.012, 0.075), M.fan); const a = i / 7 * Math.PI * 2;
      b.position.set(Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15); b.rotation.set(0.5, -a, 0, 'YXZ'); rot.add(b);
    }
    const hub = mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.1, 20), M.boss); rot.add(hub);
    g.add(rot); fanRotors.push(rot);
  }
  add('fans', g);
}

// two COPV tanks: 400 L in the passenger seat position, 200 L sphere behind the seats
const TANK_BIG = V3(0.3, 1.16, 0.72), TANK_SM = V3(-1.5, 1.08, 0);
{
  const g = new THREE.Group();
  const big = mesh(new THREE.CapsuleGeometry(0.42, 1.16, 16, 48), M.carbon); big.rotation.z = Math.PI / 2; big.position.copy(TANK_BIG); g.add(big);
  const sm = mesh(new THREE.SphereGeometry(0.48, 48, 32), M.carbon); sm.position.copy(TANK_SM); g.add(sm);
  for (const s of [1, -1]) { const b = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 24), M.boss); b.rotation.z = Math.PI / 2; b.position.set(TANK_BIG.x + s * 1.0, TANK_BIG.y, TANK_BIG.z); g.add(b); }
  const b2 = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 24), M.boss); b2.rotation.z = Math.PI / 2; b2.position.set(TANK_SM.x - 0.5, TANK_SM.y, 0); g.add(b2);
  add('tanks', g);
}

// single driver seat (left)
{
  const g = new THREE.Group();
  const cush = mesh(new THREE.BoxGeometry(0.9, 0.16, 0.62), M.seat); cush.position.set(0.35, 0.82, -0.72); g.add(cush);
  const back = mesh(new THREE.BoxGeometry(0.16, 1.0, 0.62), M.seat); back.position.set(-0.18, 1.28, -0.72); back.rotation.z = -0.32; g.add(back);
  for (const dz of [-0.33, 0.33]) { const bol = mesh(new THREE.BoxGeometry(0.2, 0.9, 0.08), M.seat2); bol.position.set(-0.12, 1.3, -0.72 + dz); bol.rotation.z = -0.32; g.add(bol); }
  add('seat', g);
}

// ten cold-gas nozzles
const NOZ = [
  ...[-1.1, -0.38, 0.38, 1.1].map(z => ({ kind: 'rear', pos: V3(-4.22, 0.8, z), dir: V3(-1, 0, 0), ex: V3(-0.9, 0, 0) })),
  ...[[1.95, 1.42], [1.95, -1.42], [-3.9, 1.42], [-3.9, -1.42]].map(([x, z]) => ({ kind: 'corner', pos: V3(x, 0.76, z), dir: V3(0, -1, 0), ex: V3(0, 0.05, Math.sign(z) * 0.8) })),
  ...[1, -1].map(s => ({ kind: 'yaw', pos: V3(3.75, 0.68, s * 1.4), dir: V3(0, 0, s), ex: V3(0, 0, s * 0.8) })),
];
const NOZ_LEN = 0.46;
{
  const prof = [[0.06, 0], [0.09, 0], [0.09, 0.12], [0.05, 0.2], [0.065, 0.26], [0.15, NOZ_LEN], [0.13, NOZ_LEN], [0.048, 0.25], [0.035, 0.2], [0.035, 0.0], [0.06, 0]];
  const ng = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 32);
  const g = new THREE.Group();
  for (const n of NOZ) {
    n.mat = new THREE.MeshStandardMaterial({ color: 0xcdc6b8, metalness: 1, roughness: 0.28, emissive: 0x7fd6ff, emissiveIntensity: 0, side: THREE.DoubleSide });
    const m = mesh(ng, n.mat); m.position.copy(n.pos); m.quaternion.setFromUnitVectors(V3(0, 1, 0), n.dir);
    n.grp = new THREE.Group(); n.grp.add(m); g.add(n.grp);
    n.exit = n.pos.clone().addScaledVector(n.dir, NOZ_LEN);
  }
  add('nozzles', g);
}

// ---------------------------------------------------------------- gas path: tanks -> manifold -> 10 nozzles
const MAN = V3(-2.45, 1.14, 0);
const pipeDefs = [
  { trunk: true, pts: [V3(-0.72, 1.2, 0.72), V3(-1.05, 1.26, 0.74), V3(-1.75, 1.26, 0.68), V3(-2.2, 1.17, 0.3), MAN] },
  { trunk: true, pts: [V3(-1.96, 1.08, 0), V3(-2.22, 1.12, 0), MAN] },
];
for (const n of NOZ) {
  const z = n.pos.z, s = Math.sign(z);
  if (n.kind === 'rear') pipeDefs.push({ n, pts: [MAN, V3(-2.85, 1.18, z * 0.45), V3(-3.6, 1.05, z), V3(-3.95, 0.86, z), n.pos] });
  else if (n.kind === 'corner' && n.pos.x < 0) pipeDefs.push({ n, pts: [MAN, V3(-2.35, 1.0, s * 0.85), V3(-3.2, 1.0, s * 1.1), V3(-3.75, 1.04, s * 1.3), V3(-3.9, 1.0, z), n.pos] });
  else if (n.kind === 'corner') pipeDefs.push({ n, pts: [MAN, V3(-2.1, 0.92, s * 0.95), V3(-1.3, 0.82, s * 1.12), V3(1.3, 0.82, s * 1.12), V3(1.8, 1.0, s * 1.3), V3(1.95, 1.0, z), n.pos] });
  else pipeDefs.push({ n, pts: [MAN, V3(-2.0, 0.96, s * 1.02), V3(-1.2, 0.9, s * 1.04), V3(2.3, 0.9, s * 1.04), V3(3.3, 0.76, s * 1.04), V3(3.75, 0.68, s * 1.06), n.pos] });
}
const GLOW_VS = `uniform float uS0, uLen; varying float vS;
  void main() { vS = uS0 + uv.x * uLen; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const GLOW_FS = `uniform float uHead, uT, uOn; varying float vS;
  void main() {
    float lit = smoothstep(uHead, uHead - 0.5, vS);
    float dash = 0.5 + 0.5 * sin((vS - uT * 5.0) * 7.0);
    gl_FragColor = vec4(vec3(0.45, 0.86, 1.0) * (0.55 + 0.9 * dash), uOn * lit * (0.35 + 0.65 * dash));
  }`;
const pipes = new THREE.Group(); car.add(pipes);
let S_MAN = 0;
for (const d of pipeDefs) { d.curve = new THREE.CatmullRomCurve3(d.pts, false, 'centripetal'); d.len = d.curve.getLength(); if (d.trunk) S_MAN = Math.max(S_MAN, d.len); }
let S_MAX = 0;
for (const d of pipeDefs) {
  const s0 = d.trunk ? S_MAN - d.len : S_MAN;
  const base = new THREE.Mesh(new THREE.TubeGeometry(d.curve, 120, 0.04, 8), M.pipe); pipes.add(base);
  d.mat = new THREE.ShaderMaterial({
    vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uS0: { value: s0 }, uLen: { value: d.len }, uHead: { value: 0 }, uT: { value: 0 }, uOn: { value: 0 } },
  });
  const glow = new THREE.Mesh(new THREE.TubeGeometry(d.curve, 160, 0.075, 10), d.mat); glow.renderOrder = 5; pipes.add(glow);
  if (d.n) { d.n.sEnd = s0 + d.len; S_MAX = Math.max(S_MAX, d.n.sEnd); }
}
{
  const man = mesh(new THREE.BoxGeometry(0.34, 0.18, 0.5), M.pipe); man.position.copy(MAN); pipes.add(man);
}

// ---------------------------------------------------------------- cold-gas plumes (seeded particles, pure function of t)
const PER = 260, NP = PER * 4;
const plumeGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(NP * 3), pSize = new Float32Array(NP), pAlpha = new Float32Array(NP);
plumeGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
plumeGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
plumeGeo.setAttribute('aAlpha', new THREE.BufferAttribute(pAlpha, 1));
const plumeMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uScale: { value: H / (2 * Math.tan(THREE.MathUtils.degToRad(15))) } },
  vertexShader: `attribute float aSize; attribute float aAlpha; uniform float uScale; varying float vA;
    void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / -mv.z; vA = aAlpha; }`,
  fragmentShader: `varying float vA;
    void main() { float r = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, r); a *= a; if (a * vA < 0.003) discard;
      gl_FragColor = vec4(0.93, 0.96, 1.0, a * vA); }`,
});
const plumes = new THREE.Points(plumeGeo, plumeMat); plumes.frustumCulled = false; plumes.renderOrder = 10; scene.add(plumes);
const SEED = [];
{ const r = mulberry32(20261015); for (let i = 0; i < NP; i++) SEED.push([r(), r(), r(), r(), r(), r()]); }
const CORNERS = NOZ.filter(n => n.kind === 'corner');
const PUFF0 = 10.1, PUFF1 = 12.0;
const lift = t => 1.15 * prog(t, 10.3, 11.6);
const JET_VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const JET_FS = `uniform float uI; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main() { float e = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float a = uI * e * pow(vUv.y, 0.8) * 0.75;
    gl_FragColor = vec4(0.9, 0.95, 1.0, a); }`;
const jets = CORNERS.map(n => {
  const g = new THREE.CylinderGeometry(0.07, 0.38, 1, 32, 1, true); g.translate(0, -0.5, 0);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: JET_VS, fragmentShader: JET_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uI: { value: 0 } } }));
  m.renderOrder = 9; m.visible = false; scene.add(m); return { n, m };
});
function updatePlumes(t) {
  const I = prog(t, PUFF0, PUFF0 + 0.15) * (0.85 + 0.15 * Math.sin(t * 23.0));
  for (const { n, m } of jets) {
    const y = n.exit.y + lift(t);
    m.visible = I > 0.01; m.material.uniforms.uI.value = I;
    m.position.set(n.exit.x, y, n.exit.z); m.scale.set(1, Math.max(0.05, y - 0.03), 1);
  }

  for (let i = 0; i < NP; i++) {
    const n = CORNERS[Math.floor(i / PER)], j = i % PER, [r1, r2, r3, r4, r5, r6] = SEED[i];
    const b = PUFF0 + (j + r1) / PER * (PUFF1 - PUFF0), age = t - b, life = 0.75 + 0.6 * r5;
    if (age < 0 || age > life) { pAlpha[i] = 0; pSize[i] = 0; pPos.set([0, -10, 0], i * 3); continue; }
    const y0 = n.exit.y + lift(b), v0 = 5 + 3 * r3, tau = 0.45;
    const travel = v0 * tau * (1 - Math.exp(-age / tau));
    let y = y0 - travel, over = 0;
    if (y < 0.06) { over = 0.06 - y; y = 0.06 + over * 0.3 * r6; }
    const phi = r2 * Math.PI * 2, rad = 0.07 * travel + 0.75 * over * (0.4 + 0.6 * r4);
    pPos.set([n.exit.x + Math.cos(phi) * rad, y, n.exit.z + Math.sin(phi) * rad], i * 3);
    pSize[i] = 0.12 + 0.55 * age + 0.4 * over + 0.08 * r4;
    pAlpha[i] = 0.6 * Math.pow(1 - age / life, 1.5) * clamp(age / 0.04);
  }
  plumeGeo.attributes.position.needsUpdate = true; plumeGeo.attributes.aSize.needsUpdate = true; plumeGeo.attributes.aAlpha.needsUpdate = true;
}

// ---------------------------------------------------------------- callouts
const svg = document.getElementById('lines'), labsEl = document.getElementById('labs');
const SVGNS = 'http://www.w3.org/2000/svg';
function callout(L, cls = '') {
  L.line = document.createElementNS(SVGNS, 'line'); L.line.setAttribute('stroke', 'rgba(255,255,255,.8)'); L.line.setAttribute('stroke-width', '2');
  L.dot = document.createElementNS(SVGNS, 'circle'); L.dot.setAttribute('r', '6'); L.dot.setAttribute('fill', cls ? '#8fdcff' : '#ffb547'); L.dot.setAttribute('stroke', '#15181d'); L.dot.setAttribute('stroke-width', '2');
  svg.append(L.line, L.dot);
  L.el = document.createElement('div'); L.el.className = 'lab ' + cls; L.el.innerHTML = L.txt; labsEl.appendChild(L.el);
  return L;
}
const LABS = [
  { part: 'pack', p: V3(1.6, 0.73, 1.05), off: [150, 150], txt: '底板电池包 <i>4680 电芯</i>', hl: [M.cell] },
  { part: 'motors', p: V3(-WHEEL.x, WHEEL.y + 0.3, 0.42), off: [-210, 120], txt: '后轴双电机', hl: [M.motor] },
  { part: 'fans', p: V3(FAN_X, 0.55, 0.34), off: [-60, 190], txt: '车底吸附风扇', hl: [M.fan] },
  { part: 'tanks', p: V3(TANK_BIG.x + 0.4, TANK_BIG.y + 0.42, TANK_BIG.z), off: [400, -30], txt: '碳纤维高压气罐<i>（共 600 升）</i>', hl: [M.carbon] },
  { part: 'nozzles', p: NOZ[8].exit.clone(), off: [230, 40], txt: '冷气喷嘴 <i>× 10</i>', hl: NOZ.map(n => n.mat) },
].map(L => callout(L));
const END = [
  { part: 'nozzles', p: NOZ[1].exit.clone(), off: [-170, -150], txt: '后推 × 4 <i>· 合计超 80 kN</i>' },
  { part: 'nozzles', p: NOZ[6].exit.clone(), off: [-240, 90], txt: '四角 × 4 <i>· 朝下</i>' },
  { part: 'nozzles', p: NOZ[8].exit.clone(), off: [120, -140], txt: '车头偏航 × 2' },
].map(L => callout(L, 'gas'));
const proj = v => { const p = v.clone().project(camera); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H]; };
function place(L, a) {
  const w = parts[L.part].localToWorld(L.p.clone());
  const [x, y] = proj(w);
  const hw = (L.el.offsetWidth || 300) / 2, hh = L.el.offsetHeight / 2 || 30;
  const lx = clamp(x + L.off[0], hw + 40, W - hw - 40), ly = clamp(y + L.off[1], hh + 40, H - hh - 90);
  const ey = L.off[1] < 0 ? ly + hh : ly - hh;
  L.line.setAttribute('x1', x); L.line.setAttribute('y1', y); L.line.setAttribute('x2', lx); L.line.setAttribute('y2', ey);
  L.dot.setAttribute('cx', x); L.dot.setAttribute('cy', y);
  L.el.style.left = lx + 'px'; L.el.style.top = ly + 'px';
  const k = clamp(a);
  L.el.style.opacity = k; L.line.setAttribute('opacity', k); L.dot.setAttribute('opacity', k);
  L.el.style.transform = `translate(-50%,-50%) translateY(${(1 - k) * (L.off[1] < 0 ? 14 : -14)}px)`;
}

// ---------------------------------------------------------------- camera keys: [t, azimuth, elevation, distance, target x, target y]
const camK = [
  [0.0, 62, 9, 20.5, 0.3, 0.95], [2.0, 30, 14, 21.5, 0.2, 1.1], [3.5, 22, 31, 27, -0.3, 2.6],
  [6.8, 6, 32, 27, -0.3, 2.6], [8.1, -30, 26, 19, -0.5, 0.9], [9.6, -16, 19, 19, -0.3, 0.9],
  [10.4, 0, 4, 21, 0, 1.15], [12.0, 0, 4, 20.5, 0, 1.45],
];
const cAz = track(camK.map(k => [k[0], k[1]])), cEl = track(camK.map(k => [k[0], k[2]])), cD = track(camK.map(k => [k[0], k[3]]));
const cTx = track(camK.map(k => [k[0], k[4]])), cTy = track(camK.map(k => [k[0], k[5]]));

// ---------------------------------------------------------------- render
const vigScene = new THREE.Scene(), vigCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
vigScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  transparent: true, depthTest: false, depthWrite: false,
  vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `void main() {
    vec2 q = vec2((gl_FragCoord.x - ${W / 2}.0) / ${W * 0.75}.0, (${H}.0 - gl_FragCoord.y - ${(H * 0.48).toFixed(1)}) / ${(H * 0.7).toFixed(1)});
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.45 * clamp((length(q) - 0.55) / 0.45, 0.0, 1.0));
  }`,
})));
const $ = id => document.getElementById(id);
const LAB_T = [3.3, 3.85, 4.4, 4.95, 5.5];
window.__render = t => {
  const back = prog(t, 6.9, 8.0);
  const ex = (s, d = 1.4) => prog(t, s, s + d) * (1 - back);
  const kS = ex(2.0);
  shell.position.set(0, 4.2 * kS, -1.0 * kS);
  for (const d of doors) {
    const k = ex(2.15, 1.5);
    d.root.position.set(0, 4.2 * kS + 0.25 * k, -1.0 * kS + d.side * 0.9 * k);
    d.pivot.quaternion.setFromAxisAngle(d.axis, d.up * 0.95 * k);
  }
  const kW = ex(2.3);
  wing.position.set(-2.5 * kW, 3.7 * kW, -1.0 * kW);
  wing.userData.pitch.rotation.z = THREE.MathUtils.degToRad(4 + 14 * Math.sin(Math.PI * clamp((t - 3.4) / 3.2)) * kW);
  parts.tanks.position.y = 1.75 * ex(2.6);
  parts.seat.position.y = 0.9 * ex(2.6);
  parts.motors.position.x = -1.15 * ex(2.8);
  parts.fans.position.y = -0.16 * ex(2.9);
  const kN = ex(3.0);
  for (const n of NOZ) n.grp.position.copy(n.ex).multiplyScalar(kN);
  fanRotors.forEach((r, i) => { r.rotation.y = t * 7.5 + i * 0.7; });

  // x-ray during the gas-path segment, opaque again for the flight
  const xr = prog(t, 7.4, 8.1) * (1 - prog(t, 9.85, 10.35));
  const bo = 1 - 0.86 * xr;
  for (const m of SHELL_MATS) { m.opacity = bo; m.depthWrite = bo > 0.99; }
  M.glass.opacity = 0.62 * (1 - 0.75 * xr);
  const pOn = prog(t, 7.6, 8.0) * (1 - prog(t, 9.85, 10.2));
  M.pipe.opacity = pOn; pipes.visible = pOn > 0.01;
  const on = prog(t, 7.8, 8.05) * (1 - prog(t, 9.85, 10.2));
  const head = (S_MAX + 0.6) * clamp((t - 7.95) / 1.35);
  for (const d of pipeDefs) { d.mat.uniforms.uHead.value = head; d.mat.uniforms.uT.value = t; d.mat.uniforms.uOn.value = on; }

  // highlights: amber when a label appears, cyan along the gas path
  for (const m of [M.cell, M.motor, M.fan, M.carbon, ...NOZ.map(n => n.mat)]) { m.emissive.setHex(0xff9a2e); m.emissiveIntensity = 0; }
  LABS.forEach((L, i) => {
    const k = 0.55 * Math.sin(Math.PI * clamp((t - LAB_T[i]) / 0.9)) + 0.1 * prog(t, LAB_T[i], LAB_T[i] + 0.4) * (1 - prog(t, 6.6, 7.0));
    for (const m of L.hl) m.emissiveIntensity = Math.max(m.emissiveIntensity, k);
  });
  if (on > 0) {
    M.carbon.emissive.setHex(0x5fc8ff); M.carbon.emissiveIntensity = 0.32 * on;
    for (const n of NOZ) { n.mat.emissive.setHex(0x7fd6ff); n.mat.emissiveIntensity = on * clamp((head - n.sEnd + 0.1) / 0.4) * (1.2 + 0.4 * Math.sin(t * 9)); }
  }

  car.position.y = lift(t);
  updatePlumes(t);

  const az = THREE.MathUtils.degToRad(cAz(t)), el = THREE.MathUtils.degToRad(cEl(t)), d = cD(t);
  const tgt = V3(cTx(t), cTy(t), 0);
  camera.position.set(tgt.x + d * Math.sin(az) * Math.cos(el), tgt.y + d * Math.sin(el), tgt.z + d * Math.cos(az) * Math.cos(el));
  camera.lookAt(tgt); camera.updateMatrixWorld(true);
  scene.updateMatrixWorld(true);
  renderer.render(scene, camera);
  renderer.autoClear = false; renderer.render(vigScene, vigCam); renderer.autoClear = true;

  LABS.forEach((L, i) => place(L, prog(t, LAB_T[i], LAB_T[i] + 0.4) * (1 - prog(t, 6.6, 7.0))));
  END.forEach((L, i) => place(L, prog(t, 8.5 + i * 0.25, 8.9 + i * 0.25) * (1 - prog(t, 9.7, 10.0))));
  $('title').style.opacity = prog(t, 0, 0.5) * (1 - prog(t, 7.0, 7.4));
  $('sub').style.opacity = prog(t, 0.3, 0.8) * (1 - prog(t, 7.0, 7.4));
  $('c1').style.opacity = prog(t, 7.9, 8.3) * (1 - prog(t, 9.8, 10.1));
  $('c2').style.opacity = prog(t, 10.5, 10.9);
  return { seg: 'explode3d', tau: t.toFixed(2) };
};
await document.fonts.load('500 38px "Noto Sans CJK SC"');
await document.fonts.load('700 54px "Noto Sans CJK SC"');
window.__render(0);
window.__ready = true;
