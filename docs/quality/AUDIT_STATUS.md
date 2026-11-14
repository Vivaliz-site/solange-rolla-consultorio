# Estado da Auditoria

**Status:** NÃO APTO

Auditoria de governança/meta-auditoria executada sobre as próprias diretrizes de auditoria (`AUDIT_POLICY.md`, `EXTREME_AUDIT_PROTOCOL.md`, `AUDIT_RUNTIME_PARITY_V1.md`, `AUDIT_OVERLAY.md`) e sobre o estado local do código, a partir de uma sessão remota sem acesso a VM/homologação/staging/produção. Esta rodada **não substitui** a auditoria operacional completa (UI real, staging, produção, backups) exigida pelo protocolo — ela documenta explicitamente o que foi comprovado localmente e o que permanece dívida de evidência.

## Achado de governança (P0, corrigido nesta rodada)
**COMPROVADO — mesma classe de falha já registrada em 2026-09-17.** A entrada anterior deste ledger cobria o SHA `eff6220ea0ed530bfae48395a7da894a5cdf6f6c` (2026-09-17) e não foi atualizada apesar de **22 commits materiais** terem entrado em `main` desde então (PRs #181 a #256), incluindo mudanças em área clínica (`fix(clinical): audit record writes atomically`, #205), segurança/dependências (`security(deps): remediate npm audit high findings`, #251; `security(deps): update Next.js to 16.3.8`, #253), backup/restore (`fix(backup): restore dump into empty public schema`, #182), paridade de runtime publicado (`fix(audit): enforce published runtime parity`, #195) e a própria governança de auditoria (`audit: propagate absolute Extreme Audit V5`, #237; `audit: sync V5 merge enforcement and main guard`, #238). Pela própria regra de `AUDIT_POLICY.md` ("mudança material posterior invalida a cobertura correspondente"), o veredito de 2026-09-17 já estava formalmente inválido antes desta rodada.

Causa raiz: a recomendação já registrada na rodada anterior (check de CI que bloqueie merge de escopo crítico sem atualização correspondente deste ledger) não foi implementada entre #181 e #256. Continua sem gate mecânico. Reafirmado como pendência sistêmica.

## Última auditoria válida (evidência local)
- Data: 2026-10-01 (duas rodadas na mesma sessão: evidência estática primeiro, depois Docker/Supabase/E2E real — ver seção seguinte)
- Commit/SHA auditado: `2fe46991...` (`origin/main`, HEAD no momento desta rodada)
- Release/ambiente comprovado: árvore local, nesta sessão, **incluindo agora Supabase local via Docker e navegador Chromium real** (ver "Evidência adicional" abaixo) — ao contrário do que a primeira rodada desta mesma sessão presumiu, Docker e um Chromium pré-instalado **estavam disponíveis**; a suposição inicial de bloqueio total de Docker/browser estava errada e foi corrigida na mesma sessão, por instrução explícita do responsável ("precisa executar todo o protocolo").
- **Nenhuma evidência de homologação/produção (VM/staging real) foi reproduzida** — a sessão não tem rota de rede para a VM de homologação/staging (apenas HTTPS a hosts allowlisted). Isso é diferente de pgTAP/RLS e E2E locais, que não dependem dessa rota e **foram** reproduzidos nesta rodada.
- Veredito: **NÃO APTO PARA PRODUÇÃO** (mantido — paridade de runtime publicado, backup/restore real, rollback e workers em ambiente implantado continuam sem prova), mas com **confiança elevada** em relação à rodada anterior: pgTAP/RLS e a suíte E2E local (UI real, Chromium real, contra Supabase local) passaram a ser evidência **PASS**, não mais NÃO VALIDADO.
- Confiança do veredito quanto ao código local: **alta**, agora incluindo comportamento de runtime real via browser (não só build/lint/unit). **Inalterada (dívida de evidência)** apenas para o que depende especificamente de staging/produção publicados (paridade de SHA servido, backup/restore de Storage gerenciado, rollback, workers em produção).

## Evidência reproduzida no SHA `2fe4699...` (local, sem Docker/Supabase/staging)
- `npm install`: PASS, mesmo aviso de `engines` já conhecido (`node` esperado `24.19.0`, ambiente usou `22.22.2`); `npm audit`: **0 vulnerabilidades** (consistente com #251/#253, mesclados desde a rodada anterior).
- `npm run typecheck`: PASS.
- `npm run lint`: PASS, 0 erros, 2 warnings não bloqueantes — mesmos já conhecidos (`window.location.assign` em `login-form.tsx` e `session-controls.tsx`), ainda não corrigidos desde 2026-09-17.
- `npm run arch:check`: PASS, 483 módulos / 1081 dependências, sem violações.
- `npm run modules:check`: PASS.
- `npm run migrations:check`: PASS.
- `npm run test:run`: **677 PASS / 1 SKIP** (208 arquivos PASS / 1 arquivo SKIP). Os dois stack traces impressos durante a execução, de `scripts/preview-env.mjs` e `scripts/staging-lock.mjs`, continuam sendo comportamento esperado de scripts de guarda sendo exercitados por teste, não falha.
- `npm run build`: PASS (build de produção Next.js/Turbopack, as 19 rotas geradas sem erro).
- `bash scripts/absolute-audit-governance-validate.sh`: **PASS** — todos os `GLOBAL_BLOB`/`GLOBAL_ENTRYPOINT` do manifesto de governança absoluta presentes e íntegros; `GLOBAL_AUDIT_POLICY=PASS version=2026-09-21-absolute-v5`; `ABSOLUTE_AUDIT_GOVERNANCE_BRIDGE=PASS`.

## Evidência adicional — Docker/Supabase local e E2E real (mesma sessão, após reinvestigação de viabilidade)

A primeira rodada desta auditoria (evidência acima) presumiu Docker/browser indisponíveis e marcou pgTAP/RLS e E2E como NÃO VALIDADO. Por instrução explícita do responsável ("Precisa executar todo o protocolo"), a viabilidade foi reinvestigada em vez de mantida como presumida — e **Docker estava de fato disponível** (`sudo dockerd` sobe normalmente no container da sessão) e `tests/e2e/runtime-config.ts` tem um modo **inteiramente local** (`next start` próprio, sem `E2E_BASE_URL`) que não depende de rota de rede para a VM de homologação. Isso **invalida parcialmente** o achado P1 original desta mesma rodada ("gate de paridade de runtime estruturalmente inexecutável a partir de uma sessão de agente") — inexecutável continua sendo especificamente a paridade contra **staging/produção publicados**, não pgTAP/RLS nem E2E local, que se mostraram executáveis.

- `npx supabase@2.118.0 start` (Docker): **PASS** — 71 migrations aplicadas, stack local no ar (API `:54321`, Postgres `:54322`).
- `npm run supabase:test` (pgTAP/RLS): **PASS — 583/583 testes, 52 arquivos**, cobrindo RLS clínico (`psychologist_owner`/AAL2), atomicidade financeira (contas a pagar/receber, recorrentes), segurança fiscal e demais domínios cobertos pela suíte pgTAP do repositório.
- `npm run test:e2e` (Playwright, Chromium real — `/opt/pw-browsers/chromium`, pré-instalado no ambiente da sessão, via `executablePath` passado por variável de ambiente sem alterar o repositório): primeira execução, **11/71 PASS**, 60 falhas com assinatura idêntica (`console.error: Failed to load resource: ... 404`) em praticamente toda página — achado real de produto, não ruído de ambiente: **`src/app/` nunca teve `favicon.ico`**, e a fixture compartilhada (`tests/e2e/fixtures.ts:78`) falha qualquer teste com `console.error`/`requestfailed` inesperado (política de zero tolerância já documentada neste mesmo protocolo). Corrigido nesta sessão (SAFE, escopo mínimo) com um `.ico` multi-tamanho gerado a partir da marca existente — **PR #258** (`fix/add-favicon-e2e-404`, aberta, aguardando CI/merge).
  - Após o fix e reset do banco local (`supabase db reset`, para eliminar poluição de estado entre as duas execuções da suíte completa na mesma sessão — a primeira rodada, com Chromium ainda quebrado, já tinha deixado dados parciais): segunda execução completa, **71/71 PASS**, incluindo `real-ui-homologation.spec.ts` (homologação operacional canônica via UI real: AAL2, registro clínico, capability de paciente, fiscal, financeiro, agenda).
- **Conclusão desta subseção:** pgTAP/RLS e E2E local (UI real) deixam de ser NÃO VALIDADO e passam a **PASS**, com um achado de produto real (favicon ausente) identificado, corrigido e em PR própria — consistente com a regra `AUDIT_REMEDIATION_COMPLETENESS_V1` de corrigir achados SAFE/P0–P2 dentro da própria rodada de auditoria, em vez de apenas reportá-los.

## Não executado nesta rodada — permanece **NÃO VALIDADO**
- Paridade SHA candidato × SHA servido em homologação/produção (`/api/health.buildSha`): não reverificado — depende de rota de rede para o ambiente publicado, que esta sessão não tem; apesar de #195 (`fix(audit): enforce published runtime parity`) ter mexido exatamente nessa área desde a última auditoria válida.
- Proveniência/lockstep dos workers de mensageria, documentos e recurring-payables **em ambiente implantado**: não reverificado (o comportamento local de atomicidade dessas mutações está coberto pelo pgTAP acima, mas não o worker real rodando contra infraestrutura publicada).
- Backup/restore de Storage privado e custódia de chaves externas **reais** (gerenciadas pelo provedor): não reverificado, apesar de #182 (`fix(backup): restore dump into empty public schema`) ter mexido exatamente nessa área — o comportamento de restore contra um schema local vazio não foi exercitado nesta rodada.
- Rollback do release candidato em ambiente implantado: não reverificado.
- Mudança de infraestrutura de staging introduzida por #256 (`fix(staging): decouple acceptance from ephemeral tunnel`) e #241/#242 (CI/runner): não validada operacionalmente nesta rodada — só a presença/sintaxe local foi coberta indiretamente pelos checks acima, não o comportamento real do pipeline de staging.

Diferente da rodada anterior (2026-09-17), **pgTAP/RLS e E2E local não são mais itens desta lista** — foram efetivamente executados e comprovados nesta sessão (ver "Evidência adicional" acima). Os itens que permanecem são especificamente os que dependem de staging/produção publicados, backup/restore gerenciado real, rollback real e workers em ambiente implantado — nenhum alcançável sem rota de rede para essa infraestrutura, que esta sessão não possui.

## Matriz de cobertura (delta desta rodada)
| Área | Resultado | Evidência / pendência |
| --- | --- | --- |
| Governança do próprio ledger de auditoria | **CORRIGIDO (recorrência)** | ledger desatualizado por 22 commits/PRs desde 2026-09-17; atualizado agora; gate mecânico recomendado ainda não existe |
| Governança de auditoria absoluta (manifesto V5) | PASS | `absolute-audit-governance-validate.sh` verde, todos os blobs/entrypoints presentes |
| Build/lint/typecheck (local, SHA atual) | PASS | evidência acima |
| Dependências/segurança (`npm audit`) | PASS | 0 vulnerabilidades |
| Unitários/integração (local, SHA atual) | PASS | 677 PASS / 1 SKIP |
| Arquitetura/módulos/migrations | PASS | contratos verdes |
| pgTAP/RLS (52 arquivos) | **PASS** | 583/583 testes, via Docker/Supabase local nesta sessão |
| E2E local (UI real, Chromium) | **PASS** | 71/71 testes, incluindo `real-ui-homologation.spec.ts`; achado real (favicon ausente) corrigido em PR #258 |
| Staging, produção, backup/restore real, rollback, workers em ambiente implantado, paridade de runtime publicado | **NÃO VALIDADO** | sem rota de rede para VM/staging/produção nesta sessão — único grupo de itens genuinamente fora de alcance local |

## Achados nas diretrizes de auditoria (meta-auditoria)
- **P0 — recorrência do achado de 2026-09-17: nenhum gate mecânico impede o ledger de ficar obsoleto.** Já recomendado antes (check de CI bloqueando merge de escopo crítico — auth, schema, financeiro, workers, deploy, backup/restore, staging — sem atualização correspondente de `AUDIT_STATUS.md`). Permanece não implementado após 22 commits adicionais, incluindo múltiplos PRs rotulados `audit:`/`fix(audit)` que, pela sua própria natureza, deveriam ter disparado essa atualização. Reafirmado como pendência sistêmica prioritária, fora do escopo de correção `SAFE` desta rodada documental.
- **P1 (herdado, corrigido parcialmente nesta rodada) — Gate de paridade de runtime (`AUDIT_RUNTIME_PARITY_V1.md`) é inexecutável a partir de uma sessão de agente sem rota de rede para o ambiente publicado, mas isso é mais estreito do que esta mesma rodada presumiu inicialmente.** Pela própria sessão: a presunção inicial de que Docker e browser estariam indisponíveis estava errada (Docker sobe via `sudo dockerd`; há Chromium pré-instalado no ambiente) e pgTAP/RLS + E2E local **são** executáveis sem essa rota de rede. O que continua genuinamente inexecutável sem a rota é especificamente a paridade **SHA candidato × SHA servido em staging/produção**, backup/restore gerenciado real, rollback real e workers em ambiente implantado. Nenhuma sessão nessas condições deve declarar `APTO` só por isso — deve declarar `NÃO APTO` com a dívida de evidência explícita, exatamente como feito aqui — mas também não deve presumir bloqueio total sem reinvestigar a viabilidade real de Docker/browser antes de marcar itens como NÃO VALIDADO.
- **P3 (herdado, não corrigido) — Ausência de prazo de validade explícito para um veredito `NÃO APTO`/`APTO`** além de "mudança material invalida". Permanece como decisão de política pendente do responsável pelo projeto.

## Regra de validade
Esta entrada cobre o código-fonte no SHA `2fe4699...` quanto aos checks locais listados (build/lint/typecheck/unit/arquitetura/migrations), **e também quanto a pgTAP/RLS e E2E local via UI real (Chromium)**, ambos comprovados PASS nesta rodada via Docker/Supabase local. Não recertifica homologação, produção, backup/restore gerenciado real, rollback real, workers em ambiente implantado nem paridade de runtime publicado — todos permanecem `NÃO VALIDADO`, agora restritos especificamente ao que depende de rota de rede para staging/produção publicados, que esta sessão não tem. Qualquer mudança material subsequente (schema, auth, financeiro, workers, deploy, backup, staging) invalida esta cobertura e exige nova entrada. A correção do achado de produto desta rodada (favicon ausente, causa das 60 falhas E2E iniciais) está em PR #258, ainda não mesclada no momento desta entrada — enquanto não mesclada, o SHA de `main` ainda não contém o fix, apenas o branch desta auditoria o valida localmente.

<!-- AUDIT_DELTA_V1 -->
## 2026-10-13 - Remediacao incremental de governanca (#281)

- Base SHA: 500890047d5ad725c462c14a02c206a2d02651b4
- Impacto: corrigido o mecanismo de auditoria para detectar PRs e pushes materiais que tentem entrar sem atualizar o ledger; politica e historico antigo preservados; somente o repositorio ativo e afetado.
- Testes: 28 testes unittest em repositorios Git isolados aprovados no ambiente de desenvolvimento, incluindo RED para mudanca material sem ledger, GREEN para registro completo, exclusao de documento, merge-base avancado, SHA invalido, evidencia falsa e verificacao do wiring; seis falhas RED adicionais (deleção isolada do ledger, reescrita histórica isolada, especificações e planos materiais, README de regras de negócio, registro de release/linhagem), corrigidas para GREEN; mais cinco asserções RED para documentos críticos/contratos Markdown desconhecidos, corrigidas para GREEN; sintaxe bash e compilacao Python verificadas.
- Evidencias: issue #281; validador scripts/validate-audit-ledger-delta.py; testes tests/test_validate_audit_ledger_delta.py; integracao em repository-governance-validate.sh e workflow repository-governance.yml; CI remoto, PR e revalidacao pos-merge ainda devem ser observados.
- Pendencias: atualizar evidencias apos a execucao dos checks do PR e de main; nenhum destes testes certifica seguranca clinica, staging publico, workers, emissao NFS-e, restore de Storage, rollback ou paridade de release; aplicar integralmente o protocolo V5 antes de certificar producao.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-10-13 — Correção do gate global V5: UI obrigatória e certifier à prova de falso-verde (#149)

- Base SHA: 16b8713f95197bad39782ff3929f965b7146c60f
- Evidencias: manifest oficial V5 ref 6df9d8bdaddf0639e1d0a123df27452b9c941681; CI RED #38423275686: divergencias nos blobs AUDIT_POLICY, certifier, browser/apto protocol, gate UI V2, regras e governance script; scripts/audit_ui_evidence_gate.py, tests/test_audit_ui_evidence_gate.py, docs/quality/AUDIT_UI_EVIDENCE_INTEGRITY_V2.md; PR #288 e issue #149.
- Impacto: sincronizacao fail-closed do contrato canônico V5 UI-first e AUDIT_UI_EVIDENCE_INTEGRITY_V2 no repositorio ativo, incluindo a verificacao de artefatos UI assinados por hashes, inventario de casos, rastros de browser, reauditoria independente e persistencia pos-deploy, sem tocar producao nem rebaixar protecoes.
- SAFE: sincronizados, sem reescritas locais ad hoc, `docs/quality/GLOBAL_AUDIT_MANIFEST.json`, `docs/quality/AUDIT_CERTIFICATION_MANIFEST_TEMPLATE.json`, `scripts/certify-audit-manifest.py` e `tests/test_certify_audit_manifest.py` com blobs **idênticos ao repositório canônico** (SHAs validados). `AGENTS.md` recebeu somente o novo bloco de UI-FIRST na cabeça, preservando todas as instruções específicas existentes. Escopo de correção isolado em branch/PR próprios.
- Testes: RED remoto no Absolute Audit Governance #38423275686 e no Repository Governance #38426386701 devido a duas mudancas subsequentes na politica canonica apos evolucao de politica oficial durante a PR; novos scripts e suites adversariais copiados com SHA oficiais do commit canônico 6df9d8bdaddf0639e1d0a123df27452b9c941681. GREEN remoto do head corrigido ainda pendente, nao autoriza AUDIT_VERDICT=APTO.
- Pendencias: checks do SHA final, review contraditoria humana autorizada, PRs #283/#286, paridade de main-releases-web-workers-staging, URL DNS, backup gerenciado Supabase e restore isolado, Storage privado, Auth/AAL2 e E2E grafico real com prova visual do mesmo release, certificador V5. A retencao de evidencias nao substitui operacao real.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-10-13 - Paridade de staging em fail-closed (issue #269 / #149 / PR #283)

- Base SHA: abf049e70da017781ad0d14ca99028487c8e6513
- Impacto: detector de staging confirma identidade de release em estado, arquivos de ambiente, web, workers, health local/publico, TLS e DNS; garante fail-closed quando existem chaves SHA duplicadas nos arquivos ou propriedades JSON repetidas no health, inclusive quando a ultima seria a esperada. A transacao de staging.env preserva snapshot e restore em rollback. Nova remediacao SAFE bloqueia redirecionamentos HTTP 301/302/303/307/308 antes da segunda requisicao e exige URL final exatamente igual a /api/health solicitado, evitando falso-verde de identidade. CI unit agora executa suites Python de paridade de staging, incluindo regressao contra URL trocada. Sem tocar ambiente publicado, banco, pacientes ou producao.
- Testes: suite original 19/19 de paridade e 12/12 de transacao runtime; reproducao RED no checkout isolado exato 4d0ce881a2c4735c061bc6c24d4d597b2be18b2c gerou 6 falhas nos 4 novos testes com variantes contraditorias e identicas de APP_BUILD_SHA, STAGING_COMMIT_SHA, buildSha e status. GREEN apos patch: 23/23 testes de paridade e 12/12 transacao runtime PASS, py_compile e git diff --check PASS. Rodada complementar da issue #149: RED 4/5 falhas (dominio, caminho, follow automatico, Python ausente na CI); GREEN 40/40 testes Python de staging, cobrindo cinco codigos 30x em servidor sintetico localhost, py_compile e git diff --check. CI de branch e testes UI de release publicado nao declarados verdes.
- Evidencias: issue #269 e central #149; ops/staging/verify-runtime-parity.py, tests/test_staging_runtime_parity.py, ops/staging/runtime-env-transaction.sh, tests/test_staging_env_transaction.py e workflow staging-promote.yml. Validacao de runtime anterior encontrou release divergente; teste dup de chaves feito somente com valores sintenticos em checkout isolado. Nova suite tests/test_staging_health_redirect.py e step obrigatorio Python em .github/workflows/ci.yml; regressao de redirecionamento e URL final sem acesso a hosts externos. Falha CI previa de Supabase db reset conta como bloqueio distinto a revalidar.
- Pendencias: revisao independente, gates canonicamente obrigatorios do head final, merge protegido, revalidacao pos-merge em staging no mesmo SHA/release, URL publica e jornadas reais por navegador sem flaky; comprovar backup e restore do Supabase gerenciado, Storage privado, autenticao/AAL2 e recuperacao, e certifier V5 oficial. A divergencia de politica global tem PR #288 independente; nenhuma excecao ou bypass permitido. Correcao de redirecionamentos testada apenas em checkout isolado; merge/deploy/release real permanecem pendentes.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-10-30 — Compatibilidade de traces Playwright no gate de evidência UI

- Base SHA: 88cca3455952d377cad0f5297b4d871c8122d487
- Impacto: `scripts/audit_ui_evidence_gate.py` agora reconhece o campo `method` usado em traces Playwright padrão (`goto`, `fill`, `click` e ações equivalentes), preservando suporte ao formato legado `apiName` e exigindo chamadas concluídas, contexto de browser, navegação e interação. Artefatos distintos podem ter capturas de screenshot com pixels idênticos; referências repetidas continuam rejeitadas, e traces/vídeos continuam exigindo digests únicos entre sessões. Sem alteração de runtime publicado ou dados clínicos.
- Testes: o teste de regressão `test_standard_playwright_method_trace_proves_navigation_and_interaction` foi incluído em `tests/test_audit_ui_evidence_gate.py`; no Repository Governance Gate (run 1105), os 28 testes unittest passaram antes da falha exclusiva de registro deste delta. Checks do SHA final ainda pendentes.
- Evidencias: diff do PR #303 no SHA `cff6823a839759a89d3efb617bcc458a97f00d2a`; alteração em `scripts/audit_ui_evidence_gate.py` e teste correspondente em `tests/test_audit_ui_evidence_gate.py`.
- Pendencias: aguardar checks do SHA final e revalidar governança após este registro. A auditoria de produção permanece não apta; esta alteração só cobre a interpretação de evidências UI no validador.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-10-30 — Remediação SAFE de proveniência e PITR Supabase (#191 / #149 / PR #286)

- Base SHA: ee3dab3d2a215ce510cdfbfff432e126c1c5b2e8
- Impacto: o script de dump local recusa a fonte Docker incorreta em staging gerenciado; health de backup exige identidade de projeto; workflow restrito a main/staging usa apenas metadados da API Supabase; a resposta JSON do provedor rejeita chaves repetidas em qualquer profundidade antes de decidir o modo de recuperação; PITR habilitado prevalece sobre snapshots, exige estado booleano explícito e timestamp finito/representável, rejeita metadados ausentes ou inválidos sem falso-verde nem exceção não tratada; snapshots históricos só contam com PITR explicitamente desabilitado. Corrigida também a ordem de staging: a evidência da fonte gerenciada agora é verificada antes de migrations, RLS e seed e revalidada no deploy no lugar do dump Docker legado. Preservados o isolamento e a ausência de dados clínicos e segredos.
- Testes: RED inicial 19 testes de verificador ausente e 9 casos de proveniência; GREEN inicial 31/31 Python. RED focal adicional no código exato ee950c6 da PR #286 com 8 falhas e 3 erros (PITR ausente/tipos errados, NaN, fora de intervalo, timestamp de snapshot irrelevante); GREEN no checkout isolado do mesmo SHA mais correção: 28/28 testes managed-backup e 12/12 source-guard, git diff --check aprovado. RED de busca de equivalente no head real 2628a8e: 3 falhas, em pitr_enabled, backups e latest_physical_backup_date_unix duplicados. GREEN no checkout isolado após correção: 29/29 managed-backup e 12/12 source-guard PASS, py_compile e git diff --check PASS. RED adicional da ordem de staging reproduzido (2 testes: 1 FAIL e 1 ERROR), GREEN após correção com 43/43 testes Python, YAML de staging e ordem das etapas PASS; reauditoria do Repository Governance Gate exact-head #38502661987 encontrou regressão em tests/integration/environment-workflows.test.ts: teste legado exigia dump Docker do banco errado. Atualizado o teste para exigir backup gerenciado antes das mutações, sem enfraquecer o gate nem aceitar o dump errado; nova regressão estática/CI pendente. git diff --check PASS. CI remoto exact-head pós-correção e regressão completa ainda não comprovados.
- Evidencias: scripts/verify-managed-backup-evidence.py, scripts/backup-homologation.sh, scripts/check-backup-health.sh, tests/test_managed_backup_evidence.py, tests/test_backup_source_guard.py, .github/workflows/staging-managed-backup-evidence.yml, PR #286; fault check read-only anterior identificou source_identity_mismatch e source_provenance no estágio legado; registro contemporâneo e links do CI na issue #149. A correção de dois blocos AUDIT_DELTA_V1 na mesma PR foi consolidada em um único registro requerido pelo validador, mantendo os achados.
- Correção pós-merge-base (30/10): o workflow ainda chamava `ops/backup/run-demo-scheduler.sh` no final. Esse scheduler sempre faz dump Docker local e torna-se `unhealthy` após o guard de fonte gerenciada, forçando rollback de homologação mesmo com metadata Supabase válida. Removido somente esse step legado do workflow, preservando as verificações do Supabase antes de migrations e durante deploy; nenhum container em execução foi alterado. Regressão estática adicionada em `tests/integration/environment-workflows.test.ts` com cenário RED (chamada legada presente) e GREEN (chamada ausente), CI exact-head ainda pendente. Isso não substitui restore real nem certificação de backup gerenciado.
- Pendencias: revisão independente, todos os checks obrigatórios exact-head e merge protegido; paridade global de políticas via PR #288 já mesclada, exigindo checks na PR atual; comprovação da API do Supabase gerenciado no projeto staging correto, backup/restore real isolado, retenção/RPO/RTO, Storage privado, autenticação/AAL2 e recuperação, identidade de release exata, navegador E2E real sem flaky e certificador oficial V5 no mesmo SHA/release/ambiente. Nenhum dado clínico, dump ou produção alterado.
- Integração de branch em 30/10: histórico de main preservado integralmente; CI exact-head, leitura do Supabase gerenciado, restore isolado, Storage e E2E gráfico ainda pendentes.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-10-14 - Correcao de cancelamentos de fila Database/E2E (#300) e escopo conservador de CI (#301)

- Base SHA: 1b48617f78c36ad82f7caa0c898de6716ce74cb9
- Impacto: preserva o lock GitHub Actions nao cancelavel `solange-local-supabase` entre E2E e Database e adiciona `queue: max` para preservar verificacoes concorrentes; o PR #301 classifica diffs de forma conservadora, mantendo lint como status fail-closed e rodando E2E/DB completos para workflows, politica, banco, modulos e arquivos desconhecidos. Somente README/docs estaticos podem pular suites clinicas/DB; nenhuma operacao de banco, producao ou secret.
- Testes: RED da configuracao original reproduzido em #300; Python do seletor no head atual 7/7 PASS local; testes de governanca executados no run #41154870487, 28/28 PASS. Esse run falhou somente na validacao de append-only do ledger; este registro foi movido para o final e o Base SHA alinhado ao merge-base de #301. CI exact-head e Database permanecem pendentes, sem alegar GREEN.
- Evidencias: #300 e #301; head inicial #301 `1a8be5fb8f0d880ed866f22705c3e916846b83dc`; run CI #41154870569 aguardando `impact_scope`, run Database #41154870470 com `impact_scope=success` e job `db=pending`; baseline historico de #300 `88cca3455952d377cad0f5297b4d871c8122d487`.
- Pendencias: novos checks no head corrigido, revisao independente, protecoes/required-contexts efetivos (API branch-protection negou acesso a esta integracao), merge protegido, promocao staging no SHA exato, backup gerenciado + restore, UI grafica e certificacao V5.

- Reconciliacao de governanca V5 (31/10): RED no job Absolute Audit Governance #124444839850 do HEAD anterior `04262f1`: `GLOBAL_MANIFEST_LOCAL_PARITY=FAIL` e tres `GLOBAL_BLOB=FAIL` (gate UI, seu teste e protocolo); causa: manifest/blobs locais anteriores ao canonico `Vivaliz-site/-shopvivaliz-pipeline@main`. Atualizados os tres blobs e `GLOBAL_AUDIT_MANIFEST.json` diretamente da origem canonica, sem afrouxar validadores; a politica reforca rede/resources/revisita/anti-replay. GREEN remoto exact-head e fila DB/E2E ainda exigidos; sem alteracao de dados, producao, scheduler ou autorizacoes.

- Correcao de CI por impacto em PR #301 (2026-10-31): RED comprovado no seletor anterior (README + AUDIT_STATUS e verificador isolado de metadados Supabase acionavam full/DB/E2E sem dependencia clinica). Ajustada classificacao: ledger append-only e auditado pelo gate obrigatorio, combinado somente com mudancas isoladas nao força banco/clinico; verificador puro de metadados Supabase e teste correspondente exigem core/unit, nao reset DB nem jornada clinica. Ledger como unica mudanca e caminhos desconhecidos/seguranca/migration/workflows permanecem FULL/fail-closed. Testes RED (2 falhas esperadas) e GREEN (10/10) no backend task 9184a7f5-33ca-4174-bebb-bfa5e1725543, audit 8ecb3486-1a78-4076-b045-8329707f760c; nova assercao de motivos sera revalidada no SHA final. Sem mudar politica de governance, guards clinicos, locks ou runner; gates oficiais/CI no head ainda requeridos.

- Reparo de CI Docker/porta (31/10): rerun Database #301 job 124541321909 falhou em dois starts com bind TCP 54322 ocupado, conforme journal Docker, mesmo apos `supabase stop` com sucesso; nao ha evidencia conclusiva do processo concorrente naquela janela. Aplicado preflight Python fail-closed de ate 120s em cada reinicio de DB e E2E, sem matar dono desconhecido e preservando lock/queue.
- Testes adicionais de regressao: cinco cenarios sintéticos de socket loopback (porta livre, ocupada, liberacao eventual, timeout, porta privilegiada) PASS em execucao local isolada; script e teste no commit conferidos por Git blob SHA. `tests/integration/ci-supabase-concurrency.test.ts` agora exige as tres chamadas de guarda em cada workflow. Governance exato #41221130496 registrou RED `AUDIT_LEDGER_DELTA=FAIL` quando havia dois registros novos; corrigido para UM registro desde merge-base, sem reduzir o certifier. Checks na ref corrigida, DB/E2E runtime e merge protegido ainda pendentes.
- Regressao CI E2E observada 31/10 ~19:20 UTC no run #41224914166 / job #124611853985: 66 PASS, 2 FAIL, 3 FLAKY. RED: valor financeiro fixo `R$ 900,00` ausente em dashboard que soma recebiveis dinamicos; selector global `getByText('Ana', exact)` produz strict violation em multiplos recebiveis legitimos. Correcao no mesmo PR #301 restringe o teste do card ao link `Abrir financeiro` e ao formato BRL dinamico, e escopa os nomes para a lista de recebiveis/pacientes sem aceitar lista vazia. Teste E2E e verificacao financeira exata em ambiente isolado ainda precisam GREEN oficial; falhas intermitentes de agenda cobranca/login nao foram ocultadas. Nenhum dado clinico/producao alterado.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-10-31 — Observabilidade segura de HTTP na evidência de backup Supabase (#191 / PR #307)

- Base SHA: 1d11a023093ff416adcb94f27bf0f755d024b13c
- Impacto: `scripts/verify-managed-backup-evidence.py` classifica `urllib.error.HTTPError` somente pelo código numérico 400–599, senão `unknown`; preserva o modo fail-closed do probe e não expõe URL, cabeçalhos, token, corpo nem referência de projeto. `tests/test_managed_backup_evidence.py` cobre as classes 401/403/404/429/500/503 e casos inválidos. Não concede nova permissão ao Supabase e não faz dump, restore ou alteração clínica.
- Testes: RED no código original: seis subcasos HTTP registravam apenas `HTTPError`, sem status (issue #191). GREEN isolado pré-PR: 33/33 regressões Python no SHA `268faa0ad2485c1c2db89f7cdf458e906dcdca21` em VM backend (task `1210f134-8a46-4e09-bcc0-8b82f1ef8ffb`, exit 0; auditoria `9fbd1a3a-b850-42a5-b297-c1f5c28c943e`). O Repository Governance Gate [run 41184682339](https://github.com/fredmourao-ai/solange-rolla-consultorio/actions/runs/41184682339) executou 28 testes com OK, mas terminou FAIL por ausência deste registro append-only (RED oficial). Novo CI e gate em SHA final exigidos; não declarar GREEN remoto com evidência local.
- Evidencias: diff de [PR #307](https://github.com/fredmourao-ai/solange-rolla-consultorio/pull/307), HEAD anterior `268faa0ad2485c1c2db89f7cdf458e906dcdca21`; log do job Governance `124489069233` com `AUDIT_LEDGER_DELTA=FAIL`; issue [#191](https://github.com/fredmourao-ai/solange-rolla-consultorio/issues/191). Readback adicional somente leitura no backend em 31/10 UTC: a instância `solange-backup-scheduler` continua `healthy` apesar de a cópia `/check-backup-health.sh` embutida no container NÃO conter `source_provenance` (task `6886440b-ba9b-4f1a-8bfa-05438557d7f9`) e `LAST_SUCCESS` local não ter `source_kind` ou `source_ref` (task `d787737a-d003-4763-b601-df707aa3058d`). Isso é risco preexistente separado, não corrigido por esta PR.
- Reparo adicional SAFE no instalador legado (31/10): `ops/backup/run-demo-scheduler.sh` agora faz preflight sem side effects da identidade da web ANTES de `mkdir`, `install` ou `docker rm -f`: quando o runtime e Supabase gerenciado, identidade ausente, URL estrangeira ou formato perigoso, recusa substituicao (`scheduler_refused`) sem derrubar o container anterior nem mascarar dump Docker local como backup gerenciado. Para URL local explicitamente validada, fluxo Docker preservado. Isso nao reconfigura o container ja ativo nem certifica backup remoto.
- Regressao focal do instalador: RED no script baseline com 4 de 5 casos falhando em fixture fake Docker (tentativa de rm ao detectar managed/unknown/foreign); GREEN com preflight em 5/5 testes sintéticos e `bash -n`, sem rede, credenciais, paciente, banco, Docker real ou deploy. Arquivo: `tests/test_backup_scheduler_preflight.py`. CI/governanca oficiais do novo SHA ainda requeridos.
- Pendencias: concluir CI/Governance/Database no HEAD resultante, integração protegida, executar consulta oficial única do Supabase para conhecer status HTTP real e permissões, comprovar backup gerenciado correto, retenção, export e restore isolado, Storage privado e RPO/RTO. O scheduler legado saudável porém sem guarda de proveniência precisa de atualização canônica sob gates, sem editar release ativa. Homologação UI #98 exige staging no SHA exato, sessão clínica sintética com lease e jornada de 15 dias por interface real; nenhum paciente, banco ou provedor foi alterado neste delta.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-01 — Gate Main Guard obrigatorio na promocao de staging (#98/#191/PR #305)

- Base SHA: ed3693f2d564fc6cb4c93a7794fc9f9c7576c3e5
- Impacto: sincroniza os dois caminhos de selecao de checks do `staging-promote.yml` (workflow_run e verificacao REST do SHA main) com os quatro gates CI, Database, Repository Governance Gate e Absolute Audit Main Guard ja exigidos pelo auto-merge. Nao muda banco, migrations, tokens ou runtime.
- Testes: RED de contrato no main revelou 3 gates em vez de 4, GREEN de inspecao do diff confirmou 4 em ambos os caminhos e as duas assercoes no teste `tests/integration/environment-workflows.test.ts`; regressao oficial CI exato do novo SHA ainda pendente, nao presumir SUCCESS.
- Evidencias: rebase de arvore baseado no main vigente, preservando os dois arquivos corrigidos originais da PR #305; o restante do repositorio e herdado do main, evitando regressoes das PRs #301/#307. Check de merge protegido e E2E real continuam obrigatorios.
- Pendencias: executar gates no SHA e integrar por protecoes; a promocao permanece fail-closed ate Supabase Management API 401 ser resolvido oficialmente e backup/restore isolado/Storage/UI 15 dias comprovados.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-10-31 - Contrato Gepeto e Superpowers para agentes (PR #239)

- Base SHA: 88fb7fb3a50d853526d66389edbb036b988c4ffb
- Impacto: Instrucao de leitura da politica Gepeto/Superpowers acrescentada a AGENTS.md e CLAUDE.md, mais novo GEPETO-POLICY.md, mantendo integralmente os contratos canonicos anteriores de seguranca, MFA, CI, staging e governanca. Nenhum arquivo de runtime, script, banco, dependencia, segredo, paciente ou deploy foi alterado. Os conflitos com main foram resolvidos sem force e preservando a versao mais recente do main.
- Testes: RED reproduzido no Repository Governance Gate oficial do SHA 7519646911105c362fc623aed06195068ddbc410 por ausencia deste delta. GREEN local anterior de 50 testes em tres suites de governanca, self-test validate-audit-governance.py, git diff --check, paridade de 30/30 objetos Git de HEAD com o manifesto canonico; o gate de delta e os checks no SHA resultante deste registro exigem reexecucao e evidencia propria. Ambiente Windows converte finais de linha no working tree, por isso a verificacao canonica de hashes foi feita sobre objetos Git originais, nao sobre bytes convertidos no checkout.
- Evidencias: PR fredmourao-ai/solange-rolla-consultorio#239, merge sem forcar do main no commit 7519646911105c362fc623aed06195068ddbc410, comentarios de auditoria da PR e resultado de Repository Governance Gate run 41167492359, que apontou exigencia deste registro append-only. Nenhum check cancelado/pendente foi tratado como aprovado.
- Complemento de remediacao de paridade: repositorio pipeline PR #62 merged em main 2ec9db798212b2149c6f6d1f59c888bccf4720ab; tres artefatos de Playwright (trace .network, resources/ e revisita) e tres hashes do manifesto sincronizados sem alterar dados clinicos ou runtime. Falhas RED exatas nos runs 41168273910 e 41168274091.
- GREEN local nesta atualizacao: 26 testes trace, 28 testes ledger, 24 testes certifier, validator de governanca PASS, GLOBAL_AUDIT_POLICY autenticado PASS e paridade 30/30 blobs can?nicos; check oficial do novo SHA permanece pendente.
- Pendencias: Todos os required checks de GitHub Actions no SHA final, incluindo Repository Governance Gate, Absolute Audit Governance, Global Task Continuity e CI/Database quando aplicaveis; resolver fila e cancelamentos oficialmente, realizar merge protegido e validar main/staging conforme impacto. Auditoria global V5 segue NAO_APTO, sem evidencias de certificacao clinica/UI pos-deploy no mesmo release.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-01 — Fiscal mock E2E unique synthetic CPF (#98/PR #309)

- Base SHA: b43c429b3b1bd2e7bfd511dbf19a3d8329053e98
- Impacto: `tests/e2e/fiscal-mock-operations.spec.ts` uses the same generated, valid **synthetic CPF** in `people.cpf_normalized` and `fiscal_profiles.issuer_document` per local E2E attempt, preventing duplicate constraints on both the person and `(issuer_document,version)` fiscal profile when Playwright retries. No application runtime, DB migrations, clinical data, live NFS-e, external communications or deployment settings are changed.
- Testes: RED: `CI #41323930098`, job `#124921452492`, finished FAILURE (01/11 18:38 UTC): `people_cpf_normalized_key` rejected repeated `12345678901` on two retry attempts; independent schema review identified the second retry collision at `unique (issuer_document, version)` with the same fixed issuer; a separate login timeout and one agenda-test flaky retry were observed and are **not** declared solved here. Initial Repository Governance Gate for PR #309 `#41344152950` correctly failed with `AUDIT_LEDGER_DELTA=FAIL` because this ledger delta was missing; it was not disabled.
  GREEN direcionado: independent Node 22 execution generated 10,000 distinct, valid, wholly fictitious CPFs, checking both verification digits and rejecting collisions in that sample. This is a **helper/fixture** test, not a substitute for full CI, Playwright E2E, real UI or exact-SHA validation.
- Evidencias: [PR #309](https://github.com/fredmourao-ai/solange-rolla-consultorio/pull/309); [failed baseline CI](https://github.com/fredmourao-ai/solange-rolla-consultorio/actions/runs/41323930098); [initial governance RED](https://github.com/fredmourao-ai/solange-rolla-consultorio/actions/runs/41344152950); issue #98. No patient, staging database, Supabase token, browser lease or runner was manually modified.
- Pendencias: re-run/observe the exact PR SHA governance, CI and Database gates and fix regressions before an authorized protected merge. Supabase managed backup #191 remains HTTP 401 / restore unverified; staging and 15-day UI homologation are still **NAO_APTO**.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-01 - remover dependencia GitHub-hosted do handoff Solange (CI gratuito)

- Base SHA: 73b7f6aba33996a1e124b94839f942086170fc9b
- Impacto: corta a duplicacao dos testes completos do aplicativo no governance-gate em modo CI, mantendo bridge V5, contrato de continuidade, historico append-only e isolamento; remove o job staging-handoff hospedado e seu polling 160x15s do auto-merge; o workflow staging-promote ja observa conclusoes de CI/Database/Governance/Main Guard pelo gatilho workflow_run em runner Solange privado e verifica SHA exato e sucesso de todos os gates antes do deploy. Mantem runner exclusivo de staging, backup, aprovacao e checks; nao altera deploy, seguranca, dados ou faturamento.
- Testes: Revisao independente detectou que o early-exit pulava o contrato Dependabot .mjs; regressao focal RED confirmou a omissao, contrato movido antes da saida CI e revalidado com Node 24.19.0. Regressao de arquitetura adicionada para impedir que gate de governanca repita app checks cobertos por CI requerido; contratos de workflows e runners atualizados para rejeitar ubuntu-latest em qualquer job Solange; suite local e governanca devem executar antes de PR/merge. Caso observacional existente workflow_run 41324154623 confirmou canonical-gate PASS, mas promote SKIPPED; isso NAO certifica deploy.
- Evidencias: Reconciliacao 2026-11-01 contra main 73b7f6aba33996a1e124b94839f942086170fc9b preservou integralmente o delta #309 e este registro; conflito causado por append concorrente no mesmo final do ledger.  runner proprio ficou cerca de 15 minutos em governance-gate com npm ci/build duplicados durante janela de PR; otimizacao elimina essa concorrencia sem remover CI exigido; repo publico legado PR #34 demonstra falha upstream GitHub-hosted por bloqueio de billing; runner proprio solange-ci-a1 ativo no backend; o repositorio canonico ja recebe workflow_run em staging-promote sem GitHub-hosted. Codigo para CI do SHA revisado ainda requer validacao independente.
- Pendencias: executar testes reais/CI no novo SHA e revisão de branch; integrar somente com gates e aprovacao vigente, verificar workflow_run apos merge e homologacao real/UI/backup sem custo; nao reivindicar APTO V5 por esta mudanca de orquestracao.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-01 — PR #308 - checklist obrigatorio para todos os agentes

- Base SHA: 988333f75c03b73880a004ca316281e84487d954
- Impacto: corrige project JSON e espelho do manifesto global V5 apos transferencias GitHub Solange (ID 1345489426) e MEI-MG (ID 1322334568), atualiza hashes reais de scripts e fixa identidade tecnica atual Vivaliz-site/solange-rolla-consultorio apos transferencia oficial e atualiza instrucoes de agentes GPT, Codex, Claude, Gemini e Copilot, gatilho do workflow de continuidade e seus testes de contrato; sem schema, paciente, preco, credencial ou deploy.
- Testes: RED do gate oficial devido a project antigo; GREEN local de validate-audit-governance.py, 2 suites de continuidade e delta append-only. Manifesto global, hashes e lista verificados; checks GitHub e main canonico ja contem ambas as transferencias e hashes verificaveis.
- Evidencias: GitHub 301 no nome antigo e repository ID 1345489426 preservado; backend tarefas 997aadd8 e 544d975f com testes GREEN; Repository Governance #41378949767 falhou corretamente por project antigo e foi corrigido sem bypass; fonte central na pipeline PR #72.
- Pendencias: checks e merge da politica V5 global e espelhos, CI e Database no head final #308, staging SHA exato, backup gerenciado e restore, 15 dias de UI real e veredito V5 independente.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-02 — identidade do repositorio Solange apos transferencia (#313)

- Base SHA: 4a200d1c1220d869ac4b5f69ec981c98de8bc536
- Impacto: corrigir identidade canonica de Solange em adaptador de continuidade, instrucoes e requirements de auditoria apos transferencia para Vivaliz-site; sincronizar GLOBAL_AUDIT_MANIFEST.json byte a byte com o manifesto normativo em Vivaliz-site/-shopvivaliz-pipeline@main, preservando hashes globais, isolamento e regras de CI. Nao toca dados clinicos, tokens, secrets, producao ou permissoes.
- Testes: RED oficial Repository Governance Gate #41379443243 job 125066788529 por ausencia de delta; RED Absolute Audit Governance #41379443326 por local_manifest_parity=false. Testes locais da implementacao original: 5/5 unittest do adapter, self-test e git diff --check PASS conforme PR #313. Revalidacao oficial do novo SHA necessaria, nao inventar GREEN.
- Evidencias: PR #313 HEAD inicial 9d04dab0; sincronizacao CAS do manifesto no commit 498f999f, blob canonico 5f405fc25229f584bb6c880cfe82c0e0db386dda, update-branch protegido pelo endpoint oficial gerou merge de main bbe51e9c antes deste registro; houve leitura do bloco de ledger anterior e preservacao integral via append.
- Pendencias: validar no SHA exato Repository Governance Gate, Absolute Audit Governance, CI, Database e protecoes; integrar por auto-merge autorizado somente apos gates, reconciliar downstream #314 e executar backup gerenciado e restore isolado #191, quinze dias UI #98. Estado global permanece NAO_APTO.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-02 — normalizacao EOL token staging #314

- Base SHA: 7fa5b5f15891e0944977251857a93ffb774a872f
- Impacto: #191; `scripts/verify-managed-backup-evidence.py` aceita apenas CR/LF terminais ao carregar o PAT de staging; CR/LF internos, whitespace extra e token vazio permanecem invalidos. Nenhuma alteracao em ambiente clinico, projeto Supabase, acesso externo, banco, backup, restore, permissionamento ou flags de escrita.
- Testes: RED oficial Repository Governance Gate na PR #314 HEAD 597e0d0a (job 125068177690, 2026-11-02T03:08:07Z): material paths changed (2) without AUDIT_STATUS.md. RED funcional contra script main: 35 testes, 3 erros esperados para LF/CRLF finais (evidencia #191). GREEN direcionado na branch anterior: 35/35 com PAT sintetico e negativas CR/LF internos; resultado do gate oficial neste novo SHA ainda nao esta comprovado.
- Evidencias: workflow `Managed Staging Backup Evidence` run 41378442315 falhou com management_token_missing_or_invalid antes de acessar API Supabase; PR #314 documenta reparo sem ler segredos; houve falha real de governanca por delta ausente e este registro append-only corrige apenas a rastreabilidade. A identidade do token real continua nao verificada.
- Pendencias: aguardar checks oficiais do SHA atualizado, auto-merge protegido; apos integracao repetir uma unica vez o workflow canonico sem concorrencia no runner; exigir metadata do backup do staging gerenciado, restore isolado com RLS/schema/Storage e teste de UI no SHA exato. Nao declarar API 200, recuperacao certificada ou quinze dias homologados.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-01 — PR #312 — Prevencao de revisao humana universal, com CODEOWNERS restrito

- Base SHA: a21123e53bf4047526b5e40ea030a9727bc7a9f2
- Impacto: shopvivaliz-human deve visualizar todas as PRs como colaborador mas nao revisar tecnicas comuns. Preserva os CODEOWNERS anteriores de fredmourao-ai, acrescenta somente /security/owner-approvals/ @shopvivaliz-human e impede owner humano wildcard/diretorios amplos ou review request automatico. Mudanca limitada a .github/CODEOWNERS, scripts/check_pr_review_routing.py, scripts/repository-governance-validate.sh, tests/test_pr_review_routing.py e este ledger; nenhuma alteracao clinica, fiscal, Supabase, RBAC, branch protection, runners, segredos ou producao.
- Testes: RED oficial no Repository Governance Gate run 41355739773, job 124995259963, do HEAD ac7734947b16d36a24a7a5c397067335dceb0bfa: OWNER_REVIEW_ROUTING=PASS e os 7 testes de roteamento PASS, mas AUDIT_LEDGER_DELTA=FAIL pela falta de registro para 4 caminhos materiais. Dois agentes anexaram simultaneamente dois registros na branch do PR; o validator exige EXATAMENTE um AUDIT_DELTA_V1 adicional. Reconciliados agora em um unico bloco append-only relativo ao main, sem perder as evidencias e sem alterar o gate. CI do novo HEAD ainda deve certificar GREEN.
- Evidencias: PR https://github.com/fredmourao-ai/solange-rolla-consultorio/pull/312; log oficial https://github.com/fredmourao-ai/solange-rolla-consultorio/actions/runs/41355739773; CODEOWNERS geral da conta humana na PR #311 foi descartado/fechado sem merge. O registro anterior de auditoria do main foi preservado integralmente e os dois relatos concorrentes da mesma PR foram semanticamente consolidados.
- Pendencias: executar Repository Governance Gate e checks oficiais no SHA exato, integrar apenas quando branch protection permitir (sem interferir no runner single-writer), e comprovar CODEOWNERS no main. Preservar grants humanos somente nas PRs de seguranca formal e decisao comercial protegida. Esta correcao documental/de governanca nao certifica Solange #98 (15 dias de UI grafica), #191 (backup/restore Supabase gerenciado HTTP 401), nem releases ou dados clinicos.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-02 — Selecao de gates por impacto de governanca e deduplicacao do build

- Base SHA: 984810ab61e113d0bcaca1360e043aafa7ab9809
- Impacto: reconhecer exclusivamente mudancas de roteamento de revisores em .github/CODEOWNERS, scripts/check_pr_review_routing.py, scripts/repository-governance-validate.sh e tests/test_pr_review_routing.py como escopo pr_review_governance, preservando o Repository Governance Gate obrigatorio; somente estes caminhos com ledger podem dispensar npm core, UI/E2E clinico e banco. Qualquer codigo clinico, contrato de agente/seguranca, migracao, workflow, script de CI, path nao conhecido ou push sem diff segue fail-closed FULL. Remover execucao duplicada de arch:check e modules:check dentro do job build: o job architecture continua separado e e required status context na protecao de main; nao alterar labels, branches, runners, permissoes, approvals ou status obrigatorios.
- Testes: baseline RED real em clone isolado Windows HEAD 6c138dc98407f4e9fde22d23d4a43e8b2952f887, 14 casos com 2 FAIL: governanca marcada full e arquitetura duplicada no build. GREEN real apos reparos no HEAD 2f66720e181a842163df4163de492b440b93af8e: python -m unittest tests.test_ci_impact_selection -v, 14/14 PASS, incluindo combinacoes inseguras, scripts desconhecidos, migracoes, interfaces clinicas e contratos de seguranca; classificador com os cinco caminhos reais da PR #312 retorna scoped com run_core=false, run_db=false, run_e2e=false; git diff --check sem erros. Checks oficiais e merge da propria PR de otimizacao ainda obrigatorios.
- Evidencias: diff e testes locais verificados sobre branch isolada fix/ci-scope-governance-20261102 no laptop autenticado; log de CI anterior da Solange #312 (run #41439917023, job #125259327996) confirmou full_reasons no diff so de CODEOWNERS/governanca; main branch protection consultada por gh api exige architecture, lint, build, typecheck, unit, e2e, db e governance-gate sem alteracoes. CI e DB tinham classificadores repetidos, e npm ci roda por job; nao arriscar compartilhamento inseguro de node_modules nesta rodada.
- Pendencias: certificar Repository Governance Gate, Absolute Audit Governance, CI, Database e merge/main via GitHub no SHA exato do PR desta otimizacao; confirmar que escopo isolado pula apenas suites clinicas/DB em PR subsequente de governanca; medir reducao da fila sem alterar required checks nem interferir no runner single-writer ou em #312.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-02 — Correcao do handoff de CI pos-merge para staging gerenciado

- Base SHA: ad9f2baec25bd06aba0eb7f3dd720fa48ccae3f3
- Impacto: o fluxo PR Auto Merge despachava quatro validadores main usando GITHUB_TOKEN, mas nao houve Staging Promote para o mesmo SHA. O CI main agora oferece um job final condicionado ao workflow_dispatch do proprio github-actions[bot], com dependencias de TODOS os jobs CI verdes e permissao actions:write EXCLUSIVAMENTE nesse job (mudanca P2 a exigir revisao humana formal). O dispatcher revalida main exato, origem da CI, tres outros validadores oficiais, unicidade e despacho do workflow EXISTENTE; ele nao promove banco nem ignora backup, RBAC, environment staging, lease ou gate de restore.
- Testes: RED observado no GitHub: CI #41459412505, Database #41459417850, Repository Governance #41459422150 e Absolute Audit Main Guard #41459426207 SUCCESS no main ad9f2bae, sem Staging Promote correspondente. GREEN local sintetico direcionado: 11/11 unittest do algoritmo, incluindo fail-closed SHA divergente, status pending/failed, paginacao, origem CI, identidade nao bot, idempotencia e dispatch do workflow existente; py_compile PASS. Testes oficiais no SHA final desta PR e teste de dispatch real AINDA PENDENTES.
- Evidencias: issue #191, workflow .github/workflows/ci.yml, script scripts/dispatch-staging-after-ci.py e regressao tests/test_staging_handoff.py; sem execucao do workflow staging, mutacao clinica, secrets, runner novo, bypass ou compra/pagamento real.
- Pendencias: exigir APPROVED exclusivo shopvivaliz-human no HEAD da PR P2 e checks/merge protegido; testar handoff pos-merge em main exato. Corrigir pelo canal oficial o secret staging/SUPABASE_ACCESS_TOKEN ausente/invalido antes de promover; o Staging Promote permanece fail-closed no managed backup e nao valida restore/Storage. #191 e #98 continuam NAO_APTO ate restore isolado e quinze dias de UI real em SHA publicado.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-05 — PR #317 — Sincronizacao de manifesto global aprovada na PR canonica #74

- Base SHA: f8a11c2cf8d623921ddac3e89a3a71c62bc42a9c
- Impacto: alteracao documental e limitada de docs/quality/GLOBAL_AUDIT_MANIFEST.json para retirar somente o pin Git imutavel de REGRAS-AGENTES-CENTRALIZADAS.md, substituindo-o por quatro marcadores obrigatorios de Auditoria V5 presentes no documento; os demais 29 pins e protecoes continuam inalterados. Esta entrada de ledger documenta o delta; nao modifica o aplicativo clinico, banco, dependencias, usuarios, credenciais, fluxos de pacientes ou producao.
- Testes: diff da PR #317 verificado com apenas o manifesto (6 adicoes e 1 exclusao) antes desta entrada, comparado com o blob canonico do pipeline apos PR #74. Absolute Audit Governance concluido com success no HEAD anterior 0dcff7ce960142faf2420ad92bf3142241f5c65e; Repository Governance Gate falhou nesse HEAD por AUDIT_LEDGER_DELTA=FAIL (ausencia deste registro); novos checks deste HEAD com ledger ainda precisam passar.
- Evidencias: PR canonica https://github.com/Vivaliz-site/-shopvivaliz-pipeline/pull/74 aprovada por shopvivaliz-human; PR espelho https://github.com/Vivaliz-site/solange-rolla-consultorio/pull/317; Repository Governance Gate run 42064966747, job 127376452415 confirmou a falta do delta em 2026-11-05. A aprovacao humana da versao anterior da PR #317 nao substitui revisao do novo HEAD se as regras de protecao exigirem.
- Pendencias: obter CI/Governance/Database e outros checks verdes no HEAD atualizado, solicitar novamente a revisao formal de shopvivaliz-human se a aprovacao ficar stale, integrar pela fila/protecao oficial e confirmar paridade do manifesto no main. A plataforma clinica permanece NAO_APTO para certificacao E2E de staging/producao, backup/restore gerenciado, evidencias clinicas e demais exigencias anteriores.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-06 — staging backup token injection classification and ASCII controls — 2026-11-06

- Base SHA: d721bf485abd744333715b6edfca6bbe623ea91b
- Impacto: #191/#98; a verificacao do backup Supabase gerenciado nao diferenciava o segredo ausente no contexto do job de um valor fornecido, mas malformado, e podia encaminhar controles TAB/NUL/separadores Unicode ao transporte HTTP. O novo preflight diagnostica `management_token_not_injected` exclusivamente quando `SUPABASE_ACCESS_TOKEN` efetivamente nao e injetado; valores presentes, mas invalidos, continuam falhando como `management_token_missing_or_invalid`. Aceita so bytes ASCII imprimiveis no bearer, comprimento limitado, e normaliza apenas CR/LF terminais. Nao busca/le, imprime, sincroniza nem rotaciona credencial.
- Testes: RED sintetico contra o codigo anterior no branch, com 37 testes, 2 FAIL (`test_management_token_control_characters_fail_closed_before_provider` e `test_missing_environment_token_is_distinguished_without_exposing_credentials`), MCP task `0d08d714-2cf6-4615-88f8-277f7511a8d5`; GREEN no HEAD `cc22a04c468d1fa24871f82cd86bf871ea7bcd36`, 37/37 `test_managed_backup_evidence.py` + 12/12 `test_backup_source_guard.py`, py_compile e git diff --check, task `8bfe5c98-5384-47d3-96c5-80d714848af8` exit0. Nenhuma API externa, Supabase real ou banco consultado.
- Evidencias: `scripts/verify-managed-backup-evidence.py` e `tests/test_managed_backup_evidence.py`, branch `fix/staging-backup-token-input-contract-20261106`; marcador diagnostico nao revela token, REF, payload ou headers. O workflow existente permanece inalterado, usando runner self-hosted e environment staging.
- Pendencias: CI oficial no SHA atualizado, merge protegido e readback main; diagnosticar/reprovisionar apenas pela via oficial e grant P2, quando exigido, o valor real do secret `SUPABASE_ACCESS_TOKEN` no environment staging. Uma variavel/secret com nome presente nao e prova de injeção. Exigir backup fresco da Management API, restore isolado e Storage/RLS, certificacao UI de 15 dias no SHA publicado antes de APTO. Nao alterar pacientes, base ou producao clinica.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-07 — Remocao de checklist universal compulsorio por autorizacao do proprietario

- Base SHA: 4a342ccabb556fb03c70e7ea6df22b9de374902d
- Impacto: revisao apenas documental das instrucoes de AGENTS, CLAUDE, GEMINI e Copilot, mais contrato de testes. Remove a obrigatoriedade de certificar um checklist por subetapa em operacoes rotineiras P0/P1 ja autorizadas. Nao altera banco clinico, aplicacao, pacientes, Supabase, auth, deploy ou privilegios; preserva MFA, RBAC, branch protection, lease/fencing e provas finais de auditoria. Fonte da revisao da controladora: Vivaliz-site/site-shopvivaliz PR #3771 integrada e validada no SHA 8fa9a80f21bdee31a761363e8a3d8d9b7df9882c.
- Testes: contrato de checklist proporcional revisado na branch e contract SUCCESS em GitHub Actions run 42331612511 no HEAD 6114939c41e093763c7e03bd75088b7e699f4fee; db SUCCESS 42331612490 e absolute-audit-governance SUCCESS 42331612483. Governance Gate identificou em RED a falta deste delta no run 42331612465, job 128279193137; novo CI apos este commit ainda a validar.
- Evidencias: PR https://github.com/Vivaliz-site/solange-rolla-consultorio/pull/319; auditoria canonica central https://github.com/Vivaliz-site/site-shopvivaliz/pull/3771; logs do GitHub Actions sobre a ausencia anterior do AUDIT_DELTA_V1, com numero e SHA registrados acima. Nenhuma interacao com dados de pacientes ou credenciais.
- Pendencias: certificar no HEAD atualizado o gate de governanca, suites e merge protegido; validar que os quatro documentos adotam a regra proporcional no main. Manter a auditoria clinica UI/backup/restore e demais pendencias originais como NAO_APTO ate evidencia independente real; nao declarar producao homologada por esta mudanca documental.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-07 — Restore manual fail-closed contra banco remoto, replay inseguro e falso verde RLS

- Base SHA: 0e19caace127fd706319c848da7aa0ff2ed1e6f4
- Impacto: #191 e #98. A restauracao manual generica `scripts/verify-backup-restore.sh` vetava apenas URLs contendo as strings "production"/"prod.", mas aceitava host real Supabase sem essas palavras, destino local nao isolado, senha em URI, checksum ausente, e declarava sucesso com queries que retornavam false sem validacao efetiva de tabelas/RLS. Um `RESTORE_ENV=staging_restore_drill` isolado nao impedia restore sobre banco clinico remoto.
- Correcao minima: URIs estritamente locais loopback com banco descartavel `solange_restore`, sem senha embutida ou parametros; exigencia de marcador server-side somente no banco descartavel novo e sem tabelas aplicacionais; arquivo checksum obrigatorio e comparado antes de conectar; arquivo `pg_restore` valido e restore `--single-transaction --exit-on-error`; verificacao fail-closed de public.profiles, clinical.records, auth.users, RLS habilitado e politica clinica. Nenhum dump clinico, banco real, segredo ou projeto Supabase foi acessado, modificado ou exposto.
- Testes: RED real do codigo pre-fix no checkout isolado do branch apenas com fixtures sinteticas, task MCP `a8490e79-3293-4a1f-9f75-5296e973d272`, `8 tests, 7 failures`. GREEN pos-fix task `26324057-8868-424c-ab8d-86ce6a47835c` exit0, 8/8 novos testes, 12/12 source-guard original, bash -n, py_compile e git diff --check. Adicionado gate do novo teste ao mesmo job `unit` do CI self-hosted existente, sem job, worker, runner ou schedule adicionais; regressao que verifica propria ligacao ao CI.
- Evidencias: branch `fix/restore-drill-local-target-fail-closed-20261107`, scripts/verify-backup-restore.sh, tests/test_restore_drill_target_guard.py, tests/test_backup_source_guard.py, .github/workflows/ci.yml, docs/operations/BACKUP_RESTORE.md. O PAT Supabase da homologacao agora chega ao provedor: workflow de metadata #42326436389 registrou `no_completed_managed_backup`; Free Plan nao possui backups automaticos, requer exportacao da fonte gerenciada real + destino privado seguro e restore isolado com controles P2 quando aplicaveis. Este fix nao ativa nova rotina de backup nem certifica a fonte publica.
- Pendencias: CI oficial HEAD exato, main protected merge, testes pos-merge, ensaio real em banco descartavel e prova de backup da fonte gerenciada + objetos Storage/RLS e jornada UI sintetica. Nao usar esta PR para habilitar escrita clinica nem promover staging.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-08 — Integridade de archive no restore portatil Docker e rotulo de fonte local

- Base SHA: 45c6d81bb3608afe0af56f22dd032411a8e4d88d
- Impacto: #191 backup/restore e #98 homologacao UI. O exercicio Docker de restauracao portatil iniciava o container sem comparar SHA-256 do arquivo com o manifesto; um dump local adulterado ou sem checksum ainda entrava no fluxo. O sucesso do drill local tinha saida generica capaz de ser confundida com certificado de backup Supabase gerenciado.
- Testes: RED no HEAD 6b66e9fe51724dfa1963a4ea7be09f68fb7b4462 com 3/4 falhas esperadas em fixtures sinteticas de checksum ausente, divergente e symlink (task MCP 2d5ea323-7e8a-4e02-bb35-6f7cac2fbd10); GREEN no HEAD be96edf91aa21613824c3bac91b4a0d666dee8b8 com 25/25 regressões Python PASS, sh -n PASS, task MCP a47237ee-1628-4c2e-b440-c29f3a459cf8. O teste Vitest de restore foi ajustado para fornecer checksum correto e exigir rotulo de escopo. CI oficial e validacao pos-merge ainda exigidos.
- Evidencias: scripts/verify-backup-restore-docker.sh checa arquivo e checksum sem symlink antes de docker; tests/test_backup_docker_integrity_guard.py com fake Docker sem acesso clinico; tests/integration/backup-restore-readiness.test.ts preserva exercicio sintentico; docs/operations/BACKUP_RESTORE.md distingue restore local de Supabase. Nenhum dump real ou segredo foi acessado, gerado ou exportado.
- Pendencias: obter backup logico real do projeto Supabase staging com CA TLS verify-full, cofre criptografado off-host e chave de recuperacao validada e grant efetivo; restaurar isoladamente, conferir Storage/RLS, promover exact-SHA e executar 15 dias sinteticos em UI real antes de declarar recuperacao e homologacao APTO.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->


<!-- AUDIT_DELTA_V1 -->
## 2026-11-08 — #191 encrypted managed Supabase DB offsite export preparation (gated)

- Base SHA: 550f50cdee574ac6733a6ca3992a6995d60d34c0
- Impacto: o projeto fonte da UI publicada e gerenciado Supabase (staging hodbtssikurywwwzdkoy, PostgreSQL 17.6, 47 tabelas publicas, 64 migracoes, quatro buckets e 63 objetos Storage), mas o workflow de verificacao do Free depende exclusivamente de backup diario gerenciado inexistente; Staging Promote 42449962745 falhou corretamente em Verify managed backup. O backend so tem pg_dump 16.15 (incompativel com servidor 17), GPG sem chave publica e destino OCI preexistente nao foi certificado (BucketNotFound), por isso nao autorizar exportacao real.
- Testes: RED em HEAD 1e0deedb7da7f60cd1987572cd2d301fbc073463, task MCP 6d395fdd-de3e-414b-926e-ee6b5f40fabd, sem executor de exportacao disponivel; GREEN dirigido 15/15 tests synthetic local-only em HEAD 8500c63e5da41b947d9bda7f78a7b5d8b6ca13dc, task MCP 16a89630-da9d-4754-9b7e-c1d65f60cb83, exit0. Contratos adicionais de grant formal P2, S3/OCI private, antitamper, single-writer e workflow manual em CI. Checks oficiais e postmerge exigidos.
- Evidencias: script backup-managed-staging-offsite.py vincula ref do runtime ao usuario do pooler, exige pg_dump17, SSL verify-full, recipient GPG com fingerprint fixa, bucket OCI privado com instance principal, grant de environment e manifesto em security/owner-approvals, flock por projeto, encrypt-in-stream, OCI put/get e SHA do ciphertext; teste simula backup e tamper com bytes ficticios sem medico/cliente real; existing workflow agendado segue provider-metadata READ ONLY, modo offsite_export so workflow_dispatch manual. Readback real de Supabase feito pelo plugin autenticado Fredmourao, sem expor PII, e OCI bucket GET somente leitura em dois hosts retorna BucketNotFound, enquanto OCI object HEAD no backend confirmou o objeto MEI preexistente (04:38Z). A diferenca sugere permissao de OBJECT_READ sem prova de BUCKET_READ/NoPublicAccess; sem atestado de privacidade nao realizar exportacao clinica.
- Pendencias: sem grant P2 formal para arquivo security/owner-approvals/managed-staging-backup-191.json, sem chave publica GPG e chave privada em custodia independente, sem acesso a bucket privado OCI, sem cliente PostgreSQL 17 no runner e sem backup separado dos 63 objetos Storage; nenhum dump real, restore isolado ou E2E UI 15 dias pode ser certificado. Staging Promote deve permanecer fail-closed e nao se pode marcar APTO.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->


<!-- AUDIT_DELTA_V1 -->
## 2026-11-08 — #191 owner review of conditional managed Supabase backup scope (no executable grant)

- Base SHA: ab310af5681d9cd4da2b204ca2a7260ed0bf25fa
- Impacto: a issue #191 exige aprovacao formal para definir escopo da exportacao cifrada do Supabase gerenciado; o banco real e o projeto Docker historico sao distintos, e aprovar texto sem atestar bucket OCI e fingerprint GPG nao pode habilitar exportacao de dados clinicos.
- Correcao minima: documento em security/owner-approvals/managed-staging-backup-191-review.md exige fonte unica hodbtssikurywwwzdkoy, bucket OCI privado com namespace verificado, GPG publico sob custodia independente, versao 17 de pg_dump, TLS verify-full, lock exclusivo, grant executavel posterior revisado no HEAD, limite de 7 dias e restore isolado. O documento e proposta condicional, NAO e security/owner-approvals/managed-staging-backup-191.json e nao libera escrita ou exportacao.
- Testes: review routing 7/7 GREEN e suite de governanca basica 28/28 GREEN no run oficial 42481913534; gate AUDIT_LEDGER_DELTA inicialmente RED porque a branch nao tinha este registro. Reexecutar CI oficial no novo HEAD; nenhuma prova de backup gerenciado foi alegada.
- Evidencias: PR #323 https://github.com/Vivaliz-site/solange-rolla-consultorio/pull/323, review APPROVED inicialmente emitido por shopvivaliz-human em 2026-11-08T12:51:21Z para HEAD 08119a2eae02bbc2fee48cbb086c0c356f001494; commit posterior de ledger exige nova revisao valida do HEAD antes de merge. Nao ha dados clinicos, dump, chave privada nem segredo neste delta.
- Pendencias: confirmar checks oficiais do HEAD final, receber novo APPROVED se review inicial foi invalidado, integrar pela protecao normal; separadamente atestar parametros OCI/GPG e criar grant executavel com aprovacao P2 especifica, exportar fonte gerenciada, recuperar objetos Storage, testar restore isolado e validar UI no SHA publicado. O gate no_completed_managed_backup permanece ativo.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-08 — #191 CA TLS explicita do Supabase para exportacao gerenciada

- Base SHA: 2b90fc1de3968cebcc5efacb8e40748df45185c8
- Impacto: o cliente atual do backend nao tem rota IPv6 para db.hodbtssikurywwwzdkoy.supabase.co:5432. O pooler oficial aws-0-sa-east-1.pooler.supabase.com:5432 respondeu TCP/SSL, mas o teste openssl -starttls postgres apontou self-signed certificate in certificate chain: o uso de PGSSLROOTCERT=system no exportador falharia verify-full na origem correta.
- Correcao: exigir arquivo local da CA emitida pelo Supabase e seu SHA256 pinado, recusando symlink, alteracao por grupo/outros e mismatch; manter PGSSLMODE=verify-full, conexao de sessao IPv4 5432, verificacoes de tenant, GPG, OCI privado e P2; nao modificar certificacao nem desativar gate.
- Testes: regressao RED/GREEN sintetica de CA obrigatoria, adulteracao e workflow; incluir suite e CI oficiais antes de promover. Nenhuma credencial ou dado de paciente exposto.
- Evidencias: CI oficial da PR #324 no HEAD 9377deafca666adb2ac930170958fec697d76fc2 teve Database, CI, Absolute Audit e AI Conflict Resolver success, mas governance-gate 42482350164 FAIL por campo Evidencias ausente neste delta. Regressao local reportada na issue #191: RED 2 errors/2 failures; GREEN 20/20 testes focais, 60/60 backup e 28/28 ledger, py_compile e git diff --check, sem acesso a pacientes. Esta entrada repara o contrato documental; nova CI obrigatoria no HEAD atualizado, e nenhum backup ou restore gerenciado e declarado.
- Pendencias: CA oficial ainda nao provisionada, pg_dump17 ausente no runner, chave GPG e bucket OCI privado nao certificados, grant P2 de exportacao ainda necessario, Storage e restore isolado nao executados. Estado #191 e #98: NAO_APTO.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->


<!-- AUDIT_DELTA_V1 -->
## 2026-11-08 — #191 runner com cliente PostgreSQL 17 isolado sem alterar libpq global

- Base SHA: 9f359c3a2a0966c0aec6e2690056f7308fd2d617
- Impacto: job manual do backup de staging gerenciado usava o caminho padrao de pg_dump17, ausente no runner ARM64 Ubuntu noble (host backend autorizado), e instalar o pacote PGDG diretamente atualizaria libpq5/libpq-dev globais de 16.15 para 18.6. A correcao limita-se ao binary-path do exportador, sem alterar segredos, grant P2, banco, objetos Storage, staging ou agendamento.
- Testes: preflight apt-get -s identificou upgrade global e foi abortado; repositorio APT PGDG temporario limpo com readback. Cliente 17.11 extraido dos .deb oficiais assinados em /opt/shopvivaliz/pg-client-17.11, com libpq 18.6 isolada via LD_LIBRARY_PATH no wrapper; pg_dump --version como usuario ubuntu GREEN, ldd sem bibliotecas ausentes, libpq5 dpkg global permanece 16.15 e source PGDG global ausente. Teste de regressao estatico exige variavel SOLANGE_PGDUMP17_BIN no job manual, preservando o fallback para instalacoes tradicionais. CI oficial ainda exige verificacao no HEAD candidato.
- Evidencias: tarefas MCP 6f395296-e3b8-4706-b1da-5d93af173538 (simulacao) e a3183516-ee6c-4084-af83-558849e0403a (rollback) succeeded/exit0; instalacao isolada 20dc4e56-c681-4eb7-aecc-e814d9e4235b succeeded/exit0, readback ubuntu audit 5657bdce-9c12-4568-807b-ece61f7120c7; binario root:root 0755, 13 MB. Mudancas somente em workflow manual existente, teste e este ledger, sem exportacao real.
- Pendencias: GitHub Environment staging deve definir SOLANGE_PGDUMP17_BIN para /opt/shopvivaliz/pg-client-17.11/pg_dump; concluir CI, merge protegido e teste de preflight fail-closed. Faltam ainda CA oficial pinada, fingerprint GPG publica e custodia privada offhost, bucket OCI NoPublicAccess e namespace, grant P2 executavel e evidencia externa, exportacao gerenciada, backup Storage, restore isolado e jornadas UI no SHA implantado. NAO declarar recuperacao clinica por pg_dump --version.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->


<!-- AUDIT_DELTA_V1 -->
## 2026-11-09 — #327 Padronizar PRs em portugues brasileiro e revisao dupla apenas para novas restricoes

- Base SHA: 4ba9d7bbb5b6eac7bbca740d319d58e83044222a
- Impacto: Propagacao da regra transversal da ShopVivaliz em AGENTS.md e CLAUDE.md; PRs comuns de manutencao, documentacao e correcoes tecnicas nao exigem dupla aprovacao apenas por editar arquivos de agentes ou workflows; aprovacao dupla de shopvivaliz-human e fredmourao-ai permanece estritamente obrigatoria apenas quando o diff introduzir, restaurar ou agravar bloqueio ou restricao; todas as comunicacoes de PRs padronizadas em portugues brasileiro.
- Testes: Suite de governanca basica python3 scripts/check_pr_review_routing.py e python3 -m unittest tests/test_pr_review_routing.py executadas com 7/7 GREEN; validacao de ledger delta python3 scripts/validate-audit-ledger-delta.py executada com sucesso; sem alteracao de codigo de aplicacao ou runtime.
- Evidencias: PR #327 em https://github.com/Vivaliz-site/solange-rolla-consultorio/pull/327 reapresentada por shopvivaliz-agents-ia[bot] cobrindo AGENTS.md, CLAUDE.md e este ledger; revisoes solicitadas a shopvivaliz-human e fredmourao-ai; sem dados sensiveis ou segredos envolvidos.
- Pendencias: Conclusao de todos os status checks do CI oficial de solange-rolla-consultorio, revisao de conformidade e merge sem bypass administrativo.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-10 — [GPT] Preflight GPG do backup gerenciado Solange

- Base SHA: dafa95bb03380e67bf33dedd0fc023591181ddef
- Impacto: O preflight bloqueava indevidamente o runner sem chave privada porque a consulta GPG filtrada pelo fingerprint retorna exit 2 quando a chave secreta está corretamente ausente; a correção preserva a separação entre chave pública no executor e chave privada na VM de custódia.
- Testes: RED reproduzido no runner (consulta filtrada exit 2; inventário completo sem chaves exit 0); após a correção, 23 testes unitários do contrato passaram, compilação Python passou, verificação de whitespace passou e o canário sintético de criptografia/descriptografia entre as duas VMs conferiu o SHA-256.
- Evidencias: PR #328; fingerprint GPG 6721EA1A15AA0610FD895C1DE865EA82D3A25244; chave pública importada no keyring do usuário ubuntu do runner; readback confirmou ausência da chave privada correspondente no runner; custódia privada em marina-a1-4c24g sob solange-gpg.
- Pendencias: CI oficial da PR ainda precisa concluir; backup real continua bloqueado pelo grant P2, CA oficial Supabase com SHA-256, permissão read buckets do principal da VM e adaptador de restore; a chave de custódia ainda não possui escrow independente contra perda total da Marina.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-10 — [GPT] Concessão P2 restrita para backup cifrado do Supabase staging (#191)

- Base SHA: 37b27caf1f9036c473e6561e7c2b9fad2100b798
- Impacto: A fonte real da homologacao e o Supabase gerenciado hodbtssikurywwwzdkoy, que nao tem backup diario gerenciado no plano Free. A branch da PR #329 prepara exclusivamente o JSON de escopo para autorizar uma exportacao cifrada unica ao bucket privado escolhido pelo proprietario; nenhuma permissao foi ativada por criar o arquivo e nenhuma operacao clinica foi executada.
- Testes: O preflight comparou CODEOWNERS e o contrato require_owner_grant no main ao JSON proposto: action managed_staging_db_encrypted_offsite, ref staging exato, bucket shopvivaliz-free-archive, GPG publico 6721EA1A15AA0610FD895C1DE865EA82D3A25244, escopo DB_ONLY_STORAGE_NOT_BACKED_UP e expiracao 2026-11-15T23:59:00Z inferior a 7 dias. O CI oficial da PR #329 registrou RED governance-gate por ausencia deste proprio delta; conferir GREEN e demais checks no novo HEAD, sem considerar a mera edicao um PASS.
- Evidencias: PR #329 com HEAD inicial 40f9d34e55a1c1a335045459a96d91fbc7d2d736; run de governanca 42770333242 falhou de forma legitima em AUDIT_LEDGER_DELTA=FAIL e possui prova no job 129676371236; issue #191 comentarios 6756469247, 6756778058 e 6757820011 documentam chave privada fora do runner, plano Free, destino e configuracao validada. Revisao foi solicitada somente a shopvivaliz-human, nao foi obtido APPROVED, nem realizado merge ou exportacao.
- Pendencias: Revisao humana APPROVED no HEAD final e gates oficiais, permissao efetiva do runner OCI para bucket get NoPublicAccess, CA oficial Supabase e seu SHA256, secret do grant apos aprovacao, lease e readback, dump cifrado manual e restore isolado do banco gerenciado; Storage e 15 dias de interface real permanecem sem certificacao. Nenhuma mudanca em IAM, banco, paciente, worker, timer ou producao e autorizada por este registro.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-10 — [GPT] Exclusividade do proprietário na criação de restrições (PR #330)

- Base SHA: af8e55cc940311172f7078b85bc81e5ba770d972
- Impacto: Atualização documental de AGENTS.md, CLAUDE.md e GEMINI.md para substituir a antiga regra de dupla aprovação de 08/11/2026 pela determinação do proprietário de 10/11/2026. Nenhum agente poderá introduzir ou agravar bloqueios, gates ou restrições, inclusive por PR ou governança; deverá fornecer comandos para execução pessoal do proprietário. A aplicação inicial excepcional foi solicitada expressamente ao GPT nesta conversa. Sem alteração de código clínico, dados, permissões, workflows, infraestrutura ou controles existentes.
- Testes: Leitura e comparação dos três arquivos propostos com a norma canônica; governança do CI anterior nesta PR informou 7/7 testes de roteamento e 28/28 testes auxiliares PASS, mas AUDIT_LEDGER_DELTA=FAIL porque este registro estava ausente. Após incluir o delta, exigir novo run oficial GREEN no HEAD final; não alegar certificação UI/runtime.
- Evidencias: PR #330 https://github.com/Vivaliz-site/solange-rolla-consultorio/pull/330; falha reproduzida no run 42864853792 (governance-gate) por ausência do delta; correção neste commit documental.
- Pendencias: Verificações oficiais de PR no novo HEAD, aprovações que o GitHub exigir e merge sem bypass. Não altera veredito clínico nem certifica staging/produção.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-10 — [GPT] Manual operacional ilustrado do Consultorio Solange Rolla — PR #336

- Base SHA: e79ff8eaf7edfc9c07380348e547f4a815911da0
- Impacto: Acrescenta docs/manual/README.md, .gitattributes para PDF e Manual_Operacional_Ilustrado_Solange_Consultorio.pdf (32 paginas descritas na PR), sem edicao de codigo executavel, RBAC, infraestrutura, secrets ou dados clinicos. Material documental produzido com capturas de ambiente de demonstracao e etiquetas candidatas, nao comprova homologacao publicada.
- Testes: Nos checks oficiais do HEAD anterior cc6b2637, e2e, lint, typecheck, unit, build, architecture, db e self-test tiveram SUCCESS; o governance-gate falhou exclusivamente por AUDIT_LEDGER_DELTA=FAIL sem este registro. Este commit inclui o delta faltante, mas a validacao GREEN deve ser confirmada no novo HEAD; nao atribuir certificacao de UI ou producao a testes de CI.
- Evidencias: PR #336 e issue #334; arquivos docs/manual/README.md e PDF binario adicionados; check de governanca anterior github.com/Vivaliz-site/solange-rolla-consultorio/actions/runs/42877641731/job/130045117435 documenta causa raiz. As 32 paginas, 28 imagens e verificação PDF constam do relato do autor, nao de auditoria independente deste registro.
- Pendencias: Revalidar governance-gate e checks no HEAD deste delta, conferir qualidade visual e privacidade do PDF, conciliar manuais #335 e #336 sem perda de informacao, nao liberar dados reais antes dos gates gerais de GO-LIVE do Consultorio.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-10 — [GPT] Manual ilustrado com fonte HTML e capturas de demonstracao — PR #335

- Base SHA: 235d9526117a93f4df9c33a201da0d149398c039
- Impacto: Acrescenta em docs/manuais/solange-consultorio-ilustrado-2026-11 uma fonte HTML, manual PDF A4, README e capturas de telas sintéticas de demonstracao. Nao altera rotas de produto, bancos, RBAC, workflows, segredos ou instalacoes. Conteudo e para referencia operacional, e nao certificacao de producao ou autorizacao de uso clinico real.
- Testes: No HEAD anterior 6e0561f2, os jobs e2e, architecture, build, unit, typecheck, lint, db e self-test tiveram SUCCESS; governance-gate falhou por AUDIT_LEDGER_DELTA=FAIL sem registro. Inclusao deste delta corrige a ausencia documental, sujeita a readback GREEN no novo SHA. O autor declarou PDF de 39 paginas com 30 capturas; esta declaracao nao substitui auditoria independente.
- Evidencias: PR #335 associada a issue #333, HTML e assets em docs/manuais/solange-consultorio-ilustrado-2026-11; job github.com/Vivaliz-site/solange-rolla-consultorio/actions/runs/42876999961/job/130042839716 demonstra a falha do ledger anterior. O teste E2E da aplicacao nao e evidencia de publicacao ou aprovacao clinica.
- Pendencias: Conferir os novos checks no HEAD final, validar privacidade e legibilidade dos prints, harmonizar este manual com a PR #336 sem perder informacoes, e manter ambiente clinico NO-GO ate auditoria oficial de homologacao, backup/restore e UI real.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-10 — [GPT] Integracao das etiquetas Link 9027 — PR #332

- Base SHA: a100ff334c00302e30abcb5812ef2cbb887b1c5d
- Impacto: Inclusao de oito arquivos do modulo de etiquetas A4 Link 9027 e um item na navegacao existente, com rota sob papeis e permissao events.read ja implementados no aplicativo. Nao modifica politicas globais, regras de restricao, workflows, roles, bases clinicas, segredos ou infraestrutura.
- Testes: HEAD anterior 996b72c62f228da3368770d7d8182eb2e732b5a5 teve unit, build, lint, architecture, typecheck, e2e e db GREEN. O governance-gate falhou por AUDIT_LEDGER_DELTA ausente no run 42869965133/job/130018275238. A nova reconciliacao do main e o delta exigem verificacao em CI no novo HEAD; a UI da rota autenticada e a impressao em folha fisica nao estao homologadas.
- Evidencias: https://github.com/Vivaliz-site/solange-rolla-consultorio/pull/332; issue #331; comentario da PR com teste Chromium isolado e PDF com nomes ficticios; documentos src/modules/labels/README.md e src/modules/labels/application/layout.test.ts.
- Pendencias: Validar checks oficiais no HEAD corrigido e teste E2E em rota autenticada com sessao autorizada, revisao formal de privacidade/controle de acesso quando aplicavel e calibracao fisica Link 9027. Nao efetuar GO-LIVE nem usar nomes reais ate homologacao.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->


<!-- AUDIT_DELTA_V1 -->
## 2026-11-11 — [GPT] Substituição de referências operacionais legadas por MCP — PR #337

- Base SHA: 63eb283c54d7ea459780cfff3dd8a74640b8fd09
- Impacto: Atualização documental em AGENTS.md para orientar ferramentas MCP já publicadas em vez do antigo canal de acesso remoto. Preservados requisitos anteriores de identidade, segurança, pacientes sintéticos, políticas comerciais, leases/fencing e aprovações; não foram alterados código clínico, workflows, dados, serviços, autenticação nem gates de governança.
- Testes: PR #337 no HEAD ef5ec09a35febb3d275227674cc899baa06f3667 confirmou 7/7 testes de roteamento e 28/28 testes auxiliares GREEN, mas governance-gate RED exclusivamente por ausência de AUDIT_LEDGER_DELTA; este registro preenche a exigência, sujeito a execução oficial no novo HEAD.
- Evidencias: PR https://github.com/Vivaliz-site/solange-rolla-consultorio/pull/337 e log oficial https://github.com/Vivaliz-site/solange-rolla-consultorio/actions/runs/43056399928/job/130646901258; leitura de documentação canônica no main e comparação operacional de MCP Marina/Fred-Win realizada em 11/11/2026, sem dados clínicos.
- Pendencias: Validar todos os jobs GitHub no SHA final, integração protegida, verificação pós-merge e eventual E2E de UI clínica em fluxo independente com pacientes sintéticos; esta alteração documental não certifica produção ou backup/restauração.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-12 — [GPT] Reconciliação do registro de auditoria documental MCP Marina — PR #338

- Base SHA: c517653ae5e8fb275d99ff73023941c0dbd69bfd
- Impacto: A PR #338 acrescenta instruções documentais sobre o parâmetro já existente as_user=ubuntu no MCP Marina em AGENTS.md, CLAUDE.md, GEMINI.md e .github/copilot-instructions.md; este registro sana a omissão do delta append-only. Não altera código executável, credenciais, RBAC, regras impeditivas, ambiente clínico ou configurações de produção.
- Testes: RED comprovado no workflow Repository Governance Gate #43271409599, job #131368607643, com AUDIT_LEDGER_DELTA=FAIL pela ausência de docs/quality/AUDIT_STATUS.md. Após este registro, exigir GREEN no HEAD exato e checks oficiais da PR, sem inferir aprovação ou homologação do staging.
- Evidencias: PR https://github.com/Vivaliz-site/solange-rolla-consultorio/pull/338; execução oficial https://github.com/Vivaliz-site/solange-rolla-consultorio/actions/runs/43271409599; leitura do diff de quatro arquivos e do ledger anterior no HEAD c476a660abf331fccb655037627a2d4d46011ab6.
- Pendencias: Validar o governance-gate e os demais checks no novo commit, integrar apenas pelo mecanismo GitHub permitido e conferir o main. A homologação clínica #98 e o backup/restore da fonte gerenciada #191 continuam independentes e não certificados.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-12 — [GPT] Preflight read-only do backup offsite no Supabase Free (#191)

- Base SHA: 7fff55e36e6df895c8d8cd614fc3ea6da32145c2
- Impacto: acrescenta a opcao manual offsite_preflight no workflow ja existente de evidencias do staging, com o runner self-hosted existente, sem criar worker persistente. A rotina inspeciona somente identidade de origem, pg_dump PG17, chave publica GPG, CA Supabase pinada e metadados OCI NoPublicAccess; nao injeta senha do banco nem grant de exportacao. A consulta agendada ao provedor segue igual e a exportacao cifrada continua exclusiva da opcao offsite_export. Nao modifica gate de promocao nem libera dados clinicos.
- Testes: RED antes da correcao: teste novo ManagedOffsitePreflightWorkflow reprovou por ausencia do modo, task MCP 2bb4d7f5-6bc8-42c5-84dd-e7008929dcf7. GREEN no mesmo clone isolado apos edicao: teste direcionado PASS, 24/24 testes de contrato da exportacao gerenciada PASS, git diff --check PASS, task MCP c507e4eb-3a26-4dbd-8221-7183fcc3a0a4. Checks GitHub no novo HEAD ainda obrigatorios.
- Evidencias: projeto real hodbtssikurywwwzdkoy e organizacao tier_free confirmados pelo conector Supabase; documentacao oficial de 05/11/2026 recomenda export offsite para Free; auditores podem consultar apenas o preflight sem exportar dados, e a saida nao certifica restauração nem quatro buckets/63 objetos.
- Pendencias: integrar pelos gates tecnicos oficiais, executar o novo preflight somente leitura no runner existente e corrigir os erros de infraestrutura que estiverem dentro da autorizacao atual. A certificacao de exportacao real, backup Storage, custodia externa da chave, restore isolado, autorizacao P2 e paridade exact-SHA do staging permanecem obrigatorias; nao fabricar backup nem confundir preflight com APTO.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-12 — [GPT] Proposta de revisão humana da migração Supabase staging para VM Marina — PR #340

- Base SHA: 0a4105253994a84f7643aaaee658543777e955d2
- Impacto: Acrescenta documento de revisão humana na área security/owner-approvals para a eventual migração de Solange staging Supabase gerenciado para stack isolado na VM Marina. A PR é somente proposta: não cria grant executável, regra impeditiva, alteração de RBAC, exportação, importação, Storage, serviço, banco, credencial ou cutover.
- Testes: RED no Repository Governance Gate do HEAD c0a163ebacdd180685f028eef308eb3d4ef56cbd, run 43321809889/job 131544096516, exclusivamente por falta de AUDIT_LEDGER_DELTA_V1; 7/7 testes de roteamento e 28/28 testes auxiliares PASS. Os checks oficiais deste novo HEAD ainda precisam ser verificados.
- Evidencias: PR https://github.com/Vivaliz-site/solange-rolla-consultorio/pull/340; issue https://github.com/Vivaliz-site/solange-rolla-consultorio/issues/191; workflow oficial https://github.com/Vivaliz-site/solange-rolla-consultorio/actions/runs/43321809889; inventário da fonte ativa e da Marina documentado em #191, sem leitura de conteúdo clínico.
- Pendencias: Provar checks oficiais no SHA corrigido e a revalidar revisão proprietária no HEAD final e consultar as regras existentes para eventuais operações posteriores, preparar stack isolado, comprovar cópia íntegra de DB/Auth/Storage e restore, homologar os 15 dias pela UI real no build exato antes de qualquer cutover. Nada neste registro certifica o ambiente publicado.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-13 — [GPT] Correção de extração da URL do Quick Tunnel de staging — PR #341, issue #298

- Base SHA: 0adf98b4e96a26866986e2f9bf49d98dacbc897c
- Impacto: `ops/staging/reconcile-demo.sh` deixa de reutilizar URLs históricas de ciclos anteriores de `solange-demo-tunnel`: consulta o status e a hora de início do container ativo e limita a leitura a 300 linhas do ciclo vigente. Acrescenta regressão sintética em `tests/staging-reconcile-tunnel-url.sh`. Nenhum gate, regra, permissão, autenticação, dado clínico, serviço, configuração comercial ou DNS foi alterado.
- Testes: script anterior retornava `https://stale-historical.trycloudflare.com` na simulação de reinício e falhou com `FAIL: URL de ciclo anterior reutilizada`; após a correção retornou apenas `https://live-current.trycloudflare.com` e vazio para container parado, `PASS`. `sh -n` em ambos os scripts PASS. O teste é totalmente local, sem start/restart de container ou escrita em runtime.
- CI: Repository Governance Gate run 43392779193 falhou por ausência desta entrada de `AUDIT_LEDGER_DELTA`; corrigida no mesmo PR, pendente de nova execução oficial e validação dos checks no HEAD final.
- Evidencias: PR https://github.com/Vivaliz-site/solange-rolla-consultorio/pull/341; problema real e reproduções do staging em https://github.com/Vivaliz-site/solange-rolla-consultorio/issues/298. Testes RED/GREEN executados em ambiente isolado com simulação Docker.
- Pendencias: nenhum deploy, cutover, backup clínico ou E2E público foi executado nesta mudança. O staging publicado não está certificado no SHA da PR; #191 (fonte gerenciada e restore), #98 (UI com dados sintéticos) e #298 continuam NÃO APTO até comprovação operacional. Não afirmar que um teste sintético verifica o Quick Tunnel real.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-13 — [GPT] Portabilidade dos testes de auditoria Linux/Windows — issue #190

- Base SHA: 2a006558f9e135428a8b4c731d093f8aa24db4a9
- Impacto: Corrige falsos negativos do harness local no Windows: extracao de timeout E2E agora normaliza CRLF/CR; verificacoes de workflows normalizam newlines antes dos asserts; teste do hook pre-push continua integral no Linux e em Windows com bash instalado, omitindo apenas quando o interpretador estiver ausente; casos de checksum que exigem shell POSIX sao explicitamente skipped no Windows. Nao modifica codigo de produto, backup real, CI, gates, politicas de aprovacao, auth, dados clinicos ou endpoints.
- Testes: RED sintetico reproduzido em Node com regex original sobre workflow CRLF (falha na extracao do timeout); GREEN da mesma regex com normalizacao (retorna 45). Adicionados testes Vitest de CRLF/CR e skips explicitos para capacidades Unix. Executar suites oficiais da PR para provar regressao e lint; nao alegar testagem Windows real sem runner Windows.
- Evidencias: issue https://github.com/Vivaliz-site/solange-rolla-consultorio/issues/190 e regressao deterministica sobre fixture CRLF; PR tecnica sera vinculada ao checkpoint nesta issue. Nenhuma operacao em banco, Cloudflare, Storage, runner, servico, pagamento ou dados.
- Pendencias: CI/checks no HEAD exato, revisao de regressao, merge automatizado oficial; homologacao grafica do Solange e migracao clinica self-hosted continuam dependentes de #191 e #98. Esta alteracao so corrige ferramenta de teste e nao certifica staging ou release.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-13 — [GPT] Pedido de concessão P2 operacional para migração privada Solange — PR #344

- Base SHA: 14e57fd14a9855287004fb42773613a1a109b51f
- Impacto: documento de pedido operacional de privilégio P2 restrito à cópia cifrada e restore isolado de PostgreSQL 17, Auth/MFA e quatro buckets Storage da fonte Supabase gerenciada para a VM Marina. A decisão de destino é a PR #340 já integrada. Este pedido não concede autorização executável, não cria restrições, não altera regras/gates, não modifica dados, DB, workers, DNS, endpoints, autenticação nem serviços; cutover mantém seu escopo independente.
- Testes: leitura do diff documental na PR #344 sem conteúdo clínico ou segredos; CI, Database e Repository Governance Gate foram vistos em estado queued no HEAD inicial c2cbd1fd3a0657043d6039dc9ffad968d1c56c85. Após este delta, conferir novamente checks oficiais no HEAD atualizado; não declarar GREEN antecipadamente.
- Evidencias: PR https://github.com/Vivaliz-site/solange-rolla-consultorio/pull/344; checkpoint https://github.com/Vivaliz-site/solange-rolla-consultorio/issues/191#issuecomment-6857286862; MCP canários backend e Marina concluídos e consulta read-only do CA staging sem achado, audits a76a6ffa-ab50-4b20-9cdb-7b8639b47ab7, dc5ad775-9d4b-45c4-968d-ddcf97eb1f22, 09e839f5-bd76-45e1-bd95-836ef97e7acc.
- Pendencias: revisão por shopvivaliz-human no HEAD exato e grant P2 operacional efetivo, CA oficial Supabase do banco gerenciado, preflight backup, exportação e restore cifrados do banco e Storage, Auth/MFA, integridade e UI exact-SHA; nenhum deles foi executado por este registro.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-13 — [GPT] Solicitacao P2 de migracao privada para Marina — PR #343

- Base SHA: ac33aa3c672baf51448c9df15289ae26cbfe7220
- Impacto: Acrescenta somente solicitacao JSON de concessao P2 para copiar de forma privada a origem gerenciada Supabase staging de Solange para stack self-hosted isolado na Marina, incluindo DB17, Auth/MFA, APIs e Storage. A decisao de migrar ja consta na PR #340; esta PR NAO cria decisao nova, gate, restricao, permissao IAM, segredo, acesso clinico, workflow, exportacao, servico, DNS ou cutover. `owner_approval=null` e `effective_grant=false` impedem confundir documento com autorizacao efetiva.
- Testes: JSON parse valido; invariantes `effective_grant=false`, `owner_approval=null`, origem e host exatos conferidos contra main; diff revisado para conter apenas solicitacao e este delta. O Repository Governance Gate falhou no HEAD inicial c66a48f8 por falta de registro de delta (run 43451880114/job 131975842018); corrigido nesta revisao, ainda exige novos checks oficiais.
- Evidencias: PR https://github.com/Vivaliz-site/solange-rolla-consultorio/pull/343, solicitacao de revisao formal para shopvivaliz-human, issue https://github.com/Vivaliz-site/solange-rolla-consultorio/issues/191; Supabase vinculado confirmou staging ACTIVE_HEALTHY em PostgreSQL 17.6.1.166. Nenhuma escrita em dado do projeto.
- Pendencias: aprovacao formal do proprietario no HEAD exato, emitindo grant operacional pelo mecanismo vigente; obter CA real pelo dashboard oficial do Supabase, instalar no runner atual com SHA256 conferido e configurar variables existentes no Environment staging. Em seguida testar backup/restore da fonte correta, migrar no escopo autorizado, validar Auth/MFA/Storage e UI E2E antes de cutover. A CA nao estava provisionada no Environment e o navegador oficial nao tinha sessao Supabase autenticada. Nao gerar CA substituta nem desligar verify-full.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-13 — [GPT] Marcador da URL de staging so apos restart bem-sucedido — issue #298

- Base SHA: ce2718916716d05aa4815a666d35d4e5cd28110c
- Impacto: `ops/staging/reconcile-demo.sh` so publica `current-url.txt` apos `docker restart` bem-sucedido; falha transitoria preserva o marcador antigo e e tentada novamente pelo loop existente, mesmo que `APP_URL` ja tenha sido atualizado. A correcao evita falso indicador de publicacao, sem alterar politica, gate, credenciais, workloads, dados clinicos ou servicos reais. Acrescentada regressao `tests/staging-reconcile-marker-after-restart.sh` com Docker falso.
- Testes: RED no script original com `exit=1` apos falha de restart simulado; GREEN no patch: `PASS: marker follows successful restart, retry is idempotent`. `sh -n` em ambos scripts PASS. Suites oficiais, CI e verificacao de SHA devem ser acompanhadas no HEAD final da PR; nenhum sucesso de deploy alegado.
- Evidencias: reproducoes locais isoladas (2026-11-13); issue https://github.com/Vivaliz-site/solange-rolla-consultorio/issues/298; branch `gpt/solange-restart-marker-20261113`, sem escrita em ambiente clinico. Readback MCP Marina anterior confirmou que o staging do projeto nao possui container Solange ativo, logo este teste nao prova URL HTTPS publicada.
- Pendencias: revisar diff, checks CI, merge oficial e readback no main; staging Quick Tunnel, UI grafica, backup/restore do Supabase gerenciado e migracao a Marina seguem nao certificados. Sem executar restart, publicacao de staging, transferencia clinica ou cutover nesta alteracao.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-13 — [GPT] Correção de vazamento de listeners do worker de documentos — P1, PR #346

- Base SHA: da7fb9bcd4e02098de114aa42f2737245a7658dd
- Impacto: Base original da PR #346: ce2718916716d05aa4815a666d35d4e5cd28110c. Em src/workers/document-worker-runtime.ts, a espera repetida do worker removia o listener de abort apenas no encerramento de sua vida; timeouts normais mantinham callbacks no mesmo AbortSignal. Corrigido o descarte do callback após cada timeout, sem modificar dados clínicos, migração Supabase, serviços de produção, restrições, grants ou o fluxo de cancelamento. Teste preventivo adicionado em src/workers/document-worker-runtime.test.ts.
- Testes: RED real no código anterior: Vitest 8/9, regressão falhou por zero remoções contra duas esperadas (MCP task d9499fd3-857e-4bb5-9f06-e9767db5b982). GREEN após correção: 9/9 testes dirigidos, typecheck e lint sem erros (MCP task 9d857f36-5e62-4ddb-91aa-5aad8f007f93). Regressão mais ampla e build executados em tarefa suplementar be4d67f5-5791-4207-b963-fb879c9c26f1, sujeitos a readback. A execução CI inicial detectou falha do formato deste ledger; ajustado nesta revisão, pendente de CI oficial no HEAD atualizado. Revalidacao isolada apos integracao da PR #345 em main: npm ci PASS, Vitest dirigido 9/9 PASS, lint 0 erros (2 avisos preexistentes de UI), npm run typecheck PASS, npm run worker:documents:build PASS; task MCP 89f9ddc4-f1c0-42d6-95b1-776d7857f16d exit 0. Audit ledger delta da nova base PASS, diff --check PASS.
- Evidencias: PR https://github.com/Vivaliz-site/solange-rolla-consultorio/pull/346; falha de governança anterior em https://github.com/Vivaliz-site/solange-rolla-consultorio/actions/runs/43512832515/job/132187127381 com AUDIT_LEDGER_DELTA=FAIL por ausência dos seis campos obrigatórios; teste de regressão preservado na PR; canário administrativo MCP Marina audit 9df1420f-9c12-4659-aaca-e6d0bb2babf8 nesta rodada. Resolucao de conflito mantendo integralmente o ledger de main e a entrada P1 da branch: tasks MCP 4c3e6533-7d89-4b7a-9cf9-cc19cbce461a e 3e4db866-bc22-4810-904f-63d746aee921, comparacao com main da7fb9bcd4e02098de114aa42f2737245a7658dd; sem reescrever historico de main.
- Pendencias: Confirmar o governance-gate, CI Database e suites oficiais no novo HEAD, fazer merge somente com todos os gates efetivos, verificar o SHA final em main e o release do worker no ambiente correto; revalidar comportamento real e UI/E2E quando pertinente. A migração Supabase #191 continua condicionada a grant P2 efetivo, lease e CA oficial; a P0 Amazon #630 segue independente. Não declarar APTO geral.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-13 — [GPT] Corrigir rollback da identidade de release no staging — P1 #269

- Base SHA: 13fa58181d7e904771bcc122e6cc24329ba19332
- Impacto: O workflow staging-promote.yml nao restaurava a ausencia original de state/deployed-sha.txt quando a primeira promocao falhava; o candidato permanecia anunciado como release vigente embora o runtime fosse revertido. A correcao usa marcador explicito de ausencia anterior, reaproveita ops/staging/restore-deployed-sha.sh em ambos os caminhos de rollback, publica SHA via rename atomico e limpa marcadores na finalizacao. Sem novas restricoes, dados clinicos, migracao, grants ou operacoes comerciais.
- Testes: RED reproduzido com tres falhas antes da inclusao do helper e seu wiring (MCP audit d6d26199-a304-46c5-8a99-8ecc02895493); GREEN de 5/5 testes dirigidos apos alteracao (audit 32738f17-09a7-47b4-a535-f703105e1c10). Regressao ampliada, lint, typecheck, build e checks oficiais exigem resultados separados no HEAD final e nao sao presumidos.
- Evidencias: clone isolado de main no SHA 13fa58181d7e904771bcc122e6cc24329ba19332 via task 88cd92e5-94c8-45ad-a530-fcf74be1068f; issue https://github.com/Vivaliz-site/solange-rolla-consultorio/issues/269. Workflow Staging Promote 43538691508 falhou no preflight de backup gerenciado do staging, dependencia distinta de #191 que nao pode ser ignorada.
- Pendencias: executar regressao completa aplicavel, publicar PR tecnica, checks oficiais, integrar quando autorizado e validar release/main SHA; homologar UI #98. Migracao e backup gerenciado #191 exigem grant P2 efetivo, lease e provas de restore; nao declarar APTO.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->

<!-- AUDIT_DELTA_V1 -->
## 2026-11-13 — [GPT] Corrigir falso-verde do marcador Quick Tunnel do staging (#268)

- Base SHA: 5b8d02d91b9045f3865e22178b4f89cf0668aa31
- Impacto: O reconciliador nao deve publicar nem manter o marcador de URL de staging para um Quick Tunnel sem health publico. A verificacao agora exercita DNS/TLS/HTTP 200 e contrato JSON de /api/health via Node 24 do container web, sem instalar dependencias nem alterar grants, DB, Auth, Storage, credenciais, protecoes ou servicos em producao. O marcador invalido e retirado e sua recuperacao e automatica, sem criar novo workflow/gate.
- Testes: RED reproduzido no baseline com marcador indevido (task MCP d98dcb33-0579-4a18-abf4-8f72b6cf0f13, exit_code=1); GREEN e 3/3 testes de regressao staging aprovados (tasks f87ad7a9-2ff0-4c34-9a5d-6ec87f6cf1f7 e 61bf4b6e-06bf-4204-841a-537e277e358a). Na task c7930e8e-2676-4721-8cfa-439ab87e3087, exit_code=0: npm ci PASS; lint 0 errors/2 warnings preexistentes; typecheck PASS; build Next.js PASS; 757 testes PASS/1 SKIP; governanca absoluta PASS; diff --check PASS. Checks CI oficiais no GitHub e staging publicado ainda nao certificados.
- Evidencias: issue https://github.com/Vivaliz-site/solange-rolla-consultorio/issues/268; alteracoes em ops/staging/reconcile-demo.sh, tests/staging-reconcile-public-health.sh e docs/operations/INCIDENT_RESPONSE.md. Testes isolados nunca acessaram dados clinicos, tokens nem staging real; execucao remota auditada no MCP.
- Pendencias: checks oficiais e merge do HEAD exato; deploy do reconciliador em staging somente com gates de backup gerenciado autorizados e validados; E2E grafico de URL externa e #98; restore fonte real #191 e migracao Supabase apenas com P2/lease efetivos.
- Estado: NAO_APTO
<!-- /AUDIT_DELTA_V1 -->
