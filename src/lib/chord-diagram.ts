export type ChordDiagramDot = {
  stringIndex: number;
  actualFret: number;
  displayFret: number;
  finger: number;
};

export type ChordDiagramModel = {
  baseFret: number;
  fretCount: number;
  openStrings: number[];
  mutedStrings: number[];
  dots: ChordDiagramDot[];
};

/**
 * Turn a four-string ukulele voicing into a compact chord-box model.
 * A single low-position note keeps the familiar fret-as-finger convention
 * (C = third finger, Am = second finger); multi-finger shapes are numbered
 * from the lowest fret upwards.
 */
export function buildChordDiagramModel(frets: number[]): ChordDiagramModel {
  const positiveFrets = frets.filter((fret) => fret > 0);
  const highestFret = Math.max(1, ...positiveFrets);
  const lowestFret = Math.min(highestFret, ...positiveFrets);
  const baseFret = highestFret <= 4 ? 1 : lowestFret;
  const fretCount = Math.max(4, highestFret - baseFret + 1);
  const pressed = frets
    .map((actualFret, stringIndex) => ({ actualFret, stringIndex }))
    .filter(({ actualFret }) => actualFret > 0)
    .sort((left, right) =>
      left.actualFret - right.actualFret || left.stringIndex - right.stringIndex,
    );

  const fingerFor = new Map<number, number>();
  if (pressed.length === 1) {
    const only = pressed[0];
    fingerFor.set(
      only.stringIndex,
      baseFret === 1 ? Math.min(4, Math.max(1, only.actualFret)) : 1,
    );
  } else {
    pressed.forEach(({ stringIndex }, index) => fingerFor.set(stringIndex, Math.min(4, index + 1)));
  }

  return {
    baseFret,
    fretCount,
    openStrings: frets
      .map((fret, stringIndex) => ({ fret, stringIndex }))
      .filter(({ fret }) => fret === 0)
      .map(({ stringIndex }) => stringIndex),
    mutedStrings: frets
      .map((fret, stringIndex) => ({ fret, stringIndex }))
      .filter(({ fret }) => fret < 0)
      .map(({ stringIndex }) => stringIndex),
    dots: pressed.map(({ actualFret, stringIndex }) => ({
      stringIndex,
      actualFret,
      displayFret: actualFret - baseFret + 1,
      finger: fingerFor.get(stringIndex) ?? 1,
    })),
  };
}
