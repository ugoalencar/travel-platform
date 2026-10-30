# Travel Lite / Gadotti - apresentacao e homologacao

Data de preparacao: 22/10/2026. Roteiro proposto, ainda nao executado com a cliente.
Nao compartilhar este roteiro como certificado de que todos os testes passaram.

## Antes da reuniao

- Validar login do demo e a autorizacao de acesso a previa, sem usar Patricia.
- Demo: https://travellite.travelplataforma.com.br (publicado/verificado em 23/10/2026).
- Cliente: https://gadotti.travelplataforma.com.br. Ambos usam login do sistema;
  nao exigem compartilhar conta pessoal Vercel do fornecedor.
- Usar somente dados ficticios identificados como demonstracao.
- Nao inserir testes no ambiente /gadotti nem gerar pagamento real.
- Conferir senha do demo no documento local exclusivo, sem projetar senhas,
  Bitwarden, tokens, documentos financeiros ou dados reais na tela.
- Preparar uma conta ficticia de gestor e outra de vendedor com acesso limitado.
  Esta instrucao nao significa que novas contas tenham sido criadas agora.

## Sequencia da apresentacao

1. Explicar que e uma entrega parcial em homologacao, com escopo de piloto.
2. Mostrar clientes e preenchimento por CEP; alterar CEP e conferir novo endereco.
3. Mostrar vendedor, categoria de venda e uma regra padrao de comissao.
4. Mostrar regra progressiva e a memoria de calculo com exemplo conferido.
5. Criar rascunho com cliente ficticio, vendedor, categoria, custo e parcelas.
6. Conferir margem e confirmar venda; abrir detalhe e contas a receber.
7. Mostrar recebimento parcial e efeito na liberacao da comissao ON_RECEIPT.
8. Aprovar comissao e pagar somente valor liberado; quitar e rejeitar duplicidade.
9. Entrar como vendedor ficticio e mostrar que nao acessa administracao/financeiro
   sem concessao. Nao usar o perfil gestor para demonstrar restricoes do vendedor.
10. Mostrar relatorios e reconciliar uma venda com financeiro/comissao.
11. Explicar limites atuais de cancelamento, estorno e ajuste de aprovada.
12. Registrar decisoes pendentes e combinar treinamento e aceite operacional.

## Exemplo financeiro para conferir na demonstracao

Venda ficticia: R$ 1.000,00; custo R$ 700,00; margem R$ 300,00.
Regra percentual simples de 10% sobre bruto: comissao R$ 100,00.
Duas parcelas de R$ 500,00. Forma com recebimento exigido: primeiro recebimento
libera R$ 50,00 de comissao; segundo completa R$ 100,00. Essa regra simples e
separada da demonstracao progressiva para evitar ambiguidade de calculo.
Nao interpretar baixa manual como confirmacao bancaria automatica.

## Registro de homologacao

Estado inicial de TODOS os itens abaixo: nao executado com a cliente.
Preencher resultado, evidencia, executor e data. Bloqueio financeiro ou de
isolamento de acesso impede aceite; nao marcar sucesso com base apenas em print.

| ID | Cenario | Criterio de aceite |
| --- | --- | --- |
| H01 | Acesso independente | Usuario autorizado chega ao login sem conta pessoal do fornecedor |
| H02 | Primeiro acesso | Patricia troca a propria senha; fornecedor nao escolhe nem conhece a senha definitiva |
| H03 | Funcionarios | Acesso a vendas/clientes conforme carteira decidida; financeiro/usuarios bloqueados |
| H04 | Delegacao | Patricia concede e revoga permissao; efeito conferido em outra sessao sintetica |
| H05 | Cliente/CEP | Buscar, trocar CEP, tratar CEP invalido e salvar endereco correto |
| H06 | Venda | Criar, reabrir, conferir custo/margem e confirmar sem erro |
| H07 | Parcelas | Soma das parcelas corresponde ao total e aparece nos relatorios |
| H08 | Comissao padrao | Percentual/fixo e base bruto/margem conferidos manualmente |
| H09 | Progressiva | Limites das faixas, vigencia e total/excedente conferidos com exemplos aprovados |
| H10 | Recebimento | Baixa parcial libera somente proporcao devida quando configurado |
| H11 | Pagamento | Parcial nao quita; total quita; duplicidade rejeitada |
| H12 | Estorno | Operacao incompatível com comissao ja paga e bloqueada, sem movimentacao parcial |
| H13 | Auditoria | Identificar funcionario e recuperar antes/depois da alteracao; pendente de complemento |
| H14 | Recuperacao de senha | E-mail chega a conta de teste; link unico/expiracao e login conferidos |
| H15 | Dados iniciais | Cliente aprova carteira, vendedores, valores e saldos importados |
| H16 | Encerramento | Logout invalida sessao; usuario desativado perde acesso |
| H17 | Continuidade | Backup, restauracao e contatos de incidente aprovados com evidencia |

H02 acontece somente na entrega autorizada a Patricia, nao no ensaio.
Testes de estorno, regras e permissao sao no demo; nao testar dinheiro real.

## Decisoes a recolher

- Prefixo desejado para venda e numero inicial, preservando numeros existentes.
- Carteira: funcionario ve todos os clientes/vendas ou somente os proprios?
- Quem pode receber, pagar, aprovar comissao e gerenciar regras?
- Bases, categorias, faixas, vigencia e criterio financeiro global de comissao.
- Quais pendencias impedem a cliente de iniciar e quais podem ir para outra fase?
- Responsavel de homologacao, treinamento, canal de suporte e datas do piloto.

## Resultado da reuniao

Data: ____________________ Responsavel cliente: ____________________
Itens aprovados: __________________________________________________
Itens reprovados e evidencias: _____________________________________
Decisoes e responsaveis: ___________________________________________
Situacao: [ ] Somente demonstracao [ ] Homologacao [ ] Piloto autorizado
Liberacao operacional depende do parecer interno e dos bloqueios resolvidos.
