export const FRAME_WIDTH = 1080;
export const FRAME_HEIGHT = 1920;
export const FPS = 30;

// docs/scout-technical.md section 1: H.264 High@4.0 + AAC-LC 128 kbps.
export const VIDEO_CODEC = 'avc1.640028';
export const VIDEO_BITRATE = 8_000_000;
export const KEYFRAME_INTERVAL_FRAMES = FPS * 2;

export const AAC_CODEC = 'mp4a.40.2';
export const OPUS_CODEC = 'opus';
export const AUDIO_BITRATE = 128_000;
export const AUDIO_SAMPLE_RATE = 48_000;
export const AUDIO_CHANNELS = 2;
export const AUDIO_CHUNK_FRAMES = 4_800;
export const AUDIO_FADE_IN_MS = 4;
export const AUDIO_FADE_OUT_MS = 600;

// Frames a crossfade occupies, centred on the beat the incoming shot starts on.
export const CROSSFADE_FRAMES = 10;

// Photos are decoded no larger than this so ten 12 MP shots never sit in memory at once.
export const MAX_PHOTO_LONG_EDGE = 3072;
export const PHOTO_CACHE_SIZE = 3;

export const ENCODER_QUEUE_LIMIT = 8;
