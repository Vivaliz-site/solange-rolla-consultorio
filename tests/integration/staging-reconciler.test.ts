import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const script = readFileSync('ops/staging/reconcile-demo.sh', 'utf8')

describe('staging demo reconciler', () => {
  it('updates only the public app URL when the quick tunnel changes', () => {
    expect(script).toContain('APP_URL=')
    expect(script).not.toContain('NEXT_PUBLIC_SUPABASE_URL=.*$url')
  })

  it('restarts the configured web process without rebuilding the deployed SHA', () => {
    expect(script).toContain('WEB=solange-client-demo-web')
    expect(script).toContain('docker restart "$WEB"')
    expect(script).not.toContain('npm run build')
  })
})
