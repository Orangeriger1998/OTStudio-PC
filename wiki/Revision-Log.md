# Revision Log

## 0.6.1 (2026-10-08)

- A job with several pictures shows all of them: a row of small pictures under the large one, and arrow buttons in the full-size view.
- Save no longer copies a job a second time when it is already in your folder (for example, after automatic saving). The button reads Saved and shows where the copies are.
- Right-click a picture on a card for Save as, Show in folder, and Copy picture.
- Edit, Expand, Upscale, Make a video, and Use as reference work on the picture shown large, not always the first one.

## 0.6.0 (2026-10-08)

- An alternate LoRA trainer: Qwen Image, on Replicate's qwen/qwen-image-lora-trainer, chosen under Trainer on the LoRAs tab.
- Qwen LoRAs learn from plain words such as "a person named Pao" in place of a made-up trigger word.
- A new picture model, Qwen Image with a LoRA, the only Qwen model that can run these LoRAs. It runs your trained model's own version.
- Every LoRA shows the model it was made for, and Saved LoRA lists only the LoRAs that fit the chosen model.

## 0.5.2 (2026-10-08)

- LoRA training shows its stage: starting, writing captions for the photos, loading the FLUX model, training, and saving.
- Before the steps begin, the bar moves back and forth so a training never looks stuck. During the steps it shows about how many minutes are left, and each training shows when it was last checked.

## 0.5.1 (2026-10-08)

- A shape typed in a chat message, such as 4:3, now reaches the model's shape setting. Before, it stayed in the prompt and the picture came out square.
- Any setting named in a chat message goes into the request: the number of pictures, length, sound, resolution, safety, seed, steps, guidance, file type, style, what to keep out, and any other setting by its name on the model's card.
- The plan lists every setting it will send, names the settings the model does not have, and says when a value stays at the default.
- OpenRouter video plans show a price worked out from OpenRouter's own price per second.
- Upscale in the chat takes "2x" and "faces"; Expand takes "safety on".

## 0.5.0 (2026-10-08)

- The chat model can be a private model in Ollama on this PC or a model on OpenRouter, and you can switch between them at any time. A badge shows which: a crossed-out eye for private, a cloud for OpenRouter.
- Settings, under Chat, adds more OpenRouter chat models; OT Studio checks that each one can answer in a fixed format.
- The Chat tab now has a left panel, like Pictures and Videos, with the chat model, the picture, edit, and video models the chat uses, and the Clear buttons.

## 0.4.0 (2026-10-08)

- A Chat tab: ask for pictures, edits, new shapes, upscales, videos, and longer videos in plain words. A model in Ollama on your PC reads the messages, and your chat text stays on your computer.
- Every request shows what will happen, the picture it uses, and the price, and starts only when you click Go.
- Chat results also get their full card on the Pictures or Videos tab.
- Right-click a chat result for Save as, Show in folder, and Copy picture.
- Every finished picture and video can now be saved to your folders automatically (on at first).
- Clear chat keeps the pictures. Clear chat and delete its pictures moves the chat's saved copies to the Recycle Bin.

## 0.3.0 (2026-10-08)

- A LoRAs tab: your FLUX dev LoRAs with Use for pictures, Strength, Export, and Remove.
- Import LoRA files from the Android app and the LoRA Trainer, or add a LoRA by its reference.
- Train a LoRA on Replicate from the app, with photo checks, upright JPEG copies, progress, and Stop. The finished LoRA joins your list.
- LoRAs trained into your private Replicate model run on their own version, because the public LoRA model cannot read private models.
- A Saved LoRA chooser on the Pictures tab for FLUX dev with a LoRA.

## 0.2.0 (2026-10-08)

- Edit: opens a picture with the editing model you used last, ready for a description of the change and more reference pictures.
- Expand: gives a picture a new shape with FLUX Fill dev, then rebuilds it at full size with the original pixels kept.
- Upscale: 2 or 4 times with Real-ESRGAN. Pictures that are already large get a plain explanation instead.
- Make it longer: the last frame of a video starts the next part, and OT Studio joins the parts into one video with its bundled ffmpeg.
- Repeat on these jobs opens the same tool again with the same choices.

## 0.1.0 (2026-10-07)

- First version of OT Studio for Windows, with Pictures, Videos, and Settings.
- Replicate, SpicyAPI (text only), and OpenRouter pictures and videos.
- OpenRouter shows each model's own resolutions, shapes, lengths, frames, and sound switch.
- Add any picture or video service by pasting its curl, Python, or Node example. Services can be exported and imported without keys.
- History with Save, Open folder, Repeat, Delete, and Clear history.
- Keys encrypted by Windows. Network access limited to approved hosts.
