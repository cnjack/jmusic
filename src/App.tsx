import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  AudioLines,
  ChevronRight,
  Cpu,
  Disc3,
  FlaskConical,
  Gauge,
  ListMusic,
  Music2,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Upload,
  Volume2,
  VolumeX,
} from "lucide-react";
import "./App.css";
import { prepareAudio, type PreparedAudio } from "./lib/audio";
import {
  createBeginnerChordPlan,
  type BeginnerChordPlan,
} from "./lib/beginner";
import {
  detectChords,
  getUkuleleVoicing,
  type ChordEvent,
} from "./lib/chords";
import { createChordDemoFile } from "./lib/demo-audio";
import {
  buildChordPlaybackSequence,
  buildMelodyPlaybackSequence,
  LocalUkulelePlayer,
  type PlaybackSequence,
} from "./lib/playback";
import { transcribeLocally } from "./lib/transcription";
import {
  mapNotesToUkulele,
  splitIntoPhrases,
  TUNINGS,
  type TabNote,
  type TranscribedNote,
  type TuningId,
} from "./lib/ukulele";

type Phase = "empty" | "decoding" | "ready" | "analyzing" | "done" | "error";
type ChordDisplayMode = "original" | "beginner";
type SynthMode = "chords" | "melody" | null;

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
};

type TabSystemProps = {
  notes: TabNote[];
  phraseIndex: number;
  baseIndex: number;
  activeIndex: number;
  tuning: TuningId;
  onSelect: (note: TabNote) => void;
};

function TabSystem({ notes, phraseIndex, baseIndex, activeIndex, tuning, onSelect }: TabSystemProps) {
  const displayStrings = [3, 2, 1, 0];

  return (
    <section className="tab-system">
      <div className="tab-system__meta">
        <span>{String(phraseIndex + 1).padStart(2, "0")}</span>
        <time>{formatTime(notes[0]?.startTimeSeconds ?? 0)}</time>
      </div>
      <div className="tab-staff" aria-label={`第 ${phraseIndex + 1} 行尤克里里 TAB`}>
        {displayStrings.map((stringIndex) => (
          <div className="tab-string" key={stringIndex}>
            <span className="tab-string__name">{TUNINGS[tuning].stringNames[stringIndex]}</span>
            <div className="tab-string__line">
              {notes.map((note, noteIndex) => {
                if (note.stringIndex !== stringIndex) return null;
                const globalIndex = baseIndex + noteIndex;
                return (
                  <button
                    key={`${note.startTimeSeconds}-${note.pitchMidi}-${noteIndex}`}
                    type="button"
                    className={`tab-fret ${globalIndex === activeIndex ? "is-active" : ""}`}
                    style={{ "--note-x": `${((noteIndex + 0.5) / notes.length) * 100}%` } as CSSProperties}
                    onClick={() => onSelect(note)}
                    title={`${note.noteName} · ${formatTime(note.startTimeSeconds)}`}
                    aria-label={`${note.stringName} 弦 ${note.fret} 品，${note.noteName}`}
                  >
                    {note.fret}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

type ChordTrackProps = {
  chords: ChordEvent[];
  currentTime: number;
  tuning: TuningId;
  displayMode: ChordDisplayMode;
  beginnerPlan: BeginnerChordPlan;
  isPreviewing: boolean;
  onDisplayModeChange: (mode: ChordDisplayMode) => void;
  onTogglePreview: () => void;
  onSelect: (chord: ChordEvent, index: number) => void;
};

function ChordTrack({
  chords,
  currentTime,
  tuning,
  displayMode,
  beginnerPlan,
  isPreviewing,
  onDisplayModeChange,
  onTogglePreview,
  onSelect,
}: ChordTrackProps) {
  return (
    <section className="chord-sheet">
      <header className="chord-sheet__header">
        <div>
          <span className="eyebrow">CHORD MAP / {displayMode === "beginner" ? "EASY" : "AUTO"}</span>
          <h2>{displayMode === "beginner" ? "初学者和弦谱" : "尤克里里和弦时间轴"}</h2>
        </div>
        <div className="score-controls score-controls--dark">
          <div className="arrangement-switch" role="group" aria-label="和弦难度">
            <button type="button" className={displayMode === "original" ? "is-selected" : ""} onClick={() => onDisplayModeChange("original")}>原曲</button>
            <button type="button" className={displayMode === "beginner" ? "is-selected" : ""} onClick={() => onDisplayModeChange("beginner")}>初学者</button>
          </div>
          <button type="button" className={`score-play-button ${isPreviewing ? "is-playing" : ""}`} onClick={onTogglePreview} disabled={chords.length === 0}>
            {isPreviewing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            {isPreviewing ? "停止和弦" : "播放和弦"}
          </button>
        </div>
      </header>

      {displayMode === "beginner" && chords.length > 0 && (
        <div className="beginner-banner">
          <strong>{beginnerPlan.capo > 0 ? `CAPO ${beginnerPlan.capo}` : "OPEN POSITION"}</strong>
          <span>{beginnerPlan.capo > 0 ? "夹变调夹后按下方简单指法，保持原曲调性" : "无需变调夹，优先开放和弦与低把位"}</span>
          <i>7 / SUS / DIM 会近似简化</i>
        </div>
      )}

      {chords.length > 0 ? (
        <div className="chord-timeline">
          {chords.map((chord, index) => {
            const beginnerChord = displayMode === "beginner" ? beginnerPlan.chords[index] : undefined;
            const chordName = beginnerChord?.name ?? chord.name;
            const voicing = beginnerChord?.frets ?? getUkuleleVoicing(chord.rootPitchClass, chord.quality, tuning);
            const isActive =
              currentTime >= chord.startTimeSeconds &&
              currentTime < chord.startTimeSeconds + chord.durationSeconds;
            return (
              <button
                type="button"
                className={`chord-event ${isActive ? "is-active" : ""}`}
                style={{ "--chord-weight": Math.max(1, chord.durationSeconds) } as CSSProperties}
                onClick={() => onSelect(chord, index)}
                key={`${chord.name}-${chord.startTimeSeconds}-${index}`}
                aria-label={`${formatTime(chord.startTimeSeconds)}，${chordName} 和弦，直接试听`}
              >
                <span className="chord-event__time">{formatTime(chord.startTimeSeconds)}</span>
                <strong>{chordName}</strong>
                {beginnerChord?.simplified && <span className="chord-event__source">原谱 {chord.name}</span>}
                {voicing && (
                  <span className="chord-voicing" aria-label={`${TUNINGS[tuning].shortLabel} 品位 ${voicing.join(" ")}`}>
                    <span className="chord-voicing__strings">
                      {TUNINGS[tuning].stringNames.map((stringName) => <i key={stringName}>{stringName}</i>)}
                    </span>
                    <span className="chord-voicing__frets">
                      {voicing.map((fret, fretIndex) => <i key={`${fret}-${fretIndex}`}>{fret}</i>)}
                    </span>
                  </span>
                )}
                <span className="chord-event__confidence">{Math.round(chord.confidence * 100)}%</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="chord-empty">
          <strong>没有检测到稳定和弦</strong>
          <span>单音音阶或独奏不会被强行标成和弦；可载入左侧 C · Am · F · G 样例验证。</span>
        </div>
      )}
      <footer className="score-sheet__footer"><span>CLICK A CHORD TO HEAR THE GENERATED VOICING</span><span>{displayMode === "beginner" ? "BEGINNER APPROXIMATION" : "MAJOR · MINOR · 7 · MAJ7 · M7 · SUS · DIM"}</span></footer>
    </section>
  );
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const synthPlayerRef = useRef<LocalUkulelePlayer | null>(null);
  const [phase, setPhase] = useState<Phase>("empty");
  const [fileName, setFileName] = useState("尚未载入素材");
  const [audioUrl, setAudioUrl] = useState("");
  const [prepared, setPrepared] = useState<PreparedAudio | null>(null);
  const [detectedNotes, setDetectedNotes] = useState<TranscribedNote[]>([]);
  const [tabNotes, setTabNotes] = useState<TabNote[]>([]);
  const [chords, setChords] = useState<ChordEvent[]>([]);
  const [tuning, setTuning] = useState<TuningId>("high-g");
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [synthMode, setSynthMode] = useState<SynthMode>(null);
  const [synthTime, setSynthTime] = useState(0);
  const [chordDisplayMode, setChordDisplayMode] = useState<ChordDisplayMode>("original");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      synthPlayerRef.current?.stop();
    },
    [],
  );

  const phrases = useMemo(() => splitIntoPhrases(tabNotes, 8), [tabNotes]);
  const beginnerPlan = useMemo(
    () => createBeginnerChordPlan(chords, tuning),
    [chords, tuning],
  );
  const scoreTime = synthMode ? synthTime : currentTime;
  const activeNoteIndex = useMemo(() => {
    if (tabNotes.length === 0) return -1;
    const exact = tabNotes.findIndex(
      (note) =>
        scoreTime >= note.startTimeSeconds &&
        scoreTime <= note.startTimeSeconds + Math.max(note.durationSeconds, 0.12),
    );
    if (exact >= 0) return exact;
    for (let index = tabNotes.length - 1; index >= 0; index -= 1) {
      if (tabNotes[index].startTimeSeconds <= scoreTime) return index;
    }
    return -1;
  }, [scoreTime, tabNotes]);

  function stopSynthPreview() {
    synthPlayerRef.current?.stop();
    setSynthMode(null);
    setSynthTime(0);
  }

  function playSynthSequence(mode: Exclude<SynthMode, null>, sequence: PlaybackSequence, sourceOffset = 0) {
    if (sequence.events.length === 0) return;
    audioRef.current?.pause();
    if (!synthPlayerRef.current) synthPlayerRef.current = new LocalUkulelePlayer();
    setSynthMode(mode);
    setSynthTime(sourceOffset);
    void synthPlayerRef.current.play(sequence, {
      onProgress: (elapsedSeconds) => setSynthTime(sourceOffset + elapsedSeconds),
      onEnded: () => {
        setSynthMode(null);
        setSynthTime(0);
      },
    });
  }

  async function loadFile(file: File) {
    stopSynthPreview();
    setPhase("decoding");
    setErrorMessage("");
    setFileName(file.name);
    setDetectedNotes([]);
    setTabNotes([]);
    setChords([]);
    setProgress(0);
    setCurrentTime(0);

    try {
      const nextPrepared = await prepareAudio(file);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const nextUrl = URL.createObjectURL(file);
      objectUrlRef.current = nextUrl;
      setAudioUrl(nextUrl);
      setPrepared(nextPrepared);
      setPhase("ready");
    } catch (error) {
      setPhase("error");
      setErrorMessage(error instanceof Error ? error.message : "无法解码这个音频文件");
    }
  }

  async function loadSample() {
    setPhase("decoding");
    try {
      const response = await fetch(new URL("samples/c-major.mp3", document.baseURI));
      if (!response.ok) throw new Error("内置样例读取失败");
      const blob = await response.blob();
      await loadFile(new File([blob], "spotify-basic-pitch-c-major.mp3", { type: "audio/mpeg" }));
    } catch (error) {
      setPhase("error");
      setErrorMessage(error instanceof Error ? error.message : "内置样例读取失败");
    }
  }

  async function loadChordSample() {
    setPhase("decoding");
    setErrorMessage("");
    try {
      await loadFile(await createChordDemoFile());
    } catch (error) {
      setPhase("error");
      setErrorMessage(error instanceof Error ? error.message : "本地和弦样例生成失败");
    }
  }

  async function analyze() {
    if (!prepared || phase === "analyzing") return;
    setPhase("analyzing");
    setProgress(0);
    setErrorMessage("");

    try {
      const notes = await transcribeLocally(prepared.buffer, setProgress);
      setDetectedNotes(notes);
      setTabNotes(mapNotesToUkulele(notes, tuning));
      setChords(detectChords(notes, prepared.duration));
      setPhase("done");
    } catch (error) {
      setPhase("error");
      setErrorMessage(error instanceof Error ? error.message : "本地模型分析失败");
    }
  }

  function changeTuning(nextTuning: TuningId) {
    stopSynthPreview();
    setTuning(nextTuning);
    if (detectedNotes.length > 0) setTabNotes(mapNotesToUkulele(detectedNotes, nextTuning));
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (audio.paused) {
      stopSynthPreview();
      await audio.play();
    }
    else audio.pause();
  }

  function seekTo(ratio: number) {
    const audio = audioRef.current;
    if (!audio || !prepared) return;
    stopSynthPreview();
    audio.currentTime = Math.max(0, Math.min(1, ratio)) * prepared.duration;
    setCurrentTime(audio.currentTime);
  }

  function selectTabNote(note: TabNote) {
    playSynthSequence("melody", buildMelodyPlaybackSequence([note]), note.startTimeSeconds);
  }

  function selectChord(chord: ChordEvent, index: number) {
    const singleBeginnerPlan = chordDisplayMode === "beginner" ? {
      ...beginnerPlan,
      chords: beginnerPlan.chords[index] ? [beginnerPlan.chords[index]] : [],
    } : undefined;
    playSynthSequence(
      "chords",
      buildChordPlaybackSequence([chord], tuning, singleBeginnerPlan),
      chord.startTimeSeconds,
    );
  }

  function toggleMelodyPreview() {
    if (synthMode === "melody") {
      stopSynthPreview();
      return;
    }
    playSynthSequence(
      "melody",
      buildMelodyPlaybackSequence(tabNotes),
      tabNotes[0]?.startTimeSeconds ?? 0,
    );
  }

  function toggleChordPreview() {
    if (synthMode === "chords") {
      stopSynthPreview();
      return;
    }
    playSynthSequence(
      "chords",
      buildChordPlaybackSequence(
        chords,
        tuning,
        chordDisplayMode === "beginner" ? beginnerPlan : undefined,
      ),
      chords[0]?.startTimeSeconds ?? 0,
    );
  }

  function changeChordDisplayMode(mode: ChordDisplayMode) {
    stopSynthPreview();
    setChordDisplayMode(mode);
  }

  function reset() {
    stopSynthPreview();
    audioRef.current?.pause();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setAudioUrl("");
    setPrepared(null);
    setDetectedNotes([]);
    setTabNotes([]);
    setChords([]);
    setFileName("尚未载入素材");
    setCurrentTime(0);
    setIsPlaying(false);
    setPhase("empty");
    setErrorMessage("");
  }

  const waveformProgress = prepared ? currentTime / prepared.duration : 0;
  const statusLabel =
    phase === "analyzing" ? `模型推理 ${Math.round(progress * 100)}%`
      : phase === "done" ? "和弦 + TAB 草稿已生成"
        : phase === "decoding" ? "正在解码音频"
          : phase === "error" ? "处理失败"
            : phase === "ready" ? "等待本地分析" : "等待素材";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">JM</span>
          <div>
            <strong>jmusic</strong>
            <span>LOCAL TRANSCRIPTION LAB / POC 01</span>
          </div>
        </div>
        <div className="local-badge">
          <ShieldCheck size={15} strokeWidth={2.2} />
          <span>LOCAL ONLY</span><i /><span>0 KB UPLOADED</span>
        </div>
      </header>

      <div className="workspace">
        <aside className="material-rail">
          <div className="rail-heading"><span>素材台</span><small>01 / INPUT</small></div>

          <button type="button" className="drop-target" onClick={() => fileInputRef.current?.click()}>
            <Upload size={22} />
            <strong>载入一首音乐</strong>
            <span>MP3 · WAV · M4A · FLAC</span>
          </button>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept="audio/*,.flac,.m4a"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file);
              event.currentTarget.value = "";
            }}
          />

          <div className="or-rule"><span>或</span></div>

          <button type="button" className="sample-card" onClick={loadSample}>
            <span className="sample-card__icon"><Disc3 size={25} /></span>
            <span><strong>C Major Scale</strong><small>Spotify Basic Pitch 测试素材</small></span>
            <ChevronRight size={17} />
          </button>

          <button type="button" className="sample-card sample-card--chords" onClick={loadChordSample}>
            <span className="sample-card__icon"><Music2 size={23} /></span>
            <span><strong>C · Am · F · G</strong><small>本机合成和弦测试素材</small></span>
            <ChevronRight size={17} />
          </button>

          <div className="rail-note">
            <FlaskConical size={16} />
            <p>自动和弦、初学者简化和旋律 TAB 都能在本机直接试听。复杂指弹编配仍需人工校正。</p>
          </div>

          <div className="pipeline-list">
            <div className={phase !== "empty" ? "is-reached" : ""}><span>01</span><p>本地解码</p></div>
            <div className={["analyzing", "done"].includes(phase) ? "is-reached" : ""}><span>02</span><p>音高识别</p></div>
            <div className={phase === "done" ? "is-reached" : ""}><span>03</span><p>和弦聚合</p></div>
            <div className={phase === "done" ? "is-reached" : ""}><span>04</span><p>指板寻位</p></div>
          </div>
        </aside>

        <main className="workbench">
          <section className="source-strip">
            <div className="source-title">
              <span className="eyebrow">CURRENT MATERIAL</span>
              <h1>{fileName}</h1>
              <p>{prepared ? `${formatTime(prepared.duration)} · 22.05 kHz 分析副本` : "载入本地音频开始"}</p>
            </div>
            <div className={`phase-chip phase-chip--${phase}`}><span />{statusLabel}</div>
          </section>

          <section className="transport-panel">
            <button type="button" className="play-button" onClick={togglePlayback} disabled={!audioUrl} aria-label={isPlaying ? "暂停" : "播放"}>
              {isPlaying ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}
            </button>
            <div className="transport-time"><strong>{formatTime(currentTime)}</strong><span>/ {formatTime(prepared?.duration ?? 0)}</span></div>
            <div
              className={`waveform ${prepared ? "is-ready" : ""}`}
              role="slider"
              tabIndex={prepared ? 0 : -1}
              aria-label="音频进度"
              aria-valuemin={0}
              aria-valuemax={Math.round(prepared?.duration ?? 0)}
              aria-valuenow={Math.round(currentTime)}
              onClick={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                seekTo((event.clientX - bounds.left) / bounds.width);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" && prepared) seekTo((currentTime + 2) / prepared.duration);
                if (event.key === "ArrowLeft" && prepared) seekTo((currentTime - 2) / prepared.duration);
              }}
            >
              {(prepared?.peaks ?? Array.from({ length: 144 }, () => 0.08)).map((peak, index, peaks) => (
                <i key={index} className={index / peaks.length <= waveformProgress ? "is-passed" : ""} style={{ "--peak": peak } as CSSProperties} />
              ))}
            </div>
            <button
              type="button"
              className={`icon-button mute-button ${isMuted ? "is-active" : ""}`}
              onClick={() => setIsMuted((muted) => !muted)}
              disabled={!audioUrl}
              title={isMuted ? "恢复原曲声音" : "原曲静音"}
              aria-label={isMuted ? "取消原曲静音" : "原曲静音"}
              aria-pressed={isMuted}
            >
              {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            <button type="button" className="icon-button" onClick={reset} disabled={phase === "empty"} title="清空素材"><RotateCcw size={17} /></button>
          </section>

          {phase === "empty" || phase === "decoding" ? (
            <section className="empty-workbench">
              <span className="staff-ghost">A —————<br />E —————<br />C —————<br />g —————</span>
              <div>
                <AudioLines size={34} strokeWidth={1.5} />
                <h2>{phase === "decoding" ? "正在准备本地音频…" : "从一段真实声音开始"}</h2>
                <p>模型、音频和输出都留在这台 Mac 上。</p>
              </div>
            </section>
          ) : (
            <>
              <section className="analysis-toolbar">
                <div className="tuning-control">
                  <span>调弦</span>
                  {(Object.keys(TUNINGS) as TuningId[]).map((tuningId) => (
                    <button type="button" className={tuning === tuningId ? "is-selected" : ""} onClick={() => changeTuning(tuningId)} key={tuningId}>
                      {TUNINGS[tuningId].shortLabel}
                    </button>
                  ))}
                </div>
                <div className="analysis-stats">
                  <span><Gauge size={15} />{detectedNotes.length || "—"} 原始音符</span>
                  <span><Music2 size={15} />{chords.length || "—"} 和弦段</span>
                  <span><ListMusic size={15} />{tabNotes.length || "—"} TAB 音符</span>
                  <span><Cpu size={15} />TensorFlow.js</span>
                </div>
                <button type="button" className="analyze-button" onClick={analyze} disabled={phase === "analyzing"}>
                  {phase === "analyzing" ? <><span className="spinner" />分析 {Math.round(progress * 100)}%</> : <><Music2 size={17} />{phase === "done" ? "重新分析" : "生成和弦 + TAB"}</>}
                </button>
              </section>

              {phase === "error" && <section className="error-panel"><strong>本地处理没有完成</strong><p>{errorMessage}</p></section>}

              {phase === "ready" || phase === "analyzing" ? (
                <section className="ready-panel">
                  <div className="record-disc"><span /></div>
                  <div>
                    <span className="eyebrow">READY FOR INFERENCE</span>
                    <h2>{phase === "analyzing" ? "模型正在逐帧听这段音乐" : "音频已经准备好了"}</h2>
                    <p>{phase === "analyzing" ? "第一次运行会先从 App 内载入约 900 KB 模型，然后在本机计算。" : "点击“生成和弦 + TAB”，一次得到和弦时间轴与可弹的旋律品位。"}</p>
                  </div>
                </section>
              ) : null}

              {phase === "done" && (
                <ChordTrack
                  chords={chords}
                  currentTime={scoreTime}
                  tuning={tuning}
                  displayMode={chordDisplayMode}
                  beginnerPlan={beginnerPlan}
                  isPreviewing={synthMode === "chords"}
                  onDisplayModeChange={changeChordDisplayMode}
                  onTogglePreview={toggleChordPreview}
                  onSelect={selectChord}
                />
              )}

              {phase === "done" && tabNotes.length > 0 && (
                <section className="score-sheet">
                  <header className="score-sheet__header">
                    <div><span className="eyebrow">MELODY DRAFT / AUTO</span><h2>尤克里里旋律 TAB</h2></div>
                    <div className="score-controls">
                      <div className="score-legend"><span>{TUNINGS[tuning].label}</span><i /><span>点击数字直接试听</span></div>
                      <button type="button" className={`score-play-button score-play-button--light ${synthMode === "melody" ? "is-playing" : ""}`} onClick={toggleMelodyPreview}>
                        {synthMode === "melody" ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                        {synthMode === "melody" ? "停止指弹" : "播放指弹"}
                      </button>
                    </div>
                  </header>
                  <div className="tab-systems">
                    {phrases.map((phrase, phraseIndex) => (
                      <TabSystem
                        key={`${phrase[0]?.startTimeSeconds}-${phraseIndex}`}
                        notes={phrase}
                        phraseIndex={phraseIndex}
                        baseIndex={phraseIndex * 8}
                        activeIndex={activeNoteIndex}
                        tuning={tuning}
                        onSelect={selectTabNote}
                      />
                    ))}
                  </div>
                  <footer className="score-sheet__footer"><span>CLICK A FRET TO HEAR THE GENERATED NOTE</span><span>LOCAL SYNTH · OCTAVE-FOLDED WHEN OUT OF RANGE</span></footer>
                </section>
              )}

              {phase === "done" && tabNotes.length === 0 && <section className="error-panel"><strong>没有得到可用的旋律线</strong><p>换一段更清晰的独奏、哼唱或单一乐器录音再试。</p></section>}
            </>
          )}
        </main>
      </div>

      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        muted={isMuted}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
    </div>
  );
}

export default App;
