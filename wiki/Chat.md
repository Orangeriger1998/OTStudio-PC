# Chat

The **Chat** tab lets you ask for pictures and videos in plain words, the way you would in ChatGPT or Gemini. A chat model reads each message: a private one in Ollama on your PC, or one on OpenRouter.

## Choose the chat model

The left panel of the Chat tab holds everything about the chat. **Chat model** is the model that reads your messages, and you can switch it at any time:

- **Private models** run in Ollama on this PC. A green badge with a crossed-out eye reads "Private: runs on this PC". Your messages never leave your computer. Gemma 4 E2B works well and needs about 3.4 GB. Install Ollama, pull a model, and it appears in the list.
- **OpenRouter models** run online with your OpenRouter key. A blue badge with a cloud reads "OpenRouter: your messages go online". Your messages and the descriptions of your latest picture and video go to OpenRouter; your pictures do not. Each message costs a small fraction of a cent. The list offers a few inexpensive models, and **Settings**, under **Chat**, adds any other OpenRouter model that can answer in a fixed format.

OT Studio remembers the chat model you chose, including whether it is private or on OpenRouter, and opens the Chat tab with it the next time. The badge always shows the current kind.

## When a chat model is not available

- If Ollama is not running, the private group in the list reads "On this PC: Ollama is not running", and a message gets a plain answer asking you to start Ollama. Start Ollama, then send the message again. OT Studio never switches to an OpenRouter model on its own.
- If your OpenRouter key is missing, the OpenRouter group reads "OpenRouter: online (add your OpenRouter key in Settings)", and a message asks for the key.
- If a model you chose earlier is gone, the list shows it as "not available now" until you choose another one.

If Ollama runs on a port other than 11434, set the port in **Settings**, under **Chat**.

## Choose the picture and video models

**Models the chat uses**, in the same panel, sets which model makes pictures, which one makes edits, and which one makes videos. The lists hold the Replicate models, the SpicyAPI and OpenRouter models, and the services you added. Until you choose, the chat uses the models you last used on the Pictures and Videos tabs.

## Ask for something

Type what you want and press Enter. Some examples:

- "A lighthouse at sunset" makes a picture.
- "Change her jacket to a red top" edits the last picture.
- "Make it wide", "make it tall for my phone", or "square please" expands the last picture to that shape.
- "Make it bigger and sharper" upscales the last picture.
- "Animate this picture, she turns and smiles, 5 seconds" makes a video from the last picture.
- "Continue the video, she walks into the sea" makes the last video longer.
- "What is a LoRA?" gets a short answer and starts nothing.

Click **Photo** to attach your own pictures. A photo attached to a message is the one that message changes; otherwise the chat uses your latest picture or video.

## Settings in your message

Name a setting in your message, and OT Studio puts it into the request for the model you use. OT Studio reads these from your own words, not from the chat model, and checks each value against what the model allows. Some examples:

- Shape: "4:3", "16x9", "3 by 2", "wide", "tall", or "square". A model without that exact shape gets its closest one, and the plan says so.
- Number of pictures: "3 pictures" or "two versions".
- Length and sound: "10 seconds", "with sound", or "no sound".
- Resolution and size: "720p", "1080p", or "4K" (Seedream).
- Safety: "safety off" or "safety on". For FLUX 1.1 pro, which has a tolerance instead of a switch, "safety off" sets the most permissive tolerance.
- Seed, steps, and guidance: "seed 42", "30 steps", or "guidance 4".
- File: "as PNG" or "quality 95".
- Style (SpicyAPI): "anime style".
- What to keep out: "negative prompt: blurry, text".
- Any other setting by its name on the model's card, such as "prompt strength 0.7", "LoRA strength 0.8", or "fast mode off".

For Upscale, "2x" or "twice" makes the picture two times larger instead of four, and "faces" turns on face enhancement. For Expand, "safety on" turns the safety checker on.

The plan lists every setting it will send, for example "Settings: Shape 9:16 · Seed 42 · Length 10 seconds · Resolution 1080p · Sound on." If you name a setting the model does not have, the plan says so ("Not on this model: Sound."). If a value is outside what the model allows, the plan says that it stays at the model's default, and why.

## Nothing is billed until you click Go

Each request shows a plan: what OT Studio will do, which picture it uses, the model, the settings, and the price. For OpenRouter videos, the price is worked out from OpenRouter's own price per second for that model and length. Click **Go**, or press Enter in the empty message box, to start it. **Cancel** drops it. Sending a new message sets older unused plans aside.

The chat model only chooses what to do, the shape, the length, and the words for the prompt. OT Studio uses the picture, edit, and video models from **Models the chat uses**, FLUX Fill dev for Expand, and Real-ESRGAN for Upscale. If a video starts from a picture and the chosen video model cannot take one, the chat uses Wan 2.2 from a picture instead, and the plan says so.

## Results

Finished pictures and videos appear in the chat. Click a picture to see it full size. Right-click a picture or video for **Save as**, **Show in folder**, and **Copy picture**. With automatic saving on (Settings, Save folders), each result is also saved to your Pictures or Videos folder as soon as it is ready.

Every chat result also has its full card on the Pictures or Videos tab, with Edit, Expand, Upscale, Repeat, and the other buttons.

## Clearing the chat

Both buttons are at the bottom of the left panel.

- **Clear chat** removes the conversation. The pictures and videos stay on their tabs and in your folders.
- **Clear chat and delete its pictures** also removes the chat's results from the app, and moves the copies OT Studio saved for them to the Recycle Bin. Results made on the Pictures and Videos tabs stay. OT Studio asks before it does this.
