# OT Studio for Windows

OT Studio makes pictures and videos with your own API keys. This is the Windows version of the OT Studio Android app, without the chat. Created by OrangeTiger.

## What it does

- Pictures and videos from Replicate, SpicyAPI, and OpenRouter, each with its own key.
- A simple view that shows only the main settings for each model, with every setting one click away.
- Reference pictures, starting and ending pictures for videos, and a "Make a video" button on every finished picture.
- History with Save, Open folder, Repeat, and Delete.
- Picture tools: Edit, Expand to a new shape at full size, and Upscale.
- Make it longer: continue a video from its last frame, and OT Studio joins the parts.
- Any other picture or video service: paste the provider's curl, Python, or Node example, say what each field is, and save it. OT Studio reads the example as text. It never runs it.
- Services can be exported and shared. A shared service never contains a key.

## Privacy

OT Studio reaches only the services you use and the addresses you allow. Nothing else leaves your PC. Windows encrypts your keys for your account, and each key goes only to its own service. The window itself cannot reach the network. See [the wiki](wiki/Home.md) for details.

## Build from source

You need Node.js 24 or later.

```
npm install
npm test
npm start
```

`npm run dist` builds the Windows installer in the dist folder.

## License

GNU General Public License, version 3. See LICENSE.
