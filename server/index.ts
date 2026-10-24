import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, type WebSocket } from 'ws'
import { assetLinksBody } from './assetlinks.ts'
import { Hub } from './hub.ts'
import { privacyDocument } from './privacy.ts'
import { termsDocument } from './terms.ts'

const dev = process.env.NODE_ENV !== 'production'
const port = Number(process.env.PORT) || (dev ? 43124 : 43123)
const clientDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'client')
const hub = new Hub()

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('ok')
    return
  }
  if (url.pathname === '/privacy') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' })
    res.end(privacyDocument())
    return
  }
  if (url.pathname === '/terms') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' })
    res.end(termsDocument())
    return
  }
  if (url.pathname === '/.well-known/assetlinks.json') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' })
    res.end(assetLinksBody())
    return
  }
  if (!dev) {
    serveStatic(res, url.pathname)
    return
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('Skulk dev server is running. The web app is served by Vite.')
})

const wss = new WebSocketServer({ server, path: '/ws' })
wss.on('connection', (ws: WebSocket) => {
  hub.connect(ws)
})

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    const live = socket as WebSocket & { isAlive?: boolean }
    if (live.isAlive === false) {
      live.terminate()
      continue
    }
    live.isAlive = false
    live.ping()
  }
}, 20_000)

wss.on('connection', (socket) => {
  const live = socket as WebSocket & { isAlive?: boolean }
  live.isAlive = true
  socket.on('pong', () => {
    live.isAlive = true
  })
})

const ticker = setInterval(() => hub.tick(Date.now()), 250)

server.listen(port, '0.0.0.0', () => {
  console.log(`Skulk ${dev ? 'dev ' : ''}server on :${port}`)
})

function shutdown(): void {
  clearInterval(heartbeat)
  clearInterval(ticker)
  wss.close()
  server.close()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

function serveStatic(res: ServerResponse, pathname: string): void {
  const requested = pathname === '/' ? '/index.html' : pathname
  const file = path.normalize(path.join(clientDir, requested))
  if (!file.startsWith(clientDir)) {
    res.writeHead(403)
    res.end()
    return
  }
  if (existsSync(file) && statSync(file).isFile()) {
    const ext = path.extname(file)
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    createReadStream(file).pipe(res)
    return
  }
  const index = path.join(clientDir, 'index.html')
  if (!existsSync(index)) {
    res.writeHead(404)
    res.end('Build the web app first.')
    return
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' })
  createReadStream(index).pipe(res)
}
