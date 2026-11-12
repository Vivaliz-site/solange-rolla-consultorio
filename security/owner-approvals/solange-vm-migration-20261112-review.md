# Parecer técnico: migração do Supabase Solange para a VM Marina

**Natureza:** análise técnica para decisão do proprietário. Este documento **não cria gate, restrição, obrigação de aprovação ou grant executável**, nem altera políticas existentes.

## Pedido registrado

O proprietário solicitou migrar o banco da Solange para uma VM. O destino operacional identificado é `marina-a1-4c24g`, com um stack Supabase self-hosted compatível com as funcionalidades efetivamente utilizadas pela aplicação. A intenção é reduzir a dependência do Supabase gerenciado, preservando os dados e a possibilidade de reversão.

## Inventário verificado em 12/11/2026

- Fonte em uso pelo staging: `solange-rolla-staging`, ref `hodbtssikurywwwzdkoy`, região `sa-east-1`, PostgreSQL `17.6.1.166`.
- Projeto `solange-rolla-production`, ref `nfwipekzmfoekvhvzaqe`: `INACTIVE` nesta leitura; não corresponde à fonte ativa do staging.
- Dados do banco staging: aproximadamente 17 MB, 47 tabelas no schema `public` e 2 em `clinical`.
- Storage: quatro buckets privados, com 30 objetos fiscais e 33 documentos assinados; os outros dois buckets estão vazios.
- VM Marina: 8 OCPUs, aproximadamente 23 GiB de RAM total e 121 GB livres em disco na leitura.
- Volume legado `supabase_db_solange-rolla-consultorio`: PostgreSQL 15, aproximadamente 71 MB, utilizado por container de validação parado desde 17/10. Não representa a fonte atual.

## Arquitetura técnica proposta

- Stack separado na Marina: PostgreSQL 17 compatível, Auth/GoTrue, PostgREST, Storage API, gateway e demais componentes Supabase realmente utilizados, com volumes novos e interface de validação privada.
- Reconstituir schemas, migrations, extensões, funções, triggers, roles, RLS, dados e filas necessários.
- Considerar a migração de usuários/identidades e dos fatores MFA compatíveis, com verificação de login e reautenticação no destino.
- Considerar os quatro buckets e seus objetos, metadados e políticas, com conferência de integridade independente.
- Configurar URLs, JWT, SMTP, segredos e workers apenas pelos mecanismos operacionais já autorizados, sem colocar credenciais em PR, log ou issue.

## Sequência técnica sugerida

1. Preparar stack isolado com volumes novos; preservar o volume legado para comparação histórica.
2. Produzir cópia consistente da fonte staging e importar no destino de ensaio, preservando a origem.
3. Comparar migrations, contagens agregadas, RLS, roles, autenticação, buckets e hashes; executar testes sintéticos de API, Auth, Storage e Realtime.
4. Exercitar cenário de rollback e medir janela, RPO e RTO.
5. **Risco de defasagem:** enquanto a origem estiver em uso entre a cópia inicial e a troca de endpoint, novas gravações podem ficar ausentes no destino. Estratégias a avaliar: sincronização incremental com readback final ou janela operacional de gravações suspensas e cópia final consistente.
6. Após a decisão operacional do proprietário pelos mecanismos já existentes, verificar runtime, workers, interface gráfica e persistência no SHA publicado.

## Escopo desta PR e pontos para decisão

Esta PR contém **somente este parecer**. Não instala componentes, não transfere conteúdos clínicos/pessoais, não altera banco, endpoints, DNS, credenciais, autorização, runtime ou dados em produção. Não constitui permissão operacional por si só.

O proprietário poderá avaliar a topologia, a estratégia de sincronização final e os passos de execução. Os controles de acesso, segurança, lease, permissões e aprovações **já vigentes** permanecem definidos em suas fontes próprias; nenhum requisito adicional é instituído por este texto.

Fontes operacionais: [issue #191](https://github.com/Vivaliz-site/solange-rolla-consultorio/issues/191) e [PR #340](https://github.com/Vivaliz-site/solange-rolla-consultorio/pull/340).
