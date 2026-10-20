# Operação — Travel Plataforma

## 1. O ciclo diário

O negócio é um SaaS B2B, não uma loja física — o "ciclo diário" é sobre
atender quem já está dentro e trazer quem ainda não está, não sobre abrir
uma loja.

| passo | o que é | o cliente vê? |
| --- | --- | --- |
| 1. Checar cadastros/demos novos | Ver quem se cadastrou ou pediu demo nas últimas 24h | Não |
| 2. Responder leads | Primeiro contato com quem se cadastrou, idealmente no mesmo dia | **Sim** |
| 3. Migração assistida (quando houver agência em processo) | Migrar dados da planilha/sistema atual, confirmar integridade, agendar fora de alta temporada se o cliente pedir | **Sim** — é o bônus central da oferta (`founder/offer.md`) |
| 4. Suporte a clientes ativos | Responder dúvidas, dentro do prazo declarado em `founder/marketing.md` | **Sim** |
| 5. Monitorar a produção | Checar status dos serviços (hospedagem, banco de dados), erros, backups | Não (a menos que falhe) |
| 6. Fechar o dia | Nenhuma rotina de "caixa" como um comércio físico — mas revisar se algo ficou pendente de resposta | Não |
| 7. Revisão semanal | Os três números de `founder/marketing.md` (cadastros, conversão, CAC) | Não |

## 2. Fornecedores reais

A Travel Plataforma já roda sobre fornecedores escolhidos (confirmado no
código/configuração do projeto, não suposição):

| fornecedor | pra quê | preço público | observação |
| --- | --- | --- | --- |
| **Supabase** | Banco de dados (Postgres) e armazenamento de arquivo | Plano gratuito até certo uso; planos pagos a partir de US$25/mês — [supabase.com/pricing](https://supabase.com/pricing) | Confirmar o plano atual contratado; se pago, somar ao `fixed_monthly` do CFO (`founder/numbers.json` hoje só tem R$1.000 genérico de "ferramentas" — confirmar se Supabase já está incluído nesse valor). |
| **Vercel** | Hospedagem do site de marketing e/ou do app | Plano Hobby gratuito; Pro a partir de US$20/mês por usuário — [vercel.com/pricing](https://vercel.com/pricing) | Mesma observação acima. |
| **Render** | Hospedagem da API do Travel Lite (achado em sessão anterior: cold-start no plano gratuito/starter) | Planos a partir de US$7/mês pra evitar cold-start — [render.com/pricing](https://render.com/pricing) | **Ação concreta recomendada**: o cold-start já identificado como problema real de acesso é sintoma de estar no tier gratuito; subir pro tier pago resolve e tem preço público conhecido. |
| **Asaas** | Cobrança recorrente (Pix/boleto/cartão) e NFS-e — já decidido no ADR-BILLING-001, ainda não implementado em código | Tarifas por transação — **a tabela oficial não foi confirmada nesta pesquisa** (busca pública não encontrou a página de preços vigente); confirmar em [asaas.com](https://www.asaas.com) antes de orçar | Pendência já registrada em `founder/cfo-sources.md`. |

**Fornecedores que faltam decidir** (não inventados aqui):
- E-mail transacional (confirmação de cadastro, migração concluída) — nenhum provedor identificado no código revisado nesta sessão.
- Ferramenta de suporte ao cliente — hoje provavelmente e-mail/WhatsApp manual; decidir se cresce pra uma ferramenta dedicada (ex.: um helpdesk) conforme o número de clientes passar de ~20-30 (quando suporte manual deixa de escalar).
- Monitoramento/alerta de uptime — não identificado; recomendado antes de ter clientes pagantes reais, já que o achado de concorrentes (`founder/competitors.md`) mostra que suporte/estabilidade é onde Omie e PHPTravels perdem pontos.

## 3. Pessoas

Hoje: **só o fundador, sem pró-labore** (confirmado na pergunta do CFO).
Rota pra o primeiro mês (volume baixo, Programa Agência Pioneira):

| responsabilidade | quem | quando |
| --- | --- | --- |
| Responder leads e demos | Fundador | Diário |
| Migração assistida | Fundador | Conforme agência entra, agendada fora de alta temporada |
| Suporte | Fundador | Diário, dentro do SLA declarado |
| Marketing/grupos/parcerias | Fundador | Conforme calendário de `founder/marketing.md` |
| Desenvolvimento (inclusive a integração Asaas/NFS-e pendente) | Fundador | Contínuo |

**Risco estrutural, não escondido**: é a mesma pessoa fazendo venda, suporte,
migração e desenvolvimento. Na meta de regime do CFO (50 agências), isso já
é tensionado — ver seção de riscos abaixo. Contratar a primeira pessoa muda
o `fixed_monthly` do CFO de forma dramática (`founder/cfo.md` já modelou o
cenário de R$9.000/mês de pró-labore/equipe: break-even salta de 13 para 124
agências). Qualquer decisão de contratar deve voltar pro CFO antes de
confirmar.

## 4. Rotinas (SOPs)

**SOP 1 — Responder um novo cadastro/demo**
1. Confirmar recebimento em até 24h (meta declarada em `founder/marketing.md`).
2. Perguntar: tamanho da agência, sistema/planilha atual, maior dor hoje.
3. Oferecer teste antes de assinar, sem contrato longo (`founder/pitch.md`).
4. Se aceitar, agendar a migração (SOP 2).

**SOP 2 — Migração assistida (o bônus central da oferta)**
1. Pedir exportação dos dados atuais da agência (planilha ou sistema).
2. Confirmar com o cliente se ele quer migrar fora da alta temporada
   (dezembro-janeiro, julho) — se sim, agendar pra depois.
3. Importar os dados num ambiente de teste primeiro, nunca direto em produção.
4. Conferir contagem de registros e amostra de dados antes/depois.
5. Só confirmar a migração como concluída com o cliente revisando o resultado.
6. Se algo falhar ou dado for perdido/corrompido: acionar a Garantia de
   Migração Sem Risco (`founder/offer.md`) — devolução integral e ajuda a
   voltar pro sistema anterior.

**SOP 3 — Lidar com uma reclamação**
1. Responder no mesmo dia, mesmo que só pra confirmar que está sendo visto.
2. Nunca prometer prazo que não pode cumprir (ligado à seção 5 de
   `founder/marketing.md` sobre suporte lento ser ponto fraco de concorrentes).
3. Se for sobre algo que o produto não faz hoje (cobrança/NFS-e), ser direto:
   "está em desenvolvimento, ainda não disponível" — nunca prometer data que
   não é real.

**SOP 4 — Fechamento/revisão semanal**
1. Ver os três números de `founder/marketing.md` (cadastros, conversão, CAC).
2. Ver se alguma migração ficou pendente de confirmação.
3. Ver status das vagas do Programa Agência Pioneira (número real, não
   estimado).

**SOP 5 — Revisão mensal de custo** (equivalente ao "reorder" semanal de um
negócio físico)
1. Confirmar fatura real de Supabase/Vercel/Render contra o que está no
   `founder/numbers.json`.
2. Se qualquer fornecedor mudar de preço, atualizar `founder/numbers.json`
   e rodar o CFO de novo.

## 5. Ferramentas

| função | ferramenta | preço público |
| --- | --- | --- |
| Banco de dados/armazenamento | Supabase | ver seção 2 |
| Hospedagem (marketing/app) | Vercel | ver seção 2 |
| Hospedagem (API Travel Lite) | Render | ver seção 2 |
| Cobrança/fiscal (pendente de implementar) | Asaas | ver seção 2 |
| E-mail, suporte, monitoramento | **não decidido** | — |

## 6. Licenças, registros e seguros (checklist — confirmar com contador/advogado, não é parecer jurídico)

- **CNPJ e regime tributário** (provavelmente Simples Nacional pro estágio
  atual) — confirmar em [gov.br/empresas-e-negocios](https://www.gov.br/empresas-e-negocios/pt-br).
- **ISS municipal sobre serviço de software** — alíquota e cadastro variam
  por município; confirmar na prefeitura onde a empresa está sediada.
- **LGPD (Lei Geral de Proteção de Dados)** — a plataforma processa CPF e
  dados pessoais de clientes finais das agências; isso já apareceu como
  preocupação real no painel de compradores (`founder/panel/results.md`:
  "não confio em colocar o CPF/cartão do meu cliente numa plataforma que
  nunca ouvi falar"). Conferir o site da [ANPD](https://www.gov.br/anpd/pt-br)
  pra requisitos de empresas que tratam dado pessoal como a Travel
  Plataforma trata.
- **Registro de marca (INPI)** — já citado em `founder/brand.md`.
- **Nota fiscal de serviço (NFS-e) da própria Travel Plataforma** (cobrar as
  agências pela mensalidade) — distinto da NFS-e que a Travel Plataforma
  pretende emitir EM NOME das agências (isso é o ADR-FISCAL-001, ainda não
  implementado). A própria empresa já precisa emitir nota pra cobrar as
  agências hoje, independente da feature não estar pronta.
- **Seguro de responsabilidade civil/cyber** — não obrigatório, mas comum
  pra empresas que guardam dado de pagamento/pessoal de terceiros; conferir
  com uma corretora.

## 7. Registro de riscos (os dez mais prováveis)

| risco | probabilidade | impacto | plano |
| --- | --- | --- | --- |
| Migração perde/corrompe dado real de cliente | Média | Alto | SOP 2 (testar antes de confirmar) + Garantia de Migração Sem Risco |
| Fundador solo fica indisponível (doença, etc.) | Média | Alto, dado que não há equipe | Documentar processos (este arquivo é o primeiro passo); backup de acesso a sistemas |
| Provedor de hospedagem cai (Render/Vercel/Supabase) | Baixa-média | Alto | Monitorar status pages dos três; já migrar o Render pro tier pago reduz o risco de cold-start conhecido |
| Taxa real do Asaas maior que a estimativa do CFO | Média | Médio | Confirmar tabela oficial antes de lançar a cobrança (`founder/cfo-sources.md`) |
| Vazamento/uso indevido de CPF de cliente final | Baixa | Muito alto (legal + reputação) | Corrigir as lacunas de segurança já identificadas (captcha no formulário, MFA obrigatório pro super-admin) antes de escalar tráfego |
| Conversão cadastro→pago muito abaixo do painel simulado | Média-alta | Médio | Números semanais de `founder/marketing.md`; ajustar oferta/canal se cair muito abaixo de 50% |
| Equipe da agência cliente não adota, cancela | Média | Médio | Checklist de adoção de 30 dias (`founder/offer.md`) |
| Pico de alta temporada sobrecarrega suporte/infra | Média | Médio | Não agendar migração em dez-jan/julho (já é política declarada) |
| Concorrente (Omie, PaxPro) lança cobrança+NFS-e antes | Baixa-média | Alto pro diferencial de longo prazo | Priorizar terminar o ADR-BILLING-001/FISCAL-001 no roadmap, não deixar indefinido |
| Reclamação pública (ex. ReclameAqui) por suporte lento | Baixa (hoje, poucos clientes) | Médio, cresce com volume | SOP 3 (resposta no mesmo dia), já é diferencial declarado contra concorrentes |
