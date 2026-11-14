# Resposta a Incidentes

## Ordem de resposta

1. Classificar severidade e abrir protocolo com correlation ID.
2. Conter exposição, duplicidade ou emissão indevida; desligar somente o
   provider afetado por kill switch.
3. Preservar audit log e evidências sanitizadas, sem copiar conteúdo clínico.
4. Rotacionar secrets comprometidos fora do repositório e revogar sessões,
   capabilities e webhooks suspeitos.
5. Avaliar categorias e titulares de dados pessoais afetados, incluindo L3/L4,
   e acionar o responsável de privacidade para as notificações exigidas.
6. Restaurar a operação mínima em ambiente isolado, validar RLS e promover a
   correção por migration forward-only.
7. Fazer postmortem com causa raiz, timeline, impacto, evidência, teste de
   regressão e ações com responsável/prazo.

## Classificação

- P0: exposição confirmada de L3/L4, acesso indevido amplo ou perda de dados.
- P1: indisponibilidade de agenda/financeiro, duplicidade financeira ou falha
  fiscal com impacto operacional relevante.
- P2: falha limitada sem exposição confirmada e com workaround.

Não registrar segredos, tokens, XML fiscal bruto, respostas, diagnósticos ou
identificadores pessoais completos no incidente.

## Quick Tunnel do staging: marcador publico indisponivel (#268)

A existencia do processo `solange-demo-tunnel` ou um health local 200 nao
comprova publicacao externa. O reconciliador extrai apenas a URL do ciclo
ativo e testa a URL publica em `/api/health`, exigindo DNS, TLS valido,
HTTP 200 sem redirect e JSON de health do aplicativo. A consulta usa Node
24 no container web, pois `docker:27-cli` nao inclui curl.

Quando o health publico falha, o arquivo `state/current-url.txt` e
invalidado para nao divulgar uma URL revogada como pronta. A URL volta a
ser publicada somente apos validacao publica e restart do web confirmados.
Examinar os logs sanitizados do reconciliador e do `cloudflared`;
`Unauthorized: Tunnel not found` exige revisar a autorizacao do tunel
no provedor, sem revelar tokens nem trocar credenciais por conta propria.
Nao tomar health local ou container running como substituto de E2E grafico.
Para operacoes no ambiente real, observar ownership/lease antes de reiniciar.
