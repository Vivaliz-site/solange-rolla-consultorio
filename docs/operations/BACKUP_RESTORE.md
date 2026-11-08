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
