# STREAM 02 — OFERTAS & MARKETING COMPLETAMENTE EDITÁVEL

## Missão
Transformar Ofertas & Marketing de telas passivas/protótipo em módulo operacional real.

## Áreas
- Ofertas
- Creative Studio
- Templates
- Editor criativo
- Campanhas
- Publicações
- Automações
- Cupons
- integração com Pescador

## Regra principal
Tudo que aparece como entidade gerenciável precisa ter fluxo real:
LISTAR
CRIAR
ABRIR
EDITAR
SALVAR
DUPLICAR quando fizer sentido
ARQUIVAR/EXCLUIR com segurança

Nada de telas somente leitura sem justificativa.

## Ofertas
CRUD real:
- título
- destino
- descrição
- preço base
- moeda
- validade
- datas
- origem
- hotel
- transporte
- inclusões
- exclusões
- condições
- imagens
- status
- tags/categorias

Ofertas podem nascer de:
- criação manual
- Pescador revisado

## Templates
Criar/editar/duplicar/pré-visualizar/ativar-desativar.

## Creative Studio / Editor
Montar material a partir de oferta:
- selecionar oferta
- template
- imagem
- título
- subtítulo
- preço
- CTA
- textos
- campos dinâmicos

Não precisa ser um Canva completo; precisa ser funcional/editável.

## Campanhas
CRUD real:
- nome
- período
- ofertas
- canais
- status
- público/segmento se já suportado
- observações

## Publicações
Rascunho/publicação com:
- campanha
- oferta
- canal
- conteúdo
- status
- scheduled_at
- published_at

Integrações externas podem ficar provider-based se não houver credenciais.

## Automações
Se a área existir:
- trigger
- condição
- ação
- enabled
Sem fingir integração externa.

## Cupons
CRUD:
- código
- tipo
- valor/percentual
- validade
- uso máximo
- oferta/campanha
- ativo

## Pescador
Manter captura separada de Offer.
Fluxo:
URL → captura → revisão → criar oferta.
Não publicar automaticamente.

## UX
Toda tela:
botão principal
formulário
validação
feedback
loading
empty state
cancel
edição
persistência real

## Testes
CRUD
RBAC
tenant isolation
persistence
duplicate submit
validation
archive
cross-tenant
frontend human-like tests

## Final
P0=0
P1=0
READY FOR PRODUCT INTEGRATION
