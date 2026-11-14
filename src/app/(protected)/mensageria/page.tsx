import { redirect } from 'next/navigation'
import { authorizeStaffSession, getStaffSession } from '@/modules/identity/public'
import { createServerSupabaseClient } from '@/platform/supabase/server'
import { Card, CardDescription, CardTitle } from '@/shared/ui/card'
import { PageHeader } from '@/shared/ui/page-header'

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function MessagingOperationsPage() {
  const session = await getStaffSession()
  if (!session) redirect('/login')
  authorizeStaffSession(session, ['psychologist_owner', 'secretary'])

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('outbound_messages')
    .select('id,channel,status,provider_delivery_status,provider_delivery_updated_at,created_at')
    .or('status.eq.failed,provider_delivery_status.eq.failed')
    .order('provider_delivery_updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(`MESSAGING_FAILURES_READ_FAILED:${error.code}`)

  return <>
    <PageHeader
      title="Mensageria"
      description="Falhas administrativas de entrega que precisam de acompanhamento."
    />
    <Card>
      <CardTitle>Falhas de comunicação</CardTitle>
      <CardDescription>
        Somente metadados operacionais são exibidos; destinatário, payload e conteúdo da mensagem permanecem ocultos.
      </CardDescription>
      {(data ?? []).length === 0
        ? <p>Nenhuma falha de entrega pendente.</p>
        : <ul>
            {(data ?? []).map((message) => {
              const occurredAt = message.provider_delivery_updated_at ?? message.created_at
              const channel = message.channel === 'whatsapp' ? 'WhatsApp' : 'E-mail'
              const state = message.provider_delivery_status === 'failed'
                ? 'Falha confirmada pelo provider'
                : 'Falha de envio'
              return <li key={message.id}>
                <strong>{channel}</strong> · {state} · {dateTime.format(new Date(occurredAt))}
              </li>
            })}
          </ul>}
    </Card>
  </>
}
