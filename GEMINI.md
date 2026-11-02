<!-- MANDATORY_AGENT_CHECKLIST_V1 -->
## Checklist de execucao obrigatorio (GPT, Codex, Claude, Gemini, Copilot e outros)
Antes de cada tarefa e em cada nova conversa, carregar no `main` a documentacao canonica ShopVivaliz e as regras deste repositorio. Iniciar ou recuperar a tarefa original com `scripts/agent_task_state.py` conectado ao controlador canonico autorizado, sem criar duplicata nem inferir IDs de conversa. Registrar plano com `plan-checklist --task ID --step "..."`, consultar a proxima etapa via `next-step --task ID` ANTES de agir, executar e validar cada etapa, marcar com `check-step --task ID --step-id N --evidence PROVA --verification VALIDACAO`, e so entao passar para a proxima. Novas exigencias entram via `add-checklist-step`; nenhuma etapa e descartada. Os comandos de registro falham sem o controlador canonico provisionado; nao simular estado local, nem declarar sucesso por ACK, PR, CI verde ou processo ativo. `ready`/`complete` exigem a meta original comprovada, correcoes, regressao, E2E/UI quando aplicavel e merge/deploy validado. Se uma rota tecnica falhar, avaliar alternativas EXISTENTES e independentemente autorizadas (MCP, GitHub, RDC, SSH privado/Tailscale, tuneis, APIs, hosts e ferramentas disponiveis); documentar cada tentativa. `BLOCKED_EXTERNAL` so com impedimento objetivo apos esgotar rotas seguras; jamais burlar MFA, RBAC, 401/403, branch protection, leases ou aprovacoes. O controlador e contingencia, nao substitui a obrigacao de o agente executar e continuar ate concluir. Este contrato deve ser testado e aplicado no CI, nao apenas estar escrito.
<!-- /MANDATORY_AGENT_CHECKLIST_V1 -->

<!-- AUDIT_EXTERNAL_REMEDIATION_V1 -->
> **AUDITORIA EXTERNA:** também é corretiva. Auditor com acesso autorizado corrige, testa e reaudita; auditor read-only não encerra em relatório, devendo encaminhar achados a executor autorizado até correção + revalidação independente ou bloqueio externo comprovado.
<!-- /AUDIT_EXTERNAL_REMEDIATION_V1 -->

<!-- DIAGNOSTIC_REMEDIATE_VALIDATE_GLOBAL_V1 -->
> **DIAGNÓSTICO CORRETIVO GLOBAL:** diagnóstico confirmado obriga correção segura, prevenção pertinente, testes e validação real/E2E aplicável antes de `CONCLUIDO`; enquanto houver ação executável, permanecer `RUNNING`.
<!-- /DIAGNOSTIC_REMEDIATE_VALIDATE_GLOBAL_V1 -->

<!-- GEMINI_READ_AGENTS_FIRST_V1 -->
Antes de qualquer análise, alteração, auditoria, browser, PR, deploy ou validação, leia integralmente `AGENTS.md` e siga suas regras. Em conflito, `AGENTS.md` prevalece.

# Protocolo IA-to-CLI obrigatório

<!-- GLOBAL_BROWSER_VM_POLICY_V2 -->
> **NAVEGAÇÃO GLOBAL — VM OBRIGATÓRIA; WINDOWS PROIBIDO PARA BROWSER:** qualquer navegador, automação browser, sessão gráfica, Playwright/Selenium/CDP, Chrome/Chromium/Edge/Opera, CAPTCHA, MFA, consentimento ou validação visual deve usar por padrão e obrigatoriamente a VM backend `always-free-arm-1787907847-26` (`10.0.1.38`) e o Browser Worker privado. Para intervenção humana, usar `https://shopvivaliz.com.br/admin/browser-worker.php`. **Fred-Win (`LAPTOP-NIG4IFUU`) e `DESKTOP-KOCEPSV` não são destinos nem fallback para navegação.** Não perguntar qual máquina usar para browser: use a VM. Exceção somente se o proprietário ordenar explicitamente, na tarefa atual, o uso de um Windows específico para aquela navegação. Se a VM estiver indisponível, reparar o caminho VM/OCI Bastion/túnel privado ou registrar bloqueio real; nunca migrar silenciosamente para Windows. Workflows/relays Windows de browser são legado e não devem ser executados até serem migrados. A regra não proíbe Windows para tarefas não-browser que realmente dependam dele.


Antes de qualquer alteração, carregue e siga integralmente o protocolo canônico:

@./AI-TO-CLI-PROTOCOL.md

Ele complementa as regras específicas do projeto. Nenhuma alteração válida da tarefa pode ser abandonada sem merge validado na branch de destino.
Regra de continuidade: leia e cumpra `AI-TO-CLI-PROTOCOL.md`, especialmente `Continuidade obrigatoria diante de falha de ferramenta ou comando`; erro de ferramenta nao autoriza encerrar a tarefa.

Antes de finalizar qualquer tarefa, cumpra o `PROTOCOLO OBRIGATORIO DE CONCLUSAO DE TAREFAS` de `AI-TO-CLI-PROTOCOL.md`; nao pare em erro corrigivel ou resultado parcial.

<!-- GLOBAL_TASK_CONTINUITY_V8 -->
## Global task continuity V8
Toda tarefa que possa alterar código, infraestrutura, dados, CI ou deploy deve manter checkpoint durável via `python3 scripts/agent_task_state.py`. Este repositório é fixado como `repository=Vivaliz-site/solange-rolla-consultorio`. Falhas recuperáveis permanecem RUNNING e conclusão exige verificação fresca. O adapter falha fechado sem o controlador canônico injetado pelo runtime detached. Background recovery permanece Gemini-only; Codex nunca é fallback automático e continua sendo a última opção finita explícita.
<!-- /GLOBAL_TASK_CONTINUITY_V8 -->
