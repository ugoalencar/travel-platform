# Comissão por fornecedor e pagamento previsto — plano

## Escopo e limites

Executar S1–S5 do `.codex/PROMPT-COMISSAO-POR-FORNECEDOR-2026-10-25.md` no Travel Platform Full. Preservar checkout dirty; não editar Lite nem ambientes demo/Gadotti/online; não ler `.env`; não fazer commit, push ou deploy. Aplicar somente migrations novas e exclusivamente no PostgreSQL descartável autorizado depois de validar identidade do banco.

## Sequência

1. S1: conectar acordos de receita já versionados ao cadastro do fornecedor; preservar hierarquia existente, auditoria e dados de venda. Cobrir cálculo TAXES e ausência de regra.
2. S2: adicionar escopo de comissão do funcionário por fornecedor, base `SUPPLIER_SOLD_TOTAL`, snapshot, liberação condicionada ao recebimento da receita do fornecedor, política WARN/BLOCK e privacidade por papel. Criar migration aditiva 116+ com grants, RLS, inventários e backup.
3. S3: adicionar política append-only de data prevista de pagamento PER_ENTRY/FIXED_DAY/WINDOW, captura na entrada e previsão na folha/projeções sem quebrar canal único, avulso ou legado.
4. S4: separar volume vendido, receita da agência, caixa, custo de comissão e resultado no dashboard, relatórios e CSV; relatório fornecedor com filtros existentes.
5. S5: ampliar testes unitários, HTTP, componente, banco, seed idempotente, E2E e cobertura com os sete cenários do prompt.
6. Executar gates solicitados, inspecionar diffs delimitados e atualizar relatório de entrega com comandos/resultados e pendências verificáveis.

## Gates de segurança

- Agency vem do contexto autenticado; FKs compostas/joins tenant-scoped e RLS continuam obrigatórios.
- Respostas de agente/visualizador nunca expõem receita/percentual do fornecedor ou diferença financeira.
- Migração somente no alvo descartável `travel_platform_teste` em `127.0.0.1:55644`, depois de conferir `current_database()`, usuário e porta.
- Regras e snapshots históricos são imutáveis; sem recálculo retroativo não autorizado.

## Progresso

- [x] Releitura do prompt, AGENTS, AI_CONTEXT, DEC-008 e estado do checkout.
- [ ] Inspeção focada das APIs, telas, migrations, testes e ambiente local.
- [ ] S1
- [ ] S2
- [ ] S3
- [ ] S4
- [ ] S5
- [ ] Gates e relatório final
