/** Public terms. Inlined so the production bundle does not need a second file. */
export function termsDocument(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#140147" />
  <title>Terms · Skulk</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; background: #140147; color: #f9f4f8; font: 1.05rem/1.55 Georgia, "Iowan Old Style", Palatino, serif; }
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
    <h1>Terms of use</h1>
    <p class="updated">Updated 24 October 2026.</p>
    <p>Skulk is a neighbourhood game of hide-and-seek. By playing, you agree to these terms.</p>
    <h2>How you play</h2>
    <ul>
      <li>Stay where you can see traffic, and stay off private property.</li>
      <li>A tag is something you do in person. The phone only keeps score.</li>
      <li>Be decent on the radio. You can block someone in the lobby; their messages stay hidden from you, and the host is told.</li>
    </ul>
    <h2>Hosting</h2>
    <p>Hosting a round is free. Skulk does not sell a hosting unlock, and there is nothing to restore.</p>
    <h2>Your information</h2>
    <p>Location is used only during a round and shared with the players in that round. There is no account. The privacy policy at <a href="/privacy">/privacy</a> says what stays on your device.</p>
    <h2>The game can change</h2>
    <p>Rounds can end early, the server can sleep, and a practice round stays on your phone. Skulk is provided as it is.</p>
    <p>Questions: <a href="mailto:benspader@gmail.com">benspader@gmail.com</a></p>
    <p><a href="/privacy">Privacy</a> · <a href="/">Back to Skulk</a></p>
  </main>
</body>
</html>
`
}
