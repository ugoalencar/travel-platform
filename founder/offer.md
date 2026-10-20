# A oferta — Travel Plataforma

Método: lente de Ofertas (resumo do framework do livro *$100M Offers*, de
Alex Hormozi — nunca apresentado como palavras dele). Material de entrada:
`founder/panel/results.md` (objeções reais do painel), `founder/competitors.md`
(reclamações dos concorrentes), `founder/board.md` (condições do board).
`founder/numbers.json` ainda não existe (`/founder-cfo` não rodou) — os custos
abaixo são estimativas qualificadas (baixo/médio/alto), marcadas como tal, não
números do CFO. Re-testar os custos reais quando o CFO rodar.

## 1. Lista de problemas (na palavra do comprador)

### Antes de comprar

1. "Não tem nenhuma agência rodando isso em produção pra eu ver funcionando." — o objeção dominante, 14 de 16 recusas no painel.
2. "Já peguei um sistema parecido que travou e perdeu dado na migração." (medo de migração)
3. "Cobrança automática e nota fiscal ainda nem existem" — a promessa financeira não está implementada.
4. "R$99 ou R$299 por mês é caro pra minha agência hoje" (dono de agência solo/micro, baixo faturamento)
5. "Não confio em colocar o CPF/cartão do meu cliente numa plataforma que nunca ouvi falar."
6. "Só confio depois de ver outro dono de agência do mesmo grupo/sindicato recomendar."
7. "Assinar sem desconto e sem ver referência, não." (caçador de promoção)
8. "Já uso [Agendor/Omie/planilha] e trocar dá trabalho demais."
9. Formulário público de lead sem captcha/validação — achado de segurança já identificado, mina a credibilidade de quem pesquisa a empresa antes de assinar.
10. "Justo entrando dezembro/janeiro não posso me arriscar a travar o funil de venda numa ferramenta sem histórico." — risco de tempo/temporada.
11. Nenhum "segredo"/vantagem nomeada — o board apontou que, sem a peça de cobrança/fiscal pronta, a oferta não tem nada que um concorrente não possa copiar.

### Durante a adoção

12. "Minha equipe não vai usar, vai voltar pro WhatsApp em uma semana." — risco de adoção interna.
13. "Não tenho tempo de treinar ninguém na alta temporada."
14. Erro ocasional de importação de planilha (achado em avaliação real do Agendor — risco genérico de qualquer migração de dados).
15. Sem processo de onboarding claro — a agência fica sozinha depois do cadastro self-service.

### Depois de comprar

16. "E se o suporte for lento?" — achado real em dois concorrentes (Omie: "mau atendimento no SAC"; PHPTravels: suporte é a categoria com nota mais baixa).
17. "E se cobrarem errado ou o estorno demorar?" — achado real na Omie (ReclameAqui: demora em estornos).
18. "E se eu quiser cancelar — meus dados ficam presos?"
19. Nenhuma garantia declarada hoje se o produto não entregar o que promete.
20. MFA opcional pro super-admin e lacunas de CI/segredo — achado de auditoria ainda não corrigido; não é objeção que o comprador verbaliza, mas é risco real que vira objeção se descoberto.

## 2. Soluções, cortadas e empilhadas

| problema | solução | valor pro comprador (1-5) | custo de entregar (1-5, estimado) |
|---|---|---|---|
| 1, 6, 7, 11 (falta de prova/referência) | Programa "Agência Pioneira": as primeiras agências entram como caso de referência público, com desconto de fundador | 5 | 2 (tempo do fundador, não dev) |
| 2, 14 (medo de perder dado na migração) | Migração assistida da planilha/sistema atual, com checagem de integridade antes de confirmar | 5 | 3 (trabalho manual do time, escala mal sem automação) |
| 3 (cobrança/NFS-e não existe) | **Não dá pra resolver com bônus** — é a lacuna real identificada pelo board e pela pesquisa de concorrentes. Mantida fora do stack; ver nota abaixo. | — | — |
| 4 (preço alto p/ solo) | Preço de fundador R$79 (em vez de R$99) nos primeiros 12 meses — já decidido em `founder/pricing.md` | 4 | 1 (é desconto, não feature) |
| 5 (confiança com CPF/cartão) | Página de segurança honesta: isolamento por agência, 2FA, trilha de auditoria — já existe; falta só corrigir o formulário de lead (captcha/validação) e tornar MFA obrigatório pro super-admin antes de divulgar isso como prova de confiança | 4 | 2 (é código já planejado, não novo) |
| 8 (trocar dá trabalho) | Migração assistida (mesmo bônus do item 2) cobre isso também | 4 | (já contado) |
| 9 (form de lead sem captcha) | Corrigir antes de qualquer campanha paga — condição do board, não um bônus de marketing | — | 1 (correção técnica pontual) |
| 10, 13 (timing de alta temporada) | Migração agendada **fora** de dezembro-janeiro e julho, por escolha do cliente | 5 | 1 (é política, não código) |
| 12 (equipe volta pro WhatsApp) | Checklist de adoção de 30 dias + treinamento guiado no onboarding | 4 | 3 (tempo humano de suporte/sucesso do cliente) |
| 15 (onboarding sozinho) | Mesmo onboarding guiado do item 12 | 4 | (já contado) |
| 16, 17 (suporte lento, estorno demorado) | Compromisso declarado de prazo de resposta de suporte (ex.: 1 dia útil) — só prometer depois de ter estrutura pra cumprir | 4 | 2 (processo, não feature nova) |
| 18 (dados presos ao cancelar) | Exportação de dados garantida no cancelamento, sem custo | 4 | 2 (feature técnica simples: export CSV/JSON) |
| 19 (sem garantia) | Garantia de Migração Sem Risco (ver seção 3) | 5 | depende da taxa de acionamento — não modelada ainda (falta CFO) |

**Nota importante sobre o problema 3**: nenhuma oferta, bônus ou garantia
cobre honestamente "cobrança automática e NFS-e não existem" — isso só se
resolve implementando o código (já especificado em ADR, ainda não construído,
por `founder/board.md`). Incluir isso no pitch como "em desenvolvimento" (como
já está) é a única opção honesta até o código existir. Prometer um bônus que
disfarce essa lacuna violaria a regra de nunca prometer o que não se pode
entregar.

## 3. A pilha final

**O núcleo**: um sistema para a agência organizar cliente, orçamento, venda e
operação em um só lugar — descrito pelo resultado ("pare de perder venda
porque ninguém viu a planilha a tempo"), não pelos módulos.

**Bônus** (cada um mata uma objeção específica):
1. **Migração assistida sem risco** — a equipe da Travel Plataforma migra os
   dados da planilha/sistema atual, confere a integridade antes de confirmar,
   e agenda fora da alta temporada (dez-jan, julho) por escolha do cliente.
   Mata as objeções 2, 8, 10, 13, 14.
2. **Selo Agência Pioneira** — as primeiras agências que assinarem entram
   como caso de referência público (nome, depoimento, estudo de caso) e
   pagam o preço de fundador (R$ 79/mês nos primeiros 12 meses, plano
   Inicial). Mata as objeções 1, 4, 6, 7, 11 — a lacuna de prova social que
   domina as recusas do painel.
3. **Checklist de adoção de 30 dias** — treinamento guiado pra equipe nas
   primeiras quatro semanas, com check-ins, pra equipe não "voltar pro
   WhatsApp em uma semana". Mata a objeção 12, 15.

**A garantia — Garantia de Migração Sem Risco**: se a migração perder ou
corromper dado do cliente, a Travel Plataforma devolve 100% do valor pago até
aquele momento e ajuda a reverter para o sistema anterior sem custo. **Esta
garantia é estreita por design**: cobre o que a empresa já consegue cumprir
hoje (migração de dados), não cobre o que ainda não existe (cobrança/NFS-e,
que continua fora do produto e não deve ser prometido). Antes de ampliar essa
garantia pra "satisfação geral" ou "resultado de vendas", rodar
`/founder-cfo` pra modelar o custo numa taxa de acionamento realista — não
modelado aqui porque `founder/numbers.json` não existe ainda.

**Urgência e escassez**: real, não fabricada — "Agência Pioneira" é
genuinamente limitada a um número fixo de vagas (ex.: 10, a confirmar com o
fundador) porque o valor do bônus (ser referência) desaparece se for
oferecido a 200 agências ao mesmo tempo. Sem contagem regressiva falsa, sem
"restam 3 vagas" inventado — o número real de vagas preenchidas deve ser
atualizado de verdade conforme agências entram.

**O nome**: **Programa Agência Pioneira**.

## 4. Pontuação na equação de valor (1-10)

| elemento | antes (pitch.md original, testado no painel) | depois (com a pilha) | o que mudou |
|---|---:|---:|---|
| Resultado dos sonhos | 6 | 6 | o escopo do produto não mudou — parar de perder venda em planilha continua sendo o resultado desejado, nem mais nem menos atraente |
| Probabilidade percebida | 3 | 7 | Selo Agência Pioneira (prova social real) + Garantia de Migração Sem Risco atacam direto a objeção nº 1 do painel |
| Tempo até o resultado | 5 | 7 | migração assistida com prazo definido e agendada fora da alta temporada — antes não havia prazo nenhum prometido |
| Esforço e sacrifício | 4 | 6 | checklist de adoção reduz o risco de a equipe abandonar; mas a cobrança/NFS-e continuarem fora do sistema significa que a agência AINDA faz essa parte manualmente — não dá pra fingir que o esforço caiu a zero |

Nenhuma pontuação de "esforço" chegou a 10 porque a lacuna financeira é real
e a oferta não a escondeu.

## 5. Reteste com o painel

Pitch anterior preservado em `founder/pitch-v1.md`. Resultado completo do
painel original em `founder/panel-v1/results.md`; resultado completo do
reteste em `founder/panel/results.md` (cópia em `founder/panel/results-v2.md`).
Mesma seed (935677) nos dois — os 20 compradores são literalmente as mesmas
pessoas simuladas, reagindo à nova oferta.

**Taxa de compra: 20% (4/20) → 50% (10/20).** Mais que dobrou.

**O que mudou de "não" pra "sim" (6 compradores):** P002, P005, P008, P016,
P018, P019 — a razão que mais aparece é a combinação do preço de fundador
(R$79) com a garantia de migração sem risco removendo o medo específico de
perder dado de cliente, que era a trava mais citada no painel original.

**O que continuou "não" mesmo com a nova oferta (10 compradores):** a
objeção não mudou de natureza — ainda é majoritariamente confiança/prova
social (7 de 10 recusas, reason_code "trust"), só que agora com uma camada
nova e importante, levantada por vários compradores de forma quase
idêntica:

> **"Entrar como 'Agência Pioneira' significa eu ser a cobaia sem ter nenhum
> caso real pra olhar antes."** (P003)

> **"...não um depoimento genérico de site... não eu entrando como cobaia
> do programa Pioneira."** (P008, onda 2)

**Este é o achado mais importante do reteste**: o Programa Agência Pioneira
resolve a objeção de preço e parcialmente a de risco de migração, mas **pede
exatamente a coisa que metade do painel não tem condição de dar** — ser a
primeira prova, quando o próprio perfil de comprador (decide em grupo/
associação, ou é cauteloso por natureza) só compra depois de ver OUTRA
agência like-size já usando. Para esse subconjunto específico de compradores
(ex.: "decide em grupo/associação" ficou em 0% de compra nas duas rodadas),
a oferta precisa de uma segunda camada que não exija ser o primeiro — por
exemplo, recrutar 2-3 agências via conexões pessoais do fundador (fora do
programa Pioneira, sem pedir que sejam referência pública) só para ter uma
prova de uso real e verificável antes mesmo de abrir o Programa Pioneira pro
público. Isso é uma recomendação para `/founder-launch` (teste real antes do
lançamento), não algo que a oferta por si só resolve.

A segunda camada de objeção, que não mudou: cobrança automática e NFS-e
continuam "em desenvolvimento" — pelo menos 3 compradores que compraram
mesmo assim deixaram claro que a decisão de sair do teste e virar cliente
pagante de verdade depende disso ser entregue.
