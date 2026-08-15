import type { ChordEvent } from "./chords";
import type { TranscribedNote } from "./ukulele";

export type StrumDirection = "down" | "up" | "chuck";

export type RhythmStroke = {
  subdivision: number;
  direction: StrumDirection;
  accent?: boolean;
};

export type RhythmSuggestion = {
  id: "basic" | "island" | "driving";
  label: string;
  description: string;
  tempoBpm: number;
  beatsPerBar: 4;
  strokes: RhythmStroke[];
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function estimateTempoBpm(
  notes: TranscribedNote[],
  chords: ChordEvent[],
): number {
  const uniqueOnsets: number[] = [];
  notes
    .filter((note) =>
      Number.isFinite(note.startTimeSeconds) &&
      note.durationSeconds >= 0.055 &&
      note.amplitude >= 0.12,
    )
    .sort((left, right) => left.startTimeSeconds - right.startTimeSeconds)
    .forEach((note) => {
      const previous = uniqueOnsets[uniqueOnsets.length - 1];
      if (previous === undefined || note.startTimeSeconds - previous > 0.075) {
        uniqueOnsets.push(note.startTimeSeconds);
      }
    });

  const normalizedIntervals = uniqueOnsets
    .slice(1)
    .map((onset, index) => onset - uniqueOnsets[index])
    .filter((interval) => interval >= 0.14 && interval <= 2)
    .map((interval) => {
      let beat = interval;
      while (beat < 0.34) beat *= 2;
      while (beat > 0.82) beat /= 2;
      return beat;
    });

  let beatSeconds = median(normalizedIntervals);
  if (!beatSeconds && chords.length > 0) {
    const chordDurations = chords
      .map((chord) => chord.durationSeconds)
      .filter((duration) => duration > 0.2);
    const chordDuration = median(chordDurations);
    if (chordDuration) {
      beatSeconds = chordDuration >= 2.2 ? chordDuration / 4 : chordDuration / 2;
      while (beatSeconds < 0.34) beatSeconds *= 2;
      while (beatSeconds > 0.82) beatSeconds /= 2;
    }
  }

  if (!beatSeconds) return 84;
  return Math.round(clamp(60 / beatSeconds, 64, 156));
}

function uniqueOnsetDensity(notes: TranscribedNote[], durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  const onsets: number[] = [];
  [...notes]
    .sort((left, right) => left.startTimeSeconds - right.startTimeSeconds)
    .forEach((note) => {
      const previous = onsets[onsets.length - 1];
      if (note.amplitude >= 0.12 && (previous === undefined || note.startTimeSeconds - previous > 0.075)) {
        onsets.push(note.startTimeSeconds);
      }
    });
  return onsets.length / durationSeconds;
}

export function suggestRhythm(
  notes: TranscribedNote[],
  chords: ChordEvent[],
  durationSeconds: number,
  beginnerMode: boolean,
): RhythmSuggestion {
  const tempoBpm = estimateTempoBpm(notes, chords);

  if (beginnerMode) {
    return {
      id: "basic",
      label: "四拍基础型",
      description: "每拍一次下扫，先把换和弦和重拍弹稳",
      tempoBpm,
      beatsPerBar: 4,
      strokes: [0, 2, 4, 6].map((subdivision) => ({
        subdivision,
        direction: "down" as const,
        accent: subdivision === 0,
      })),
    };
  }

  if (uniqueOnsetDensity(notes, durationSeconds) >= 2.35) {
    return {
      id: "driving",
      label: "切音推进型",
      description: "下扫与切音交替，适合音符较密、律动明确的段落",
      tempoBpm,
      beatsPerBar: 4,
      strokes: [
        { subdivision: 0, direction: "down", accent: true },
        { subdivision: 1, direction: "chuck" },
        { subdivision: 2, direction: "down" },
        { subdivision: 3, direction: "up" },
        { subdivision: 4, direction: "chuck", accent: true },
        { subdivision: 5, direction: "up" },
        { subdivision: 6, direction: "down" },
        { subdivision: 7, direction: "up" },
      ],
    };
  }

  return {
    id: "island",
    label: "舒缓八拍型",
    description: "留出两个空拍，让旋律和换和弦更有呼吸",
    tempoBpm,
    beatsPerBar: 4,
    strokes: [
      { subdivision: 0, direction: "down", accent: true },
      { subdivision: 2, direction: "down" },
      { subdivision: 3, direction: "up" },
      { subdivision: 5, direction: "up" },
      { subdivision: 6, direction: "down" },
      { subdivision: 7, direction: "up" },
    ],
  };
}
