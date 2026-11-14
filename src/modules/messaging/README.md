# Messaging

## Responsabilidade
Enfileirar e entregar comunicação administrativa por providers abstratos.

## Public API
Outbox idempotente e dispatcher para a fila `messaging`.

## Owns
Templates, mensagens de saída, tentativas e eventos de webhook.

## Consumes
Contratos públicos de pessoas, agenda e plataforma de filas.

## Invariantes
Uma chave de idempotência representa uma mensagem lógica; conteúdo clínico é rejeitado.

Mensagens aceitas por provider real persistem o ID externo antes de concluir o job. Eventos de delivery entram por inbox deduplicada e avançam estado monotonicamente (`sent -> delivered -> read` ou `sent -> failed`); `read` e `failed` são terminais. Webhooks nunca persistem conteúdo de mensagem ou telefone bruto.

## Dados sensíveis
Não transporta respostas de formulários, diagnóstico ou conteúdo clínico.

## Proibições
Não enviar diretamente no cron nem acessar internals de outros módulos.
