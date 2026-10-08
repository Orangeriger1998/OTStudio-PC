# Getting started

## Add your keys

Open **Settings**. Paste each key you have into its row and click **Save**. Replicate, SpicyAPI, and OpenRouter each use their own key. You only need keys for the services you plan to use. Windows encrypts the keys for your account, and updates keep them.

## Make a picture

1. Open **Pictures**.
2. Choose a service and a model.
3. Describe the picture.
4. Change any setting you care about. The simple view shows the main ones; **Show all settings** shows the rest.
5. Click **Make the picture**.

The job appears on the right. Replicate and SpicyAPI pictures usually take seconds. Each request is billed by the service. OT Studio never sends a request twice on its own.

## Make a video

Open **Videos** and follow the same steps. To start a video from a picture you made, click **Make a video** on the picture's card. OpenRouter videos can take several minutes, and OT Studio checks on them every 30 seconds. You can close the app while a video is working: it checks again when you open it.

## Pictures as references

Editing models such as Seedream 4.5, Qwen Image Edit Plus, and FLUX Kontext take pictures. Click **Choose a picture**, or click **Use as reference** on a card. Seedream 4.5 takes up to 14 pictures.

## Edit, expand, and upscale a picture

- **Edit** opens the picture on the Pictures tab with the editing model you used last (FLUX Kontext dev at first). Describe the change. Seedream 4.5, FLUX.2 dev, and Qwen Image Edit Plus also take more reference pictures.
- **Expand** gives the picture a new shape, such as wide or tall. Choose the shape, look at the preview, and say what fills the new area if you like. FLUX Fill dev on Replicate paints the new area, and OT Studio then rebuilds the picture at full size with your original pixels in the middle. It costs about 4 cents.
- **Upscale** makes a picture 2 or 4 times larger with Real-ESRGAN on Replicate. Pictures over about 2 megapixels, such as 1440 by 1440, are already large: the upscaler cannot take them, so OT Studio says so instead of sending them.

## Make a video longer

Click **Make it longer** on a finished video. OT Studio takes the video's last frame and puts it in the starting picture of the same model, with the same prompt and settings. Change the prompt to say what happens next, then click **Make the next part**. When the new part arrives, OT Studio joins it to the end of the video, and the card shows the whole video. Each part can drift a little from the one before, so after a few parts a person may look less like themselves.

## Save, repeat, and delete

- **Save** copies the result to your Pictures or Videos folder, in an OT Studio folder. The message after saving offers **Open folder** and **Change folder**.
- **Repeat** fills the form with the same model, prompt, settings, and pictures, so you can change something and send it again. For an expanded or upscaled picture, it opens the same dialog again, and for a longer video, it starts the same next part again.
- **Delete** removes the job from the list. Copies you saved stay in your folders. **Clear history** removes every finished job in the tab.

## When a job says "Outcome unknown"

The connection broke after OT Studio sent the request. The service may still have made the picture and billed for it. Check your account on the service's website before you try again.
