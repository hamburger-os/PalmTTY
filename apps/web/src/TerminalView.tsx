import { useEffect, useRef, useState } from "react";
import {
  ServerMessageSchema,
  WS_SUBPROTOCOL,
  type ServerMessage
} from "@palmtty/protocol";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

type ConnectionState = "connecting" | "connected" | "reconnecting" | "closed";

function websocketUrl(sessionId: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/v1/sessions/${encodeURIComponent(sessionId)}/terminal`;
}

function controlCharacter(value: string): string | undefined {
  if (value.length !== 1) return undefined;
  const code = value.toUpperCase().charCodeAt(0);
  if (code >= 64 && code <= 95) return String.fromCharCode(code - 64);
  return undefined;
}

export function TerminalView({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const lastSeqRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const ctrlRef = useRef(false);
  const altRef = useRef(false);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [ctrl, setCtrl] = useState(false);
  const [alt, setAlt] = useState(false);
  const [composer, setComposer] = useState("");

  function sendInput(data: string) {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "input", data }));
    }
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    intentionalCloseRef.current = false;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Mono", "SFMono-Regular", Consolas, monospace',
      scrollback: 10000,
      allowProposedApi: false
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    terminalRef.current = terminal;

    const dataDisposable = terminal.onData((raw) => {
      let data = raw;
      if (ctrlRef.current) {
        const control = controlCharacter(raw);
        if (control) data = control;
        ctrlRef.current = false;
        setCtrl(false);
      }
      if (altRef.current) {
        data = "\u001b" + data;
        altRef.current = false;
        setAlt(false);
      }
      sendInput(data);
    });

    let reconnectTimer: number | undefined;
    let attempt = 0;

    const sendResize = () => {
      fit.fit();
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
      }
    };

    const connect = () => {
      if (intentionalCloseRef.current) return;
      setConnection(attempt === 0 ? "connecting" : "reconnecting");

      const socket = new WebSocket(websocketUrl(sessionId), WS_SUBPROTOCOL);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({ type: "resume", lastSeq: lastSeqRef.current }));
      });

      socket.addEventListener("message", (event) => {
        let message: ServerMessage;
        try {
          message = ServerMessageSchema.parse(JSON.parse(String(event.data)));
        } catch {
          socket.close(1002, "Invalid server message");
          return;
        }

        if (message.type === "hello") {
          attempt = 0;
          setConnection("connected");
          window.setTimeout(sendResize, 0);
          return;
        }

        if (message.type === "snapshot") {
          terminal.reset();
          terminal.write(message.data);
          lastSeqRef.current = message.seq;
          return;
        }

        if (message.type === "output") {
          if (message.seq !== lastSeqRef.current + 1) {
            socket.close(1012, "Output gap; requesting snapshot");
            lastSeqRef.current = 0;
            return;
          }
          terminal.write(message.data);
          lastSeqRef.current = message.seq;
          return;
        }

        if (message.type === "exit") {
          terminal.write(`\r\n\u001b[90m[PalmTTY] session exited${message.exitCode === undefined ? "" : ` (${message.exitCode})`}\u001b[0m\r\n`);
          setConnection("closed");
        }

        if (message.type === "error") {
          terminal.write(`\r\n\u001b[31m[PalmTTY] ${message.message}\u001b[0m\r\n`);
        }
      });

      socket.addEventListener("close", () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (intentionalCloseRef.current) return;
        setConnection("reconnecting");
        attempt += 1;
        const delay = Math.min(5000, 400 * 2 ** Math.min(attempt, 4));
        reconnectTimer = window.setTimeout(connect, delay);
      });
    };

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(sendResize);
    });
    observer.observe(host);

    connect();
    window.setTimeout(sendResize, 0);

    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      observer.disconnect();
      dataDisposable.dispose();
      socketRef.current?.close(1000, "Leaving terminal view");
      socketRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [sessionId]);

  const toggleCtrl = () => {
    ctrlRef.current = !ctrlRef.current;
    setCtrl(ctrlRef.current);
    terminalRef.current?.focus();
  };

  const toggleAlt = () => {
    altRef.current = !altRef.current;
    setAlt(altRef.current);
    terminalRef.current?.focus();
  };

  const key = (label: string, data: string) => (
    <button type="button" onClick={() => {
      sendInput(data);
      terminalRef.current?.focus();
    }}>{label}</button>
  );

  return (
    <main className="terminal-page">
      <header className="terminal-header">
        <button className="ghost compact" onClick={onBack}>← Sessions</button>
        <span className={`connection ${connection}`}>{connection}</span>
      </header>

      <div ref={hostRef} className="terminal-host" />

      <div className="keybar" aria-label="Terminal special keys">
        {key("Esc", "\u001b")}
        {key("Tab", "\t")}
        <button className={ctrl ? "armed" : ""} onClick={toggleCtrl}>Ctrl</button>
        <button className={alt ? "armed" : ""} onClick={toggleAlt}>Alt</button>
        {key("↑", "\u001b[A")}
        {key("↓", "\u001b[B")}
        {key("←", "\u001b[D")}
        {key("→", "\u001b[C")}
        {key("Ctrl+C", "\u0003")}
        {key("Ctrl+L", "\u000c")}
      </div>

      <form className="composer" onSubmit={(event) => {
        event.preventDefault();
        if (!composer) return;
        sendInput(composer + "\r");
        setComposer("");
        terminalRef.current?.focus();
      }}>
        <textarea
          value={composer}
          onChange={(event) => setComposer(event.target.value)}
          placeholder="Compose a long command or AI prompt…"
          rows={2}
        />
        <button type="submit" disabled={!composer}>Send</button>
      </form>
    </main>
  );
}
