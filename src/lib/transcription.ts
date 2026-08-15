import {
  BasicPitch,
  noteFramesToTime,
  outputToNotesPoly,
  type NoteEventTime,
} from "@spotify/basic-pitch";

let basicPitch: BasicPitch | null = null;

function getModel(): BasicPitch {
  if (!basicPitch) {
    const modelUrl = new URL("model/model.json", document.baseURI).toString();
    basicPitch = new BasicPitch(modelUrl);
  }
  return basicPitch;
}

export async function transcribeLocally(
  audioBuffer: AudioBuffer,
  onProgress: (progress: number) => void,
): Promise<NoteEventTime[]> {
  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];

  await getModel().evaluateModel(
    audioBuffer,
    (frameChunk, onsetChunk, contourChunk) => {
      frames.push(...frameChunk);
      onsets.push(...onsetChunk);
      contours.push(...contourChunk);
    },
    onProgress,
  );

  // For the PoC we only need discrete notes, so pitch-bend extraction is
  // intentionally omitted. This keeps tab generation fast and deterministic.
  const noteFrames = outputToNotesPoly(
    frames,
    onsets,
    0.25,
    0.25,
    5,
    true,
    2_000,
    70,
    true,
  );

  return noteFramesToTime(noteFrames).sort(
    (a, b) => a.startTimeSeconds - b.startTimeSeconds,
  );
}
