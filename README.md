# OT Studio for Windows and Linux

OT Studio makes pictures and videos with your own API keys. This is the desktop version of the [OT Studio Android app](https://github.com/Orangeriger1998/OTStudio), for Windows and Linux. Created by OrangeTiger. Downloads for every platform are on the [OT Studio website](https://orangeriger1998.github.io/OTStudio/).

## What it does

- A Chat tab: ask for pictures and videos in plain words. A private model in Ollama on your PC, or a model on OpenRouter, reads the messages, and nothing is billed until you click Go.
- Pictures and videos from Replicate, SpicyAPI, and OpenRouter, each with its own key.
- A simple view that shows only the main settings for each model, with every setting one click away.
- Reference pictures, starting and ending pictures for videos, and a "Make a video" button on every finished picture.
- History with Save, Open folder, Repeat, and Delete.
- Picture tools: Edit, Expand to a new shape at full size, and Upscale.
- Make it longer: continue a video from its last frame, and OT Studio joins the parts.
- LoRAs: use, import, export, and train FLUX dev LoRAs for faces and styles (files shared with the Android app), or Qwen Image LoRAs with the alternate trainer.
- Any other picture or video service: paste the provider's curl, Python, or Node example, say what each field is, and save it. OT Studio reads the example as text. It never runs it.
- Services can be exported and shared. A shared service never contains a key.

## Privacy

OT Studio reaches only the services you use and the addresses you allow. Nothing else leaves your PC. Your keys are encrypted for your account, by Windows or by your desktop's keyring on Linux, and each key goes only to its own service. The window itself cannot reach the network. See [the wiki](https://github.com/Orangeriger1998/OTStudio-PC/wiki) for details.

## Install on Linux

Download the `.AppImage` or the `.deb` from the Releases page. The AppImage runs as it is: mark it executable and open it. The `.deb` installs with your package manager, for example `sudo apt install ./OTStudio-PC-0.6.3-amd64.deb`, and adds OT Studio to the menu. Keys are kept in your desktop's keyring (GNOME Keyring or KWallet). Some lines about GLib may appear if you start OT Studio from a terminal; they are harmless.

## Build from source

You need Node.js 24 or later.

```
npm install
npm test
npm start
```

`npm run dist` builds the Windows installer, and `npm run dist:linux` builds the Linux AppImage and `.deb`, in the dist folder.

## License

GNU General Public License, version 3. See LICENSE.
