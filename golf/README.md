# Swing Golf

A living-room golf game in the browser. One screen (laptop / TV browser, cast or screen-shared to the TV)
shows the course; every player's **phone is the club** – its gyroscope and accelerometer read the swing.

No build step, no server code, no install. Plain HTML + JavaScript modules.

```
golf/
  index.html         landing page (choose Big screen or Phone controller)
  display.html       the game screen for the TV
  controller.html    the phone controller
  js/course.js       the 6 holes, trees, surface lookup (fairway, rough, sand, water…)
  js/physics.js      clubs, ball flight (drag, lift, wind, curve), bounce, roll, cup
  js/render.js       pseudo-3D canvas renderer + top-down mini-map
  js/display.js      game flow: lobby, turns, scoring, camera, HUD
  js/controller.js   phone UI, sensor permission, reconnect
  js/swing.js        turns gyro data into { power, face }
  js/net.js          phone <-> TV messaging (PeerJS / WebRTC, plus same-browser test channel)
  js/sound.js        synthesized sound effects
  vendor/            PeerJS 1.5.4 and qrcode-generator 1.4.4 (MIT), checked in so no CDN is needed
```

## How to play

1. Open `display.html` on the computer connected to the TV (or cast that tab / share the screen). Press **F** for fullscreen.
2. Each player scans the QR code (or opens `controller.html` and types the 4-letter code), enters a name and taps **Join**.
   On iPhone, tap **Allow** when asked for motion access.
3. The first phone to join is the host and picks 3 or 6 holes and the difficulty, then taps **Start round**.
4. On your turn: pick a club with ◀ ▶ and aim with ⟲ ⟳ (the TV shows the aim line and landing ring).
5. Hold the phone like a club grip – bottom of the phone in your hands, screen facing forward – **press and hold the big
   pad, then swing**. Release only after you've swung.
   - **Speed of the downswing = power.** The TV's power bar shows 100% at the dashed line; overswinging past it costs accuracy.
   - **Twisting the phone during the swing = open/closed club face** → push/slice or pull/hook.
   - Putting uses the same motion with a much smaller full-power speed; the putter range (4–40 m) adapts to the distance.
6. Lowest total wins. Water and out-of-bounds cost a penalty stroke and you replay from the same spot. Max 10 strokes a hole.

Phone settings (bottom of the controller): swing strength (Gentle / Normal / Strong), left-handed flip, and a
**swipe mode** (flick up on the pad) for phones without a gyroscope or when you don't have room to swing.

Keyboard on the big screen (handy for testing): ←/→ aim (Shift = fine), ↑/↓ club, hold **Space** to charge and release
to swing, **Enter** to skip/continue, **F** fullscreen.

> Safety: hold the phone tightly (a lanyard / wrist strap helps), clear the space around you, and don't let go!

## Hosting it (phones need HTTPS)

Phones only give motion-sensor data to pages served over **https** (or `localhost`). The display and phones talk
peer-to-peer through WebRTC, using the free public PeerJS signalling server only to find each other, so the game works
from any static HTTPS host – no game server needed:

- **GitHub Pages**: repo *Settings → Pages → Deploy from a branch* (`main`, `/ (root)`), then open
  `https://<user>.github.io/<repo>/golf/`. (Pages on a private repo needs a paid GitHub plan.)
- **Netlify Drop**: drag the `golf` folder onto <https://app.netlify.com/drop>.
- **Any static host** (Cloudflare Pages, Vercel, an S3 bucket…).

The phone and the TV computer just need internet access; they don't have to be on the same Wi-Fi, though the same
network gives the lowest latency.

## Testing locally

```bash
node server.js          # from the repo root, then open http://localhost:4173/golf/
```

On the same computer, click **Open a test controller in a new tab** in the lobby. That tab talks to the display over
a `BroadcastChannel` (no internet needed) and uses swipe mode with the mouse.

To test with a real phone against your local server you need https; the quickest way is a tunnel, e.g.
`npx localtunnel --port 4173` or `cloudflared tunnel --url http://localhost:4173`, then open the tunnel URL + `/golf/`
on the computer as well so the QR code points at it.

## Tuning

- Club distances, launch angles, spin: `CLUBS` in `js/physics.js`.
- Bounce / roll per surface: `SURFACES` in `js/physics.js`.
- How sensitive the swing is: `full` (deg/s for 100%) in `js/swing.js`, or the phone's Swing strength setting.
- How much face twist curves the ball: `face * 0.3` (start direction) and `face * 0.075` (curve) in `launchBall`, and the
  per-difficulty multiplier in `difficultyAccuracy()` in `js/display.js`.
- New holes: add an entry to `RAW_HOLES` in `js/course.js` (centre-line path, fairway width, green, bunkers, water).

## Ideas for later

Sloped greens with a grid overlay, a practice range, more courses, replays, a "closest to the pin" party mode, and
a self-hosted PeerJS server if the public one is ever unreliable.
