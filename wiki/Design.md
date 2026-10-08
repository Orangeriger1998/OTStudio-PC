# Design

OT Studio for Windows uses one window with three tabs on a black background, with orange for the selected tab and the main buttons.

## Pictures and Videos

The left panel is the form:

- **Service** and **Model**. Replicate lists a short set of models; **Add** takes any other Replicate model as owner/name. OpenRouter loads its full model list, and each model shows only the settings it supports.
- **Describe it**, the prompt.
- Picture inputs, with a **Remove** button on each picture and **Add another picture** while there is room.
- Settings. The simple view shows the main ones, such as shape, resolution, length, and the safety switch. **Show all settings** shows every setting the model has.
- **Make the picture** or **Make the video**.

The right panel lists jobs as cards, newest first. A card shows the result, its state, the prompt, the model, the service, and the time. OpenRouter cards also show the cost the service reported. The buttons on a card depend on its state: **Save**, **Use as reference**, **Make a video**, **Stop** (Replicate only), **Download again**, **Repeat**, and **Delete**. Clicking a picture opens it full size; the arrow keys move between pictures of one job.

## Settings

- **API keys**: one row per key, with Save and Remove.
- **Services**: the built-in services and the ones you added, with Export, Edit, and Remove, plus **Add a service** and **Import a service**.
- **Save folders** for pictures and videos.
- **Allowed addresses**: hosts you allowed, with Remove.
- **View**: the simple view switch.
- **About**: the version, the creator, the license, and the project page.
