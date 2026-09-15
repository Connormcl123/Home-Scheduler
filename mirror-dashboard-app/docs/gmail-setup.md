# Connecting Gmail for package tracking

The wall reads shipping emails from one Gmail account, read-only, and shows packages on Home and in the Packages tab. Setting it up takes about ten minutes, once. You do every step yourself; the Pi only ever sees the key Google hands it.

## 1. Create the Google Cloud project

1. Open https://console.cloud.google.com/ signed in as mrsoundsweet@gmail.com.
2. Project picker, **New project**, name it `Home Scheduler`, **Create**. No billing account is needed; leave billing off so nothing can ever be charged.
3. With the project selected: **APIs & Services**, **Library**, search **Gmail API**, **Enable**.

## 2. Set up the sign-in screen

1. **APIs & Services**, **OAuth consent screen** (newer consoles call it **Google Auth Platform**, **Branding**).
2. User type **External**. App name `Home Scheduler`; support and developer email: your address. Save.
3. **Data access** (or **Scopes**): **Add or remove scopes**, tick `.../auth/gmail.readonly`. Save.
4. **Audience** (or **Test users**): add your Gmail address.
5. Press **Publish app** and confirm, so the status reads **In production**. In Testing, Google ends the sign-in every 7 days. A personal app like this does not need Google's review; you will see an "unverified app" warning when you sign in instead.

## 3. Create the login for the Pi

1. **APIs & Services**, **Credentials**, **Create credentials**, **OAuth client ID**.
2. Application type **Desktop app**, name `Home Scheduler Pi`, **Create**.
3. Copy the **Client ID** and **Client secret**.
4. From your PC, `ssh connor@192.168.1.185`, then edit `~/Home-Scheduler/mirror-dashboard-app/.env` and add:

   ```
   GMAIL_CLIENT_ID=the client ID
   GMAIL_CLIENT_SECRET=the client secret
   ```

5. `sudo systemctl restart mirror-dashboard`

## 4. Sign in

1. On your PC, in a terminal, run `ssh -L 4175:localhost:4174 connor@192.168.1.185` and leave it open.
2. In your PC's browser, open **http://localhost:4175/gmail/connect**.
3. Sign in as mrsoundsweet@gmail.com. On "Google hasn't verified this app", choose **Advanced**, then **Go to Home Scheduler**. Allow read-only access.
4. The page says **Connected as mrsoundsweet@gmail.com**. Close the tab and the terminal.

Within a minute the Pi reads the last 14 days of shipping emails. Open **Packages** on the wall to see them.

## Later

- **Sign in again** (Settings or the Packages tab says so): repeat step 4.
- **Disconnect**: with the tunnel open, `curl -X POST http://localhost:4175/gmail/disconnect`, then remove Home Scheduler at https://myaccount.google.com/permissions.
- **Something on the wall is not a package**: tap it, then **Not a package**.

## What it can see and what it costs

- Read-only: the Pi can search and read mail, never send, change or delete it.
- Only emails matching the shipping search are read. Each one is sent to Claude to fill in the package details: about $0.004 an email, roughly $1 to $1.50 a month.
- The Gmail API is free for this use, and with no billing account on the project Google has nothing to charge.
