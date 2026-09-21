# Auditoria — Proposal Visual 2.0

**Tipo:** auditoria e planejamento. Nenhum código foi alterado nesta rodada.

## 1. Estado real do schema

`proposals` foi criada em `001_initial_schema.sql` e **nunca recebeu uma coluna nova em 80+ migrations desde então**. Campos atuais: `id, agency_id, customer_id, offer_id, wish_id, user_id, proposed_price, discount, total, valid_until, conditions, notes, status, created_at, updated_at`.

Enum `ProposalStatus`: `DRAFT, SENT, ACCEPTED, DECLINED, EXPIRED, CANCELLED`.

Tabela satélite real: `proposal_optional_items` (migration 055) — itens de upsell com `travelers JSONB`, preço, fornecedor. É o único lugar do domínio Proposal com algo parecido a "item de linha".

## 2. Relacionamentos

- Proposal → `customers`, `offers` (opcional), `wishes` (opcional), `users` (nunca setado na prática).
- `sales.proposal_id` → Proposal, com `UNIQUE(agency_id, proposal_id)` — **no máximo 1 Sale por Proposal**.
- `commercial_opportunities.proposal_id`, `customer_interactions.proposal_id`, `coupon_redemptions.proposal_id` → Proposal (todos opcionais, sentido inverso).
- **Não existe FK de Proposal para Trip.**

## 3. Classificação de conteúdo (EXISTE / PARCIAL / NÃO EXISTE)

| Item | Status | Evidência |
|---|---|---|
| Capa/imagem | NÃO EXISTE | Nenhuma coluna, nenhum campo no allowlist |
| Título | NÃO EXISTE | UI usa `notes` como substituto informal |
| Descrição | PARCIAL | `notes` reaproveitado, mas é semanticamente "observações internas" |
| Destinos | NÃO EXISTE | `commercial_opportunities.destination` existe, `proposals` não |
| Datas da viagem | NÃO EXISTE | Só `valid_until` (validade da proposta, não da viagem) |
| Viajantes | PARCIAL | Só em `proposal_optional_items.travelers JSONB`, não na proposta em si |
| Transporte/voos/hotéis/excursões | PARCIAL (decorativo) | `ProposalBuilderPage.tsx` tem formulário de "itinerário" cujos itens **nunca são enviados ao backend** — puramente visual, nada persiste |
| Inclusões/exclusões | NÃO EXISTE | — |
| Condições | EXISTE | Coluna `conditions` |
| Formas de pagamento | NÃO EXISTE | — |
| Galeria de imagens | NÃO EXISTE | — |
| Documentos anexados | NÃO EXISTE | `customer_documents` existe mas sem FK para Proposal |
| Observações | EXISTE | Coluna `notes` |
| Validade | EXISTE | `valid_until`, já usado em UI (agência e cliente) |
| CTA (cliente aceitar) | NÃO EXISTE | Tela do cliente tem comentário explícito "Sem controles de aceitar/recusar nesta vertical" |

## 4. UI existente — nada funcional além do CRUD básico

- `ProposalListPage`: tabela simples; botão "Montar proposta" está `disabled`.
- `ProposalDetailPage`: grid read-only; botões Editar/Duplicar/Prévia/Enviar/Converter **todos `disabled`**.
- `ProposalBuilderPage`: formulário de preço + itinerário decorativo (não persiste) + condições. Não é builder visual.
- `ProposalPreviewPage`: **stub vazio**, `EmptyState` com "ainda não está implementada".
- Visualização do cliente (`CustomerProposalDetailsPage`): só valor/status/condições, sem CTA, exige login (portal autenticado). **Não existe link público sem login, nem token de compartilhamento** (busca exaustiva, zero resultados).

## 5. Estrutura hoje: A ou B?

**B — registro comercial simples.** Não há nenhuma estrutura rica de viagem. A tela de prévia é um placeholder vazio (greenfield real, não há nada para "evoluir" ali — é construir do zero).

## 6. Conversão Opportunity → Proposal → Booking → Trip

- `acceptProposal()` só muda status SENT→ACCEPTED. **Não cria Sale, Booking ou Trip automaticamente.**
- Criar Sale é ação manual separada; `proposalId` é só referência (FK), nunca cópia automática de dados.
- Constraint garante 1 Sale por Proposal; tentativa duplicada é rejeitada (409).
- **Conclusão**: fluxo 100% manual e por referência — qualquer evolução de "Proposal Visual 2.0" não teria efeito cascata automático em Sale/Trip, o que é bom (menos risco) mas confirma que histórico e vínculo dependem de FK, nunca de cópia.

## 7. Componentização — reuso possível

- `offers.imageUrl` já existe (Offer tem 1 campo de imagem) — mas não há herança de Offer para Proposal por design.
- `proposal_optional_items` é o precedente estrutural mais próximo de "ProposalItem" — tabela satélite tenant-scoped, com FK para Proposal, já teste e RLS validados. Um `ProposalSection`/`ProposalItem` novo deveria seguir exatamente esse padrão (tabela satélite, não coluna JSONB solta).
- Trip/Excursion/Air/Land têm dados reais reutilizáveis (origem, destino, datas, fornecedor) que uma "Proposal Visual 2.0" poderia **referenciar** em vez de duplicar — mas hoje Proposal não tem nenhum vínculo com Trip, então isso exigiria desenho novo, não é reuso imediato.

## 8. Recomendação de evolução (não implementar agora)

Modelo sugerido para avaliação futura, preservando compatibilidade:
- Adicionar campos opcionais nullable em `proposals`: `title`, `cover_image_url`, `destination_summary` (mínimo viável, sem quebrar nada existente).
- Nova tabela satélite `proposal_sections` ou reaproveitar o padrão de `proposal_optional_items` para itens ricos (transporte/hospedagem/experiência), com FK opcional para `air_services`/`land_services`/`excursions` existentes quando o item já tiver uma entidade real por trás (referência, não snapshot, seguindo o mesmo princípio usado em Day-by-Day).
- Link público exigiria um mecanismo de token novo (não existe nenhum precedente direto no código — teria que ser desenhado, análogo a `contract_signature_links` do domínio de Contratos, que já resolve esse problema em outro contexto).

## Status

AUDITORIA CONCLUÍDA — não implementado.
