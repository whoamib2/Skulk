import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SKULK_ANDROID_PACKAGE } from '../shared/appLink.ts'
import { SHA256_CERT_FINGERPRINTS, assetLinksBody } from './assetlinks.ts'

describe('assetlinks.json', () => {
  it('lists the Play, upload, and debug certificates for the Skulk package', () => {
    const statements = JSON.parse(assetLinksBody()) as Array<{
      relation: string[]
      target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] }
    }>
    expect(statements).toHaveLength(1)
    expect(statements[0]?.relation).toEqual(['delegate_permission/common.handle_all_urls'])
    expect(statements[0]?.target.namespace).toBe('android_app')
    expect(statements[0]?.target.package_name).toBe(SKULK_ANDROID_PACKAGE)
    expect(statements[0]?.target.sha256_cert_fingerprints).toEqual([...SHA256_CERT_FINGERPRINTS])
    for (const fingerprint of statements[0]?.target.sha256_cert_fingerprints ?? []) {
      expect(fingerprint).toMatch(/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/)
    }
  })

  it('is served at /.well-known/assetlinks.json as JSON with no redirect', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
    const routeAt = source.indexOf("url.pathname === '/.well-known/assetlinks.json'")
    const staticAt = source.indexOf('serveStatic')
    expect(routeAt).toBeGreaterThan(-1)
    expect(staticAt).toBeGreaterThan(routeAt)
    const route = source.slice(routeAt, routeAt + 400)
    expect(route).toContain('200')
    expect(route).toContain("'content-type': 'application/json'")
    expect(route).not.toMatch(/30[1278]|location/i)
  })
})
