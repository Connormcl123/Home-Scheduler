# Connect the bank accounts (Plaid)

The Finance tab and Home's Money section show sample figures until a bank is connected. Plaid supplies the real balances and transactions. Everything below is done once, from your PC — never from the wall, so no bank password is ever typed on a screen in the kitchen.

## 1. Get Plaid keys

1. Sign up at [dashboard.plaid.com](https://dashboard.plaid.com/signup). A personal project is fine.
2. Stay on the **Trial** plan: it allows up to 10 real bank connections for free, including OAuth banks such as Chase, Bank of America and Wells Fargo, and is auto-approved for most developers. Beyond 10, Plaid's pay-as-you-go pricing applies.
3. In **Developers → Keys**, copy the **client_id** and the **Production** secret.

## 2. Put the keys on the Pi

Run this on your PC, with your own values in place of the two placeholders. Don't paste the secret into a chat window.

    ssh connor@192.168.1.185 "cd ~/Home-Scheduler/mirror-dashboard-app && sed -i 's|^PLAID_CLIENT_ID=.*|PLAID_CLIENT_ID=YOUR_CLIENT_ID|; s|^PLAID_SECRET=.*|PLAID_SECRET=YOUR_SECRET|; s|^PLAID_ENV=.*|PLAID_ENV=production|' .env && sudo systemctl restart mirror-dashboard"

Check it took:

    curl -s http://192.168.1.185:4174/api/finance/plaid/status

`configured` should now be `true` and `environment` should be `production`.

## 3. Connect a bank

1. On your PC, open a tunnel to the Pi and leave it running:

       ssh -L 4175:localhost:4174 connor@192.168.1.185

2. In your PC's browser, open <http://localhost:4175>, go to **Finance**, and press **Connect bank**.
3. Plaid Link opens. An OAuth bank opens its own site in a pop-up window; sign in there as usual. Plaid returns a token to the Pi — your bank password is never seen by the dashboard or stored on the Pi.
4. Accounts and transactions import straight away. The first connection clears the sample data.
5. Repeat for each bank or card. Close the tunnel when you're done.

## Keeping it current

The Pi re-syncs every `PLAID_SYNC_MINUTES` (6 hours by default), and **Sync** on the Finance tab fetches immediately. Plaid itself refreshes a few times a day, so new transactions can take a few hours to appear.

## When something breaks

| What you see | What it means |
|---|---|
| Plaid is not configured. | The keys are missing from the Pi's `.env`, or the service wasn't restarted |
| Link opens, then fails at the bank | The keys are Sandbox keys, not Production; `PLAID_ENV` must be `production` |
| An account stops updating | The bank needs a fresh sign-in: reconnect it through the tunnel as above |
| Sample figures return | No Plaid item is active; check `/api/finance/plaid/status` |

## What's stored

The access token for each bank lives in `data/mirror-dashboard.sqlite` on the Pi, along with accounts and transactions. Treat that file as sensitive: it never goes in git, and the Pi is reachable only over the LAN and Tailscale.
