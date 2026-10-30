# Escopo do Produto

## Diretriz vigente: Full primeiro, Lite como subconjunto

Decisao aprovada pelo responsavel pelo produto em 2026-10-23:
**toda funcionalidade implantada no Lite deve existir e estar validada no
Travel Platform Full antes de ser disponibilizada no Lite**. O Full pode
possuir funcionalidades adicionais; isso nao amplia automaticamente o Lite.

A regra vale para novas funcionalidades e evolucoes funcionais, incluindo
regras de negocio, comissoes, financeiro, relatorios, permissoes e fluxos de
cadastro. Diferencas de interface, marca e infraestrutura nao exigem produtos
identicos nem autorizam alteracoes arquiteturais por si so.

Para concluir qualquer entrega funcional no Lite:

- Identificar a implementacao equivalente no Full, com arquivos e testes.
- Implementar e validar primeiro no Full o que estiver ausente ou incompleto.
- Validar o recorte Lite, preservando regras, autorizacao e isolamento.
- Registrar evidencias e atualizar a documentacao dos dois produtos afetados.
- Manter acesso remoto, migracoes e deploy sujeitos a autorizacao especifica.

Divergencias anteriores devem ser inventariadas e corrigidas mediante escopo
aprovado, sem excluir funcionalidades, dados ou historico do Lite para obter
paridade artificial. Qualquer excecao depende de decisao humana explicita.

Detalhamento: [DEC-007](../decisions/DEC-007-full-first-lite-parity.md).
Vistoria inicial: [paridade Full/Lite](../travel-lite/FULL-LITE-PARITY-AUDIT-2026-10-23.md).
Ordem de regularizacao e responsabilidades:
[plano Full/Lite](FULL-LITE-ALIGNMENT-PLAN.md).

As secoes de MVP abaixo preservam o escopo historico; nao substituem esta
diretriz de evolucao dos produtos.

## MVP (v1.0)

### Incluído no MVP

| Módulo | Funcionalidades |
|--------|-----------------|
| **Auth** | Login, registro de agência, forgot password |
| **Agencies** | Perfil, configurações, plano |
| **Users** | CRUD, roles (Owner, Admin, Agent) |
| **Customers** | CRUD, busca, histórico |
| **Brokers** | CRUD, comissão padrão |
| **Trips** | CRUD, disponibilidade, preços |
| **Offers** | Criar ofertas com desconto, validade |
| **Sales** | Registrar venda, status, relatório básico |
| **Dashboard** | Métricas principais |

### Não incluído no MVP (v2+)

- Pagamentos integrados (Stripe, Mercado Pago)
- Passagens aéreas
- Hotéis e hospedagens
- Sistema de avaliação
- App mobile nativo
- Integração com ERPs
- Multi-idioma
- Marketplace entre agências

## Restrições

| Restrição | Detalhe |
|-----------|---------|
| Tenant | 1 agência = 1 tenant isolado |
| Plano FREE | Limitado a 50 clientes, 10 viagens |
| Upload | Máximo 5MB por arquivo |
| API | Rate limit 100 req/min por agência |

## Fora de Escopo

- Processamento de pagamentos
- Emissão de passagens
- Reserva de hotéis
- Seguros de viagem
- Vistos e documentação
