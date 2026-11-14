import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  authorizeStaffPermission,
  authorizeStaffSession,
  getStaffSession,
  isActiveStaffWithRole,
  listActiveStaffByRole,
  type StaffDirectoryRepository,
} from '@/modules/identity/public'
import {
  normalizeCpf,
  normalizeEmail,
  normalizePhoneE164BR,
  type PersonId,
} from '@/modules/people/public'
import {
  PersonForm,
  type PersonFormState,
  type PersonFormValues,
} from '@/modules/people/ui/person-form'
import {
  createSecretaryHandoffTask,
  SECRETARY_HANDOFF_TASK_TYPES,
  type SecretaryHandoffTaskType,
} from '@/modules/tasks/public'
import { createServerSupabaseClient } from '@/platform/supabase/server'
import { PageHeader } from '@/shared/ui/page-header'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const relationshipKinds = ['legal_guardian', 'financial_responsible', 'fiscal_taker'] as const

type RelationshipKind = typeof relationshipKinds[number]
type FiscalAddress = {
  street?: string
  number?: string
  complement?: string
  district?: string
  city?: string
  state?: string
  postalCode?: string
}
type DatabaseError = { code?: string; message?: string }
type PersonRowWithEmergency = {
  id: string
  civil_name: string
  preferred_name: string | null
  birth_date: string
  cpf_normalized: string | null
  email_normalized: string | null
  phone_e164: string | null
  preferred_channel: string
  birthday_messages_enabled: boolean
  emergency_contact_name: string | null
  emergency_contact_phone_e164: string | null
  emergency_contact_relationship: string | null
  fiscal_address: unknown
}
type PeopleUpdateWithEmergency = {
  update(values: Record<string, unknown>): {
    eq(column: string, value: string): Promise<{ error: DatabaseError | null }>
  }
}
type PeopleSelectWithEmergency = {
  select(columns: string): {
    eq(column: string, value: string): {
      maybeSingle(): Promise<{ data: PersonRowWithEmergency | null; error: DatabaseError | null }>
    }
  }
}

function isRelationshipKind(value: string): value is RelationshipKind {
  return relationshipKinds.includes(value as RelationshipKind)
}

function formValues(formData: FormData): PersonFormValues {
  const preferredChannel = String(formData.get('preferred_channel') ?? 'none')
  return {
    civil_name: String(formData.get('civil_name') ?? ''),
    preferred_name: String(formData.get('preferred_name') ?? ''),
    birth_date: String(formData.get('birth_date') ?? ''),
    cpf: String(formData.get('cpf') ?? ''),
    email: String(formData.get('email') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    preferred_channel: ['whatsapp', 'email', 'phone', 'none'].includes(preferredChannel)
      ? preferredChannel as PersonFormValues['preferred_channel']
      : 'none',
    birthday_messages_enabled: formData.get('birthday_messages_enabled') === 'on',
    emergency_contact_name: String(formData.get('emergency_contact_name') ?? ''),
    emergency_contact_phone: String(formData.get('emergency_contact_phone') ?? ''),
    emergency_contact_relationship: String(formData.get('emergency_contact_relationship') ?? ''),
    fiscal_street: String(formData.get('fiscal_street') ?? ''),
    fiscal_number: String(formData.get('fiscal_number') ?? ''),
    fiscal_complement: String(formData.get('fiscal_complement') ?? ''),
    fiscal_district: String(formData.get('fiscal_district') ?? ''),
    fiscal_city: String(formData.get('fiscal_city') ?? ''),
    fiscal_state: String(formData.get('fiscal_state') ?? ''),
    fiscal_postal_code: String(formData.get('fiscal_postal_code') ?? ''),
  }
}

function fiscalAddress(values: PersonFormValues) {
  const address = {
    street: values.fiscal_street.trim(),
    number: values.fiscal_number.trim(),
    complement: values.fiscal_complement.trim(),
    district: values.fiscal_district.trim(),
    city: values.fiscal_city.trim(),
    state: values.fiscal_state.trim().toUpperCase(),
    postalCode: values.fiscal_postal_code.replace(/\D/g, ''),
  }
  const required = [address.street, address.number, address.district, address.city, address.state, address.postalCode]
  if (required.every((entry) => !entry) && !address.complement) return { ok: true as const, value: {} }
  if (!values.cpf.trim()) return { ok: false as const, error: 'Informe o CPF para preparar a emissão fiscal.' }
  if (required.some((entry) => !entry)) return { ok: false as const, error: 'Preencha o endereço fiscal completo ou deixe todos os campos em branco.' }
  if (!/^[A-Z]{2}$/.test(address.state) || !/^\d{8}$/.test(address.postalCode)) return { ok: false as const, error: 'Confira a UF (2 letras) e o CEP (8 números).' }
  return { ok: true as const, value: address }
}

function emergencyContact(values: PersonFormValues) {
  const name = values.emergency_contact_name.trim()
  const phone = values.emergency_contact_phone.trim()
  const relationship = values.emergency_contact_relationship.trim()
  if (!name && !phone && !relationship) return { ok: true as const, value: { name: null, phone: null, relationship: null } }
  if (!name || !phone) return { ok: false as const, error: 'Informe nome e telefone válidos para o contato de emergência, ou deixe todos os campos em branco.' }
  try {
    return {
      ok: true as const,
      value: {
        name,
        phone: normalizePhoneE164BR(phone),
        relationship: relationship || null,
      },
    }
  } catch {
    return { ok: false as const, error: 'Informe nome e telefone válidos para o contato de emergência, ou deixe todos os campos em branco.' }
  }
}

async function requirePatientPermission(permission: 'patients.read' | 'patients.update' | 'patients.relationships.manage') {
  const session = await getStaffSession()
  if (!session) redirect('/login')
  authorizeStaffPermission(session, permission)
  return session
}

async function savePatientAction(personId: string, previous: PersonFormState, formData: FormData): Promise<PersonFormState> {
  'use server'
  await requirePatientPermission('patients.update')
  const values = formValues(formData)
  const invalid = (error: string): PersonFormState => ({ revision: previous.revision + 1, error, success: false, values })
  const fiscal = fiscalAddress(values)
  if (!fiscal.ok) return invalid(fiscal.error)
  const emergency = emergencyContact(values)
  if (!emergency.ok) return invalid(emergency.error)

  let cpf: string | null = null
  let email: string | null = null
  let phone: string | null = null
  try {
    cpf = values.cpf.trim() ? normalizeCpf(values.cpf) : null
    email = values.email.trim() ? normalizeEmail(values.email) : null
    phone = values.phone.trim() ? normalizePhoneE164BR(values.phone) : null
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_CPF') return invalid('Informe um CPF válido.')
    return invalid('Confira os dados de contato informados.')
  }

  const client = await createServerSupabaseClient()
  const { error } = await (client.from('people') as unknown as PeopleUpdateWithEmergency).update({
    civil_name: values.civil_name.trim(),
    preferred_name: values.preferred_name.trim() || null,
    birth_date: values.birth_date,
    cpf_normalized: cpf,
    email_normalized: email,
    phone_e164: phone,
    preferred_channel: values.preferred_channel,
    birthday_messages_enabled: values.birthday_messages_enabled,
    emergency_contact_name: emergency.value.name,
    emergency_contact_phone_e164: emergency.value.phone,
    emergency_contact_relationship: emergency.value.relationship,
    fiscal_address: fiscal.value,
  }).eq('id', personId)

  if (error?.code === '23505') return invalid('CPF, e-mail ou telefone já pertence a outro cadastro.')
  if (error) return invalid('Não foi possível salvar o cadastro. Tente novamente.')
  return { revision: previous.revision + 1, error: null, success: true, values }
}

async function addRelationshipAction(formData: FormData) {
  'use server'
  await requirePatientPermission('patients.relationships.manage')
  const client = await createServerSupabaseClient()
  const personId = String(formData.get('person_id') ?? '')
  const relatedPersonId = String(formData.get('related_person_id') ?? '')
  const kind = String(formData.get('relationship_kind') ?? '')
  if (!personId || !relatedPersonId || personId === relatedPersonId || !isRelationshipKind(kind)) {
    redirect(`/pessoas/${personId}/gerenciar?error=relationship_invalid`)
  }
  const { error } = await client.from('person_relationships').insert({
    person_id: personId,
    related_person_id: relatedPersonId,
    relationship_kind: kind,
  })
  if (error && error.code !== '23505') redirect(`/pessoas/${personId}/gerenciar?error=relationship_failed`)
  redirect(`/pessoas/${personId}/gerenciar?status=relationship_added`)
}

async function removeRelationshipAction(formData: FormData) {
  'use server'
  await requirePatientPermission('patients.relationships.manage')
  const personId = String(formData.get('person_id') ?? '')
  const relationshipId = String(formData.get('relationship_id') ?? '')
  if (!personId || !relationshipId) redirect(`/pessoas/${personId}/gerenciar?error=relationship_invalid`)
  const client = await createServerSupabaseClient()
  const { error } = await client.from('person_relationships').delete().eq('id', relationshipId).eq('person_id', personId)
  if (error) redirect(`/pessoas/${personId}/gerenciar?error=relationship_failed`)
  redirect(`/pessoas/${personId}/gerenciar?status=relationship_removed`)
}

function isSecretaryHandoffTaskType(value: string): value is SecretaryHandoffTaskType {
  return (SECRETARY_HANDOFF_TASK_TYPES as readonly string[]).includes(value)
}

async function createHandoffAction(formData: FormData) {
  'use server'
  const session = await getStaffSession()
  const authorizedSession = authorizeStaffSession(session, ['secretary', 'psychologist_owner'])
  authorizeStaffPermission(session, 'tasks.create')
  authorizeStaffPermission(session, 'tasks.assign')
  const client = await createServerSupabaseClient()
  const personId = String(formData.get('person_id') ?? '')
  const assignedToUserId = String(formData.get('assigned_to_user_id') ?? '')
  const rawType = String(formData.get('handoff_type') ?? '')
  if (!isSecretaryHandoffTaskType(rawType)) throw new Error('HANDOFF_TYPE_INVALID')

  const staffDirectory: Pick<StaffDirectoryRepository, 'findByUserId'> = {
    async findByUserId(userId) {
      const { data } = await client
        .from('profiles')
        .select('user_id, role, active')
        .eq('user_id', userId)
        .maybeSingle()
      if (!data) return null
      return { userId: data.user_id, role: data.role, active: data.active }
    },
  }

  await createSecretaryHandoffTask(
    { type: rawType, createdByUserId: authorizedSession.userId, assignedToUserId, personId },
    {
      taskRepository: {
        async insert(task) {
          const { error } = await client.from('tasks').insert({
            id: task.id,
            type: task.type,
            title: task.title,
            created_by_user_id: task.createdByUserId,
            assigned_to_user_id: task.assignedToUserId,
            person_id: task.personId,
            appointment_id: task.appointmentId,
            due_at: task.dueAt,
          })
          if (error) throw new Error('HANDOFF_TASK_CREATE_FAILED')
        },
      },
      assigneeDirectory: {
        async isActiveProfessional(userId: string) {
          return isActiveStaffWithRole(userId, 'psychologist_owner', staffDirectory)
        },
      },
    },
  )
  redirect(`/pessoas/${personId}/gerenciar?saved=handoff`)
}

const handoffTypeLabels: Record<SecretaryHandoffTaskType, string> = {
  review_document: 'Documento administrativo para revisão',
  contact_patient: 'Retorno ao paciente solicitado',
  special_confirmation: 'Confirmação especial necessária',
  other_admin: 'Outra pendência administrativa',
}

const relationshipLabels: Record<RelationshipKind, string> = {
  legal_guardian: 'Responsável legal',
  financial_responsible: 'Responsável financeiro',
  fiscal_taker: 'Tomador fiscal',
}

function fiscalFrom(value: unknown): FiscalAddress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as FiscalAddress
}

export default async function ManagePersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ personId: string }>
  searchParams: Promise<{ status?: string; error?: string }>
}) {
  const { personId } = await params
  const session = await requirePatientPermission('patients.update')
  const client = await createServerSupabaseClient()
  const [{ data: person, error: personError }, { data: people, error: peopleError }, { data: relationships, error: relationshipsError }] = await Promise.all([
    (client.from('people') as unknown as PeopleSelectWithEmergency).select('id,civil_name,preferred_name,birth_date,cpf_normalized,email_normalized,phone_e164,preferred_channel,birthday_messages_enabled,emergency_contact_name,emergency_contact_phone_e164,emergency_contact_relationship,fiscal_address').eq('id', personId).maybeSingle(),
    client.from('people').select('id,civil_name,preferred_name').neq('id', personId).order('civil_name', { ascending: true }).limit(500),
    client.from('person_relationships').select('id,related_person_id,relationship_kind').eq('person_id', personId).order('created_at', { ascending: true }),
  ])
  if (personError || !person) notFound()
  if (peopleError) throw new Error('PATIENT_RELATIONSHIP_OPTIONS_FAILED')
  if (relationshipsError) throw new Error('PATIENT_RELATIONSHIPS_READ_FAILED')

  const address = fiscalFrom(person.fiscal_address)
  const initialValues: PersonFormValues = {
    civil_name: person.civil_name,
    preferred_name: person.preferred_name ?? '',
    birth_date: person.birth_date,
    cpf: person.cpf_normalized ?? '',
    email: person.email_normalized ?? '',
    phone: person.phone_e164 ?? '',
    preferred_channel: person.preferred_channel as PersonFormValues['preferred_channel'],
    birthday_messages_enabled: person.birthday_messages_enabled,
    emergency_contact_name: person.emergency_contact_name ?? '',
    emergency_contact_phone: person.emergency_contact_phone_e164 ?? '',
    emergency_contact_relationship: person.emergency_contact_relationship ?? '',
    fiscal_street: address.street ?? '',
    fiscal_number: address.number ?? '',
    fiscal_complement: address.complement ?? '',
    fiscal_district: address.district ?? '',
    fiscal_city: address.city ?? '',
    fiscal_state: address.state ?? '',
    fiscal_postal_code: address.postalCode ?? '',
  }
  const nameById = new Map((people ?? []).map((candidate) => [candidate.id, candidate.preferred_name || candidate.civil_name]))
  const search = await searchParams
  const canManageRelationships = session.permissions.includes('patients.relationships.manage')

  const professionals = await listActiveStaffByRole('psychologist_owner', {
    async listActiveByRole(role) {
      const { data: profiles } = await client
        .from('profiles')
        .select('user_id, display_name, active')
        .eq('role', role)
        .eq('active', true)
      return (profiles ?? []).map((profile) => ({ userId: profile.user_id, displayName: profile.display_name }))
    },
    async findByUserId() {
      return null
    },
  })

  return <>
    <PageHeader
      title={`Editar ${person.preferred_name || person.civil_name}`}
      description="Atualize identificação, contatos, preferências e dados fiscais do paciente."
      actions={<Link className="ui-button ui-button--outline" href={`/pessoas/${person.id}`}>Voltar para a ficha</Link>}
    />
    {search.status === 'relationship_added' ? <p role="status">Vínculo adicionado.</p> : null}
    {search.status === 'relationship_removed' ? <p role="status">Vínculo removido.</p> : null}
    {search.error ? <p role="alert" className="form-field__error">Não foi possível alterar o vínculo. Confira os dados e tente novamente.</p> : null}

    <PersonForm
      mode="edit"
      initialValues={initialValues}
      successRedirect={`/pessoas/${person.id}?status=updated`}
      action={savePatientAction.bind(null, person.id as PersonId)}
    />

    <section className="ui-card" aria-labelledby="relationships-title">
      <h2 id="relationships-title" className="ui-card__title">Responsáveis e vínculos</h2>
      {!canManageRelationships ? <p>Você pode visualizar o cadastro, mas não tem autorização para alterar vínculos.</p> : <>
        <form action={addRelationshipAction}>
          <input type="hidden" name="person_id" value={person.id} />
          <label className="form-field">
            <span className="form-field__label">Tipo de vínculo</span>
            <select className="ui-select" name="relationship_kind" defaultValue="financial_responsible">
              {relationshipKinds.map((kind) => <option key={kind} value={kind}>{relationshipLabels[kind]}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span className="form-field__label">Pessoa relacionada</span>
            <select className="ui-select" name="related_person_id" required defaultValue="">
              <option value="" disabled>Selecione</option>
              {(people ?? []).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.preferred_name || candidate.civil_name}</option>)}
            </select>
          </label>
          <button className="ui-button ui-button--primary" type="submit">Adicionar vínculo</button>
        </form>
      </>}

      {(relationships ?? []).length === 0 ? <p className="empty-state">Nenhum responsável ou vínculo cadastrado.</p> : <ul aria-label="Vínculos cadastrados">
        {(relationships ?? []).map((relationship) => <li key={relationship.id}>
          <strong>{relationshipLabels[relationship.relationship_kind as RelationshipKind]}</strong>: {nameById.get(relationship.related_person_id) ?? 'Cadastro relacionado'}
          {canManageRelationships ? <form action={removeRelationshipAction}>
            <input type="hidden" name="person_id" value={person.id} />
            <input type="hidden" name="relationship_id" value={relationship.id} />
            <button className="ui-button ui-button--ghost" type="submit">Remover</button>
          </form> : null}
        </li>)}
      </ul>}
    </section>
    <section className="ui-card" aria-labelledby="secretary-handoff-title">
      <h2 id="secretary-handoff-title" className="ui-card__title">Encaminhar ao profissional</h2>
      <p>Encaminhe uma pendência administrativa sem usar WhatsApp interno. Conteúdo clínico nunca é copiado para esta tarefa.</p>
      {professionals.length === 0 ? <p className="empty-state">Nenhuma profissional ativa disponível.</p> : (
        <form action={createHandoffAction} className="stack-form">
          <input type="hidden" name="person_id" value={person.id} />
          <label className="form-field">
            <span className="form-field__label">Motivo</span>
            <select className="ui-select" name="handoff_type" defaultValue={SECRETARY_HANDOFF_TASK_TYPES[0]}>
              {SECRETARY_HANDOFF_TASK_TYPES.map((type) => (
                <option key={type} value={type}>{handoffTypeLabels[type]}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-field__label">Atribuir à profissional</span>
            <select className="ui-select" name="assigned_to_user_id" required defaultValue="">
              <option value="" disabled>Selecione</option>
              {professionals.map((professional) => (
                <option key={professional.userId} value={professional.userId}>
                  {professional.displayName ?? professional.userId}
                </option>
              ))}
            </select>
          </label>
          <button className="ui-button ui-button--primary" type="submit">Encaminhar</button>
        </form>
      )}
    </section>
  </>
}
