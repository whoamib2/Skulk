# Skulk

Skulk is a phone-friendly hide-and-seek game for a park, a campus, or a few blocks. Runners hide inside a circle. Hunters do not get a live trail. Every so often the map blinks with where each runner was, and how long ago. You close the rest of the gap on foot.

It is an original game. It is not affiliated with SCRAM or Moveera.

## How a round works

1. Someone hosts, places a circle on the map, and shares a six-character code or link.
2. Everyone picks Hunter, Runner, or Random. Random fills whichever side is short. A round needs at least 3 players, at least one hunter for every 10 people, and never more hunters than runners.
3. Runners get a head start. Hunters wait, with no snapshots.
4. During the hunt, each team sees its own players live. Hunters see runners only on pings. Runners who are still in never see hunters.
5. A runner who stays outside the circle for 30 seconds shows up live until they step back in.
6. A tag counts when a hunter and a runner are within 15 metres. The hunter can call it, or the runner can tap “I got tagged”. The runner confirms.
7. Tagged players watch the rest of the round a minute behind, live, or not at all. They do not become hunters.
8. Runners win if anyone is still free when time runs out. Hunters win if every runner is tagged. The host can call it off.
9. Optional: the circle shrinks on a timer, with a warning before each close. Each close tightens it to 75%.
10. Radio is team-only.

Location is shared only after the round starts, and each phone receives only the dots it is allowed to see.

## Run it locally

You need Node.js 22 or newer.

```bash
npm install
npm test
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123). The dev server serves the app and proxies the WebSocket game server.

### Play a full round without leaving the room

1. Turn on **On-screen movement** on the home screen.
2. Host a round. In the lobby, tap **Sprint** (1 minute, 15 second head start, pings every 20 seconds) or pick your own times.
3. Copy the code. Open more browser tabs, join with that code, and give each tab a name. Each tab is its own player.
4. Pick sides so the teams are legal, then **Start the round**.
5. Arrow keys, the N/E/S/W pad, or a tap on the map moves you. **Drop** places you on the spot you tap. Hunters can use **Drop and tag** on a ping to step within range and ask that runner to confirm.
6. Tag, confirm, and play to the clock. **Practice on this phone** fills a lobby with bots and does not need the server.

A phone’s real GPS is used when on-screen movement is off. Allow location when the round starts. The browser only shares it while the tab is open.

**Practice on this phone** runs the whole round in the app. It does not open a socket. Host and join still need a game server.

### Game server address

The first screen has a **Game server** field.

- In a browser, leave it blank to use the site you are on (`/ws` on that host).
- On the Android app, host and join need an address the phone can reach, such as `https://skulk.example.com` or `192.168.1.20:43123`.
- `https://` becomes `wss://`, and a bare host gets `ws://` and the `/ws` path.
- Practice on this phone ignores the field.

This environment has no public host account, so the APK is not pointed at a live server. Run one yourself and type its address into the app.

### Host the server

The server is one Node process. It serves the web app and accepts WebSocket connections on `/ws`. `GET /health` returns `ok`.

```bash
npm install
npm run build
PORT=43123 npm start
```

Put it behind HTTPS if phones will join from outside your home. A reverse proxy (Caddy, nginx) should forward both the site and the WebSocket upgrade on `/ws`. On the same Wi-Fi, `ws://` to the computer’s LAN address works. The Android app allows cleartext so that local address is usable. Open port 43123 on the firewall.

Map tiles come from OpenStreetMap. There is no Google Maps key, no Firebase, and no other API key.

## Android app

A signed debug APK is `skulk.apk`. It asks for location only while a round is using real GPS. On-screen movement and practice do not need it.

On the phone: Settings → Security → allow installs from this source (unknown apps), then open the APK. Android will say the app is signed with a debug certificate. That is expected for this build. Uninstall it before installing a later release signed with a different key.

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

The debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`. You need a JDK and the Android SDK (`ANDROID_HOME`). `local.properties` should contain `sdk.dir`.

## Tests

```bash
npm test
```

The tests cover role balance, what each side is allowed to see, the 15 metre tag, the out-of-bounds reveal, shrinking circles, team radio, and both win conditions.

## Production build

```bash
npm run build
npm start
```

`npm start` serves the built app and the WebSocket server together. It listens on `PORT`, or 43123 if that is unset. Check `GET /health`.

Geolocation and installable PWA features need HTTPS once you leave localhost. Put the process behind a TLS reverse proxy (Caddy, nginx, Fly, Render, Railway). The app is one Node process, so any host that can hold a WebSocket open will do. Do not deploy it as a static site only.

### Docker

```bash
docker build -t skulk .
docker run --rm -p 43123:43123 skulk
```

## Install on a phone

The production build is a PWA. In the browser menu, add Skulk to your home screen. Alerts use the Notification API and stay silent so a chime does not give a hiding spot away. The page has to stay open. Mobile browsers will not keep sharing GPS after the app is swiped away. That is a limit of the web, not of the round.

Map tiles are © OpenStreetMap contributors, drawn dark so the markers stay readable.
