# Cobertura de dados Full — teste local

Verificado em 2026-10-26T04:22:43.628Z. Destinos: API 4100, app 5183, PostgreSQL 55644, banco travel_platform_teste. Agencia alpha-viagens. Dados SEED ficticios.

| Area/tela | Rota no app | Quantidade | Como ver (API autenticada) | Observacao |
|---|---|---:|---|---|
| Painel | / | 6 | GET /dashboard/widgets | COM DADOS |
| Clientes | /customers | 34 | GET /customers | COM DADOS |
| Cadastro Remoto | /enrollment-links | 1 | GET /enrollment-links | COM DADOS |
| Tarefas | /tasks | 3 | GET /commercial/tasks | COM DADOS |
| Pipeline | /pipeline | 3 | GET /commercial/opportunities | COM DADOS |
| Segmentacao | /segments | 1 | GET /customer-segments | COM DADOS |
| Desejos | /wishes | 3 | GET /wishes | COM DADOS |
| Pescador | /pescador | 1 | GET /pescador/captures | COM DADOS |
| Ofertas | /offers | 3 | GET /offers | COM DADOS |
| Seguros | /insurance | 1 | GET /insurance/policies | COM DADOS |
| Propostas | /proposals | 3 | GET /proposals | COM DADOS |
| Reservas | /bookings | 1 | GET /bookings | COM DADOS |
| Vendas | /sales | 42 | GET /sales | COM DADOS |
| Importacao | /sales/import | 2 | GET /sales?incomplete=true | COM DADOS |
| Viagens | /trips | 8 | GET /trips | COM DADOS |
| Excursoes | /excursions | 2 | GET /excursions | COM DADOS |
| Aereo | /operations/air | 2 | GET /air-services | COM DADOS |
| Terrestre | /operations/land | 2 | GET /land-services | COM DADOS |
| Passageiros | /operations/passengers | 7 | GET /operations/passengers | COM DADOS |
| Documentos | /operations/documents | 1 | GET /operations/document-alerts | COM DADOS |
| Ocorrencias | /operations/occurrences | 1 | GET /operations/occurrences | COM DADOS |
| Pos-viagem | /operations/post-trip | 1 | GET /operations/post-trip | COM DADOS |
| Financeiro | /financial | n/a | GET /financial/summary | INDICADORES/CONFIGURACAO |
| Recebiveis | /financial/receivables | 79 | GET /financial/receivables | COM DADOS |
| Pagaveis | /financial/payables | 48 | GET /financial/payables | COM DADOS |
| Caixa | /financial/cash-transactions | 1 | GET /financial/cash-transactions | COM DADOS |
| Conciliacao | /financial/reconciliation | 1 | GET /financial/reconciliations | COM DADOS |
| Receitas | /financial/revenues | 1 | GET /financial/revenues | COM DADOS |
| Despesas | /financial/expenses | 1 | GET /financial/expenses | COM DADOS |
| DRE | /financial/dre | n/a | GET /financial/dre | INDICADORES/CONFIGURACAO |
| Relatorios financeiros | /financial/reports | 1 | GET /reports/sales | COM DADOS |
| Projecoes | /financial/projections | n/a | GET /reports/receivables-projection | INDICADORES/CONFIGURACAO |
| Configuracao financeira | /financial/settings | 7 | GET /payment-conditions | COM DADOS |
| Fornecedores | /suppliers | 5 | GET /suppliers | COM DADOS |
| Centros de custo | /financial/cost-centers | 1 | GET /cost-centers | COM DADOS |
| Categorias financeiras | /financial/categories | 2 | GET /financial/categories | COM DADOS |
| Funcionarios | /employees | 7 | GET /employees | COM DADOS |
| Planos | /commission-plans | 1 | GET /commission-plans | COM DADOS |
| Folha | /payroll | 2 | GET /payroll-entries | COM DADOS |
| Midia | /media-library | 1 | GET /media-assets | COM DADOS |
| Comunicacao | /communications | 1 | GET /agency-communications | COM DADOS |
| Campanhas | /campaigns | 1 | GET /campaigns | COM DADOS |
| Cupons | /coupons | 1 | GET /coupons | COM DADOS |
| Usuarios | /settings?tab=invitations | 7 | GET /settings/team | COM DADOS |
| Papeis | /settings?tab=permissions | 1 | GET /settings/permission-restrictions | COM DADOS |
| Configuracoes | /settings | n/a | GET /settings/agency | INDICADORES/CONFIGURACAO |
| Categorias venda | /sale-categories | 5 | GET /sale-categories | COM DADOS |
| Receita agencia | /financial/agency-revenue | 31 | GET /agency-revenue/entries | COM DADOS |
| Dashboard configuracao | /settings/dashboard | 6 | GET /settings/dashboard | COM DADOS |
| Relatorios | /reports | 1 | GET /reports/sales | COM DADOS |
| Regras | /commission-rules | 9 | GET /commission-rule-scopes | COM DADOS |
| Condicoes | /payment-conditions | 7 | GET /payment-conditions | COM DADOS |
| Liberacao | /commission-release | 3 | GET /commission-release/config | COM DADOS |

Rotas adicionais do App (formularios, detalhes e acesso):

- `/login`: acesso/onboarding/fallback; nao representa cadastro a preencher.
- `/signup`: acesso/onboarding/fallback; nao representa cadastro a preencher.
- `/forgot-password`: acesso/onboarding/fallback; nao representa cadastro a preencher.
- `/reset-password`: acesso/onboarding/fallback; nao representa cadastro a preencher.
- `/onboarding`: acesso/onboarding/fallback; nao representa cadastro a preencher.
- `/customers/:id`: detalhe de registro SEED; verificacao em telas-resultado.json.
- `/wishes/:id`: detalhe de registro SEED; verificacao em telas-resultado.json.
- `/trips/:id`: detalhe de registro SEED; verificacao em telas-resultado.json.
- `/proposals/:id`: detalhe de registro SEED; verificacao em telas-resultado.json.
- `/proposals/:id/edit`: detalhe de registro SEED; verificacao em telas-resultado.json.
- `/proposals/:id/preview`: detalhe de registro SEED; verificacao em telas-resultado.json.
- `/proposals/:id/editor`: detalhe de registro SEED; verificacao em telas-resultado.json.
- `/bookings/:id`: detalhe de registro SEED; verificacao em telas-resultado.json.
- `/sales/new`: formulario; sem lista propria.
- `/sales/:id`: detalhe de registro SEED; verificacao em telas-resultado.json.
- `/offers/:id`: detalhe de registro SEED; verificacao em telas-resultado.json.
- `/communications/new`: formulario; sem lista propria.
- `/communications/:id/edit`: detalhe de registro SEED; verificacao em telas-resultado.json.
- `/tasks/new`: formulario; sem lista propria.
- `/financial/sales/:saleId/story`: detalhe de registro SEED; verificacao em telas-resultado.json.
- `/employees/:id`: detalhe de registro SEED; verificacao em telas-resultado.json.
- `/*`: acesso/onboarding/fallback; nao representa cadastro a preencher.

Usuarios de teste (senhas somente em `.tmp/full-teste-usuarios.json`, arquivo ignorado pelo git):

| Papel | Email | Agencia |
|---|---|---|
| OWNER | joao@alpha.test | alpha-viagens |
| ADMIN | maria@alpha.test | alpha-viagens |
| MANAGER | seed-manager@alpha.test | alpha-viagens |
| VIEWER | seed-viewer@alpha.test | alpha-viagens |
| AGENT | seed-agent@alpha.test | alpha-viagens |
| OWNER | seed-owner@beta.test | seed-beta-ficticia-454af945 |

Inventario por status:

```json
{
  "sales": [
    {
      "status": "PENDING",
      "n": 3
    },
    {
      "status": "CONFIRMED",
      "n": 33
    },
    {
      "status": "PAID",
      "n": 3
    },
    {
      "status": "CANCELLED",
      "n": 3
    }
  ],
  "commission_entries": [
    {
      "status": "APPROVED",
      "n": 8
    },
    {
      "status": "PAID",
      "n": 1
    },
    {
      "status": "PAYABLE",
      "n": 9
    },
    {
      "status": "PENDING",
      "n": 18
    },
    {
      "status": "PENDING_RULE",
      "n": 1
    }
  ],
  "agency_revenue_entries": [
    {
      "status": "AVAILABLE",
      "n": 1
    },
    {
      "status": "CANCELLED",
      "n": 1
    },
    {
      "status": "ENTITLED",
      "n": 1
    },
    {
      "status": "FORECAST",
      "n": 5
    },
    {
      "status": "PENDING_RULE",
      "n": 1
    },
    {
      "status": "RECEIVED",
      "n": 22
    }
  ],
  "payroll_entries": [
    {
      "status": "OPEN",
      "n": 1
    },
    {
      "status": "PAID",
      "n": 1
    }
  ],
  "suppliers": [
    {
      "n": 5
    }
  ],
  "travel_products": [
    {
      "n": 5
    }
  ],
  "sale_payment_reversals": [
    {
      "n": 11
    }
  ],
  "sale_import_batches": [
    {
      "n": 4
    }
  ],
  "customers": [
    {
      "n": 34
    }
  ],
  "employee_commission_rule_versions": [
    {
      "n": 10
    }
  ]
}
```

Etapas de seed ainda abertas:


Arquivos de prova: `seed-resultado.json`, `e2e-resultado.json`, `telas-resultado.json`, `inventario-dados.json`, `backup-verificacao.json` e capturas em `telas/`. Contagem de cadastro e renderizacao sem erro nao provam as transicoes financeiras; estas possuem asserts proprios no E2E.

SQL restrito a provisionamento sem rota de agencia: habilitar CAMPAIGNS/PESCADOR/CREATIVE_STUDIO no tenant ficticio, marcar a viagem historica SEED como COMPLETED (nao existe rota de status) e datar a competencia historica do direito SEED para testar janelas encerradas. Nenhum status financeiro e inserido manualmente. Nenhum restore e executado.
