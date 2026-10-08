# Adding a service

OT Studio can use any picture or video provider with an HTTPS API. You describe the provider once, by pasting the example request from its documentation. After that, the service appears in the Service list like the built-in ones.

## How OT Studio treats the example

OT Studio reads the example as text and takes out the address, the headers, and the JSON body. It never runs the example, and it never runs anything a provider sends back. A key written in the example is removed: the key header becomes a template, and you save your own key separately.

## Steps

1. Open **Settings** and click **Add a service**.
2. Choose whether it makes pictures or videos, paste a curl, Python requests, or Node fetch example, and click **Read the example**.
3. Check the name, the short id, and the key name. Paste your key for the service and click **Save key**.
4. Say what each field of the body is:
   - **Your prompt**: the text you type.
   - **The model**: the model you choose from the list. Type the model names to offer, separated by commas.
   - **A setting you can change**: shown in the form, starting with the example's value.
   - **A picture you choose**: a picture input. OT Studio sends pictures as data: addresses inside the request.
   - **Always as in the example**: sent unchanged.
5. Tell OT Studio where the result is. Click **Send a test request** to see a real answer, then click the field that holds the picture or video. A test is a real request, and the provider may bill it.
6. If the provider answers with a task to check later, choose **The answer has a task to check later**. Then fill in the task id, the status field, the check address from the provider's documentation (with `{id}` where the task id goes), and the status values that mean finished or failed.
7. Click **Save the service**. The first time, OT Studio asks whether it may reach the provider's address.

## The full definition

**Edit the full definition** shows the whole service as JSON. Providers with nested bodies, such as a list of picture objects, can be set up there. The body is a template: a string that is exactly `{name}` becomes the value of that setting or picture, a missing value removes its field, and a list item that uses a picture list repeats once per picture. The built-in OpenRouter services are good examples; export one to see it.

## Sharing services

**Export** saves a service as a file that another person can **Import**. The file never contains a key. The person who imports it adds their own key and approves the provider's address.

## Safety limits

- Service addresses must use HTTPS. Task checks and model lists must use the same address as the request.
- The key travels only in the key header, never in the body or the address, and never to another host.
- Results on a host you have not allowed are not downloaded until you allow that host.
