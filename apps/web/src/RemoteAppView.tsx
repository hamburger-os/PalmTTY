import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent
} from "react";
import {
  REMOTE_APP_CAPTURE_MAX_HEIGHT,
  REMOTE_APP_CAPTURE_MAX_WIDTH,
  REMOTE_APP_CAPTURE_MIN_HEIGHT,
  REMOTE_APP_CAPTURE_MIN_WIDTH,
  encodeRemoteAppControlMessage,
  type AppSessionMediaState,
  type RemoteAppMediaDiagnostics,
  type AppSessionPublic,
  type RemoteAppCapabilities,
  type RemoteAppControlMessage
} from "@palmtty/protocol";
import {
  detachRemoteApp,
  getAppSession,
  negotiateRemoteApp
} from "./api.js";
import { useI18n } from "./i18n.js";
import { RemoteTouchpadGesture } from "./remote-app-gestures.js";
import { hasPresentableVideoFrame, hasStalledVideoFrames, remoteAppVisualState, remoteDisplaySize, remoteVideoPoint, type VideoFit } from "./remote-app-presentation.js";

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
    const timeout = window.setTimeout(finish, 8000);
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
  element: HTMLElement, video: HTMLVideoElement | null,
  clientX: number, clientY: number, fit: VideoFit, clamp: boolean
): Point | undefined {
  return remoteVideoPoint(
    element.getBoundingClientRect(),
    { width: video?.videoWidth ?? 0, height: video?.videoHeight ?? 0 },
    clientX, clientY, fit, clamp
  );
}

function browserIceServers(
  capabilities: RemoteAppCapabilities | null
): RTCIceServer[] {
  return (capabilities?.iceServers ?? []).map((server) => ({
    urls: server.urls,
    ...(server.username !== undefined ? { username: server.username } : {}),
    ...(server.credential !== undefined ? { credential: server.credential } : {})
  }));
}

function interactionModeLabelKey(
  mode: InteractionMode
):
  | "remoteApp.mode.view"
  | "remoteApp.mode.direct"
  | "remoteApp.mode.touchpad" {
  switch (mode) {
    case "view": return "remoteApp.mode.view";
    case "direct": return "remoteApp.mode.direct";
    case "touchpad": return "remoteApp.mode.touchpad";
  }
}

function interactionModeHintKey(
  mode: InteractionMode
):
  | "remoteApp.hint.view"
  | "remoteApp.hint.direct"
  | "remoteApp.hint.touchpad" {
  switch (mode) {
    case "view": return "remoteApp.hint.view";
    case "direct": return "remoteApp.hint.direct";
    case "touchpad": return "remoteApp.hint.touchpad";
  }
}

export function RemoteAppView({
  session,
  capabilities,
  active,
  immersive,
  onImmersiveChange,
  onConnectionChange
}: {
  session: AppSessionPublic;
  capabilities: RemoteAppCapabilities | null;
  active: boolean;
  immersive: boolean;
  onImmersiveChange(immersive: boolean): void;
  onConnectionChange(state: RemoteAppConnectionState): void;
}) {
  const { t } = useI18n();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentTrackRef = useRef<MediaStreamTrack | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const [mode, setMode] = useState<InteractionMode>("view");
  const [fit, setFit] = useState<"contain" | "cover">("contain");
  const [adaptWindow, setAdaptWindow] = useState(false);
  const adaptWindowRef = useRef(false);
  adaptWindowRef.current = adaptWindow;
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [moreKeysOpen, setMoreKeysOpen] = useState(false);
  const [ctrl, setCtrl] = useState(false);
  const [alt, setAlt] = useState(false);
  const [shift, setShift] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [text, setText] = useState("");
  const [mediaState, setMediaState] = useState<AppSessionMediaState>(
    session.mediaState
  );
  const [networkIssue, setNetworkIssue] = useState(false);
  const [videoRendered, setVideoRendered] = useState(false);
  const [everRendered, setEverRendered] = useState(false);
  const [videoTimedOut, setVideoTimedOut] = useState(false);
  const [videoFrozen, setVideoFrozen] = useState(false);
  const [playRejected, setPlayRejected] = useState(false);
  const [mediaDiagnostics, setMediaDiagnostics] = useState<RemoteAppMediaDiagnostics | null>(session.mediaDiagnostics ?? null);
  const videoRenderedRef = useRef(false);
  const frameCallbackSeenRef = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  const lastFrameAt = useRef(0);
  const touchpad = useRef(new RemoteTouchpadGesture());
  const connectedAt = useRef<number | null>(null);
  const activePointers = useRef(new Map<number, Point>());
  const connectionChangeRef = useRef(onConnectionChange);

  useEffect(() => {
    connectionChangeRef.current = onConnectionChange;
  }, [onConnectionChange]);

  useEffect(() => {
    setMediaState(session.mediaState);
    setMediaDiagnostics(session.mediaDiagnostics ?? null);
  }, [session.mediaState, session.mediaDiagnostics, session.id]);

  useEffect(() => {
    setEverRendered(false);
  }, [session.id]);

  const attemptPlayback = useCallback((
    video: HTMLVideoElement, isCurrent: () => boolean
  ) => {
    void video.play().then(
      () => { if (isCurrent()) setPlayRejected(false); },
      () => { if (isCurrent()) setPlayRejected(true); }
    );
  }, []);

  useEffect(() => {
    if (!optionsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) setOptionsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOptionsOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [optionsOpen]);

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

  const sendDisplayHint = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const bounds = surface.getBoundingClientRect();
    if (bounds.width < 1 || bounds.height < 1) return;
    // Clamp the single scale factor before computing both dimensions;
    // independent width/height clamps otherwise distort a portrait ratio.
    const size = remoteDisplaySize(bounds.width, bounds.height,
      window.devicePixelRatio || 1, {
        minWidth: REMOTE_APP_CAPTURE_MIN_WIDTH,
        minHeight: REMOTE_APP_CAPTURE_MIN_HEIGHT,
        maxWidth: REMOTE_APP_CAPTURE_MAX_WIDTH,
        maxHeight: REMOTE_APP_CAPTURE_MAX_HEIGHT
      });
    if (size) send({ type: "display", ...size, adaptWindow: adaptWindowRef.current });
  }, [send]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    let timer: number | undefined;
    const observer = new ResizeObserver(() => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(sendDisplayHint, 160);
    });
    observer.observe(surface);
    sendDisplayHint();
    return () => {
      observer.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [sendDisplayHint]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let callbackId: number | undefined;
    const frame = () => {
      if (stopped || currentTrackRef.current?.readyState !== "live") return;
      videoRenderedRef.current = true;
      lastFrameAt.current = Date.now();
      setVideoRendered(true);
      setEverRendered(true);
      setVideoTimedOut(false);
      setVideoFrozen(false);
      if (typeof video.requestVideoFrameCallback === "function") {
        callbackId = video.requestVideoFrameCallback(() => {
          frameCallbackSeenRef.current = true;
          frame();
        });
      }
    };
    if (typeof video.requestVideoFrameCallback === "function") {
      callbackId = video.requestVideoFrameCallback(() => {
        frameCallbackSeenRef.current = true;
        frame();
      });
    }
    const timer = window.setInterval(() => {
      if (stopped) return;
      if (!videoRenderedRef.current && hasPresentableVideoFrame(
        currentTrackRef.current?.readyState === "live",
        video.srcObject !== null, video.readyState, video.videoWidth, video.videoHeight
      )) {
        // iOS may paint a WebRTC frame before (or without) invoking rVFC.
        if (callbackId !== undefined) video.cancelVideoFrameCallback?.(callbackId);
        frame();
      }
      if (connectedAt.current !== null && !videoRenderedRef.current &&
          Date.now() - connectedAt.current > 8000) setVideoTimedOut(true);
      if (!activeRef.current || document.hidden) {
        // Backgrounded videos may stop callbacks without losing their stream.
        if (videoRenderedRef.current) lastFrameAt.current = Date.now();
      } else if (videoRenderedRef.current && hasStalledVideoFrames(
        frameCallbackSeenRef.current, lastFrameAt.current, Date.now()
      )) setVideoFrozen(true);
    }, 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      if (callbackId !== undefined) video.cancelVideoFrameCallback?.(callbackId);
    };
  }, [session.id]);

  useEffect(() => {
    const controller = new AbortController();
    let connection: RTCPeerConnection | undefined;
    let connectionId: string | undefined;
    let retryTimer: number | undefined;
    let stateTimer: number | undefined;
    let connectionTimer: number | undefined;
    let firstAttempt = true;
    let ended = false;
    let failedAttempts = 0;

    const clearConnectionTimer = () => {
      if (connectionTimer !== undefined) {
        window.clearTimeout(connectionTimer);
        connectionTimer = undefined;
      }
    };

    const cleanupPeer = () => {
      clearConnectionTimer();
      channelRef.current = null;
      connectedAt.current = null;
      currentTrackRef.current = null;
      if (connection) {
        try { connection.close(); } catch { /* ignore */ }
        connection = undefined;
      }
    };

    const scheduleReconnect = () => {
      if (controller.signal.aborted || ended || retryTimer !== undefined) return;
      cleanupPeer();
      failedAttempts += 1;
      if (failedAttempts >= 2) setNetworkIssue(true);
      connectionChangeRef.current("reconnecting");
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        void connect();
      }, Math.min(5000, 750 * failedAttempts));
    };

    const connect = async () => {
      if (controller.signal.aborted || ended) return;
      cleanupPeer();
      videoRenderedRef.current = false;
      frameCallbackSeenRef.current = false;
      lastFrameAt.current = 0;
      setVideoRendered(false);
      setVideoTimedOut(false);
      setVideoFrozen(false);
      setPlayRejected(false);
      connectionChangeRef.current(firstAttempt ? "connecting" : "reconnecting");
      firstAttempt = false;

      const peer = new RTCPeerConnection({
        iceServers: browserIceServers(capabilities)
      });
      connection = peer;
      peer.addTransceiver("video", { direction: "recvonly" });
      const channel = peer.createDataChannel("control", { ordered: true });
      channelRef.current = channel;
      channel.onopen = () => {
        sendDisplayHint();
      };

      peer.ontrack = (event) => {
        if (connection !== peer || controller.signal.aborted) return;
        const video = videoRef.current;
        if (!video) return;
        currentTrackRef.current = event.track;
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        video.srcObject = stream;
        attemptPlayback(video, () => connection === peer && !controller.signal.aborted);
      };
      peer.onconnectionstatechange = () => {
        if (connection !== peer || controller.signal.aborted) return;
        if (peer.connectionState === "connected") {
          clearConnectionTimer();
          failedAttempts = 0;
          setNetworkIssue(false);
          connectedAt.current = Date.now();
          connectionChangeRef.current("connected");
          sendDisplayHint();
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

        const answer = await negotiateRemoteApp(session.id, sdp);
        connectionId = answer.connectionId;
        await peer.setRemoteDescription({ type: "answer", sdp: answer.sdp });
        connectionTimer = window.setTimeout(() => {
          if (
            connection === peer &&
            peer.connectionState !== "connected" &&
            !controller.signal.aborted
          ) {
            scheduleReconnect();
          }
        }, 10_000);
      } catch {
        if (!controller.signal.aborted && connection === peer && !ended) {
          try {
            const current = await getAppSession(session.id);
            setMediaState(current.session.mediaState);
            setMediaDiagnostics(current.session.mediaDiagnostics ?? null);
            if (
              current.session.state === "exited" ||
              current.session.state === "failed"
            ) {
              ended = true;
              cleanupPeer();
              connectionChangeRef.current("closed");
              return;
            }
          } catch {
            // Agent restart is a reconnect condition, not proof of App loss.
          }
          scheduleReconnect();
        }
      }
    };

    const pollSessionState = async () => {
      if (controller.signal.aborted || ended) return;
      try {
        const current = await getAppSession(session.id);
        setMediaState(current.session.mediaState);
        setMediaDiagnostics(current.session.mediaDiagnostics ?? null);
        if (
          current.session.state === "exited" ||
          current.session.state === "failed"
        ) {
          ended = true;
          cleanupPeer();
          connectionChangeRef.current("closed");
          return;
        }
      } catch {
        // Advisory while media reconnect remains authoritative.
      }
      if (!controller.signal.aborted && !ended) {
        stateTimer = window.setTimeout(() => void pollSessionState(), 2000);
      }
    };

    void connect();
    stateTimer = window.setTimeout(() => void pollSessionState(), 1500);

    return () => {
      controller.abort();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (stateTimer !== undefined) window.clearTimeout(stateTimer);
      cleanupPeer();
      if (connectionId) {
        void detachRemoteApp(session.id, connectionId).catch(() => undefined);
      }
      connectionChangeRef.current("closed");
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };
  }, [attemptPlayback, capabilities?.iceServers, sendDisplayHint, session.id]);

  useEffect(() => {
    if (!active) return;
    surfaceRef.current?.focus({ preventScroll: true });
    sendDisplayHint();
  }, [active, adaptWindow, sendDisplayHint]);

  useEffect(() => {
    if (!active || mode === "view") return;
    const surface = surfaceRef.current;
    if (!surface) return;
    // Mobile Safari may ignore React's synthetic preventDefault for native
    // scroll gestures. Claim touchmove only inside the active remote surface;
    // view mode deliberately preserves normal browser pinch/scroll.
    const preventNativeScroll = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };
    surface.addEventListener("touchmove", preventNativeScroll, { passive: false });
    return () => surface.removeEventListener("touchmove", preventNativeScroll);
  }, [active, mode]);

  useEffect(() => () => {
    if (mode === "direct") {
      for (const point of activePointers.current.values()) {
        send({ type: "pointer", action: "up", x: point.x, y: point.y, button: 0 });
      }
    }
    activePointers.current.clear();
    touchpad.current.cancel();
  }, [mode, send]);

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
    if (!active || mode === "view") return;
    if (mode === "direct") {
      const point = normalizedVideoPoint(
        event.currentTarget, videoRef.current, event.clientX, event.clientY, fit, false
      );
      if (!point) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      activePointers.current.set(event.pointerId, point);
      send({
        type: "pointer", action: "down", x: point.x, y: point.y,
        button: Math.max(0, Math.min(2, event.button))
      });
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    touchpad.current.down(
      event.pointerId,
      normalizedPoint(event.currentTarget, event.clientX, event.clientY)
    );
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!active || mode === "view") return;
    if (mode === "direct") {
      if (!activePointers.current.has(event.pointerId)) return;
      event.preventDefault();
      const point = normalizedVideoPoint(
        event.currentTarget, videoRef.current, event.clientX, event.clientY, fit, true
      );
      if (!point) return;
      activePointers.current.set(event.pointerId, point);
      send({ type: "pointer", action: "move", x: point.x, y: point.y, button: 0 });
      return;
    }
    if (!touchpad.current.has(event.pointerId)) return;
    event.preventDefault();
    const motion = touchpad.current.move(
      event.pointerId,
      normalizedPoint(event.currentTarget, event.clientX, event.clientY)
    );
    if (!motion) return;
    if (motion.type === "scroll") {
      send({
        type: "wheel",
        deltaX: Math.max(-4096, Math.min(4096,
          motion.dx * event.currentTarget.clientWidth * 3)),
        deltaY: Math.max(-4096, Math.min(4096,
          motion.dy * event.currentTarget.clientHeight * 3))
      });
    } else {
      send({
        type: "pointerRelative",
        dx: Math.max(-1, Math.min(1, motion.dx * 1.6)),
        dy: Math.max(-1, Math.min(1, motion.dy * 1.6)),
        action: "move", button: 0
      });
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mode === "view") return;
    event.preventDefault();
    try { event.currentTarget.releasePointerCapture(event.pointerId); }
    catch { /* Browser may already have released the pointer. */ }
    if (mode === "direct") {
      const previous = activePointers.current.get(event.pointerId);
      if (!previous) return;
      activePointers.current.delete(event.pointerId);
      const point = normalizedVideoPoint(
        event.currentTarget, videoRef.current, event.clientX, event.clientY, fit, true
      ) ?? previous;
      send({ type: "pointer", action: "up", x: point.x, y: point.y,
        button: Math.max(0, Math.min(2, event.button)) });
      return;
    }
    if (touchpad.current.up(event.pointerId)) {
      send({ type: "pointerRelative", dx: 0, dy: 0, action: "down", button: 0 });
      send({ type: "pointerRelative", dx: 0, dy: 0, action: "up", button: 0 });
    }
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mode === "direct") {
      const previous = activePointers.current.get(event.pointerId);
      if (previous) {
        activePointers.current.delete(event.pointerId);
        send({ type: "pointer", action: "up",
          x: previous.x, y: previous.y, button: 0 });
      }
    } else touchpad.current.cancel();
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!active || mode === "view") return;
    event.preventDefault();
    send({
      type: "wheel",
      deltaX: Math.max(-4096, Math.min(4096, event.deltaX)),
      deltaY: Math.max(-4096, Math.min(4096, event.deltaY))
    });
  };

  const retryPlayback = () => {
    const video = videoRef.current;
    if (video) attemptPlayback(video, () => videoRef.current === video);
  };

  const diagnostic = networkIssue
    ? (capabilities?.relayConfigured
      ? t("remoteApp.networkUnavailable")
      : t("remoteApp.networkNoRelay"))
    : playRejected
      ? t("remoteApp.playBlocked")
      : videoFrozen
        ? t("remoteApp.videoFrozen")
        : videoTimedOut
          ? mediaDiagnostics && mediaDiagnostics.sourceFrames === 0
            ? t("remoteApp.noSourceFrames")
            : mediaDiagnostics && mediaDiagnostics.submittedFrames === 0
              ? t("remoteApp.noConvertedFrames")
              : t("remoteApp.noDecodedFrames")
          : mediaState === "capture-unavailable"
            ? t("remoteApp.captureUnavailable")
            : mediaState === "waiting-for-window"
              ? t("remoteApp.waitingForWindow")
              : mediaState === "waiting-for-frame"
                ? t("remoteApp.waitingForFrame")
                : null;

  const hasPlaybackIssue = networkIssue || playRejected || videoFrozen ||
    videoTimedOut || mediaState === "capture-unavailable";
  const visualState = remoteAppVisualState(everRendered, videoRendered, hasPlaybackIssue);
  // Worker polling can still report "waiting" after the browser has decoded a frame.
  const blockingNotice = visualState === "waiting"
    ? diagnostic ?? t("remoteApp.videoWaiting")
    : null;
  const warningNotice = visualState === "interrupted"
    ? (networkIssue || playRejected || videoFrozen || videoTimedOut ||
        mediaState === "capture-unavailable"
      ? diagnostic
      : t("remoteApp.connection.reconnecting"))
    : null;

  return (
    <section className="remote-app-view">
      <div
        ref={surfaceRef}
        className={"remote-app-surface mode-" + mode}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onWheel={handleWheel}
        onContextMenu={(event) => {
          if (mode !== "view") event.preventDefault();
        }}
      >
        <video ref={videoRef} className={"fit-" + fit}
          autoPlay playsInline muted />
        {blockingNotice && (
          <div className="remote-app-status-overlay glass-content" role="status">
            <strong>{t("remoteApp.statusTitle")}</strong>
            <span>{blockingNotice}</span>
            {playRejected && (
              <button type="button" className="ghost"
                onClick={retryPlayback}>{t("remoteApp.retryPlay")}</button>
            )}
          </div>
        )}
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

      <div className="remote-app-dock">
        {warningNotice && (
          <div className="remote-app-media-warning" role="status">
            <span>{warningNotice}</span>
            {playRejected && (
              <button type="button" className="ghost compact"
                onClick={retryPlayback}>{t("remoteApp.retryPlay")}</button>
            )}
          </div>
        )}
        <div ref={toolbarRef} className="remote-app-toolbar glass-panel">
          <div className="remote-app-modes" role="group"
            aria-label={t("remoteApp.mode")}>
            {(["view", "touchpad", "direct"] as const).map((item) => (
              <button key={item} type="button"
                className={mode === item ? "selected compact" : "ghost compact"}
                aria-pressed={mode === item}
                title={t(interactionModeHintKey(item))}
                onClick={() => setMode(item)}>
                {t(interactionModeLabelKey(item))}
              </button>
            ))}
          </div>
          <div className="remote-app-toolbar-actions">
            <button type="button" className="ghost compact remote-app-immersive-trigger"
              aria-label={immersive ? t("remoteApp.exitImmersive") : t("remoteApp.immersive")}
              title={immersive ? t("remoteApp.exitImmersive") : t("remoteApp.immersive")}
              aria-pressed={immersive}
              onClick={() => { setOptionsOpen(false); onImmersiveChange(!immersive); }}>
              {immersive ? t("remoteApp.exitShort") : "⛶"}
            </button>
            <button type="button" className="ghost compact remote-app-options-trigger"
              aria-label={t("remoteApp.options")}
              aria-expanded={optionsOpen}
              aria-haspopup="true"
              onClick={() => setOptionsOpen((previous) => !previous)}>⋯</button>
          </div>
          {optionsOpen && (
            <div className="remote-app-options">
              <button type="button" className="ghost compact"
                onClick={() => { setFit((current) => current === "contain" ? "cover" : "contain"); setOptionsOpen(false); }}>
                {fit === "contain" ? t("remoteApp.fillScreen") : t("remoteApp.showAll")}
              </button>
              <button type="button" className={adaptWindow ? "selected compact" : "ghost compact"}
                aria-pressed={adaptWindow}
                onClick={() => { setAdaptWindow((previous) => !previous); setOptionsOpen(false); }}>
                {t("remoteApp.adaptWindow")}
              </button>
              <button type="button" className="ghost compact"
                onClick={() => { setTextOpen((current) => !current); setOptionsOpen(false); }}>
                {t("remoteApp.text")}
              </button>
              <span className="remote-app-quality">{t("remoteApp.qualityAuto")}</span>
              <details className="remote-app-diagnostics">
                <summary>{t("remoteApp.diagnostics")}</summary>
                <span>{t("remoteApp.hostState")}: {mediaState}</span>
                <span>{t("remoteApp.frames")}: {mediaDiagnostics?.sourceFrames ?? "–"} /
                  {mediaDiagnostics?.submittedFrames ?? "–"}</span>
                <span>{t("remoteApp.failures")}: {mediaDiagnostics?.conversionFailures ?? "–"}</span>
                {mediaDiagnostics?.nativeFailure && (
                  <span>{t("remoteApp.captureReason")}: {mediaDiagnostics.nativeFailure}</span>
                )}
                <span>{t("remoteApp.videoState")}: {videoRendered ? t("remoteApp.videoReady") :
                  t("remoteApp.videoWaiting")}</span>
                {everRendered && videoRef.current && (
                  <span>{videoRef.current.videoWidth} × {videoRef.current.videoHeight}</span>
                )}
              </details>
            </div>
          )}
        </div>
        {moreKeysOpen && (
          <div className="remote-app-extra-keys" aria-label={t("remoteApp.extraKeys")}>
            {([
              ["ArrowLeft", "←"], ["ArrowUp", "↑"],
              ["ArrowDown", "↓"], ["ArrowRight", "→"],
              ["Backspace", "⌫"], ["Delete", "Del"]
            ] as const).map(([key, label]) => (
              <button key={key} type="button" className="ghost compact"
                onClick={() => sendKey(key)}>{label}</button>
            ))}
          </div>
        )}
        <div className="remote-app-keybar-shell">
          <div className="remote-app-keybar" aria-label={t("remoteApp.keys")}>
            <button type="button" aria-pressed={ctrl}
              className={ctrl ? "selected compact" : "ghost compact"}
              onClick={() => setCtrl((value) => !value)}>Ctrl</button>
            <button type="button" aria-pressed={alt}
              className={alt ? "selected compact" : "ghost compact"}
              onClick={() => setAlt((value) => !value)}>Alt</button>
            <button type="button" aria-pressed={shift}
              className={shift ? "selected compact" : "ghost compact"}
              onClick={() => setShift((value) => !value)}>Shift</button>
            {([["Escape", "Esc"], ["Tab", "Tab"], ["Enter", "Enter"]] as const)
              .map(([key, label]) => (
                <button key={key} type="button" className="ghost compact"
                  onClick={() => sendKey(key)}>{label}</button>
              ))}
          </div>
          <button type="button" className="ghost compact remote-app-more-keys"
            aria-expanded={moreKeysOpen}
            onClick={() => setMoreKeysOpen((previous) => !previous)}>
            {moreKeysOpen ? t("remoteApp.fewerKeys") : t("remoteApp.moreKeys")}
          </button>
        </div>
      </div>
    </section>
  );
}
