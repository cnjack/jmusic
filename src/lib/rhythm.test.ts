import { describe, expect, it } from "vitest";
import type { ChordEvent } from "./chords";
import { estimateTempoBpm, suggestRhythm } from "./rhythm";
import type { TranscribedNote } from "./ukulele";

const note = (startTimeSeconds: number): TranscribedNote => ({
  startTimeSeconds,
  durationSeconds: 0.24,
  pitchMidi: 60,
  amplitude: 0.7,
});

const chord: ChordEvent = {
  name: "C",
  rootPitchClass: 0,
  quality: "major",
  startTimeSeconds: 0,
  durationSeconds: 4,
  confidence: 0.9,
};

describe("rhythm suggestions", () => {
  it("estimates a stable pulse while collapsing simultaneous notes", () => {
    const notes = [0, 0, 0.5, 1, 1.5, 2].map(note);
    expect(estimateTempoBpm(notes, [chord])).toBe(120);
  });

  it("uses an easy four-down pattern in beginner mode", () => {
    const suggestion = suggestRhythm([note(0), note(0.5)], [chord], 4, true);
    expect(suggestion.id).toBe("basic");
    expect(suggestion.strokes.map(({ subdivision, direction }) => [subdivision, direction])).toEqual([
      [0, "down"],
      [2, "down"],
      [4, "down"],
      [6, "down"],
    ]);
  });

  it("suggests a muted driving pattern for dense material", () => {
    const notes = Array.from({ length: 24 }, (_, index) => note(index * 0.2));
    const suggestion = suggestRhythm(notes, [chord], 4.8, false);
    expect(suggestion.id).toBe("driving");
    expect(suggestion.strokes.some(({ direction }) => direction === "chuck")).toBe(true);
  });
});
