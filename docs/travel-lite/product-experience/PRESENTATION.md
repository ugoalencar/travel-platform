# Travel Lite — Roteiro de Apresentação

Status: roteiro pronto para virar deck (2026-10-02)

## Como usar este roteiro

- Público: donos e equipes de agências de viagem (cliente potencial do Lite).
- Formato: 15 slides + 3 apêndices (demonstração ao vivo, perguntas
  prováveis, pendências que não podem ser prometidas).
- Duração sugerida: 30 a 40 minutos, com 10 a 15 minutos de demonstração
  ao vivo (Apêndice A).
- Regra de ouro: mostrar o produto que existe hoje. Nenhuma métrica,
  preço, SLA, integração externa ou garantia comercial neste roteiro —
  o que ainda não está definido está listado no Apêndice C e deve ser
  respondido com "isso ainda não está definido; retorno pelo
  responsável comercial".
- Base de demonstração: ambiente local da agência de demonstração
  (Gadotti), usuário MASTER. Nunca usar produção ou staging.

---

## Slides

### Slide 1 — O que é o Travel Lite

- **Objetivo:** posicionar o produto com clareza, sem oversell.
- **Bullets:**
  - Sistema web de operação para agências: clientes, vendas, comissões,
    financeiro e importação de planilhas.
  - Roda no navegador, também instalável no celular (PWA) — nada de
    instalar servidor na agência.
  - Versão inicial de um caminho: Lite hoje, migração preparada para a
    plataforma Full quando a agência crescer.
- **Fala do apresentador:** "O Travel Lite é a operação prática do dia a
  dia da agência: cadastra cliente, vende, controla o que entrou e o que
  saiu e paga comissão. Ele não é uma promessa de sistema completo — é o
  que a agência precisa para trabalhar amanhã, com porta de saída
  preparada para o Full."
- **Tela/demo:** tela de login já com a marca da agência (prévia do
  slide 4).

### Slide 2 — Para quem serve

- **Objetivo:** criar identificação com o problema da agência.
- **Bullets:**
  - Agências que querem operar rápido, sem projeto longo de implantação.
  - Equipes com perfis diferentes (quem vende, quem administra, quem só
    consulta).
  - Quem hoje controla vendas e pagamentos em planilha solta.
- **Fala do apresentador:** "Se a agência hoje vive de planilha e
  mensagens, o Lite substitui o controle manual por um fluxo único:
  cliente → venda → recebimento → comissão. A implantação é configurar
  a identidade, cadastrar os vendedores e importar a base que já existe."
- **Tela/demo:** nenhuma (slide de abertura).

### Slide 3 — Lite, Pro e Full

- **Objetivo:** explicar os planos sem prometer o que não existe.
- **Bullets:**
  - Lite: clientes, vendas e financeiro básicos completos; importação
    limitada; dashboard essencial; mobile de consulta e cadastro rápido;
    identidade visual básica; integrações preparadas; readiness de
    migração.
  - Pro e Full: versões mais completas dos mesmos recursos (a matriz
    oficial está em `PLAN-CAPABILITIES.md`).
  - Os recursos do plano aparecem no sistema como informação ("Recursos
    do plano") — nunca escondem botão sem explicar.
- **Fala do apresentador:** "O Lite já é útil sozinho. Onde o Lite é
    reduzido, o sistema avisa com discreteção, com o nome do plano que
    oferece a versão completa. Preço, limites numéricos e condições
    comerciais ainda não estão definidos — não vou inventá-los aqui."
- **Tela/demo:** `/plano` — "Recursos do plano" com a matriz e os
  avisos discretos (Dashboard, Importações, Identidade visual).

### Slide 4 — Login com a marca da agência

- **Objetivo:** mostrar que o ambiente é da agência, não genérico.
- **Bullets:**
  - MASTER configura em Configurações › Identidade visual: nome
    fantasia, logo (PNG/JPEG/WebP, até 150 kB), cores, fundo do login e
    texto de boas-vindas.
  - Login resolve a identidade pelo endereço (slug) da agência — sem
    informar código técnico.
  - Configuração incompleta não quebra: o sistema cai no tema padrão
    seguro.
- **Fala do apresentador:** "O cliente da agência vê a logo e as cores
  da agência no login e no topo do sistema. Quem ajusta é o MASTER, sem
  intervenção técnica."
- **Tela/demo:** abrir o login com o slug da agência de demonstração;
  depois Configurações › Identidade visual, mudar a cor primária e
  recarregar o login.

### Slide 5 — Dashboard e checklist inicial

- **Objetivo:** mostrar que o produto se configura sozinho, sem
  treinamento longo.
- **Bullets:**
  - Dashboard com indicadores essenciais de vendas e financeiro.
  - Checklist "Prepare sua agência" com 6 etapas detectadas pelo próprio
    sistema: vendedores, conta financeira, categorias, cliente, primeira
    venda e ajuda.
  - Progresso com barra de avanço; cada etapa linka direto para a tela.
- **Fala do apresentador:** "Em vez de um treinador, o sistema pergunta:
  você já cadastrou vendedores? Já tem conta e categorias? Fez a primeira
  venda? O checklist fecha sozinho conforme a agência avança."
- **Tela/demo:** Dashboard com o checklist visível; marcar etapas e
  mostrar o progresso.

### Slide 6 — Cadastro de cliente

- **Objetivo:** mostrar o fluxo mais usado, simples e completo.
- **Bullets:**
  - Cliente com dados de contato, CPF (com validação de dígitos),
    endereço e observações.
  - Carteira: cliente pode ficar vinculado ao vendedor responsável.
  - Atalho "+ Cliente" sempre à mão (botão flutuante no celular).
- **Fala do apresentador:** "Cadastro rápido, com validação: se o CPF
  estiver errado o sistema avisa na hora. Para o vendedor, o cliente
    entra automaticamente na carteira dele."
- **Tela/demo:** Clientes › Novo cliente; tentar salvar um CPF inválido
  para mostrar a validação; salvar um cliente real da base de
  demonstração.

### Slide 7 — Venda, custos e margem

- **Objetivo:** explicar o coração da operação.
- **Bullets:**
  - Venda nasce como rascunho (DRAFT) e só vale depois de confirmar —
    confirmação gera as parcelas e a comissão automaticamente.
  - Margem é calculada pelo sistema: valor bruto menos custos
    (aéreo, hotel, transferência, seguro, taxas…).
  - Cancelamento é controlado: venda já paga ou com comissão paga não
    cancela; parcelas e comissões são reabertas/canceladas junto.
- **Fala do apresentador:** "O vendedor lança a venda, o sistema pergunta
  quanto custou e mostra a margem na hora. Nada de planilha paralela:
  confirmou, as parcelas aparecem no financeiro e a comissão nasce junto."
- **Tela/demo:** Vendas › Nova venda com custos; mostrar a margem;
  confirmar a venda e mostrar parcelas + comissão geradas.

### Slide 8 — Financeiro

- **Objetivo:** mostrar controle de caixa sem planilha.
- **Bullets:**
  - Contas (banca/caixa), categorias de entrada e saída, recebíveis por
    parcela e pagamentos a fornecedores.
  - Fluxo de caixa com entradas, saídas e pendências.
  - Estorno controlado: nunca apaga histórico — gera movimento inverso
    apontando para o original (auditoria preservada).
- **Fala do apresentador:** "Recebeu uma parcela? Registra em dois
  cliques. Errou? Estorna — o histórico fica intacto, que é o que
  interessa na hora de prestar contas."
- **Tela/demo:** Financeiro › Fluxo de caixa; registrar um recebimento
  de parcela; mostrar o status da venda mudando para parcialmente paga.

### Slide 9 — Comissões

- **Objetivo:** mostrar que a comissão é regra, não negociação manual.
- **Bullets:**
  - Regra por vendedor: percentual sobre o valor, percentual sobre a
    margem ou valor fixo.
  - Ciclo: gerada com a venda → aprovação → pagamento (com payable
    correspondente no financeiro).
  - Vendedor sem regra definida fica como "aguardando regra" — o
    sistema nunca inventa valor.
- **Fala do apresentador:** "A comissão nasce da regra que a agência
  definiu, não de conversa no WhatsApp. Aprovação e pagamento ficam
  registrados, com o lançamento financeiro correspondente."
- **Tela/demo:** Vendedores › mostrar regra de um vendedor; Comissões ›
  aprovar e pagar uma comissão; mostrar o payable gerado no Financeiro.

### Slide 10 — Importação de planilhas

- **Objetivo:** mostrar que a base existente da agência não se perde.
- **Bullets:**
  - Importa clientes e vendas de CSV/XLSX.
  - Conferência antes de gravar: a importação mostra o que é válido,
    duplicado ou inválido antes de qualquer alteração real.
  - No Lite a importação é limitada (versão completa no Pro — ver
    slide 3).
- **Fala do apresentador:** "A agência não vai redigitar mil clientes.
  Ela importa, confere na tela o que o sistema encontrou e só então
  confirma."
- **Tela/demo:** Importações › enviar planilha de demonstração; mostrar a
  etapa de conferência com linhas válidas e rejeitadas.

### Slide 11 — Usuários, permissões e escopo do vendedor

- **Objetivo:** responder antes à pergunta de segurança de todo dono de
  agência.
- **Bullets:**
  - Perfis: MASTER, ADMIN, MANAGER, SELLER e VIEWER — com permissões
    padrão e ajustes por usuário.
  - Vendedor enxerga só a própria carteira, vendas e comissões
    (fail-closed: sem vendedor vinculado, as listas vêm vazias).
  - Tudo é verificado no servidor; o que o perfil não tem simplesmente
    não aparece — e uma área aberta por link direto explica o motivo.
- **Fala do apresentador:** "O vendedor logado não vê a venda do
  colega nem o financeiro da agência. Isso é decidido no servidor, não
  escondido na tela."
- **Tela/demo:** Configurações › Usuários e permissões; entrar como
  SELLER e mostrar listas no próprio escopo.

### Slide 12 — Ajuda integrada e onboarding

- **Objetivo:** provar a redução de integração humana.
- **Bullets:**
  - Centro de ajuda dentro do sistema: 10 artigos + perguntas
    frequentes, com busca em linguagem simples.
  - Cada tela vazia e cada erro aponta o próximo passo, com link direto
    para o artigo certo.
  - O mesmo conteúdo responde "quem pode fazer o quê" e "por que não
    vejo este menu".
- **Fala do apresentador:** "A pergunta de hoje vira resposta amanhã: a
  equipe consulta a ajuda dentro do sistema, no celular ou no desktop,
  e para de depender de alguém para tarefas comuns."
- **Tela/demo:** Ajuda › busca por "comissão" e por "menu"; abrir um
  artigo a partir de um estado vazio (ex.: Comissões sem dados).

### Slide 13 — Mobile/PWA e cadastro rápido

- **Objetivo:** mostrar o produto em campo.
- **Bullets:**
  - PWA instalável pelo navegador, com nome e ícones padrão do Travel
    Lite nesta fase.
  - Em celular: dashboard resumido, consulta de clientes e vendas
    próprias, ajuda e cadastro rápido de cliente (nome, telefone e
    e-mail; os demais campos aparecem em "Mais campos").
  - Escopo de vendedor vale também no celular.
- **Fala do apresentador:** "O vendedor em visita cadastra o cliente na
  hora, pelo celular, com cinco campos. Não é aplicativo de loja: é o
  mesmo sistema instalado no navegador, com a cara da agência."
- **Tela/demo:** celular (ou modo dispositivo no navegador): abrir o
  app em layout mobile, mostrar o menu lateral, usar o botão flutuante
  "+ Cliente" e salvar um cadastro rápido. A instalação como PWA deve
  ser validada em aparelho real antes de demonstração externa.

### Slide 14 — Caminho para a plataforma Full

- **Objetivo:** mostrar evolução sem prometer data ou preço.
- **Bullets:**
  - A agência não fica presa ao Lite: existe verificação de prontidão
    de migração (readiness) na API do Lite.
  - A verificação aponta pendências em severidade: bloqueio, atenção e
    informativo (ex.: sem MASTER ativo, CPF inválido, saldo de
    recebível dessincronizado, evento de integração com falha).
  - Migração é etapa assistida: relatório → correções → exportação →
    conferência → ambiente Full. Credenciais nunca migram em claro e
    conflitos entram em fila de revisão.
- **Fala do apresentador:** "Quando a agência crescer, o caminho já
  existe e é auditável: o sistema diz o que precisa ser corrigido antes,
  a agência corrige e a migração acontece com conferência. O agendamento
  e as condições comerciais são definidos caso a caso."
- **Tela/demo:** explicar o formato do relatório de prontidão e mostrar
  a documentação/contrato técnico. A tela operacional e a exportação do
  relatório ainda são evolução futura.

### Slide 15 — Próximos passos para homologação/teste

- **Objetivo:** fechar com ação concreta e óbvia.
- **Bullets:**
  1. Montar ambiente de teste com a identidade da agência (login, logo,
     cores).
  2. Cadastrar vendedores com regra de comissão e vincular os logins.
  3. Importar uma cópia da base atual (clientes) e conferir.
  4. Rodar um ciclo completo: venda → confirmação → recebimento →
     comissão aprovada e paga.
  5. Testar no celular (instalar o PWA) e com um login de vendedor.
  6. Revisar a ajuda com a equipe e, ao final, rodar a verificação de
     prontidão.
- **Fala do apresentador:** "Homologação é isso: seis passos, todos no
  sistema, sem consultoria obrigatória. No final temos um ambiente com
  a cara da agência, dados reais de teste e um relatório do que falta."
- **Tela/demo:** checklist "Prepare sua agência" como score final da
  homologação.

---

## Apêndice A — Roteiro de demonstração ao vivo

Ordem sugerida (10 a 15 minutos), sobre a base local de demonstração:

1. Login MASTER com a identidade da agência (slide 4).
2. Dashboard + checklist "Prepare sua agência" (slide 5).
3. Cadastrar um cliente, com CPF inválido antes do válido (slide 6).
4. Criar venda com custos → mostrar margem → confirmar (slide 7).
5. Registrar recebimento da parcela no Financeiro (slide 8).
6. Aprovar e pagar a comissão gerada (slide 9).
7. Abrir a ajuda e fazer uma busca (slide 12).
8. No celular: abrir o layout mobile e cadastrar cliente rápido
   (slide 13). A instalação do PWA em aparelho real fica para a
   validação de campo.
9. Trocar para um login SELLER e mostrar o escopo reduzido (slide 11).
10. Fechar com o caminho de prontidão para migração (slide 14),
    explicando que hoje é relatório técnico/API, sem tela operacional.

Cuidados da demonstração:

- usar apenas a base local de demonstração (nunca produção/staging);
- manter dados fictícios na tela (nada de CPF/e-mail reais de clientes);
- se algo falhar na demo, usar a ajuda integrada como prova de
  autosserviço em vez de desviar do roteiro.

## Apêndice B — Perguntas e respostas prováveis

1. **Quanto custa?**
   Preço e condições comerciais ainda não estão definidos. O que está
   definido é o que cada plano oferece (matriz no sistema, em "Recursos
   do plano"). Retorno pelo responsável comercial.

2. **O Pro já existe? Quando sai?**
   A diferenciação Lite/Pro/Full está prevista e visível no produto,
   mas escopo final, limites numéricos e data do Pro ainda não estão
   definidos. Não há data para prometer.

3. **Meus dados ficam seguros?**
   Sim: cada agência enxerga só os próprios dados (isolamento no banco e
   no servidor), a autorização é verificada no servidor e o histórico
   financeiro é preservado (estornos não apagam nada).

4. **E se eu esquecer a senha?**
   Nesta edição não há redefinição por e-mail: alguém com acesso em
   Configurações › Usuários define uma nova senha (mínimo de 8
   caracteres).

5. **Funciona offline?**
   Não. O uso é online; o que o PWA oferece é instalação e tela
   dedicada no celular. Offline completo, notificações e aplicativo
   nativo estão fora do escopo atual.

6. **Consigo importar minha planilha atual?**
   Sim, clientes e vendas em CSV/XLSX, com conferência antes de gravar.
   O volume permitido no Lite tem limite — o valor exato ainda não está
   definido (ver Apêndice C).

7. **O vendedor vê as vendas dos outros?**
   Não. Cada vendedor vê a própria carteira e as próprias vendas e
   comissões; MASTER/ADMIN/MANAGER têm visão total conforme permissão.

8. **Como funciona a comissão?**
   Regra definida por vendedor (percentual sobre valor, percentual sobre
   margem ou valor fixo); a comissão nasce na confirmação da venda, vai
   para aprovação e depois para pagamento, sempre com registro
   financeiro.

9. **Dá para integrar com meu site, OTA ou WhatsApp?**
   O sistema já prepara os eventos de integração internamente, mas
   integrações externas concretas não fazem parte do escopo atual desta
   apresentação. Sem promessa de integração.

10. **E quando eu quiser a plataforma Full?**
    Existe verificação de prontidão dentro do sistema: mostra o que
    bloqueia, o que precisa de validação humana e o que é apenas
    informativo. O agendamento e as condições da migração são
    combinados depois — sem data prometida aqui.

11. **Preciso de alguém instalado na agência para operar?**
    O produto foi desenhado para autosserviço: checklist de implantação,
    ajuda integrada em cada tela e importação da base. Treinamento
    longo não é pré-requisito; suporte humano continua disponível pelo
    canal combinado fora desta apresentação.

12. **Quantos usuários/celulares/relatórios posso ter?**
    Os perfis e as áreas do sistema são os mostrados aqui. Limites
    numéricos (usuários, volume de importação, retenção) ainda não
    estão definidos — ver Apêndice C.

13. **O sistema dá garantia de disponibilidade?**
    Não há SLA definido nesta etapa. Qualquer compromisso de nível de
    serviço é assunto comercial, não parte desta demonstração.

## Apêndice C — Pendências: o que NÃO prometer ainda

Estes pontos estão abertos (produto/comercial) e devem ser respondidos
com transparência, nunca com estimativa:

- **Preço, moeda, forma de cobrança e condições comerciais** dos planos.
- **Existência e escopo finais do Pro** (se existe antes do Full, o que
  exatamente muda).
- **Limites numéricos do Lite** (volume de importação, quantidade de
  usuários, armazenamento de logo, retenção de dados).
- **Prazos e datas** de evolução de plano, de migração assistida e de
  qualquer roadmap.
- **SLA, garantia de disponibilidade, backup e RTO/RPO** (ainda não
  definidos formalmente).
- **Integrações externas** concretas (site, OTAs, WhatsApp, emissores,
  meios de pagamento) — não existem hoje.
- **Recursos fora do escopo atual**: offline completo, push
  notification, scanner/OCR, aplicativo nas lojas, editor visual de
  tema, temas por usuário.
- **Aprovação de upgrade**: quem aprova, como e em quanto tempo ainda
  não está definido.
- **Métricas de resultado** (ex.: "reduz X% do tempo de atendimento"):
  não há dado medido — não citar número algum.

## Critérios de aceite

- Apresentação mostra produto real, não promessa genérica.
- Diferença Lite/Full fica clara.
- Próximo passo comercial é óbvio.
- Nenhuma afirmação deste roteiro excede o que os docs de produto
  sustentam.
