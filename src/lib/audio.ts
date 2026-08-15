export type PreparedAudio = {
  buffer: AudioBuffer;
  duration: number;
  peaks: number[];
};

const TARGET_SAMPLE_RATE = 22_050;

function buildPeaks(buffer: AudioBuffer, count = 144): number[] {
  const data = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(data.length / count));
  const raw = Array.from({ length: count }, (_, blockIndex) => {
    const start = blockIndex * blockSize;
    const end = Math.min(start + blockSize, data.length);
    let peak = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      peak = Math.max(peak, Math.abs(data[sampleIndex]));
    }
    return peak;
  });
  const max = Math.max(...raw, 0.001);
  return raw.map((peak) => Math.max(0.07, peak / max));
}

export async function prepareAudio(file: File): Promise<PreparedAudio> {
  const context = new AudioContext();
  const decoded = await context.decodeAudioData(await file.arrayBuffer());
  const frameCount = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  const offlineContext = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
  const source = offlineContext.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineContext.destination);
  source.start(0);
  const buffer = await offlineContext.startRendering();
  await context.close();

  return {
    buffer,
    duration: decoded.duration,
    peaks: buildPeaks(buffer),
  };
}
