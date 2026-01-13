export function base64ToUint8Array(base64: string): Uint8Array {
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

export function arrayBufferToBase64(buffer: ArrayBufferLike): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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
