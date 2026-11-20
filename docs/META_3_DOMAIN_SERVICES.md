# Meta 3 — camada de domínio e ferramentas backend

## Arquitectura
- `contracts.ts`: schemas Zod, contexto confiável, resultados e erros.
- `policy.ts` / `authorization.ts`: matriz de permissões, autenticação e membership activa validada no servidor.
- `audit.ts`: escrita através da RPC append-only `write_audit_log`, pois a tabela `audit_logs` bloqueia DML directo por RLS.
- `services.ts`: consultas e operações de vendas, compras, caixa, despesas, clientes e fornecedores.
- `catalog.ts`: criação de produtos via RPC existente e categorias via RLS.
- `parties.ts`: criação de clientes e fornecedores, com validação de papéis.
- `inventory.ts`: entradas positivas `opening`/`return_in` permitidas pela política actual de inventário.
- `payments.ts`: consulta de pagamentos por venda; criação/alteração de pagamentos continua encapsulada na RPC transaccional de venda.
- `backend-tools/index.ts`: ferramentas com nomes estáveis, schemas estritos e execução por serviços.

O contexto de loja/utilizador é responsabilidade da camada de orquestração autenticada; não faz parte dos argumentos das ferramentas expostas ao modelo. Cada serviço valida `auth.getUser()`, compara o user_id e verifica a associação activa à loja. As consultas incluem sempre `store_id`; as RPCs existentes repetem as validações no PostgreSQL.

## Limitações verificadas no schema
A RPC `create_purchase_with_receipt` cria e recebe a compra na mesma transacção. Não existe RPC separada de recepção posterior, por isso `receive_purchase` devolve uma recusa explícita em vez de escrever directamente nas tabelas.
A política de inventário permite apenas entradas positivas `opening` e `return_in` para owner/admin/manager. Não existe operação segura de saída/ajuste negativo independente; o serviço não tenta contornar essa política. Vendas e recepções de compra continuam a gerar os movimentos correspondentes nas RPCs atómicas existentes.

## Ferramentas
Consultas: `get_store_summary`, `search_products`, `get_product_details`, `check_stock`, `search_customers`, `get_customer_balance`, `get_sales_summary`, `get_cash_register_status`.
Operações: `create_sale`, `create_purchase`, `receive_purchase` (recusa explicativa até existir RPC), `register_expense`, `open_cash_session`, `close_cash_session`.

As operações de escrita devem ser chamadas pela orquestração apenas após confirmação explícita e com `idempotencyKey` por intenção confirmada. As operações usam RPCs transaccionais existentes sempre que disponíveis. Eventos de auditoria são escritos através de RPC restrita depois do sucesso da operação comercial.

## Testes
- `node --experimental-strip-types --test src/lib/domain/*.test.mjs`: contratos Zod e matriz de papéis.
- `npm run typecheck`, `npm run lint`, `npm run build`.
- Testes SQL de integração existentes para vendas, compras e caixa requerem base de dados descartável; não executar fixtures na base de dados de produção.

A migration `20261120120000_domain_audit_rpc.sql` é aditiva e deve ser aplicada antes de activar a nova camada em produção. Não foi aplicada à base de dados remota durante a preparação deste PR.
