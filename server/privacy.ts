/** Public privacy policy. Inlined so the production bundle does not need a second file. */
export function privacyDocument(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#140147" />
  <title>Privacy · Skulk</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      background: #140147;
      color: #f9f4f8;
      font: 1.05rem/1.55 Georgia, "Iowan Old Style", Palatino, serif;
    }
    main { max-width: 40rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
    p.mark { margin: 0; letter-spacing: 0.16em; text-transform: uppercase; font: 600 0.75rem/1 "Segoe UI", sans-serif; color: #fe5458; }
    h1 { font-size: 3.2rem; line-height: 0.95; font-weight: 560; margin: 0.6rem 0 0.4rem; }
    h2 { font: 600 1rem/1.3 "Segoe UI", sans-serif; color: #fede79; margin: 1.8rem 0 0.35rem; }
    p, li { color: #d5c6e2; }
    ul { padding-left: 1.2rem; }
    a { color: #7fcd9e; }
    .updated { font: 0.9rem/1.4 "Segoe UI", sans-serif; }
  </style>
</head>
<body>
  <main>
    <p class="mark">Skulk</p>
    <h1>Privacy</h1>
    <p class="updated">Updated 24 October 2026.</p>
    <p>Skulk is a game of hide-and-seek that you play on foot. There is no account to create, and there are no ads.</p>
    <h2>Location</h2>
    <p>Skulk uses your phone’s location only while you are in a round, so the map can place the play circle and follow the round’s rules. Those coordinates are sent to the game server for that round and shared with the other players in the same round. They are held in memory for the round, then dropped when the round is over and everyone has left. Skulk does not sell location, and it does not use it for advertising.</p>
    <h2>What else is on the device</h2>
    <p>The name you pick is saved on your device so the next round can fill it in, and it is sent with you as your display name. A round code and a temporary player id stay in the browser or app session. None of this is an account.</p>
    <h2>Who else sees it</h2>
    <ul>
      <li>Players in your round see what the rules allow them to see: your name, and your location when the round says so.</li>
      <li>The server that hosts the round receives that information in order to run the game. The public server is the one at this site.</li>
      <li>Map tiles are loaded from OpenStreetMap so the map can draw.</li>
    </ul>
    <p>Skulk does not ask for your contacts, photos, or microphone, and it does not include third-party advertising.</p>
    <p><a href="/">Back to Skulk</a></p>
  </main>
</body>
</html>
`
}
