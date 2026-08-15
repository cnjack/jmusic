import { describe, expect, it } from "vitest";
import { createBeginnerChordPlan, simplifyChordQuality, voicingDifficulty } from "./beginner";
import type { ChordEvent, ChordQuality } from "./chords";

const chord = (name: string, rootPitchClass: number, quality: ChordQuality): ChordEvent => ({
  name,
  rootPitchClass,
  quality,
  startTimeSeconds: 0,
  durationSeconds: 1,
  confidence: 0.9,
});

describe("beginner chord mapping", () => {
  it("reduces colour tones to major or minor triads", () => {
    expect(simplifyChordQuality("dominant7")).toBe("major");
    expect(simplifyChordQuality("sus4")).toBe("major");
    expect(simplifyChordQuality("minor7")).toBe("minor");
    expect(simplifyChordQuality("diminished")).toBe("minor");
  });

  it("prefers open-position C Am F G without a capo", () => {
    const plan = createBeginnerChordPlan([
      chord("C", 0, "major"),
      chord("Am", 9, "minor"),
      chord("F", 5, "major"),
      chord("G", 7, "major"),
    ], "high-g");

    expect(plan.capo).toBe(0);
    expect(plan.chords.map(({ name, frets }) => [name, frets])).toEqual([
      ["C", [0, 0, 0, 3]],
      ["Am", [2, 0, 0, 0]],
      ["F", [2, 0, 1, 0]],
      ["G", [0, 2, 3, 2]],
    ]);
  });

  it("uses a capo when it makes a sharp-key progression easier", () => {
    const plan = createBeginnerChordPlan([
      chord("C♯", 1, "major"),
      chord("F♯", 6, "major"),
      chord("A♭", 8, "major"),
    ], "high-g");

    expect(plan.capo).toBe(1);
    expect(plan.chords.map(({ name }) => name)).toEqual(["C", "F", "G"]);
  });

  it("scores an open chord below a stretched shape", () => {
    expect(voicingDifficulty([0, 0, 0, 3])).toBeLessThan(voicingDifficulty([4, 3, 2, 4]));
  });

  it("finds a beginner shape for every major and minor root", () => {
    for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass += 1) {
      expect(createBeginnerChordPlan([
        chord("major", rootPitchClass, "major"),
        chord("minor", rootPitchClass, "minor"),
      ], "high-g").chords).toHaveLength(2);
    }
  });
});
