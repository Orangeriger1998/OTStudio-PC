# Design

OT Studio for Windows uses one window with four tabs (Pictures, Videos, LoRAs, and Settings) on a black background, with orange for the selected tab and the main buttons.

## Pictures and Videos

The left panel is the form:

- **Service** and **Model**. Replicate lists a short set of models; **Add** takes any other Replicate model as owner/name. OpenRouter loads its full model list, and each model shows only the settings it supports.
- **Describe it**, the prompt.
- Picture inputs, with a **Remove** button on each picture and **Add another picture** while there is room.
- Settings. The simple view shows the main ones, such as shape, resolution, length, and the safety switch. **Show all settings** shows every setting the model has.
- **Make the picture** or **Make the video**.

The right panel lists jobs as cards, newest first. A card shows the result, its state, the prompt, the model, the service, and the time. OpenRouter cards also show the cost the service reported. The buttons on a card depend on its state. A finished picture has **Save**, **Edit**, **Expand**, **Upscale**, **Make a video**, **Use as reference**, **Repeat**, and **Delete**. A finished video has **Save**, **Make it longer**, **Repeat**, and **Delete**. A running Replicate job has **Stop**, and a failed download has **Download again**. Expanded pictures and joined videos show "Finishing" while OT Studio builds them on the PC. Clicking a picture opens it full size; the arrow keys move between pictures of one job.

## Dialogs

- **Expand the picture**: shape buttons, a preview with the new area striped around the picture, an optional description of the new area, and the safety switch (off at first, as for edits).
- **Upscale the picture**: 2 or 4 times, the resulting size, and "Enhance faces". A picture that is already large gets an explanation and no Upscale button.

When a video is being made longer, the Videos form shows a blue note above the prompt, with "Stop making it longer", and the button reads **Make the next part**.

## LoRAs

- **Your LoRAs**: each LoRA with its trigger word, its reference, a Strength box, **Use for pictures**, **Export**, and **Remove**. Below the list: **Import a LoRA file** and **Add by reference**.
- **Train a LoRA**: the name, the trigger word (suggested from the name), the photos with a **Remove** button on each, the photo rules under the button, **More settings** (steps and rank), the price, and **Start training**.
- **Trainings**: each training with its state, a progress bar, the time it has run, and **Stop**, **Use for pictures**, or **Remove from list**.

On the Pictures tab, FLUX dev with a LoRA shows a **Saved LoRA** chooser above its settings.

## Settings

- **API keys**: one row per key, with Save and Remove.
- **Services**: the built-in services and the ones you added, with Export, Edit, and Remove, plus **Add a service** and **Import a service**.
- **Save folders** for pictures and videos.
- **Allowed addresses**: hosts you allowed, with Remove.
- **View**: the simple view switch.
- **About**: the version, the creator, the license, and the project page.
