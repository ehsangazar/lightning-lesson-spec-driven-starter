import { createServer } from 'node:http'
import { createApp } from './app.ts'

/**
 * The only impure layer: sockets, clock, body parsing.
 * Everything worth testing lives in app.ts.
 *
 * Run with: npm start   (requires Node 22.6+ for TypeScript stripping)
 */
const handle = createApp()
const port = Number(process.env.PORT ?? 3000)

const server = createServer((req, res) => {
  const chunks: Buffer[] = []
  req.on('data', (chunk: Buffer) => chunks.push(chunk))
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8')
    let body: unknown
    if (raw) {
      try {
        body = JSON.parse(raw)
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'invalid_json' }))
        return
      }
    }

    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers[key.toLowerCase()] = value
    }

    const result = handle({
      method: req.method ?? 'GET',
      path: new URL(req.url ?? '/', 'http://localhost').pathname,
      headers,
      body,
      ip: req.socket.remoteAddress ?? 'unknown',
      now: Date.now(),
    })

    res.writeHead(result.status, result.headers)
    res.end(JSON.stringify(result.body))
  })
})

server.listen(port, () => {
  console.log(`listening on http://localhost:${port}`)
})
