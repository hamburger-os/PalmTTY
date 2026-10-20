# Web Speech API and Qwen3-TTS upstream sources

## Web Speech API

- MDN SpeechSynthesis: https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis
- MDN SpeechSynthesisVoice: https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice
- MDN SpeechSynthesisUtterance: https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance

`SpeechSynthesis.getVoices()` enumerates voices made available by the user agent and system; `voiceschanged` is used when that list becomes available or changes. `SpeechSynthesisVoice.localService` identifies voices handled by a local service when true; false indicates a remote speech service. The API does not promise network independence for every browser/default voice, media-session support, precise boundary callbacks, or uninterrupted playback under mobile OS suspension. These are user-agent features, not application-controlled upstream APIs.

## Qwen3-TTS

- Official source, variants, API instructions and environment: https://github.com/QwenLM/Qwen3-TTS
- Models: https://huggingface.co/collections/Qwen/qwen3-tts
- Source repository license: https://github.com/QwenLM/Qwen3-TTS/blob/main/LICENSE

Official CustomVoice variants include `Qwen3-TTS-12Hz-0.6B-CustomVoice` and `Qwen3-TTS-12Hz-1.7B-CustomVoice`. The 1.7B CustomVoice interface supports a natural-language style instruction; 0.6B CustomVoice does not expose that feature. The upstream examples require `qwen-tts`, torch and audio dependencies, and perform waveform generation via `generate_custom_voice`. Official model streaming claims do not constitute a ready-made secure PalmTTY HTTP server. Runtime performance, dependencies, model weights and license compliance must be evaluated at deployment time.
