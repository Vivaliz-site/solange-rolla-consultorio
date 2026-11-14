import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8')

function e2eSupabaseStartStep(source: string): string {
  const match = source.match(/- name: Start and reset isolated local Supabase[\s\S]*?(?=\n      - name: Prepare local E2E environment)/)
  if (!match) throw new Error('CI_E2E_SUPABASE_START_STEP_NOT_FOUND')
  return match[0]
}

describe('CI E2E Supabase startup resilience', () => {
  it('rebuilds an isolated Supabase stack only once when db reset fails, and then fails closed', () => {
    const step = e2eSupabaseStartStep(workflow)
    expect(step).toContain('if ! npx supabase@2.118.0 db reset; then')
    expect(step.match(/npx supabase@2\.118\.0 db reset/g)).toHaveLength(2)
    const retry = step.split('if ! npx supabase@2.118.0 db reset; then')[1]
    expect(retry).toContain('npx supabase@2.118.0 stop --no-backup')
    expect(retry).toContain('sleep 5')
    expect(retry).toContain('npx supabase@2.118.0 start >"$RUNNER_TEMP/supabase-start-reset-retry.log" 2>&1')
    expect(retry).toMatch(/\n\s+npx supabase@2\.118\.0 db reset\n\s+fi/)
    expect(retry).not.toMatch(/db reset\s*\|\|\s*true/)
  })

  it('retries startup exactly once after a transient health-check failure', () => {
    const step = e2eSupabaseStartStep(workflow)
    expect(step).toContain('if ! npx supabase@2.118.0 start >"$RUNNER_TEMP/supabase-start.log" 2>&1; then')
    const firstStage = step.split('if ! npx supabase@2.118.0 db reset; then')[0]
    expect(firstStage.match(/npx supabase@2\.118\.0 start/g)).toHaveLength(2)
    expect(step).toContain('npx supabase@2.118.0 stop --no-backup || true')
    expect(step).toContain('sleep 5')
  })

  it('captures Supabase startup output so local credentials never reach Actions logs', () => {
    const step = e2eSupabaseStartStep(workflow)
    const starts = step.match(/npx supabase@2\.118\.0 start[^\n]*/g) ?? []
    expect(starts).toHaveLength(3)
    expect(starts[0]).toContain('>"$RUNNER_TEMP/supabase-start.log" 2>&1')
    expect(starts[1]).toContain('>"$RUNNER_TEMP/supabase-start-retry.log" 2>&1')
    expect(starts[2]).toContain('>"$RUNNER_TEMP/supabase-start-reset-retry.log" 2>&1')
    expect(step).toContain('trap \'rm -f "$RUNNER_TEMP/supabase-start.log" "$RUNNER_TEMP/supabase-start-retry.log" "$RUNNER_TEMP/supabase-start-reset-retry.log"\' EXIT')
    expect(step).toContain('rm -f "$RUNNER_TEMP/supabase-start.log" "$RUNNER_TEMP/supabase-start-retry.log" "$RUNNER_TEMP/supabase-start-reset-retry.log"')
    expect(step).not.toMatch(/cat .*supabase-start/)
  })
})
