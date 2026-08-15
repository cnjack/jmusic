import { describe, expect, it } from "vitest";
import {
  extractMelodyLine,
  mapNotesToUkulele,
  midiToNoteName,
  type TranscribedNote,
} from "./ukulele";

const note = (
  pitchMidi: number,
  startTimeSeconds: number,
  amplitude = 0.8,
): TranscribedNote => ({
  pitchMidi,
  startTimeSeconds,
  durationSeconds: 0.35,
  amplitude,
});

describe("ukulele mapping", () => {
  it("maps open strings without changing their octave", () => {
    const mapped = mapNotesToUkulele(
      [note(60, 0), note(64, 0.5), note(67, 1), note(69, 1.5)],
      "high-g",
    );

    expect(mapped.map(({ stringName, fret }) => [stringName, fret])).toEqual([
      ["C", 0],
      ["E", 0],
      ["g", 0],
      ["A", 0],
    ]);
    expect(mapped.every((mappedNote) => mappedNote.octaveShift === 0)).toBe(true);
  });

  it("uses low G directly but octave-folds it for re-entrant high G", () => {
    const lowG = mapNotesToUkulele([note(55, 0)], "low-g")[0];
    const highG = mapNotesToUkulele([note(55, 0)], "high-g")[0];

    expect([lowG.stringName, lowG.fret, lowG.octaveShift]).toEqual(["G", 0, 0]);
    expect(highG.playablePitchMidi % 12).toBe(55 % 12);
    expect(highG.octaveShift).not.toBe(0);
  });

  it("keeps the strongest note when model onsets overlap", () => {
    const melody = extractMelodyLine([
      note(60, 0, 0.3),
      note(67, 0.02, 0.9),
      note(69, 0.5, 0.7),
    ]);

    expect(melody.map((item) => item.pitchMidi)).toEqual([67, 69]);
  });

  it("formats MIDI pitch names", () => {
    expect(midiToNoteName(60)).toBe("C4");
    expect(midiToNoteName(70)).toBe("B♭4");
  });
});
