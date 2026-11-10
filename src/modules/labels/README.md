# Módulo labels — Etiquetas Link 9027

## Responsabilidade
Produzir etiquetas circulares de 52 mm, em 15 posições por folha A4, a partir de listas administrativas digitadas manualmente.

## Public API
O contrato público do módulo é exportado por public.ts: LabelMaker. Cálculos internos e geometrias ficam em application/layout.ts.

## Owns
Montagem e pré-visualização de folhas A4, calibração local, arte opcional, geração de PDF e backup local.

## Consumes
Identity para gate de sessão/permissões por composição na rota protegida. A interface não chama bancos, APIs nem serviços externos.

## Invariantes
Folha A4 210x297 mm; 3 colunas x 5 linhas; círculos 52 mm; espaçamento padrão 3 mm; margens estimadas de 24 mm e 12,5 mm. Testar calibração física. Uma posição usada não pode ser reutilizada automaticamente. Listas de 1, 3, 15, 16 e 30 nomes devem ser distribuídas sem perdas.

## Dados sensíveis
Nomes são dados pessoais. Permanecem no armazenamento local do navegador, com chave separada por usuário; nunca são transmitidos ao backend, nem aparecem em URLs, logs ou fixtures reais. Backup local contém nomes e precisa ser armazenado de maneira privada.

## Proibições
Não ler prontuários, não publicar nomes reais, não criar bypass de autorização, não sincronizar automaticamente listas entre contas, não usar a Zebra térmica para folhas A4, não atribuir perfil clínico ao login provisório da solução independente.

## Operação
Rota /etiquetas exige equipe psychologist_owner ou secretary e permissão events.read; a autenticação é Supabase existente. O usuário do módulo provisório é independente. Dados não são sincronizados entre aparelhos. Usuários devem exportar backup.
