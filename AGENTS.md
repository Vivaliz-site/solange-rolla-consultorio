<!-- GEPETO_EVERY_TASK_V1 -->
## Gepeto obrigatorio em toda tarefa
Acione o plugin Gepeto junto com Superpowers em toda tarefa e retomada, sem nova mencao do usuario. Leia e cumpra `GEPETO-POLICY.md`. Se o runtime nao expuser o plugin, registre `GEPETO_UNAVAILABLE`, informe a limitacao e continue o trabalho autorizado sem simular participacao. Aplicar um plugin nao comprova delegacao nem revisao independente.
<!-- /GEPETO_EVERY_TASK_V1 -->

<!-- MANDATORY_AGENT_CHECKLIST_V1 -->
## Checklist proporcional — revogada a trava universal

Por determinacao expressa do proprietario em 06/11/2026, a exigencia geral introduzida em 31/10/2026 de criar um plano formal e certificar cada subetapa **nao bloqueia tarefas P0/P1 ja autorizadas**. Execute a tarefa, registre `task_id`, `next_action` e evidencias reais no checkpoint sem exigir `plan-checklist` nem esperar o controlador para cada acao. Nao abandonar trabalho por indisponibilidade momentanea de um registrador: usar rota autorizada e preservar o progresso.

Checklists explicitos continuam disponiveis por `SHOPVIVALIZ_REQUIRE_AGENT_CHECKLIST=1` ou `plan-checklist`, com `next-step`, `check-step` e `add-checklist-step` quando a complexidade justificar. Itens planejados e evidencias ja registrados nao podem ser apagados ou falsificados. Checklists automaticamente vazios de checkpoints legados nao bloqueiam o progresso. `ready` e `complete` exigem, independentemente disso, provas da meta original, correcao, testes, regressao e E2E/deploy quando aplicavel.

Continuam MFA, RBAC, segredos, branch protection, leases/fencing, revisao humana formal em operacoes protegidas, controles financeiros/comerciais e recusas explicitas dos provedores. Nao reintroduzir restricoes burocraticas nao aprovadas por meio de testes, agentes ou workflows.
<!-- /MANDATORY_AGENT_CHECKLIST_V1 -->

<!-- AUDIT_UI_EVIDENCE_INTEGRITY_V2 -->
## GATE EXECUTAVEL — UI, evidencia real e continuidade da Auditoria Extrema V5

Antes de declarar APTO, executar `scripts/certify-audit-manifest.py` com `--evidence-root` e atender a `docs/quality/AUDIT_UI_EVIDENCE_INTEGRITY_V2.md`. A auditoria exige arquivos reais com hash recalculado, inventario de UI, log de passos/clicks e midia capturada, cada caso real stateful, RED/GREEN/regressao/reauditoria, reviewer em sessao independente e UI pos-deploy. E proibido autoatribuir APTO com flags, mock, screenshot isolado, API, CLI, SQL ou headless-only. Enquanto nao obtiver AUDIT_VERDICT=APTO da mesma release, preservar `RUNNING` no controlador de continuidade e `next_action` concreta, sem abandonar em relatorio, PR, merge, limite de turno ou falha recuperavel. Delegacao nao isenta o controlador. Antes de `CONCLUIDO`, validar E2E real e o gate `agent_task_state.py terminal`. Respeitar leases/fencing, MFA, aprovacao de destruicao/cobranca e proibir loops autonomos de IA paga. Bloqueio externo comprovado nao equivale a APTO.
<!-- /AUDIT_UI_EVIDENCE_INTEGRITY_V2 -->

<!-- EXTREME_AUDIT_UI_FIRST_HARD_GATE_V1 -->
## GATE INEGOCIAVEL: Auditoria Extrema V5 executada pela UI real

**Ordem explicita do proprietario (2026-10-13), vinculante a GPT, Claude, Gemini, Codex, subagentes, orquestradores e revisores:** toda auditoria extrema/completa/V5/aptidao de sistema que tenha UI **DEVE ser executada pelo proprio agente atraves da interface grafica real**. O auditor nao pode substituir a UI por API, terminal, SQL, inspecao de codigo, logs, mocks, healthcheck, testes unitarios, Playwright exclusivamente headless nem screenshot estatico. Esses meios sao auxiliares para investigar/reconciliar, jamais prova suficiente do funcionamento que o usuario vivencia.

1. **UI primeiro, sem atalhos:** inventariar telas, jornadas, perfis, estados e casos reais; abrir a interface publicada no host/perfil autorizado; navegar, clicar, preencher, filtrar, salvar/submeter dentro das permissoes; observar resposta visual, erros e efeitos; recarregar, sair e voltar para provar persistencia. Para Amazon Seller Central, Mercado Livre e paineis externos, auditar os casos e transicoes acessiveis na UI oficial, um a um conforme escopo, sem declarar sucesso por API somente.
2. **Evidencia obrigatoria por jornada:** registrar ambiente/URL, SHA/release quando aplicavel, sessao autorizada sem segredos, timestamp, passos efetivamente executados, capturas/trace/video, estado antes/depois, erros de console/rede, reload/revisita e reconciliacao independente dos efeitos duraveis. Screenshot isolado, abertura de pagina, resposta HTTP 200 ou teste simulado nao certificam jornada.
3. **Auditoria inclui reparo:** ao encontrar falha corrigivel no escopo autorizado, investigar causa raiz, corrigir, prevenir recorrencia, executar testes e **repetir o mesmo fluxo pela UI real apos correcao/deploy**, com evidencia independente. Nao encerrar no diagnostico, em PR ou em teste apenas de backend.
4. **Gate fail-closed, sem falso APTO:** qualquer fluxo com UI nao percorrido e comprovado permanece `NAO_VALIDADO_UI` / `NAO_APTO`; e proibido declarar `APTO`, `CONCLUIDO`, 100% ou verde. `browser.required=false` ou `journey.ui=false` nao podem ser usados para ocultar UI existente. Se realmente nao existir interface para o componente auditado, registrar inventario negativo de UI, justificativa e evidencias; validar os caminhos reais nao visuais pertinentes. Ausencia/falha transitoria de browser exige reparo/fallback autorizado antes de `BLOCKED_EXTERNAL`.
5. **Seguranca:** usar browser/desktop/MCP/RDC nos hosts e perfis previstos nos runbooks, com ownership/leases, controles de autorizacao e MFA; preservar sessoes. A auditoria nao autoriza exclusao, faturamento real, modificacao irreversivel ou acesso a segredo. Quando a acao terminal nao puder ser realizada com seguranca, testar ate o limite seguro e registrar exatamente a cobertura pendente; nunca inventar sucesso.

Fonte complementar: `AUDIT_POLICY.md`, `docs/quality/AUDIT_BROWSER_E2E_REAL_V1.md` e `docs/quality/AUDIT_ABSOLUTE_GATE_V1.md` do repositorio governado. **Este gate prevalece sobre instrucoes mais brandas que permitam certificar por API ou parecer do agente.**
<!-- /EXTREME_AUDIT_UI_FIRST_HARD_GATE_V1 -->

<!-- REMOTE_ACCESS_EXHAUSTION_GATE_V1 -->
## Regra obrigatoria: esgotamento de todos os acessos remotos autorizados
Em `Retome`, `Continue`, `Prossiga`, `Siga` e tarefas em hosts, **uma falha de ferramenta, conexao, SSH, MCP, RDC, VPN ou login nao autoriza declarar bloqueio**.
1. Ler efetivamente `AGENTS.md`, o runbook do host e a referencia canonica `Vivaliz-site/site-shopvivaliz/docs/knowledge/host-access.md`; confirmar identidade do host, permissao e ferramenta.
2. **Inventariar e avaliar cada rota remota realmente provisionada, apropriada e autorizada**, seguindo a prioridade canonica: ShopVivaliz Remote Control MCP/controlador; RDC e RDC 2 quando habilitados e autorizados para o host; SSH privado/VCN/Tailscale e tuneis/reverse SSH documentados; GUI por `desktop_*`/bridge nativo/RustDesk; OCI Bastion/Compute Run Command/console serial/GitHub Actions **somente para bootstrap, recovery ou reparo** dentro das regras. Usar outras rotas apenas se documentadas e autorizadas.
3. Verificar cada caminho aplicavel com evidencias atuais de disponibilidade, conexao, permissao e identidade; diagnosticar e corrigir falhas tecnicas, repetir tentativas limitadas/idempotentes e mudar de rota enquanto houver alternativa segura viavel. Nao usar GitHub como transporte normal de comandos de runtime. Navegador ShopVivaliz permanece na VM backend, nunca em Windows sem autorizacao explicita da tarefa.
4. Persistir checkpoint nao secreto `remote_access_attempts` contendo host, canal, status (`PASS`, `FAILED`, `NOT_PROVISIONED`, `NOT_APPLICABLE`), evidencia, causa, correcao e proximo caminho. Nao afirmar que tentou um canal inexistente.
5. Manter `RUNNING` ate recuperar acesso e concluir/validar a tarefa; `BLOCKED_EXTERNAL` so depois de **esgotar e comprovar a inviabilidade de todas as rotas adequadas, seguras e autorizadas**. Para permissao humana obrigatoria, `AWAITING_APPROVAL` com acao exata.
Nao desabilitar MFA, RBAC, branch protection, limitacoes de acesso, controles de seguranca; nao expor credenciais, habilitar SSH publico, ou repetir indefinidamente tentativas improdutivas.
<!-- /REMOTE_ACCESS_EXHAUSTION_GATE_V1 -->

<!-- MANDATORY_AGENT_RULES_READ_GATE_V1 -->
## Leitura efetiva de regras antes de Retome/Continue/Prossiga/Siga

Cada comando curto e ordem de execucao. Antes de qualquer mutacao e no inicio de toda retomada, ler `AGENTS.md` vigente e os documentos exigidos em "Ordem de leitura", diretamente no GitHub ou clone atualizado; verificar SHA/ref e registrar checkpoint nao secreto `rules_loaded` com arquivos, SHA, data e sessao. Mera mencao de arquivos ou instrucao de chat nao prova leitura. Se a leitura falhar, registrar `RULES_NOT_LOADED` e recuperar rota autorizada antes de alteracoes; diagnosticos read-only seguros podem continuar. Carregar as regras especificas do modulo e aplicar o ciclo completo de execucao/correcao/teste/validacao, respeitando politica de branches e aprovacoes.
<!-- /MANDATORY_AGENT_RULES_READ_GATE_V1 -->

<!-- EXHAUST_AUTHORIZED_PATHS_BEFORE_BLOCKED_V1 -->
## Bloqueio somente apos esgotamento comprovado dos caminhos viaveis

**PROIBIDO declarar `BLOCKED_EXTERNAL`, `IMPEDIDO`, `INCONCLUSIVO` como encerramento ou pedir ao usuario que resolva falha tecnica enquanto existir qualquer acao segura, autorizada e tecnicamente viavel.** Antes de informar bloqueio:
1. Confirmar estado e causa raiz com logs, codigo, checkpoints, host e testes; distinguir falha transitoria, defeito local, permissao ausente e dependencia externa.
2. Tentar reparo local, configuracao correta, recuperacao de sessao, retry com backoff limitado e idempotencia, rota alternativa autorizada, ferramenta equivalente e recuperacao de integracao; escolher somente opcoes adequadas ao defeito real, sem repeticoes infinitas.
3. Em CI ou PR: verificar checks e logs, corrigir causa de falha, atualizar branch e repetir checks; nunca burlar branch protection, aprovacoes obrigatorias ou status checks.
4. Registrar para cada rota relevante: diagnostico, tentativa e resultado, evidencia, razao objetiva de inviabilidade e proxima alternativa. Se houver alternativa executavel, continuar `RUNNING` sem devolver a tarefa ao usuario.
5. Somente apos comprovado esgotamento de **todas as alternativas razoaveis e autorizadas aplicaveis**, registrar bloqueio objetivo com checkpoint recuperavel, dependencia externa especifica e passo exato para desbloqueio.
6. Nao executar ataques, bypass de MFA, captura de secrets, mudanca destrutiva nao autorizada, nem loops ilimitados. Falta de autorizacao obrigatoria permite `AWAITING_APPROVAL`, com escopo e aprovacao exata, sem falsas alegacoes de exaustao.

Esta regra aplica-se aos comandos `Retome`, `Continue`, `Prossiga`, `Siga` e a todas as tarefas operacionais, incluindo subagentes e controladores.
<!-- /EXHAUST_AUTHORIZED_PATHS_BEFORE_BLOCKED_V1 -->

<!-- RESUME_COMMAND_HARD_GATE_V2 -->
## GATILHO IMPERATIVO: RETOME / CONTINUE / PROSSIGA / SIGA

Qualquer mensagem do proprietario contendo somente `Retome`, `Continue`, `Prossiga` ou `Siga` (independentemente de maiusculas, minusculas ou pontuacao) e uma **ordem completa de execucao**, nao pedido de status, resumo, proposta, plano ou novo prompt. Nao exigir que o usuario repita a tarefa ou estas regras.

Obrigacoes de cada agente/subagente/worker:
1. Identificar a ultima tarefa pendente no contexto, checkpoints e estado vivo; comprovar o que ja foi feito e a proxima acao executavel.
2. Consultar AGENTS.md, regras centralizadas e runbooks do projeto; preservar sessoes, autenticacoes e progresso validos.
3. Executar a proxima acao imediatamente, continuando em sequencia ate entrega validada enquanto houver capacidade real, autorizacao e caminho seguro. Corrigir falhas de ferramentas, CI, APIs, MCP/RDC, navegador ou infra encontradas no caminho; usar fallback autorizado e retries idempotentes.
4. Nao encerrar por diagnostico, plano, PR, merge, timeout ou erro transitorio; executar testes, checks, integracao/deploy pertinentes e validacao funcional/E2E antes de `CONCLUIDO`.
5. Se a sessao/limite de ferramenta impedir continuar, registrar checkpoint fiel e dependencia exata; nao prometer execucao assincrona sem controlador de continuidade comprovadamente ativo.
6. Nunca burlar politicas de seguranca, revisao, CI, branch protection, MFA ou aprovacao necessaria. Diante de bloqueio externo real, documentar evidencias, alternativas tentadas e passo de desbloqueio; nunca marcar `CONCLUIDO` sem evidencias.

A simples resposta "retomado", um relatorio de problemas ou solicitar "diga prossiga" **nao satisfaz** esta regra. Evidencia de execucao e resultado funcional sao requisitos de aceite. Esta norma complementa, sem enfraquecer, as politicas especificas do repositorio.
<!-- /RESUME_COMMAND_HARD_GATE_V2 -->

<!-- AUTONOMOUS_RESUME_TO_VALIDATED_COMPLETION_V1 -->
## Regra obrigatoria: retomar e executar ate conclusao comprovada

- Em toda tarefa operacional, recuperar o ultimo estado e checkpoint confiavel antes de agir; nao repetir operacoes ja concluidas nem descartar trabalho existente.
- Agir autonomamente dentro das permissoes vigentes. Diagnostico, relatorio, PR aberto, tentativa de comando, timeout ou falha transitoria nao encerram a tarefa.
- Ciclo obrigatorio: **verificar estado -> executar -> identificar falhas -> investigar causa raiz -> corrigir -> prevenir recorrencia -> testar -> retomar -> validar**.
- Diante de erro de browser, MCP, RDC, API, CLI, rede, sessao, worker ou integracao, verificar se a acao anterior teve efeito, recuperar de forma idempotente e tentar alternativas tecnicamente viaveis, seguras e autorizadas.
- Usar checkpoints, logs e estado persistente quando existirem. Nunca alegar trabalho em segundo plano ou retomada automatica se nao houver controlador realmente configurado e ativo.
- Manter a tarefa `RUNNING` enquanto existir proxima acao segura e viavel no ambiente de execucao. Declarar `CONCLUIDO` apenas com evidencias frescas, testes pertinentes, regressao e validacao runtime/E2E quando aplicavel.
- Se houver bloqueio externo objetivo ou aprovacao obrigatoria pendente, registrar causa, evidencias, tentativas, checkpoint e acao exata para retomar; nao contornar protecoes de branch, autenticacao, MFA, politicas de seguranca ou controles de aprovacao.
- Respeitar regras especificas do repositorio, limites da sessao e escopo de autorizacao. Acao destrutiva ou irreversivel exige autorizacao adequada.
- A regra vale para agentes, subagentes, Codex, MCP/RDC, automacoes, debugging, auditorias, deploys e retomadas; a resposta final deve distinguir entrega comprovada de bloqueio documentado.

Fonte global da politica: `Vivaliz-site/site-shopvivaliz/REGRAS-AGENTES-CENTRALIZADAS.md`.
<!-- /AUTONOMOUS_RESUME_TO_VALIDATED_COMPLETION_V1 -->

<!-- AUDIT_EXTERNAL_REMEDIATION_V1 -->
> **AUDITORIA EXTERNA TAMBÉM É CORRETIVA:** auditoria interna, externa, independente, contraditória ou feita por outro agente/revisor segue o mesmo ciclo. Auditor externo com autorização deve corrigir, testar e reauditar. Se for read-only, o relatório não encerra: os achados corrigíveis seguem para executor autorizado e permanecem em andamento até correção + revalidação independente ou bloqueio externo comprovado.
<!-- /AUDIT_EXTERNAL_REMEDIATION_V1 -->

<!-- AUDIT_REMEDIATE_VALIDATE_GLOBAL_V1 -->
## Auditoria corretiva obrigatória

- Todo pedido de auditoria significa **investigar, corrigir, prevenir e validar**; não encerrar apenas relacionando erros.
- Todo achado material corrigível e autorizado deve ter causa raiz investigada, correção aplicada, prevenção pertinente, teste e reauditoria.
- Relatório, recomendação, plano ou issue são estados intermediários enquanto existir ação segura executável.
- APTO/COMPROVADO/CONCLUIDO exigem evidência fresca pós-correção e E2E real quando aplicável; sem falso-verde.
- Pendência só é aceitável após esgotar alternativas seguras, com evidência, causa e ação exata necessária para continuidade.
- Fonte global: `REGRAS-AGENTES-CENTRALIZADAS.md`, policy `AUDIT_REMEDIATE_VALIDATE_GLOBAL_V1`.
<!-- /AUDIT_REMEDIATE_VALIDATE_GLOBAL_V1 -->

<!-- DIAGNOSTIC_REMEDIATE_VALIDATE_GLOBAL_V1 -->
> **DIAGNÓSTICO É CORRETIVO EM QUALQUER TAREFA:** defeito confirmado exige correção segura, prevenção pertinente, testes e validação real/E2E aplicável antes de `CONCLUIDO`. Enquanto houver ação segura executável, permanecer `RUNNING`; somente `BLOCKED_EXTERNAL` comprovado permite encerrar sem corrigir.
<!-- /DIAGNOSTIC_REMEDIATE_VALIDATE_GLOBAL_V1 -->
# AGENTS.md — Regras obrigatórias para agentes

<!-- GLOBAL_BROWSER_VM_POLICY_V2 -->
> **NAVEGAÇÃO GLOBAL — VM OBRIGATÓRIA; WINDOWS PROIBIDO PARA BROWSER:** qualquer navegador, automação browser, sessão gráfica, Playwright/Selenium/CDP, Chrome/Chromium/Edge/Opera, CAPTCHA, MFA, consentimento ou validação visual deve usar por padrão e obrigatoriamente a VM backend `always-free-arm-1787907847-26` (`10.0.1.38`) e o Browser Worker privado. Para intervenção humana, usar `https://shopvivaliz.com.br/admin/browser-worker.php`. **Fred-Win (`LAPTOP-NIG4IFUU`) e `DESKTOP-KOCEPSV` não são destinos nem fallback para navegação.** Não perguntar qual máquina usar para browser: use a VM. Exceção somente se o proprietário ordenar explicitamente, na tarefa atual, o uso de um Windows específico para aquela navegação. Se a VM estiver indisponível, reparar o caminho VM/OCI Bastion/túnel privado ou registrar bloqueio real; nunca migrar silenciosamente para Windows. Workflows/relays Windows de browser são legado e não devem ser executados até serem migrados. A regra não proíbe Windows para tarefas não-browser que realmente dependam dele.

<!-- GLOBAL_BROWSER_SESSION_PROFILE_V1 -->
> **SESSAO CANONICA OPENAI/CHATGPT NA VM:** para qualquer navegacao em ChatGPT/OpenAI no Browser Worker, reutilize o contexto persistente existente com `persistent=true` e `profile=ai-squad-chatgpt`. Esse e o perfil canonico que deve preservar a autenticacao ja realizada. Nao criar perfil novo, nao usar `manual` como fallback e nao migrar para Fred-Win/KOCEPSV. Se a autenticacao expirar ou exigir MFA/CAPTCHA, abra **esse mesmo perfil** pela interface autenticada `https://shopvivaliz.com.br/admin/browser-worker.php`, conclua a autenticacao nele e continue reutilizando `ai-squad-chatgpt`. Labels/TTL de sessoes de trabalho podem variar, mas o profile para ChatGPT/OpenAI deve permanecer `ai-squad-chatgpt`, salvo ordem explicita do proprietario na tarefa atual.



<!-- SUPERPOWERS_EVERY_STAGE_V1 -->
> **@Superpowers CONTÍNUO E OBRIGATÓRIO:** toda conversa, sessão, agente e retomada de tarefa destes projetos deve usar @Superpowers **em cada etapa material**, não apenas no início. Reaplique a disciplina adequada ao passar por bootstrap/contexto, planejamento, investigação, coleta de evidências, implementação, debugging, TDD/testes, revisão, correção, PR/checks/merge, deploy, pós-deploy, auditoria e encerramento. Em `retome/continue/prossiga`, continue do último checkpoint comprovado sob @Superpowers. Se o runtime não expuser @Superpowers, registre `SUPERPOWERS_UNAVAILABLE` e aplique a metodologia equivalente sem fingir a chamada. Subagentes e automações delegadas herdam esta obrigação. Fonte local: `REGRAS-AGENTES-CENTRALIZADAS.md`; fonte canônica global: `Vivaliz-site/site-shopvivaliz`.

Este arquivo é a primeira leitura obrigatória de qualquer agente humano ou automatizado que trabalhar neste repositório.

## Acesso a infraestrutura e VMs

Antes de executar qualquer comando em VM Oracle Cloud, leia e siga obrigatoriamente [`AGENTS-VM-ACCESS.md`](AGENTS-VM-ACCESS.md). O runbook define as duas VMs atuais, o helper OCI `sv-oci-vm-run`, o SSH administrativo validado, a ordem de fallback e as regras para não expor secrets. Nunca presuma root no OCI Run Command.

## 1. Ordem de leitura

Antes de alterar código:

1. `README.md`
2. `AGENTS.md`
3. `docs/ARCHITECTURE.md`
4. `docs/AGENT_OPERATING_MODEL.md`
5. `docs/DEFINITION_OF_DONE.md`
6. README do módulo afetado
7. ADRs relacionados em `docs/adr/`
8. Issue/Task Contract da tarefa

Se houver conflito, a ordem de autoridade é:

`ADR vigente > ARCHITECTURE.md > AGENTS.md > módulo README > issue > implementação existente`.

## 2. Regras não negociáveis

- Não escrever diretamente em `main`.
- Uma tarefa deve usar branch/worktree próprio.
- Uma tarefa deve resultar em um PR focado.
- Não alterar arquivos fora do escopo declarado sem justificar no PR.
- Não modificar migration já aplicada; criar nova migration corretiva.
- Não inserir secrets no repositório, issue, PR, log ou teste.
- Não usar dados reais de pacientes em desenvolvimento ou teste.
- Não logar CPF completo, respostas de formulário ou conteúdo clínico.
- Não expor conteúdo clínico por WhatsApp/e-mail.
- Não usar `service_role` para operações interativas de usuários.
- Não contornar RLS por conveniência.
- Não remover auditoria, idempotência ou validações críticas.
- Não misturar status de agenda, financeiro e fiscal.
- Não recalcular regras históricas quando uma política futura mudar.
- Não usar float para dinheiro.
- Não criar integração live sem feature flag e homologação.

## 3. Limites entre módulos

Um módulo só pode consumir outro por:

- `public.ts`;
- contratos/tipos públicos documentados;
- IDs persistidos;
- eventos assíncronos documentados.

É proibido importar arquivos internos de outro módulo, especialmente `infrastructure/`.

Se uma nova dependência cruzada parecer necessária, pare e proponha alteração arquitetural/ADR.

## 4. Dados clínicos

O módulo `clinical` é zona de segurança elevada.

Somente `psychologist_owner` com MFA/AAL2 pode ler ou escrever conteúdo clínico.

Secretaria e contabilidade nunca recebem conteúdo clínico, inclusive por API, relatório, exportação, busca ou log.

Mudanças em RLS clínico exigem:

- teste positivo para psicóloga;
- teste negativo para secretaria;
- teste negativo para contabilidade;
- teste negativo para anônimo;
- revisão específica de segurança.

## 5. Financeiro

- Valores monetários: centavos inteiros.
- Percentuais: `numeric` com escala explícita.
- Pagamento não altera status de consulta automaticamente sem caso de uso explícito.
- Isenção exige justificativa e auditoria.
- Estornos e cancelamentos mantêm histórico.
- Nenhum registro financeiro relevante deve ser apagado fisicamente.

## 6. Agenda e política de cancelamento

Política inicial:

- 48 horas computáveis;
- sábado e domingo não contam;
- timezone de negócio `America/Sao_Paulo`;
- `policy_version` e deadline calculado devem ser persistidos.

Mudança de política só afeta novos registros conforme regra explícita; não alterar históricos silenciosamente.

## 7. Formulários e assinatura

- template é versionado;
- resposta assinada é imutável;
- qualquer correção gera nova versão;
- hash SHA-256 identifica o conteúdo congelado;
- link público usa capability token com escopo mínimo;
- token bruto nunca é persistido nem logado;
- conteúdo clínico não é enviado a terceiro sem decisão arquitetural e jurídica explícita.

## 8. Integrações externas

WhatsApp, e-mail, NFS-e e geração pesada de documentos devem passar por fila/worker quando a operação puder falhar ou ser repetida.

Todo consumidor externo precisa de:

- idempotency key;
- retry controlado;
- timeout;
- registro sanitizado de tentativa;
- estado de falha operacional visível;
- mock/sandbox para testes.

Webhooks entram por `inbox_events` com `provider_event_id` único antes do processamento.

## 9. Cron

Cron identifica trabalho e enfileira jobs. Não executar envio externo pesado diretamente no cron.

Jobs precisam ser seguros para reexecução.

## 10. Logs e auditoria

Log técnico e audit log são conceitos diferentes.

### Log técnico pode conter

- correlation/request id;
- entity UUID;
- código de erro;
- duração;
- provider status sanitizado.

### Log técnico não pode conter

- CPF completo;
- nome + diagnóstico/contexto clínico;
- respostas de formulário;
- tokens;
- secrets;
- XML fiscal bruto com PII.

Audit log registra ações relevantes de usuário/sistema e não pode depender de `console.log`.

## 11. Banco e migrations

- SQL é fonte de verdade do schema.
- RLS é obrigatório nas tabelas expostas.
- Foreign keys explícitas.
- Mudanças destrutivas exigem plano de migração e rollback/restore.
- Seed usa apenas pessoas e documentos fictícios.
- Produção nunca é usada para testes.

## 12. Testes mínimos por tipo de mudança

### Regra de domínio
Unit tests de casos normais e bordas.

### Banco/RLS
Integration + authorization matrix.

### Integração
Contract tests + idempotência + retry.

### Fluxo crítico
Playwright E2E.

### Correção de bug
Primeiro criar teste que reproduz o bug; depois corrigir.

## 13. Segurança de dependências

Antes de adicionar uma biblioteca:

- justificar por que código nativo não basta;
- verificar manutenção/licença;
- evitar pacote que duplique recurso já fornecido pela plataforma;
- pin/lockfile obrigatório;
- nenhuma dependência para uma função trivial.

## 14. Alterações arquiteturais

Criar/atualizar ADR antes de:

- mudar modelo de autorização;
- mudar fonte de verdade;
- introduzir serviço externo estrutural;
- quebrar contrato público de módulo;
- mudar política histórica;
- extrair microserviço;
- introduzir nova fila/broker;
- mudar representação monetária ou temporal.

## 15. Handoff obrigatório no PR

Todo PR deve informar:

- objetivo;
- escopo;
- arquivos principais;
- migrations;
- contratos alterados;
- variáveis de ambiente novas;
- testes executados;
- impacto em segurança/privacidade;
- impacto em financeiro/fiscal;
- riscos conhecidos;
- passos de rollback quando aplicável.

## 16. Definition of Done

Nenhum agente pode declarar tarefa concluída antes de cumprir `docs/DEFINITION_OF_DONE.md` e apresentar evidência de execução dos checks aplicáveis.

## 17. Regra de ouro

**Se uma mudança facilita o código mas reduz segurança, auditabilidade, isolamento de módulo ou clareza histórica, a mudança está errada.**

## 18. Estado de reports e release

- `reports` consome somente contratos públicos/read models administrativos,
  financeiros e fiscais; nunca importa `clinical` ou conteúdo clínico.
- Dashboard e relatórios usam centavos inteiros e exportações não incluem
  respostas, envelopes, anexos clínicos, secrets ou payload bruto de provider.
- Logs técnicos passam por redaction e usam correlation IDs opacos; health não
  expõe URLs, tokens ou dados pessoais.
- `docs/operations/GO_LIVE_CHECKLIST.md` é `NO-GO` por padrão. CI/E2E, restore,
  revisão jurídica, formulário real, dados fiscais e credenciais externas
  precisam de evidência antes de produção.
- Runbooks de backup/restore, incidente, rollback, privacidade e retenção são
  parte do estado operacional e devem ser atualizados junto do release.

## 18. Isolamento de ambientes

- `APP_ENV` aceita somente `local`, `test`, `preview`, `staging` e `production`.
- Local, CI e preview usam exclusivamente dados sintéticos verificados por `npm run seed:check`.
- Production nunca é usada para desenvolvimento, preview ou teste.
- Preview exige projeto/branch Supabase dedicado; staging é compartilhado e serializado.
- Promoção para staging ocorre pelo workflow canônico, com `concurrency: staging`, commit SHA explícito e migrations forward-only; após CI verde em `main`, a promoção pode ser disparada automaticamente pelo gate aprovado.
- Providers live permanecem desativados fora de production.

## 19. Política obrigatória de consumo de IA e execução recorrente

- Claude, GPT/OpenAI e Codex pagos são permitidos somente em tarefas finitas, com objetivo concreto, e devem encerrar ao concluir ou atingir bloqueio real.
- É proibido usar IA paga em daemon, service loop, cron/timer periódico, watcher, autorepair, supervisor, polling ou retry sem limite.
- Rotinas permanentes/periódicas devem ser determinísticas. Se IA for indispensável, usar opção gratuita/local aprovada, com limite de chamadas e sem fallback silencioso para provedor pago.
- Toda tarefa finita com IA paga deve ter circuit breaker: timeout, limite de retries/chamadas/contexto, condição de saída e checkpoint quando necessário. Ao atingir limite, encerrar em vez de relançar automaticamente.
- Antes de habilitar ou manter automação, auditar consumidor por consumidor: necessidade real, host, gatilho, frequência, provedor/modelo, custo, timeout, retries, limite de chamadas, condição de saída e duplicidade/orfandade.
- Processo travado, órfão ou sem progresso deve ser encerrado e ter a causa raiz investigada; reinício infinito é proibido.
- Workflows GitHub com IA paga devem exigir gatilho explícito/restrito. Eventos genéricos, comentários de bots, pushes ou `schedule` não podem disparar Claude/GPT/Codex automaticamente.
- Fallback de automação deve seguir: determinístico → IA local/gratuita → paid somente em tarefa finita explicitamente autorizada. Para rotinas recorrentes a cadeia termina antes do provedor pago.
- Teste de credencial não deve consumir modelo pago quando validação de configuração/formato for suficiente.
- Registrar sem secrets início/fim, gatilho, provedor/modelo, tentativas, duração e resultado de qualquer consumidor de IA.

## 20. Política obrigatória de PR, gate, merge e bloqueios

- Toda tarefa finalizada deve terminar em PR validado e merge; não deixar PR pronta aberta sem motivo técnico comprovado.
- Se qualquer check, lint, teste, gate, conflito ou Action falhar: investigar causa raiz, corrigir, revalidar e repetir até ficar verde. É proibido contornar falha com bypass, `|| true`, `exit 0`, force merge ou desativação de proteção.
- Gate verde autoriza merge automático somente para PR do próprio repositório e depois de todos os checks canônicos aplicáveis passarem.
- Bloqueio aparentemente externo não encerra a tarefa. Investigar solução segura em configuração, credencial, permissão, serviço, ambiente, provider ou infraestrutura antes de classificar como inconclusivo.
- Depois do merge, verificar os Actions do SHA resultante. CI verde em `main` deve acionar automaticamente a promoção canônica de staging; produção continua sujeita aos gates de ambiente e às proteções clínicas/fiscais vigentes.
- Nunca automatizar aprovação que reduza RLS, MFA/AAL2, isolamento de ambiente, proteção de dados clínicos, idempotência financeira/fiscal ou feature flags live.

## Isolamento obrigatorio de sessao CLI por chat

Antes de qualquer operacao em terminal/CLI, leia e cumpra a secao `Isolamento obrigatorio de sessao CLI por chat` de `AI-TO-CLI-PROTOCOL.md`. Cada chat deve usar sessao/namespace CLI exclusivo; reutilizacao de sessao entre chats e proibida. Estado necessario para retomada deve ser persistido fora da memoria do shell.
Regra de continuidade: leia e cumpra `AI-TO-CLI-PROTOCOL.md`, especialmente `Continuidade obrigatoria diante de falha de ferramenta ou comando`; erro de ferramenta nao autoriza encerrar a tarefa.

## Continuidade obrigatoria
Todo agente deve cumprir o `PROTOCOLO OBRIGATORIO DE CONCLUSAO DE TAREFAS` em `AI-TO-CLI-PROTOCOL.md`; erro de ferramenta ou resultado parcial nunca e motivo para parar.


<!-- AUDIT_ABSOLUTE_V5_ENTRYPOINT -->
## Auditoria Extrema V5 absoluta — entrada obrigatória
Antes de qualquer auditoria completa/extrema, validação de release ou declaração de aptidão, leia e execute integralmente `AUDIT_POLICY.md`, `docs/quality/AUDIT_ABSOLUTE_GATE_V1.md`, `docs/quality/AUDIT_BROWSER_E2E_REAL_V1.md`, `docs/quality/AUDIT_APTO_REMEDIATION_LOOP_V1.md`, `docs/quality/AUDIT_AUTH_CREDENTIAL_DISCOVERY_V1.md`, `docs/quality/AUDIT_PROJECT_REQUIREMENTS_V1.md` e `docs/quality/AUDIT_PROJECT_REQUIREMENTS.json`.
Se existir UI, o próprio agente executa E2E real no navegador gráfico no mesmo release. API/CLI/headless-only não certificam. Todo bloqueador executável deve ser corrigido, testado, deployado quando aplicável e reauditado até o certifier retornar `AUDIT_VERDICT=APTO`. Antes de declarar bloqueio por login/credencial, esgote a descoberta segura em todos os repositórios governados e fontes canônicas sem expor secrets.


<!-- AUDIT_MERGE_ENFORCEMENT_V1 -->
## Enforcement absoluto de merge/main
Para auditoria/aptidão, cumpra `docs/quality/AUDIT_MERGE_ENFORCEMENT_V1.md`. O gate local deve executar `scripts/absolute-audit-governance-validate.sh`, e todo push em `main`/`master` deve passar pelo **Absolute Audit Main Guard** com prova de PR mesclado.

<!-- GLOBAL_TASK_CONTINUITY_V8 -->
## Global task continuity V8
Toda tarefa que possa alterar código, infraestrutura, dados, CI ou deploy deve manter checkpoint durável via `python3 scripts/agent_task_state.py`. Este repositório é fixado como `repository=Vivaliz-site/solange-rolla-consultorio`. Falhas recuperáveis permanecem RUNNING e conclusão exige verificação fresca. O adapter falha fechado sem o controlador canônico injetado pelo runtime detached. Background recovery permanece Gemini-only; Codex nunca é fallback automático e continua sendo a última opção finita explícita.
<!-- /GLOBAL_TASK_CONTINUITY_V8 -->

<!-- CHECKPOINT_FIRST_V9 -->
## Checkpoint antes da primeira etapa material
Toda tarefa potencialmente longa ou mutável deve registrar `agent_task_state.py start`
**antes** da primeira investigação extensa, chamada remota material, edição, mutação,
execução longa, delegação ou espera de CI. O objetivo é eliminar a janela em que uma
interrupção do ChatGPT ocorre antes de existir estado durável.

Depois de cada avanço material, atualize `progress` com evidência e `next_action`.
Não adie o primeiro checkpoint para depois do diagnóstico. Se o contexto atual não
consegue alcançar o controlador canônico, falhe fechado para tarefas que dependem de
retomada automática e use a rota operacional auditável que consiga registrar o estado.
<!-- /CHECKPOINT_FIRST_V9 -->

<!-- SHOPVIVALIZ_GRAPHICAL_SESSION_RECOVERY_V1 -->
## Gate obrigatorio para todos os agentes: GUI ShopVivaliz e contas ChatGPT

Antes de diagnosticar RustDesk, VM, autenticacao Dev/Atendimento ou classificar um login como perdido, **ler efetivamente no `main` de `Vivaliz-site/site-shopvivaliz`** o runbook `docs/knowledge/shopvivaliz-graphical-session-recovery.md`, junto de `AGENTS.md` e `docs/knowledge/browser-sessions.md`, registrando `rules_loaded` com SHAs. Esta regra aplica-se a ChatGPT, Claude, Gemini, Gepeto, subagentes e rotinas persistentes deste repositorio.

Fatos observados em 2026-10-11: a area XFCE/RustDesk `fredconsole/:0` foi recuperada e mostrou Chromium ChatGPT no workspace Vivaliz com Dev e Atendimento no seletor; a tela LightDM `lightdm/:1` e login do **Ubuntu**, nao login ChatGPT; os perfis corporativos independentes permanecem no usuario `fredrdp`, display `:99`, Dev CDP9559 e Atendimento CDP9556. **Ver conta no seletor nao prova autenticacao individual**: exigir identidade exata em `/api/auth/session` no respectivo perfil antes de marcar `AUTHENTICATED`/`CONCLUIDO`. Nao reutilizar cookies entre perfis, nao destruir sessoes, nao solicitar senha ja provisionada e nao redefinir o GNOME Keyring por tentativa. Usar somente senha existente + TOTP oficial conforme preferencia atual do proprietario, respeitando etapas do provedor, MFA, lease e aprovacoes. Preservar checkpointer e monitor; `RUNNING` ate progresso real.
<!-- /SHOPVIVALIZ_GRAPHICAL_SESSION_RECOVERY_V1 -->
