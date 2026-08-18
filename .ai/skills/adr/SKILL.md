# ADR (Architecture Decision Record) Skill

## Descricao

Skill para criar e documentar decisoes arquiteturais importantes.

## Quando usar

- Mudanca arquitetural significativa
- Trade-off entre solucoes
- Decisao que afeta multiplos componentes
- Decisao que pode gerar duvidas futuras

## Regra obrigatoria

Se uma decisao arquitetural for necessaria, registrar um ADR.

O agente nao deve:

- criar ADR diretamente como `Aceito` sem decisao explicita;
- inventar decisao arquitetural;
- alterar ADR existente para acomodar codigo ja implementado;
- usar ADR para justificar retrospectivamente uma mudanca nao autorizada.

## Fonte oficial

A referencia oficial para formato, status e processo de novos ADRs e:

- `docs/01-architecture/decisions.md`

Nao criar outro template concorrente.

## Formato de ADR

```markdown
# ADR-XXX: [Titulo da decisao]

## Status

Proposto

## Contexto

Explicar a situacao que requer decisao.

## Decisao

Qual decisao esta sendo proposta?

## Alternativas consideradas

Outras opcoes consideradas e por que foram rejeitadas.

## Seguranca

Impactos de seguranca, quando aplicavel. Se nao houver, registrar "Nao aplicavel".

## Consequencias

Quais sao as consequencias dessa decisao?
- Positivas
- Negativas
- Trade-offs

## ADRs relacionados

Links para ADRs relacionados. Se nao houver, registrar "Nenhum".
```

## Status oficiais

- Proposto: decisao ainda em avaliacao.
- Aceito: decisao aprovada e vigente.
- Aceito — Temporário: decisao vigente, mas com revisao futura obrigatoria.
- Substituído: decisao substituida por outro ADR.
- Depreciado: decisao ainda registrada, mas nao recomendada para novas implementacoes.
- Rejeitado: proposta analisada e nao adotada.

## Processo

1. Identificar decisao arquitetural.
2. Criar arquivo em `docs/adr/` seguindo o identificador definido pelo projeto.
3. Preencher o formato oficial com status inicial `Proposto`.
4. Revisar com o time.
5. Atualizar o status somente apos decisao explicita.
6. Implementar seguindo a decisao aprovada.
7. Referenciar ADR em PRs relevantes.

## Exemplos de decisoes

- Tecnologia, framework ou biblioteca
- Padrao arquitetural
- Autenticacao ou autorizacao
- Data storage
- Cache strategy
- API design
- Testing strategy

## Verificacoes

- [ ] ADR criado quando necessario
- [ ] Fonte oficial seguida
- [ ] Status inicial `Proposto`
- [ ] Contexto e decisao claros
- [ ] Alternativas consideradas
- [ ] Impactos de seguranca avaliados
- [ ] Consequencias documentadas
- [ ] ADRs relacionados informados quando aplicavel
