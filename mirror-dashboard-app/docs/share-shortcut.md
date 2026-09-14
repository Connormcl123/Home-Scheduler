# Send to Home Scheduler: the iPhone Shortcut

Share anything from Instagram, Safari or another app, pick **Send to Home Scheduler**, and the Pi saves it as a recipe or a trip idea. A notification tells you where it went.

Tailscale must be connected on the phone. If it isn't, iOS shows its own "could not connect" error.

## Edit your existing Shortcut

Apple only installs signed shortcut files, and signing needs a Mac, so edit the one you already have (about 5 minutes).

1. Open **Shortcuts**, press and hold **Send to Home Scheduler**, and choose **Edit**.
2. Tap the **(i)** details button: turn on **Show in Share Sheet** and allow **URLs**, **Safari web pages** and **Text**.
3. Remove the old actions and add these, in order:
   1. **Get URLs from Input** (input: Shortcut Input). Then **Set Variable** `Link`.
   2. **If** `Link` **has any value**: **Get Contents of URL** with URL `Link` and method **GET**, then **Get Text from Input**, then **Set Variable** `Page`. **End If.** (With no link, `Page` stays empty and only the text is sent.) This downloads the page on your phone, which gets past sites that block the Pi.
   3. **Get Contents of URL** with:
      - URL: `http://100.81.206.101:4174/api/share`
      - Method: **POST**
      - Request Body: **JSON**, with three Text fields: `url` = `Link`, `html` = `Page`, `text` = `Shortcut Input`
   4. **Get Dictionary Value** for key `message` from the result.
   5. **Show Notification** with the Dictionary Value.

   Whether **Get Text from Input** passes the page's source code or only its visible text is checked during the first real shares; if only text arrives, recipe sites still save through Claude but without their structured data.
4. Tap **Done**.

If a site still refuses (Allrecipes, Serious Eats and their sister sites block anything that isn't a browser), share it from **Safari** instead. As a fallback, add **Run JavaScript on Web Page** with `completion(document.documentElement.outerHTML);` and send its result as `html`; that action only runs on Safari pages.

## What the notifications mean

| Notification | Meaning |
|---|---|
| Saved to Recipes: … / Saved to Trips: … | Saved; the wall shows a banner within 30 seconds |
| Already in Recipes: … / Already in Trips: … | That link was saved before |
| That site blocked the Pi. Share it from Safari so your phone sends the page. | Share from Safari |
| Instagram hid that post. Copy the caption and share the text instead. | Private or hidden post |
| Couldn't read that one right now. It's in Recent shares to retry. | Claude was unavailable; retry from Settings on the wall |
| Couldn't find a recipe or trip idea in that post | Nothing to save |
| That page was too big to send. Try sharing the link only. | The page was over 8 MB; share just the link |
| Nothing to save: share a link or some text. | The Shortcut sent no link and no text; check its Request Body fields |
| Something went wrong on the Pi saving that share. | An unexpected error on the Pi; try again, and check Recent shares in Settings on the wall |

A wrong guess is fixed on the wall: **This is a trip idea** on a recipe, or **This is a recipe** on a trip idea.

## Share it with family

In Shortcuts, press and hold the Shortcut, choose **Share**, then **Copy iCloud Link**.
