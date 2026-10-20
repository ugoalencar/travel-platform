# ADR-FISCAL-001: Emissão de NFS-e das mensalidades via provedor de cobrança

**Status:** PROPOSTA (caminho escolhido pelo dono do produto em 2026-10-06; sujeita a validação com o contador)  
**Data:** 2026-10-06  
**Decisor:** Dono do produto + Arquiteto SaaS + Contador (a confirmar)  
**Relacionados:** `ADR-BILLING-001`

---

## Contexto

Cada mensalidade paga por uma agência é prestação de serviço e exige **NFS-e**.
Hoje o sistema não tem tabela, rota, tela nem documentação fiscal. O super admin
só lista faturas e pagamentos.

Contexto regulatório (a confirmar com o contador): a NFS-e de **padrão nacional**
passou a ser exigida a partir de 01/01/2026 para prestadores sujeitos ao ISS, e,
para ME/EPP do Simples Nacional, a emissão no padrão nacional (Portal Nacional ou
API) passa a ser obrigatória em **01/11/2026**.

Pré-requisitos de formalização da empresa vendedora (não são código): CNPJ ativo,
regime tributário, inscrição municipal, CNAE e código de serviço corretos,
certificado digital quando exigido pelo município, conta e habilitação fiscal no
provedor.

## Decisão

1. **Emitir pelo próprio provedor (Asaas)**, que documenta emissão automática de
   NFS-e para assinaturas (`POST /v3/subscriptions/{id}/invoiceSettings`, com
   `effectiveDatePeriod`, `municipalServiceId`/`municipalServiceCode` e bloco
   `taxes`; consulta de requisitos municipais em `GET /v3/fiscalInfo/municipalOptions`).
   Momento de emissão recomendado: **`ON_PAYMENT_CONFIRMATION`**.
2. **Interface `FiscalProvider`** própria (emitir, consultar, cancelar, baixar
   PDF/XML) com `AsaasFiscalProvider` e `LocalFiscalProvider` (testes). Permite
   trocar para emissor dedicado se a cobertura municipal falhar.
3. **Registro local `fiscal_documents`**, 1:1 com a fatura paga, com chave de
   idempotência por fatura; guarda número, status, link/arquivos e erro.
4. **Super admin ganha a área "Notas fiscais"** (ver spec): status de conexão
   fiscal, lista, detalhe, reprocessar erro, emitir avulsa, cancelar. Ações
   auditadas e restritas ao papel `BILLING_ADMIN`/`PLATFORM_OWNER`.
5. **Segredos** (API key do provedor, certificado) apenas em gestor de segredos;
   nunca em código, logs ou banco em texto claro.

## Consequências

- Menos integrações: cobrança e nota no mesmo fornecedor.
- Risco: cobertura de municípios e do Portal Nacional pelo provedor precisa ser
  **validada no sandbox e com o município da empresa** antes do go-live; a
  documentação consultada informa que, no Portal Nacional, usa-se
  `municipalServiceCode` em vez de `municipalServiceId`.
- A emissão automática de assinaturas só vale para **novas cobranças geradas pela
  recorrência**; notas já emitidas não são alteradas retroativamente.
- Prazo: a obrigatoriedade de 01/11/2026 torna esta frente **urgente** (≈ 4 semanas
  a partir da data deste ADR).

## Alternativas consideradas

| Alternativa | Observação |
|---|---|
| Emissor fiscal dedicado (ex.: Focus NFe) | Mais controle e cobertura; mais um contrato/integração. Fica como plano B pela mesma interface. |
| Emissão manual no Portal Nacional pelo contador | Serve para o primeiro cliente; não escala e deixa o super admin sem número/arquivo. |
