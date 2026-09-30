import { ALL_FORMATS, BlobSource, BufferSource, Input } from 'mediabunny';

export interface VideoMetadata {
  // 'MP4' for the WebCodecs paths; MediaRecorder on Chromium hands back 'WebM'.
  container: string;
  width: number;
  height: number;
  // Average frames per second over the whole file.
  fps: number;
  frameCount: number;
  durationSec: number;
  videoCodec: string | null;
  hasAudio: boolean;
  audioCodec: string | null;
  audioSampleRate: number | null;
  audioChannels: number | null;
}

// Reads a finished export back in JavaScript (no ffmpeg), so the MVP gate's evidence can run on
// any machine. Not part of the app bundle: only tests and the E2E import it.
export async function readMp4Metadata(
  data: Blob | ArrayBuffer | Uint8Array,
): Promise<VideoMetadata> {
  const source = data instanceof Blob ? new BlobSource(data) : new BufferSource(data);
  const input = new Input({ source, formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error('the file has no video track');
    const audio = await input.getPrimaryAudioTrack();
    const stats = await video.computePacketStats();
    const format = await input.getFormat();

    return {
      container: format.name,
      width: await video.getDisplayWidth(),
      height: await video.getDisplayHeight(),
      fps: stats.averagePacketRate,
      frameCount: stats.packetCount,
      durationSec: await input.computeDuration(),
      videoCodec: await video.getCodec(),
      hasAudio: audio !== null,
      audioCodec: audio ? await audio.getCodec() : null,
      audioSampleRate: audio ? await audio.getSampleRate() : null,
      audioChannels: audio ? await audio.getNumberOfChannels() : null,
    };
  } finally {
    input.dispose();
  }
}
