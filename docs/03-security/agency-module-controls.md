# Controles de módulos por agência

## Limites de acesso

O catálogo de módulos é uma restrição adicional por agência, independente de
papel do usuário, concessões de área e entitlements do plano. O acesso efetivo
exige que todas essas camadas permitam a operação. A interface oculta menus e
bloqueia deep links; a API verifica a configuração no hook autenticado depois
de estabelecer o tenant. A interface não é uma fronteira de segurança.

## Estado e preservação

Os módulos opcionais não têm linha de configuração enquanto usam o padrão
habilitado. Isso mantém as agências existentes e novas compatíveis com o
comportamento atual. Desativar um módulo grava somente um override, conserva
seus dados e bloqueia as rotas atribuídas. Reativar recupera o acesso. Nenhuma
rotina de processamento financeiro ou histórico é removida por essa opção.

As dependências são verificadas dentro de transação serializada por agência.
Um módulo usado como pré-requisito não pode ser desativado enquanto houver
dependente ativo. A ativação também exige pré-requisitos ativos e entitlement
quando o catálogo do módulo o declara.

## Auditoria e banco

Cada mudança real de estado registra um evento obrigatório de auditoria na
mesma transação, com módulo, valor anterior, novo valor e dependências. A tabela
de overrides aplica RLS forçada por agência, não concede DELETE ao runtime e
está incluída no backup/restauração operacional da agência. Nenhuma identidade
ou credencial de usuário é exportada por causa do campo `updated_by`.

## Manutenção do catálogo

Ao criar ou alterar uma rota, classifique-a como núcleo ou módulo opcional no
catálogo `services/api/src/agency-modules.ts`. Prefira prefixos específicos;
prefixos amplos podem bloquear funcionalidades essenciais que compartilham o
mesmo domínio. Amplie `services/api/tests/agency-modules.test.ts` e testes HTTP
para validar a propriedade de rotas, as dependências e o bloqueio server-side.
