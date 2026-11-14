# Fiscal

## Responsabilidade
Controlar o ciclo de vida fiscal de servicos e eventos, incluindo perfil fiscal versionado, tratamento por origem e contrato de NFS-e.

## Public API
Tipos e funcoes exportados por `public.ts`: validacao de perfil, avaliacao de tratamento, transicoes de documento e `NfseProvider`.

## Owns
Perfis fiscais, tratamentos fiscais versionados, documentos fiscais, tentativas de provider, referencias privadas de artefatos fiscais e eventos de cancelamento.

## Consumes
IDs e snapshots minimos dos contratos publicos de Pessoas, Agenda, Eventos e Contas a Receber. O modulo nao importa infraestrutura desses modulos.

## Invariantes
Valores sao centavos inteiros; status fiscal e independente de agenda e financeiro; documentos emitidos nao sao sobrescritos; cada documento preserva a versao de perfil e tratamento usada; `appointment_no_show` e cancelamento tardio exigem tratamento fiscal explicito.

## Dados sensíveis
CPF/CNPJ e artefatos XML/PDF sao tratados somente server-side e armazenados em bucket privado. Credenciais, documentos integrais e conteudo clinico nunca entram em logs.

## Proibições
Nao emitir em producao sem gate fiscal e `NFSE_LIVE_ENABLED`; nao assumir tratamento de falta igual ao de consulta realizada; nao chamar provider dentro de transacao financeira; nao expor documentos por link publico permanente; nao persistir tokens de capability; nao acessar conteudo clinico.

## Operacao administrativa
O painel separa itens prontos para revisao, tratamentos pendentes, emissao e erros. PDF/XML sao enviados ao bucket privado com SHA-256 e tamanho registrados. Cancelamentos sao eventos idempotentes que preservam o documento original e podem referenciar substituto. A notificacao usa apenas uma referencia opaca de capability no outbox.

## Operacao
Elegibilidade retorna blockers sanitizados e separa `ready`, `review` e `not_ready`. Requests usam a chave composta por origem, perfil e tratamento para preservar snapshots e idempotencia. O provider mock e exclusivo de desenvolvimento, testes e homologacao controlada; nenhum identificador sintetico representa uma NFS-e real.

## Worker e providers
O worker consome mensagens da fila `fiscal`, arquiva somente jobs processados e reencaminha falhas com atraso.

O adapter nacional segue o contrato oficial da SEFIN Nacional: autenticação mútua por certificado é responsabilidade do `NationalNfseTransport`; a DPS e o pedido de evento devem chegar previamente assinados em XMLDSIG e compactados em GZip/Base64 pelo `NationalNfsePayloadFactory`. Emissão usa `POST /nfse`, consulta usa `GET /nfse/{chaveAcesso}` e cancelamento usa `POST /nfse/{chaveAcesso}/eventos`.

`liveEnabled` sozinho nunca habilita tráfego: ambiente (`restricted` ou `production`), transporte mTLS e fábrica de payload assinado são obrigatórios. O ambiente restrito aponta para a SEFIN de Produção Restrita e produção usa o host oficial de produção. Não existe fallback para Bearer token nem para o antigo contrato genérico `/documents`.

Emissão é síncrona e POST não é repetido cegamente. Quando o resultado é ambíguo, o adapter tenta reconciliar pelo identificador imutável da DPS em `GET /dps/{id}`; sem confirmação, retorna `NFSE_AMBIGUOUS`. XML, certificado, chave privada e respostas fiscais integrais não devem entrar em logs.
