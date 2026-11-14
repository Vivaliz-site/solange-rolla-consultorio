import Link from 'next/link'
import type { EventStatus } from '@/modules/events/public'
import { authorizeStaffSession, getStaffSession } from '@/modules/identity/public'
import { createServerSupabaseClient } from '@/platform/supabase/server'
import { PageHeader } from '@/shared/ui/page-header'
import { addExpenseAction, createEventAction, updateEventAction, updateRegistrationAction } from './actions'
import { EventRegistrationForm } from './registration-form'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const eventStatusLabels: Record<EventStatus, string> = {
  planned: 'Planejado',
  open: 'Aberto',
  full: 'Lotado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}

function local(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`
}

export default async function EventOperationsPage({ searchParams }: {
  searchParams: Promise<{ person_q?: string; error?: string }>
}) {
  const session = await getStaffSession()
  authorizeStaffSession(session, ['psychologist_owner', 'secretary', 'accounting'])
  const params = await searchParams
  const personQuery = (params.person_q ?? '').trim().slice(0, 80)
  const client = await createServerSupabaseClient()
  let peopleQuery = client.from('people').select('id,civil_name,preferred_name').order('civil_name').limit(50)
  if (personQuery) peopleQuery = peopleQuery.or(`civil_name.ilike.%${personQuery.replaceAll(',', '')}%,preferred_name.ilike.%${personQuery.replaceAll(',', '')}%`)
  const [eventsResult, peopleResult, regsResult, expensesResult] = await Promise.all([
    client.from('events').select('id,title,type,starts_at,ends_at,location,modality,capacity,default_price_cents,status').order('starts_at', { ascending: false }).limit(100),
    peopleQuery,
    client.from('event_registrations').select('id,event_id,person_id,price_cents,status,attendance_status,event:events!event_registrations_event_id_fkey(title),person:people!event_registrations_person_id_fkey(civil_name,preferred_name)').order('created_at', { ascending: false }).limit(200),
    client.from('event_expenses').select('id,event_id,description,amount_cents,paid_at').order('created_at', { ascending: false }).limit(100),
  ])
  if (eventsResult.error) throw new Error(`EVENTS_READ_FAILED:${eventsResult.error.code}`)
  if (peopleResult.error) throw new Error(`EVENT_PEOPLE_READ_FAILED:${peopleResult.error.code}`)
  if (regsResult.error) throw new Error(`EVENT_REGISTRATIONS_READ_FAILED:${regsResult.error.code}`)
  if (expensesResult.error) throw new Error(`EVENT_EXPENSES_READ_FAILED:${expensesResult.error.code}`)
  const events = eventsResult.data ?? []
  const people = peopleResult.data ?? []
  const regs = regsResult.data ?? []
  const expenses = expensesResult.data ?? []

  return <>
    <PageHeader title="Operações de eventos" description="Crie eventos, encontre participantes, registre presença, despesas e cobranças em um só fluxo." />
    <p><Link href="/eventos">← Voltar aos eventos</Link></p>
    {params.error === 'event_full' && <p role="alert">Este evento atingiu a capacidade. Cancele uma inscrição ou aumente a capacidade antes de tentar novamente.</p>}
    <section><h2>Novo evento</h2><p>Defina os dados principais do evento. Inscrições e despesas são registradas depois, no card do evento.</p>
      <form action={createEventAction} className="stack-form">
        <label>Título <input name="title" required /></label><label>Descrição <input name="description" /></label>
        <label>Tipo <input name="type" required defaultValue="grupo" /></label>
        <label>Início <input name="starts_at_local" type="datetime-local" required /></label>
        <label>Fim <input name="ends_at_local" type="datetime-local" required /></label>
        <label>Local <input name="location" /></label>
        <label>Modalidade <select name="modality"><option value="in_person">Presencial</option><option value="online">Online</option><option value="hybrid">Híbrido</option></select></label>
        <label>Capacidade <input name="capacity" type="number" min="1" required /></label>
        <label>Preço <input name="price" inputMode="decimal" required defaultValue="0" /></label><button type="submit">Criar evento</button>
      </form>
    </section>
    <section aria-labelledby="participant-search-heading"><h2 id="participant-search-heading">Encontrar participante</h2>
      <p>Pesquise pelo nome antes de fazer uma inscrição. Mostramos no máximo 50 resultados.</p>
      <form method="get" className="stack-form"><label>Nome da pessoa <input name="person_q" defaultValue={personQuery} /></label><button type="submit">Buscar pessoa</button></form>
      {personQuery && people.length === 0 && <p>Nenhuma pessoa encontrada. Cadastre a pessoa em <Link href="/pessoas/nova">Pacientes</Link> e volte para continuar.</p>}
    </section>
    <section><h2>Eventos</h2>{events.map((event) => <article className="card" key={event.id}>
      <h3>{event.title}</h3><p><span className="operational-status">{eventStatusLabels[event.status as EventStatus]}</span> · Capacidade: {event.capacity} · Valor padrão: {money.format(event.default_price_cents / 100)}</p>
      <form action={updateEventAction} className="stack-form"><input type="hidden" name="event_id" value={event.id} />
        <label>Título <input name="title" defaultValue={event.title} required /></label>
        <label>Início <input name="starts_at_local" type="datetime-local" defaultValue={local(event.starts_at)} required /></label>
        <label>Fim <input name="ends_at_local" type="datetime-local" defaultValue={local(event.ends_at)} required /></label>
        <label>Local <input name="location" defaultValue={event.location ?? ''} /></label>
        <label>Modalidade <select name="modality" defaultValue={event.modality}><option value="in_person">Presencial</option><option value="online">Online</option><option value="hybrid">Híbrido</option></select></label>
        <label>Capacidade <input name="capacity" type="number" min="1" defaultValue={event.capacity} required /></label>
        <label>Preço <input name="price" inputMode="decimal" defaultValue={(event.default_price_cents / 100).toFixed(2)} required /></label><button type="submit">Salvar evento</button>
      </form>
      <EventRegistrationForm eventId={event.id} price={(event.default_price_cents / 100).toFixed(2)} people={people.map((person) => ({id:person.id,name:person.preferred_name || person.civil_name}))} />
      <form action={addExpenseAction} className="stack-form"><input type="hidden" name="event_id" value={event.id} /><label>Despesa <input name="description" required /></label><label>Valor <input name="amount" inputMode="decimal" required /></label><label>Pago? <select name="paid"><option value="no">Não</option><option value="yes">Sim</option></select></label><button type="submit">Registrar despesa</button></form>
    </article>)}</section>
    <section><h2>Inscrições</h2>{regs.map((registration) => <form className="card stack-form" action={updateRegistrationAction} key={registration.id}>
      <input type="hidden" name="registration_id" value={registration.id} /><p><strong>{registration.event?.title} — {registration.person?.preferred_name || registration.person?.civil_name}</strong><br />Valor: {money.format(registration.price_cents / 100)}</p>
      <label>Status <select name="status" defaultValue={registration.status}><option value="confirmed">Confirmado</option><option value="pending_payment">Pagamento pendente</option><option value="waitlisted">Lista de espera</option><option value="cancelled">Cancelado</option></select></label>
      <label>Presença <select name="attendance_status" defaultValue={registration.attendance_status}><option value="unknown">Não marcada</option><option value="present">Presente</option><option value="absent">Ausente</option></select></label><button type="submit">Atualizar inscrição</button>
    </form>)}</section>
    <section><h2>Despesas registradas</h2><ul>{expenses.map((expense) => <li key={expense.id}>{expense.description} — {money.format(expense.amount_cents / 100)} {expense.paid_at ? '(paga)' : '(pendente)'}</li>)}</ul></section>
  </>
}
