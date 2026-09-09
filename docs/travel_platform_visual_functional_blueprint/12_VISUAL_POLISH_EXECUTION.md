# 12 — Visual Polish Execution

## Objetivo

Transformar o produto funcional em SaaS moderno sem reescrever regras.

## Design system

### Layout
- Sidebar escura
- Topbar leve
- Fundo cinza/azul muito claro
- Cards brancos
- Border radius consistente
- Sombras suaves

### Status
- Verde: concluído/ativo/pago
- Azul: em andamento/informativo
- Amarelo/Laranja: pendente/atenção
- Vermelho: atraso/erro/bloqueio
- Cinza: neutro/inativo

### Tipografia
- Títulos fortes
- Subtítulos curtos
- Labels em pt-BR
- Sem excesso de caixa alta

## Componentes

- PageHeader
- KPI Card
- StatusBadge
- DataTable
- FilterBar
- Tabs
- Timeline
- EmptyState
- LoadingState
- ErrorState
- FormSection
- Drawer
- ConfirmDialog
- MetricGrid
- FileUploadCard
- DocumentPreview
- FinancialSummary

## Regras visuais

1. Máximo 1 ação primária por contexto.
2. Ações secundárias com menor contraste.
3. Tabelas com filtros no topo.
4. Cards para resumo, tabelas para detalhe.
5. Formulários divididos em blocos.
6. Não exibir 20 campos em uma única coluna.
7. Usar tabs ou etapas quando necessário.
8. Dashboard deve responder perguntas, não só mostrar números.

## Ordem de implementação visual

1. Shell global
2. Sidebar setorizada
3. Topbar
4. Design tokens
5. Componentes base
6. Dashboard Agência
7. Cliente 360
8. Financeiro
9. Operação
10. Staff Operacional
11. Platform Admin
12. Portal Cliente
13. Pescador
14. Polish final

## Critério de sucesso

O usuário deve olhar para qualquer tela e entender:
- qual setor está usando;
- qual papel está logado;
- qual ação pode fazer;
- qual estado do processo está vendo;
- qual impacto financeiro existe.
