# Roadmap — Enriquecimento Comercial e Experiência do Viajante

Baseado no estado real encontrado na auditoria (`docs/product/ENRIQUECIMENTO_COMERCIAL_GAP_ANALYSIS.md` e os 4 documentos de frente). Nenhum item abaixo foi implementado — é plano, não execução.

## ONDA 1 — VENDA

Foco: fechar os gaps mais baratos e de maior atrito comercial imediato.

1. **UI de Tasks** (P0) — backend já pronto, é só construir a tela. Reaproveita `commercial_tasks` sem schema novo.
2. **Customer 360 — corrigir abas placeholder** (P0) — Propostas e Reservas já têm contador funcionando, só a lista está vazia por código morto.
3. **Proposal Visual 2.0 — conteúdo básico** (P1) — capa, título, destinos, datas, inclusões/exclusões como colunas novas nullable + tabela satélite de itens, seguindo o padrão já validado de `proposal_optional_items`.
4. **Tracking — eventos de visualização** (P1) — `OFFER_VIEWED` como novo valor de `EngagementType` (mesmo padrão de `INTEREST`, migration 076), depois expandir para Proposal/Trip/Documento.
5. **Customer 360 — "interesse recente"** (P1) — depende diretamente do item 4.
6. **Wish/Offer match** (P2) — avaliar depois que o tracking estiver funcionando de verdade (dado real > suposição).

## ONDA 2 — EXPERIÊNCIA

Foco: a viagem em si, depois que a venda estiver mais rica.

1. **Day-by-Day — agregação de dados existentes** (P1) — camada de apresentação sobre `air_services`/`land_services`/`excursion_departures`, sem duplicar dado.
2. **Day-by-Day — horário em land_services** (P1) — gap pontual de schema (campo texto livre, mesmo padrão do aéreo).
3. **Documents — vínculo por item** (P2) — FK opcional de `document_attachments` para air/land/excursion, habilitando "voucher por item".
4. **Proposal — link público/compartilhável** (P2) — token novo, reaproveitando o padrão já existente em `contract_signature_links`.
5. **Maps/Trip timeline com local** (P3) — depende de geocodificação externa, não tem dado estruturado hoje; avaliar só depois das ondas anteriores.

## ONDA 3 — COMUNICAÇÃO

Fora do escopo desta auditoria (explicitamente não implementar):

- WhatsApp Business API real (hoje é só geração de link `wa.me`, Fase 1 deliberadamente limitada).
- Campanhas automatizadas de reengajamento.
- Consentimento/opt-in estruturado para comunicação em massa.

## ONDA 4 — INTELIGÊNCIA

Fora do escopo desta auditoria e de qualquer implementação próxima. Documentado só como visão:

- Recomendação de destino baseada em tracking real (depende inteiramente da Onda 1 estar funcionando com dado real acumulado).
- Scoring de propensão a compra.
- Questionários de preferência estruturados (hoje só existe texto livre em `notes`/`preferences`).
- Qualquer uso de IA/LLM — explicitamente fora de escopo de toda esta auditoria.

## Critério de ordenação

A ordem acima não é por "o que parece mais legal", é por: (1) o que já tem backend pronto vem primeiro (Tasks), (2) o que é aditivo e de baixo risco vem antes do que exige schema novo pesado (tracking antes de Day-by-Day completo), (3) o que depende de infraestrutura externa fica por último (mapas), (4) o que foi explicitamente marcado como fora de escopo pelo usuário (WhatsApp Business, IA, Marketplace) fica documentado mas não entra em nenhuma onda próxima.

## Status

Roadmap proposto — aguardando decisão do proprietário sobre qual onda priorizar. Nenhuma implementação iniciada.
