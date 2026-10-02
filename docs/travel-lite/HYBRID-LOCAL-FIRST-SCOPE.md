# Travel Lite — Escopo Híbrido Local-First

Status: próximo ciclo de produto após `0.1.0 Inicial`.

## Decisão De Produto

O caminho recomendado para o Travel Lite é um modelo local-first híbrido:

- banco e operação diária rodam localmente para fluidez;
- camada online valida licença, assinatura e saúde da instalação;
- backups criptografados sobem periodicamente;
- atualizações e migração para Full são preparadas pela camada online.

Esse modelo evita depender da internet para cada operação da agência, mas
mantém controle comercial, recuperação e evolução do produto.

## Componentes

### Instalação Local

- API Travel Lite.
- Frontend servido pela API.
- PostgreSQL local dedicado.
- Rotinas locais de backup e restore.
- Modo de funcionamento com internet instável.

### Controle Online

- Cadastro da instalação.
- Check-in periódico.
- Status da assinatura/licença.
- Bloqueio progressivo por inadimplência.
- Recebimento de backups criptografados.
- Canal de atualização.
- Inventário mínimo de versão instalada.

### Backup

Esta é uma falta da versão `0.1.0` e entra como obrigatório no híbrido.

Requisitos mínimos:

- botão ou área visível para o cliente gerar backup manual;
- agendamento automático;
- histórico de backups locais;
- envio periódico para armazenamento online;
- criptografia antes do envio;
- validação de integridade;
- rotina testável de restore;
- alerta quando backup online falhar.

### Licença E Pagamento

O bloqueio deve proteger o negócio sem sequestrar os dados do cliente.

Estados sugeridos:

| Estado | Comportamento |
| --- | --- |
| Ativo | Uso normal |
| Aviso | Mostrar pendência, manter uso |
| Restrito | Bloquear novas criações/edições, manter consulta, backup e exportação |
| Bloqueado crítico | Manter acesso mínimo aos dados, suporte e regularização |

## Regras De Segurança

- Nunca confiar em tenant enviado pelo frontend.
- Nunca enviar backup sem criptografia.
- Nunca bloquear acesso total aos dados como primeira reação comercial.
- Nunca misturar banco local do Lite com banco da plataforma Full.
- Check-in online não substitui autorização server-side local.

## Primeiras Entregas Recomendas

1. Tela local de Backup e Restore.
2. Geração manual de backup pelo cliente.
3. Manifesto de versão da instalação.
4. Check-in online sem bloqueio, apenas observabilidade.
5. Backup online criptografado.
6. Política de licença com modo aviso.
7. Modo restrito por inadimplência.
8. Canal de atualização versionado.
