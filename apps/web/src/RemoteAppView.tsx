import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent
} from "react";
import {
  encodeRemoteAppControlMessage,
  type RemoteAppControlMessage
} from "@palmtty/protocol";
import {
  detachRemoteApp,
  getAppSession,
  negotiateRemoteApp
} from "./api.js";
import { useI18n } from "./i18n.js";

export type RemoteAppConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed";

type InteractionMode = "view" | "direct" | "touchpad";

type Point = { x: number; y: number };

function waitForIceGathering(
  connection: RTCPeerConnection,
  signal: AbortSignal
): Promise<void> {
  if (connection.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(finish, 5000);
    const onState = () => {
      if (connection.iceGatheringState === "complete") finish();
    };
    const onAbort = () => finish();

    function finish() {
      window.clearTimeout(timeout);
      connection.removeEventListener("icegatheringstatechange", onState);
      signal.removeEventListener("abort", onAbort);
      resolve();
    }

    connection.addEventListener("icegatheringstatechange", onState);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function normalizedPoint(
  element: HTMLElement,
  clientX: number,
  clientY: number
): Point {
  const bounds = element.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (clientX - bounds.left) / Math.max(1, bounds.width))),
    y: Math.max(0, Math.min(1, (clientY - bounds.top) / Math.max(1, bounds.height)))
  };
}

function normalizedVideoPoint(
  element: HTMLElement,
  video: HTMLVideoElement | null,
  clientX: number,
  clientY: number,
  clamp: boolean
): Point | undefined {
  const bounds = element.getBoundingClientRect();
  const videoWidth = video?.videoWidth ?? 0;
  const videoHeight = video?.videoHeight ?? 0;
  if (
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    videoWidth <= 0 ||
    videoHeight <= 0
  ) return undefined;

  const scale = Math.min(
    bounds.width / videoWidth,
    bounds.height / videoHeight
  );
  const contentWidth = videoWidth * scale;
  const contentHeight = videoHeight * scale;
  const left = bounds.left + (bounds.width - contentWidth) / 2;
  const top = bounds.top + (bounds.height - contentHeight) / 2;
  let x = (clientX - left) / contentWidth;
  let y = (clientY - top) / contentHeight;

  if (!clamp && (x < 0 || x > 1 || y < 0 || y > 1)) return undefined;
  x = Math.max(0, Math.min(1, x));
  y = Math.max(0, Math.min(1, y));
  return { x, y };
}

export function RemoteAppView({
  sessionId,
  active,
  onConnectionChange
}: {
  sessionId: string;
  active: boolean;
  onConnectionChange(state: RemoteAppConnectionState): void;
}) {
  const { t } = useI18n();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const [mode, setMode] = useState<InteractionMode>("view");
  const [ctrl, setCtrl] = useState(false);
  const [alt, setAlt] = useState(false);
  const [shift, setShift] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [text, setText] = useState("");
  const activePointers = useRef(new Map<number, Point>());
  const pointerMoved = useRef(false);
  const connectionChangeRef = useRef(onConnectionChange);

  useEffect(() => {
    connectionChangeRef.current = onConnectionChange;
  }, [onConnectionChange]);

  const send = useCallback((message: RemoteAppControlMessage): boolean => {
    const channel = channelRef.current;
    if (channel?.readyState !== "open") return false;
    try {
      channel.send(encodeRemoteAppControlMessage(message));
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let connection: RTCPeerConnection | undefined;
    let connectionId: string | undefined;
    let retryTimer: number | undefined;
    let stateTimer: number | undefined;
    let firstAttempt = true;
    let ended = false;

    const cleanupPeer = () => {
      channelRef.current = null;
      if (connection) {
        try { connection.close(); } catch { /* ignore */ }
        connection = undefined;
      }
    };

    const connect = async () => {
      if (controller.signal.aborted || ended) return;
      cleanupPeer();
      connectionChangeRef.current(firstAttempt ? "connecting" : "reconnecting");
      firstAttempt = false;

      const peer = new RTCPeerConnection({ iceServers: [] });
      connection = peer;
      peer.addTransceiver("video", { direction: "recvonly" });
      const channel = peer.createDataChannel("control", { ordered: true });
      channelRef.current = channel;

      peer.ontrack = (event) => {
        const video = videoRef.current;
        if (!video) return;
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        video.srcObject = stream;
        void video.play().catch(() => undefined);
      };
      peer.onconnectionstatechange = () => {
        if (connection !== peer || controller.signal.aborted) return;
        if (peer.connectionState === "connected") {
          connectionChangeRef.current("connected");
          return;
        }
        if (
          peer.connectionState === "failed" ||
          peer.connectionState === "closed" ||
          peer.connectionState === "disconnected"
        ) {
          scheduleReconnect();
        }
      };

      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await waitForIceGathering(peer, controller.signal);
        if (controller.signal.aborted || connection !== peer) return;
        const sdp = peer.localDescription?.sdp;
        if (!sdp) throw new Error("Remote App offer did not contain SDP");

        const answer = await negotiateRemoteApp(sessionId, sdp);
        connectionId = answer.connectionId;
        await peer.setRemoteDescription({ type: "answer", sdp: answer.sdp });
      } catch {
        if (!controller.signal.aborted && connection === peer && !ended) {
          try {
            const current = await getAppSession(sessionId);
            if (current.session.state === "exited" || current.session.state === "failed") {
              ended = true;
              cleanupPeer();
              connectionChangeRef.current("closed");
              return;
            }
          } catch {
            // The Agent may be restarting. Preserve reconnect semantics.
          }
          scheduleReconnect();
        }
      }
    };

    const pollSessionState = async () => {
      if (controller.signal.aborted || ended) return;
      try {
        const current = await getAppSession(sessionId);
        if (current.session.state === "exited" || current.session.state === "failed") {
          ended = true;
          cleanupPeer();
          connectionChangeRef.current("closed");
          return;
        }
      } catch {
        // Session-state polling is advisory; media reconnect remains authoritative.
      }
      if (!controller.signal.aborted && !ended) {
        stateTimer = window.setTimeout(() => void pollSessionState(), 3000);
      }
    };

    const scheduleReconnect = () => {
      if (controller.signal.aborted || ended || retryTimer !== undefined) return;
      cleanupPeer();
      connectionChangeRef.current("reconnecting");
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        void connect();
      }, 1000);
    };

    void connect();
    stateTimer = window.setTimeout(() => void pollSessionState(), 3000);

    return () => {
      controller.abort();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (stateTimer !== undefined) window.clearTimeout(stateTimer);
      cleanupPeer();
      if (connectionId) {
        void detachRemoteApp(sessionId, connectionId).catch(() => undefined);
      }
      connectionChangeRef.current("closed");
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!active) return;
    surfaceRef.current?.focus({ preventScroll: true });
  }, [active]);

  const sendKey = (key: string) => {
    const common = {
      key,
      code: "",
      ctrl,
      alt,
      shift,
      meta: false
    };
    send({ type: "key", action: "down", ...common });
    send({ type: "key", action: "up", ...common });
    setCtrl(false);
    setAlt(false);
    setShift(false);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mode === "view") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (mode === "direct") {
      const point = normalizedVideoPoint(
        event.currentTarget,
        videoRef.current,
        event.clientX,
        event.clientY,
        false
      );
      if (!point) return;
      activePointers.current.set(event.pointerId, point);
      send({
        type: "pointer",
        action: "down",
        x: point.x,
        y: point.y,
        button: Math.max(0, Math.min(2, event.button))
      });
      return;
    }

    const point = normalizedPoint(
      event.currentTarget,
      event.clientX,
      event.clientY
    );
    activePointers.current.set(event.pointerId, point);
    pointerMoved.current = false;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mode === "view" || !activePointers.current.has(event.pointerId)) return;
    event.preventDefault();
    const previous = activePointers.current.get(event.pointerId)!;

    if (mode === "direct") {
      const point = normalizedVideoPoint(
        event.currentTarget,
        videoRef.current,
        event.clientX,
        event.clientY,
        true
      );
      if (!point) return;
      activePointers.current.set(event.pointerId, point);
      send({
        type: "pointer",
        action: "move",
        x: point.x,
        y: point.y,
        button: 0
      });
      return;
    }

    const point = normalizedPoint(
      event.currentTarget,
      event.clientX,
      event.clientY
    );
    activePointers.current.set(event.pointerId, point);
    const pointers = [...activePointers.current.values()];
    if (pointers.length >= 2) {
      send({
        type: "wheel",
        deltaX: (point.x - previous.x) * event.currentTarget.clientWidth * 3,
        deltaY: (point.y - previous.y) * event.currentTarget.clientHeight * 3
      });
      pointerMoved.current = true;
      return;
    }

    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.003) pointerMoved.current = true;
    send({
      type: "pointerRelative",
      dx: Math.max(-1, Math.min(1, dx * 1.6)),
      dy: Math.max(-1, Math.min(1, dy * 1.6)),
      action: "move",
      button: 0
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mode === "view") return;
    event.preventDefault();
    const previous = activePointers.current.get(event.pointerId);
    activePointers.current.delete(event.pointerId);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* ignore */ }

    if (mode === "direct") {
      const point = normalizedVideoPoint(
        event.currentTarget,
        videoRef.current,
        event.clientX,
        event.clientY,
        true
      ) ?? previous;
      if (!point) return;
      send({
        type: "pointer",
        action: "up",
        x: point.x,
        y: point.y,
        button: Math.max(0, Math.min(2, event.button))
      });
      return;
    }

    if (!pointerMoved.current && activePointers.current.size === 0) {
      send({ type: "pointerRelative", dx: 0, dy: 0, action: "down", button: 0 });
      send({ type: "pointerRelative", dx: 0, dy: 0, action: "up", button: 0 });
    }
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (mode === "view") return;
    event.preventDefault();
    send({
      type: "wheel",
      deltaX: Math.max(-4096, Math.min(4096, event.deltaX)),
      deltaY: Math.max(-4096, Math.min(4096, event.deltaY))
    });
  };

  return (
    <section className="remote-app-view">
      <div className="remote-app-toolbar">
        <div className="remote-app-modes" role="group" aria-label={t("remoteApp.mode")}>
          {(["view", "direct", "touchpad"] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={mode === item ? "selected compact" : "ghost compact"}
              onClick={() => setMode(item)}
            >
              {t(`remoteApp.mode.${item}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ghost compact"
          onClick={() => setTextOpen((value) => !value)}
        >
          {t("remoteApp.text")}
        </button>
      </div>

      <div
        ref={surfaceRef}
        className={`remote-app-surface mode-${mode}`}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={(event) => {
          if (mode !== "view") event.preventDefault();
        }}
      >
        <video ref={videoRef} autoPlay playsInline muted />
        <div className="remote-app-mode-hint">
          {t(`remoteApp.hint.${mode}`)}
        </div>
      </div>

      {textOpen && (
        <div className="remote-app-text-panel glass-panel">
          <textarea
            className="glass-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("remoteApp.textPlaceholder")}
            rows={4}
            maxLength={16 * 1024}
          />
          <div className="remote-app-text-actions">
            <button type="button" className="ghost" onClick={() => setTextOpen(false)}>
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={!text}
              onClick={() => {
                if (text && send({ type: "text", text })) {
                  setText("");
                  setTextOpen(false);
                }
              }}
            >
              {t("remoteApp.sendText")}
            </button>
          </div>
        </div>
      )}

      <div className="remote-app-keybar" aria-label={t("remoteApp.keys")}>
        <button
          type="button"
          className={ctrl ? "selected compact" : "ghost compact"}
          onClick={() => setCtrl((value) => !value)}
        >Ctrl</button>
        <button
          type="button"
          className={alt ? "selected compact" : "ghost compact"}
          onClick={() => setAlt((value) => !value)}
        >Alt</button>
        <button
          type="button"
          className={shift ? "selected compact" : "ghost compact"}
          onClick={() => setShift((value) => !value)}
        >Shift</button>
        {([
          ["Escape", "Esc"],
          ["Tab", "Tab"],
          ["Enter", "Enter"],
          ["ArrowLeft", "←"],
          ["ArrowUp", "↑"],
          ["ArrowDown", "↓"],
          ["ArrowRight", "→"],
          ["Backspace", "⌫"],
          ["Delete", "Del"]
        ] as const).map(([key, label]) => (
          <button
            type="button"
            className="ghost compact"
            key={key}
            onClick={() => sendKey(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
