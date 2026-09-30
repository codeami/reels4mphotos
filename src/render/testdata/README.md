# testdata

Two 2 s, 1080x1920, 30 fps H.264 clips for `metadata.test.ts`, generated once with ffmpeg (tests
never call ffmpeg; it is only how these bytes were made):

```sh
ffmpeg -f lavfi -i "color=c=0x204060:s=1080x1920:r=30" -f lavfi -i "sine=frequency=440:sample_rate=48000" \
  -t 2 -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p -b:v 400k -c:a aac -b:a 64k -ac 2 \
  -movflags +faststart with-audio.mp4
ffmpeg -f lavfi -i "color=c=0x204060:s=1080x1920:r=30" \
  -t 2 -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p -b:v 400k -an -movflags +faststart silent.mp4
```
