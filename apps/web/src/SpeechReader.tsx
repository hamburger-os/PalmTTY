import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n.js";
import { readerChapters, readerProgressKey, readerTextSignature, savedReaderParagraph } from "./reader-progress.js";
import {
  READER_PAGE_SIZE,
  localSpeechVoices,
  nextSpeechChunk,
  speechParagraphs
} from "./speech-segments.js";

function storedRate(): number {
  try {
    const value = Number(window.localStorage.getItem("palmtty.speech.rate"));
    if ([0.75, 1, 1.25, 1.5, 2].includes(value)) return value;
  } catch { /* local storage is optional */ }
  return 1;
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
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUri] = useState("");
  const [rate, setRate] = useState(storedRate);
  const [pageStart, setPageStart] = useState(0);
  const [activeParagraph, setActiveParagraph] = useState<number | null>(() => {
    try {
      return savedReaderParagraph(
        window.localStorage.getItem(progressKey), signature, paragraphs.length
      );
    } catch { return null; }
  });
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequenceRef = useRef(0);
  const cursorParagraphRef = useRef(0);
  const cursorOffsetRef = useRef(0);
  const paragraphRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const available = typeof window !== "undefined" &&
    "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  useEffect(() => {
    if (!available) return;
    const synth = window.speechSynthesis;
    const updateVoices = () => {
      // The Web Speech API can expose remote voices, even as the OS default.
      // Only explicitly selected localService voices receive workspace text.
      const local = localSpeechVoices(synth.getVoices());
      setVoices(local);
      setVoiceUri((previous) => {
        if (local.some((voice) => voice.voiceURI === previous)) return previous;
        return (local.find((voice) => /^zh(?:-|_)/i.test(voice.lang)) ?? local[0])?.voiceURI ?? "";
      });
    };
    updateVoices();
    synth.addEventListener("voiceschanged", updateVoices);
    return () => {
      sequenceRef.current += 1;
      synth.removeEventListener("voiceschanged", updateVoices);
      synth.cancel();
    };
  }, [available]);

  useEffect(() => {
    if (activeParagraph === null) return;
    try {
      window.localStorage.setItem(progressKey, JSON.stringify({
        signature, paragraph: activeParagraph
      }));
    } catch { /* progress is optional if private browsing blocks storage */ }
  }, [activeParagraph, progressKey, signature]);

  useEffect(() => {
    if (activeParagraph === null) return;
    if (activeParagraph < pageStart || activeParagraph >= pageStart + READER_PAGE_SIZE) {
      setPageStart(Math.floor(activeParagraph / READER_PAGE_SIZE) * READER_PAGE_SIZE);
      return;
    }
    paragraphRefs.current[activeParagraph]?.scrollIntoView({ block: "nearest" });
  }, [activeParagraph, pageStart]);

  const stop = () => {
    sequenceRef.current += 1;
    if (available) window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
  };

  const selectedVoice = voices.find((voice) => voice.voiceURI === voiceUri);
  const canPlay = available && !!selectedVoice && !parsed.tooMany && paragraphs.length > 0;

  const playNext = (sequence: number) => {
    if (!canPlay || sequence !== sequenceRef.current || !selectedVoice) return;
    while (cursorParagraphRef.current < paragraphs.length) {
      const paragraphIndex = cursorParagraphRef.current;
      const paragraph = paragraphs[paragraphIndex] ?? "";
      const chunk = nextSpeechChunk(paragraph, cursorOffsetRef.current);
      if (!chunk) {
        cursorParagraphRef.current += 1;
        cursorOffsetRef.current = 0;
        continue;
      }
      if (!chunk.text) {
        cursorOffsetRef.current = chunk.nextOffset;
        continue;
      }
      setActiveParagraph(paragraphIndex);
      const utterance = new SpeechSynthesisUtterance(chunk.text);
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
      utterance.rate = rate;
      utterance.onend = () => {
        if (sequence !== sequenceRef.current) return;
        cursorOffsetRef.current = chunk.nextOffset;
        if (cursorOffsetRef.current >= paragraph.length) {
          cursorParagraphRef.current += 1;
          cursorOffsetRef.current = 0;
        }
        playNext(sequence);
      };
      utterance.onerror = (event) => {
        if (sequence !== sequenceRef.current) return;
        stop();
        if (event.error !== "canceled" && event.error !== "interrupted") {
          setError(t("reader.speechError"));
        }
      };
      window.speechSynthesis.speak(utterance);
      return;
    }
    setSpeaking(false);
    setPaused(false);
  };

  const startAtParagraph = (paragraph: number) => {
    if (!canPlay) {
      setActiveParagraph(paragraph);
      return;
    }
    stop();
    setError(null);
    cursorParagraphRef.current = paragraph;
    cursorOffsetRef.current = 0;
    const sequence = sequenceRef.current;
    setSpeaking(true);
    playNext(sequence);
  };

  const togglePlayback = () => {
    if (!canPlay) return;
    if (!speaking) {
      startAtParagraph(activeParagraph ?? 0);
    } else if (paused) {
      window.speechSynthesis.resume();
      setPaused(false);
    } else {
      window.speechSynthesis.pause();
      setPaused(true);
    }
  };

  const chineseVoices = voices.filter((voice) => /^zh(?:-|_)/i.test(voice.lang));
  const displayVoices = chineseVoices.length > 0 ? chineseVoices : voices;
  const shown = paragraphs.slice(pageStart, pageStart + READER_PAGE_SIZE);
  const selectedChapter = chapters.reduce(
    (last, chapter) => activeParagraph !== null && chapter.paragraph <= activeParagraph
      ? chapter.paragraph : last,
    0
  );

  return (
    <div className="speech-reader">
      <div className="speech-reader-controls">
        <div className="speech-reader-actions">
          <button type="button" className="ghost compact" onClick={onClose}>
            {t("reader.back")}
          </button>
          <button type="button" disabled={!canPlay} onClick={togglePlayback}>
            {speaking ? (paused ? t("reader.resume") : t("reader.pause")) : t("reader.play")}
          </button>
          <button type="button" className="ghost compact" disabled={!speaking}
            onClick={stop}>{t("reader.stop")}</button>
          <button type="button" className="ghost compact" disabled={!canPlay}
            onClick={() => startAtParagraph(Math.max(0, (activeParagraph ?? 0) - 1))}>
            {t("reader.previous")}
          </button>
          <button type="button" className="ghost compact" disabled={!canPlay}
            onClick={() => startAtParagraph(Math.min(paragraphs.length - 1, (activeParagraph ?? -1) + 1))}>
            {t("reader.next")}
          </button>
        </div>
        <div className="speech-reader-options">
          {chapters.length > 1 && (
            <label>{t("reader.chapter")}
              <select className="glass-input glass-select" value={selectedChapter}
                onChange={(event) => startAtParagraph(Number(event.target.value))}>
                {chapters.map((chapter) => (
                  <option key={chapter.paragraph} value={chapter.paragraph}>
                    {chapter.title || t("reader.beginning")}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>{t("reader.voice")}
            <select className="glass-input glass-select" value={voiceUri} onChange={(event) => {
              stop();
              setVoiceUri(event.target.value);
            }} disabled={!available || displayVoices.length === 0}>
              {displayVoices.length === 0 && <option value="">{t("reader.noLocalVoice")}</option>}
              {displayVoices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </label>
          <label>{t("reader.rate")}
            <select className="glass-input glass-select" value={rate}
              disabled={!available} onChange={(event) => {
                stop();
                const next = Number(event.target.value);
                setRate(next);
                try { window.localStorage.setItem("palmtty.speech.rate", String(next)); }
                catch { /* optional preference */ }
              }}>
              {[0.75, 1, 1.25, 1.5, 2].map((value) => (
                <option key={value} value={value}>{value}×</option>
              ))}
            </select>
          </label>
        </div>
        {!available && <p role="status" className="tool-hint">{t("reader.unsupported")}</p>}
        {available && voices.length === 0 &&
          <p role="status" className="tool-hint">{t("reader.noLocalVoiceHelp")}</p>}
        {parsed.tooMany && <p role="alert" className="tool-inline-error">{t("reader.tooMany")}</p>}
        {error && <p role="alert" className="tool-inline-error">{error}</p>}
        <p className="tool-hint">{t("reader.hint")}</p>
        {activeParagraph !== null && <p className="tool-hint">{t("reader.savedPosition", { paragraph: activeParagraph + 1 })}</p>}
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
          const paragraphIndex = pageStart + index;
          return (
            <button type="button" key={paragraphIndex}
              ref={(node) => { paragraphRefs.current[paragraphIndex] = node; }}
              className={`speech-reader-paragraph${paragraphIndex === activeParagraph ? " is-reading" : ""}`}
              aria-current={paragraphIndex === activeParagraph ? "true" : undefined}
              onClick={() => startAtParagraph(paragraphIndex)}>
              {paragraph}
            </button>
          );
        })}
      </div>
    </div>
  );
}
