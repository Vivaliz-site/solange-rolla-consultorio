# Pedido operacional P2 — execução da migração Solange para Marina

**Situação em 13/11/2026:** `AGUARDANDO_CONCESSAO_FORMAL`. Este arquivo é um pedido de privilégio operacional específico. **Não é grant executável**, não declara revisão ou aprovação GitHub que ainda não aconteceu e não modifica gates, RBAC ou regras vigentes.

## Decisão já tomada

A decisão do proprietário foi formalizada e integrada na [PR #340](https://github.com/Vivaliz-site/solange-rolla-consultorio/pull/340). **Não reabrir a decisão**: migrar o banco **e os backups**, além dos serviços Supabase necessários, do staging gerenciado `hodbtssikurywwwzdkoy` (São Paulo, PostgreSQL 17) para um stack completo, isolado, na VM `marina-a1-4c24g`. Preservar a origem e jamais substituir a fonte gerenciada pelo volume Docker/PG15 legado. O projeto de produção Supabase inativo não é fonte desta tarefa.

## Capacidade P2 solicitada — fase de cópia privada e homologação

- **Recurso e principal:** execução administrativa autorizada exclusivamente nos ambientes Solange staging gerenciado e sandbox privado Solange na Marina, pelo executor corporativo formalmente identificado, após comprovar permissão efetiva.
- **Operações autorizáveis:** exportação lógica cifrada consistente do banco gerenciado; cópia integral e verificável dos quatro buckets privados/objetos Storage; migração compatível de schemas, RLS, roles, funções, índices, extensões, Auth, MFA e metadados; importação apenas em volumes e serviços **novos e isolados** na Marina; testes sintéticos de restore, Auth/MFA, APIs, Storage e Realtime; verificação independente de contagens, integridade, hashes e recuperação dos backups.
- **Destino:** stack Supabase self-hosted, incluindo PostgreSQL 17, Auth/GoTrue, PostgREST, Storage e demais serviços usados, sem exposição pública antes da habilitação prevista pelo fluxo vigente.
- **Preservação:** sem exclusão ou reset de dados clínicos/identidades na origem; sem alterar endpoints, DNS, credenciais, autenticação ou workers atualmente em uso; sem acesso desnecessário ao conteúdo clínico. Manter trilha de rollback e readback.
- **Limites operacionais existentes:** executor e permissão P2 válidos no mecanismo oficial, aprovação `shopvivaliz-human` quando requerida, escopo/SHA/expiração correspondentes, MFA, RBAC, lease/fencing exclusivo, evidências de backup e verificação de restauração; sem reproduzir ou divulgar segredos/dados de pacientes.
- **Fase de cutover:** mudança do endpoint/runtime, alteração de fontes de escrita, desativação de fonte antiga e publicação operacional **não fazem parte desta fase**. Obter a autorização operacional específica para cutover pelo fluxo vigente, preservando a decisão de destino já ratificada.

## CA oficial e dependências que não podem ser simuladas

A CA necessária para o **banco gerenciado de origem** não é uma CA autogerada do projeto ou da VM. Deve ser o **Server root certificate fornecido pelo próprio Supabase** para a conexão do staging `hodbtssikurywwwzdkoy`, obtido via painel autenticado em *Database Settings > SSL Configuration > Download Certificate*. Instalar o arquivo verdadeiro no runner canônico `solange-ci-a1` da VM de backend, sem editar secret values em Git; preencher as variáveis **existentes** `SUPABASE_MANAGED_DB_CA_FILE` e `SUPABASE_MANAGED_DB_CA_SHA256` no environment `staging` com path e digest verificados. Manter `sslmode=verify-full`.

O grant já existente `security/owner-approvals/managed-staging-backup-191.json` abrange exclusivamente **DB_ONLY** para backup cifrado off-site e não transfere privilégio para importação clínica, Storage ou cutover. Seu prazo e escopo não são alterados por este pedido. O cliente `pg_dump` 17 e a chave GPG pública foram comprovados no **runner backend**, evitando instalação duplicada na Marina.

## Evidência de preparação e decisão operacional requerida

- Fonte gerenciada ativa: projeto Supabase `hodbtssikurywwwzdkoy`, PostgreSQL `17.6.1.166`; volume PG15 legado não serve como prova.
- `main` observado no início do pedido: `14e57fd14a9855287004fb42773613a1a109b51f`.
- [Issue #191](https://github.com/Vivaliz-site/solange-rolla-consultorio/issues/191): backup da origem gerenciada e restore ainda não certificados; o preflight oficial falhou em `database_ca_missing`.
- [Issue #98](https://github.com/Vivaliz-site/solange-rolla-consultorio/issues/98): UI real e persistência exact-SHA ainda não homologadas.

**Próxima atuação de `shopvivaliz-human`:** revisar esta PR no HEAD exato e, pelo mecanismo P2 formal vigente, conceder a autorização executável para a **fase privada de cópia/restore da fonte clínica**. Aprovar a PR meramente documental **não** cria, por si, uma capacidade de runtime. Somente após comprovação do grant real e ownership livre o executor poderá transferir dados e validar persistência; cutover continua separado.

Este registro não adiciona exigências novas, altera proteções ou amplia permissões por ato de agente.
