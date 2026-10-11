import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n.js";
import { speechParagraphs, speechSegments } from "./speech-segments.js";

function storedRate(): number {
  try {
    const value = Number(window.localStorage.getItem("palmtty.speech.rate"));
    if ([0.75, 1, 1.25, 1.5, 2].includes(value)) return value;
  } catch { /* local storage is optional */ }
  return 1;
}

export function SpeechReader({ text, onClose }: {
  text: string;
  onClose(): void;
}) {
  const { t } = useI18n();
  const paragraphs = useMemo(() => speechParagraphs(text), [text]);
  const segments = useMemo(() => speechSegments(paragraphs), [paragraphs]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUri] = useState("");
  const [rate, setRate] = useState(storedRate);
  const [activeParagraph, setActiveParagraph] = useState<number | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequenceRef = useRef(0);
  const cursorRef = useRef(0);
  const paragraphRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const available = typeof window !== "undefined" &&
    "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  useEffect(() => {
    if (!available) return;
    const synth = window.speechSynthesis;
    const updateVoices = () => setVoices(synth.getVoices());
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
    paragraphRefs.current[activeParagraph]?.scrollIntoView({ block: "nearest" });
  }, [activeParagraph]);

  const stop = () => {
    sequenceRef.current += 1;
    if (available) window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
  };

  const playNext = (sequence: number) => {
    if (!available || sequence !== sequenceRef.current) return;
    const segment = segments[cursorRef.current];
    if (!segment) {
      setSpeaking(false);
      setPaused(false);
      return;
    }
    setActiveParagraph(segment.paragraph);
    const utterance = new SpeechSynthesisUtterance(segment.text);
    utterance.lang = "zh-CN";
    utterance.rate = rate;
    const voice = voices.find((item) => item.voiceURI === voiceUri);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.onend = () => {
      if (sequence !== sequenceRef.current) return;
      cursorRef.current += 1;
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
  };

  const startAtParagraph = (paragraph: number) => {
    if (!available) return;
    const index = segments.findIndex((segment) => segment.paragraph >= paragraph);
    if (index < 0) return;
    stop();
    setError(null);
    cursorRef.current = index;
    const sequence = sequenceRef.current;
    setSpeaking(true);
    setActiveParagraph(segments[index]?.paragraph ?? null);
    playNext(sequence);
  };

  const togglePlayback = () => {
    if (!available) return;
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

  return (
    <div className="speech-reader">
      <div className="speech-reader-controls">
        <div className="speech-reader-actions">
          <button type="button" className="ghost compact" onClick={onClose}>
            {t("reader.back")}
          </button>
          <button type="button" disabled={!available || segments.length === 0}
            onClick={togglePlayback}>
            {speaking ? (paused ? t("reader.resume") : t("reader.pause")) : t("reader.play")}
          </button>
          <button type="button" className="ghost compact" disabled={!speaking}
            onClick={stop}>{t("reader.stop")}</button>
          <button type="button" className="ghost compact" disabled={!available || segments.length === 0}
            onClick={() => startAtParagraph(Math.max(0, (activeParagraph ?? 0) - 1))}>
            {t("reader.previous")}
          </button>
          <button type="button" className="ghost compact" disabled={!available || segments.length === 0}
            onClick={() => startAtParagraph(Math.min(paragraphs.length - 1, (activeParagraph ?? -1) + 1))}>
            {t("reader.next")}
          </button>
        </div>
        <div className="speech-reader-options">
          <label>{t("reader.voice")}
            <select value={voiceUri} onChange={(event) => {
              stop();
              setVoiceUri(event.target.value);
            }} disabled={!available}>
              <option value="">{t("reader.systemVoice")}</option>
              {displayVoices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </label>
          <label>{t("reader.rate")}
            <select value={rate} disabled={!available} onChange={(event) => {
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
        {error && <p role="alert" className="tool-inline-error">{error}</p>}
        <p className="tool-hint">{t("reader.hint")}</p>
      </div>
      <div className="speech-reader-text">
        {paragraphs.map((paragraph, index) => (
          <button type="button" key={index}
            ref={(node) => { paragraphRefs.current[index] = node; }}
            className={`speech-reader-paragraph${index === activeParagraph ? " is-reading" : ""}`}
            aria-current={index === activeParagraph ? "true" : undefined}
            onClick={() => startAtParagraph(index)}>
            {paragraph}
          </button>
        ))}
      </div>
    </div>
  );
}
