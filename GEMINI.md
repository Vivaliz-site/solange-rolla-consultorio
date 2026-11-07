<!-- MANDATORY_AGENT_CHECKLIST_V1 -->
## Checklist proporcional: sem bloqueio global para tarefas rotineiras

**Revisao por determinacao do proprietario (06/11/2026):** foi revogada a obrigatoriedade universal de planejar e certificar um checklist a cada etapa, introduzida em 31/10/2026. A ausencia de `plan-checklist` nao pode impedir `record_progress`, retomada, correcao, teste ou conclusao de tarefas P0/P1 que ja possuam autorizacao. Um checkpoint duravel e uma proxima acao concreta continuam suficientes para registrar o trabalho; nao criar processo de aprovacao por subcomando.

`scripts/agent_task_state.py` deixa de injetar automaticamente um checklist exigivel em novos checkpoints do runtime canonico. Checkpoints anteriores com lista **vazia** nao ficam presos por um plano nunca iniciado. Para trabalhos que precisam de checklist formal, o executor pode ativar `SHOPVIVALIZ_REQUIRE_AGENT_CHECKLIST=1` no escopo do fluxo e usar `plan-checklist`, `next-step`, `check-step` e `add-checklist-step`. Se ja existem etapas planejadas, suas evidencias e integridade continuam obrigatorias para encerrar; nao apagar nem certificar etapas sem comprovacao.

Essa desburocratizacao nao autoriza falso sucesso nem remove controles independentes: identidade, MFA, RBAC, segredos, lease/fencing, aprovacoes humanas formalmente necessarias, branch protection, gates de operacoes comerciais, CI e validacao funcional/E2E pertinente. Nenhum controle novo deve ser imposto sem aprovacao do proprietario.
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
