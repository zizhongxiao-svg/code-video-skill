# 06 3D 拆解 · 3D exploded view

- **示例题材**：新 Roadster 是怎么飞起来的
- **适合**：机械结构、产品拆解、热门新品
- **时长**：12 秒　**技术**：Three.js (WebGL)
- **示例源码**：[`examples/explode3d/`](../../examples/explode3d/)

![3D 拆解](../../assets/posters/explode3d.jpg)

## 精简版提示词（复制就能出个大概）

```text
用 Three.js 做 12 秒 3D 爆炸图：暗色影棚，零件分层散开，标签引线跟着镜头转。
拆新 Roadster：底板电池包、后轴双电机、车底吸附风扇、两只高压气罐、10 个冷气喷嘴，最后合拢、喷气离地。
只画公开过的部件，角上注“示意图”；每帧只由 t 决定，先抽帧检查再出全片。
```

## 完整版提示词（示例成片就是用它跑出来的）

```text
用 Three.js 做一段 12 秒、1920×1080、30fps 的“3D 拆解爆炸图”：深灰影棚加接触阴影，三点布光、环境反射、ACES 色调映射，深色亮面车身；标签是深色圆角卡片加细引线，端点每帧由 3D 坐标投影算出，跟着镜头走。
题材是 2026 年 10 月发布的新 Roadster Rocket 版，程序化示意建模：低矮双座轿跑、蝴蝶门、可变攻角尾翼，底板电池包、后轴双电机、车底吸附风扇、两个碳纤维气罐（一个占掉副驾）、10 个冷气喷嘴。不画品牌标志，右下角常驻“示意图：部件位置按发布会公开信息绘制”。
节奏：先绕车亮相；车壳、车门、尾翼抬起散开，依次标出电池包、双电机、风扇、气罐（共 600 升）、喷嘴 × 10；部件归位、车身半透明，气罐到各喷嘴的气路逐段点亮；最后侧视，四角喷嘴向下喷白色冷气，车身离地，字幕“靠约 250 公斤压缩空气，短暂飞起来”。
所有运动只由 t 决定（随机用固定种子）；先抽 4–6 帧检查标签有没有重叠、出画、字号是否 ≥36px，至少改一轮再全片渲染，所有数字和 notes.txt 中的来源一致。
```

## 制作手记

拆的是特斯拉 10 月 15 日刚发布的新 Roadster（能短暂飞起来的 Rocket 版）。

先是车壳、蝴蝶门和尾翼抬起散开。接着依次标出底板电池包、后轴双电机、车底吸附风扇、两只碳纤维高压气罐，还有 10 个冷气喷嘴。最后镜头转到侧面，四角喷嘴向下喷气，车身离地。

只画发布会公开过的部件，右下角一直挂着“示意图”，电池包放在底板、气路怎么走是按报道推测的。这段还踩了个坑：在显卡上连续截帧，画面里冒出大块黑斑，换成 CPU 软件渲染才干净。所以用 WebGL 做的画面，正式截帧前先抽几帧看看有没有黑斑。

## 事实依据（notes.txt）

依据：特斯拉 2026-10-15 在得州 McGregor 的 SpaceX 试验场发布新一代 Roadster。画面只用下列公开信息，部件形状、尺寸和相对大小均为示意，未标任何尺寸。
- 双座轿跑、蝴蝶门；后驱，后轴两台电机；Roadster 专用 4680 电芯；四个后置吸附风扇各 20 kW；可变攻角尾翼；Rocket 版两个碳纤维缠绕高压气罐共 600 升、约 250 公斤空气，取代副驾座椅；10 个冷气喷嘴分布在车身四周；风扇吸力最高约 2 g——Car and Driver, Sebastian Blanco, 2026-10-17, "Explained: Here's How the Tesla Roadster Flies, Flips, and Sucks", https://www.caranddriver.com/news/a74165059/tesla-roadster-thrusters-fan-system-explained/
- 多模式风扇加地面密封系统从车底抽气，吸力足以让车倒挂、静止也行；Rocket 版单座、仅限邀请、不可上公共道路，冷气喷嘴分布在车身四周——tesla.com/roadster, https://www.tesla.com/roadster
- 两个超高压气罐合计 600 升、约 250 公斤空气、10 个喷嘴，可在车上自行补气——The Verge, 2026-10, https://www.theverge.com/transportation/1012552/tesla-roadster-next-gen-reveal-elon-musk
- 发布时间与地点——TechCrunch, 2026-10-15, "Tesla reveals SpaceX-powered Roadster that flies and falls with style", https://techcrunch.com/2026/10/15/tesla-reveals-spacex-powered-roadster-that-flies-and-falls-with-style/（正文未能抓取，只核对了标题和日期）
- 部件布置佐证：约 200 升气罐在座椅后、约 400 升气罐占副驾位置；除后部推进喷嘴外另有 6 个（四角各 1 个、车头 2 个管偏航）；后部推进喷嘴合计超过 80 kN——WIRED, https://www.wired.com/story/how-tesla-made-its-new-230-mph-car-fly/ ；车尾 4 个喷嘴在后保险杠上方，四角喷嘴在车轮后方、朝下——MotorTrend, https://www.motortrend.com/news/tesla-roadster-thrust-system-spacex-technology-explained
- 示意部分（来源没有给出）：电池包画在底板、风扇画在后轴前方并排、管路走向、喷嘴外形、车身线条和电芯排数。
