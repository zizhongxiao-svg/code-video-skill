#!/usr/bin/env python3
"""Narration + subtitles for a code-rendered video.

    tts.py script.txt -o out/narration            # -> narration.mp3 + narration.srt
    tts.py script.txt -o out/narration --voice zh-CN-YunjianNeural --rate -5% --pitch -4Hz
    tts.py --list-voices zh-CN

Backends
  edge (default)  Microsoft Edge online voices via the `edge-tts` package: free, no API key, no GPU.
                  pip install edge-tts
  http            Your own TTS server (CosyVoice, Qwen-TTS, F5-TTS, ... behind any HTTP wrapper).
                  POSTs JSON {"text": ..., <--field k=v ...>} to $TTS_URL and expects audio bytes back.

Keep the whole narration in ONE call. Voice-design / zero-shot models invent a slightly different
speaker on every request, so synthesizing section by section makes the voice drift between sections.
Edge voices are fixed per name, but one call still gives the most even pacing.

Subtitles come from edge-tts sentence boundaries; long sentences are split at punctuation so each cue
fits on one line (--max-chars). The http backend has no timing data, so cues are spread over the audio
in proportion to their length (good enough for a draft; align with an ASR model for exact timing).
"""
import argparse
import asyncio
import json
import os
import re
import subprocess
import sys
import urllib.request

VOICES = {
    "zh-CN-YunyangNeural": "男，新闻播音腔，沉稳专业（偏浑厚、适合科普讲解）",
    "zh-CN-YunjianNeural": "男，低沉有力，体育/纪录片解说感",
    "zh-CN-YunxiNeural": "男，年轻轻快，适合轻松向短视频",
    "zh-CN-YunxiaNeural": "男，少年感",
    "zh-CN-XiaoxiaoNeural": "女，温暖自然，万能",
    "zh-CN-XiaoyiNeural": "女，活泼",
    "en-US-AndrewNeural": "male, warm and confident (English)",
    "en-US-AvaNeural": "female, expressive (English)",
}


def fmt(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def split_cue(text, start, end, max_chars):
    """Split one sentence into <= max_chars pieces at punctuation, timing proportional to length."""
    text = text.strip()
    if len(text) <= max_chars:
        return [(start, end, text)]
    parts = [p for p in re.split(r"(?<=[，、；：,;:])", text) if p.strip()]
    pieces, cur = [], ""
    for p in parts:
        if cur and len(cur) + len(p) > max_chars:
            pieces.append(cur)
            cur = p
        else:
            cur += p
    if cur:
        pieces.append(cur)
    out, total, t = [], sum(len(p) for p in pieces), start
    for p in pieces:
        d = (end - start) * len(p) / total
        out.append((t, t + d, p.strip()))
        t += d
    return out


def clean(s):
    return re.sub(r"[，。、；：,.;:！？!?\s]+$", "", s.strip())


def write_srt(cues, path, max_chars):
    pieces = [p for start, end, text in cues for p in split_cue(text, start, end, max_chars)]
    lines = []
    for i, (a, b, piece) in enumerate(pieces):
        if i + 1 < len(pieces):
            b = min(b, pieces[i + 1][0])
        lines += [str(i + 1), f"{fmt(a)} --> {fmt(b)}", clean(piece), ""]
    open(path, "w", encoding="utf-8").write("\n".join(lines))


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


async def edge(text, a, audio_path):
    import edge_tts

    com = edge_tts.Communicate(text, a.voice, rate=a.rate, pitch=a.pitch, volume=a.volume, boundary="SentenceBoundary")
    cues = []
    with open(audio_path, "wb") as f:
        async for ch in com.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] in ("SentenceBoundary", "WordBoundary"):
                s = ch["offset"] / 1e7
                cues.append((s, s + ch["duration"] / 1e7, ch["text"]))
    return cues


def http(text, a, audio_path):
    url = a.url or os.environ.get("TTS_URL")
    if not url:
        sys.exit("http backend needs --url or $TTS_URL")
    body = {"text": text}
    for kv in a.field:
        k, v = kv.split("=", 1)
        try:
            body[k] = json.loads(v)
        except ValueError:
            body[k] = v
    headers = {"Content-Type": "application/json"}
    if os.environ.get("TTS_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["TTS_TOKEN"]
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers)
    with urllib.request.urlopen(req, timeout=a.timeout) as r, open(audio_path, "wb") as f:
        f.write(r.read())
    sents = [s for s in re.split(r"(?<=[。！？!?\n])", text) if s.strip()]
    total, t, cues, dur = sum(len(s.strip()) for s in sents), 0.0, [], duration(audio_path)
    for s in sents:
        d = dur * len(s.strip()) / total
        cues.append((t, t + d, s.strip()))
        t += d
    return cues


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("script", nargs="?", help="narration text file; blank lines separate paragraphs")
    ap.add_argument("-o", "--out", default="narration", help="output path without extension")
    ap.add_argument("--backend", choices=["edge", "http"], default="edge")
    ap.add_argument("--voice", default="zh-CN-YunyangNeural")
    ap.add_argument("--rate", default="+0%", help="edge: speaking rate, e.g. -5%% or +8%%")
    ap.add_argument("--pitch", default="+0Hz", help="edge: e.g. -4Hz for a deeper voice")
    ap.add_argument("--volume", default="+0%")
    ap.add_argument("--url", help="http: endpoint (or $TTS_URL)")
    ap.add_argument("--field", action="append", default=[], help="http: extra JSON field k=v (repeatable)")
    ap.add_argument("--ext", default=None, help="audio extension (edge: mp3; http: wav)")
    ap.add_argument("--timeout", type=int, default=600)
    ap.add_argument("--max-chars", type=int, default=18, help="max characters per subtitle line")
    ap.add_argument("--list-voices", metavar="LOCALE", help="list edge voices for a locale, e.g. zh-CN")
    a = ap.parse_args()

    if a.list_voices:
        import edge_tts

        for v in asyncio.run(edge_tts.list_voices()):
            if v["Locale"].startswith(a.list_voices):
                print(f'{v["ShortName"]:28s} {v["Gender"]:7s} {VOICES.get(v["ShortName"], "")}')
        return
    if not a.script:
        ap.error("script is required")
    text = open(a.script, encoding="utf-8").read().strip()
    text = re.sub(r"\n\s*\n", "\n", text)
    ext = a.ext or ("mp3" if a.backend == "edge" else "wav")
    audio = f"{a.out}.{ext}"
    os.makedirs(os.path.dirname(os.path.abspath(audio)), exist_ok=True)
    cues = asyncio.run(edge(text, a, audio)) if a.backend == "edge" else http(text, a, audio)
    write_srt(cues, f"{a.out}.srt", a.max_chars)
    print(f"{audio}  {duration(audio):.1f}s\n{a.out}.srt  {len(cues)} sentences")


if __name__ == "__main__":
    main()
