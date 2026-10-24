import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const brand = join(root, 'src/assets/brand')
const indigo = { r: 0x14, g: 0x01, b: 0x47, alpha: 1 }
const runnerSvg = readFileSync(join(brand, 'runner.svg'))
const heroSvg = readFileSync(join(brand, 'art1.svg'))
const runnerText = readFileSync(join(brand, 'runner.svg'), 'utf8')
const viewBox = runnerText.match(/viewBox="([^"]+)"/)[1]
const inner = runnerText.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#140147"/>
  <svg x="86" y="86" width="340" height="340" viewBox="${viewBox}">${inner}</svg>
</svg>`
writeFileSync(join(root, 'public/favicon.svg'), favicon)

async function squareIcon(size) {
  const mark = Math.round(size * 0.66)
  const runner = await sharp(runnerSvg)
    .resize(mark, mark, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background: indigo } })
    .composite([{ input: runner, gravity: 'centre' }])
    .png()
    .toBuffer()
}

await sharp(await squareIcon(192)).toFile(join(root, 'public/icon-192.png'))
await sharp(await squareIcon(512)).toFile(join(root, 'public/icon-512.png'))

const densities = {
  mdpi: { launcher: 48, foreground: 108 },
  hdpi: { launcher: 72, foreground: 162 },
  xhdpi: { launcher: 96, foreground: 216 },
  xxhdpi: { launcher: 144, foreground: 324 },
  xxxhdpi: { launcher: 192, foreground: 432 },
}

async function foreground(size) {
  const mark = Math.round(size * 0.62)
  const runner = await sharp(runnerSvg)
    .resize(mark, mark, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: runner, gravity: 'centre' }])
    .png()
    .toBuffer()
}

async function roundIcon(size) {
  const base = await squareIcon(size)
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  )
  return sharp(base).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
}

const res = join(root, 'android/app/src/main/res')
for (const [density, { launcher, foreground: fg }] of Object.entries(densities)) {
  const dir = join(res, `mipmap-${density}`)
  mkdirSync(dir, { recursive: true })
  await sharp(await squareIcon(launcher)).toFile(join(dir, 'ic_launcher.png'))
  await sharp(await roundIcon(launcher)).toFile(join(dir, 'ic_launcher_round.png'))
  await sharp(await foreground(fg)).toFile(join(dir, 'ic_launcher_foreground.png'))
}

const splashes = [
  ['drawable/splash.png', 480, 320],
  ['drawable-port-mdpi/splash.png', 320, 480],
  ['drawable-port-hdpi/splash.png', 480, 800],
  ['drawable-port-xhdpi/splash.png', 720, 1280],
  ['drawable-port-xxhdpi/splash.png', 960, 1600],
  ['drawable-port-xxxhdpi/splash.png', 1280, 1920],
  ['drawable-land-mdpi/splash.png', 480, 320],
  ['drawable-land-hdpi/splash.png', 800, 480],
  ['drawable-land-xhdpi/splash.png', 1280, 720],
  ['drawable-land-xxhdpi/splash.png', 1600, 960],
  ['drawable-land-xxxhdpi/splash.png', 1920, 1280],
]

for (const [rel, width, height] of splashes) {
  const pad = Math.round(Math.min(width, height) * 0.08)
  const side = Math.min(width, height) - pad * 2
  const hero = await sharp(heroSvg)
    .resize(side, side, { fit: 'contain', background: indigo })
    .png()
    .toBuffer()
  const dest = join(res, rel)
  mkdirSync(dirname(dest), { recursive: true })
  await sharp({ create: { width, height, channels: 4, background: indigo } })
    .composite([{ input: hero, gravity: 'centre' }])
    .png()
    .toFile(dest)
}

console.log('wrote favicon, PWA icons, launcher mipmaps, and splash screens')
