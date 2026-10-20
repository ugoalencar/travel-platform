# PX4 — Mobile e PWA do Travel Lite (primeira camada)

- **Data/hora:** 2026-10-01 23:46
- **Prompt:** `.claude/NEXT-PROMPT-PX4-MOBILE-PWA.md`
- **Onde:** checkout principal `D:\travel-platform`, branch nova `feature/px4-mobile-pwa` (criada a partir da `main` em `78fe7bb`). Só frontend, em `apps/travel-lite`.
- **Estado:** implementado e verificado. **Nada commitado, enviado ou publicado.**

## 1. Auditoria do estado anterior (por leitura do código)

| Ponto | Achado |
|---|---|
| Responsividade | **Nenhuma regra `@media`** em `styles.css` (681 linhas). Menu lateral fixo de 210 px, topo com nome, perfil, Ajuda e Sair em linha, formulários em grade de colunas de 190 px e tabelas só com rolagem horizontal |
| Cadastro de cliente | Formulário com 16 campos, todos visíveis; só o nome é obrigatório |
| Listas de clientes e vendas | Tabelas largas (7 e 8 colunas), sem leitura em tela estreita |
| Dashboard | Checklist, KPIs, gráficos e ranking empilhados sem priorização |
| PWA | Sem `manifest`, sem service worker, sem ícones, sem pasta `public/`; só havia `<meta viewport>` |
| Servidor estático | O `api-lite` serve `dist/` (leitura de `src/static.ts`): `manifest.json` sai como `application/json`, `sw.js` como `text/javascript` e ícones como `image/png`, todos com `no-cache`, sem exigir mudança de backend |

A linha de base veio da leitura do código; não tirei capturas "antes".

## 2. O que foi implementado

### Navegação e layout (CSS + estado mínimo)
- **Menu em gaveta** abaixo de 820 px: botão ☰ no topo (`aria-expanded`, `aria-controls`, rótulo "Abrir/Fechar menu"), fundo escurecido, fecha ao escolher um item, com Esc ou tocando fora. No desktop o botão fica oculto e o menu continua fixo.
- **Topo** fixo e compacto no celular (nome truncado, perfil oculto em telas muito estreitas), com **Ajuda** e Sair sempre à vista: a ajuda é acessível no celular.
- **Alvos de toque** de ~44 px (botões, itens do menu, campos) e **campos com 16 px** para o iOS não dar zoom ao focar.
- Formulários em coluna única; barras de busca ocupando a largura toda.
- Sem rolagem horizontal da página em 375 px.

### Dashboard resumido
KPIs em 2 colunas e o checklist primeiro. Gráficos e ranking ficam recolhidos no celular, atrás do botão **"Ver gráficos e rankings"** (`aria-expanded`). No desktop o botão não aparece e tudo continua visível.

### Cadastro rápido de cliente
- **Botão flutuante "+ Cliente"** em todas as telas para quem tem `customers.create`. Leva a `/clientes?novo=1`, que abre o formulário uma vez e limpa o parâmetro. Quem não pode criar não vê o botão, e `?novo=1` é ignorado.
- **Formulário rápido:** no celular, ao criar, aparecem só **Nome, Telefone e E-mail** (só o nome é obrigatório), com o botão **"Mais campos"** para o restante. Ao editar, o formulário vem completo. No desktop nada muda.

### Consulta de clientes e vendas
As listas de **Clientes** e **Vendas** viram **um cartão por registro** abaixo de 640 px (título em destaque, rótulo e valor por linha, botões de ação à direita), usando `data-label` nas células. O cabeçalho continua na árvore de acessibilidade (só sai do layout). O escopo continua sendo do servidor: a interface **não** adiciona filtro de vendedor ou tenant a nenhuma requisição.

### PWA básico
- `public/manifest.json`: nome, `start_url` e `scope` `/`, `display: standalone`, `pt-BR`, cores, ícones 192, 512 e **maskable** 512, e atalhos (**Novo cliente**, **Vendas**, **Ajuda**).
- `public/icons/*.png`: 3 ícones PNG gerados por script (identidade provisória, um "T" branco sobre o azul padrão; trocar pelo logo oficial quando houver).
- `index.html`: link do manifest, `theme-color`, `viewport-fit=cover` (área segura do iPhone), `apple-touch-icon` e metas de app instalado.
- **Service worker `public/sw.js`, só do shell do app:** guarda o HTML base, os arquivos de `/assets/` e `/icons/` e o manifest, para o app instalado abrir rápido e mostrar o shell sem rede (navegação "rede primeiro", shell em cache só como contingência offline).
  - **Nunca toca em `/api/*`**: nada de dados de negócio, token ou resposta por tenant é guardado ou respondido pelo worker. Escritas (não GET) e outras origens são ignoradas, então um logout não deixa nada para trás e nada de um usuário pode ser servido a outro.
  - Não guarda resposta que não seja bem-sucedida, nem a que seja HTML quando o pedido era de um arquivo estático (veja o risco corrigido abaixo).
  - Limpa só os caches antigos do próprio app.
- `src/pwa.ts` registra o worker **apenas em produção**; a cor do tema do app instalado acompanha a cor primária da agência (branding do PX2).

### Risco encontrado e corrigido durante o trabalho
O servidor devolve o `index.html` com **200** para qualquer caminho desconhecido (fallback de SPA). Com cache primeiro, um arquivo de `/assets/` que sumiu depois de um deploy poderia ser guardado como o HTML do shell e depois servido como se fosse o script, quebrando o app. O worker agora recusa guardar HTML sob URL de arquivo estático, com teste (a mutação que remove a guarda faz o teste falhar).

## 3. Testes

| Suíte | Resultado |
|---|---|
| `src/mobile.test.tsx` (novo) | **13 testes**: gaveta (fechada de início, abre, fecha ao navegar, com Esc e no fundo, Ajuda no topo, só os menus permitidos), botão "+ Cliente" (só para quem cria, abre o formulário e limpa o parâmetro, ignora `?novo=1` sem permissão), formulário rápido (só nome/telefone/e-mail, "Mais campos", edição abre completo), cartões de clientes e vendas (rótulos, sem filtros de vendedor ou tenant), resumo do dashboard |
| `src/pwa.test.ts` (novo, ambiente node) | **12 testes**: manifest (instalável, standalone, ícones PNG reais com as dimensões declaradas, maskable, atalhos internos), `index.html`, e o **service worker executado num contexto simulado** (precache, limpeza só dos próprios caches, API nunca interceptada nem guardada, inclusive em navegação direta, escritas e outras origens ignoradas, cache-first de assets só com respostas válidas e nunca HTML, rede primeiro com contingência offline, shell não sobrescrito por resposta ruim) |
| `src/App.test.tsx` | 2 testes ajustados: a lista de links agora inclui o botão "+ Cliente" |
| Total do app | **67/67** (eram 42 no início da fase) |

**Os testes de segurança protegem de verdade** (mutação temporária, revertida): remover a guarda de `/api` do worker derruba 2 testes; mostrar o "+ Cliente" para qualquer um derruba o teste de permissão; permitir guardar HTML como asset derruba o teste de assets.

## 4. Gates

`npx turbo run lint typecheck test build --filter=@travel-platform/travel-lite --force`: **4/4 tarefas OK**, lint com 0 erros (4 warnings `react-refresh` que já existiam). `dist/` gerado com `index.html`, `manifest.json`, `sw.js`, `icons/` e `assets/`. O `api-lite` **não foi alterado**, então não entrou nos gates.

## 5. Verificação visual (navegador do app, 375×812)

App em desenvolvimento contra uma **API de mentira local com dados fictícios** (sem credenciais reais, nenhum banco tocado; servidores encerrados e `localStorage` limpo).

- Dashboard: topo com ☰, KPIs em 2 colunas, "Ver gráficos e rankings" (detalhes ocultos e depois abertos), botão "+ Cliente".
- **Gaveta:** abre (`left: 0`), fundo escurecido de tela cheia, `aria-expanded` atualizado, itens de 47 px; **fecha sozinha ao navegar**.
- **Clientes:** cartões legíveis, tabela com `display: block`, cabeçalho recolhido, sem rolagem horizontal.
- **Cadastro rápido** pelo "+ Cliente": só Nome, Telefone, E-mail; campos de 44 px e 16 px; o parâmetro `?novo=1` some da URL.
- `/ajuda`, `/` e `/vendas` sem rolagem horizontal (largura da página = 375).
- **Desktop (1280 px):** menu fixo de 210 px, sem botão de gaveta, sem botão flutuante, sem "Mais campos", **todos os campos do formulário visíveis**, tabela normal com cabeçalho. Nenhuma regressão.
- As capturas de tela do painel falharam por tempo algumas vezes e uma saiu em blocos repetidos (falha do painel, não do app); repeti e conferi o resto por medidas do próprio navegador.

## 6. Limites e riscos

1. **Sem aparelho real nem iOS.** Não testei em celular de verdade, Safari, nem a instalação do app na tela inicial. O critério de instalabilidade do Chrome (Lighthouse) não foi medido.
2. **O service worker só roda no build de produção** e só foi exercitado num contexto simulado, não num navegador real; o registro não foi testado ponta a ponta. O servidor estático foi verificado pela leitura do código, não rodando a API servindo o `dist/`. Fazer um teste de instalação num deploy de homologação antes de divulgar.
3. **Offline é só o shell:** sem rede o app abre, mas as chamadas à API falham (mensagens de erro normais). Não existe fila de escrita offline, e isso é intencional nesta fase.
4. **O botão "+ Cliente" fica sobre o fim da tela:** o conteúdo tem 5 rem de folga embaixo, mas ao rolar ele pode cobrir os botões do último cartão. Pode ser escondido em `/clientes` (onde já há "Novo cliente") se incomodar.
5. **Dashboard recolhido é uma decisão de produto:** no celular, gráficos e ranking ficam atrás de um botão. Se o piloto preferir tudo aberto, é trocar o valor inicial de `showDetails`.
6. **Telas de 641 a 820 px** (tablet em pé) usam a gaveta, mas as tabelas continuam em formato de tabela com rolagem; só abaixo de 640 px viram cartões.
7. **Ícones provisórios** (gerados por script). O app instalado traz o nome "Travel Lite"; manifest por agência (nome e logo do tenant) não foi feito.
8. As listas de **comissões, financeiro, importações e cadastros** não viraram cartões (fora do pedido); continuam com rolagem horizontal.
9. Sem push, sem app nativo, como pedido.

## 7. Confirmações

- Não li `.env`; não acessei produção nem staging; não rodei migrations nem Prisma; não instalei dependências.
- Sem alteração de backend, de permissões ou de isolamento por tenant. **SELLER continua vendo apenas o que a API entrega** (`read_own`); a camada mobile não envia filtro algum de vendedor ou tenant (há teste).
- Alterações só em `apps/travel-lite` (11 arquivos modificados ou novos, mais a pasta `public/`).
- **Sem commit, push, PR ou merge.**

## 8. Próximos passos

1. **Decisão:** autorizar o commit do PX4 na branch `feature/px4-mobile-pwa` (e depois PR e merge).
2. Subir num ambiente de homologação e testar **num celular real** (Android e iPhone): navegação, cadastro rápido, instalar na tela inicial e abrir sem rede.
3. Trocar os ícones pelo logo oficial; avaliar o manifest por agência com o branding do PX2.
4. Se aprovado, estender os cartões a comissões e financeiro.
