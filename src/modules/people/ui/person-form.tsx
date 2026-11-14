'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export type PersonFormValues = {
  civil_name: string
  preferred_name: string
  birth_date: string
  cpf: string
  email: string
  phone: string
  preferred_channel: 'whatsapp' | 'email' | 'phone' | 'none'
  birthday_messages_enabled: boolean
  emergency_contact_name: string
  emergency_contact_phone: string
  emergency_contact_relationship: string
  fiscal_street: string
  fiscal_number: string
  fiscal_complement: string
  fiscal_district: string
  fiscal_city: string
  fiscal_state: string
  fiscal_postal_code: string
}

export type PersonFormState = { revision: number; error: string | null; success?: boolean; values: PersonFormValues }

export const EMPTY_PERSON_FORM_VALUES: PersonFormValues = {
  civil_name: '',
  preferred_name: '',
  birth_date: '',
  cpf: '',
  email: '',
  phone: '',
  preferred_channel: 'none',
  birthday_messages_enabled: false,
  emergency_contact_name: '',
  emergency_contact_phone: '',
  emergency_contact_relationship: '',
  fiscal_street: '',
  fiscal_number: '',
  fiscal_complement: '',
  fiscal_district: '',
  fiscal_city: '',
  fiscal_state: '',
  fiscal_postal_code: '',
}

type PersonFormAction = (state: PersonFormState, formData: FormData) => Promise<PersonFormState>

function SuccessRedirect({ success, href }: { success: boolean; href: string }) {
  const router = useRouter()

  useEffect(() => {
    if (success) router.replace(href)
  }, [router, success, href])

  return null
}

export function PersonForm({
  action,
  initialValues = EMPTY_PERSON_FORM_VALUES,
  mode = 'create',
  successRedirect,
}: {
  action: PersonFormAction
  initialValues?: PersonFormValues
  mode?: 'create' | 'edit'
  successRedirect?: string
}) {
  const [state, formAction, pending] = useActionState(action, {
    revision: 0,
    error: null,
    success: false,
    values: initialValues,
  })
  const values = state.values
  const editing = mode === 'edit'

  return <>
    {successRedirect && <SuccessRedirect success={state.success === true} href={successRedirect} />}
    <form key={state.revision} className="person-form" action={formAction}>
    {state.error && <p role="alert" className="form-field__error">{state.error}</p>}

    <fieldset>
      <legend>Identificação</legend>
      <label htmlFor="civil-name">Nome civil</label>
      <input id="civil-name" name="civil_name" required maxLength={200} defaultValue={values.civil_name} />
      <label htmlFor="preferred-name">Nome preferido</label>
      <input id="preferred-name" name="preferred_name" maxLength={200} defaultValue={values.preferred_name} />
      <label htmlFor="birth-date">Data de nascimento</label>
      <input id="birth-date" name="birth_date" type="date" required defaultValue={values.birth_date} />
      <label htmlFor="cpf">CPF</label>
      <input id="cpf" name="cpf" inputMode="numeric" autoComplete="off" defaultValue={values.cpf} />
    </fieldset>

    <fieldset>
      <legend>Contato</legend>
      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" type="email" autoComplete="email" defaultValue={values.email} />
      <label htmlFor="phone">Telefone / WhatsApp</label>
      <input id="phone" name="phone" inputMode="tel" autoComplete="tel" defaultValue={values.phone} />
      <label htmlFor="preferred-channel">Canal preferido</label>
      <select id="preferred-channel" name="preferred_channel" defaultValue={values.preferred_channel}>
        <option value="none">Nenhum</option>
        <option value="whatsapp">WhatsApp</option>
        <option value="email">E-mail</option>
        <option value="phone">Telefone</option>
      </select>
      <label className="form-field--checkbox">
        <input type="checkbox" name="birthday_messages_enabled" defaultChecked={values.birthday_messages_enabled} />
        <span>Enviar mensagem de aniversário</span>
      </label>
    </fieldset>

    <fieldset>
      <legend>Contato de emergência</legend>
      <label htmlFor="emergency-contact-name">Nome</label>
      <input id="emergency-contact-name" name="emergency_contact_name" maxLength={200} defaultValue={values.emergency_contact_name} />
      <label htmlFor="emergency-contact-phone">Telefone</label>
      <input id="emergency-contact-phone" name="emergency_contact_phone" inputMode="tel" autoComplete="tel" defaultValue={values.emergency_contact_phone} />
      <label htmlFor="emergency-contact-relationship">Vínculo</label>
      <input id="emergency-contact-relationship" name="emergency_contact_relationship" maxLength={80} defaultValue={values.emergency_contact_relationship} />
    </fieldset>

    <fieldset className="person-form__fiscal" aria-describedby="fiscal-address-help">
      <legend>Dados fiscais para NFS-e</legend>
      <p id="fiscal-address-help">Para preparar a emissão fiscal, informe CPF e o endereço completo.</p>
      <label htmlFor="fiscal-postal-code">CEP</label>
      <input id="fiscal-postal-code" name="fiscal_postal_code" inputMode="numeric" autoComplete="postal-code" defaultValue={values.fiscal_postal_code} />
      <label htmlFor="fiscal-street">Logradouro</label>
      <input id="fiscal-street" name="fiscal_street" autoComplete="address-line1" defaultValue={values.fiscal_street} />
      <label htmlFor="fiscal-number">Número</label>
      <input id="fiscal-number" name="fiscal_number" defaultValue={values.fiscal_number} />
      <label htmlFor="fiscal-complement">Complemento</label>
      <input id="fiscal-complement" name="fiscal_complement" autoComplete="address-line2" defaultValue={values.fiscal_complement} />
      <label htmlFor="fiscal-district">Bairro</label>
      <input id="fiscal-district" name="fiscal_district" defaultValue={values.fiscal_district} />
      <label htmlFor="fiscal-city">Cidade</label>
      <input id="fiscal-city" name="fiscal_city" autoComplete="address-level2" defaultValue={values.fiscal_city} />
      <label htmlFor="fiscal-state">UF</label>
      <input id="fiscal-state" name="fiscal_state" maxLength={2} autoComplete="address-level1" defaultValue={values.fiscal_state} />
    </fieldset>

    <button type="submit" className="ui-button ui-button--primary" disabled={pending}>
      {pending ? (editing ? 'Salvando…' : 'Cadastrando…') : (editing ? 'Salvar cadastro' : 'Cadastrar paciente')}
    </button>
    </form>
  </>
}
