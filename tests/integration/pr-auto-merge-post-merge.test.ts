import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(join(process.cwd(), '.github/workflows/pr-auto-merge.yml'), 'utf8')

describe('post-merge main revalidation', () => {
  it('revalidates main when another trusted mechanism already merged the exact PR head', () => {
    expect(workflow).toContain('select(.merged_at != null)')
    expect(workflow).toContain('merged_main_sha=')
    expect(workflow).toContain("steps.pr.outputs.pr_number != '' || steps.pr.outputs.merged_main_sha != ''")
  })

  it('handles a PR merged by another executor between the initial lookup and the final readback', () => {
    expect(workflow).toContain('if ! jq -e --arg sha "$HEAD_SHA"')
    expect(workflow).toContain('already_merged_sha="$(jq -r --arg sha "$HEAD_SHA"')
    expect(workflow).toContain('echo "merged_main_sha=$already_merged_sha" >> "$GITHUB_OUTPUT"')
    expect(workflow).toContain('changed while checks were evaluated; skip stale candidate.')
    expect(workflow).toContain('exit 0')
  })

  it('does not repeatedly dispatch the same exact main SHA', () => {
    expect(workflow).toContain('event=workflow_dispatch')
    expect(workflow).toContain('Skipping already-dispatched')
  })
})
