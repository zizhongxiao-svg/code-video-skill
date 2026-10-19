#!/usr/bin/env bash
# Render a contract page to frames / mp4.
#   render.sh <pageDir> 30,120,210        preview: only these frames -> <out>/_preview/<name>/fNNNNN.jpg
#   render.sh <pageDir>                   full render -> <out>/<name>.mp4
# Env:
#   OUT        output directory (default: parent of pageDir)
#   N          parallel capture processes (default: min(6, nproc/2))
#   GPU_ANGLE  render WebGL on the GPU (e.g. vulkan); default is CPU SwiftShader (slower, artifact-free)
#   ENCODER    auto | nvenc | x264 | videotoolbox | openh264 (default auto: first one that works)
#   CRF        x264 quality (default 18); CQ for nvenc (default 20)
#   FFMPEG     ffmpeg binary (default: ffmpeg on PATH)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAGE="$(cd "${1:?usage: render.sh <pageDir> [frames]}" && pwd)"; NAME="$(basename "$PAGE")"
OUT="${OUT:-$(dirname "$PAGE")}"; FF="${FFMPEG:-ffmpeg}"
mkdir -p "$OUT"
if grep -q './vendor/three.module.js' "$PAGE/index.html" && [ ! -f "$PAGE/vendor/three.module.js" ]; then
  "$HERE/fetch_three.sh" "$PAGE"
fi

if [ -n "${2:-}" ]; then
  PREV="$OUT/_preview/$NAME"; rm -rf "$PREV"; mkdir -p "$PREV"
  node "$HERE/capture.js" "$PAGE" "$PREV" "$2" 2>&1 | cut -c1-200
  echo "preview frames -> $PREV"; exit 0
fi

read -r FPS FR < <(python3 - "$PAGE/index.html" <<'EOF'
import re, sys
s = open(sys.argv[1], encoding="utf-8").read()
fps = int(re.search(r"FPS\s*=\s*(\d+)", s).group(1)); dur = float(re.search(r"DUR\s*=\s*([\d.]+)", s).group(1))
print(fps, round(fps * dur))
EOF
)
CORES=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
N=${N:-$(( CORES / 2 > 6 ? 6 : (CORES / 2 < 1 ? 1 : CORES / 2) ))}
FRAMES="$OUT/_frames/$NAME"; rm -rf "$FRAMES"; mkdir -p "$FRAMES"
PER=$(( (FR + N - 1) / N )); t0=$(date +%s)
for i in $(seq 0 $((N - 1))); do
  a=$(( i * PER )); b=$(( (i + 1) * PER - 1 )); [ $b -ge $FR ] && b=$(( FR - 1 )); [ $a -gt $b ] && continue
  node "$HERE/capture.js" "$PAGE" "$FRAMES" "$a-$b" > "$FRAMES.log.$i" 2>&1 &
done
wait
GOT=$(ls "$FRAMES" | wc -l | tr -d ' ')
echo "frames $GOT/$FR in $(( $(date +%s) - t0 ))s ($N workers)"
grep -h "pageerror" "$FRAMES".log.* | head -3 || true
[ "$GOT" -eq "$FR" ] || { echo "missing frames, see $FRAMES.log.*" >&2; exit 1; }

. "$HERE/_encoder.sh"; pick_encoder
"$FF" -v error -y -framerate "$FPS" -i "$FRAMES/f%05d.jpg" \
  -vf 'scale=in_range=full:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709,format=yuv420p' \
  "${VC[@]}" -g $(( FPS * 2 )) -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -movflags +faststart "$OUT/$NAME.mp4"
rm -rf "$FRAMES" "$FRAMES".log.*
echo "$OUT/$NAME.mp4 ($ENC_NAME, total $(( $(date +%s) - t0 ))s)"
