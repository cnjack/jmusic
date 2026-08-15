import { describe, expect, it } from "vitest";
import { createBeginnerChordPlan } from "./beginner";
import { buildChordPlaybackSequence, buildMelodyPlaybackSequence } from "./playback";
import type { ChordEvent } from "./chords";
import type { TabNote } from "./ukulele";

const chord = (name: string, rootPitchClass: number, startTimeSeconds = 0): ChordEvent => ({
  name,
  rootPitchClass,
  quality: "major",
  startTimeSeconds,
  durationSeconds: 1.5,
  confidence: 0.9,
});

describe("generated ukulele playback", () => {
  it("keeps melody timing while playing the mapped ukulele pitch", () => {
    const notes = [
      { startTimeSeconds: 2, durationSeconds: 0.3, playablePitchMidi: 60 },
      { startTimeSeconds: 2.75, durationSeconds: 0.4, playablePitchMidi: 64 },
    ] as TabNote[];

    const sequence = buildMelodyPlaybackSequence(notes);
    expect(sequence.events.map(({ midi, startTimeSeconds }) => [midi, startTimeSeconds])).toEqual([
      [60, 0],
      [64, 0.75],
    ]);
  });

  it("strums all four strings for a chord", () => {
    const sequence = buildChordPlaybackSequence([chord("C", 0)], "high-g");
    expect(sequence.events.map(({ midi }) => midi)).toEqual([67, 60, 64, 72]);
    expect(sequence.events.map(({ startTimeSeconds }) => startTimeSeconds)).toEqual([0, 0.032, 0.064, 0.096]);
  });

  it("adds the capo back to beginner shapes so playback stays in the source key", () => {
    const chords = [chord("C♯", 1), chord("F♯", 6, 1.5), chord("A♭", 8, 3)];
    const plan = createBeginnerChordPlan(chords, "high-g");
    const sequence = buildChordPlaybackSequence(chords, "high-g", plan);
    const firstChordPitchClasses = sequence.events.slice(0, 4).map(({ midi }) => midi % 12);

    expect(plan.capo).toBe(1);
    expect(new Set(firstChordPitchClasses)).toEqual(new Set([1, 5, 8]));
  });
});
