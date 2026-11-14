# Integrations Architecture

## Princípio

Domínio não conhece SDK/provider. Cada integração implementa uma porta pública e roda com idempotência, timeout, retry e observabilidade sanitizada.

## 1. WhatsApp

Provider alvo: WhatsApp Business Platform/Cloud API ou BSP oficialmente compatível.

Uso:
- envio de formulário;
- confirmação de consulta;
- ações Confirmar/Reagendar/Cancelar;
- lembretes administrativos;
- aniversário;
- documentos autorizados.

Regras:
- nenhum conteúdo clínico;
- templates versionados;
- provider ids persistidos;
- webhooks deduplicados;
- fallback para e-mail conforme política;
- feature flag para live.

Porta:

```ts
interface MessagingProvider {
  send(input: OutboundMessage): Promise<DeliveryResult>
}
```

## 2. E-mail

Adapter intercambiável de provider transacional.

Mesma semântica do MessagingProvider, com capabilities específicas quando necessário (attachment/link, delivery/bounce events).

Não acoplar regra de agenda ao SDK do provedor.

## 3. NFS-e

Adapter `NfseProvider`:

```ts
interface NfseProvider {
  issue(input: NfseIssueInput): Promise<NfseIssueResult>
  getStatus(externalId: string): Promise<NfseStatusResult>
  cancel(input: NfseCancelInput): Promise<NfseCancelResult>
}
```

Ambientes:
- mock local;
- Produção Restrita/homologação;
- produção somente após gate fiscal.

### Contrato nacional

O adapter real é da **SEFIN Nacional**. Não usar o antigo placeholder `/documents` nem autenticação Bearer.

Contrato de transporte:
- autenticação mútua TLS com certificado ICP-Brasil fornecido por secret store externo;
- documentos fiscais em XML assinado XMLDSIG;
- XML compactado GZip e representado em Base64 dentro do envelope JSON;
- Produção Restrita: `https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional`;
- produção: `https://sefin.nfse.gov.br/SefinNacional`.

Operações implementadas no adapter:
- `POST /nfse` com `dpsXmlGZipB64`;
- `GET /nfse/{chaveAcesso}`;
- `GET /dps/{id}` para reconciliação de emissão ambígua;
- `POST /nfse/{chaveAcesso}/eventos` com `pedidoRegistroEventoXmlGZipB64` para cancelamento.

A construção fiscal da DPS/evento, validação XSD, XMLDSIG e acesso ao certificado ficam fora do domínio e entram pelo `NationalNfsePayloadFactory`. O transporte mTLS entra por `NationalNfseTransport`. Ausência de qualquer uma dessas dependências falha fechado com `NFSE_CONFIGURATION_REQUIRED`.

POST fiscal nunca deve ser repetido cegamente após timeout/5xx. Primeiro reconciliar pelo ID da DPS; sem confirmação, manter estado ambíguo/recuperável.

Persistir request fingerprint/idempotency key, protocolo/ID DPS, chave de acesso, status e caminhos privados de XML/PDF. Nunca logar XML bruto, certificado, chave privada, CPF/CNPJ ou payload integral do provider.

## 4. Site solangerolla.com.br

Uso como fonte institucional inicial, não como banco operacional.

Dados públicos que podem alimentar cadastro/configuração:
- nome/apresentação;
- formação;
- serviços;
- identidade visual;
- links sociais e contatos públicos;
- eventos públicos quando houver integração futura.

Não fazer scraping contínuo como dependência de produção. Após importação, o sistema mantém seus próprios dados configuráveis.

## 5. CEP/endereço

Criar `AddressLookupProvider` opcional para facilitar preenchimento.

Falha do provider não pode impedir cadastro manual.

## 6. Assinatura externa futura

MVP usa assinatura simples própria com evidência/hash.

Porta futura:

```ts
interface SignatureProvider {
  createEnvelope(input: SignatureEnvelopeInput): Promise<EnvelopeResult>
  getStatus(externalId: string): Promise<SignatureStatus>
}
```

Provider externo só será adotado se houver benefício jurídico/operacional superior sem piorar UX do paciente.

## 7. Calendário externo futuro

Google Calendar/Outlook podem ser sincronizados depois.

Regra: calendário externo nunca vira fonte de verdade da agenda.

Mudanças externas entram por integração e são reconciliadas com IDs internos.

## 8. Pagamentos/conciliação futura

MVP registra pagamento manualmente.

Posteriormente `PaymentReconciliationProvider` pode ler Pix/banco/adquirente e sugerir vínculo.

Não marcar recebível como pago automaticamente sem regra de confiança/reconciliação definida.

## 9. Webhooks

Todos:

```text
HTTP endpoint
 -> validar assinatura/autenticidade
 -> persistir inbox_event único
 -> responder rapidamente
 -> enfileirar processamento
 -> aplicar mudança idempotente
```

## 10. Circuit breaker operacional

Cada integração possui feature flag/kill switch para interromper saída sem derrubar o sistema interno.

Exemplos:

```text
WHATSAPP_LIVE_ENABLED
EMAIL_LIVE_ENABLED
NFSE_LIVE_ENABLED
```

## 11. Secrets

Nenhuma credencial no banco de domínio. Usar secrets do ambiente/Vault e referenciar provider/account por identificador não secreto.

## 12. Contract tests

Cada adapter deve passar suíte contra um fake in-memory e, quando possível, sandbox oficial. O domínio testa a interface, não respostas frágeis de SDK diretamente.
