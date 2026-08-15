import { describe, expect, it } from "vitest";
import { buildChordDiagramModel } from "./chord-diagram";

describe("ukulele chord diagram model", () => {
  it("uses the familiar finger number for one-finger open shapes", () => {
    expect(buildChordDiagramModel([0, 0, 0, 3]).dots).toEqual([
      { stringIndex: 3, actualFret: 3, displayFret: 3, finger: 3 },
    ]);
    expect(buildChordDiagramModel([2, 0, 0, 0]).dots[0].finger).toBe(2);
  });

  it("numbers common multi-finger shapes from low to high frets", () => {
    const g = buildChordDiagramModel([0, 2, 3, 2]);
    expect(g.dots.map(({ stringIndex, finger }) => [stringIndex, finger])).toEqual([
      [1, 1],
      [3, 2],
      [2, 3],
    ]);

    const d = buildChordDiagramModel([2, 2, 2, 0]);
    expect(d.dots.map(({ finger }) => finger)).toEqual([1, 2, 3]);
  });

  it("moves a high-position shape into a labelled four-fret window", () => {
    const model = buildChordDiagramModel([5, 5, 4, 7]);
    expect(model.baseFret).toBe(4);
    expect(model.fretCount).toBe(4);
    expect(model.dots.map(({ displayFret }) => displayFret)).toEqual([1, 2, 2, 4]);
  });
});
