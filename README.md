# Edvânia

Assistente comercial para comerciantes em Angola. A plataforma terá um painel Web responsivo e um canal WhatsApp, partilhando o mesmo backend, regras de negócio e base de dados.

## Stack inicial

- Next.js 16.4.6 (App Router) + React 19.3.1
- TypeScript
- Supabase: PostgreSQL 17, Auth e RLS
- Zod para validação de configuração e payloads

## Estado do projecto

- Fundação Next.js/TypeScript criada.
- Base de dados Supabase provisionada no projecto `Edivânia` (`eu-west-1`).
- Migrações remotas aplicadas: `initial_commercial_core` e `rls_hardening_and_indexes`.
- Tipos TypeScript gerados a partir do schema remoto em `src/lib/supabase/database.types.ts`.
- Nenhuma chave secreta é guardada neste repositório.

## Começar localmente

Requisitos: Node.js 22 LTS (ou versão compatível com Next.js 16) e npm.

1. Instalar dependências: `npm install`
2. Copiar `.env.example` para `.env.local`.
3. Preencher `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com os valores do projecto Supabase.
4. Executar `npm run dev`.
5. Abrir `http://localhost:3000`.

Nunca colocar `SUPABASE_SECRET_KEY`, service-role keys, tokens de IA ou segredos de gateways em variáveis `NEXT_PUBLIC_*`, no browser ou no Git.

## Estrutura

- `src/app`: App Router e páginas.
- `src/lib/supabase`: clientes browser/server e tipos gerados.
- `supabase`: configuração e notas sobre as migrações remotas.
- `docs/DATABASE.md`: modelo de dados, tenancy e segurança.

## Núcleo de dados já provisionado

Perfis e lojas; membros e papéis; províncias/municípios; categorias e produtos; locais, movimentos e saldos de stock; clientes e fornecedores; vendas e linhas; pagamentos e despesas; caixas, sessões e movimentos; ProxyPay/Multicaixa Express; eventos webhook; sessões e mensagens WhatsApp; utilização de IA; automações e auditoria.

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
5. Estados de pagamentos e webhooks são controlados pelo backend e processados de forma idempotente.
6. O modelo de IA nunca recebe acesso directo à base de dados; só invoca operações de backend validadas.
7. WhatsApp e Web não duplicam regras de negócio.

## Nota sobre migrações

As duas migrações foram aplicadas ao projecto remoto através da integração Supabase. A história remota está registada no Supabase. Antes de qualquer novo ambiente ou deploy, deve ser criada/extraída a cópia SQL versionada dessas migrações para `supabase/migrations`; não se deve recriar manualmente o schema nem aplicar DDL directamente em produção.
