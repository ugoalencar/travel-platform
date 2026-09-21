# Travel Platform — Runbook de Migração de Dados do Piloto

**Status:** PRONTO PARA EXECUÇÃO  
**Data:** 2026-09-20  
**Responsável:** Equipe Travel Platform  
**Ambiente:** PILOT (Supabase + Railway/Render)

---

## PREREQUISITOS

- [ ] Projeto Supabase PILOT criado (região Brasil)
- [ ] Role `travel_app_runtime` criada (não-superuser, sem BYPASSRLS)
- [ ] Migrations 001-081 aplicadas
- [ ] Upstash Redis provisionado
- [ ] API deployed e acessível
- [ ] Variáveis de ambiente configuradas
- [ ] CI verde (npm run lint, typecheck, test, build)

## PASSO 1: PREPARAR DADOS DA AGÊNCIA PILOTO

### 1.1 Receber Planilhas

Solicitar à agência piloto:
- Planilha de clientes (CSV ou XLSX)
- Planilha de fornecedores (CSV ou XLSX)
- Qualquer outro dado relevante

### 1.2 Analisar Estrutura

Para cada planilha:
1. Abrir e verificar colunas
2. Identificar campos obrigatórios mapeáveis
3. Identificar colunas para ignorar
4. Verificar encoding (UTF-8 preferido)
5. Verificar delimitador (CSV)
6. Contar linhas totais

### 1.3 Mapear Campos

Exemplo para clientes:

| Coluna Planilha | Campo Travel Platform | Obrigatório? |
|---|---|---|
| Nome Cliente | name | ✅ SIM |
| E-mail | email | Não |
| Celular | phone | Não |
| WhatsApp | whatsapp | Não |
| CPF | cpf | Não |
| Data Nascimento | birth_date | Não |
| Nacionalidade | nationality | Não |
| Observações | notes | Não |

## PASSO 2: IMPORTAR VIA UI

### 2.1 Acessar Centro de Implantação

1. Login como OWNER/Admin da agência piloto
2. Navegar para: Configurações → Implantação e Dados
3. Clicar: [Importar Dados]

### 2.2 Upload

1. Selecionar arquivo (CSV/XLSX)
2. Selecionar tipo: "Clientes"
3. Clicar: [Enviar]

### 2.3 Mapeamento

1. Verificar colunas detectadas
2. Mapear cada coluna para o campo correto
3. Ignorar colunas irrelevantes
4. Salvar como template (opcional): "Planilha Agência Piloto"
5. Clicar: [Próximo]

### 2.4 Dry Run

1. Verificar resultado:
   - Total de linhas
   - Válidas
   - Warnings
   - Errors
2. Revisar examples
3. Se houver errors, corrigir planilha e recomeçar
4. Clicar: [Confirmar Importação]

### 2.5 Validação

1. Verificar totais na tela de status
2. Navegar para lista de clientes
3. Verificar primeiros registros importados
4. Verificar que agency_id está correto (RLS)
5. Verificar que nenhum dado de outra agência aparece

## PASSO 3: IMPORTAR FORNECEDORES

Repetir passo 2 com tipo "Fornecedores".

## PASSO 4: VALIDAÇÃO COM A AGÊNCIA

1. Agendar call com responsável da agência
2. Mostrar dados importados
3. Solicitar confirmação
4. Registrar feedback
5. Ajustar se necessário

## PASSO 5: DOCUMENTAR

1. Registrar import_job_id
2. Documentar source_system: "PlanilhaAgênciaPiloto"
3. Documentar external_id mapping
4. Salvar cópia da planilha original (Storage privado)

---

## TROUBLESHOOTING

### Erro: "File too large"
- Planilha excede 10MB
- Dividir em múltiplos arquivos

### Erro: "Invalid CSV format"
- Verificar encoding (salvar como UTF-8)
- Verificar delimitador (vírgula vs ponto e vírgula)

### Erro: "Required field not mapped"
- Campo obrigatório não está mapeado
- Mapear coluna correspondente ou adicionar na planilha

### Erro: "Duplicate detected"
- Cliente com mesmo email/cpf já existe
- Revisar duplicatas na tela de preview
- Decidir: ignorar ou atualizar

### Erro: "RLS policy violation"
- agency_id não está sendo definido corretamente
- Verificar se tenant context está ativo
- Contatar suporte técnico

---

## CONTATO SUPORTE

- **Dúvidas técnicas:** Equipe Travel Platform
- **Dúvidas de dados:** Responsável da agência
- **Emergências:** Escalar para PLATFORM_ADMIN
