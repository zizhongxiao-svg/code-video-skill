---
name: code-video
description: 用大语言模型写代码、逐帧渲染科普/讲解短视频（不用任何视频生成模型）。内置 16 种画风（皮影、古地图、3D 拆解、比例尺、Kurzgesagt 式信息图、3Blue1Brown 式数学、水墨、卡点金句等）的完整提示词、精简提示词和可运行示例，外加确定性截帧渲染、抽帧自检、免费 TTS 旁白、字幕和配乐工具。Use when the user wants to make an explainer / 科普 / 讲解 / 动画短视频 with code (HTML Canvas, SVG, Three.js, WebGL), asks for a specific visual style from the catalog, wants a "代码做的视频" or "AI 写代码出片", or needs to render a deterministic web animation to mp4/GIF.
---

# code-video：让大语言模型写代码，逐帧画出科普视频

画面不是视频模型生成的，也不是拍的：模型写一个网页（Canvas / SVG / Three.js / WebGL），
页面暴露 `__render(t)`，脚本按帧号逐帧截图，再用 ffmpeg 编码成 mp4。
好处是**可复现、可修改、文字和数字绝对准确、零生成费用**。

整套做法只有三步：**挑画风 → 把提示词写细 → 先抽帧检查，改好了再出全片**。

## 0. 准备（第一次用）

```bash
cd <skill 目录>
npm install                     # 装 playwright-core
npx playwright-core install chromium-headless-shell   # 或设置 CHROME=/path/to/chrome
# 需要 ffmpeg / ffprobe 在 PATH 上；中文字体建议装 Noto Sans CJK（fonts-noto-cjk / noto-fonts-cjk）
pip install edge-tts numpy scipy   # 可选：旁白、字幕、合成配乐
```

## 1. 挑画风：画风跟着题材走

先看题材属于哪一类，再到 `references/styles/` 读对应画风文件（每个文件有：适合什么题、
精简提示词、完整提示词、制作手记、事实依据，示例源码在 `examples/<name>/`）。

| 题材 | 先试 | 也可以 |
|---|---|---|
| 典故、历史故事 | 皮影 `piying` | 像素 `pixel`、漫画 `comic` |
| 低龄科普、自然生长 | 绘本 `picturebook` | 扁平 MG `flatmg` |
| 文字、器物、朝代 | 汉字演变 `hanzi` | 水墨 `ink` |
| 路线、出使、迁徙 | 古地图 `oldmap` | 等距流程 `isometric` |
| 机械结构、产品拆解 | 3D 拆解 `explode3d` | 白板 `whiteboard` |
| 工序、生产线 | 等距流程 `isometric` | 扁平 MG `flatmg` |
| 大小、深度、距离 | 比例尺 `scale` | 数据信息图 `infographic` |
| 年代、数量级 | 数据信息图 `infographic` | 比例尺 `scale` |
| 定理、公式 | 数学可视化 `math` | 线稿 `lineart` |
| 单个原理、因果 | 白板 `whiteboard` | 线稿 `lineart` |
| 口号、片头片尾 | 卡点金句 `kinetic` | — |

全部 16 种见 `references/styles/README.md`。用户点名某种画风时直接读那个文件。

## 2. 把提示词写细：一句话只定了画风

“做一段十秒皮影戏”这种一句话提示词，模型只知道画风，不知道演什么、用哪些数、每段几秒。
按下面的骨架把四件事写清楚（画风文件里的完整提示词都是这个结构）：

```text
用 Canvas 逐帧绘制一段 1920×1080、30fps、约 12 秒的「画风」科普动画：配色、质感、字体分别怎么定。
题材是“……”：分几个镜头，每个镜头演什么、屏幕上打出哪句字，结尾用一句话点破。
要用到的数字：……，来源写进 notes.txt；没把握的数不要精确到个位。
每帧只由时间 t 决定（不用计时器，随机数用固定种子）。
先抽 4–6 帧检查字幕够不够大、标签有没有重叠或出画，改完再全片渲染。
```

再补上题材里**会被画错的物理/事实规则**。例子：曹冲称象里，船的吃水要按载重算，
否则记号和水线对不上，这条规则不写，模型画出来就是错的。

## 3. 写页面：必须遵守的页面合约

每段视频一个目录 `<work>/<name>/`，至少有 `index.html`，建议同时写 `prompt.txt`（用的提示词）
和 `notes.txt`（数字和事实的来源）。可以从 `templates/canvas/index.html` 起步。

- 页面固定 1920×1080，`overflow:hidden`。
- 必须有这一行（render.sh 用正则读）：`const FPS = 30, DUR = 12;`
- `window.__info = { fps: FPS, duration: DUR, frames: Math.round(FPS * DUR) };`
- `window.__render = t => { ...; return { seg: '<镜头名>', tau: t.toFixed(2) }; }`
  **每一帧只由 t 决定**：不用 CSS animation/transition、setTimeout、requestAnimationFrame、
  `Date.now()`、`Math.random()`；随机用固定种子（如 mulberry32）；粒子、抖动、物理都要能由 t 直接算出，
  帧与帧之间不累积状态。
- 字体和资源加载完再设 `window.__ready = true`（WebGL 页面在首帧渲染后再置 true）。
- 不访问外网（截帧脚本会拦掉所有外部请求）。字体用系统已装的字体。
- 手机上要看得清：正文标签 ≥ 36px，标题 ≥ 64px，左下角页脚小字可选。
- Three.js 页面：`scripts/fetch_three.sh <name>` 下载到 `<name>/vendor/`，然后
  `<script type="importmap">{ "imports": { "three": "./vendor/three.module.js", "three/addons/": "./vendor/jsm/" } }</script>`；
  renderer 设 `preserveDrawingBuffer: true`，在 `__render(t)` 里同步调用 `renderer.render()`（或 composer）。

细节和常见坑见 `references/page-contract.md`。

## 4. 先抽帧给模型看，改好了再出全片

```bash
scripts/render.sh <work>/<name> 30,120,210,300   # 只截这几帧 -> <work>/_preview/<name>/
```

用图片查看工具逐张看，按这个清单挑问题，改完再抽一轮（至少迭代一轮）：

- 文字：够不够大、有没有重叠、出画、被遮挡；中文是否都是真字体（没有豆腐块）。
- 事实：画面上的数字、年代、地名、公式和 notes.txt 一致；示意性画面标“示意图”。
- 构图：主体够不够大（远景主角至少占画面高度的 1/4）、画面是否太空、配色是否对题。
- 动作：关键动作是否真的发生了（看相邻两帧），转场是否突兀。
- WebGL：有没有黑块/黑斑、闪烁。

没问题再出全片：

```bash
scripts/render.sh <work>/<name>          # -> <work>/<name>.mp4
N=8 scripts/render.sh <work>/<name>      # 并行截帧进程数（默认 min(6, 核数/2)）
GPU_ANGLE=vulkan scripts/render.sh ...   # WebGL 用显卡（更快，但连续截帧可能出黑斑，先抽帧确认）
```

编码器自动选择：能用 NVENC 就用 `h264_nvenc`，否则 `libx264`。
截帧主要吃 CPU；耗时大头通常是“模型写页面、看截图、改代码”，不是渲染本身。

## 5. 可选：旁白、字幕、配乐、预览图

```bash
# 旁白 + 字幕（默认免费的 edge-tts；整段旁白一次合成，声音前后才一致）
python3 scripts/tts.py script.txt -o out/narration --voice zh-CN-YunyangNeural --rate -5%
# 配乐：自己合成（无版权问题），或用免版税曲库（见 references/narration.md）
python3 scripts/chiptune.py out/bgm.wav 30          # 8-bit 芯片音乐
python3 scripts/beat.py out/beat.wav --bpm 120 --beats 20   # 卡点鼓点，拍点对齐帧
# 合成：音乐自动避让人声，响度归一到 -16 LUFS；--burn 把字幕烧进画面
scripts/mux.sh out/<name>.mp4 out/<name>.final.mp4 --voice out/narration.mp3 --music out/bgm.wav --srt out/narration.srt --burn
# 预览 GIF / 封面帧
scripts/gif.sh out/<name>.mp4 2.5 4          # 从 2.5 秒起 4 秒
scripts/gif.sh --poster out/<name>.mp4 6.0   # 抽一帧 jpg
```

要烧字幕的话，页面底部 1/5 留空，别再画自己的字幕条（或用 `SUB_MARGIN=60` 把字幕抬高）；
响度目标 -16 LUFS，人声峰值高时会略低一点（真峰值上限 -1.5 dBTP）。
声音选择、自建 TTS 接入、卡点对齐的做法见 `references/narration.md`。

## 6. 一次做多段（多画风对比、系列视频）

每段一个目录、一个提示词，互不依赖，可以分给多个子代理（sub-agent）并行写页面和自检，
主代理只负责最后统一渲染、拼接和检查。给每个子代理的说明里写清：页面合约、目录约定、
抽帧自检清单、事实要写进 notes.txt、完成后回报时长和自评。

## 做之前先说清楚

- 事实类数字必须真实可核；做新闻/新品类题材时，只画公开过的信息，角上标“示意图”。
- 不要把示例里的题材数字当成通用事实复用；换题时重新核对。
- 模型生成的配乐（如 MusicGen 权重）多为非商用许可；商用发布请用自己合成或明确授权的音乐。
