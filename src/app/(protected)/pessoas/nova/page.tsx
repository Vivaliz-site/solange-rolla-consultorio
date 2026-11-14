import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/platform/supabase/server'
import { authorizeStaffPermission, getStaffSession } from '@/modules/identity/public'
import { createPerson } from '@/modules/people/public'
import type { Person, PersonId } from '@/modules/people/public'
import { PageHeader } from '@/shared/ui/page-header'
import { PersonForm, type PersonFormState, type PersonFormValues } from '@/modules/people/ui/person-form'

type DatabaseError = { code?: string; message?: string }
type PersonRowWithEmergency = {
  id: string
  civil_name: string
  preferred_name: string | null
  cpf_normalized: string | null
  birth_date: string
  email_normalized: string | null
  phone_e164: string | null
  preferred_channel: string
  birthday_messages_enabled: boolean
  emergency_contact_name: string | null
  emergency_contact_phone_e164: string | null
  emergency_contact_relationship: string | null
}
type PeopleInsertWithEmergency = {
  insert(values: Record<string, unknown>): {
    select(columns: string): {
      single(): Promise<{ data: PersonRowWithEmergency | null; error: DatabaseError | null }>
    }
  }
}

function valuesFrom(formData: FormData): PersonFormValues {
  const channel = String(formData.get('preferred_channel') ?? 'none')
  return {
    civil_name: String(formData.get('civil_name') ?? ''),
    preferred_name: String(formData.get('preferred_name') ?? ''),
    birth_date: String(formData.get('birth_date') ?? ''),
    cpf: String(formData.get('cpf') ?? ''),
    email: String(formData.get('email') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    preferred_channel: ['whatsapp', 'email', 'phone', 'none'].includes(channel)
      ? channel as PersonFormValues['preferred_channel']
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

function fiscalAddressFrom(values: PersonFormValues) {
  const address = {
    street: values.fiscal_street.trim(),
    number: values.fiscal_number.trim(),
    complement: values.fiscal_complement.trim(),
    district: values.fiscal_district.trim(),
    city: values.fiscal_city.trim(),
    state: values.fiscal_state.trim().toUpperCase(),
    postalCode: values.fiscal_postal_code.replace(/\D/g, ''),
  }
  const requiredAddressValues = [address.street, address.number, address.district, address.city, address.state, address.postalCode]
  if (requiredAddressValues.every((entry) => !entry) && !address.complement) return { ok: true as const, address: {} }
  if (!values.cpf.trim()) return { ok: false as const, error: 'Informe o CPF para preparar a emissão fiscal.' }
  if (requiredAddressValues.some((entry) => !entry)) return { ok: false as const, error: 'Preencha o endereço fiscal completo ou deixe todos os campos em branco.' }
  if (!/^[A-Z]{2}$/.test(address.state) || !/^\d{8}$/.test(address.postalCode)) return { ok: false as const, error: 'Confira a UF (2 letras) e o CEP (8 números).' }
  return { ok: true as const, address }
}

async function createPersonAction(previous: PersonFormState, formData: FormData): Promise<PersonFormState> {
  'use server'
  const values = valuesFrom(formData)
  const invalid = (error: string): PersonFormState => ({ revision: previous.revision + 1, error, success: false, values })
  const session = await getStaffSession()
  authorizeStaffPermission(session, 'patients.create')

  const fiscal = fiscalAddressFrom(values)
  if (!fiscal.ok) return invalid(fiscal.error)
  const client = await createServerSupabaseClient()
  const repository = {
    async findByUniqueFields(input: { cpfNormalized: string | null; emailNormalized: string | null; phoneE164: string | null }) {
      const lookups = [
        ['cpf_normalized', input.cpfNormalized],
        ['email_normalized', input.emailNormalized],
        ['phone_e164', input.phoneE164],
      ] as const
      for (const [column, lookup] of lookups) {
        if (!lookup) continue
        const { data } = await client.from('people').select('cpf_normalized,email_normalized,phone_e164').eq(column, lookup).maybeSingle()
        if (data) return { cpfNormalized: data.cpf_normalized, emailNormalized: data.email_normalized, phoneE164: data.phone_e164 }
      }
      return null
    },
    async insert(input: Omit<Person, 'id'>): Promise<Person> {
      const { data, error } = await (client.from('people') as unknown as PeopleInsertWithEmergency).insert({
        civil_name: input.civilName,
        preferred_name: input.preferredName,
        cpf_normalized: input.cpfNormalized,
        birth_date: input.birthDate,
        email_normalized: input.emailNormalized,
        phone_e164: input.phoneE164,
        preferred_channel: values.preferred_channel,
        birthday_messages_enabled: values.birthday_messages_enabled,
        emergency_contact_name: input.emergencyContact?.name ?? null,
        emergency_contact_phone_e164: input.emergencyContact?.phoneE164 ?? null,
        emergency_contact_relationship: input.emergencyContact?.relationship ?? null,
        fiscal_address: fiscal.address,
      }).select('id,civil_name,preferred_name,cpf_normalized,birth_date,email_normalized,phone_e164,preferred_channel,birthday_messages_enabled,emergency_contact_name,emergency_contact_phone_e164,emergency_contact_relationship').single()
      if (error || !data) throw new Error('PERSON_CREATE_FAILED')
      return {
        id: data.id as PersonId,
        civilName: data.civil_name,
        preferredName: data.preferred_name,
        cpfNormalized: data.cpf_normalized,
        birthDate: data.birth_date,
        emailNormalized: data.email_normalized,
        phoneE164: data.phone_e164,
        preferredChannel: data.preferred_channel as Person['preferredChannel'],
        birthdayMessagesEnabled: data.birthday_messages_enabled,
        emergencyContact: data.emergency_contact_name && data.emergency_contact_phone_e164
          ? {
              name: data.emergency_contact_name,
              phoneE164: data.emergency_contact_phone_e164,
              relationship: data.emergency_contact_relationship,
            }
          : null,
      }
    },
  }

  try {
    const result = await createPerson(repository, {
      civilName: values.civil_name,
      preferredName: values.preferred_name,
      cpf: values.cpf,
      birthDate: values.birth_date,
      email: values.email,
      phone: values.phone,
      preferredChannel: values.preferred_channel,
      birthdayMessagesEnabled: values.birthday_messages_enabled,
      emergencyContact: {
        name: values.emergency_contact_name,
        phone: values.emergency_contact_phone,
        relationship: values.emergency_contact_relationship,
      },
    })
    if (!result.ok) return invalid(result.code === 'DUPLICATE_CPF'
      ? 'Já existe um paciente com este CPF.'
      : 'Já existe um cadastro com este e-mail ou telefone.')
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_CPF') return invalid('Informe um CPF válido.')
    if (error instanceof Error && error.message === 'INVALID_PHONE') return invalid('Confira o telefone informado.')
    if (error instanceof Error && error.message === 'INVALID_EMERGENCY_CONTACT') {
      return invalid('Informe nome e telefone válidos para o contato de emergência, ou deixe todos os campos em branco.')
    }
    throw error
  }

  return { revision: previous.revision + 1, error: null, success: true, values }
}

export default async function NewPersonPage() {
  const session = await getStaffSession()
  if (!session) redirect('/login')
  authorizeStaffPermission(session, 'patients.create')

  return <>
    <PageHeader
      title="Novo paciente"
      description="Cadastre os dados administrativos uma única vez para reutilizar em agenda, formulários e financeiro."
      actions={<Link className="ui-button ui-button--outline" href="/pessoas">Voltar para pacientes</Link>}
    />
    <PersonForm action={createPersonAction} successRedirect="/pessoas" />
  </>
}
