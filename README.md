# Edvânia

Assistente comercial para comerciantes em Angola. A plataforma terá um painel Web responsivo e um canal WhatsApp, partilhando o mesmo backend, regras de negócio e base de dados.

## Stack inicial

- Next.js 16.4.6 (App Router) + React 19.3.1
- TypeScript 5.9
- Supabase: PostgreSQL 17, Auth e RLS
- Zod para validação de configuração e payloads

## Estado do projecto

- Fundação Next.js/TypeScript criada.
- Base de dados Supabase provisionada no projecto `Edivânia` (`eu-west-1`).
- Núcleo comercial com lojas, produtos, fornecedores, clientes, stock, vendas, compras, pagamentos e caixa.
- RLS activa nas tabelas expostas; escrita directa em vendas, linhas de venda, compras, linhas de compra e pagamentos bloqueada para clientes autenticados.
- Vendas e recepção de compras usam RPCs transaccionais, idempotência e bloqueios de produtos por ordem determinística.
- O stock continua baseado num ledger de movimentos; as compras recebidas geram entradas de stock na mesma transacção.
- Security Advisor e Health Advisor sem alertas na última verificação.
- Migrações remotas confirmadas até `restrict_purchase_ledger_direct_writes`; os ficheiros incrementais correspondentes estão em `supabase/migrations`.
- Tipos TypeScript gerados a partir do schema remoto em `src/lib/supabase/database.types.ts`.
- Nenhuma chave secreta é guardada neste repositório.

## Começar localmente

Requisitos: Node.js 22 LTS e npm.

1. Instalar dependências: `npm install` (gera `package-lock.json`; deve ser versionado no Git após a primeira instalação).
2. Copiar `.env.example` para `.env.local`.
3. Preencher `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com os valores do projecto Supabase.
4. Executar `npm run dev`.
5. Abrir `http://localhost:3000`.

Nunca colocar `SUPABASE_SECRET_KEY`, service-role keys, tokens de IA ou segredos de gateways em variáveis `NEXT_PUBLIC_*`, no browser ou no Git.

## Estrutura

- `src/app`: App Router e páginas.
- `src/lib/supabase`: clientes browser/server e tipos gerados.
- `supabase/migrations`: migrações incrementais.
- `supabase/tests`: testes transaccionais para vendas e recepção de compras.
- `supabase`: configuração do projecto.
- `docs/DATABASE.md`: modelo de dados, tenancy e segurança.

## Núcleo de dados já provisionado

Perfis e lojas; membros e papéis; províncias/municípios; categorias e produtos; locais, movimentos e saldos de stock; clientes e fornecedores; vendas e linhas; compras e linhas de compra; pagamentos e despesas; caixas, sessões e movimentos; ProxyPay/Multicaixa Express; eventos webhook; sessões e mensagens WhatsApp; utilização de IA; automações e auditoria.

## Comandos

- `npm run dev` — desenvolvimento.
- `npm run build` — build de produção.
- `npm run start` — servidor de produção.
- `npm run lint` — análise estática.
- `npm run typecheck` — verificação TypeScript.

## Princípios

1. Todas as operações comerciais são sempre limitadas por `store_id`.
2. RLS é obrigatória em todas as tabelas do schema exposto.
3. O browser usa apenas a publishable key; operações privilegiadas ficam no servidor.
4. Stock é calculado a partir de um ledger de movimentos, não de uma quantidade editável.
5. Vendas e recepções de compras são operações atómicas e idempotentes; os clientes não escrevem directamente nas tabelas de movimentos financeiros/comerciais.
6. Estados de pagamentos e webhooks são controlados pelo backend e processados de forma idempotente.
7. O modelo de IA nunca recebe acesso directo à base de dados; só invoca operações de backend validadas.
8. WhatsApp e Web não duplicam regras de negócio.

## Nota sobre migrações

As migrações remotas estão registadas no Supabase. A integração utilizada nesta sessão confirmou os nomes e versões, mas não disponibilizou o conteúdo SQL original. O repositório inclui um snapshot SQL consolidado para instalações limpas e marcadores para preservar as versões remotas. O snapshot reflecte o estado final verificado, não o texto histórico exacto da primeira migração.
