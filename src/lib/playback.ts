import type { BeginnerChordPlan } from "./beginner";
import { getUkuleleVoicing, type ChordEvent } from "./chords";
import { TUNINGS, type TabNote, type TuningId } from "./ukulele";

export type SynthEvent = {
  midi: number;
  startTimeSeconds: number;
  durationSeconds: number;
  velocity: number;
};

export type PlaybackSequence = {
  events: SynthEvent[];
  durationSeconds: number;
};

export function buildMelodyPlaybackSequence(notes: TabNote[]): PlaybackSequence {
  if (notes.length === 0) return { events: [], durationSeconds: 0 };
  const origin = notes[0].startTimeSeconds;
  const events = notes.map((note) => ({
    midi: note.playablePitchMidi,
    startTimeSeconds: Math.max(0, note.startTimeSeconds - origin),
    durationSeconds: Math.min(1.15, Math.max(0.14, note.durationSeconds)),
    velocity: Math.min(1, Math.max(0.36, note.amplitude)),
  }));
  const durationSeconds = Math.max(
    ...events.map((event) => event.startTimeSeconds + event.durationSeconds),
  );
  return { events, durationSeconds };
}

export function buildChordPlaybackSequence(
  chords: ChordEvent[],
  tuning: TuningId,
  beginnerPlan?: BeginnerChordPlan,
): PlaybackSequence {
  if (chords.length === 0) return { events: [], durationSeconds: 0 };
  const origin = chords[0].startTimeSeconds;
  const events: SynthEvent[] = [];

  chords.forEach((chord, chordIndex) => {
    const beginnerChord = beginnerPlan?.chords[chordIndex];
    const frets = beginnerChord?.frets ??
      getUkuleleVoicing(chord.rootPitchClass, chord.quality, tuning);
    if (!frets) return;

    frets.forEach((fret, stringIndex) => {
      events.push({
        midi: TUNINGS[tuning].strings[stringIndex] + fret + (beginnerPlan?.capo ?? 0),
        startTimeSeconds:
          Math.max(0, chord.startTimeSeconds - origin) + stringIndex * 0.032,
        durationSeconds: Math.min(2.8, Math.max(0.42, chord.durationSeconds * 0.88)),
        velocity: Math.max(0.46, 0.78 - stringIndex * 0.055),
      });
    });
  });

  const durationSeconds = Math.max(
    chords[chords.length - 1].startTimeSeconds - origin +
      chords[chords.length - 1].durationSeconds,
    ...events.map((event) => event.startTimeSeconds + event.durationSeconds),
  );
  return { events, durationSeconds };
}

type PlayerCallbacks = {
  onProgress: (elapsedSeconds: number) => void;
  onEnded: () => void;
};

export class LocalUkulelePlayer {
  private context: AudioContext | null = null;
  private oscillators: OscillatorNode[] = [];
  private progressTimer: number | null = null;
  private endTimer: number | null = null;
  private runId = 0;

  stop(): void {
    this.runId += 1;
    if (this.progressTimer !== null) window.clearInterval(this.progressTimer);
    if (this.endTimer !== null) window.clearTimeout(this.endTimer);
    this.progressTimer = null;
    this.endTimer = null;
    this.oscillators.forEach((oscillator) => {
      try {
        oscillator.stop();
      } catch {
        // The oscillator may already have reached its scheduled stop time.
      }
    });
    this.oscillators = [];
    if (this.context) void this.context.close();
    this.context = null;
  }

  async play(sequence: PlaybackSequence, callbacks: PlayerCallbacks): Promise<void> {
    this.stop();
    if (sequence.events.length === 0 || sequence.durationSeconds <= 0) {
      callbacks.onEnded();
      return;
    }

    const context = new AudioContext();
    this.context = context;
    await context.resume();
    const runId = this.runId;
    const master = context.createGain();
    master.gain.value = 0.72;
    master.connect(context.destination);
    const sequenceStart = context.currentTime + 0.045;

    sequence.events.forEach((event) => {
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      const start = sequenceStart + event.startTimeSeconds;
      const end = start + event.durationSeconds;
      const frequency = 440 * 2 ** ((event.midi - 69) / 12);

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, start);
      filter.type = "lowpass";
      filter.Q.value = 0.7;
      filter.frequency.setValueAtTime(Math.min(4_200, frequency * 9), start);
      filter.frequency.exponentialRampToValueAtTime(Math.max(620, frequency * 2.2), end);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.17 * event.velocity, start + 0.009);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(filter).connect(gain).connect(master);
      oscillator.start(start);
      oscillator.stop(end + 0.025);
      this.oscillators.push(oscillator);
    });

    callbacks.onProgress(0);
    this.progressTimer = window.setInterval(() => {
      if (runId !== this.runId) return;
      callbacks.onProgress(
        Math.max(0, Math.min(sequence.durationSeconds, context.currentTime - sequenceStart)),
      );
    }, 48);
    this.endTimer = window.setTimeout(() => {
      if (runId !== this.runId) return;
      callbacks.onProgress(sequence.durationSeconds);
      this.stop();
      callbacks.onEnded();
    }, (sequence.durationSeconds + 0.12) * 1_000);
  }
}
