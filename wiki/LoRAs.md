# LoRAs

A LoRA teaches FLUX dev a face, a person, or a style. OT Studio keeps your LoRAs on the **LoRAs** tab, uses them for pictures, and can train new ones on Replicate.

## Use a LoRA

Click **Use for pictures** next to a LoRA. OT Studio opens the Pictures tab on FLUX dev with a LoRA, fills in the LoRA, and puts its trigger word at the start of the prompt. Keep the trigger word in the prompt, and describe the rest of the picture after it. You can also choose a LoRA under **Saved LoRA** whenever the model is FLUX dev with a LoRA. **Strength** sets how strongly the LoRA shapes the picture; 1 is the usual value.

A LoRA you trained lives in a private model in your Replicate account. The public FLUX dev LoRA model cannot read private models, so OT Studio runs your trained model's own version instead. That version already contains the LoRA, so the result is the same.

## Add a LoRA

- **Import a LoRA file** reads a `.otstudio-lora.json` file from the Android app or the LoRA Trainer.
- **Add by reference** takes a name, a trigger word, and a reference: owner/model, owner/model/version, or an https:// address of the weights.
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
