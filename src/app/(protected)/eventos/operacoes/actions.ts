'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { authorizeStaffSession, getStaffSession } from '@/modules/identity/public'
import { createServerSupabaseClient } from '@/platform/supabase/server'
import { saoPauloLocalToIso } from '@/shared/kernel/time/sao-paulo'

function txt(formData: FormData, key: string): string { const v = String(formData.get(key) ?? '').trim(); if (!v) throw new Error(`EVENT_${key.toUpperCase()}_REQUIRED`); return v }
function cents(value: FormDataEntryValue | null): number { const n = Math.round(Number(String(value ?? '').replace(',', '.')) * 100); if (!Number.isSafeInteger(n) || n < 0) throw new Error('EVENT_INVALID_AMOUNT'); return n }
function localIso(value: string): string { try { return saoPauloLocalToIso(value) } catch { throw new Error('EVENT_INVALID_TIME') } }
async function ctx(roles: Array<'psychologist_owner'|'secretary'|'accounting'>) { const s = await getStaffSession(); const a = authorizeStaffSession(s, roles); return { a, client: await createServerSupabaseClient() } }
export async function createEventAction(formData: FormData) { const { client } = await ctx(['psychologist_owner','secretary']); const startsAt = localIso(txt(formData,'starts_at_local')); const endsAt = localIso(txt(formData,'ends_at_local')); if (endsAt <= startsAt) throw new Error('EVENT_INVALID_INTERVAL'); const capacity = Number(txt(formData,'capacity')); if (!Number.isInteger(capacity) || capacity <= 0) throw new Error('EVENT_INVALID_CAPACITY'); const { data, error } = await client.rpc('create_event_atomic',{p_title:txt(formData,'title'),p_description:String(formData.get('description') ?? ''),p_type:txt(formData,'type'),p_starts_at:startsAt,p_ends_at:endsAt,p_location:String(formData.get('location') ?? ''),p_modality:txt(formData,'modality'),p_capacity:capacity,p_default_price_cents:cents(formData.get('price'))}); if (error || !data) throw new Error('EVENT_CREATE_FAILED'); redirect('/eventos/operacoes') }
export async function updateEventAction(formData: FormData) { const { client } = await ctx(['psychologist_owner','secretary']); const id = txt(formData,'event_id'); const startsAt = localIso(txt(formData,'starts_at_local')); const endsAt = localIso(txt(formData,'ends_at_local')); if(endsAt<=startsAt) throw new Error('EVENT_INVALID_INTERVAL'); const capacity = Number(txt(formData,'capacity')); if(!Number.isInteger(capacity)||capacity<=0) throw new Error('EVENT_INVALID_CAPACITY'); const { count, error: countError } = await client.from('event_registrations').select('id',{count:'exact',head:true}).eq('event_id',id).neq('status','cancelled'); if (countError) throw new Error(`EVENT_REGISTRATION_COUNT_FAILED:${countError.code}`); if ((count ?? 0) > capacity) throw new Error('EVENT_CAPACITY_BELOW_REGISTRATIONS'); const { error } = await client.rpc('update_event_atomic',{p_event_id:id,p_title:txt(formData,'title'),p_starts_at:startsAt,p_ends_at:endsAt,p_capacity:capacity,p_modality:txt(formData,'modality'),p_location:String(formData.get('location') ?? ''),p_default_price_cents:cents(formData.get('price'))}); if(error) throw new Error('EVENT_UPDATE_FAILED'); redirect('/eventos/operacoes') }
type EventRegistrationRpc = (name: 'register_event_participant_atomic', args: { p_event_id: string; p_person_id: string; p_price_cents: number; p_status: string }) => PromiseLike<{ data: string[] | null; error: { code: string; message: string } | null }>

export type RegisterParticipantState = { error: 'event_full' | 'event_not_open' | null }

export async function registerParticipantAction(_previousState: RegisterParticipantState, formData: FormData): Promise<RegisterParticipantState> { const { client } = await ctx(['psychologist_owner','secretary']); const eventId = txt(formData,'event_id'); const personId = txt(formData,'person_id'); const { data: event, error: eventError } = await client.from('events').select('default_price_cents,capacity').eq('id',eventId).single(); if(eventError) throw new Error(`EVENT_READ_FAILED:${eventError.code}`); if(!event) throw new Error('EVENT_NOT_OPEN'); const { count: registrationCount, error: registrationCountError } = await client.from('event_registrations').select('id',{count:'exact',head:true}).eq('event_id',eventId).neq('status','cancelled'); if(registrationCountError) throw new Error(`EVENT_REGISTRATION_COUNT_FAILED:${registrationCountError.code}`); if((registrationCount ?? 0) >= event.capacity) return {error:'event_full'}; const priceCents = formData.get('price') ? cents(formData.get('price')) : event.default_price_cents; const status = priceCents > 0 ? 'pending_payment' : 'confirmed'; const eventRpc = client.rpc.bind(client) as unknown as EventRegistrationRpc; const { data: registrationIds, error } = await eventRpc('register_event_participant_atomic',{p_event_id:eventId,p_person_id:personId,p_price_cents:priceCents,p_status:status}); if(error){ if(error.message.includes('EVENT_FULL')) return {error:'event_full'}; if(error.message.includes('EVENT_NOT_OPEN')) return {error:'event_not_open'}; throw new Error(`EVENT_REGISTRATION_FAILED:${error.code}`) } const registrationId = registrationIds?.[0]; if(!registrationId) throw new Error('EVENT_REGISTRATION_FAILED'); revalidatePath('/eventos/operacoes'); return {error:null} }
export async function updateRegistrationAction(formData: FormData) { const { client } = await ctx(['psychologist_owner','secretary']); const id=txt(formData,'registration_id'); const status=txt(formData,'status'); const attendance=txt(formData,'attendance_status'); if(!['confirmed','pending_payment','waitlisted','cancelled'].includes(status)||!['present','absent','unknown'].includes(attendance)) throw new Error('EVENT_REGISTRATION_STATE_INVALID'); const { error }=await client.rpc('update_event_registration_atomic',{p_registration_id:id,p_status:status,p_attendance_status:attendance}); if(error) throw new Error('EVENT_REGISTRATION_UPDATE_FAILED'); redirect('/eventos/operacoes') }
export async function addExpenseAction(formData: FormData) {
  const { client } = await ctx(['psychologist_owner','accounting'])
  const eventId = txt(formData,'event_id')
  const description = txt(formData,'description')
  const amountCents = cents(formData.get('amount'))
  if (amountCents <= 0) throw new Error('EVENT_EXPENSE_INVALID')
  const paidAt = formData.get('paid') === 'yes' ? new Date().toISOString() : undefined
  const { error } = await client.rpc('create_event_expense_atomic', {
    p_event_id: eventId,
    p_description: description,
    p_amount_cents: amountCents,
    ...(paidAt ? { p_paid_at: paidAt } : {}),
  })
  if (error) throw new Error('EVENT_EXPENSE_FAILED')
  redirect('/eventos/operacoes')
}
