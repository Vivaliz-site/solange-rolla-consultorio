import Link from 'next/link'
import { redirect } from 'next/navigation'
import { authorizeStaffPermission, authorizeStaffSession, getStaffSession } from '@/modules/identity/public'
import { LabelMaker } from '@/modules/labels/public'
import { PageHeader } from '@/shared/ui/page-header'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function LabelsPage() {
  const session = await getStaffSession()
  if (!session) redirect('/login')
  authorizeStaffSession(session, ['psychologist_owner', 'secretary'])
  authorizeStaffPermission(session, 'events.read')
  return <>
    <PageHeader
      title="Etiquetas para eventos"
      description="Monte folhas A4 Link 9027 com 15 etiquetas circulares de 52 mm. Os nomes ficam apenas neste navegador."
      actions={<Link className="ui-button ui-button--outline" href="/etiquetas/ajuda">Ajuda e manual</Link>}
    />
    <LabelMaker storageKey={'solange-etiquetas-9027:' + session.userId} />
  </>
}
