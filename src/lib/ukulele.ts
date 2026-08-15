export type TuningId = "high-g" | "low-g";

export type TranscribedNote = {
  startTimeSeconds: number;
  durationSeconds: number;
  pitchMidi: number;
  amplitude: number;
};

export type TabNote = TranscribedNote & {
  sourcePitchMidi: number;
  playablePitchMidi: number;
  stringIndex: number;
  stringName: string;
  fret: number;
  octaveShift: number;
  noteName: string;
};

export const TUNINGS: Record<
  TuningId,
  { label: string; shortLabel: string; strings: number[]; stringNames: string[] }
> = {
  "high-g": {
    label: "标准 High-G",
    shortLabel: "gCEA",
    strings: [67, 60, 64, 69],
    stringNames: ["g", "C", "E", "A"],
  },
  "low-g": {
    label: "Low-G",
    shortLabel: "GCEA",
    strings: [55, 60, 64, 69],
    stringNames: ["G", "C", "E", "A"],
  },
};

type PositionCandidate = {
  stringIndex: number;
  stringName: string;
  fret: number;
  playablePitchMidi: number;
  octaveShift: number;
};

const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

export function midiToNoteName(midi: number): string {
  const normalized = Math.round(midi);
  const pitchClass = ((normalized % 12) + 12) % 12;
  const octave = Math.floor(normalized / 12) - 1;
  return `${NOTE_NAMES[pitchClass]}${octave}`;
}

function candidatesForPitch(
  sourcePitchMidi: number,
  tuningId: TuningId,
  maxFret = 15,
): PositionCandidate[] {
  const tuning = TUNINGS[tuningId];
  const octaveShifts = [0, -12, 12, -24, 24, -36, 36, -48, 48];
  const candidates: PositionCandidate[] = [];

  for (const octaveShift of octaveShifts) {
    const playablePitchMidi = sourcePitchMidi + octaveShift;
    tuning.strings.forEach((openPitch, stringIndex) => {
      const fret = playablePitchMidi - openPitch;
      if (fret >= 0 && fret <= maxFret) {
        candidates.push({
          stringIndex,
          stringName: tuning.stringNames[stringIndex],
          fret,
          playablePitchMidi,
          octaveShift,
        });
      }
    });
  }

  return candidates;
}

/**
 * Reduce polyphonic model output to one clear melodic event per onset.
 * This is deliberately conservative: the PoC produces a melody TAB, not a
 * complete fingerstyle arrangement.
 */
export function extractMelodyLine(notes: TranscribedNote[]): TranscribedNote[] {
  const usable = notes
    .filter(
      (note) =>
        Number.isFinite(note.pitchMidi) &&
        note.durationSeconds >= 0.055 &&
        note.amplitude >= 0.16,
    )
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds || b.amplitude - a.amplitude);

  const onsetToleranceSeconds = 0.065;
  const grouped: TranscribedNote[][] = [];

  for (const note of usable) {
    const current = grouped[grouped.length - 1];
    if (
      current &&
      Math.abs(note.startTimeSeconds - current[0].startTimeSeconds) <=
        onsetToleranceSeconds
    ) {
      current.push(note);
    } else {
      grouped.push([note]);
    }
  }

  return grouped
    .map((group) =>
      group.reduce((best, note) => {
        const bestScore = best.amplitude * 1.8 + best.durationSeconds * 0.08 + best.pitchMidi * 0.001;
        const score = note.amplitude * 1.8 + note.durationSeconds * 0.08 + note.pitchMidi * 0.001;
        return score > bestScore ? note : best;
      }),
    )
    .filter((note, index, melody) => {
      const previous = melody[index - 1];
      return !(
        previous &&
        previous.pitchMidi === note.pitchMidi &&
        note.startTimeSeconds - previous.startTimeSeconds < 0.09
      );
    })
    .slice(0, 320);
}

function localCost(candidate: PositionCandidate): number {
  const octavePenalty = Math.abs(candidate.octaveShift) / 12 * 4.2;
  const highFretPenalty = candidate.fret > 10 ? (candidate.fret - 10) * 0.45 : 0;
  return octavePenalty + candidate.fret * 0.035 + highFretPenalty;
}

function movementCost(from: PositionCandidate, to: PositionCandidate): number {
  const fretTravel = Math.abs(from.fret - to.fret) * 0.72;
  const stringTravel = Math.abs(from.stringIndex - to.stringIndex) * 0.2;
  const positionJump = Math.abs(from.fret - to.fret) > 5 ? 1.25 : 0;
  return fretTravel + stringTravel + positionJump;
}

export function mapNotesToUkulele(
  inputNotes: TranscribedNote[],
  tuningId: TuningId,
): TabNote[] {
  const notes = extractMelodyLine(inputNotes);
  if (notes.length === 0) return [];

  const allCandidates = notes.map((note) => candidatesForPitch(note.pitchMidi, tuningId));
  if (allCandidates.some((candidates) => candidates.length === 0)) return [];

  const costs: number[][] = [];
  const previousIndexes: number[][] = [];

  allCandidates.forEach((candidates, noteIndex) => {
    costs[noteIndex] = candidates.map(() => Number.POSITIVE_INFINITY);
    previousIndexes[noteIndex] = candidates.map(() => -1);

    candidates.forEach((candidate, candidateIndex) => {
      const ownCost = localCost(candidate);
      if (noteIndex === 0) {
        costs[noteIndex][candidateIndex] = ownCost;
        return;
      }

      allCandidates[noteIndex - 1].forEach((previous, previousIndex) => {
        const total =
          costs[noteIndex - 1][previousIndex] +
          ownCost +
          movementCost(previous, candidate);
        if (total < costs[noteIndex][candidateIndex]) {
          costs[noteIndex][candidateIndex] = total;
          previousIndexes[noteIndex][candidateIndex] = previousIndex;
        }
      });
    });
  });

  const chosenIndexes = Array(notes.length).fill(0);
  chosenIndexes[notes.length - 1] = costs[costs.length - 1].reduce(
    (bestIndex, cost, index, row) => (cost < row[bestIndex] ? index : bestIndex),
    0,
  );

  for (let noteIndex = notes.length - 1; noteIndex > 0; noteIndex -= 1) {
    chosenIndexes[noteIndex - 1] =
      previousIndexes[noteIndex][chosenIndexes[noteIndex]];
  }

  return notes.map((note, noteIndex) => {
    const candidate = allCandidates[noteIndex][chosenIndexes[noteIndex]];
    return {
      ...note,
      sourcePitchMidi: note.pitchMidi,
      playablePitchMidi: candidate.playablePitchMidi,
      stringIndex: candidate.stringIndex,
      stringName: candidate.stringName,
      fret: candidate.fret,
      octaveShift: candidate.octaveShift,
      noteName: midiToNoteName(note.pitchMidi),
    };
  });
}

export function splitIntoPhrases(notes: TabNote[], phraseSize = 8): TabNote[][] {
  const phrases: TabNote[][] = [];
  for (let index = 0; index < notes.length; index += phraseSize) {
    phrases.push(notes.slice(index, index + phraseSize));
  }
  return phrases;
}
