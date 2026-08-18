# LGPD - Lei Geral de Protecao de Dados

## O que e

A LGPD (Lei 13.709/2018) regula o tratamento de dados pessoais no Brasil.

## Dados pessoais no sistema

| Dado | Categoria | Finalidade | Base legal |
|------|-----------|------------|------------|
| Nome | Identificacao | Cadastro | Consentimento |
| Email | Contato | Comunicacao | Consentimento |
| CPF | Identificacao fiscal | Documentacao | Obrigacao legal |
| Telefone | Contato | Comunicacao | Consentimento |
| Passaporte | Identificacao | Viagem | Execucao de contrato |
| Endereco | Localizacao | Contato | Consentimento |

## Principios

1. Finalidade: dados coletados para fins especificos.
2. Adequacao: tratamento compativel com a finalidade.
3. Necessidade: coletar apenas o necessario.
4. Livre acesso: cliente pode consultar seus dados.
5. Qualidade: dados corretos e atualizados.
6. Transparencia: cliente sabe como dados sao usados.
7. Seguranca: protecao contra acessos indevidos.
8. Nao discriminacao: sem fins discriminatorios.

## Direitos do titular

| Direito | Implementacao futura |
|---------|----------------------|
| Acesso | Endpoint de perfil do cliente |
| Correcao | Endpoint de atualizacao de perfil |
| Eliminacao | Fluxo de exclusao ou anonimizacao |
| Portabilidade | Exportacao dos dados do titular |
| Revogacao de consentimento | Fluxo de revogacao registrado |

## Obrigacoes do controlador

### 1. Consentimento

```typescript
// Exemplo conceitual de formulario de registro.
<label>
  <input type="checkbox" name="consent" required />
  Li e aceito a Politica de Privacidade
</label>
```

### 2. Registro de operacoes

O V1 deve preservar campos operacionais como `createdAt`, `updatedAt`,
`deletedAt` e `status` nas entidades aplicaveis.

Uma trilha formal de auditoria para operacoes com dados pessoais continua sendo
requisito de seguranca, mas nao deve ser modelada como entidade de dominio V1 sem
decisao arquitetural propria.

### 3. Seguranca

- Senhas com algoritmo apropriado.
- Dados sensiveis protegidos conforme classificacao.
- Acesso restrito por role e tenant.
- Operacoes relevantes registradas em trilha de auditoria aprovada.

### 4. Relatorio de impacto

Para alta sensibilidade de dados:

- mapear os dados coletados;
- identificar riscos;
- definir medidas de mitigacao;
- revisar periodicamente.

## Exclusao de conta

```typescript
// DELETE /minha-conta
async function deleteAccount(userId: string) {
  // 1. Soft delete do usuario.
  await prisma.user.update({
    where: { id: userId },
    data: { status: 'INACTIVE', deletedAt: new Date() },
  });

  // 2. Anonimizar dados pessoais quando aplicavel.
  await prisma.customer.updateMany({
    where: { userId },
    data: {
      name: 'REMOVIDO',
      email: null,
      cpf: null,
      phone: null,
    },
  });

  // 3. Registrar a operacao em trilha de auditoria futura aprovada
  // pela arquitetura de seguranca.
}
```

## Checklist LGPD

- [ ] Politica de privacidade publicada.
- [ ] Consentimento coletado.
- [ ] Dados minimizados.
- [ ] Trilha de auditoria definida quando aplicavel.
- [ ] Criptografia em transito e repouso avaliada.
- [ ] Direitos do titular implementados.
- [ ] Encarregado designado (DPO), quando aplicavel.
- [ ] Relatorio de impacto, quando aplicavel.
