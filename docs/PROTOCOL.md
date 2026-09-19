# Protocol

PalmTTY protocol revision: **draft v1**

The protocol is intentionally simple during MVP. Shared Zod schemas in `packages/protocol` will be the executable source of truth once implementation begins.

## Transport

- REST-style HTTP JSON API for workspace/session management.
- One WebSocket per attached terminal view.
- UTF-8 JSON WebSocket frames in v1.
- API prefix: `/api/v1`.

Authentication is transport-independent and is intentionally not encoded into terminal message payloads.

## HTTP endpoints

### `GET /api/v1/health`

Example:

```json
{
  "status": "ok",
  "version": "0.1.0-dev",
  "platform": "win32"
}
```

No sensitive path or environment data is returned.

### `GET /api/v1/workspaces`

```json
{
  "workspaces": [
    {
      "id": "palmtty",
      "name": "PalmTTY",
      "shell": "pwsh",
      "startupCommand": "codex"
    }
  ]
}
```

The absolute `cwd` may be omitted/redacted from remote API responses by default.

### `GET /api/v1/sessions`

```json
{
  "sessions": [
    {
      "id": "B9S...",
      "workspaceId": "palmtty",
      "state": "running",
      "createdAt": "2026-09-19T12:00:00Z",
      "cols": 80,
      "rows": 24,
      "connections": 1
    }
  ]
}
```

### `POST /api/v1/sessions`

Request:

```json
{
  "workspaceId": "palmtty",
  "cols": 80,
  "rows": 24
}
```

Response: `201 Created`

```json
{
  "session": {
    "id": "B9S...",
    "workspaceId": "palmtty",
    "state": "starting"
  }
}
```

The client cannot submit an arbitrary shell executable or arbitrary working directory in v1.

### `GET /api/v1/sessions/:id`

Returns current session metadata.

### `DELETE /api/v1/sessions/:id`

Requests termination.

The implementation should first terminate the shell process tree using the platform adapter, then transition the session to `exited`.

## WebSocket endpoint

`GET /api/v1/sessions/:id/terminal`

WebSocket subprotocol:

`palmtty.v1`

Do not place authentication material in the query string.

## Server hello

Immediately after upgrade:

```json
{
  "type": "hello",
  "protocol": 1,
  "sessionId": "B9S...",
  "state": "running",
  "cols": 80,
  "rows": 24,
  "latestSeq": 412
}
```

## Client messages

### Input

```json
{
  "type": "input",
  "data": "git status\r"
}
```

`data` is terminal input, not a shell command API. PalmTTY writes it to the PTY unchanged.

### Resize

```json
{
  "type": "resize",
  "cols": 92,
  "rows": 31
}
```

Validation:

- positive integers;
- implementation-defined sane maximums;
- coalesced/debounced by clients during viewport animation.

### Ack

```json
{
  "type": "ack",
  "seq": 412
}
```

Acks are advisory in v1. They allow metrics and future retransmission tuning.

### Ping

```json
{
  "type": "ping",
  "id": "client-generated-id"
}
```

## Server messages

### Snapshot

A fresh attach receives a terminal-state snapshot.

```json
{
  "type": "snapshot",
  "seq": 412,
  "data": "\u001b[2J..."
}
```

The browser resets its terminal and writes the serialized state.

### Output

```json
{
  "type": "output",
  "seq": 413,
  "data": "PS D:\\Code\\PalmTTY> "
}
```

Sequence numbers are monotonically increasing per session.

### Exit

```json
{
  "type": "exit",
  "exitCode": 0
}
```

### Error

```json
{
  "type": "error",
  "code": "SESSION_NOT_RUNNING",
  "message": "The terminal process has exited."
}
```

Error messages sent to clients must not leak internal stack traces or secrets.

### Pong

```json
{
  "type": "pong",
  "id": "client-generated-id"
}
```

## Reconnect algorithm

### Browser survived the disconnect

If the JS page and xterm instance are still alive:

1. client remembers the latest applied sequence;
2. reconnect WebSocket;
3. send/declare last applied sequence during attach negotiation once the exact mechanism is implemented;
4. server replays retained frames if available;
5. otherwise server sends a full snapshot.

### Browser reloaded or was killed

1. create a new xterm instance;
2. connect;
3. server sends the current serialized snapshot;
4. continue with live `output` frames.

The server-side headless terminal is therefore the primary source for visual state restoration.

## Backpressure

The server must not allow one slow WebSocket client to grow memory without bound.

Policy direction:

- cap queued bytes per connection;
- disconnect a client that remains behind the cap;
- do not block PTY consumption because one browser is slow;
- continue updating the headless state mirror.

## Limits

Proposed safe defaults, subject to profiling:

- terminal input frame: 64 KiB;
- max terminal dimensions: 500 x 200;
- max sessions: 8;
- WebSocket queued output cap: 2 MiB per connection;
- headless scrollback: configurable, bounded.

## Versioning

Breaking protocol changes increment the integer protocol revision and WebSocket subprotocol.

During pre-1.0 development, compatibility is best-effort. Tagged releases should document supported protocol revisions.

## Future protocol extensions

Not part of draft v1:

- file preview/download;
- Git status/diff metadata;
- server-side notifications;
- voice/prompt-specific messages;
- session sharing;
- binary terminal frames;
- agent-specific semantic APIs.
