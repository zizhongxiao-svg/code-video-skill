#!/usr/bin/env node
// Deterministic frame capture for pages that follow the page contract (see SKILL.md).
//   node capture.js <pageDir> <outDir> <frames: a-b | a,b,c | a-b,c> [step]
// Env:
//   CHROME     path to a Chromium/Chrome binary (default: Playwright's bundled browser)
//   GPU_ANGLE  e.g. "vulkan" | "gl" to render WebGL on the GPU (default: SwiftShader on the CPU,
//              which is slower but never produces the black-block artifacts seen with GPU capture)
//   W, H       viewport size (default 1920x1080)
//   QUALITY    JPEG quality (default 93)
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.wasm': 'application/wasm',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

const [pageDir, outDir, spec, stepArg] = process.argv.slice(2);
if (!pageDir || !outDir || !spec) {
  console.error('usage: node capture.js <pageDir> <outDir> <frames: a-b | a,b,c> [step]');
  process.exit(2);
}
const ROOT = path.resolve(pageDir);
const step = Number(stepArg || 1);

function parseFrames(s) {
  const out = [];
  for (const part of s.split(',')) {
    if (part.includes('-')) { const [a, b] = part.split('-').map(Number); for (let f = a; f <= b; f += step) out.push(f); }
    else if (part !== '') out.push(Number(part));
  }
  return out;
}

(async () => {
  const frames = parseFrames(spec);
  fs.mkdirSync(outDir, { recursive: true });
  const gl = process.env.GPU_ANGLE
    ? [`--use-angle=${process.env.GPU_ANGLE}`, '--enable-gpu', '--use-gl=angle']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    args: gl.concat(['--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--no-sandbox', '--font-render-hinting=none']),
  });
  const page = await browser.newPage({
    viewport: { width: Number(process.env.W || 1920), height: Number(process.env.H || 1080) },
    deviceScaleFactor: 1,
  });
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) console.error('[page]', m.text()); });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  // Serve the page directory from a fake origin so ES modules / import maps work without a web server,
  // and block every other request: the page must not depend on the network.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.host !== 'render.local') return route.abort();
    const p = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, contentType: MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', body: fs.readFileSync(p) });
  });
  const t0 = Date.now();
  await page.goto('http://render.local/index.html');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000, polling: 250 });
  const info = await page.evaluate(() => window.__info);
  console.error('ready', ((Date.now() - t0) / 1000).toFixed(1) + 's', JSON.stringify(info));
  const quality = Number(process.env.QUALITY || 93);
  for (const f of frames) {
    if (f >= info.frames) continue;
    const t1 = Date.now();
    const r = await page.evaluate(t => window.__render(t), f / info.fps);
    let buf;
    for (let k = 0; ; k++) {
      try { buf = await page.screenshot({ type: 'jpeg', quality }); break; }
      catch (e) { if (k >= 4) throw e; await new Promise(res => setTimeout(res, 300)); }
    }
    fs.writeFileSync(path.join(outDir, `f${String(f).padStart(5, '0')}.jpg`), buf);
    if (frames.length <= 60 || f % 60 === 0) console.error(`f${f} ${JSON.stringify(r || {})} ${Date.now() - t1}ms`);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
