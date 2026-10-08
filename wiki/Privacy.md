# Privacy and security

## What leaves your PC

Your prompt, your chosen settings, and the pictures you attach go to the service you chose, together with that service's key. Nothing goes to OrangeTiger or to any analytics service. OT Studio has no server of its own.

## Where OT Studio may connect

OT Studio reaches only these hosts: api.replicate.com and replicate.delivery for Replicate, api.spicyapi.com and cdn.spicyapi.com for SpicyAPI, openrouter.ai for OpenRouter, and the addresses you allowed. OT Studio asks before it reaches any new address. You can remove an allowed address in Settings. The window that shows the app cannot reach the network at all; only the app's background process can, and only through one guarded path.

## Keys

Windows encrypts your keys for your Windows account. A key goes only to its own service, in the request header that service expects. It never goes into a request body or address, and never to a host that stores results. If a service redirects a request to another host, OT Studio drops the key from that request. Updates keep your saved keys.

## Pasted examples and shared services

OT Studio never runs a pasted example. It reads the address, headers, and body as text. A shared service file is data and holds no key.

## Paid requests

OT Studio sends each paid request once and never repeats it on its own. If the connection breaks after sending, the job says "Outcome unknown", because the service may have done the work.

## Where your files are

Results and the pictures you attach are kept in the app's data folder, %APPDATA%\OT Studio\media. Delete removes them. Save copies a result to your Pictures or Videos folder.

## LoRA training

Training sends JPEG copies of the photos you chose to Replicate, in a ZIP, and creates a private model in your Replicate account. Your original photos stay on your PC, untouched. The copies stay in the app's media folder until you remove the training from the list.

## Work done on your PC

Rebuilding an expanded picture at full size and joining the parts of a longer video happen on your PC, with the bundled sharp and ffmpeg. Those steps send nothing anywhere.
