'use client'

import { useActionState } from 'react'
import { registerParticipantAction, type RegisterParticipantState } from './actions'

const initialState: RegisterParticipantState = { error: null }

export function EventRegistrationForm({ eventId, price, people }: {
  eventId: string
  price: string
  people: Array<{ id: string; name: string }>
}) {
  const [state, formAction, pending] = useActionState(registerParticipantAction, initialState)

  return <form action={formAction} className="stack-form">
    <input type="hidden" name="event_id" value={eventId} />
    <label>Participante <select name="person_id" required><option value="">Selecione</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
    <label>Preço da inscrição <input name="price" inputMode="decimal" defaultValue={price} /></label>
    {state.error === 'event_full' && <p role="alert">Este evento atingiu a capacidade. Cancele uma inscrição ou aumente a capacidade antes de tentar novamente.</p>}
    {state.error === 'event_not_open' && <p role="alert">Este evento não está aberto para inscrições.</p>}
    <button type="submit" disabled={pending || people.length === 0}>{pending ? 'Inscrevendo…' : 'Inscrever participante'}</button>
  </form>
}
