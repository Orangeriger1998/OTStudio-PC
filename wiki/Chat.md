# Chat

The **Chat** tab lets you ask for pictures and videos in plain words, the way you would in ChatGPT or Gemini. A chat model reads each message: a private one in Ollama on your PC, or one on OpenRouter.

## Choose the chat model

The left panel of the Chat tab holds everything about the chat. **Chat model** is the model that reads your messages, and you can switch it at any time:

- **Private models** run in Ollama on this PC. A green badge with a crossed-out eye reads "Private: runs on this PC". Your messages never leave your computer. Gemma 4 E2B works well and needs about 3.4 GB. Install Ollama, pull a model, and it appears in the list.
- **OpenRouter models** run online with your OpenRouter key. A blue badge with a cloud reads "OpenRouter: your messages go online". Your messages and the descriptions of your latest picture and video go to OpenRouter; your pictures do not. Each message costs a small fraction of a cent. The list offers a few inexpensive models, and **Settings**, under **Chat**, adds any other OpenRouter model that can answer in a fixed format.

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

## Nothing is billed until you click Go

Each request shows one line: what OT Studio will do, which picture it uses, the model, and the price. Click **Go**, or press Enter in the empty message box, to start it. **Cancel** drops it. Sending a new message sets older unused plans aside.

The chat model only chooses what to do, the shape, the length, and the words for the prompt. OT Studio uses the picture, edit, and video models from **Models the chat uses**, FLUX Fill dev for Expand, and Real-ESRGAN for Upscale. If a video starts from a picture and the chosen video model cannot take one, the chat uses Wan 2.2 from a picture instead, and the plan says so.

## Results

Finished pictures and videos appear in the chat. Click a picture to see it full size. Right-click a picture or video for **Save as**, **Show in folder**, and **Copy picture**. With automatic saving on (Settings, Save folders), each result is also saved to your Pictures or Videos folder as soon as it is ready.

Every chat result also has its full card on the Pictures or Videos tab, with Edit, Expand, Upscale, Repeat, and the other buttons.

## Clearing the chat

Both buttons are at the bottom of the left panel.

- **Clear chat** removes the conversation. The pictures and videos stay on their tabs and in your folders.
- **Clear chat and delete its pictures** also removes the chat's results from the app, and moves the copies OT Studio saved for them to the Recycle Bin. Results made on the Pictures and Videos tabs stay. OT Studio asks before it does this.
