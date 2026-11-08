#!/usr/bin/env bash
# ต่อเฟรมฉากโน้ตบุ๊กเป็นวิดีโอ แล้วใส่เพลง
#   - ตัดเพลงช่วง 17.6–32.6 วิ (บีตเข้า 19.6 วิของเพลง = 2.0 วิของคลิป)
#   - fade in 0.3 วิ, fade out 1 วิตอนท้าย
set -euo pipefail
cd "$(dirname "$0")/.."
FR=web/.frames/laptop
mkdir -p out
ffmpeg -y -loglevel error -framerate 30 -i "$FR/%05d.png" -frames:v 450 \
  -c:v libx264 -preset slow -crf 16 -profile:v high -pix_fmt yuv420p -r 30 -movflags +faststart \
  out/promo-nomusic.mp4
ffmpeg -y -loglevel error -i out/promo-nomusic.mp4 -i music/no-radar-slowed.mp3 \
  -filter_complex "[1:a]atrim=start=17.6:end=32.6,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.3,afade=t=out:st=14:d=1[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -ar 44100 -shortest -movflags +faststart \
  out/promo.mp4
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate -of compact out/promo.mp4
