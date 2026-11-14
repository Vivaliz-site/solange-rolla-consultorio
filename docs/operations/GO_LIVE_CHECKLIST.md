# Go-Live Checklist

Estado inicial obrigatório: **NO-GO**. Só marcar `[x]` com evidência anexada ao release candidate; ausência de evidência mantém `[ ]`.

## Técnico

- [ ] CI verde no SHA candidato: lint, typecheck, unit, architecture, build e audit.
- [ ] Database verde: migration history, rebuild limpo, pgTAP/RLS e tipos gerados.
- [ ] E2E verde com 1 worker, incluindo fluxos canônicos e isolamento clínico.
- [ ] `npm run arch:check`, `modules:check` e `migrations:check` verdes no SHA.
- [ ] Security negative tests verdes: roles, MFA/AAL2, capabilities, headers e rate limit.
- [ ] Migrations forward-only revisadas; nenhum arquivo aplicado alterado.
- [ ] Secrets separados por ambiente, fora do repositório e verificados sem imprimir valor.
- [ ] Flags `WHATSAPP_LIVE_ENABLED` e `NFSE_LIVE_ENABLED` desligadas até aprovação.
- [ ] Domínio/TLS, CSP, origin/CSRF, health e alertas verificados.
- [ ] Backup recente e restore drill isolado com RPO/RTO medidos.
- [ ] Rollback da aplicação testado e compatibilidade expand/contract confirmada.

## Jurídico e fiscal

- [ ] `service_terms`, `cancellation_policy`, `truthfulness_declaration` e `privacy_notice` revisados e versionados.
- [ ] Política de 48 horas computáveis aprovada; sábado/domingo contam zero.
- [ ] Emissor, CPF/PJ, regime, código de serviço, credenciais e tratamentos por origem confirmados pela contabilidade.
- [ ] NFS-e homologada em sandbox/produção restrita para consulta, falta e cancelamento sem presumir tratamentos idênticos.
- [ ] Inventário, retenção e procedimento de titulares revisados.
- [ ] Formulário real da Solange transcrito, classificado, validado e PDF homologado com dados sintéticos. Sem isso, consulta permanece NO-GO.

## Operação

- [ ] Usuários reais, papéis mínimos e MFA validados.
- [ ] Treinamento, suporte, canal de reagendamento e exportação contábil testados.
- [ ] Templates WhatsApp/e-mail revisados para não revelar conteúdo clínico.
- [ ] WhatsApp live validado com challenge do webhook, assinatura HMAC real, deduplicação, `provider_message_id` persistido e reconciliação de `sent/delivered/read/failed` em ambiente controlado.
- [ ] Smoke pós-deploy executado sem paciente real e sem seed em produção.
- [ ] Nenhuma integração live, flag inadvertida ou dado sintético em produção.

## Decisão

- [ ] `GO`: todas as caixas aplicáveis marcadas e riscos aceitos pelo responsável.
- [ ] `NO-GO`: qualquer caixa crítica sem evidência, credencial externa ausente, revisão jurídica pendente ou falha de segurança.

Registrar SHA, data, responsáveis, links de evidência, pendências externas e riscos residuais no template de release.
