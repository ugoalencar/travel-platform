# Status dos Ajustes Gadotti no Full — 25/10/2026

Fonte do pedido: `docs/AJUSTES-23-10-2026-GADOTTI.MD`. Escopo registrado pelo Codex: `docs/00-product/GADOTTI-ADJUSTMENTS-2026-10-23.md` (escrito em 23/10 como "aguardando", nada implementado; o documento está desatualizado). Análise por leitura do código do Full e dos relatórios; não abri as telas no navegador.

| # | Pedido | Estado no Full | Evidência |
|---|---|---|---|
| 1 | Cliente na venda com autocomplete e colar CPF | **Feito** | `components/customers/CustomerCombobox.tsx` (filtra por nome; CPF colado com ou sem máscara busca na hora), usado em `NewSalePage.tsx:147` |
| 2 | Configurar campos do cadastro de cliente (habilitar/desabilitar/obrigatório) | **Feito** | `customer-field-settings.ts`, rotas `field-settings`, aba "Clientes" em Configurações (`CustomerFieldSettingsTab`) |
| 3 | Categoria de venda com formulário montado pela agência; data da venda, origem e destino | **Feito (com ressalva)** | migrations 101/102, `SaleCategoriesPage`, `sales.sale_date/origin_text/destination_text`; registro de campos com classificação LEGAL/MARKET/SUGGESTION. Ressalva: textos legais da pesquisa só parcialmente confirmados |
| 4 | Produto ligado ao fornecedor | **Feito (base)** | `travel_products.supplier_id`; receita por fornecedor/produto/categoria na migration 106 |
| 5 | Condições de pagamento (parcelas, parcela mínima, entrada obrigatória, saldo até N dias antes do embarque) | **Backend feito; falta tela de cadastro** | migration 105 (`payment_conditions`: parcelas, mínimo, entrada %/valor, âncora SALE_DATE/TRAVEL_START + dias); `SalePaymentPanel` só escolhe condição. Não há tela para criar/editar condições (`api.ts` só lista) |
| 6 | Baixas parciais a cada pagamento e saldo | **Feito** | `POST /sales/:id/payments`, `/balance`, `/payment-schedule` (+ revise) |
| 7 | Regra de recebimento por forma de pagamento | **Feito** | migration 108, tela "Liberação de Comissões" |
| 8 | Receita da agência: % sobre total ou parte (taxas, tarifa), fixo por passageiro/venda/item | **Feito (backend e tela de consulta)** | migration 106: modos PERCENTAGE, FIXED_PER_PASSENGER/SALE/ITEM; bases LINE_TOTAL, NET_FARE, TAXES, FEES, TAXES_AND_FEES, MARGIN; evento de direito ON_SALE_CONFIRMATION / ON_FULL_SETTLEMENT / ON_BALANCE_DEADLINE. Tela `AgencyRevenuePage` ainda é de consulta (Codex: faltam cadastrar regras, receber, cancelar e reativar) |
| 9 | Duas linhas de comissão (agência x funcionário), com vínculo | **Feito (backend); fluxo na tela incompleto** | Onda D (receita) + Onda E (regras versionadas, liberação por recebimento); a tela de folha ainda gera pelo plano antigo |
| 10 | Pagar comissão por pacote quitado, em lotes ou janelas | **Parcial** | por quitação existe; **lotes/janelas não existem** (estado AVAILABLE nunca é produzido) — demanda 8 |
| 11 | Relatórios e projeções com filtros (data da venda, origem, destino) | **Feito (base)** | `report-projections-service.ts` com filtros saleFrom/saleTo/travelFrom/travelTo/origin/destination/categoryId; `ProjectionsPage`. Falta: datas reais de lotes e teste de comissão com dados reais |
| 12 | Ambiente por abas (configurar e apontar na venda) | **Parcial** | Configurações tem abas (inclui Clientes); regras ficam em páginas separadas (categorias, receita, liberação, regras de comissão); não há ambiente único de abas |
| 13 | Exemplos: excursão R$1.000 em 10x mín. R$100; entrada 30% + saldo 15 dias antes; 7% na quitação; cartão como à vista | **Possível por configuração** | parcelas/mínimo/entrada/âncora cobrem; "cartão conta como à vista" depende da regra de recebimento por forma. Não testado com esse cenário de ponta a ponta |
| 14 | Estorno de recebimento | **Não feito** | decisão 5 (DEC-008): implementar |

Faltam para o pedido ficar completo no Full: tela de cadastro de condições de pagamento (5), lotes/janelas (10), tela de receita completa e comissões pela tela (8/9), ambiente por abas (12), estorno (14) e um teste de ponta a ponta com o cenário da excursão (13).
