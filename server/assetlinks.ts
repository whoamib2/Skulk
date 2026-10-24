import { SKULK_ANDROID_PACKAGE } from '../shared/appLink.ts'

/**
 * SHA-256 fingerprints of the certificates that may sign app.skulk.game.
 * Play app signing key, then the upload key, then the local debug key.
 */
export const SHA256_CERT_FINGERPRINTS = [
  'B0:C3:00:39:E3:79:D1:DE:52:5F:AE:91:47:9D:31:E4:80:81:CE:8D:A0:D2:19:1D:06:EA:F8:C1:E3:92:12:9C',
  '3A:E3:67:E1:7B:7D:46:4A:B7:85:4F:60:E5:BB:41:D6:9C:DD:30:F3:63:AE:63:26:08:8E:06:E7:86:0F:FA:3A',
  '06:5D:A7:75:66:7B:E8:33:27:B6:86:42:2A:BD:79:A8:B5:D6:EC:3D:BD:DC:C6:0B:AF:D1:18:1E:D8:30:C0:42',
] as const

export function assetLinksBody(): string {
  return JSON.stringify([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: SKULK_ANDROID_PACKAGE,
        sha256_cert_fingerprints: [...SHA256_CERT_FINGERPRINTS],
      },
    },
  ])
}
