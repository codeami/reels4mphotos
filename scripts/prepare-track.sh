#!/usr/bin/env bash
# Authoring-time only: cut an excerpt from a source track, fade it, loudness-normalise
# it to a common level and encode AAC-in-M4A. Needs ffmpeg; the result is committed, so
# nothing at runtime or in tests depends on ffmpeg.
#
#   scripts/prepare-track.sh <source-audio> <start-seconds> <length-seconds> <out.m4a>
set -euo pipefail

[ $# -eq 4 ] || { echo "usage: $0 <source-audio> <start-seconds> <length-seconds> <out.m4a>" >&2; exit 2; }
src=$1 start=$2 len=$3 out=$4
target_i=-16 target_tp=-1.5 target_lra=11
fade_in=0.5 fade_out=2
fade_out_at=$(awk -v l="$len" -v f="$fade_out" 'BEGIN { printf "%.3f", l - f }')
cut=(-ss "$start" -t "$len" -i "$src")
fades="afade=t=in:d=$fade_in,afade=t=out:st=$fade_out_at:d=$fade_out"
loudnorm="loudnorm=I=$target_i:TP=$target_tp:LRA=$target_lra"

# Pass 1 measures the faded excerpt; pass 2 applies a linear gain from those measurements.
measured=$(ffmpeg -hide_banner -nostats "${cut[@]}" -af "$fades,$loudnorm:print_format=json" -f null - 2>&1 |
  sed -n '/^{/,/^}/p')
field() { printf '%s' "$measured" | sed -n "s/.*\"$1\" *: *\"\\(.*\\)\".*/\\1/p"; }
ffmpeg -hide_banner -loglevel error -y "${cut[@]}" -vn -map_metadata -1 \
  -af "$fades,$loudnorm:measured_I=$(field input_i):measured_TP=$(field input_tp):measured_LRA=$(field input_lra):measured_thresh=$(field input_thresh):offset=$(field target_offset):linear=true" \
  -ar 48000 -ac 2 -c:a aac -b:a 128k -movflags +faststart "$out"
