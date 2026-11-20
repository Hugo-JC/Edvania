# Meta 3 — camada de domínio e ferramentas backend

## Arquitectura
- contracts.ts: schemas Zod, contexto confiável, resultados e erros.
- policy.ts / authorization.ts: matriz de permissões, autenticação e membership activa validada no servidor.
- audit.ts: eventos em audit_logs.
- services.ts: consultas e operações comerciais via Supabase/RPC.
- backend-tools/index.ts: ferramentas com nomes estáveis, schemas estritos e execução por serviços.

O contexto de loja/utilizador é responsabilidade da camada de orquestração autenticada; não faz parte dos argumentos das ferramentas expostas ao modelo. Cada serviço valida auth.getUser(), compara o user_id e verifica a associação activa à loja. As consultas incluem sempre store_id; as RPCs existentes repetem as validações no PostgreSQL.

## Limitações verificadas no schema
A RPC create_purchase_with_receipt cria e recebe a compra na mesma transacção. Não existe RPC separada de recepção posterior, por isso receive_purchase devolve uma recusa explícita em vez de escrever directamente nas tabelas. Também não existe RPC autónoma de movimento de inventário. Não foi criada uma implementação fictícia para estas operações.

## Ferramentas
Consultas: get_store_summary, search_products, get_product_details, check_stock, search_customers, get_customer_balance, get_sales_summary, get_cash_register_status.
Operações: create_sale, create_purchase, receive_purchase (recusa explicativa até existir RPC), register_expense, open_cash_session, close_cash_session.

As operações de escrita devem ser chamadas pela orquestração apenas após confirmação explícita e com idempotency_key por intenção confirmada. As operações usam RPCs transaccionais já existentes. Eventos de auditoria são escritos depois do sucesso da RPC.

## Testes
Teste unitário da matriz de papéis: node --experimental-strip-types --test src/lib/domain/policy.test.ts.
Executar ainda npm run typecheck, npm run lint e npm run build. Testes SQL de integração requerem base de dados descartável; não executar fixtures na base de dados de produção.
