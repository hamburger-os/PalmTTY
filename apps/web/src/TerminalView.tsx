import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ServerMessageSchema,
  WS_SUBPROTOCOL,
  type ServerMessage
} from "@palmtty/protocol";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { ensureModalDialogOpen } from "./dialog-controller.js";
import { useI18n } from "./i18n.js";
import { TerminalKeyBar } from "./TerminalKeyBar.js";
import {
  Ime229InputTransaction,
  recoverIme229ControlKey
} from "./terminal-ime-input.js";
import {
  applyTerminalModifiers,
  encodeTerminalKey,
  type TerminalKey
} from "./terminal-key-input.js";
import {
  DEFAULT_TERMINAL_FONT_SIZE,
  normalizeTerminalFontSize,
  readTerminalFontSize,
  writeTerminalFontSize
} from "./terminal-preferences.js";
import { useTheme } from "./theme.js";

export type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "stopping"
  | "closed";

export type TerminalInsertRequest = {
  id: number;
  text: string;
};

function websocketUrl(sessionId: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/v1/sessions/${encodeURIComponent(sessionId)}/terminal`;
}

function LongInputDialog({
  connected,
  onCancel,
  onPaste
}: {
  connected: boolean;
  onCancel(): void;
  onPaste(data: string, submit: boolean): void;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    ensureModalDialogOpen(dialog);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="long-input-dialog glass-modal"
      aria-labelledby="long-input-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="long-input-body">
        <h2 id="long-input-title">{t("terminal.longInputTitle")}</h2>
        <p>{t("terminal.longInputHelp")}</p>
        <textarea
          ref={textareaRef}
          className="glass-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t("terminal.composer")}
          rows={8}
        />
      </div>
      <div className="long-input-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={!connected || value.length === 0}
          onClick={() => onPaste(value, false)}
        >
          {t("terminal.paste")}
        </button>
        <button
          type="button"
          className="prism-primary"
          disabled={!connected || value.length === 0}
          onClick={() => onPaste(value, true)}
        >
          {t("terminal.pasteAndEnter")}
        </button>
      </div>
    </dialog>
  );
}

export function TerminalView({
  sessionId,
  active,
  insertRequest,
  onConnectionChange
}: {
  sessionId: string;
  active: boolean;
  insertRequest: TerminalInsertRequest | undefined;
  onConnectionChange(connection: ConnectionState): void;
}) {
  const { t } = useI18n();
  const { terminalTheme } = useTheme();
  const translateRef = useRef(t);
  const terminalThemeRef = useRef(terminalTheme);
  const [fontSize, setFontSize] = useState(() => {
    try {
      return readTerminalFontSize(window.localStorage);
    } catch {
      return DEFAULT_TERMINAL_FONT_SIZE;
    }
  });
  const fontSizeRef = useRef(fontSize);
  const activeRef = useRef(active);
  const terminalMountRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const refitRef = useRef<(() => void) | null>(null);
  const lastSeqRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const sessionExitedRef = useRef(false);
  const inputReadyRef = useRef(false);
  const ctrlRef = useRef(false);
  const altRef = useRef(false);
  const handledInsertRef = useRef<number | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [ctrl, setCtrl] = useState(false);
  const [alt, setAlt] = useState(false);
  const [moreKeysOpen, setMoreKeysOpen] = useState(false);
  const [longInputOpen, setLongInputOpen] = useState(false);

  useEffect(() => {
    translateRef.current = t;
  }, [t]);

  useEffect(() => {
    onConnectionChange(connection);
  }, [connection, onConnectionChange]);

  useEffect(() => {
    activeRef.current = active;
    if (!active) return;
    const frame = window.requestAnimationFrame(() => refitRef.current?.());
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  useEffect(() => {
    terminalThemeRef.current = terminalTheme;
    const terminal = terminalRef.current;
    if (terminal) terminal.options.theme = terminalTheme;
  }, [terminalTheme]);

  useEffect(() => {
    fontSizeRef.current = fontSize;
    try {
      writeTerminalFontSize(window.localStorage, fontSize);
    } catch {
      // Accessing localStorage itself may be blocked in hardened contexts.
    }
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.fontSize = fontSize;
    const frame = window.requestAnimationFrame(() => refitRef.current?.());
    return () => window.cancelAnimationFrame(frame);
  }, [fontSize]);

  useEffect(() => {
    if (connection === "connected") return;
    ctrlRef.current = false;
    altRef.current = false;
    setCtrl(false);
    setAlt(false);
  }, [connection]);

  const terminalSurfaceStyle = terminalTheme.background
    ? ({ "--terminal-background": terminalTheme.background } as CSSProperties)
    : undefined;

  function sendInput(data: string): boolean {
    const socket = socketRef.current;
    if (!inputReadyRef.current || socket?.readyState !== WebSocket.OPEN) {
      return false;
    }
    socket.send(JSON.stringify({ type: "input", data }));
    return true;
  }

  useEffect(() => {
    if (
      !insertRequest ||
      connection !== "connected" ||
      handledInsertRef.current === insertRequest.id
    ) {
      return;
    }
    if (!sendInput(insertRequest.text)) return;
    handledInsertRef.current = insertRequest.id;
    terminalRef.current?.focus();
  }, [connection, insertRequest]);

  useEffect(() => {
    const mount = terminalMountRef.current;
    if (!mount) return;
    intentionalCloseRef.current = false;
    sessionExitedRef.current = false;
    inputReadyRef.current = false;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: fontSizeRef.current,
      lineHeight: 1.15,
      fontFamily: '"Cascadia Mono", "SFMono-Regular", Consolas, monospace',
      scrollback: 10000,
      allowProposedApi: false,
      theme: terminalThemeRef.current
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(mount);
    fit.fit();
    terminalRef.current = terminal;

    const focusTerminal = () => {
      if (!activeRef.current || !inputReadyRef.current) return;
      terminal.focus();
    };
    mount.addEventListener("click", focusTerminal);

    const imeInput = new Ime229InputTransaction();
    const terminalTextarea = terminal.textarea;
    let imeFallbackTimer: number | undefined;
    let imeKeyupTimer: number | undefined;
    let compositionActive = false;

    const clearImeTimers = () => {
      if (imeFallbackTimer !== undefined) {
        window.clearTimeout(imeFallbackTimer);
        imeFallbackTimer = undefined;
      }
      if (imeKeyupTimer !== undefined) {
        window.clearTimeout(imeKeyupTimer);
        imeKeyupTimer = undefined;
      }
    };

    const flushImeInput = (complete: boolean) => {
      const data = imeInput.flush(terminalTextarea?.value ?? "", complete);
      if (!data) return;
      clearImeTimers();
      terminal.input(data, true);
    };

    const scheduleImeFallback = () => {
      if (imeFallbackTimer !== undefined) return;
      // xterm 6.1 beta still has its own keydown-229 zero-delay textarea
      // fallback. Let that run first so any resulting onData is buffered by
      // this transaction before we choose one canonical payload.
      imeFallbackTimer = window.setTimeout(() => {
        imeFallbackTimer = undefined;
        flushImeInput(false);
      }, 250);
    };

    const onCompositionStart = () => {
      compositionActive = true;
      clearImeTimers();
      imeInput.cancel();
    };
    const onCompositionEnd = () => {
      compositionActive = false;
    };
    terminalTextarea?.addEventListener("compositionstart", onCompositionStart);
    terminalTextarea?.addEventListener("compositionend", onCompositionEnd);

    terminal.attachCustomKeyEventHandler((event) => {
      const recoveredControl = compositionActive
        ? undefined
        : recoverIme229ControlKey(event);
      if (recoveredControl !== undefined) {
        clearImeTimers();
        imeInput.cancel();
        ctrlRef.current = false;
        altRef.current = false;
        setCtrl(false);
        setAlt(false);
        event.preventDefault();
        terminal.input(recoveredControl, true);
        return false;
      }

      if (
        event.type === "keydown" &&
        event.keyCode === 229 &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !compositionActive
      ) {
        imeInput.begin(terminalTextarea?.value ?? "");
        scheduleImeFallback();
        return true;
      }

      if (event.type === "keyup" && imeInput.active) {
        if (imeKeyupTimer === undefined) {
          imeKeyupTimer = window.setTimeout(() => {
            imeKeyupTimer = undefined;
            if (imeFallbackTimer !== undefined) {
              window.clearTimeout(imeFallbackTimer);
              imeFallbackTimer = undefined;
            }
            flushImeInput(true);
          }, 0);
        }
      }
      return true;
    });

    const forwardTerminalData = (raw: string) => {
      const modifiers = {
        ctrl: ctrlRef.current,
        alt: altRef.current
      };
      const data = applyTerminalModifiers(raw, modifiers);
      if (!sendInput(data)) return;

      if (modifiers.ctrl) {
        ctrlRef.current = false;
        setCtrl(false);
      }
      if (modifiers.alt) {
        altRef.current = false;
        setAlt(false);
      }
    };

    const dataDisposable = terminal.onData((raw) => {
      const data = imeInput.captureTerminalData(raw);
      if (data !== undefined) forwardTerminalData(data);
    });

    let reconnectTimer: number | undefined;
    let heartbeatTimer: number | undefined;
    let resizeFrame: number | undefined;
    let attempt = 0;
    let ready = false;
    let lastPongAt = Date.now();
    let lastSentCols = terminal.cols;
    let lastSentRows = terminal.rows;
    let terminalWritePipeline = Promise.resolve();

    const enqueueTerminalWrite = (data: string, reset = false): Promise<void> => {
      const run = terminalWritePipeline.then(() => {
        if (reset) terminal.reset();
        if (data.length === 0) return;
        return new Promise<void>((resolve) => terminal.write(data, resolve));
      });
      terminalWritePipeline = run.catch(() => undefined);
      return run;
    };

    const sendCurrentResize = () => {
      if (!ready || !activeRef.current) return;
      fit.fit();

      const cols = terminal.cols;
      const rows = terminal.rows;
      if (cols === lastSentCols && rows === lastSentRows) return;

      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "resize", cols, rows }));
      lastSentCols = cols;
      lastSentRows = rows;
    };

    const scheduleResize = () => {
      if (!activeRef.current || resizeFrame !== undefined) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = undefined;
        sendCurrentResize();
      });
    };
    refitRef.current = scheduleResize;

    const connect = () => {
      if (intentionalCloseRef.current) return;
      ready = false;
      inputReadyRef.current = false;
      setConnection(attempt === 0 ? "connecting" : "reconnecting");

      const socket = new WebSocket(websocketUrl(sessionId), WS_SUBPROTOCOL);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        if (socketRef.current !== socket) return;
        fit.fit();
        lastSentCols = terminal.cols;
        lastSentRows = terminal.rows;
        lastPongAt = Date.now();
        socket.send(JSON.stringify({
          type: "resume",
          lastSeq: lastSeqRef.current,
          cols: terminal.cols,
          rows: terminal.rows
        }));
      });

      socket.addEventListener("message", (event) => {
        let message: ServerMessage;
        try {
          message = ServerMessageSchema.parse(JSON.parse(String(event.data)));
        } catch {
          socket.close(1002, "Invalid server message");
          return;
        }

        if (message.type === "snapshot") {
          lastSeqRef.current = message.seq;
          void enqueueTerminalWrite(message.data, true);
          return;
        }

        if (message.type === "output") {
          if (message.seq !== lastSeqRef.current + 1) {
            socket.close(1012, "Output gap; requesting snapshot");
            lastSeqRef.current = 0;
            return;
          }
          lastSeqRef.current = message.seq;
          void enqueueTerminalWrite(message.data);
          return;
        }

        if (message.type === "hello") {
          if (message.cols !== terminal.cols || message.rows !== terminal.rows) {
            lastSeqRef.current = 0;
            socket.close(1012, "Recovery geometry mismatch");
            return;
          }

          const recoveryRendered = terminalWritePipeline;
          void recoveryRendered.then(() => {
            if (
              socketRef.current !== socket ||
              intentionalCloseRef.current ||
              sessionExitedRef.current
            ) return;
            attempt = 0;
            ready = message.state === "running";
            inputReadyRef.current = ready;
            lastPongAt = Date.now();
            setConnection(
              message.state === "running"
                ? "connected"
                : message.state === "stopping"
                  ? "stopping"
                  : message.state === "starting"
                    ? "connecting"
                    : "closed"
            );
            if (ready) scheduleResize();
          });
          return;
        }

        if (message.type === "pong") {
          lastPongAt = Date.now();
          return;
        }

        if (message.type === "exit") {
          sessionExitedRef.current = true;
          ready = false;
          inputReadyRef.current = false;
          void enqueueTerminalWrite(
            `\r\n\u001b[90m${translateRef.current("terminal.sessionExited", {
              code: message.exitCode === undefined ? "" : ` (${message.exitCode})`
            })}\u001b[0m\r\n`
          );
          setConnection("closed");
          return;
        }

        if (message.type === "error") {
          void enqueueTerminalWrite(
            `\r\n\u001b[31m[PalmTTY] ${message.message}\u001b[0m\r\n`
          );
        }
      });

      socket.addEventListener("close", (event) => {
        if (socketRef.current === socket) socketRef.current = null;
        ready = false;
        inputReadyRef.current = false;
        if (intentionalCloseRef.current || sessionExitedRef.current) {
          setConnection("closed");
          return;
        }
        if (event.code === 1008) {
          if (event.reason === "Authentication expired") {
            window.location.reload();
            return;
          }
          setConnection("closed");
          return;
        }
        setConnection("reconnecting");
        attempt += 1;
        const delay = Math.min(5000, 400 * 2 ** Math.min(attempt, 4));
        reconnectTimer = window.setTimeout(connect, delay);
      });
    };

    const observer = new ResizeObserver(() => {
      if (ready && activeRef.current) scheduleResize();
    });
    observer.observe(mount);

    connect();
    heartbeatTimer = window.setInterval(() => {
      const socket = socketRef.current;
      if (!ready || socket?.readyState !== WebSocket.OPEN) return;
      const now = Date.now();
      if (now - lastPongAt > 45_000) {
        socket.close(1012, "Heartbeat timeout");
        return;
      }
      socket.send(JSON.stringify({ type: "ping", id: String(now) }));
    }, 15_000);

    return () => {
      intentionalCloseRef.current = true;
      inputReadyRef.current = false;
      refitRef.current = null;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      if (heartbeatTimer !== undefined) window.clearInterval(heartbeatTimer);
      if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame);
      observer.disconnect();
      clearImeTimers();
      imeInput.cancel();
      terminalTextarea?.removeEventListener("compositionstart", onCompositionStart);
      terminalTextarea?.removeEventListener("compositionend", onCompositionEnd);
      mount.removeEventListener("click", focusTerminal);
      dataDisposable.dispose();
      socketRef.current?.close(1000, "Leaving terminal view");
      socketRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [sessionId]);

  const toggleCtrl = () => {
    if (connection !== "connected") return;
    ctrlRef.current = !ctrlRef.current;
    setCtrl(ctrlRef.current);
    terminalRef.current?.focus();
  };

  const toggleAlt = () => {
    if (connection !== "connected") return;
    altRef.current = !altRef.current;
    setAlt(altRef.current);
    terminalRef.current?.focus();
  };

  const clearModifiers = () => {
    ctrlRef.current = false;
    altRef.current = false;
    setCtrl(false);
    setAlt(false);
  };

  const sendKey = (key: TerminalKey) => {
    const data = encodeTerminalKey(
      key,
      {
        ctrl: ctrlRef.current,
        alt: altRef.current
      },
      {
        applicationCursorKeysMode:
          terminalRef.current?.modes.applicationCursorKeysMode ?? false
      }
    );
    if (!sendInput(data)) return;
    clearModifiers();
    terminalRef.current?.focus();
  };

  const sendKeyData = (data: string) => {
    if (!sendInput(data)) return;
    clearModifiers();
    terminalRef.current?.focus();
  };

  const adjustFontSize = (delta: number) => {
    setFontSize((current) => normalizeTerminalFontSize(current + delta));
  };

  return (
    <section className="terminal-pane-shell">
      <div
        className="terminal-frame terminal-surface"
        style={terminalSurfaceStyle}
      >
        <div ref={terminalMountRef} className="terminal-mount" />
      </div>

      <TerminalKeyBar
        connected={connection === "connected"}
        ctrl={ctrl}
        alt={alt}
        moreOpen={moreKeysOpen}
        onFocusKeyboard={() => terminalRef.current?.focus()}
        onToggleCtrl={toggleCtrl}
        onToggleAlt={toggleAlt}
        onToggleMore={() => setMoreKeysOpen((open) => !open)}
        onSendKey={sendKey}
        onSendData={sendKeyData}
        onLongInput={() => {
          clearModifiers();
          setLongInputOpen(true);
        }}
        fontSize={fontSize}
        onDecreaseFontSize={() => adjustFontSize(-1)}
        onIncreaseFontSize={() => adjustFontSize(1)}
      />

      {longInputOpen && (
        <LongInputDialog
          connected={connection === "connected"}
          onCancel={() => setLongInputOpen(false)}
          onPaste={(data, submit) => {
            const terminal = terminalRef.current;
            if (
              !terminal ||
              !inputReadyRef.current ||
              socketRef.current?.readyState !== WebSocket.OPEN
            ) return;
            clearModifiers();
            terminal.paste(data);
            if (submit) terminal.input("\r", true);
            setLongInputOpen(false);
            terminal.focus();
          }}
        />
      )}
    </section>
  );
}
