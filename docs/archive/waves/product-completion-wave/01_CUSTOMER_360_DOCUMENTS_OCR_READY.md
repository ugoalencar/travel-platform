# STREAM 01 — CUSTOMER 360 + DEPENDENTES + DOCUMENTOS + OCR-READY

## Missão
Transformar o cadastro atual de cliente em um cadastro completo de viajante, adequado para agência de viagens e preparado para futura OCR documental.

## Funcionalidades obrigatórias

### Cadastro principal
Adicionar/validar:
- nome completo
- CPF
- RG / documento nacional
- data de nascimento
- nacionalidade
- telefone
- WhatsApp
- email
- observações internas

### Endereço
Estruturar:
- CEP
- logradouro
- número
- complemento
- bairro
- cidade
- estado
- país

### Dependentes / acompanhantes
Criar entidade tenant-safe relacionada ao cliente para:
- cônjuge
- filho(a)
- pai/mãe
- acompanhante
- outro

Campos mínimos:
- nome
- relação
- nascimento
- CPF quando aplicável
- nacionalidade
- observações

Evitar duplicar identidade quando a pessoa já existir como cliente real; documentar estratégia.

### Documentos
Criar estrutura própria para documentos do viajante.

Tipos iniciais:
- PASSAPORTE
- RG
- CNH
- CPF
- VISTO
- CERTIDAO
- OUTRO

Campos:
- document_type
- document_number
- issuing_country
- issuing_authority
- issue_date
- expiry_date
- holder_name
- nationality
- birth_date
- metadata segura
- status de verificação

### Imagens/arquivos
Permitir anexar:
- frente
- verso
- página do passaporte
- visto
- outros anexos

NÃO armazenar blob diretamente na tabela principal se a arquitetura já prevê storage.

Criar abstração de attachment/document storage compatível com:
- local dev
- object storage futuro

Guardar no DB apenas metadata/chave segura.

### Segurança documental
Documentos são dados sensíveis.

Obrigatório:
- tenant-scoped
- RBAC
- customer self-scope quando aplicável
- URLs não públicas por padrão
- sem log de número completo de documento
- mascaramento em listagens
- audit log para upload/view/delete
- soft delete ou política segura equivalente
- file type/size validation
- bloquear execução de arquivos
- não expor path local

### OCR-ready
NÃO implementar OCR final agora.

Preparar:

DocumentExtraction
- document_id
- provider
- extracted_data
- confidence
- processing_status
- processed_at

DocumentVerification
- cadastro vs documento
- name_match
- birth_date_match
- document_number_match
- nationality_match
- overall_status
- discrepancies

Fluxo futuro:
upload → OCR → extração → confronto → revisão humana

Criar provider abstraction para OCR sem escolher fornecedor definitivo.

### UI
Customer details deve ter seções/abas:
- Dados pessoais
- Endereço
- Dependentes
- Documentos
- Viagens
- Histórico

Documentos:
- upload
- preview seguro
- validade
- status
- futura verificação OCR

## Banco
Criar migration NOVA e aditiva.
Não editar migrations históricas.
Aplicar RLS/FORCE conforme padrão.

## Testes
CRUD customer
endereço
dependentes
documentos
upload metadata
tenant isolation
cross-customer denial
masking
audit
invalid file
expiry handling
OCR provider abstraction
verification comparison contract

## Final
TYPECHECK PASS
LINT PASS
TESTS PASS
SECURITY PASS
BUILD PASS
P0=0
P1=0
READY FOR PRODUCT INTEGRATION
