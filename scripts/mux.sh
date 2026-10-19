#!/usr/bin/env bash
# Put narration, music and subtitles on a silent render.
#   mux.sh <video.mp4> <out.mp4> [--voice narration.mp3] [--music bgm.wav] [--srt narration.srt]
#          [--burn] [--delay 0.5] [--music-db -20] [--lufs -16]
# - Music is ducked under the voice (sidechain) and faded in/out; without --voice it plays at --music-db.
# - If the narration (plus --delay) is longer than the video, the last frame is held.
# - --srt adds a soft subtitle track; --burn draws it into the picture instead (needs ffmpeg with libass).
# - Loudness is normalized to --lufs (default -16 LUFS, true peak -1.5 dBTP), a safe target for
#   short-video platforms.
# - The video stream is copied as-is unless it has to change (held last frame or burned subtitles).
# Env: FFMPEG / FFPROBE (default ffmpeg / ffprobe on PATH), FONT (subtitle font, default "Noto Sans CJK SC"),
#      SUB_SIZE / SUB_MARGIN (burned subtitle size and bottom margin in ASS units of a 288-line canvas; 15 / 28),
#      ENCODER (see _encoder.sh)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FF="${FFMPEG:-ffmpeg}"; FP="${FFPROBE:-ffprobe}"
VID=${1:?usage: mux.sh <video.mp4> <out.mp4> [options]}; OUTF=${2:?out.mp4}; shift 2
VOICE=""; MUSIC=""; SRT=""; BURN=0; DELAY=0.5; MDB=-20; LUFS=-16
while [ $# -gt 0 ]; do
  case "$1" in
    --voice) VOICE=$2; shift 2 ;; --music) MUSIC=$2; shift 2 ;; --srt) SRT=$2; shift 2 ;;
    --burn) BURN=1; shift ;; --delay) DELAY=$2; shift 2 ;; --music-db) MDB=$2; shift 2 ;; --lufs) LUFS=$2; shift 2 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
calc() { python3 -c "print($1)"; }
dur() { "$FP" -v error -show_entries format=duration -of csv=p=0 "$1"; }
VD=$(dur "$VID"); TOTAL=$VD
[ -n "$VOICE" ] && TOTAL=$(calc "max($VD, $(dur "$VOICE") + $DELAY + 1.0)")
HOLD=$(calc "max(0.0, $TOTAL - $VD)")
FO=$(calc "max(0.0, $TOTAL - 1.5)")
DMS=$(calc "int($DELAY * 1000)")

FC=""; add() { FC="${FC:+$FC;}$1"; }
AFC=""; adda() { AFC="${AFC:+$AFC;}$1"; }
IN=(-i "$VID"); k=1
REENC=0
[ "$(calc "1 if $HOLD > 0.01 else 0")" = 1 ] && REENC=1
[ -n "$SRT" ] && [ $BURN = 1 ] && REENC=1
if [ $REENC = 1 ]; then
  VF="[0:v]tpad=stop_mode=clone:stop_duration=$HOLD"
  if [ -n "$SRT" ] && [ $BURN = 1 ]; then
    esc=$(printf '%s' "$SRT" | sed "s/[\\:']/\\\\&/g")
    VF="$VF,subtitles='$esc':force_style='FontName=${FONT:-Noto Sans CJK SC},FontSize=${SUB_SIZE:-15},Outline=1.2,Shadow=0,MarginV=${SUB_MARGIN:-28}'"
  fi
  add "$VF,format=yuv420p[v]"; VMAP=(-map "[v]")
  . "$HERE/_encoder.sh"; pick_encoder
else
  VMAP=(-map 0:v); VC=(-c:v copy)
fi

if [ -n "$VOICE" ]; then IN+=(-i "$VOICE"); adda "[$k:a]aresample=48000,adelay=${DMS}|${DMS},apad,atrim=0:$TOTAL[vo]"; k=$((k + 1)); fi
if [ -n "$MUSIC" ]; then IN+=(-stream_loop -1 -i "$MUSIC"); adda "[$k:a]aresample=48000,atrim=0:$TOTAL,volume=${MDB}dB,afade=t=in:d=0.6,afade=t=out:st=$FO:d=1.5[mu]"; k=$((k + 1)); fi
AMAP=()
if [ -n "$VOICE" ] && [ -n "$MUSIC" ]; then
  adda "[vo]asplit[vo1][vo2];[mu][vo2]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[duck];[vo1][duck]amix=inputs=2:normalize=0:duration=first[mix]"
elif [ -n "$VOICE" ]; then adda "[vo]anull[mix]"
elif [ -n "$MUSIC" ]; then adda "[mu]anull[mix]"
fi
if [ -n "$VOICE$MUSIC" ]; then
  # two-pass loudnorm: single-pass undershoots the target on short clips
  M=$("$FF" -hide_banner -nostats "${IN[@]}" -filter_complex "$AFC;[mix]loudnorm=I=$LUFS:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 |
      python3 -c "import sys,json,re; d=json.loads(re.findall(r'\{[^{}]*\}', sys.stdin.read())[-1]); print(d['input_i'], d['input_tp'], d['input_lra'], d['input_thresh'], d['target_offset'])")
  read -r MI MTP MLRA MTH MOFF <<< "$M"
  adda "[mix]loudnorm=I=$LUFS:TP=-1.5:LRA=11:measured_I=$MI:measured_TP=$MTP:measured_LRA=$MLRA:measured_thresh=$MTH:offset=$MOFF:linear=true,aresample=48000[a]"
  AMAP=(-map "[a]" -c:a aac -b:a 192k -ar 48000)
fi
SUB=()
if [ -n "$SRT" ] && [ $BURN = 0 ]; then IN+=(-i "$SRT"); SUB=(-map "$k:s" -c:s mov_text -metadata:s:s:0 language=chi); fi
[ -n "$AFC" ] && add "$AFC"
FCA=(); [ -n "$FC" ] && FCA=(-filter_complex "$FC")
"$FF" -v error -y "${IN[@]}" "${FCA[@]}" "${VMAP[@]}" "${AMAP[@]}" "${SUB[@]}" \
  "${VC[@]}" -t "$TOTAL" -movflags +faststart "$OUTF"
echo "$OUTF $(dur "$OUTF")s"
