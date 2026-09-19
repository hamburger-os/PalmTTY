# WebSocket and browser security references

Last reviewed: 2026-09-19.

## RFC 6455 — The WebSocket Protocol

Authoritative source: https://www.rfc-editor.org/rfc/rfc6455

Relevant points for PalmTTY:

- browser clients send an `Origin` header during the opening handshake;
- a server that accepts only known web origins should verify that value and reject unacceptable origins;
- `Sec-WebSocket-Protocol` is the application-level subprotocol negotiation mechanism;
- non-browser clients can forge `Origin`, so Origin validation is a browser isolation control, not a substitute for authentication.

PalmTTY interpretation: terminal WebSockets require both an authenticated login session and an exact Origin allowlist. The protocol name is `palmtty.v1`.

## OWASP WebSocket Security Cheat Sheet

Authoritative source: https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html

PalmTTY uses the guidance as a design checklist for authentication, Origin validation, message size limits, rate limiting and secure transport. Project-specific decisions remain documented in the owner/security layer.
