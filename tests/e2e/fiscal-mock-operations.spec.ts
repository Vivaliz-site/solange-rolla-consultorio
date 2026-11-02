import { execFileSync } from 'node:child_process'
import { randomInt, randomUUID } from 'node:crypto'
import { expect, test } from './fixtures'
import { signInDemo } from './demo-auth'
const dbUrl=process.env.DB_URL??''; if(!dbUrl) throw new Error('local Supabase DB_URL is required')
function sql(s:string){return execFileSync('psql',[dbUrl,'-At','-v','ON_ERROR_STOP=1','-c',s],{encoding:'utf8'}).trim()} function q(v:string){return `'${v.replaceAll("'","''")}'`}

// A new, valid synthetic CPF per attempt prevents retries from colliding with
// an earlier UI/SQL fixture. This is never a real patient identifier.
function syntheticCpf(): string {
  const digits = [...String(randomInt(100_000_000, 1_000_000_000))].map(Number)
  for (const factor of [10, 11]) {
    const remainder = digits.reduce((sum, digit, index) => sum + digit * (factor - index), 0) % 11
    digits.push(remainder < 2 ? 0 : 11 - remainder)
  }
  return digits.join('')
}

test('accounting flow issues and cancels a synthetic mock NFS-e with private artifacts',async({page})=>{
 const personId=randomUUID(), profileId=randomUUID(), sourceId=randomUUID(), personCpf=syntheticCpf(); sql(`insert into public.people(id,civil_name,birth_date,cpf_normalized,preferred_channel,birthday_messages_enabled,fiscal_address) values(${q(personId)},'Tomador Fiscal','1990-01-01',${q(personCpf)},'none',false,'{"street":"Teste","city":"Divinopolis"}'::jsonb)`); sql(`insert into public.fiscal_profiles(id,version,issuer_kind,issuer_document,municipality_code,service_code,tax_regime,fiscal_address,effective_from,active) values(${q(profileId)},99,'individual',${q(personCpf)},'3122306','8650002','pf','{"city":"Divinopolis"}'::jsonb,'2026-01-01',true)`); const treatmentId=sql(`select id from public.fiscal_treatments where source_kind='event_registration' order by version desc limit 1`)
 await signInDemo(page); await page.goto('/fiscal/operacoes',{waitUntil:'domcontentloaded'}); const form=page.locator('form').filter({has:page.getByRole('button',{name:'Emitir NFS-e mock'})}); await form.locator('select[name="source_type"]').selectOption('event_registration'); await form.locator('input[name="source_id"]').fill(sourceId); await form.locator('select[name="person_id"]').selectOption(personId); await form.locator('select[name="payer_person_id"]').selectOption(personId); await form.locator('input[name="amount"]').fill('250.00'); await form.locator('select[name="profile_id"]').selectOption(profileId); await form.locator('select[name="treatment_id"]').selectOption(treatmentId); await form.locator('input[name="review_ack"]').check(); await form.getByRole('button',{name:'Emitir NFS-e mock'}).click(); await expect.poll(()=>sql(`select id from public.fiscal_documents where source_id=${q(sourceId)} and provider='mock'`),{timeout:15_000}).not.toBe(''); const docId=sql(`select id from public.fiscal_documents where source_id=${q(sourceId)} and provider='mock'`); await expect.poll(()=>sql(`select status||'|'||provider||'|'||(xml_path is not null)::text||'|'||(pdf_path is not null)::text from public.fiscal_documents where id=${q(docId)}`)).toBe('issued|mock|true|true'); await expect.poll(()=>sql(`select count(*) from storage.objects where bucket_id='fiscal-documents-private' and name like ${q(`${docId}/%`)}`)).toBe('2'); await expect.poll(()=>sql(`select count(*) from public.audit_events where action='fiscal.mock_issued' and entity_id=${q(docId)}`)).toBe('1')
 const cancel=page.locator('form').filter({has:page.locator(`input[name="fiscal_document_id"][value="${docId}"]`)}); await cancel.locator('input[name="reason"]').fill('Cancelamento de homologação'); await cancel.getByRole('button',{name:'Cancelar NFS-e mock'}).click(); await expect.poll(()=>sql(`select status from public.fiscal_documents where id=${q(docId)}`)).toBe('cancelled'); await expect.poll(()=>sql(`select count(*) from public.fiscal_cancellation_events where fiscal_document_id=${q(docId)} and status='cancelled'`)).toBe('1')
})
