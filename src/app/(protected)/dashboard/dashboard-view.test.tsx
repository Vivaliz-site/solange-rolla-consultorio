import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DashboardView } from './dashboard-view'

describe('DashboardView', () => {
  it('renders operational totals with patient-centric copy and messaging failures for operations staff', () => {
    const html = renderToStaticMarkup(<DashboardView
      upcomingAppointments={3}
      openReceivablesCents={90000}
      upcomingEvents={1}
      peopleCount={3}
      failedMessages={2}
      canViewMessaging
    />)
    expect(html).toContain('3 consultas')
    expect(html).toContain('R$ 900,00')
    expect(html).toContain('1 evento')
    expect(html).toContain('3 pacientes')
    expect(html).toContain('Abrir pacientes')
    expect(html).toContain('href="/pessoas"')
    expect(html).toContain('2 falhas')
    expect(html).toContain('href="/mensageria"')
  })

  it('does not expose the messaging operations entry point to accounting', () => {
    const html = renderToStaticMarkup(<DashboardView
      upcomingAppointments={0}
      openReceivablesCents={0}
      upcomingEvents={0}
      peopleCount={0}
      failedMessages={3}
      canViewMessaging={false}
    />)

    expect(html).not.toContain('href="/mensageria"')
  })
})
