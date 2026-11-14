import Link from 'next/link'
import { Card, CardDescription, CardTitle } from '../../../shared/ui/card'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function DashboardView({
  upcomingAppointments,
  openReceivablesCents,
  upcomingEvents,
  peopleCount,
  failedMessages,
  canViewMessaging,
}: {
  upcomingAppointments: number
  openReceivablesCents: number
  upcomingEvents: number
  peopleCount: number
  failedMessages: number
  canViewMessaging: boolean
}) {
  return <div className="dashboard-grid">
    <Link className="dashboard-card-link" href="/agenda" aria-label="Abrir agenda">
      <Card>
        <CardTitle>Próximas consultas</CardTitle>
        <CardDescription>Agenda dos próximos 7 dias.</CardDescription>
        <strong>{upcomingAppointments} consultas</strong>
      </Card>
    </Link>
    <Link className="dashboard-card-link" href="/financeiro" aria-label="Abrir financeiro">
      <Card>
        <CardTitle>Contas a receber</CardTitle>
        <CardDescription>Saldo lançado ainda em aberto.</CardDescription>
        <strong>{money.format(openReceivablesCents / 100)}</strong>
      </Card>
    </Link>
    <Link className="dashboard-card-link" href="/eventos" aria-label="Abrir eventos">
      <Card>
        <CardTitle>Eventos</CardTitle>
        <CardDescription>Eventos futuros cadastrados.</CardDescription>
        <strong>{upcomingEvents} evento{upcomingEvents === 1 ? '' : 's'}</strong>
      </Card>
    </Link>
    <Link className="dashboard-card-link" href="/pessoas" aria-label="Abrir pacientes">
      <Card>
        <CardTitle>Pacientes</CardTitle>
        <CardDescription>Cadastros disponíveis para atendimento.</CardDescription>
        <strong>{peopleCount} paciente{peopleCount === 1 ? '' : 's'}</strong>
      </Card>
    </Link>
    {canViewMessaging
      ? <Link className="dashboard-card-link" href="/mensageria" aria-label="Abrir falhas de mensageria">
          <Card>
            <CardTitle>Falhas de comunicação</CardTitle>
            <CardDescription>Envios ou entregas que precisam de acompanhamento.</CardDescription>
            <strong>{failedMessages} falha{failedMessages === 1 ? '' : 's'}</strong>
          </Card>
        </Link>
      : null}
  </div>
}
