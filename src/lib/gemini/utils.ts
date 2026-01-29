export function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

const writeString = (view: DataView, offset: number, value: string) => {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
};

export function float32ToWavBuffer(
  float32Array: Float32Array,
  sampleRate: number = 16000,
  channels: number = 1,
): ArrayBuffer {
  const pcm16 = float32ToInt16(float32Array);
  const byteLength = pcm16.length * 2;
  const buffer = new ArrayBuffer(44 + byteLength);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + byteLength, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true); // byte rate
  view.setUint16(32, channels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, byteLength, true);

  let offset = 44;
  for (let i = 0; i < pcm16.length; i++, offset += 2) {
    view.setInt16(offset, pcm16[i], true);
  }

  return buffer;
}

export function pcm16BytesToWavBuffer(
  pcm16Bytes: Uint8Array,
  sampleRate: number = 24000,
  channels: number = 1,
): ArrayBuffer {
  const byteLength = pcm16Bytes.length - (pcm16Bytes.length % 2);
  const buffer = new ArrayBuffer(44 + byteLength);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + byteLength, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true); // byte rate
  view.setUint16(32, channels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, byteLength, true);

  if (byteLength > 0) {
    new Uint8Array(buffer, 44).set(pcm16Bytes.subarray(0, byteLength));
  }

  return buffer;
}

export function arrayBufferToBase64(buffer: ArrayBufferLike): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function createWavBlob(
  pcmData: Float32Array,
  sampleRate: number = 16000,
  channels: number = 1,
): { mimeType: string; data: string } {
  const wavBuffer = float32ToWavBuffer(pcmData, sampleRate, channels);
  const base64 = arrayBufferToBase64(wavBuffer);
  return {
    mimeType: "audio/wav",
    data: base64,
  };
}

export function createBlob(pcmData: Float32Array): { mimeType: string; data: string } {
  const pcm16 = float32ToInt16(pcmData);
  const base64 = arrayBufferToBase64(pcm16.buffer);
  return {
    mimeType: "audio/pcm;rate=16000",
    data: base64,
  };
}

export const decode = base64ToUint8Array;

export async function decodeAudioData(
  uint8Array: Uint8Array,
  audioContext: AudioContext,
  sampleRate: number = 24000,
  channels: number = 1,
): Promise<AudioBuffer> {
  const frameCount = uint8Array.length / 2;
  const audioBuffer = audioContext.createBuffer(channels, frameCount, sampleRate);
  const channelData = audioBuffer.getChannelData(0);
  const dataView = new DataView(uint8Array.buffer);

  for (let i = 0; i < frameCount; i++) {
    // Little endian 16-bit
    const int16 = dataView.getInt16(i * 2, true);
    channelData[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7fff;
  }
  return audioBuffer;
}
