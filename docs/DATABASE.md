# Modelo de dados da Edvânia

## Princípio de isolamento

Cada registo comercial pertence a uma loja através de `store_id`. A associação entre utilizador e loja vive em `store_memberships`, com papéis `owner`, `admin`, `manager` e `employee`. As políticas RLS verificam a associação activa e limitam operações por papel. A criação de uma loja é feita pelo utilizador autenticado e a primeira associação deve atribuir-lhe o papel `owner`.

Apenas o proprietário pode gerir as associações e papéis de equipa nesta fase inicial. Isto evita que um administrador se eleve a proprietário. A gestão de equipa será exposta por operações de backend com autorização explícita.

## Domínios

| Domínio | Tabelas |
|---|---|
| Identidade e tenancy | `user_profiles`, `stores`, `store_memberships` |
| Geografia angolana | `angola_provinces`, `angola_municipalities` |
| Catálogo | `categories`, `products` |
| Inventário | `inventory_locations`, `inventory_movements`, vista `inventory_balances` |
| Relações comerciais | `customers`, `suppliers` |
| Vendas | `sales`, `sale_items` |
| Financeiro | `payments`, `expenses`, `cash_registers`, `cash_sessions`, `cash_movements` |
| Pagamentos nacionais | `proxypay_payments`, `webhook_events` |
| WhatsApp | `whatsapp_connections`, `baileys_auth_state`, `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_jobs`, `whatsapp_outbox` |
| Plataforma | `ai_usage_logs`, `automations`, `audit_logs` |

## Regras críticas

- Valores monetários são `numeric(14,2)` e a moeda inicial é AOA.
- Quantidades de stock admitem três casas decimais. O saldo resulta da soma de `inventory_movements.quantity_delta`; não se deve editar um saldo agregado directamente.
- Linhas de venda guardam uma fotografia do nome/SKU/preço do produto para preservar o histórico.
- `payments.status`, `proxypay_payments`, `webhook_events`, credenciais WhatsApp, logs de IA e auditoria são escritos apenas pelo backend privilegiado.
- A referência Multicaixa e o identificador externo de pagamento têm restrições de unicidade para apoiar idempotência.
- Credenciais Baileys têm de ser cifradas pela aplicação antes de gravar `encrypted_data`. A chave de cifragem fica fora da BD e do Git.
- A vista `inventory_balances` usa `security_invoker=true`, herdando RLS da tabela de movimentos. O acesso anónimo à vista foi revogado.
- Todas as 27 tabelas têm RLS activa. O advisor de segurança não reporta alertas.
- Não foi carregada ainda a lista administrativa de províncias/municípios: só deve ser semeada a partir de uma fonte oficial validada.
- Os índices de suporte às chaves estrangeiras foram adicionados. Os avisos de índices ainda não utilizados são esperados numa base de dados acabada de criar e devem ser reavaliados após tráfego real.

## Base WhatsApp e migration de processamento

O schema base incluía no máximo uma `whatsapp_connection` por loja, deduplicação de
mensagens por loja, sem ligação directa da conversa/mensagem nem fila/outbox.
`20261121100000_whatsapp_durable_processing.sql` acrescenta ligação tenant-scoped
às conversas e mensagens, deduplicação por ligação, tabelas de job/outbox e funções
com lease `SKIP LOCKED`. Jobs/outbox são acessíveis apenas pelo `service_role`;
expiração de processamento inbound é reprocessável, enquanto entrega outbound
ambígua termina em `unknown` e não é reenviada automaticamente.

A migration é local, inclui guardas que abortam perante registos órfãos/duplicados,
e ainda não foi executada num PostgreSQL descartável nem aplicada remotamente.
Validar schema e estado remoto antes de a aplicar; não assumir que o snapshot local
representa o banco Supabase actual.

## Migrações remotas

O projecto Supabase `Edivânia` tem as migrações registadas:

- `20261119165457_initial_commercial_core`
- `20261119165518_rls_hardening_and_indexes`
- `20261119165651_membership_role_hardening`
- `20261119165703_public_view_grants_hardening`
- `20261119165840_inventory_view_privilege_lockdown`

O ficheiro `20261119165457_initial_commercial_core.sql` é um snapshot consolidado do estado final exportado do banco remoto, preparado para bootstrap de uma instalação limpa. Os ficheiros seguintes são marcadores sem DDL adicional para preservar a sequência histórica já aplicada no projecto remoto. O snapshot não é uma reprodução byte-a-byte do SQL histórico inicial; antes de aplicar num segundo projecto, validar o bootstrap num ambiente de desenvolvimento isolado.
