# Backup e Restore

## Estado da fonte publicada e gate de restauração — 07/11/2026

**Prevalece sobre os exemplos históricos de Docker local abaixo.** A homologação atual usa um projeto Supabase **gerenciado**, não o PostgreSQL Docker da VM. No [workflow oficial de metadados #42326436389](https://github.com/Vivaliz-site/solange-rolla-consultorio/actions/runs/42326436389), o PAT de Management API foi efetivamente injetado e a consulta retornou `no_completed_managed_backup` em 07/11, após superar a falha anterior de injeção. **Isso não comprova um backup recente nem um restore.** O Supabase [não oferece backup diário automático no plano Free](https://supabase.com/kb/faqs/platform/free-plan-backups); a alternativa suportada sem upgrade é uma exportação lógica da **fonte gerenciada real** com Supabase CLI/`pg_dump`, armazenada com segurança fora do projeto e restaurada em ambiente isolado. **Não** tratar dump do Docker local como backup do Supabase publicado. A criação/armazenamento seguro de backup remoto e a prova de Storage/chaves ainda exigem implementação, credenciais escopadas, destino privado validado e aceitação P2 se aplicável. Não salvar dumps clínicos em repositório ou logs.

### Restauração manual restrita a banco descartável

O script `scripts/verify-backup-restore.sh` agora recusa qualquer URI hospedada/remota, inclusive Supabase e URLs que omitem literalmente a palavra "production". Também recusa credenciais embutidas na URL, destino que não seja **`solange_restore` em loopback**, checksum `.sha256` ausente/divergente, banco reutilizado ou sem marcador verificável. Os dumps são restaurados em transação única com erro fatal, seguidos de verificação das tabelas `public.profiles`, `clinical.records`, `auth.users`, de RLS em `clinical.records` e de política clínica.

Somente em PostgreSQL **local e descartável**, criado do zero e nunca com produção conectada por túnel, preparar o marcador antes do exercício:

```sql
CREATE DATABASE solange_restore TEMPLATE template0;
ALTER DATABASE solange_restore SET shopvivaliz.restore_drill_only = 'yes';
```

Com um dump da origem correta e checksum correspondente, usar uma identidade local restrita e senha via `PGPASSWORD` ou arquivo `pgpass`, **não na URL**:

```sh
RESTORE_ENV=staging_restore_drill \
BACKUP_FILE=/caminho/privado/backup-validado.dump \
RESTORE_DB_URL=postgresql://postgres@127.0.0.1:55432/solange_restore \
scripts/verify-backup-restore.sh
```

O exemplo é documental: não dispara backup nem restore, não prova que o volume, chave ou dados estão disponíveis. A restauração real de staging no Supabase gerenciado **não** foi executada. O verificador Docker separado continua apropriado para o dump portátil em contêiner novo, mas não prova a fonte gerenciada.

**Integridade do exercício portátil (08/11):** o verificador Docker também exige arquivo regular, não-symlink, par `.sha256` regular e checksum idêntico **antes** de chamar o Docker. Evidências positivas são rotuladas `scope=legacy_local_only managed_staging_certified=false`; isso não substitui o backup criptografado off-host da fonte Supabase real, restauração isolada, RLS nem Storage. Os artefatos do scheduler local histórico continuam classificados como `NAO_APTO` para a homologação gerenciada.


## Objetivos

- RPO alvo: 24 horas.
- RTO alvo: 4 horas; o drill de homologação mede o tempo real.
- Retenção inicial de homologação: 14 dias.
- Exercício: trimestral, antes do go-live e após incidente de disponibilidade/perda.

## Homologação

A VM mantém backup lógico diário em `/home/ubuntu/solange-client-demo/backups/`. `scripts/backup-homologation.sh` usa esse diretório como destino padrão (ou `SOLANGE_BACKUP_DEST` quando explicitamente configurado), falha fechado quando o destino não está disponível, gera primeiro arquivos `.partial`, só promove dumps não vazios, grava SHA-256 e `LAST_SUCCESS`, usa permissões restritivas e remove artefatos com mais de 14 dias.

São gerados dois artefatos na mesma execução: um dump completo do PostgreSQL/Supabase e um dump `public + clinical + auth` destinado ao drill portátil. O segundo existe porque a imagem local Supabase inclui extensões/plataforma específicas que não devem ser sobrepostas em um PostgreSQL vazio durante o teste de recuperabilidade da aplicação.

O scheduler de homologação roda em container Docker com `--restart unless-stopped`, executa imediatamente após iniciar/reiniciar e repete a cada 86400 segundos. O container possui health check que rejeita `LAST_SUCCESS` stale, artefatos ausentes e divergência de SHA-256 nos dois dumps. O segredo do banco não é persistido no script nem em logs: é lido em runtime do container Supabase já provisionado.

## Restore isolado

Use apenas o artefato `solange-homologacao-app-auth-*.dump` produzido pela automação:

```sh
BACKUP_FILE=/home/ubuntu/solange-client-demo/backups/solange-homologacao-app-auth-YYYYMMDDTHHMMSSZ.dump scripts/verify-backup-restore-docker.sh
```

O verificador cria um PostgreSQL 15 descartável, restaura o dump sem owner/ACL, exige `public.profiles`, `clinical.records`, `auth.users` e políticas RLS, mede RTO e destrói o container ao sair. Nunca restaura sobre produção ou sobre o banco de homologação ativo.

## Evidência histórica e verificação atual

A automação foi ativada na VM de homologação em container `solange-backup-scheduler` com política `unless-stopped`. O drill histórico de 04/09/2026 concluiu com as quatro verificações verdadeiras e RTO de aproximadamente 2 segundos para o conjunto então existente.

Na auditoria independente de 15/09/2026, o último backup observado em `/home/ubuntu/solange-client-demo/backups/` teve os dois SHA-256 validados e o restore isolado do subconjunto `public + clinical + auth` concluiu com `restore_success rto_seconds=7`.

## Storage e chaves externas

O dump PostgreSQL não substitui backup de objetos privados nem das chaves externas. Antes de produção, validar backup/retention do Storage privado no provedor e manter versões das chaves de criptografia fora do banco/backup. Logs e evidências não devem conter PII, tokens, CPF, respostas clínicas ou conteúdo clínico.

## Auditoria de proveniência de backup — 13/10/2026

A auditoria V5 reproduziu a divergência entre o runtime de homologação, que usa um
projeto Supabase gerenciado, e o script legado
`scripts/backup-homologation.sh`, que tentava copiar exclusivamente o banco
Docker local `supabase_db_solange-client-demo`. O container local não está ativo,
e o último backup local observado não prova recuperação do banco gerenciado.

A execução do script legado agora recusa fonte incompatível antes de iniciar
`pg_dump`. O healthcheck de artefatos exige `source_kind=managed_supabase`
e `source_ref` equivalente ao projeto de staging efetivamente configurado no
runtime. Backups antigos sem essa identidade são explicitamente rejeitados.

`.github/workflows/staging-managed-backup-evidence.yml` consulta apenas
**metadados** das cópias mantidas pelo provedor através da Management API,
usando secrets restritos ao ambiente `staging`. Não baixa conteúdo clínico,
não cria backups adicionais, não restaura dados e não acessa produção. Essa
consulta verifica existência/recência do backup do projeto correto, mas **não
certifica restore de PostgreSQL, Storage privado, chaves externas ou RPO/RTO**.

Até haver exportação/retention adequada, restore isolado da fonte efetiva e
prova separada dos objetos privados, o estado permanece **NÃO APTO**; nunca
reinterpretar checksum local como recuperação do sistema publicado.

## Exportacao criptografada da fonte Supabase gerenciada (correcao P1 08/11/2026)

A rotina nova `scripts/backup-managed-staging-offsite.py` trata **somente o
PostgreSQL gerenciado** do staging, nao o container Docker legado. Usa
`SUPABASE_STAGING_PROJECT_REF` + URL HTTPS do runtime e usuario Postgres
associado ao mesmo projeto. Para session pooler, o usuario precisa ser
`postgres.<ref>` e a porta de sessao 5432, nao a porta transaction 6543.
`pg_dump` deve ser da familia **17**, a mesma major do PostgreSQL gerenciado.
O backend tem cliente 16.15 e **nao deve** ser usado para dump do servidor 17.

O transporte Postgres configura **TLS verify-full e truststore do sistema**;
senha de banco e outros segredos ficam no environment protegido do job,
nunca em argumentos, URL, commit, log ou comando mostrado. O pipeline transmite
as linhas de backup diretamente do `pg_dump -Fc` para criptografia **GPG
com fingerprint publica fixa**, antes de gravar no disco: nao gera dump
plaintext intermediario. Usa `flock` 0600 por projeto, objeto OCI com nome
unico (nao sobrescreve `latest`) e validacao do SHA-256 apos baixar a
copia cifrada, com manifesto sanitizado. Sem certificado/chave de
recuperacao independente, nao alegar restore. E proibido importar a chave
privada para o runner ou registrar passwords/objetos de Storage.

O workflow **ja existente** `.github/workflows/staging-managed-backup-evidence.yml`
continua agendado **apenas para conferir metadados do provedor**, sem escrita.
Uma chamada manual **explicita** `workflow_dispatch.mode=offsite_export`
permite acionar uma unica tentativa no **runner existente** somente depois
de todas as condicoes abaixo serem comprovadas:

- **Fonte:** `hodbtssikurywwwzdkoy` (staging ativo, projeto `sa-east-1`);
  o repo, URL runtime e usuario do pooler devem apontar a mesma identidade;
  preservar a referencia de producao separada e inativa.
- **Ambiente GitHub `staging`:** o segredo `SUPABASE_DB_PASSWORD`
  ja existe por nome, mas precisa validacao do consumidor; configurar
  `SUPABASE_MANAGED_DB_HOST` e `SUPABASE_MANAGED_DB_USER` como **vars**,
  nao transportar a senha em URL ou mensagem.
- **Criptografia:** provisionar e conferir uma chave GPG publica de backup no
  runner e registrar sua fingerprint em `SOLANGE_BACKUP_GPG_RECIPIENT`.
  A chave **privada e a prova de recuperabilidade** devem ser mantidas fora da VM.
- **Destino OCI:** configurar namespace e nome de bucket privado nas vars
  `SOLANGE_BACKUP_OCI_NAMESPACE` e `SOLANGE_BACKUP_OCI_BUCKET`; a
  identidade oficial `instance_principal` deve conseguir `bucket get`,
  `object put/get` e verificar retorno. **Nao reutilizar como prova
  o objeto `solange-staging-latest.dump` do Docker local.** O bucket
  `shopvivaliz-free-archive` retornou `BucketNotFound` no backend e
  na Marina nas consultas atuais de 08/11; nao ampliar RBAC ou criar
  bucket sem grant e custo verificados.
- **P2:** merge pessoal de `shopvivaliz-human` para
  `security/owner-approvals/managed-staging-backup-191.json`, autorizando
  apenas fonte e bucket exatos com expiracao ate sete dias. So depois, o
  owner provisiona o segredo `SOLANGE_MANAGED_BACKUP_OWNER_GRANT`
  com o valor `scoped-191-v1` no environment `staging`.
  Sem os dois gates, a tentativa falha **antes de qualquer dump**.
- **Estado de liberacao:** a exportacao acima e **DB_ONLY**. Mesmo um
  ciphertext OCI com checksum remoto valido continua
  `STORAGE=NOT_VALIDATED RESTORE=NOT_VALIDATED AUDIT_VERDICT=NAO_APTO`.
  O staging Supabase tem quatro buckets e 63 objetos privados de Storage,
  que exigem copia criptografada separada, inventario reconciliado e
  readback apos restauracao. O gate de promocao atual nao pode ser
  trocado pelo simples retorno positivo do backup DB.

O codigo e os testes sinteticos sao uma preparacao tecnica; **nenhum dump da
fonte gerenciada foi criado ou exportado** ate comprovar todos os requisitos.
Nao inserir tokens ou dados clinicos nas issues ou nos logs.
