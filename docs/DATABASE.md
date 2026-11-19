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
| WhatsApp | `whatsapp_connections`, `baileys_auth_state`, `whatsapp_conversations`, `whatsapp_messages` |
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

## Migrações remotas

O projecto Supabase `Edivânia` tem as migrações registadas:

- `20261119165457_initial_commercial_core`
- `20261119165518_rls_hardening_and_indexes`
- `20261119165651_membership_role_hardening`
- `20261119165703_public_view_grants_hardening`

A integração Supabase confirmou a aplicação e os advisors. O corpo SQL das migrações remotas não foi disponibilizado pela integração; não foi inventado um ficheiro SQL divergente. Antes de abrir um segundo ambiente, exportar o schema remoto para migrações locais e verificar a correspondência dos históricos.
