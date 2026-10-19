import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const W = 1920, H = 1080;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const prog = (t, a, b) => ease((t - a) / (b - a));
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function track(keys) {
  const n = keys.length, T = keys.map(k => k[0]), V = keys.map(k => k[1]), h = [], d = [];
  for (let i = 0; i < n - 1; i++) { h.push(T[i + 1] - T[i]); d.push((V[i + 1] - V[i]) / h[i]); }
  const m = new Array(n); m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    const p = (d[i - 1] * h[i] + d[i] * h[i - 1]) / (h[i - 1] + h[i]);
    m[i] = (Math.sign(d[i - 1]) + Math.sign(d[i])) * Math.min(Math.abs(d[i - 1]), Math.abs(d[i]), 0.5 * Math.abs(p));
  }
  return t => {
    if (t <= T[0]) return V[0] + m[0] * (t - T[0]);
    if (t >= T[n - 1]) return V[n - 1] + m[n - 1] * (t - T[n - 1]);
    let i = 0; while (t > T[i + 1]) i++;
    const hh = h[i], s = (t - T[i]) / hh, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * V[i] + (s3 - 2 * s2 + s) * hh * m[i] + (-2 * s3 + 3 * s2) * V[i + 1] + (s3 - s2) * hh * m[i + 1];
  };
}

// ---------------------------------------------------------------- glyphs of 日 (unit box, y down, centred)
// stamp brush: pts = [x, y, width] in glyph units
function brush(g, cx, cy, s, pts, k = 1, flat = 0) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0, w0] = pts[i], [x1, y1, w1] = pts[i + 1];
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * s / 1.0));
    for (let j = 0; j <= n; j++) {
      const u = j / n; g.beginPath();
      const R = Math.max(0.5, (w0 + (w1 - w0) * u) * s * k / 2);
      g.ellipse(cx + (x0 + (x1 - x0) * u) * s, cy + (y0 + (y1 - y0) * u) * s, R * (1 + 0.25 * flat), R * (1 - 0.42 * flat), -0.75, 0, Math.PI * 2); g.fill();
    }
  }
}
const GLYPH = {
  // 甲骨文: knife-cut outline (straight segments that overshoot at joints) + short inner stroke
  jgw(g, cx, cy, s, k = 1) {
    const P = [[-0.28, -0.3], [0.01, -0.345], [0.27, -0.29], [0.335, -0.01], [0.28, 0.3], [-0.02, 0.355], [-0.29, 0.29], [-0.34, 0.02]];
    g.lineWidth = 0.03 * s * k; g.lineCap = 'butt';
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], e = 0.09;
      g.beginPath(); g.moveTo(cx + (a[0] - dx * e) * s, cy + (a[1] - dy * e) * s); g.lineTo(cx + (b[0] + dx * e) * s, cy + (b[1] + dy * e) * s); g.stroke();
    }
    g.beginPath(); g.moveTo(cx - 0.11 * s, cy + 0.015 * s); g.lineTo(cx + 0.1 * s, cy); g.stroke();
  },
  // 金文: thick cast circle + round dot
  jw(g, cx, cy, s, k = 1) {
    g.lineWidth = 0.085 * s * k; g.beginPath();
    for (let i = 0; i <= 160; i++) {
      const a = i / 160 * Math.PI * 2, r = 0.32 * (1 + 0.025 * Math.sin(3 * a + 1) + 0.018 * Math.sin(5 * a + 2));
      const x = cx + r * Math.cos(a) * s * 0.97, y = cy + r * Math.sin(a) * s; i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath(); g.stroke();
    g.beginPath(); g.ellipse(cx + 0.005 * s, cy + 0.01 * s, (0.072 + 0.01 * (k - 1)) * s, (0.068 + 0.01 * (k - 1)) * s, 0, 0, Math.PI * 2); g.fill();
  },
  // 小篆: tall rounded rectangle, even-width strokes, one horizontal across the middle
  xz(g, cx, cy, s, k = 1) {
    g.lineWidth = 0.05 * s * k; g.lineCap = 'round';
    g.beginPath(); g.roundRect(cx - 0.23 * s, cy - 0.38 * s, 0.46 * s, 0.76 * s, 0.2 * s); g.stroke();
    g.beginPath(); g.moveTo(cx - 0.23 * s, cy); g.lineTo(cx + 0.23 * s, cy); g.stroke();
  },
  // 隶书: flat and wide, straight strokes, slight flare at the end of the bottom stroke
  ls(g, cx, cy, s, k = 1) {
    brush(g, cx, cy, s, [[-0.36, -0.255, 0.075], [-0.358, 0.0, 0.064], [-0.355, 0.255, 0.07]], k);
    brush(g, cx, cy, s, [[-0.375, -0.262, 0.088], [-0.3, -0.265, 0.06], [0.3, -0.262, 0.056], [0.35, -0.262, 0.074], [0.36, -0.23, 0.07], [0.355, 0.255, 0.064]], k);
    brush(g, cx, cy, s, [[-0.34, 0.0, 0.072], [-0.28, 0.0, 0.05], [0.3, -0.002, 0.05], [0.335, 0.0, 0.06]], k);
    brush(g, cx, cy, s, [[-0.385, 0.262, 0.088], [-0.3, 0.262, 0.058], [0.3, 0.262, 0.054], [0.4, 0.255, 0.076], [0.45, 0.24, 0.05], [0.485, 0.229, 0.018]], k);
  },
  // 楷书: brush-written regular script
  ks(g, cx, cy, s, k = 1) {
    brush(g, cx, cy, s, [[-0.24, -0.365, 0.095], [-0.222, -0.33, 0.076], [-0.216, 0.0, 0.07], [-0.211, 0.34, 0.074], [-0.215, 0.372, 0.062]], k, 1);
    brush(g, cx, cy, s, [[-0.212, -0.345, 0.066], [0.0, -0.36, 0.054], [0.19, -0.374, 0.06], [0.248, -0.392, 0.1], [0.258, -0.35, 0.092], [0.238, 0.0, 0.076], [0.228, 0.33, 0.07], [0.218, 0.372, 0.084]], k, 1);
    brush(g, cx, cy, s, [[-0.2, 0.0, 0.062], [0.0, -0.01, 0.05], [0.198, -0.02, 0.056]], k, 1);
    brush(g, cx, cy, s, [[-0.2, 0.336, 0.062], [0.0, 0.326, 0.05], [0.21, 0.32, 0.06]], k, 1);
  },
};
const paintGlyph = (g, key, cx, cy, s, col, k = 1) => { g.fillStyle = col; g.strokeStyle = col; GLYPH[key](g, cx, cy, s, k); };
// carved groove: dark upper-left wall, lit lower-right lip, recessed floor
function engrave(g, key, cx, cy, s, c) {
  const d = s * 0.006;
  g.save();
  paintGlyph(g, key, cx + d, cy + d, s, c.lip, 1.15);
  paintGlyph(g, key, cx - d * 0.6, cy - d * 0.6, s, c.wall, 1.1);
  paintGlyph(g, key, cx + d * 0.3, cy + d * 0.3, s, c.floor, 0.78);
  g.restore();
}

// ---------------------------------------------------------------- canvas texture helpers
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, srgb = true, rep) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
function blobs(g, w, h, r, n, col, r0, r1, blur = 0) {
  g.save(); if (blur) g.filter = `blur(${blur}px)`;
  for (let i = 0; i < n; i++) { g.fillStyle = col(r); g.beginPath(); g.arc(r() * w, r() * h, r0 + (r1 - r0) * r(), 0, Math.PI * 2); g.fill(); }
  g.restore();
}
function grain(g, w, h, r, n, a) {
  for (let i = 0; i < n; i++) { const v = r() * 255 | 0; g.fillStyle = `rgba(${v},${v},${v},${a})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
}

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060506);
scene.fog = new THREE.FogExp2(0x060506, 0.045);
const camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 120);
scene.add(new THREE.HemisphereLight(0x2a2230, 0x0a0706, 0.55));
const moon = new THREE.DirectionalLight(0x6f86b8, 0.35); moon.position.set(8, 6, -6); scene.add(moon);
const FLOOR_Y = -1.9;
{
  const [c, g] = cv(1024, 1024), r = rng(3);
  g.fillStyle = '#2a2420'; g.fillRect(0, 0, 1024, 1024);
  blobs(g, 1024, 1024, r, 260, r => `rgba(${60 + r() * 40 | 0},${50 + r() * 30 | 0},${40 + r() * 25 | 0},0.35)`, 20, 90, 18);
  grain(g, 1024, 1024, r, 40000, 0.12);
  g.strokeStyle = 'rgba(10,8,6,.7)'; g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 256); g.lineTo(1024, i * 256); g.stroke(); g.beginPath(); g.moveTo(i * 256 + (i % 2) * 40, 0); g.lineTo(i * 256 + (i % 2) * 40, 1024); g.stroke(); }
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), new THREE.MeshStandardMaterial({ map: tex(c, true, [24, 12]), roughness: 0.82, metalness: 0.0 }));
  fl.rotation.x = -Math.PI / 2; fl.position.set(14, FLOOR_Y, -4); fl.receiveShadow = true; scene.add(fl);
}
const wl = (o, v) => { o.updateMatrixWorld(true); return o.localToWorld(v.clone()); };
const shadowy = o => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

// ---------------------------------------------------------------- carriers
const STAGES = [];
const SP = 5.8, SZ = -1.6;
const P = i => V3(SP * i, 0, SZ * i);

// 1. oracle bone: turtle plastron, dome-shaped, burn pits + crack signs, incised glyph
{
  const Wd = 2.7, Ht = 3.4, CW = 1024, CH = Math.round(1024 * Ht / Wd);
  const outline = g => {
    const R = [[0, -0.5], [0.2, -0.49], [0.36, -0.42], [0.43, -0.28], [0.41, -0.16], [0.47, -0.08], [0.48, 0.12], [0.43, 0.2], [0.42, 0.32], [0.33, 0.44], [0.16, 0.5], [0.06, 0.47], [0, 0.44]];
    const pts = R.concat(R.slice(1, -1).reverse().map(([x, y]) => [-x, y]));
    g.beginPath();
    pts.forEach(([x, y], i) => { const X = (0.5 + x) * CW, Y = (0.5 + y) * CH; if (i === 0) g.moveTo(X, Y); else { const [px, py] = pts[i - 1]; g.quadraticCurveTo((0.5 + px) * CW, (0.5 + py) * CH, (X + (0.5 + px) * CW) / 2, (Y + (0.5 + py) * CH) / 2); } });
    g.closePath();
  };
  const [c, g] = cv(CW, CH), [b, gb] = cv(CW, CH), [a, ga] = cv(CW, CH), r = rng(11);
  const gr = g.createRadialGradient(CW * 0.5, CH * 0.45, 50, CW * 0.5, CH * 0.5, CW * 0.62);
  gr.addColorStop(0, '#dcc79c'); gr.addColorStop(0.7, '#c4a876'); gr.addColorStop(1, '#8a6a42');
  g.fillStyle = gr; g.fillRect(0, 0, CW, CH);
  blobs(g, CW, CH, r, 220, r => `rgba(${120 + r() * 60 | 0},${90 + r() * 40 | 0},${50 + r() * 30 | 0},0.18)`, 10, 70, 14);
  grain(g, CW, CH, r, 30000, 0.08);
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, CW, CH); grain(gb, CW, CH, r, 30000, 0.15);
  // scute seams
  const seam = (gg, col, w) => {
    gg.strokeStyle = col; gg.lineWidth = w; gg.beginPath(); gg.moveTo(CW * 0.5, CH * 0.05); gg.bezierCurveTo(CW * 0.49, CH * 0.35, CW * 0.515, CH * 0.65, CW * 0.5, CH * 0.97); gg.stroke();
    for (const y of [0.17, 0.36, 0.63, 0.83]) { gg.beginPath(); gg.moveTo(CW * 0.04, CH * (y + 0.02)); gg.bezierCurveTo(CW * 0.3, CH * (y - 0.02), CW * 0.7, CH * (y + 0.025), CW * 0.96, CH * (y - 0.01)); gg.stroke(); }
  };
  seam(g, 'rgba(80,52,26,.55)', 5); seam(gb, '#404040', 6);
  // drilled-and-chiselled hollows with burn marks + ㄒ-shaped crack signs, along both sides
  const pits = [[0.2, 0.12], [0.8, 0.12], [0.16, 0.3], [0.84, 0.3], [0.17, 0.72], [0.83, 0.72], [0.22, 0.9], [0.78, 0.9]];
  for (const [px, py] of pits) {
    const x = px * CW, y = py * CH, dir = px < 0.5 ? 1 : -1;
    g.save(); g.filter = 'blur(6px)'; g.fillStyle = 'rgba(40,20,8,.55)'; g.beginPath(); g.ellipse(x, y, 34, 52, 0, 0, Math.PI * 2); g.fill(); g.restore();
    g.fillStyle = 'rgba(52,30,14,.85)'; g.beginPath(); g.ellipse(x, y, 16, 34, 0, 0, Math.PI * 2); g.fill();
    gb.fillStyle = '#202020'; gb.beginPath(); gb.ellipse(x, y, 16, 34, 0, 0, Math.PI * 2); gb.fill();
    g.strokeStyle = 'rgba(40,22,10,.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y - 40); g.lineTo(x + r() * 6 - 3, y + 44); g.stroke();
    g.beginPath(); g.moveTo(x + r() * 4, y - 6); g.lineTo(x + dir * (55 + r() * 25), y - 18 - r() * 16); g.stroke();
  }
  // glyph
  const gx = CW * 0.5, gy = CH * 0.47, gs = CW * 0.56;
  engrave(g, 'jgw', gx, gy, gs, { lip: 'rgba(245,228,190,.9)', wall: '#2c1a0c', floor: '#5a3a1c' });
  gb.save(); gb.filter = 'blur(2px)'; paintGlyph(gb, 'jgw', gx, gy, gs, '#000', 1.05); gb.restore();
  // alpha: plastron outline, edge darkening
  ga.fillStyle = '#000'; ga.fillRect(0, 0, CW, CH); ga.fillStyle = '#fff'; outline(ga); ga.fill();
  g.save(); outline(g); g.lineWidth = 46; g.strokeStyle = 'rgba(90,60,30,.55)'; g.filter = 'blur(10px)'; g.stroke(); g.restore();
  const geo = new THREE.PlaneGeometry(Wd, Ht, 120, 150);
  const pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i) / (Wd / 2), y = pa.getY(i) / (Ht / 2); pa.setZ(i, 0.32 * Math.max(0, 1 - 0.75 * x * x - 0.45 * y * y)); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex(c), bumpMap: tex(b, false), bumpScale: 3.0, alphaMap: tex(a, false), alphaTest: 0.5, roughness: 0.58, side: THREE.DoubleSide }));
  const grp = new THREE.Group(); grp.add(shadowy(m));
  m.rotation.x = -0.42; m.position.y = FLOOR_Y + (Ht / 2) * Math.cos(0.42) + 0.02;
  grp.position.copy(P(0)); grp.rotation.y = 0.12; scene.add(grp);
  const local = V3(0, Ht * (0.5 - 0.47), 0.3).applyEuler(m.rotation).add(m.position);
  STAGES.push({ obj: grp, focus: wl(grp, local.clone()), dist: 6.4 });
}

// 2. bronze ding: patina, thunder-cloud band, cast inscription on the belly
{
  const r = rng(21);
  const [c, g] = cv(1024, 1024), [b, gb] = cv(1024, 1024);
  g.fillStyle = '#4a3a22'; g.fillRect(0, 0, 1024, 1024);
  blobs(g, 1024, 1024, r, 300, r => r() < 0.55 ? `rgba(${50 + r() * 30 | 0},${110 + r() * 40 | 0},${88 + r() * 30 | 0},0.30)` : `rgba(${110 + r() * 40 | 0},${80 + r() * 30 | 0},${40 + r() * 20 | 0},0.25)`, 12, 80, 10);
  grain(g, 1024, 1024, r, 40000, 0.1);
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, 1024, 1024); blobs(gb, 1024, 1024, r, 400, r => `rgba(${r() * 255 | 0},${r() * 255 | 0},${r() * 255 | 0},0.12)`, 4, 30, 3);
  const patina = tex(c, true, [3, 1.5]), pbump = tex(b, false, [3, 1.5]);
  const bronze = new THREE.MeshStandardMaterial({ map: patina, bumpMap: pbump, bumpScale: 2, metalness: 0.65, roughness: 0.5, color: 0xffffff });
  const prof = [[0, -1.08], [0.6, -1.05], [1.05, -0.93], [1.28, -0.72], [1.38, -0.48], [1.4, -0.3], [1.4, 0.45], [1.36, 0.55], [1.5, 0.62], [1.52, 0.7], [1.38, 0.7], [1.33, 0.2], [1.25, -0.6], [0, -0.85]];
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 128), bronze);
  const grp = new THREE.Group(); grp.add(body);
  // thunder-cloud (雲雷紋) band: square spirals
  {
    const [bc, bg] = cv(512, 128), [bb, bbg] = cv(512, 128);
    bg.fillStyle = '#3d3020'; bg.fillRect(0, 0, 512, 128); bbg.fillStyle = '#909090'; bbg.fillRect(0, 0, 512, 128);
    const spiral = (gg, x0, y0, sz, flip, col, lw) => {
      gg.strokeStyle = col; gg.lineWidth = lw; gg.beginPath();
      let x = x0, y = y0, L = sz, dir = 0; gg.moveTo(x, y);
      for (let i = 0; i < 7; i++) { const dx = [1, 0, -1, 0][dir] * L * flip, dy = [0, 1, 0, -1][dir] * L; x += dx; y += dy; gg.lineTo(x, y); dir = (dir + 1) % 4; if (i % 2) L -= sz / 4; }
      gg.stroke();
    };
    for (let i = 0; i < 4; i++) {
      spiral(bg, i * 128 + 8, 14, 52, 1, 'rgba(120,150,120,.55)', 7); spiral(bg, i * 128 + 120, 62, 52, -1, 'rgba(120,150,120,.55)', 7);
      spiral(bbg, i * 128 + 8, 14, 52, 1, '#d0d0d0', 8); spiral(bbg, i * 128 + 120, 62, 52, -1, '#d0d0d0', 8);
    }
    bg.fillStyle = 'rgba(60,110,90,.25)'; bg.fillRect(0, 0, 512, 6); bg.fillRect(0, 122, 512, 6);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.408, 1.408, 0.3, 128, 1, true), new THREE.MeshStandardMaterial({ map: tex(bc, true, [10, 1]), bumpMap: tex(bb, false, [10, 1]), bumpScale: 3, metalness: 0.6, roughness: 0.5 }));
    band.position.y = 0.3; grp.add(band);
  }
  // inscription decal (sunken, cast)
  {
    const [dc, dg] = cv(512, 512), [db, dbg] = cv(512, 512);
    dbg.fillStyle = '#fff'; dbg.fillRect(0, 0, 512, 512);
    engrave(dg, 'jw', 256, 256, 450, { lip: 'rgba(170,190,150,.85)', wall: 'rgba(12,9,6,1)', floor: 'rgba(38,30,18,1)' });
    dbg.save(); dbg.filter = 'blur(2px)'; paintGlyph(dbg, 'jw', 256, 256, 450, '#000', 1.05); dbg.restore();
    const th = 1.0 / 1.41;
    const geo = new THREE.CylinderGeometry(1.412, 1.412, 1.0, 48, 1, true, -th / 2, th);
    const dm = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex(dc), bumpMap: tex(db, false), bumpScale: 4, transparent: true, metalness: 0.4, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
    dm.position.y = -0.24; grp.add(dm);
  }
  // ears and legs
  {
    const s = new THREE.Shape(); s.moveTo(-0.32, 0); s.lineTo(-0.34, 0.62); s.quadraticCurveTo(0, 0.7, 0.34, 0.62); s.lineTo(0.32, 0);
    s.lineTo(0.2, 0); s.lineTo(0.21, 0.48); s.quadraticCurveTo(0, 0.53, -0.21, 0.48); s.lineTo(-0.2, 0); s.closePath();
    const eg = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }); eg.translate(0, 0, -0.06);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(eg, bronze); e.rotation.y = Math.PI / 2; e.position.set(sx * 1.4, 0.68, 0); grp.add(e); }
    const lg = new THREE.LatheGeometry([[0, -0.95], [0.2, -0.95], [0.19, -0.85], [0.13, -0.6], [0.13, -0.15], [0.17, 0], [0, 0]].map(([x, y]) => new THREE.Vector2(x, y)), 32);
    for (const a of [Math.PI / 3, -Math.PI / 3, Math.PI]) { const l = new THREE.Mesh(lg, bronze); l.position.set(0.92 * Math.sin(a), -0.86, 0.92 * Math.cos(a)); grp.add(l); }
  }
  shadowy(grp);
  grp.position.copy(P(1)).add(V3(0, FLOOR_Y + 1.81, 0)); grp.rotation.y = -0.18; scene.add(grp);
  STAGES.push({ obj: grp, focus: wl(grp, V3(0, -0.24, 1.42)), dist: 5.6 });
}

// 3. stone stele (Qin carved stones were in small seal script)
{
  const Wd = 2.3, Ht = 3.9, Dp = 0.45, CW = 1024, CH = Math.round(1024 * Ht / Wd), r = rng(31);
  const stoneTex = (w, h, seed) => {
    const [c, g] = cv(w, h), q = rng(seed);
    g.fillStyle = '#3a3c3e'; g.fillRect(0, 0, w, h);
    blobs(g, w, h, q, 240, q => { const v = 40 + q() * 40 | 0; return `rgba(${v},${v + 2},${v + 4},0.35)`; }, 10, 60, 10);
    grain(g, w, h, q, w * h / 20, 0.18);
    return c;
  };
  const [c, g] = cv(CW, CH); g.drawImage(stoneTex(CW, CH, 32), 0, 0);
  const [b, gb] = cv(CW, CH); gb.fillStyle = '#808080'; gb.fillRect(0, 0, CW, CH); grain(gb, CW, CH, r, 60000, 0.2);
  // carved frame
  for (const [gg, col, lw] of [[g, 'rgba(20,20,22,.8)', 10], [gb, '#303030', 10]]) { gg.strokeStyle = col; gg.lineWidth = lw; gg.strokeRect(70, 70, CW - 140, CH - 140); gg.strokeRect(96, 96, CW - 192, CH - 192); }
  g.strokeStyle = 'rgba(160,160,155,.25)'; g.lineWidth = 3; g.strokeRect(75, 75, CW - 140, CH - 140);
  const gx = CW / 2, gy = CH * 0.47, gs = 1000;
  engrave(g, 'xz', gx, gy, gs, { lip: 'rgba(170,172,168,.9)', wall: '#121214', floor: '#6f706e' });
  gb.save(); gb.filter = 'blur(3px)'; paintGlyph(gb, 'xz', gx, gy, gs, '#000', 1.05); gb.restore();
  const side = new THREE.MeshStandardMaterial({ map: tex(stoneTex(256, 512, 33)), roughness: 0.9 });
  const front = new THREE.MeshStandardMaterial({ map: tex(c), bumpMap: tex(b, false), bumpScale: 4, roughness: 0.85 });
  const st = new THREE.Mesh(new THREE.BoxGeometry(Wd, Ht, Dp), [side, side, side, side, front, side]);
  const base = new THREE.Mesh(new THREE.BoxGeometry(Wd + 0.7, 0.42, Dp + 0.6), side);
  const grp = new THREE.Group(); grp.add(st, base);
  base.position.y = FLOOR_Y + 0.21; st.position.y = FLOOR_Y + 0.42 + Ht / 2;
  shadowy(grp); grp.position.copy(P(2)); grp.rotation.y = 0.1; scene.add(grp);
  STAGES.push({ obj: grp, focus: wl(grp, V3(0, st.position.y + Ht * (0.5 - 0.47), Dp / 2)), dist: 7.4 });
}

// 4. Han bamboo slips, brush ink
{
  const N = 7, SW = 0.6, SH = 4.3, r = rng(41);
  const grp = new THREE.Group();
  const slip = new THREE.Group();
  for (let i = 0; i < N; i++) {
    const [c, g] = cv(256, 1832), q = rng(400 + i);
    const base = [196 + q() * 18, 160 + q() * 14, 104 + q() * 14].map(v => v | 0);
    g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, 256, 1832);
    for (let k = 0; k < 140; k++) { const x = q() * 256, a = 0.05 + q() * 0.12; g.strokeStyle = q() < 0.5 ? `rgba(120,85,40,${a})` : `rgba(240,215,160,${a})`; g.lineWidth = 1 + q() * 2.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + q() * 6 - 3, 1832); g.stroke(); }
    blobs(g, 256, 1832, q, 40, q => `rgba(110,70,30,${0.08 + q() * 0.08})`, 10, 50, 12);
    const eg = g.createLinearGradient(0, 0, 256, 0); eg.addColorStop(0, 'rgba(80,50,20,.35)'); eg.addColorStop(0.12, 'rgba(0,0,0,0)'); eg.addColorStop(0.88, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(80,50,20,.35)');
    g.fillStyle = eg; g.fillRect(0, 0, 256, 1832);
    if (i === 3) {
      g.save(); g.filter = 'blur(0.8px)'; paintGlyph(g, 'ls', 116, 1832 * 0.36, 282, 'rgba(18,12,8,.95)'); g.restore();
      g.save(); g.globalAlpha = 0.25; g.filter = 'blur(3px)'; paintGlyph(g, 'ls', 116, 1832 * 0.36, 282, 'rgba(18,12,8,1)', 1.2); g.restore();
    }
    const side = new THREE.MeshStandardMaterial({ color: 0x8a6a3e, roughness: 0.8 });
    const faceM = new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.62 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(SW, SH, 0.06), [side, side, side, side, faceM, side]);
    m.position.set((i - (N - 1) / 2) * (SW + 0.035) + (q() - 0.5) * 0.02, (q() - 0.5) * 0.06, (q() - 0.5) * 0.02);
    m.rotation.z = (q() - 0.5) * 0.012;
    slip.add(m);
  }
  const cordM = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.9 });
  for (const y of [1.45, -1.45]) {
    const cd = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, N * (SW + 0.035) + 0.2, 12), cordM);
    cd.rotation.z = Math.PI / 2; cd.position.set(0, y, 0.04); slip.add(cd);
  }
  slip.rotation.x = -0.14; slip.position.y = FLOOR_Y + SH / 2 * Math.cos(0.14) + 0.02;
  grp.add(slip); shadowy(grp);
  grp.position.copy(P(3)); grp.rotation.y = -0.12; scene.add(grp);
  const local = V3(0, SH * (0.5 - 0.36), 0.04).applyEuler(slip.rotation).add(slip.position);
  STAGES.push({ obj: grp, focus: wl(grp, local), dist: 5.0 });
}

// 5. paper on a slanted desk board, brush-written regular script
{
  const r = rng(51), S = 1024;
  const [c, g] = cv(S, S);
  g.fillStyle = '#e9e1cf'; g.fillRect(0, 0, S, S);
  blobs(g, S, S, r, 160, r => `rgba(${200 + r() * 30 | 0},${185 + r() * 30 | 0},${150 + r() * 30 | 0},0.18)`, 20, 90, 20);
  for (let k = 0; k < 900; k++) { g.strokeStyle = `rgba(150,130,100,${0.05 + r() * 0.08})`; g.lineWidth = 0.6 + r(); g.beginPath(); const x = r() * S, y = r() * S, a = r() * Math.PI * 2, l = 6 + r() * 26; g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.5, x + Math.cos(a + 0.5) * l, y + Math.sin(a + 0.5) * l); g.stroke(); }
  // 米字格 practice grid in vermilion
  const m0 = 112, m1 = S - 112;
  g.strokeStyle = 'rgba(178,58,40,.75)'; g.lineWidth = 6; g.strokeRect(m0, m0, m1 - m0, m1 - m0);
  g.setLineDash([16, 12]); g.lineWidth = 2.5;
  for (const [x0, y0, x1, y1] of [[m0, S / 2, m1, S / 2], [S / 2, m0, S / 2, m1], [m0, m0, m1, m1], [m1, m0, m0, m1]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  g.setLineDash([]);
  g.save(); g.globalAlpha = 0.16; g.filter = 'blur(4px)'; paintGlyph(g, 'ks', S / 2, S / 2, 900, '#100c0a', 0.85); g.restore();
  g.save(); g.filter = 'blur(0.7px)'; paintGlyph(g, 'ks', S / 2, S / 2, 900, '#16110e', 0.74); g.restore();
  const geo = new THREE.PlaneGeometry(2.7, 2.7, 40, 40);
  const pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i); pa.setZ(i, 0.025 * Math.sin(x * 2.1 + 0.5) * Math.cos(y * 1.7) + 0.03); }
  geo.computeVertexNormals();
  const paper = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.92 }));
  const [wc, wg] = cv(512, 512), q = rng(52);
  wg.fillStyle = '#2b1a10'; wg.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 120; k++) { wg.strokeStyle = `rgba(${70 + q() * 40 | 0},${40 + q() * 20 | 0},${20 + q() * 10 | 0},0.5)`; wg.lineWidth = 1 + q() * 3; const y = q() * 512; wg.beginPath(); wg.moveTo(0, y); wg.bezierCurveTo(170, y + q() * 20 - 10, 340, y + q() * 20 - 10, 512, y + q() * 10 - 5); wg.stroke(); }
  const wood = new THREE.MeshStandardMaterial({ map: tex(wc), roughness: 0.55 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(3.5, 3.4, 0.14), wood);
  const weight = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.16, 0.16), new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 0.35, metalness: 0.1 }));
  const desk = new THREE.Group(); desk.add(board, paper, weight);
  paper.position.z = 0.075; weight.position.set(0, 1.28, 0.2);
  const tilt = 0.62; desk.rotation.x = -tilt; desk.position.y = FLOOR_Y + 1.7 * Math.cos(tilt) + 0.1;
  const grp = new THREE.Group(); grp.add(desk); shadowy(grp);
  grp.position.copy(P(4)); grp.rotation.y = 0.08; scene.add(grp);
  const local = V3(0, 0, 0.1).applyEuler(desk.rotation).add(desk.position);
  STAGES.push({ obj: grp, focus: wl(grp, local), dist: 5.4 });
}

// ---------------------------------------------------------------- fire: flickering point lights, glow sprites, embers
const glowTex = (() => {
  const [c, g] = cv(256, 256); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,220,170,1)'); gr.addColorStop(0.25, 'rgba(255,150,60,.55)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return tex(c);
})();
const FIRES = STAGES.map((s, i) => {
  const f = s.focus.clone().add(V3(-2.3, -1.1, 1.9));
  const L = new THREE.PointLight(0xff8a3c, 42, 0, 2); L.position.copy(f);
  L.castShadow = true; L.shadow.mapSize.set(512, 512); L.shadow.bias = -0.002; L.shadow.radius = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 }));
  sp.scale.set(1.6, 1.6, 1); sp.position.copy(f).add(V3(-0.3, -0.2, 0.2));
  scene.add(L, sp);
  return { L, sp, base: f.clone(), seed: i * 1.7 + 0.3, gain: [1, 1.1, 1.15, 0.55, 0.62][i] };
});
const flick = (t, s) => 0.8 + 0.1 * Math.sin(9.3 * t + s) + 0.07 * Math.sin(17.9 * t + 2.3 * s) + 0.05 * Math.sin(31.7 * t + 4.1 * s) + 0.03 * Math.sin(53.3 * t + 1.3 * s);
const NE = 260, er = rng(77), EM = [];
for (let j = 0; j < NE; j++) {
  const k = j % FIRES.length, b = FIRES[k].base;
  EM.push({ x: b.x + (er() - 0.3) * 2.6, z: b.z + (er() - 0.5) * 2.4, sp: 0.25 + er() * 0.5, ph: er(), sw: 0.1 + er() * 0.25, f: 0.8 + er() * 1.6, b: 0.5 + er() * 0.8 });
}
const eGeo = new THREE.BufferGeometry();
eGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NE * 3), 3));
eGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(NE * 3), 3));
const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({ size: 0.05, map: glowTex, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, sizeAttenuation: true }));
scene.add(embers);

// ---------------------------------------------------------------- post: DOF + bloom + grade
const composer = new EffectComposer(renderer);
composer.setPixelRatio(1); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bokeh = new BokehPass(scene, camera, { focus: 4.5, aperture: 0.009, maxblur: 0.012 });
composer.addPass(bokeh);
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.45, 0.65, 0.82));
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, seed: { value: 0 }, fade: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float seed; uniform float fade; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed) * 43758.5453); }
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec2 q = vUv - 0.5; q.x *= 1.25; float v = smoothstep(0.85, 0.25, length(q));
      c *= mix(0.42, 1.0, v);
      c += (h(vUv * vec2(1920.0, 1080.0)) - 0.5) * 0.035;
      gl_FragColor = vec4(c * fade, 1.0); }`,
});
composer.addPass(grade);

// ---------------------------------------------------------------- timeline + camera
const T = [0, 2.35, 4.7, 7.05, 9.4, 12.0];
const camOff = (i, k) => { const s = STAGES[i], d = s.dist * (1.1 - 0.12 * k); return s.focus.clone().add(V3(-0.75 + 0.45 * k, 0.32 - 0.1 * k, d)); };
const camTgt = (i, k) => STAGES[i].focus.clone().add(V3(-0.2 * STAGES[i].dist * (1 - 0.06 * k), 0.02, 0));
const keysP = [], keysT = [];
STAGES.forEach((s, i) => {
  const a = T[i] + (i ? 0.45 : 0), b = T[i + 1] - (i < 4 ? 0.4 : 0);
  keysP.push([a, camOff(i, 0)], [b, camOff(i, 1)]);
  keysT.push([a, camTgt(i, 0)], [b, camTgt(i, 1)]);
});
const mk = (keys, c) => track(keys.map(([t, v]) => [t, v[c]]));
const cP = ['x', 'y', 'z'].map(c => mk(keysP, c)), cT = ['x', 'y', 'z'].map(c => mk(keysT, c));
const focusTrack = ['x', 'y', 'z'].map(c => track(STAGES.flatMap((s, i) => [[T[i] + (i ? 0.55 : 0), s.focus[c]], [T[i + 1] - (i < 4 ? 0.35 : 0), s.focus[c]]])));

// ---------------------------------------------------------------- overlay
const NAMES = ['甲骨文', '金文', '小篆', '隶书', '楷书'];
const KEYS = ['jgw', 'jw', 'xz', 'ls', 'ks'];
const ERAS = ['商代 · 约前 1300 年', '西周 · 前 1046—前 771 年', '秦 · 前 221 年统一文字', '汉代 · 前 206—公元 220 年', '魏晋以后定型 · 沿用至今'];
const DESC = ['刻在龟甲兽骨上：圆框，中间一短横', '铸在青铜器上：圆框，中间一点', '刻在石上：拉长成圆角长方，中间一横', '写在竹简上：变方变扁，笔画平直', '写在纸上：就是今天的「日」'];
const nodesEl = document.getElementById('nodes'), stagesEl = document.getElementById('stages'), nodeEls = [], stageEls = [];
NAMES.forEach((n, i) => {
  const d = document.createElement('div'); d.className = 'node';
  const [c, g] = cv(192, 192); paintGlyph(g, KEYS[i], 96, 96, 150, '#f1e6d2', i === 3 ? 1.1 : 1.15);
  d.appendChild(c); const l = document.createElement('div'); l.textContent = n; d.appendChild(l);
  nodesEl.appendChild(d); nodeEls.push({ d, c });
  const s = document.createElement('div'); s.className = 'stage';
  s.innerHTML = `<div class="n">${n}</div><div class="e">${ERAS[i]}</div><div class="d">${DESC[i]}</div>`;
  stagesEl.appendChild(s); stageEls.push(s);
});

// ---------------------------------------------------------------- render
const tmp = new THREE.Vector3();
window.__render = t => {
  camera.position.set(cP[0](t), cP[1](t), cP[2](t));
  camera.lookAt(cT[0](t), cT[1](t), cT[2](t)); camera.updateMatrixWorld(true);
  const F = V3(focusTrack[0](t), focusTrack[1](t), focusTrack[2](t));
  camera.getWorldDirection(tmp);
  bokeh.uniforms.focus.value = F.clone().sub(camera.position).dot(tmp);

  FIRES.forEach((f, i) => {
    const k = flick(t, f.seed);
    f.L.intensity = 42 * k * f.gain;
    f.L.position.copy(f.base).add(V3(0.06 * Math.sin(7.1 * t + i), 0.05 * Math.sin(11.3 * t + 2 * i), 0.04 * Math.sin(5.3 * t + i)));
    f.L.color.setRGB(1, 0.5 + 0.06 * k, 0.22 + 0.05 * k);
    f.sp.material.opacity = 0.35 * k;
  });
  const pos = eGeo.attributes.position, col = eGeo.attributes.color;
  EM.forEach((e, j) => {
    const u = (t * e.sp * 0.3 + e.ph) % 1, y = FLOOR_Y + 0.2 + u * 4.2;
    pos.setXYZ(j, e.x + e.sw * Math.sin(t * e.f + j) + u * 0.6, y, e.z + 0.1 * Math.cos(t * e.f * 0.7 + j));
    const a = Math.sin(Math.PI * u) * e.b * (0.7 + 0.3 * Math.sin(t * 13 + j));
    col.setXYZ(j, a, a * 0.5, a * 0.18);
  });
  pos.needsUpdate = true; col.needsUpdate = true;

  grade.uniforms.seed.value = (Math.round(t * FPS) % 97) * 1.37;
  grade.uniforms.fade.value = prog(t, 0, 0.6);
  composer.render();

  const cur = t < T[1] ? 0 : t < T[2] ? 1 : t < T[3] ? 2 : t < T[4] ? 3 : 4;
  stageEls.forEach((s, i) => {
    const a = prog(t, T[i] + 0.35, T[i] + 0.8) * (i < 4 ? 1 - prog(t, T[i + 1] - 0.3, T[i + 1] + 0.05) : 1);
    s.style.opacity = a; s.style.transform = `translateY(${(1 - prog(t, T[i] + 0.35, T[i] + 0.9)) * 24}px)`;
  });
  nodeEls.forEach(({ d, c }, i) => {
    const on = prog(t, T[i] + 0.35, T[i] + 0.7);
    d.style.opacity = 0.28 + 0.72 * on * (i === cur ? 1 : 0.72) + (i === cur ? 0 : 0);
    c.style.borderColor = i === cur ? `rgba(240,169,82,${0.4 + 0.6 * on})` : 'rgba(241,230,210,.25)';
  });
  document.getElementById('head').style.opacity = prog(t, 0.2, 0.8);
  nodesEl.style.opacity = prog(t, 0.3, 0.9);
  return { seg: 'hanzi', tau: t.toFixed(2) };
};
await document.fonts.load('900 136px "Noto Serif CJK SC"');
await document.fonts.load('600 44px "Noto Serif CJK SC"');
await document.fonts.load('500 46px "Noto Sans CJK SC"');
window.__render(0);
window.__ready = true;
