#!/usr/bin/env bash
# Make a small looping preview GIF (or a poster JPG) from a rendered mp4.
#   gif.sh <in.mp4> <start-sec> [dur=4] [out.gif]     640 px wide, 12 fps, shrinks until <= MAX bytes
#   gif.sh --poster <in.mp4> <sec> [out.jpg]          one representative frame, 1280 px wide
# Env: FFMPEG (default ffmpeg), MAX (default 3500000 bytes)
set -euo pipefail
FF="${FFMPEG:-ffmpeg}"
if [ "${1:-}" = --poster ]; then
  IN=$2; SS=$3; OUTF=${4:-${IN%.mp4}.jpg}
  "$FF" -v error -y -ss "$SS" -i "$IN" -frames:v 1 -vf scale=1280:-1 -q:v 3 "$OUTF"; echo "$OUTF"; exit 0
fi
IN=${1:?usage: gif.sh <in.mp4> <start> [dur] [out.gif]}; SS=${2:?start seconds}; DUR=${3:-4}; OUTF=${4:-${IN%.mp4}.gif}
MAX=${MAX:-3500000}; w=640; fps=12
for try in 1 2 3 4; do
  "$FF" -v error -y -ss "$SS" -t "$DUR" -i "$IN" -vf "fps=$fps,scale=$w:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" "$OUTF"
  sz=$(wc -c < "$OUTF" | tr -d ' '); [ "$sz" -le "$MAX" ] && break; w=$((w - 60)); fps=10
done
echo "$OUTF ${w}px ${fps}fps ${sz} bytes"
