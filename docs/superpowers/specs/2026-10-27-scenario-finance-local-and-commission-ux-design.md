# Cenário financeiro local e configuração visual de comissões

**Data:** 2026-10-27  
**Estado:** Proposta para revisão do responsável pelo produto  
**Escopo:** Travel Platform Full, checkout local e banco descartável já autorizado na porta 55648. Sem Lite, demo 5183, produção, deploy ou migração de banco remoto.

## Objetivo

Permitir que o cenário financeiro de demonstração seja explorado por vendas,
cliente, fornecedor, funcionário, contas a pagar/receber, comissões, receita da
agência, pipeline e passageiros. Melhorar a configuração de comissão para que
usuários da agência montem regras por escolhas visuais, sem JSON, variáveis ou
fórmulas.

## Estado verificado

- O cenário local possui 67 vendas, 78 recebíveis, 92 contas a pagar, 5
  oportunidades e 5 tarefas de acompanhamento; suas anotações usam o marcador
  `DEMO-FIN-2026-10`.
- Não há viagens, serviços aéreos/terrestres, passageiros derivados, segmentos
  de clientes ou planos de comissão legados.
- O Full já tem regras de comissão versionadas e uma tela em
  `CommissionRulesPage.tsx`; a tela legada `CommissionPlansPage.tsx` aceita
  regras avançadas em JSON e informa que o cálculo automático ainda seria
  futuro. A navegação aponta para a tela legada.
- O Full já possui receita da agência em `/financial/agency-revenue`; a página
  oferece filtros por IDs técnicos e não está no menu.
- A segmentação de clientes usa um registro permitido de campos e operadores.
  O campo de observações do cliente ainda não faz parte desse registro.
- Viagens possuem `sale_id` no modelo e listagem, mas o fluxo atual de criação
  não associa uma venda.

## Opções consideradas

1. **Tela de comissão atual com ajuda textual.** Mudança pequena, mas mantém
   a experiência técnica e a tela JSON legada disponível.
2. **Construtor visual guiado no Full, reutilizando o motor versionado.**
   Apresenta escolhas simples e libera campos contextuais conforme a opção;
   mantém o contrato e os cálculos existentes, elimina JSON da experiência da
   agência e evita um segundo motor. **Recomendado.**
3. **Substituir motor e interface por um novo módulo de comissão.** Aumenta o
   risco de divergência histórica e duplicação sem necessidade comprovada.

## Desenho proposto

### Comissão

- A navegação de “Planos de Comissão” leva à configuração ativa e versionada,
  sem deixar o usuário da agência na tela JSON legada.
- Um formulário guiado permite escolher funcionário, fornecedor/categoria
  quando aplicável e um tipo compreensível: percentual, valor fixo, meta por
  faixas, excedente ou sem regra.
- Campos de valores e percentuais aparecem como entradas monetárias comuns;
  as opções progressivas são adicionadas/removidas por botões e descrevem em
  linguagem direta se a faixa vale sobre o total ou somente o excedente.
- O usuário não escreve JSON, variáveis, expressões ou fórmulas. Regras e
  revisões continuam no motor versionado existente; não se criará um módulo de
  cálculo separado.
- A lista permite localizar regra por funcionário, fornecedor, categoria e
  situação, além de apresentar vigência e resumo legível. Alterações preservam
  versões anteriores e suas atribuições históricas.

### Filtros, segmentação e navegação

- Vendas e listas financeiras ganham filtros aplicados no servidor para
  período, fornecedor, funcionário e situação, conforme relevância de cada
  domínio; filtros existentes permanecem disponíveis.
- O cenário é separado por uma segmentação dinâmica baseada no marcador já
  gravado nas observações dos clientes. O marcador não será copiado para novos
  registros financeiros nem usado como filtro global permanente.
- Consultas de recebíveis, pagamentos e comissões do cenário poderão ser
  filtradas pela segmentação através dos vínculos com venda e cliente.
- Regras de comissão e receita da agência recebem entradas de navegação com
  nomes claros. Os filtros por IDs técnicos da receita serão substituídos por
  seletores de nomes quando os cadastros estiverem disponíveis.

### Viagens e passageiros do cenário

- Para este cenário descartável, o comprador será usado como passageiro
  principal da respectiva venda de viagem. Nenhum acompanhante, documento ou
  outro dado pessoal fictício será criado.
- A operação fica associada à venda; o endpoint de criação valida venda,
  cliente e agência no servidor, respeitando unicidade e isolamento por tenant.
- Datas/destinos são derivados dos dados existentes da venda e do produto;
  registros sem informação suficiente não recebem destino ou datas inventados
  e são reportados como pendência de seed.

### Acessibilidade e organização

- Filtros terão rótulos explícitos, ordem de foco previsível e operação por
  teclado; estados vazios e resultados indicarão filtros aplicados.
- Listas devem permitir identificar funcionário, data, fornecedor e situação
  sem depender exclusivamente de cor ou ícones.

## Segurança e integridade

- Toda consulta e mutação conserva o escopo da agência vindo do contexto
  autenticado; nenhum `agencyId` confiado ao navegador.
- Filtros, segmentação e associação de viagem validam entradas e usam SQL
  parametrizado.
- Nenhuma senha, token, dado pessoal real, banco online ou configuração de
  produção será lido ou alterado.
- A criação/alteração de operações e regras registra auditoria conforme os
  mecanismos já existentes.

## Verificação de aceite

- Filtros combinados retornam somente os registros correspondentes e continuam
  isolados por agência.
- A segmentação identifica o cenário e os módulos vinculados mostram dados
  filtrados coerentes com vendas, recebimentos e projeções existentes.
- A tela usada pela agência não expõe JSON, variáveis, expressões nem controles
  técnicos; os tipos visuais persistem nas regras versionadas existentes.
- Passageiros ficam ligados à venda/viagem; totais, datas e vínculos são
  conferidos após popular o banco descartável.
- Navegação por teclado e rótulos acessíveis são verificados nos fluxos
  alterados.
- Rodar apenas os gates locais focados autorizados; não publicar nem tocar
  qualquer ambiente remoto.

## Fora do escopo

- Alteração do motor de comissão ou recálculo de comissões históricas.
- Mudança para Travel Lite, unificação de bancos, migrations online, deploy,
  alterações de DNS ou limpeza de dados remotos.
- Criar passageiros/acompanhantes ou documentos que não existam no cenário.
- Expor configuração avançada de JSON para usuários da agência ou criar área
  de desenvolvedor para este recurso.
