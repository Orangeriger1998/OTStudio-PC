# OT Studio for Windows and Linux: working instructions

OT Studio for Windows and Linux makes pictures and videos from the user's own API keys. It is the desktop companion of the Android app (Orangeriger1998/OTStudio) and keeps its own version numbers. The owner is OrangeTiger (GitHub account Orangeriger1998). Keep "Created by OrangeTiger" and the repository link in Settings > About. Do not add personal email addresses to the app, the repository, or the wiki.

## Shape of the app

- Electron. `src/main` is the main process: it does all network calls, file access, and key storage. `src/renderer` is the window: plain HTML, CSS, and JavaScript with no framework, sandboxed, with contextIsolation and a strict Content Security Policy. `src/main/preload.js` is the only bridge, and it exposes a fixed list of calls.
- `src/core` holds logic with no Electron types, so `node --test` covers it: reading pasted examples (snippet.js), filling request templates (template.js), service definitions (service.js), the built-in services (builtins.js), and Replicate (replicate.js).
- Data lives in JSON files under the app's data folder (`%APPDATA%\OT Studio`). Native modules are allowed only when they ship prebuilt N-API binaries (sharp does): the PC has no C++ build tools.
- Picture work on the PC uses sharp (`src/main/imaging.js`); video work uses the bundled ffmpeg from ffmpeg-static (`src/main/video.js`), run with an argument list and never through a shell. Both are unpacked from the asar archive by `build.asarUnpack`.

## Rules that protect the user

- Only the main process reaches the network, and only through `src/main/netguard.js`: https only, approved hosts only (the built-in list in builtins.js plus hosts the user allowed in a dialog that the main process shows). The window may not reach the network at all.
- A pasted curl, Python, or Node example is read as text and never run. Service definitions are data. Never add a way to run code from a definition, an example, or a provider answer.
- A key goes only to its own service's origin, only in the key header, never in a body or address, and never to a storage host. A redirect to another origin drops the key header.
- Saved keys must survive every update. The key file name, its version 1 format, and the built-in slot names (replicate, spicyapi, openrouter) are pinned by `test/keys-contract.test.js`. Never edit that test to make a change pass, and never add a step that clears saved keys.
- A paid request is sent once. Never add automatic retries. A request whose outcome is unknown stays "Outcome unknown" until the user decides. Task checks (free GET requests) may repeat.
- Chat plans are data. The local model only chooses an action, a shape, a length, and prompt words in the fixed JSON schema of src/core/chatplan.js; the app picks the media, the service, the model, and the settings. A chat request starts a paid job only from Go. The only plain-http address allowed is the local Ollama origin, http://127.0.0.1:<port>. An OpenRouter chat model receives the chat text and the state line (prompts of the latest results), never pictures; keep the private and online badges accurate.
- Settings named in a chat message are read from the user's words by src/core/settingwords.js, never from the chat model, and are checked against the chosen model's real settings before they are sent. The plan line must list every setting it sends. disable_safety_checker is reversed: "safety off" means true.
- LoRAs have a base model: flux-dev (black-forest-labs/flux-dev-lora, field lora_weights) or qwen-image (qwen/qwen-image-lora-trainer, field replicate_weights), defined in src/core/lora.js BASES. Never run a LoRA on a model of another base. Qwen LoRAs run by version only (the trained model's version, or the trainer's latest version with a weights file), never through the model endpoint.
- SpicyAPI models are text-only (owner decision, 2026-10-05): never send a picture to SpicyAPI.
- Prompts, provider answers, model lists, imported files, and pictures are untrusted input. The window sets them as text, never as HTML.
- Do not request keys in chat, print or commit secrets, or run paid generation without the owner's approval for that action. Never put a key from a skill or another project into this repository.

## Checks

```
npm test
npm start
npm run dist
```

`npm run dist` builds the NSIS installer in `dist/`. Raise `version` in package.json for each release, and attach the installer and its .sha256 to a GitHub release.

## Documentation rules

All user-facing text (in-app strings, README, docs, and the wiki) follows the long-form writing rules: no em dashes, no contractions, active voice, one claim per sentence, varied sentence construction, no filler openers, and no arbitrary three-item lists. While the repository is private, the wiki lives in the wiki folder with .md links. The wiki carries a Revision Log of high-level changes per version.
