import {
  getUkuleleVoicing,
  type ChordEvent,
  type ChordQuality,
} from "./chords";
import type { TuningId } from "./ukulele";

export type BeginnerChord = {
  source: ChordEvent;
  name: string;
  rootPitchClass: number;
  quality: "major" | "minor";
  frets: number[];
  simplified: boolean;
};

export type BeginnerChordPlan = {
  capo: number;
  chords: BeginnerChord[];
  averageDifficulty: number;
};

const PITCH_CLASS_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

const normalizePitchClass = (pitch: number) => ((pitch % 12) + 12) % 12;

export function simplifyChordQuality(quality: ChordQuality): "major" | "minor" {
  return ["minor", "minor7", "diminished"].includes(quality) ? "minor" : "major";
}

function beginnerChordName(rootPitchClass: number, quality: "major" | "minor"): string {
  return `${PITCH_CLASS_NAMES[normalizePitchClass(rootPitchClass)]}${quality === "minor" ? "m" : ""}`;
}

export function voicingDifficulty(frets: number[]): number {
  const positiveFrets = frets.filter((fret) => fret > 0);
  const maxFret = Math.max(...frets);
  const minPositiveFret = positiveFrets.length > 0 ? Math.min(...positiveFrets) : 0;
  const span = positiveFrets.length > 1 ? maxFret - minPositiveFret : 0;
  const fingerCount = positiveFrets.length;
  const openStrings = frets.filter((fret) => fret === 0).length;
  return maxFret * 1.2 + span * 2.1 + fingerCount * 0.85 - openStrings * 0.38;
}

/**
 * Pick one capo position for the complete progression, then replace colour
 * tones with major/minor shapes that stay within the first five frets.
 */
export function createBeginnerChordPlan(
  chords: ChordEvent[],
  tuning: TuningId,
): BeginnerChordPlan {
  if (chords.length === 0) return { capo: 0, chords: [], averageDifficulty: 0 };

  let bestPlan: BeginnerChordPlan | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let capo = 0; capo <= 5; capo += 1) {
    const beginnerChords: BeginnerChord[] = [];
    let difficulty = 0;
    let playable = true;

    for (const chord of chords) {
      const quality = simplifyChordQuality(chord.quality);
      const rootPitchClass = normalizePitchClass(chord.rootPitchClass - capo);
      const frets = getUkuleleVoicing(rootPitchClass, quality, tuning, 5);
      if (!frets) {
        playable = false;
        break;
      }

      difficulty += voicingDifficulty(frets);
      beginnerChords.push({
        source: chord,
        name: beginnerChordName(rootPitchClass, quality),
        rootPitchClass,
        quality,
        frets,
        simplified: chord.quality !== quality || capo > 0,
      });
    }

    if (!playable) continue;
    const averageDifficulty = difficulty / beginnerChords.length;
    const score = averageDifficulty + capo * 0.34;
    if (score < bestScore) {
      bestScore = score;
      bestPlan = { capo, chords: beginnerChords, averageDifficulty };
    }
  }

  return bestPlan ?? { capo: 0, chords: [], averageDifficulty: Number.POSITIVE_INFINITY };
}
