# Overlay de Auditoria do Projeto

Este arquivo complementa o protocolo universal. Ele não substitui `AGENTS.md`, README, ADRs, arquitetura, regras de negócio ou runbooks existentes.

## Regra de uso
Antes de iniciar uma auditoria extrema, o agente deve reconstruir as regras específicas deste repositório a partir das fontes autoritativas existentes e transformar essas regras em **invariantes verificáveis**. Não é permitido auditar apenas contra boas práticas genéricas.

## Repositório canônico e proveniência histórica

`Vivaliz-site/solange-rolla-consultorio` é o único repositório canônico do projeto **Solange Rolla**.

O repositório `Vivaliz-site/solange-rolla` contém o MVP local histórico e serve apenas como proveniência. Evidências, screenshots, testes, auditorias, validações visuais ou comportamento do MVP legado **não podem ser usados como evidência de funcionamento, segurança, homologação, restore ou prontidão de produção do sistema atual**.

A reconciliação entre o MVP e o sistema atual está em `docs/legacy/solange-rolla-mvp-lineage.md`.

O único ledger de certificação de prontidão do projeto é `docs/quality/AUDIT_STATUS.md` deste repositório.

## Fontes obrigatórias quando existirem
1. `AGENTS.md` e arquivos referenciados por ele;
2. README e documentação de arquitetura;
3. ADRs e decisões vigentes do proprietário;
4. migrations/schema e contratos públicos;
5. runbooks operacionais/deploy;
6. testes que expressem regras históricas;
7. configuração e comportamento real do ambiente;
8. `docs/legacy/solange-rolla-mvp-lineage.md` apenas para proveniência/requisitos reconciliados, nunca como prova operacional atual.

## Classes de domínio a considerar
Se presentes no projeto, trate como área crítica: dinheiro/preço/reembolso; prazos e datas-limite; efeitos externos; autenticação/autorização; isolamento multi-tenant; dados pessoais/sensíveis; automações periódicas; filas/workers; integrações de terceiros; reconciliação; backups/restores; deploy e proveniência da versão.

Para Solange Rolla, são invariantes especialmente críticos: segregação clínica; MFA/AAL2; RLS; agenda/financeiro/fiscal com estados independentes; dinheiro em centavos inteiros; idempotência financeira/fiscal; política temporal versionada; dados sintéticos em teste; providers live desligados fora de production; e restore/rollback comprovados antes do go-live.

## Matriz de invariantes específica
A auditoria deve criar no relatório uma tabela `Invariante | Fonte da regra | Garantia técnica | Teste/evidência | Resultado`. Regras conflitantes devem ser resolvidas pela hierarquia de autoridade já definida no projeto; se não houver hierarquia clara, registre o conflito como achado.

## Regra sobre requisitos do MVP legado

Conceitos marcados `CARRIED_FORWARD` no documento de linhagem devem ser auditados pelas fontes canônicas atuais. Conceitos `RETIRED` ou `SUPERSEDED` não devem ser reintroduzidos. Conceitos `NEEDS_PRODUCT_DECISION` devem permanecer explicitamente pendentes até decisão canônica e não podem ser tratados como requisito implementado.

## Mudança deste overlay
Quando uma auditoria revelar uma regra estrutural e duradoura que não está adequadamente documentada em outra fonte autoritativa, atualize este overlay no mesmo fluxo de PR. Não copie detalhes temporários, secrets ou estado operacional volátil.
