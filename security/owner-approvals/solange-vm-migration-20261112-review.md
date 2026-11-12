# Revisão do proprietário — migração do Supabase Solange para VM Marina

Status: **PROPOSTA PARA REVISÃO HUMANA — NÃO É GRANT EXECUTÁVEL**.

## Decisão solicitada

Autorizar uma migração única, faseada e reversível do projeto Supabase **ativo de staging** para um stack Supabase self-hosted na VM `marina-a1-4c24g`, preservando a origem até a certificação do cutover.

Esta proposta não reativa o projeto Supabase de produção que está INACTIVE e não autoriza alteração de produção clínica.

## Fonte e destino exatos

- Fonte: projeto Supabase `solange-rolla-staging`, ref `hodbtssikurywwwzdkoy`, região `sa-east-1`, PostgreSQL `17.6.1.166`.
- Runtime associado: staging atualmente usa a URL do projeto gerenciado acima.
- Destino: VM `marina-a1-4c24g`, stack Supabase self-hosted isolado, PostgreSQL 17 compatível, novos volumes Docker dedicados e rede privada durante a validação.
- Projeto `solange-rolla-production`, ref `nfwipekzmfoekvhvzaqe`: **INACTIVE** no inventário de 12/11/2026; excluído deste escopo.

## Escopo de dados e componentes

- PostgreSQL completo: schemas de aplicação e clinical, migrations, extensões, funções, triggers, policies/RLS, roles e grants necessários.
- Supabase Auth: usuários, identidades, fatores MFA e configuração necessária. Não copiar sessões/refresh tokens ativos; os usuários precisarão autenticar novamente após o cutover. Preservar fatores MFA verificados se compatíveis e validar login antes da promoção.
- Supabase Storage: quatro buckets privados, seus metadados/policies e os 63 objetos existentes; transferir bytes e validar SHA-256 de origem/destino.
- Componentes Supabase usados pelo runtime: PostgREST, GoTrue/Auth, Storage API, Realtime, gateway e demais dependências efetivamente usadas pelo app.
- Configuração de JWT/keys, SMTP, URLs e secrets: provisionamento novo e seguro na VM; nunca registrar valores em logs, PR ou issues.
- Aplicação e workers: somente após validação funcional do stack privado e aprovação separada do cutover.

## Fases autorizáveis

1. Preparação: instalar/configurar o stack isolado na Marina com volumes novos; não tocar no volume legado PG15.
2. Cópia: exportar a fonte staging e importar no destino por canal cifrado, sem escrita concorrente na origem; incluir Auth e Storage.
3. Verificação: comparar schema/migrations, contagens agregadas, RLS, roles, MFA, buckets, objetos e hashes; testar API/Auth/Storage/Realtime com dados sintéticos.
4. Ensaio: provar rollback e estimar janela/RPO/RTO sem alterar o endpoint ativo.
5. Cutover: somente após aprovação formal específica, atualizar endpoint/segredos do runtime e workers em janela controlada; manter origem intacta e rollback disponível.
6. Encerramento: somente após E2E gráfico e readback independente, decidir com o proprietário quando desativar o projeto gerenciado.

## Limites e proibições

- Não iniciar, reutilizar ou sobrescrever o volume antigo `supabase_db_solange-rolla-consultorio` (PostgreSQL 15, container de validação parado desde 17/10).
- Não exportar/importar dados clínicos ou pessoais, Auth ou Storage antes do grant P2 efetivo e lease/ownership confirmados.
- Não publicar endpoints, abrir portas públicas, alterar DNS, Cloudflare, Vercel, runtime, workers ou credenciais antes de aprovação específica de cutover.
- Não reativar o projeto `solange-rolla-production` INACTIVE.
- Não desativar nem apagar a origem gerenciada após a cópia; manter rollback até aceite final.
- Não criar runner, worker, timer ou automação nova para esta tarefa.
- Nenhuma compra/upgrade pago está incluído.

## Evidências de preflight (12/11/2026)

- Fonte staging ativa: PostgreSQL 17.6.1.166, banco de aproximadamente 17 MB; 47 tabelas em `public` e 2 em `clinical`.
- Storage: quatro buckets privados; 30 objetos fiscais, 33 documentos assinados, dois buckets vazios; total 63 objetos.
- Marina: 8 OCPUs, aproximadamente 23 GiB RAM disponíveis no host, 121 GB livres no disco.
- Volume legado: PostgreSQL 15, aproximadamente 71 MB, container `marina-supabase-validation` parado desde 17/10/2026. Não é cópia atual nem destino válido.
- Não existe stack Supabase Solange ativo na Marina nesta leitura.
- O projeto Supabase production está INACTIVE.

## Aprovação requerida

A revisão de `shopvivaliz-human` deve aprovar **somente a preparação e cópia privada da fonte staging para um destino isolado na Marina**, nos limites acima. A aprovação desta proposta não autoriza cutover, exposição pública, migração do projeto production INACTIVE, nem desligamento da origem. O cutover exige readback de integridade e autorização owner-scoped adicional antes de alterar runtime/DNS/segredos.

Este arquivo é somente uma proposta de revisão; não cria autorização executável. Um grant P2 consumível deverá ser emitido separadamente, com valores exatos, expiração curta e aprovação no HEAD final, após a decisão do proprietário.
