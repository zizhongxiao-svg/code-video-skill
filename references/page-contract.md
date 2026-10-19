# 页面合约与常见坑

`scripts/capture.js` 用无头 Chromium 打开 `<pageDir>/index.html`，等 `window.__ready === true`，
然后对每一帧 f 调用 `window.__render(f / fps)` 并截图。所以页面只要满足下面的合约，就能被确定性地渲染：
同一个 t 永远得到同一张图，任意一帧都可以单独渲染，多个进程可以并行截不同的帧段。

## 合约

```js
const FPS = 30, DUR = 12;            // 这一行的写法不要改，render.sh 用正则读；DUR 可带小数
window.__info = { fps: FPS, duration: DUR, frames: Math.round(FPS * DUR) };
window.__render = t => {             // t 单位是秒
  // 只根据 t 画这一帧
  return { seg: 'shot-2', tau: t.toFixed(2) };   // 返回值会打印在日志里，方便定位
};
document.fonts.ready.then(() => { window.__render(0); window.__ready = true; });
```

- 画布 1920×1080，`html, body { margin:0; overflow:hidden }`，`deviceScaleFactor` 固定为 1。
- 页面通过假域名 `http://render.local/` 加载，同目录的 js / 图片 / 字体 / wasm 都能用相对路径引用；
  其他任何网络请求都会被拦截。需要的库（如 three.js）放进 `vendor/`。

## 让每一帧只由 t 决定

| 不要用 | 改用 |
|---|---|
| CSS `animation` / `transition` | 在 `__render(t)` 里直接算样式或直接画 |
| `requestAnimationFrame`、`setTimeout`、`setInterval` | 不需要循环，截帧脚本会逐帧调用 |
| `Date.now()`、`performance.now()` | 参数 t |
| `Math.random()` | 固定种子的 PRNG（mulberry32），在页面加载时生成好，或用 `hash(i, floor(t*fps))` |
| 逐帧累积的物理/粒子状态 | 写成 t 的解析式；实在要模拟，就在 `__render` 里从 0 积分到 t（帧数少时可行） |

“手绘抖动”这类效果用 `floor(t * fps / 3)` 当种子，每 3 帧换一次偏移，既有手绘感又可复现。

## 版式（手机上看得清）

- 正文标签 ≥ 36px，标题 ≥ 64px，数字可以更大；一屏一句话，句子短。
- 字幕区留在下方 1/5，主体放中间；重要信息别贴边（平台会裁、会盖 UI）。
- 远景里的主角至少占画面高度的 1/4。
- 细颗粒、噪点、细线在平台压缩后最先糊（绘本、水墨这类画风尤其明显），颗粒宁可粗一点。
- 示意性画面（新品结构、推测的路线）角上一直挂“示意图”。

## Three.js / WebGL

- `scripts/fetch_three.sh <pageDir>` 下载 three.js 到 `vendor/`，用 import map 引用。
- `new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })`。
- 在 `__render(t)` 里设置好相机、物体、灯光后**同步**调用 `renderer.render(scene, camera)`（或 `composer.render()`）。
- 首帧渲染完成后再设 `__ready = true`（着色器编译、环境贴图生成都在首帧）。
- 默认用 SwiftShader（CPU）渲染 WebGL：慢一些，但稳定。`GPU_ANGLE=vulkan` 用显卡更快，
  但我们遇到过 GPU 连续截帧时画面出现大块黑斑的问题；用显卡时一定先抽几帧看看。
- 景深、Bloom 等后期在 CPU 渲染下很慢，可以先用低分辨率抽帧调效果。

## 渲染与排错

- `scripts/render.sh <dir> 0,90,180` 只截几帧，图在 `_preview/<name>/`。
- 截帧日志里出现 `[pageerror]` 就是页面脚本报错；全片渲染缺帧时看 `_frames/<name>.log.*`。
- 页面一直不 ready：检查字体名是否存在（`fc-list :lang=zh`）、`__ready` 是否被设置、是否请求了外网资源。
- 并行进程数 `N` 不要超过物理核数的一半（每个 Chromium 本身也是多线程的）。
