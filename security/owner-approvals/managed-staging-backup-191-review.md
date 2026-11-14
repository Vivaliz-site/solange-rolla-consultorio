# Owner review — managed Supabase staging backup (#191)

Status: **PROPOSTA PARA REVISAO HUMANA — NAO E GRANT EXECUTAVEL**.

## Escopo solicitado
- Acao: `managed_staging_db_encrypted_offsite` (**somente exportacao logica cifrada do banco de staging**, sem restore/destruicao).
- Fonte unica: projeto Supabase gerenciado `hodbtssikurywwwzdkoy` (`solange-rolla-staging`, `sa-east-1`), nunca o Docker local ou projetos de producao.
- Executor: script existente `scripts/backup-managed-staging-offsite.py`, apenas pelo `workflow_dispatch.mode=offsite_export` do workflow canonico existente.
- Banco via TLS `verify-full`, `pg_dump` 17, GPG com chave **publica** e custodia privada externa; upload somente em bucket OCI privado validado, com hash de ida/volta.
- Escritor unico via lock, sem novo runner, timer, automacao ou acesso publico.
- Limite: backup **DB_ONLY_STORAGE_NOT_BACKED_UP**. Storage (4 buckets, 63 objetos na verificacao de 08/11) exige exportacao e restore separados; nao declarar recuperacao clinica completa.
- Prazo: grant executavel com expiracao maxima de 7 dias a partir da emissao e aprovacao humanas.

## Condicoes obrigatorias antes de conceder permissao executavel
1. Identificar e atestar por fonte oficial o **nome e namespace OCI do bucket**, permissao de leitura/escrita, `NoPublicAccess`, retencao e destino externo; o bucket ainda nao foi certificado.
2. Definir e conferir o **fingerprint GPG publico de 40 hexadecimais** de destinatario sob custodia independente; proibir chave privada no runner.
3. Comprovar binario `pg_dump` versao 17, conectividade com CA TLS validada e identidade do banco gerenciado; secrets apenas no ambiente protegido.
4. Abrir/atualizar no **mesmo fluxo de revisao humana** o arquivo consumido pelo executor `security/owner-approvals/managed-staging-backup-191.json`, preenchido com os valores exatos `action`, `source_ref`, `oci_bucket`, `gpg_fpr`, `scope`, `expires_at` e `approved_by`, sem placeholders. A aprovacao deve valer no HEAD final apos esses valores.
5. Configurar `SOLANGE_MANAGED_BACKUP_OWNER_GRANT=scoped-191-v1` exclusivamente no GitHub Environment autorizado, somente apos verificacao do grant e do lease.
6. Executar exportacao criptografada em ambiente autorizado, verificar hash/upload/download e executar **restore isolado**; certificar RLS/schema e Storage com evidencia independente na issue #191.
7. Manter o gate `no_completed_managed_backup` e o status NAO_APTO ate o restore real. Proibido promover staging, acessar dados clinicos por esta PR, ou alegar backup concluido pela aprovacao.

## Decisao solicitada a shopvivaliz-human
Revisar este escopo e aprovar **a preparacao condicional**. Esta PR **nao** cria o JSON executavel, nao configura secrets e nao habilita exportacao. A aprovacao deste documento isolado **nao equivale** a autorizacao para rodar backup; o grant completo, atestado e revisado no HEAD sera necessario para isso.

Referencia: https://github.com/Vivaliz-site/solange-rolla-consultorio/issues/191
