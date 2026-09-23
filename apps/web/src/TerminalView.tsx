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
  applyTerminalModifiers,
  encodeTerminalKey,
  type TerminalKey
} from "./terminal-key-input.js";
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
  onSend
}: {
  connected: boolean;
  onCancel(): void;
  onSend(data: string): void;
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
          className="prism-primary"
          disabled={!connected || value.length === 0}
          onClick={() => onSend(value)}
        >
          {t("terminal.send")}
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
      fontSize: 14,
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

    const dataDisposable = terminal.onData((raw) => {
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
    const data = encodeTerminalKey(key, {
      ctrl: ctrlRef.current,
      alt: altRef.current
    });
    if (!sendInput(data)) return;
    clearModifiers();
    terminalRef.current?.focus();
  };

  const sendKeyData = (data: string) => {
    if (!sendInput(data)) return;
    clearModifiers();
    terminalRef.current?.focus();
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
      />

      {longInputOpen && (
        <LongInputDialog
          connected={connection === "connected"}
          onCancel={() => setLongInputOpen(false)}
          onSend={(data) => {
            if (!sendInput(data + "\r")) return;
            setLongInputOpen(false);
            terminalRef.current?.focus();
          }}
        />
      )}
    </section>
  );
}
