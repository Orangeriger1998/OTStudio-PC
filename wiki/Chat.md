# Chat

The **Chat** tab lets you ask for pictures and videos in plain words, the way you would in ChatGPT or Gemini. A model in Ollama on your PC reads each message. Your chat text never leaves your computer.

## Set it up

1. Install Ollama and pull a model. Gemma 4 E2B works well and needs about 3.4 GB.
2. Open **Chat** and choose the model at the top. OT Studio remembers it.

If Ollama runs on a port other than 11434, set the port in **Settings**, under **Chat**.

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

The chat model only chooses what to do, the shape, the length, and the words for the prompt. OT Studio chooses the service, the model, and the settings: the model you last used on the Pictures or Videos tab, the editing model you last used for edits, FLUX Fill dev for Expand, and Real-ESRGAN for Upscale. To change which model the chat uses, make one picture or video with that model on its tab.

## Results

Finished pictures and videos appear in the chat. Click a picture to see it full size. Right-click a picture or video for **Save as**, **Show in folder**, and **Copy picture**. With automatic saving on (Settings, Save folders), each result is also saved to your Pictures or Videos folder as soon as it is ready.

Every chat result also has its full card on the Pictures or Videos tab, with Edit, Expand, Upscale, Repeat, and the other buttons.

## Clearing the chat

- **Clear chat** removes the conversation. The pictures and videos stay on their tabs and in your folders.
- **Clear chat and delete its pictures** also removes the chat's results from the app, and moves the copies OT Studio saved for them to the Recycle Bin. Results made on the Pictures and Videos tabs stay. OT Studio asks before it does this.
