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
