# Lente Product
Nota: 5 | Voto: FUND IF

## O que é forte
- Há produto real em produção, não apresentação: Full no ar, banco com 118 migrations, e-mail transacional, e uma agência real (Gadotti) já operando com 1 OWNER + 4 AGENT. Isso passa o teste básico de "algo que o cliente pode tocar".
- O primeiro cliente veio do Lite, não de um anúncio. Para a lente Product é o melhor sinal disponível: alguém que já conhece a dor migrou para o Full. É um caso de uso concreto para contar a história em uma frase.
- O cuidado com as partes invisíveis (isolamento multi-tenant com RLS, MFA, papéis, trilha de auditoria) já existe. Para um B2B que guarda dados de clientes e dinheiro da agência, isso é craft de verdade.
- Melhora em relação à rodada de 12/10: o Full existe e tem cliente. Falta o resto do ciclo (cobrar), não o núcleo.
- Há modelo de teste barato à mão: o tenant Demo e o tenant cortesia permitem observar uso real sem custo de aquisição.

## O que mataria (top 3, mais perigoso primeiro)
1. **Sem foco e sem "a uma coisa".** CRM, pipeline, financeiro, folha/comissões, relatórios, portal do cliente, mais um Lite separado. A lente Product pergunta o que cortar; ninguém disse. Com fundador solo, cada módulo extra é qualidade fina em todo lugar e suporte espalhado. Hoje não dá para dizer em uma frase, sem "e", por que a agência larga a planilha/WhatsApp.
2. **O recibo não existe.** Cobrança recorrente (Asaas) e NFS-e só em ADR. A experiência do cliente termina exatamente onde começa a relação comercial: não há como cobrar, atribuir plano ou emitir nota. Enquanto isso, qualquer promessa de planos de R$ 99/R$ 299 na landing é promessa sem o último passo. Os "fundadores" funcionam sem isso; os demais, não.
3. **Dois produtos para um fundador solo.** Lite e Full evoluem em paralelo, o Demo tem senha pública, e a Ideia B (venda + suporte) multiplicaria versões. Se cada cliente vendido virar uma instância ou uma bifurcação, o fundador vira operador de N produtos e a qualidade cai onde o cliente não vê até quebrar. É o risco central das duas ideias.

## Perguntas ao fundador
- Qual é a única coisa que a agência Gadotti usa todo dia no Full? Se cortasse metade dos módulos, quais três ficam?
- O que o Full faz que o Lite não faz, e a Gadotti pediu isso ou foi você que decidiu?
- Qual é a primeira coisa que um agente da Gadotti faz nos primeiros cinco minutos, hoje? Você já assistiu a isso acontecer?
- Ideia B: "vender o sistema" significa código-fonte, instância dedicada ou acesso no mesmo multi-tenant? Quem opera as atualizações depois?
- "Vitalício" é vitalício de quê: do plano, do suporte, de novas funções, do preço? Vitalício de quem, da agência ou do usuário? E se a agência for vendida ou fechar?
- Quem são os outros 3 fundadores? Já conversaram? Cada um tem uma dor que o Full resolve hoje ou só curiosidade?
- Mercado, número de agências, concorrência e disposição a pagar: ainda abertos (`/founder-competitors`, `/founder-consumer`, `/founder-cfo`).

## Se FUND IF: condições
**Ideia A (4 fundadores):** boa, com desenho. O risco é virar 4 usuários grátis e nenhuma prova.
- O teste mede uso, não opinião: login semanal por agente, vendas/propostas criadas no sistema, contas a receber/pagar lançadas, substituição de planilha ou WhatsApp, e se a agência trocou rotina real por ele. Definir 3 a 4 métricas por escrito antes do dia 1.
- Cada fundador deve pagar alguma coisa ou dar algo concreto: cartão de crédito ou valor simbólico, depoimento com nome, estudo de caso com números, 1 ligação por mês de feedback, e permissão de usar a logo. Gratuito sem contrapartida não gera prova.
- Marcos em 30/90/180 dias com critério de saída; se a agência não usa, ela sai do programa e a vaga é reocupada. Vitalício só vale para quem cumprir.
- "Vitalício" precisa de limite: o plano de hoje, N usuários, sem novas edições premium, sem SLA, transferível ou não, cláusula de encerramento do produto. Sem isso é passivo sem teto. Alternativa mais segura: preço congelado por tempo longo (ex.: 5 anos) em vez de "para sempre", decisão a validar com `/founder-cfo`.
- Antes de iniciar o relógio de 6 meses: ter ao menos cobrança manual (boleto/Pix na mão) e o processo de suporte definidos, para que a transição para assinatura não seja um evento novo.

**Ideia B (venda + suporte):** só como exceção, não como modelo.
- Impacto em atualizações: cada cliente que "compra" fica preso a uma versão ou força manutenção paralela; o multi-tenant único é o maior ativo do fundador solo e a venda de licença o enfraquece.
- Impacto em suporte: suporte vira o produto. Sem equipe, é teto de receita igual ao tempo do fundador.
- Se existir, que seja implantação/migração/treinamento pontual (venda de serviço) sobre a mesma assinatura multi-tenant, nunca uma versão separada do sistema.

**Melhor combinação:** Ideia A com contrapartida, vitalício limitado e em escopo definido; depois assinatura multi-tenant única, com implantação e suporte como serviços opcionais pagos (parte da Ideia B). Não vender cópia do sistema. Antes de abrir para o resto: ligar cobrança (Asaas) e fechar a história em uma frase para a landing.
