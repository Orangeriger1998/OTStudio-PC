# LoRAs

A LoRA teaches a picture model a face, a person, or a style. OT Studio works with two kinds: FLUX dev LoRAs and Qwen Image LoRAs. Each kind runs only on its own model, so the list labels every LoRA with its model. OT Studio keeps your LoRAs on the **LoRAs** tab, uses them for pictures, and can train new ones on Replicate.

## Use a LoRA

Click **Use for pictures** next to a LoRA. OT Studio opens the Pictures tab on FLUX dev with a LoRA, fills in the LoRA, and puts its trigger word at the start of the prompt. Keep the trigger word in the prompt, and describe the rest of the picture after it. You can also choose a LoRA under **Saved LoRA** whenever the model is FLUX dev with a LoRA. **Strength** sets how strongly the LoRA shapes the picture; 1 is the usual value.

A LoRA you trained lives in a private model in your Replicate account. The public FLUX dev LoRA model cannot read private models, so OT Studio runs your trained model's own version instead. That version already contains the LoRA, so the result is the same.

## Qwen Image LoRAs (the alternate trainer)

**Trainer** on the training form offers FLUX dev (the standard trainer) or Qwen Image (the alternate). Some people find Qwen Image keeps a face closer, but there is no fair side-by-side test yet, so the best way to choose is to train both on the same photos and compare.

The Qwen trainer differs from the FLUX trainer in a few ways:

- Qwen learns from plain words, not a made-up trigger word. In place of a trigger word, the form asks how the photos describe the subject, such as "a person named Pao". Every photo gets the caption "A photo of a person named Pao", and you use the same words in your prompts.
- It runs on qwen/qwen-image-lora-trainer on an H100, billed by the second (about $0.09 a minute). A run usually takes 15 to 30 minutes, so about $1.40 to $2.75.
- Its usual settings are 1,000 to 2,000 steps and rank 64.
- Its private model in your Replicate account is named lora-qwen- and the LoRA's name.

A Qwen LoRA runs only on **Qwen Image with a LoRA**, on the Pictures tab, which always needs a Qwen LoRA chosen under **Saved LoRA**. The plain Qwen Image model and the Qwen editing models cannot use these LoRAs. OT Studio runs your trained model's own version; if Replicate returns only the weights file, OT Studio runs it on the trainer's own picture model. A Qwen picture costs about 2.5 to 3 cents.

The Android app runs Qwen LoRAs from version 1.9.0 on, on its Qwen Image with a LoRA model. Exported Qwen LoRA files say they are for Qwen Image.

## Add a LoRA

- **Import a LoRA file** reads a `.otstudio-lora.json` file from the Android app or the LoRA Trainer.
- **Add by reference** takes a name, a trigger word, a reference (owner/model, owner/model/version, or an https:// address of the weights), and the model it was made for.
- **Export** saves a LoRA as a file for the phone app or another PC. The file holds the reference, not the weights, and no key.

## Train a LoRA

1. Give it a name. OT Studio suggests a trigger word from the name, such as MARKFACE for "Mark face". You can change it.
2. Click **Choose photos** and pick 10 to 20 clear photos of the same face, person, or style. Vary the angles, the light, the clothes, and the backgrounds. Each photo must be at least 512 pixels on its short side and at most 50 MB. HEIC photos must be saved as JPEG first. OT Studio lists any photo it cannot use, with the reason.
3. Click **Start training** and confirm. Training runs on Replicate with ostris/flux-dev-lora-trainer. 1,000 steps cost about $1.50 to $2 and take about 20 to 30 minutes.

OT Studio turns each photo upright, makes a JPEG copy of at most 2048 pixels, packs the copies into a ZIP, and sends it to Replicate. Your original photos stay untouched. Replicate keeps the LoRA in a private model named lora- and the LoRA's name, in your account.

The **Trainings** list shows each training, checked with Replicate every 30 seconds, with the time of the last check. A training goes through stages, and the list names each one:

1. Replicate starts the trainer.
2. Replicate writes a caption for each photo, so the trainer knows what each one shows.
3. Replicate loads the FLUX model.
4. Training runs its steps (1,000 at first). The bar fills with the steps, and after a minute or two it shows about how many minutes are left.
5. Replicate saves the LoRA.

During the first three stages, which usually take 5 to 10 minutes, the bar moves back and forth to show the training is alive; it starts to fill when the steps begin. **Stop** ends a running training; Replicate still bills the time it ran. When a training finishes, OT Studio adds the LoRA to your list, and **Use for pictures** appears next to it.
