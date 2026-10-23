import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const dir = dirname(fileURLToPath(import.meta.url))
const svg = readFileSync(join(dir, '../public/favicon.svg'))
await sharp(svg).resize(192, 192).png().toFile(join(dir, '../public/icon-192.png'))
await sharp(svg).resize(512, 512).png().toFile(join(dir, '../public/icon-512.png'))
console.log('wrote icon-192.png and icon-512.png')
