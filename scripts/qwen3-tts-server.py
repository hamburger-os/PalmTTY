#!/usr/bin/env python3
"""Opt-in, loopback-only Qwen3-TTS sidecar for PalmTTY.

Install Qwen3-TTS in a separate environment. Download weights explicitly;
this service never accepts model paths, URLs or credentials from the browser.
"""
import argparse
from collections import OrderedDict
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import hmac
import io
import json
import os

SPEAKERS = frozenset(("Vivian", "Serena", "Uncle_Fu", "Dylan", "Eric",
                      "Ryan", "Aiden", "Ono_Anna", "Sohee"))
MAX_INPUT_BYTES = 2048
MAX_AUDIO_BYTES = 8 * 1024 * 1024


def main():
    parser = argparse.ArgumentParser(description="PalmTTY private Qwen3-TTS sidecar")
    parser.add_argument("--model-dir", required=True, help="Local, already downloaded model directory")
    parser.add_argument("--model", choices=("0.6b", "1.7b"), required=True)
    parser.add_argument("--port", type=int, default=18765)
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cuda")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("port must be 1024..65535")
    if not os.path.isdir(args.model_dir):
        parser.error("model-dir must be an existing local directory")

    token = os.environ.get("PALMTTY_QWEN_TOKEN", "")
    if not 32 <= len(token) <= 512:
        parser.error("PALMTTY_QWEN_TOKEN must be set to a 32..512 character random secret")

    # Model files must be explicitly prepared. Do not download weights at runtime.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    import torch
    import soundfile as sf
    from qwen_tts import Qwen3TTSModel

    dtype = torch.bfloat16 if args.device == "cuda" else torch.float32
    engine = Qwen3TTSModel.from_pretrained(
        args.model_dir, device_map="cuda:0" if args.device == "cuda" else "cpu",
        dtype=dtype
    )

    cache = OrderedDict()
    cache_bytes = 0

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, _format, *unused):
            # No source text, auth headers, or synthesized content in ordinary logs.
            pass

        def respond(self, code, body, content_type="application/json"):
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "private, no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def authorized(self):
            header = self.headers.get("Authorization", "")
            if not hmac.compare_digest(header.encode("utf-8"),
                                       ("Bearer " + token).encode("utf-8")):
                self.respond(401, b'{"error":"unauthorized"}')
                return False
            return True

        def do_GET(self):
            if not self.authorized():
                return
            if self.path != "/status":
                self.respond(404, b'{"error":"not_found"}')
                return
            self.respond(200, json.dumps({"model": args.model}).encode("utf-8"))

        def do_POST(self):
            if not self.authorized():
                return
            if self.path != "/synthesize":
                self.respond(404, b'{"error":"not_found"}')
                return
            try:
                size = int(self.headers.get("Content-Length", "-1"))
            except ValueError:
                size = -1
            if not 1 <= size <= MAX_INPUT_BYTES or self.headers.get("Transfer-Encoding"):
                self.respond(413, b'{"error":"input_too_large"}')
                return
            try:
                data = json.loads(self.rfile.read(size))
                if not isinstance(data, dict) or set(data) != {"text", "speaker", "style"}:
                    raise ValueError()
                text, speaker, style = data["text"], data["speaker"], data["style"]
                if (not isinstance(text, str) or not 1 <= len(text) <= 260
                        or speaker not in SPEAKERS or style not in ("neutral", "story")
                        or (style == "story" and args.model != "1.7b")):
                    raise ValueError()
            except (ValueError, TypeError, UnicodeError):
                self.respond(400, b'{"error":"invalid_request"}')
                return

            nonlocal cache_bytes
            key = hashlib.sha256(json.dumps(
                [args.model, text, speaker, style], ensure_ascii=False
            ).encode("utf-8")).digest()
            if key in cache:
                cache.move_to_end(key)
                self.respond(200, cache[key], "audio/wav")
                return
            try:
                kwargs = {"text": text, "language": "Chinese", "speaker": speaker}
                if args.model == "1.7b" and style == "story":
                    kwargs["instruct"] = "自然、清晰、克制地讲述中文小说，保留原文，不增删内容。"
                with torch.inference_mode():
                    waveforms, sample_rate = engine.generate_custom_voice(**kwargs)
                buffer = io.BytesIO()
                sf.write(buffer, waveforms[0], sample_rate, format="WAV", subtype="PCM_16")
                audio = buffer.getvalue()
                if not 44 <= len(audio) <= MAX_AUDIO_BYTES:
                    raise ValueError("Audio outside bounds")
                while cache_bytes + len(audio) > 32 * 1024 * 1024 and cache:
                    _, removed = cache.popitem(last=False)
                    cache_bytes -= len(removed)
                cache[key] = audio
                cache_bytes += len(audio)
                self.respond(200, audio, "audio/wav")
            except Exception:
                # Inference failures are bounded and opaque: never echo the source.
                self.respond(503, b'{"error":"synthesis_failed"}')

    print("PalmTTY Qwen3-TTS sidecar listening on 127.0.0.1:" + str(args.port), flush=True)
    HTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
