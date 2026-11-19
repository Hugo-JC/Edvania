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
- 27 tabelas, uma vista de saldos de stock e políticas RLS.
- Migrações remotas aplicadas: `initial_commercial_core`, `rls_hardening_and_indexes`, `membership_role_hardening` e `public_view_grants_hardening`.
- Tipos TypeScript gerados a partir do schema remoto em `src/lib/supabase/database.types.ts`.
- Nenhuma chave secreta é guardada neste repositório.

## Começar localmente

Requisitos: Node.js 22 LTS e npm.

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

As migrações remotas estão registadas no Supabase. A integração utilizada nesta sessão confirmou os nomes e versões, mas não disponibilizou o conteúdo SQL original. O repositório documenta esse facto em `supabase/migrations/README.md`; antes de criar um segundo ambiente, exportar o schema remoto para migrações SQL versionadas. Não se deve inventar um ficheiro de migração que possa divergir da base de dados.
