# Technical Reference Baseline

**Reviewed:** 31 July 2026

The implementation agent should consult primary documentation before writing integration code. The links below define the baseline used by the specification. Pin exact package and model revisions in the repository; do not silently track `latest`.

## 1. Vercel AI SDK 7

Core:

- AI SDK documentation: https://ai-sdk.dev/docs/introduction
- AI SDK 7 announcement: https://vercel.com/blog/ai-sdk-7
- Agents overview: https://ai-sdk.dev/docs/agents/overview
- Building agents: https://ai-sdk.dev/docs/agents/building-agents
- Loop control: https://ai-sdk.dev/docs/agents/loop-control
- `ToolLoopAgent` reference: https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent
- Tools and tool calling: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- Structured data: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
- Provider registry: https://ai-sdk.dev/docs/ai-sdk-core/provider-management
- Testing and mock providers: https://ai-sdk.dev/docs/ai-sdk-core/testing
- Telemetry: https://ai-sdk.dev/docs/ai-sdk-core/telemetry
- Embeddings: https://ai-sdk.dev/docs/ai-sdk-core/embeddings
- Transcription: https://ai-sdk.dev/docs/ai-sdk-core/transcription

Providers:

- OpenAI provider: https://ai-sdk.dev/providers/ai-sdk-providers/openai
- Anthropic provider: https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
- OpenRouter AI SDK provider repository: https://github.com/OpenRouterTeam/ai-sdk-provider
- OpenRouter Vercel AI SDK guide: https://openrouter.ai/docs/community/vercel-ai-sdk

Implementation interpretation:

- Use one bounded `ToolLoopAgent`.
- Put Studio, mode, provider capabilities, and budgets in typed runtime context.
- Use provider-specific packages so requests go directly from the desktop app to the provider.
- Use provider-native web-search tools where the selected model supports them.
- Use structured outputs for every durable proposal.
- Use mock providers in ordinary CI; real-provider evals are opt-in and cost-capped.

## 2. Electron and Electron Forge

- Electron 43.2.0 release baseline: https://releases.electronjs.org/release/v43.2.0
- Electron releases: https://releases.electronjs.org/
- Security checklist: https://www.electronjs.org/docs/latest/tutorial/security
- Process model: https://www.electronjs.org/docs/latest/tutorial/process-model
- Context isolation: https://www.electronjs.org/docs/latest/tutorial/context-isolation
- Sandboxing: https://www.electronjs.org/docs/latest/tutorial/sandbox
- `safeStorage`: https://www.electronjs.org/docs/latest/api/safe-storage
- `utilityProcess`: https://www.electronjs.org/docs/latest/api/utility-process
- Message ports: https://www.electronjs.org/docs/latest/tutorial/message-ports
- Packaging: https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging
- Application distribution: https://www.electronjs.org/docs/latest/tutorial/application-distribution
- Code signing: https://www.electronjs.org/docs/latest/tutorial/code-signing
- Updates: https://www.electronjs.org/docs/latest/tutorial/updates
- Electron Forge: https://www.electronforge.io/

Implementation interpretation:

- Renderer stays sandboxed and has no Node access.
- Main process owns SQLite, filesystem, providers, secrets, network policy, and side effects.
- Preload exports a narrow typed bridge rather than generic IPC.
- Embedding and large PDF workloads run in supervised utility processes.
- Build and package on real target operating systems.

## 3. SQLite, FTS, and local vector storage

- SQLite FTS5: https://www.sqlite.org/fts5.html
- SQLite JSON functions: https://www.sqlite.org/json1.html
- SQLite strict tables: https://www.sqlite.org/stricttables.html
- SQLite backup API: https://www.sqlite.org/backup.html
- SQLite WAL: https://www.sqlite.org/wal.html
- `better-sqlite3`: https://github.com/WiseLibs/better-sqlite3
- `better-sqlite3` releases: https://github.com/WiseLibs/better-sqlite3/releases
- `sqlite-vec`: https://github.com/asg017/sqlite-vec
- `sqlite-vec` Node usage: https://alexgarcia.xyz/sqlite-vec/js.html

Implementation interpretation:

- Keep one write-owning connection in the main process.
- Use FTS5 for lexical retrieval.
- Store canonical vectors as Float32 BLOBs.
- Hide optional `sqlite-vec` behavior behind `VectorIndex`.
- Retain an exact-scan fallback and a complete rebuild path.
- Do not add a separate vector database.

## 4. Local embedding model and runtime

- IBM Granite Embedding 97M Multilingual R2: https://huggingface.co/ibm-granite/granite-embedding-97m-multilingual-r2
- IBM Granite Embedding collection: https://huggingface.co/collections/ibm-granite/granite-embedding-models
- Transformers.js: https://huggingface.co/docs/transformers.js/index
- Transformers.js repository: https://github.com/huggingface/transformers.js
- ONNX Runtime JavaScript: https://onnxruntime.ai/docs/get-started/with-javascript/
- ONNX Runtime Node: https://onnxruntime.ai/docs/get-started/with-javascript/node.html

Implementation interpretation:

- Bundle an immutable, checksummed ONNX revision.
- Use the model card’s CLS pooling and normalization requirements exactly.
- Default to the 97M, 384-dimensional model because it is edge-oriented, multilingual, and code-aware.
- Replace it only when the project retrieval eval proves a larger model materially better under product budgets.
- Do not expose an embedding-model selector in the normal UI.

## 5. Webpage capture and browser extension

- Defuddle: https://github.com/kepano/defuddle
- Obsidian Web Clipper reference implementation: https://github.com/obsidianmd/obsidian-clipper
- WXT documentation: https://wxt.dev/
- WXT repository: https://github.com/wxt-dev/wxt
- Chrome native messaging: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
- Microsoft native messaging: https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/developer-guide/native-messaging
- Chrome extension security guidance: https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure

Implementation interpretation:

- Run Defuddle against the rendered page in the extension.
- Extension performs capture, not AI reasoning.
- Use one Manifest V3 codebase for Chrome and Edge.
- Persist an extension-side retry queue.
- Validate extension ID, payload schema, and message size at the native host.

## 6. PDF extraction and viewing

- unpdf: https://github.com/unjs/unpdf
- PDF.js: https://mozilla.github.io/pdf.js/
- PDF.js repository: https://github.com/mozilla/pdf.js

Advanced parser references, not mandatory version-one dependencies:

- Docling: https://github.com/docling-project/docling
- Granite Docling: https://huggingface.co/ibm-granite/granite-docling-258M
- Marker: https://github.com/datalab-to/marker
- MinerU: https://github.com/opendatalab/MinerU
- olmOCR: https://github.com/allenai/olmocr

Implementation interpretation:

- Use unpdf/PDF.js first.
- Preserve page and positional locators.
- Score extraction quality deterministically.
- Use targeted provider vision only for selected suspect pages after approval.
- Keep advanced parsers behind an optional interface because of size, runtime, licensing, and hardware trade-offs.

## 7. Transcripts and audio

- Podcasting 2.0 transcript tag: https://podcasting2.org/docs/podcast-namespace/tags/transcript
- WebVTT: https://www.w3.org/TR/webvtt1/
- YouTube captions download API: https://developers.google.com/youtube/v3/docs/captions/download
- whisper.cpp: https://github.com/ggerganov/whisper.cpp
- Transformers.js audio tutorial: https://huggingface.co/docs/transformers.js/tutorials/node-audio-processing

Implementation interpretation:

- Prefer publisher transcripts and ordinary transcript files.
- Do not make arbitrary public YouTube-caption extraction a product dependency; the official download API requires appropriate video permissions.
- Make provider transcription explicit and show estimated cost before upload.
- Keep a local Whisper pack as a future optional download, not a version-one requirement.

## 8. Validation, testing, and accessibility

- Zod: https://zod.dev/
- Vitest: https://vitest.dev/
- Playwright Electron: https://playwright.dev/docs/api/class-electron
- Playwright accessibility guidance: https://playwright.dev/docs/accessibility-testing
- WCAG 2.2: https://www.w3.org/TR/WCAG22/

Implementation interpretation:

- Validate all IPC, tool, provider, and durable AI output contracts.
- Test the packaged application, not only the renderer in a browser.
- Keep real-provider tests separate from deterministic CI.
- Treat WCAG 2.2 AA as the applicable accessibility target.

## 9. Security references

- Electron security checklist: https://www.electronjs.org/docs/latest/tutorial/security
- OWASP SSRF prevention: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP file upload guidance: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- OWASP LLM prompt injection prevention: https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- Node.js permission and security guidance: https://nodejs.org/en/learn/getting-started/security-best-practices

Implementation interpretation:

- Imported sources are attacker-controlled data.
- Model instructions and source blocks must be structurally separated.
- Deny unsafe network destinations and file paths before acquisition.
- Do not grant models arbitrary HTTP, filesystem, database, shell, or secret access.

## 10. License posture

The implementation must generate and review a license report. Current intended core components are permissively licensed, but the exact artifact and transitive dependency licenses must be checked at implementation time.

Special caution:

- preserve all required notices for bundled models and libraries;
- do not embed AGPL components such as MinerU into the application without a deliberate licensing decision;
- do not copy copyrighted source content into shareable Studio packages;
- share source URLs, metadata, curator notes, and user-authored material instead.
