# Design

OT Studio for Windows uses one window with five tabs (Chat, Pictures, Videos, LoRAs, and Settings) on a black background, with orange for the selected tab and the main buttons.

## Chat

The left panel holds **Chat model** (private Ollama models first, then OpenRouter models) with its badge: green with a crossed-out eye for private, blue with a cloud for OpenRouter. Below it, **Models the chat uses** has Pictures with, Edits with, and Videos with. **Clear chat** and **Clear chat and delete its pictures** come last, each with a line saying what it does. The conversation fills the right side. Your messages sit on the right in brown bubbles, with any attached photos. OT Studio's messages sit on the left. A plan shows the picture it will use, a bold line saying what will happen, an orange Settings line with every setting it will send, a yellow note for settings the model lacks or values it cannot take, the prompt, the price, and **Go** and **Cancel**. After Go, the same bubble shows progress and then the picture or video. Right-click a result for Save as, Show in folder, and Copy picture. The message box at the bottom has a **Photo** button and **Send**. The chat opens first when a chat model is chosen.

## Pictures and Videos

The left panel is the form:

- **Service** and **Model**. Replicate lists a short set of models; **Add** takes any other Replicate model as owner/name. OpenRouter loads its full model list, and each model shows only the settings it supports.
- **Describe it**, the prompt.
- Picture inputs, with a **Remove** button on each picture and **Add another picture** while there is room.
- Settings. The simple view shows the main ones, such as shape, resolution, length, and the safety switch. **Show all settings** shows every setting the model has.
- **Make the picture** or **Make the video**.

The right panel lists jobs as cards, newest first. A card shows the result, its state, the prompt, the model, the service, and the time. OpenRouter cards also show the cost the service reported. The buttons on a card depend on its state. A finished picture has **Save**, **Edit**, **Expand**, **Upscale**, **Make a video**, **Use as reference**, **Repeat**, and **Delete**. A finished video has **Save**, **Make it longer**, **Repeat**, and **Delete**. A running Replicate job has **Stop**, and a failed download has **Download again**. Expanded pictures and joined videos show "Finishing" while OT Studio builds them on the PC. A job with several pictures shows one large, with its number ("1 of 2") and a row of small pictures under it; click a small picture to show it large. Edit, Expand, Upscale, Make a video, and Use as reference work on the picture shown large. Right-click a picture for Save as, Show in folder, and Copy picture. Clicking a picture opens it full size, with arrow buttons (and the arrow keys) to move between the pictures of one job. Once a job is saved, its Save button reads **Saved**, and clicking it shows where the copies are instead of saving them again.

## Dialogs

- **Expand the picture**: shape buttons, a preview with the new area striped around the picture, an optional description of the new area, and the safety switch (off at first, as for edits).
- **Upscale the picture**: 2 or 4 times, the resulting size, and "Enhance faces". A picture that is already large gets an explanation and no Upscale button.

When a video is being made longer, the Videos form shows a blue note above the prompt, with "Stop making it longer", and the button reads **Make the next part**.

## LoRAs

- **Your LoRAs**: each LoRA with its model (FLUX dev or Qwen Image), its trigger word or description, its reference, a Strength box, **Use for pictures**, **Export**, and **Remove**. Below the list: **Import a LoRA file** and **Add by reference**.
- **Train a LoRA**: **Trainer** (FLUX dev, the standard, or Qwen Image, the alternate), the name, the trigger word (for Qwen, the words that describe the subject; both suggested from the name), the photos with a **Remove** button on each, the photo rules under the button, **More settings** (steps and rank), the price, and **Start training**.
- **Trainings**: each training with its state, the time it has run, its stage in words, a progress bar (moving back and forth until the steps begin, then filling, with the minutes left), the time of the last check, and **Stop**, **Use for pictures**, or **Remove from list**.

On the Pictures tab, FLUX dev with a LoRA and Qwen Image with a LoRA show a **Saved LoRA** chooser above their settings, listing only the LoRAs made for that model.

## Settings

- **API keys**: one row per key, with Save and Remove.
- **Services**: the built-in services and the ones you added, with Export, Edit, and Remove, plus **Add a service** and **Import a service**.
- **Save folders** for pictures and videos, with the switch for saving every result automatically.
- **Chat**: what private and OpenRouter chat models mean, more OpenRouter chat models, and the Ollama port.
- **Allowed addresses**: hosts you allowed, with Remove.
- **View**: the simple view switch.
- **About**: the version, the creator, the license, and the project page.
