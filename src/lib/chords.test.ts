import { describe, expect, it } from "vitest";
import { detectChords, getUkuleleVoicing } from "./chords";
import type { TranscribedNote } from "./ukulele";

const chordNotes = (pitches: number[], start: number, duration = 1.5): TranscribedNote[] =>
  pitches.map((pitchMidi) => ({
    pitchMidi,
    startTimeSeconds: start,
    durationSeconds: duration,
    amplitude: 0.88,
  }));

describe("local chord detection", () => {
  it("recognizes a C Am F G progression", () => {
    const notes = [
      ...chordNotes([48, 52, 55], 0),
      ...chordNotes([45, 48, 52], 1.5),
      ...chordNotes([41, 45, 48], 3),
      ...chordNotes([43, 47, 50], 4.5),
    ];

    expect(detectChords(notes, 6).map((chord) => chord.name)).toEqual(["C", "Am", "F", "G"]);
  });

  it("does not label a sparse melody as a chord", () => {
    const melody = [60, 62, 64, 65, 67].map((pitchMidi, index) => ({
      pitchMidi,
      startTimeSeconds: index * 0.55,
      durationSeconds: 0.22,
      amplitude: 0.8,
    }));

    expect(detectChords(melody, 3)).toEqual([]);
  });

  it("finds familiar open ukulele shapes", () => {
    expect(getUkuleleVoicing(0, "major", "high-g")).toEqual([0, 0, 0, 3]);
    expect(getUkuleleVoicing(5, "major", "high-g")).toEqual([2, 0, 1, 0]);
    expect(getUkuleleVoicing(9, "minor", "high-g")).toEqual([2, 0, 0, 0]);
  });
});
