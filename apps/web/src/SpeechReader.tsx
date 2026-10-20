import { useEffect, useMemo, useRef, useState } from "react";
import { qwenSpeechStatus, synthesizeQwenSpeech, type QwenSpeechStatus } from "./api.js";
import { useI18n } from "./i18n.js";
import {
  readerChapters, readerProgressKey, readerTextSignature, savedReaderPosition,
  type ReaderPosition
} from "./reader-progress.js";
import { BrowserSpeechOutput, QwenSpeechOutput, ReaderPlayback, type ReaderPlaybackState } from "./speech-playback.js";
import { READER_PAGE_SIZE, speechParagraphs } from "./speech-segments.js";
import { mayUseRemoteSpeech, selectInitialVoice, voiceOrigin } from "./speech-voices.js";

function getSetting(key: string, fallback: string): string {
  try { return window.localStorage.getItem(key) ?? fallback; }
  catch { return fallback; }
}
function putSetting(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); }
  catch { /* local storage is optional */ }
}

const RATES = [0.75, 1, 1.25, 1.5, 2];
const PITCHES = [0.5, 0.75, 1, 1.25, 1.5];
const VOLUMES = [0.5, 0.75, 1];

function preferredNumber(key: string, values: readonly number[], fallback: number): number {
  const value = Number(getSetting(key, String(fallback)));
  return values.includes(value) ? value : fallback;
}

export function SpeechReader({ text, sourceId, onClose }: {
  text: string;
  sourceId: string;
  onClose(): void;
}) {
  const { t } = useI18n();
  const parsed = useMemo(() => speechParagraphs(text), [text]);
  const paragraphs = parsed.paragraphs;
  const chapters = useMemo(() => readerChapters(paragraphs), [paragraphs]);
  const signature = useMemo(() => readerTextSignature(text), [text]);
  const progressKey = useMemo(() => readerProgressKey(sourceId), [sourceId]);
  const [position, setPosition] = useState<ReaderPosition>(() => {
    try {
      return savedReaderPosition(window.localStorage.getItem(progressKey), signature, paragraphs) ??
        { paragraph: 0, offset: 0 };
    } catch { return { paragraph: 0, offset: 0 }; }
  });
  const [pageStart, setPageStart] = useState(() =>
    Math.floor(position.paragraph / READER_PAGE_SIZE) * READER_PAGE_SIZE
  );
  const [state, setState] = useState<ReaderPlaybackState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUri] = useState(() => getSetting("palmtty.speech.voice", ""));
  const [approvedRemote, setApprovedRemote] = useState<string | null>(null);
  const [engine, setEngine] = useState<"browser" | "qwen">("browser");
  const [qwen, setQwen] = useState<QwenSpeechStatus | null>(null);
  const [speaker, setSpeaker] = useState("Vivian");
  const [style, setStyle] = useState<"neutral" | "story">("neutral");
  const [rate, setRate] = useState(() => preferredNumber("palmtty.speech.rate", RATES, 1));
  const [pitch, setPitch] = useState(() => preferredNumber("palmtty.speech.pitch", PITCHES, 1));
  const [volume, setVolume] = useState(() => preferredNumber("palmtty.speech.volume", VOLUMES, 1));
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const previewRef = useRef<{ controller: AbortController; output: BrowserSpeechOutput } | null>(null);
  const available = typeof window !== "undefined" &&
    "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  const playbackRef = useRef<ReaderPlayback | null>(null);
  if (!playbackRef.current) {
    playbackRef.current = new ReaderPlayback(setState, (paragraph, offset) =>
      setPosition({ paragraph, offset })
    );
  }
  const playback = playbackRef.current;

  useEffect(() => {
    let cancelled = false;
    void qwenSpeechStatus().then((value) => { if (!cancelled) setQwen(value); })
      .catch(() => { if (!cancelled) setQwen({
        enabled: false, ready: false, model: null, speakers: [], styles: []
      }); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!available) return;
    const synth = window.speechSynthesis;
    const updateVoices = () => {
      const next = synth.getVoices();
      setVoices(next);
      setVoiceUri((previous) => selectInitialVoice(next, previous));
    };
    updateVoices();
    synth.addEventListener("voiceschanged", updateVoices);
    document.addEventListener("visibilitychange", updateVoices);
    return () => {
      synth.removeEventListener("voiceschanged", updateVoices);
      document.removeEventListener("visibilitychange", updateVoices);
    };
  }, [available]);

  useEffect(() => () => {
    previewRef.current?.controller.abort();
    previewRef.current?.output.stop();
    playback.stop();
  }, [playback]);

  useEffect(() => {
    try {
      window.localStorage.setItem(progressKey, JSON.stringify({ signature, ...position }));
    } catch { /* progress is optional */ }
  }, [position, progressKey, signature]);

  useEffect(() => {
    if (position.paragraph < pageStart || position.paragraph >= pageStart + READER_PAGE_SIZE) {
      setPageStart(Math.floor(position.paragraph / READER_PAGE_SIZE) * READER_PAGE_SIZE);
      return;
    }
    refs.current[position.paragraph]?.scrollIntoView({ block: "nearest" });
  }, [pageStart, position.paragraph]);

  const selectedVoice = voices.find((voice) => voice.voiceURI === voiceUri);
  const needsConsent = engine === "browser" && !!selectedVoice &&
    mayUseRemoteSpeech(selectedVoice) && approvedRemote !== selectedVoice.voiceURI;
  const canPlay = !parsed.tooMany && paragraphs.length > 0 &&
    (engine === "browser"
      ? available && !!selectedVoice && !needsConsent
      : !!qwen?.ready && qwen.speakers.includes(speaker) && qwen.styles.includes(style));

  const stop = () => {
    previewRef.current?.controller.abort();
    previewRef.current?.output.stop();
    previewRef.current = null;
    playback.stop();
  };

  const previewVoice = () => {
    if (!selectedVoice || needsConsent) return;
    stop();
    setError(null);
    const controller = new AbortController();
    const output = new BrowserSpeechOutput(
      window.speechSynthesis, selectedVoice, rate, pitch, volume
    );
    const preview = { controller, output };
    previewRef.current = preview;
    void output.speak(t("reader.sampleText"), controller.signal, () => undefined)
      .catch(() => { if (!controller.signal.aborted) setError(t("reader.speechError")); })
      .finally(() => {
        if (previewRef.current === preview) {
          previewRef.current = null;
          output.stop();
        }
      });
  };

  const playFrom = (paragraph: number, offset = 0) => {
    const target = Math.max(0, Math.min(paragraph, paragraphs.length - 1));
    if (!canPlay) {
      setPosition({ paragraph: target, offset: 0 });
      return;
    }
    stop();
    setError(null);
    const output = engine === "browser" && selectedVoice
      ? new BrowserSpeechOutput(window.speechSynthesis, selectedVoice, rate, pitch, volume)
      : new QwenSpeechOutput(
          (chunk, signal) => synthesizeQwenSpeech(chunk, speaker, style, signal), rate
        );
    void playback.start(paragraphs, target, output, engine === "browser" ? 180 : 260, offset)
      .catch(() => setError(t("reader.speechError")));
  };

  const togglePlayback = () => {
    if (state === "paused") { playback.resume(); return; }
    if (state === "playing") { playback.pause(); return; }
    if (state === "preparing") return;
    playFrom(position.paragraph, position.offset);
  };

  const changeEngine = (next: "browser" | "qwen") => {
    stop();
    setEngine(next);
    setError(null);
  };
  const changeVoice = (next: string) => {
    stop();
    setVoiceUri(next);
    setApprovedRemote(null);
    putSetting("palmtty.speech.voice", next);
  };

  const shown = paragraphs.slice(pageStart, pageStart + READER_PAGE_SIZE);
  const selectedChapter = chapters.reduce(
    (previous, chapter) => chapter.paragraph <= position.paragraph ? chapter.paragraph : previous, 0
  );
  const inProgress = state === "playing" || state === "paused" || state === "preparing";

  return (
    <div className="speech-reader">
      <div className="speech-reader-controls">
        <div className="speech-reader-actions">
          <button type="button" className="ghost compact" onClick={() => { stop(); onClose(); }}>
            {t("reader.back")}
          </button>
          <button type="button" disabled={!canPlay || state === "preparing"}
            onClick={togglePlayback}>
            {state === "playing" ? t("reader.pause") : state === "paused" ? t("reader.resume") :
              t("reader.play")}
          </button>
          <button type="button" className="ghost compact" disabled={!inProgress} onClick={stop}>
            {t("reader.stop")}
          </button>
          <button type="button" className="ghost compact" disabled={!canPlay}
            onClick={() => playFrom(position.paragraph - 1)}>
            {t("reader.previous")}
          </button>
          <button type="button" className="ghost compact" disabled={!canPlay}
            onClick={() => playFrom(position.paragraph + 1)}>
            {t("reader.next")}
          </button>
        </div>
        <div className="speech-reader-options">
          <label>{t("reader.engine")}
            <select className="glass-input glass-select" value={engine}
              onChange={(event) => changeEngine(event.target.value as "browser" | "qwen")}>
              <option value="browser">{t("reader.browserEngine")}</option>
              {qwen?.enabled && <option value="qwen">Qwen3-TTS</option>}
            </select>
          </label>
          {chapters.length > 1 && (
            <label>{t("reader.chapter")}
              <select className="glass-input glass-select" value={selectedChapter}
                onChange={(event) => playFrom(Number(event.target.value))}>
                {chapters.map((chapter) => (
                  <option key={chapter.paragraph} value={chapter.paragraph}>
                    {chapter.title || t("reader.beginning")}
                  </option>
                ))}
              </select>
            </label>
          )}
          {engine === "browser" ? (
            <label>{t("reader.voice")}
              <select className="glass-input glass-select" value={voiceUri}
                onChange={(event) => changeVoice(event.target.value)} disabled={!available}>
                <option value="">{t("reader.chooseVoice")}</option>
                {voices.map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang}) · {t(
                      voiceOrigin(voice) === "local" ? "reader.voiceLocal" :
                      voiceOrigin(voice) === "remote" ? "reader.voiceRemote" : "reader.voiceUnknown"
                    )}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label>{t("reader.voice")}
                <select className="glass-input glass-select" value={speaker} onChange={(event) => {
                  stop(); setSpeaker(event.target.value);
                }}>
                  {(qwen?.speakers ?? []).map((name) => <option key={name}>{name}</option>)}
                </select>
              </label>
              <label>{t("reader.style")}
                <select className="glass-input glass-select" value={style}
                  onChange={(event) => { stop(); setStyle(event.target.value as "neutral" | "story"); }}>
                  {(qwen?.styles ?? ["neutral"]).map((value) => (
                    <option key={value} value={value}>
                      {t(value === "story" ? "reader.story" : "reader.neutral")}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label>{t("reader.rate")}
            <select className="glass-input glass-select" value={rate} onChange={(event) => {
              stop();
              const next = Number(event.target.value);
              setRate(next);
              putSetting("palmtty.speech.rate", String(next));
            }}>
              {RATES.map((value) => <option key={value} value={value}>{value}×</option>)}
            </select>
          </label>
        </div>
        {engine === "browser" && (
          <details className="speech-reader-advanced">
            <summary>{t("reader.moreSettings")}</summary>
            <div className="speech-reader-options">
              <label>{t("reader.pitch")}
                <select className="glass-input glass-select" value={pitch} onChange={(event) => {
                  stop();
                  const next = Number(event.target.value);
                  setPitch(next);
                  putSetting("palmtty.speech.pitch", String(next));
                }}>
                  {PITCHES.map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
              <label>{t("reader.volume")}
                <select className="glass-input glass-select" value={volume} onChange={(event) => {
                  stop();
                  const next = Number(event.target.value);
                  setVolume(next);
                  putSetting("palmtty.speech.volume", String(next));
                }}>
                  {VOLUMES.map((value) => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}
                </select>
              </label>
            </div>
          </details>
        )}
        {engine === "browser" && !!selectedVoice && !needsConsent && (
          <div className="speech-reader-actions">
            <button type="button" className="ghost compact" onClick={previewVoice}>
              {t("reader.previewVoice")}
            </button>
            {approvedRemote === selectedVoice.voiceURI && mayUseRemoteSpeech(selectedVoice) && (
              <button type="button" className="ghost compact" onClick={() => {
                stop(); setApprovedRemote(null);
              }}>{t("reader.revokeRemote")}</button>
            )}
          </div>
        )}
        {needsConsent && (
          <div className="speech-reader-consent">
            <p className="tool-hint">{t("reader.remoteConsent")}</p>
            <button type="button" className="ghost compact"
              onClick={() => setApprovedRemote(selectedVoice?.voiceURI ?? null)}>
              {t("reader.allowRemote")}
            </button>
          </div>
        )}
        {engine === "browser" && !available &&
          <p role="status" className="tool-hint">{t("reader.unsupported")}</p>}
        {engine === "browser" && available && voices.length === 0 &&
          <p role="status" className="tool-hint">{t("reader.noVoices")}</p>}
        {engine === "qwen" && !qwen?.ready &&
          <p role="status" className="tool-hint">{t("reader.qwenUnavailable")}</p>}
        {state === "preparing" && <p role="status" className="tool-hint">{t("reader.preparing")}</p>}
        {parsed.tooMany && <p role="alert" className="tool-inline-error">{t("reader.tooMany")}</p>}
        {error && <p role="alert" className="tool-inline-error">{error}</p>}
        <p className="tool-hint">{t("reader.hint")}</p>
        <p className="tool-hint">{t("reader.savedPosition", { paragraph: position.paragraph + 1 })}</p>
      </div>
      <div className="speech-reader-text">
        {!parsed.tooMany && paragraphs.length > READER_PAGE_SIZE && (
          <div className="speech-reader-pagination">
            <button type="button" className="ghost compact" disabled={pageStart === 0}
              onClick={() => setPageStart(Math.max(0, pageStart - READER_PAGE_SIZE))}>
              {t("reader.pagePrevious")}
            </button>
            <span>{t("reader.pagination", {
              start: pageStart + 1,
              end: Math.min(paragraphs.length, pageStart + READER_PAGE_SIZE),
              total: paragraphs.length
            })}</span>
            <button type="button" className="ghost compact"
              disabled={pageStart + READER_PAGE_SIZE >= paragraphs.length}
              onClick={() => setPageStart(pageStart + READER_PAGE_SIZE)}>
              {t("reader.pageNext")}
            </button>
          </div>
        )}
        {shown.map((paragraph, index) => {
          const number = pageStart + index;
          return (
            <button key={number} type="button"
              ref={(node) => { refs.current[number] = node; }}
              className={`speech-reader-paragraph${number === position.paragraph ? " is-reading" : ""}`}
              aria-current={number === position.paragraph ? "true" : undefined}
              onClick={() => playFrom(number)}>
              {paragraph}
            </button>
          );
        })}
      </div>
    </div>
  );
}
