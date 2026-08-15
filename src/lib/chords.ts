import { TUNINGS, type TranscribedNote, type TuningId } from "./ukulele";

export type ChordQuality =
  | "major"
  | "minor"
  | "dominant7"
  | "major7"
  | "minor7"
  | "sus2"
  | "sus4"
  | "diminished";

export type ChordEvent = {
  name: string;
  rootPitchClass: number;
  quality: ChordQuality;
  startTimeSeconds: number;
  durationSeconds: number;
  confidence: number;
};

type ChordTemplate = {
  quality: ChordQuality;
  suffix: string;
  intervals: number[];
  essentials: number[];
};

const PITCH_CLASS_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

const CHORD_TEMPLATES: ChordTemplate[] = [
  { quality: "dominant7", suffix: "7", intervals: [0, 4, 7, 10], essentials: [0, 4, 10] },
  { quality: "major7", suffix: "maj7", intervals: [0, 4, 7, 11], essentials: [0, 4, 11] },
  { quality: "minor7", suffix: "m7", intervals: [0, 3, 7, 10], essentials: [0, 3, 10] },
  { quality: "major", suffix: "", intervals: [0, 4, 7], essentials: [0, 4, 7] },
  { quality: "minor", suffix: "m", intervals: [0, 3, 7], essentials: [0, 3, 7] },
  { quality: "sus2", suffix: "sus2", intervals: [0, 2, 7], essentials: [0, 2, 7] },
  { quality: "sus4", suffix: "sus4", intervals: [0, 5, 7], essentials: [0, 5, 7] },
  { quality: "diminished", suffix: "dim", intervals: [0, 3, 6], essentials: [0, 3, 6] },
];

const normalizePitchClass = (pitch: number) => ((Math.round(pitch) % 12) + 12) % 12;

function templateForQuality(quality: ChordQuality): ChordTemplate {
  return CHORD_TEMPLATES.find((template) => template.quality === quality) ?? CHORD_TEMPLATES[3];
}

type WindowPrediction = {
  name: string;
  rootPitchClass: number;
  quality: ChordQuality;
  confidence: number;
} | null;

function classifyWindow(
  notes: TranscribedNote[],
  windowStart: number,
  windowEnd: number,
): WindowPrediction {
  const chroma = Array<number>(12).fill(0);
  const bassChroma = Array<number>(12).fill(0);

  for (const note of notes) {
    const noteEnd = note.startTimeSeconds + note.durationSeconds;
    const overlap = Math.max(
      0,
      Math.min(noteEnd, windowEnd) - Math.max(note.startTimeSeconds, windowStart),
    );
    if (overlap <= 0) continue;

    const pitchClass = normalizePitchClass(note.pitchMidi);
    const weight = Math.max(0.05, note.amplitude) * Math.sqrt(overlap);
    chroma[pitchClass] += weight;
    // Low notes are a useful but deliberately weak hint for the chord root.
    bassChroma[pitchClass] += weight * Math.max(0.18, 1.15 - (note.pitchMidi - 36) / 48);
  }

  const total = chroma.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;

  const significantPitchClasses = chroma.filter((value) => value / total >= 0.075).length;
  if (significantPitchClasses < 3) return null;

  const bassTotal = bassChroma.reduce((sum, value) => sum + value, 0) || 1;
  let best: WindowPrediction = null;

  for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass += 1) {
    for (const template of CHORD_TEMPLATES) {
      const members = template.intervals.map((interval) => (rootPitchClass + interval) % 12);
      const essentialValues = template.essentials.map(
        (interval) => chroma[(rootPitchClass + interval) % 12] / total,
      );
      if (essentialValues.some((value) => value < 0.055)) continue;

      const coverage = members.reduce((sum, pitchClass) => sum + chroma[pitchClass], 0) / total;
      const essentialBalance = Math.min(1, Math.min(...essentialValues) * template.essentials.length * 3.1);
      const bassSupport = bassChroma[rootPitchClass] / bassTotal;
      const outsideRatio = Math.max(0, 1 - coverage);
      const complexityPenalty = template.intervals.length === 4 ? 0.018 : 0;
      const confidence =
        coverage * 0.61 +
        essentialBalance * 0.27 +
        bassSupport * 0.12 -
        outsideRatio * 0.16 -
        complexityPenalty;

      if (!best || confidence > best.confidence) {
        best = {
          name: `${PITCH_CLASS_NAMES[rootPitchClass]}${template.suffix}`,
          rootPitchClass,
          quality: template.quality,
          confidence,
        };
      }
    }
  }

  return best && best.confidence >= 0.67 ? best : null;
}

/**
 * Build a deliberately small, explainable chord timeline from Basic Pitch's
 * polyphonic notes. It favours stable harmony over emitting a label for every
 * short melodic fragment.
 */
export function detectChords(
  inputNotes: TranscribedNote[],
  durationSeconds: number,
): ChordEvent[] {
  const notes = inputNotes.filter(
    (note) =>
      Number.isFinite(note.pitchMidi) &&
      note.durationSeconds >= 0.09 &&
      note.amplitude >= 0.1,
  );
  if (notes.length === 0 || durationSeconds <= 0) return [];

  const hopSeconds = Math.min(0.75, Math.max(0.38, durationSeconds / 100));
  const windowSeconds = Math.max(1.05, hopSeconds * 2.35);
  const samples: Array<{ time: number; prediction: WindowPrediction }> = [];

  for (let time = 0; time < durationSeconds; time += hopSeconds) {
    samples.push({
      time,
      prediction: classifyWindow(notes, time, Math.min(durationSeconds, time + windowSeconds)),
    });
  }

  // Remove a single unstable frame between two matching chord frames.
  for (let index = 1; index < samples.length - 1; index += 1) {
    const previous = samples[index - 1].prediction;
    const next = samples[index + 1].prediction;
    if (previous && next && previous.name === next.name && samples[index].prediction?.name !== previous.name) {
      samples[index].prediction = { ...previous, confidence: Math.min(previous.confidence, next.confidence) };
    }
  }

  const events: ChordEvent[] = [];
  let runStart = 0;

  while (runStart < samples.length) {
    const prediction = samples[runStart].prediction;
    let runEnd = runStart + 1;
    while (runEnd < samples.length && samples[runEnd].prediction?.name === prediction?.name) {
      runEnd += 1;
    }

    const frameCount = runEnd - runStart;
    if (prediction && (frameCount >= 2 || prediction.confidence >= 0.86)) {
      const startTimeSeconds = samples[runStart].time;
      const endTimeSeconds = runEnd < samples.length ? samples[runEnd].time : durationSeconds;
      const confidence =
        samples
          .slice(runStart, runEnd)
          .reduce((sum, sample) => sum + (sample.prediction?.confidence ?? 0), 0) / frameCount;
      events.push({
        ...prediction,
        startTimeSeconds,
        durationSeconds: Math.max(hopSeconds, endTimeSeconds - startTimeSeconds),
        confidence: Math.min(0.99, Math.max(0, confidence)),
      });
    }

    runStart = runEnd;
  }

  // A forward-looking window can briefly see the union of two adjacent
  // triads (for example C + Am looks like Am7). Treat a short seventh chord
  // sandwiched between two stable triads as a transition, not a real chord.
  const stableEvents = events.filter((event, index) => {
    const previous = events[index - 1];
    const next = events[index + 1];
    const isSeventh = ["dominant7", "major7", "minor7"].includes(event.quality);
    const neighboursAreTriads =
      previous &&
      next &&
      !["dominant7", "major7", "minor7"].includes(previous.quality) &&
      !["dominant7", "major7", "minor7"].includes(next.quality);
    return !(isSeventh && neighboursAreTriads && event.durationSeconds <= windowSeconds * 1.25);
  });

  return stableEvents.slice(0, 160);
}

/** Find a compact, playable four-string voicing for a detected chord. */
export function getUkuleleVoicing(
  rootPitchClass: number,
  quality: ChordQuality,
  tuningId: TuningId,
  maxFret = 7,
): number[] | null {
  const template = templateForQuality(quality);
  const targetPitchClasses = new Set(
    template.intervals.map((interval) => (rootPitchClass + interval) % 12),
  );
  const candidates = TUNINGS[tuningId].strings.map((openPitch) =>
    Array.from({ length: maxFret + 1 }, (_, fret) => fret).filter((fret) =>
      targetPitchClasses.has(normalizePitchClass(openPitch + fret)),
    ),
  );

  if (candidates.some((stringCandidates) => stringCandidates.length === 0)) return null;

  let bestFrets: number[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const first of candidates[0]) {
    for (const second of candidates[1]) {
      for (const third of candidates[2]) {
        for (const fourth of candidates[3]) {
          const frets = [first, second, third, fourth];
          const heardPitchClasses = new Set(
            frets.map((fret, index) => normalizePitchClass(TUNINGS[tuningId].strings[index] + fret)),
          );
          const missingCount = [...targetPitchClasses].filter((pitchClass) => !heardPitchClasses.has(pitchClass)).length;
          const positiveFrets = frets.filter((fret) => fret > 0);
          const maxUsedFret = Math.max(...frets);
          const minUsedFret = positiveFrets.length > 0 ? Math.min(...positiveFrets) : 0;
          const span = positiveFrets.length > 1 ? maxUsedFret - minUsedFret : 0;
          const rootPresent = heardPitchClasses.has(rootPitchClass);
          const score =
            missingCount * 28 +
            (rootPresent ? 0 : 18) +
            span * 2.2 +
            maxUsedFret * 0.55 +
            frets.reduce((sum, fret) => sum + fret, 0) * 0.08 -
            frets.filter((fret) => fret === 0).length * 0.3;

          if (score < bestScore) {
            bestScore = score;
            bestFrets = frets;
          }
        }
      }
    }
  }

  return bestFrets;
}
