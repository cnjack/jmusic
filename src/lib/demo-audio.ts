function audioBufferToWaveFile(buffer: AudioBuffer, fileName: string): File {
  const samples = buffer.getChannelData(0);
  const output = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(output);

  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);

  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  });

  return new File([output], fileName, { type: "audio/wav" });
}
/** A tiny copyright-free chord progression generated entirely on this device. */
export async function createChordDemoFile(): Promise<File> {
  const sampleRate = 22_050;
  const chordLength = 1.8;
  const progression = [
    [48, 52, 55], // C
    [45, 48, 52], // Am
    [41, 45, 48], // F
    [43, 47, 50], // G
  ];
  const duration = progression.length * chordLength;
  const context = new OfflineAudioContext(1, Math.ceil(duration * sampleRate), sampleRate);

  progression.forEach((pitches, chordIndex) => {
    const chordStart = chordIndex * chordLength;
    pitches.forEach((pitchMidi, noteIndex) => {
      const noteStart = chordStart + noteIndex * 0.035;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 440 * 2 ** ((pitchMidi - 69) / 12);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.21, noteStart + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.055, noteStart + 1.2);
      gain.gain.exponentialRampToValueAtTime(0.0001, Math.min(duration, noteStart + 1.68));
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(Math.min(duration, noteStart + 1.7));
    });
  });

  return audioBufferToWaveFile(await context.startRendering(), "local-c-am-f-g-chords.wav");
}
