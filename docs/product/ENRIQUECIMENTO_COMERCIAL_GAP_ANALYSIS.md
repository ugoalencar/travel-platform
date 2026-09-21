# Auditoria de Enriquecimento Comercial e Experiência do Viajante — Gap Analysis

**Tipo:** auditoria e planejamento. Nenhuma migration, endpoint, tela ou schema foi alterado nesta rodada.

Documentos detalhados por frente:
- `docs/product/PROPOSAL_VISUAL_2_AUDIT.md`
- `docs/product/DAY_BY_DAY_AUDIT.md`
- `docs/product/CUSTOMER_TRACKING_AUDIT.md`
- `docs/product/TASKS_FOLLOWUP_AUDIT.md`
- `docs/roadmap/ENRIQUECIMENTO_EXPERIENCIA_VIAJANTE.md` (ondas de implementação)

---

## 1. Mapa atual do domínio (Fase 0)

| Entidade | Tabela real | Observação |
|---|---|---|
| Customer | `customers` | núcleo, sem mudanças relevantes nesta auditoria |
| Wish | `wishes` | desejo do cliente, liga a Proposal via `wish_id` opcional |
| Opportunity | `commercial_opportunities` | pipeline, tem `next_action_at`, `responsible_user_id`, `destination`, `trip_date_from/to` |
| Offer | `offers` | catálogo, já tem `imageUrl` |
| Proposal | `proposals` | registro comercial simples, zero conteúdo visual — ver auditoria dedicada |
| Trip | `trips` | sem coluna nova desde a criação, sem itinerário — ver auditoria dedicada |
| Booking | `bookings` (não auditada a fundo nesta rodada — fora do escopo direto das 4 frentes) | referenciada por Sale/Proposal |
| CustomerInteraction | `customer_interactions` | ação humana manual, canal PHONE/WHATSAPP/EMAIL/IN_PERSON/OTHER |
| Engagement | `engagements` | sinal digital, só 1 CTA real hoje ("Tenho interesse") |
| Tasks | `commercial_tasks` | backend completo, **zero UI** |
| Notes | campo `notes` em várias tabelas (customers, proposals, trips, commercial_tasks) — sem entidade própria "Note" |
| Documents | `customer_documents`/`document_attachments` | genérico por cliente, sem vínculo a Trip/Proposal |
| Uploads | `trip_photos`, `document_attachments` | galerias/anexos, sem metadados de evento |
| Payments | `receivables`/`payables`/`payments` | domínio financeiro separado, não vinculado à Proposal |

## 2. Matriz final

| Área | Estado atual | O que já temos | Gap | Proposta | Reuso possível | Risco | Prioridade | Dependência |
|---|---|---|---|---|---|---|---|---|
| Proposal — conteúdo visual | Registro comercial simples | preço, desconto, total, validade, condições, notas, status | capa, galeria, título, destinos, datas, inclusões/exclusões, formas de pagamento | Colunas opcionais novas + tabela satélite tipo `proposal_optional_items` | `offers.imageUrl`, padrão de `proposal_optional_items` | Médio (schema novo, mas aditivo) | P1 | nenhuma (pode começar isolado) |
| Proposal — builder visual | Formulário simples, itinerário decorativo não persiste | `ProposalBuilderPage.tsx` existe como esqueleto | builder real que persiste itens | Reescrever submissão pra gravar itens na tabela satélite | UI já existe, precisa só conectar ao backend novo | Baixo | P1 | depende do schema de conteúdo acima |
| Proposal — link público/CTA cliente | Não existe | portal autenticado mostra dados básicos | link compartilhável com token, CTA de aceite | Token novo, análogo a `contract_signature_links` | Padrão de token já existe em Contratos (domínio irmão) | Médio (segurança de token público) | P2 | depende do conteúdo visual |
| Day-by-Day — dados brutos | Parcial, disperso | `air_services`(data+hora), `land_services`(só data), `excursion_departures` | horário em land_services, local estruturado, agregação por dia | Camada de apresentação que referencia (não copia) serviços existentes | air/land/excursion já têm `trip_id` | Baixo-médio | P1 | Trip model já suficiente, não bloqueia |
| Day-by-Day — mapas | Não existe | nenhum campo lat/lng em nenhuma tabela | geocodificação de campos texto livre | Fora de escopo nesta onda | — | Alto (dependência externa) | P3 | — |
| Day-by-Day — vouchers | Não existe | zero no schema | anexar documento a item específico | FK opcional de document_attachments pra air/land/excursion | `document_attachments` já existe, só falta vínculo | Baixo | P2 | — |
| Tracking — visualizações | Não existe | zero instrumentação em Offer/Proposal/Trip/Document | eventos `*_VIEWED` | Novo valor em `EngagementType` OU novo evento em `audit_logs` (decidir 1, não ambos) | `engagements` já tem precedente (`INTEREST`, migration 076) | Baixo (aditivo) | P1 | nenhuma |
| Tracking — Customer 360 "interesse recente" | Não existe (sem dado-fonte) | — | agregação de visualizações por destino | Depende 100% do item acima primeiro | — | Baixo, mas bloqueado | P1 | depende de Tracking — visualizações |
| Customer 360 — abas placeholder | Propostas e Reservas são `EmptyState` fixos apesar de contador populado | contadores já calculados | ligar as abas aos dados reais | Conectar aba existente à query já usada pro contador | Nenhum schema novo — é só UI | Baixo | P0 (é bug de UX, não gap de produto) | nenhuma |
| Tasks — UI | Backend completo, zero frontend | rotas REST prontas, CRUD funcional | tela de lista/criar/concluir | Construir UI reaproveitando API existente | 100% backend pronto | Baixo | P0 | nenhuma |
| Tasks — triplicação next_action_at | 3 lugares sem sincronização | opportunities/tasks/interactions, cada um isolado | consolidar fluxo (decisão de produto) | Não decidir schema agora — só documentar | — | Médio (mudança de comportamento) | P2 | depende da UI de Tasks existir primeiro |
| Wish/Offer match | Não auditado nesta rodada a fundo | Segmentação já existe, Wish existe | conectar Wish a sugestão de Offer | Fora do escopo direto das 4 frentes pedidas | Segmentação avançada já pronta | — | P2 | depende de Tracking |

## 3. Grafo de dependências (simples)

```
Tasks UI (P0) ─────────────────┐
                                 │
Customer 360 abas placeholder ──┤── não dependem de nada, podem começar já
(P0)                            │
                                 │
Tracking — eventos *_VIEWED (P1)┤
        │                       │
        ▼                       │
Customer 360 "interesse         │
recente" (P1) ───────────────── ┘

Proposal conteúdo visual (P1) ──► Proposal builder real (P1) ──► Proposal link público (P2)

Day-by-Day dados brutos (P1) ──► Day-by-Day vouchers (P2) ──► Day-by-Day mapas (P3, fora de escopo)

Tasks triplicação next_action_at (P2) ── depende de Tasks UI existir primeiro (senão não há onde visualizar o resultado da consolidação)
```

Respondendo diretamente às perguntas do pedido:
- **Tracking depende de Proposal visual?** Não. São independentes — tracking de visualização se aplica a Offer/Trip/Documento também, não só Proposal.
- **Day-by-Day depende do model de Trip?** Não precisa de mudança no Trip em si — os dados já existem em air/land/excursion, todos já com `trip_id`. Day-by-Day é camada de apresentação.
- **Tasks podem ser independentes?** Sim, e devem ser a primeira coisa — é o gap mais barato e mais isolado (zero schema novo, só UI sobre API já pronta).
- **Proposal precisa existir antes do Customer App?** Já existe (ambos). A pergunta correta é: Proposal Visual 2.0 precisa existir antes do link público? Sim — conteúdo antes de compartilhamento.

## 4. Prioridades (P0–P3, não é ranking competitivo)

- **P0 (bloqueia fluxo essencial)**: UI de Tasks (backend pronto, zero acesso hoje); corrigir abas placeholder de Propostas/Reservas no Customer 360 (dado já existe, só não está ligado).
- **P1 (forte impacto comercial)**: Proposal — conteúdo visual + builder real; Day-by-Day — dados brutos agregados; Tracking — eventos de visualização + Customer 360 "interesse recente".
- **P2 (melhoria relevante)**: Proposal — link público; Day-by-Day — vouchers por item; Tasks — consolidar triplicação de next_action_at; Wish/Offer match.
- **P3 (refinamento)**: Day-by-Day — mapas/geocodificação (depende de serviço externo, fora de escopo natural desta fase).

## 5. O que NÃO vale implementar agora

- Mapas/geolocalização — exige geocodificação externa, sem dado estruturado de local em nenhuma tabela hoje.
- Scoring automático de interesse — documentado como caminho futuro, não implementar sem tracking real funcionando primeiro.
- Task genérica polimórfica nova — `commercial_tasks` já resolve o essencial; criar uma segunda estrutura duplicaria o problema já identificado (3 lugares de "next_action_at").
- Qualquer automação que crie Sale/Booking/Trip automaticamente a partir de Proposal aceita — o fluxo manual atual é deliberado e não há pedido pra mudar isso.

## 6. Quick wins (baixo risco, alto retorno)

1. Construir UI de `commercial_tasks` (zero schema novo).
2. Conectar abas "Propostas" e "Reservas" do Customer 360 aos dados que já existem (contador já funciona, só a lista está vazia por placeholder).
3. Adicionar `OFFER_VIEWED` como novo valor de `EngagementType` (mesmo padrão já usado pra `INTEREST`) — habilita a base do "interesse recente" sem schema pesado.

## 7. Features que exigem mudança estrutural

- Day-by-Day com mapas (geocodificação externa).
- Proposal com link público (token novo, análogo a Contratos).
- Consolidação da triplicação de "próxima ação" (mudança de comportamento em 3 fluxos existentes, precisa de decisão de produto explícita antes de qualquer schema).

## 8. Recomendação da primeira implementação

**UI de `commercial_tasks`.** É o único item desta auditoria inteira com backend 100% pronto, testado, com RBAC e RLS — falta exclusivamente frontend. Menor risco, menor escopo, maior retorno imediato (hoje literalmente ninguém consegue usar tarefas pela interface, apesar do rótulo "Minhas Tarefas" já existir no menu prometendo isso).

## Status final

**TRAVEL PLATFORM — AUDITORIA DE ENRIQUECIMENTO CONCLUÍDA**

Nada foi implementado nesta rodada, conforme solicitado.
