# Sourced by render.sh / mux.sh. Sets the VC array to H.264 encoder args.
# ENCODER=auto (default) tries, in order: h264_nvenc, libx264, h264_videotoolbox (macOS), libopenh264.
# Force one with ENCODER=nvenc | x264 | videotoolbox | openh264.
_enc_works() { "$FF" -v error -f lavfi -i color=c=black:s=256x256:d=0.1 -c:v "$1" -f null - >/dev/null 2>&1; }
pick_encoder() {
  local e="${ENCODER:-auto}"
  if [ "$e" = auto ]; then
    for c in nvenc:h264_nvenc x264:libx264 videotoolbox:h264_videotoolbox openh264:libopenh264; do
      if _enc_works "${c#*:}"; then e="${c%%:*}"; break; fi
    done
  fi
  case "$e" in
    nvenc) VC=(-c:v h264_nvenc -preset p7 -tune hq -rc vbr -cq "${CQ:-20}" -maxrate 10M -bufsize 20M -profile:v high -bf 3) ;;
    x264) VC=(-c:v libx264 -preset slow -crf "${CRF:-18}" -profile:v high) ;;
    videotoolbox) VC=(-c:v h264_videotoolbox -b:v 10M -profile:v high) ;;
    openh264) VC=(-c:v libopenh264 -b:v 10M) ;;
    *) echo "no usable H.264 encoder found in $FF (tried nvenc, x264, videotoolbox, openh264)" >&2; return 1 ;;
  esac
  ENC_NAME="$e"
}
