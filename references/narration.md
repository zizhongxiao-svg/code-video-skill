# 旁白、字幕与配乐

## 旁白：默认用免费的 edge-tts

`scripts/tts.py` 默认调用 [edge-tts](https://github.com/rany2/edge-tts)（微软 Edge 的在线朗读声音）：
不要 API Key、不要显卡，`pip install edge-tts` 即可，同时输出时间轴准确的 SRT 字幕。

```bash
python3 scripts/tts.py --list-voices zh-CN      # 列出可用声音
python3 scripts/tts.py script.txt -o out/narration --voice zh-CN-YunyangNeural --rate -5% --pitch -2Hz
```

| 想要的感觉 | 推荐声音 | 参数建议 |
|---|---|---|
| 沉稳、浑厚、像资深讲解 | `zh-CN-YunyangNeural` | `--rate -5% --pitch -2Hz` |
| 低沉有力、纪录片解说 | `zh-CN-YunjianNeural` | `--rate -3%` |
| 年轻轻快、短视频口播 | `zh-CN-YunxiNeural` | `--rate +5%` |
| 温暖自然的女声 | `zh-CN-XiaoxiaoNeural` | 默认 |

- **整段旁白一次合成**。用“声音设计 / 零样本克隆”类模型时，每次请求都会生成一个略有不同的说话人，
  分段合成会让声音前后不一致；一次合成整段（段落之间空一行）最稳。
- 旁白稿写成口语：短句、少括号、数字写成读法（“三十多万”而不是“30w+”）。
- 先合成旁白、量出每段时长，再按旁白定每个镜头的长度，比先定画面再硬塞旁白自然得多。
- edge-tts 是在线服务，商用前请自行确认微软的服务条款。

## 接入自建 TTS（可选）

本地部署了 CosyVoice、Qwen-TTS、F5-TTS 等模型的，用 `http` 后端：

```bash
export TTS_URL=http://localhost:8000/tts   # 你的服务地址；需要鉴权就设 TTS_TOKEN
python3 scripts/tts.py script.txt -o out/narration --backend http \
  --field voice=my_speaker --field speed=1.0 --field 'instruct="成熟稳重的男声，语速适中"'
```

脚本会 POST `{"text": ..., <--field 的键值>}`，期望返回音频字节。http 后端没有时间轴数据，
字幕按字数比例分配，适合打草稿；要精确字幕可以再用 ASR（如 faster-whisper）对齐。

挑声音的经验：同一段稿子用几个种子各合成一遍，比较整体音色是否稳定（可以用说话人嵌入，
如 ECAPA，算各段之间的相似度），再听节奏和停顿，挑最稳的一条。

## 字幕

- `tts.py` 按句子边界出 SRT，长句在逗号、顿号处拆开，每条不超过 `--max-chars`（默认 18 字）。
- `scripts/mux.sh ... --srt narration.srt` 加软字幕轨；加 `--burn` 直接烧进画面（需要 ffmpeg 带 libass）。
  `FONT` 环境变量指定字体。

## 配乐

优先级：自己用代码合成 > 明确授权的免版税曲库 > 其他。

- `scripts/chiptune.py out.wav 30`：8-bit 芯片音乐，适合像素风。
- `scripts/beat.py out.wav --bpm 120 --beats 20`：卡点鼓点。120 BPM、30 fps 时一拍正好 15 帧，
  页面里用 `floor(frame / 15)` 算第几拍，换词和鼓点就不会错开。选 BPM 时让“每拍帧数”是整数。
- 免版税曲库（使用前逐首确认许可证）：YouTube 音频库、Pixabay Music、Free Music Archive（注意 CC 协议类型）。
- 开源音乐生成模型（如 MusicGen）的权重多为**非商用**许可，商用发布不要用。

`scripts/mux.sh` 会让音乐在人声出现时自动压低（sidechain），首尾淡入淡出，整体响度归一到 -16 LUFS、
真峰值 -1.5 dBTP，适合短视频平台。
