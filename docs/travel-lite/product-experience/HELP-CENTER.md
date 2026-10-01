# Travel Lite — Help Center

## Objetivo

Reduzir integração humana e suporte repetitivo. A área de ajuda deve ensinar o uso do Lite dentro do próprio produto, com exemplos preenchidos, respostas rápidas e orientação contextual por tela.

## Escopo funcional

- Rota principal: `/ajuda`.
- Link fixo no topo do app para qualquer usuário autenticado.
- Conteúdo organizado por área: Dashboard, Clientes, Vendas, Importação, Financeiro, Comissões, Vendedores, Configurações e Permissões.
- Cada área deve explicar:
  - para que serve;
  - campos obrigatórios;
  - exemplo preenchido;
  - erros comuns;
  - quem tem permissão para executar a ação.
- A ajuda deve ter busca simples e FAQ.
- A ajuda deve citar quando uma função pertence ao Lite, Pro ou Full, sem poluir a experiência principal.

## Padrão de conteúdo

Cada artigo deve seguir este formato:

1. O que esta tela resolve.
2. Quando usar.
3. Exemplo prático com dados preenchidos.
4. Passo a passo curto.
5. Permissões necessárias.
6. O que fazer se algo não aparecer.

## Primeiras telas obrigatórias

- Clientes: cadastro simples, responsável, CPF e contato.
- Vendas: rascunho, confirmação, custos, parcelas e cancelamento.
- Financeiro: receber, pagar, estornar e consultar saldos.
- Importação: upload, mapeamento de colunas, dry-run e confirmação.
- Comissões: pendente, aprovada e paga.
- Configurações: usuários, permissões, identidade visual e dashboard.

## Estados esperados

- Usuário sem permissão: explicar por que a área não aparece.
- Base vazia: apontar para o primeiro cadastro recomendado.
- Erro de validação: explicar como corrigir os campos.
- Importação com pendências: explicar reconciliação linha a linha.

## Fora do escopo imediato

- Chatbot.
- Conteúdo remoto editável por CMS.
- Vídeos hospedados.

## Critérios de aceite

- Um usuário MASTER consegue entender a sequência inicial sem suporte humano.
- Um usuário SELLER consegue cadastrar cliente e consultar dashboard pelo conteúdo de ajuda.
- Artigos não expõem segredos, dados reais ou detalhes internos de banco.
