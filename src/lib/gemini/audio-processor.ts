export const AUDIO_WORKLET_PROCESSOR_CODE = `
class GeminiAudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const float32Array = input[0];
      if (float32Array) {
        this.port.postMessage(float32Array);
      }
    }
    return true;
  }
}

registerProcessor('gemini-audio-processor', GeminiAudioProcessor);
`;
