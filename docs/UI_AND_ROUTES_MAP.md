# Mapa de Interfaces (UI) e Rotas da Edvânia

- **Actualizado:** 2026-11-22
- **Objectivo:** documentar onde cada interface pertence, quais rotas existem na aplicação Next.js App Router, que papéis têm acesso, de que tabelas/RPCs dependem e qual o sistema visual aplicado.

---

## 1. Sistema Visual, Cores e Tipografia

A interface foi desenhada com estética calma, luminosa e legível para uso contínuo em balcão e gestão comercial em Angola (**AOA**):

- **Paleta (regra 60-30-10):**
  - **Fundo principal (60%):** Alabastro suave (`#F7F8F6`) para reduzir fadiga visual.
  - **Superfícies estruturais (30%):** Branco limpo (`#FFFFFF`), fundos subtis (`#F0F3F0`) e contornos finos (`#E2E7E3`), com elevação plana de 1 nível (sem cartões aninhados).
  - **Destaque principal (10%):** Verde Botânico (`#146C53` / `#0F5340` em hover e `#EAF4F0` em selecção activa).
  - **Estados semânticos:** Sucesso (`#15803D`), Alerta de stock/saldo (`#B45309`), Erro (`#B91C1C`) — sempre acompanhados de texto claro.
- **Tipografia (regra 2+1 via `next/font/google`):**
  - **Títulos e marca:** `Plus Jakarta Sans` (pesos 600 e 700).
  - **Corpo e formulários:** `DM Sans` (pesos 400, 500 e 600).
  - **Valores AOA, códigos e datas:** `IBM Plex Mono` com `font-variant-numeric: tabular-nums` para alinhamento vertical perfeito em tabelas.
- **Animação e acessibilidade:**
  - Transições discretas com `motion/react` (`src/components/motion-primitives.tsx`) abaixo de 200ms e respeito automático por `prefers-reduced-motion`.
  - Navegação lateral fixa em desktop (`256px`) e menu deslizante em ecrãs móveis (`src/components/workspace-shell.tsx`).

---

## 2. Inventário Completo de Rotas e UIs

### A. Área Pública e Acesso

| Rota | Ficheiro UI | Propósito e conteúdo | Acesso |
|---|---|---|---|
| `/` | `src/app/page.tsx` + `src/components/landing-preview.tsx` | Página inicial institucional com barra superior de 3 zonas, proposta de valor para comerciantes em Angola, demonstração interactiva por separadores (*Vendas e Stock*, *Caixa e Fecho*, *WhatsApp Assistido*) e garantias de auditoria. | Público |
| `/login` | `src/app/login/page.tsx` + `src/components/auth-form.tsx` | Autenticação com email e palavra-passe via Supabase Auth (ou sessão local em pré-visualização). | Público |
| `/register` | `src/app/register/page.tsx` + `src/components/auth-form.tsx` | Criação de conta de utilizador com validação de nome completo e palavra-passe mínima de 10 caracteres. | Público |
| `/onboarding` | `src/app/onboarding/page.tsx` + `src/app/onboarding/actions.ts` | Primeiro passo após registo sem loja: cria a loja via RPC `create_store_for_current_user` (criando automaticamente associação `owner`, armazém padrão e caixa principal). | Utilizador autenticado sem loja |

### B. Área Operacional (dentro de `WorkspaceShell`)

| Rota | Ficheiro UI | Propósito e dados ligados | Papéis permitidos | Estado Backend |
|---|---|---|---|---|
| `/dashboard` | `src/app/dashboard/page.tsx` | Painel inicial com 4 indicadores reais da loja (*Vendas confirmadas*, *Produtos activos*, *Reposição necessária*, *Sessões de caixa*), atalhos operacionais e selector de lojas associadas. | Todos activos (`owner`, `admin`, `manager`, `employee`) | Ligado a `stores`, `products`, `inventory_balances`, `sales`, `cash_sessions` |
| `/products` | `src/app/products/page.tsx` + `actions.ts` | Gestão do catálogo, criação de produtos (`create_product_with_audit`), categorias (`create_category_with_audit`) e leitura de stock por ledger (`inventory_balances`). | Todos activos | Ligado a RPCs auditadas |
| `/sales` | `src/app/sales/page.tsx` + `sale-form.tsx` + `actions.ts` | Registo de vendas com revisão explícita antes de submeter, cálculo de preços/totais no servidor (`create_sale_with_audit`), cliente opcional e histórico de pagamentos/em falta. | `owner`, `admin`, `manager` | Ligado a RPC atómica e idempotente |
| `/purchases` | `src/app/purchases/page.tsx` + `purchase-form.tsx` + `actions.ts` | Registo de compras a fornecedores com recepção imediata em stock na mesma transacção (`create_purchase_with_audit`). | `owner`, `admin`, `manager` | Ligado a RPC atómica e idempotente |
| `/cash` | `src/app/cash/page.tsx` + `cash-forms.tsx` + `actions.ts` | Abertura de sessão de caixa, registo de reforços/levantamentos/despesas operacionais (`record_cash_expense_with_audit`) e fecho com confirmação e reconciliação auditada. | `owner`, `admin`, `manager` | Ligado a RPCs auditadas |
| `/customers` | `src/app/customers/page.tsx` + `actions.ts` | Gestão de clientes e fornecedores (`create_customer_with_audit`, `create_supplier_with_audit`) com cálculo automático de saldo em aberto por cliente (`sales − payments`). | `owner`, `admin`, `manager` | Ligado às tabelas e RPCs da migration `20261121080000` |
| `/assistant` | `src/app/assistant/page.tsx` + `src/components/assistant-whatsapp-panel.tsx` | **Painel unificado IA e WhatsApp (Baileys):** conversa multi-turno com a IA Edvânia (com tools read-only e diagnóstico `/api/assistant/health`), registo do número WhatsApp da loja, emparelhamento real via Baileys (QR Code PNG), auto-resposta automática e primeiro teste guiado + venda assistida (Meta H). | Todos activos (chat IA scoped por papel); gestão WhatsApp/Baileys restrita a `owner`, `admin`, `manager` | Integrado com `@google/genai` (Gemini), Baileys v7 RC, `baileys_auth_state` cifrado (AES-256-GCM) e RPCs/Sandbox |
| `/whatsapp` | `src/app/whatsapp/page.tsx` + `actions.ts` | Painel operacional de caixa de mensagens, simulador sandbox, despacho unificado da fila outbox (Baileys + Sandbox) e confirmação assistida (Meta H). | `owner`, `admin`, `manager` | Híbrido (RPCs Supabase / Baileys / Sandbox) |
| `/reports` | `src/app/reports/page.tsx` + `src/lib/reports-csv.ts` | Consolidação de receitas, compras e despesas em AOA com filtro por datas (`from`/`to`), exportação CSV sanitizada (`/api/reports/export`), tabela de `audit_logs`, quota diária de IA (`500/dia`) e registos em `ai_usage_logs`. | `owner`, `admin`, `manager` | Leitura e exportação ligadas; orçamento diário de IA persistido |
| `/settings` | `src/app/settings/page.tsx` + `actions.ts` | Edição dos dados comerciais da loja (`updateStoreProfile`), gestão de papéis/estado de membros exclusiva de proprietário (`updateMemberAccess`), caixas e canais WhatsApp. | Todos activos (edição de perfil para gestores; gestão de equipa para `owner`) | Ligado a `stores`, `store_memberships` e `audit_logs` |

### C. Rotas de API Internas (`src/app/api/*`)

| Rota | Ficheiro | Propósito | Autenticação |
|---|---|---|---|
| `GET /api/auth/session` | `src/app/api/auth/session/route.ts` | Verifica estado da sessão e modo activo (`supabase` ou `sandbox`). | Cookie HTTP-only |
| `GET /api/assistant/health` | `src/app/api/assistant/health/route.ts` | Reporta modelo IA activo, quota diária e executa teste vivo `?probe=1` ao Gemini SDK. | Sessão autenticada (`?probe=1` exige gestor+) |
| `POST /api/assistant/chat` | `src/app/api/assistant/chat/route.ts` | Chat multi-turno com tools read-only filtradas pelo papel e registo em `ai_usage_logs`. | Sessão autenticada + membership activa |
| `POST /api/assistant/sale-draft` | `src/app/api/assistant/sale-draft/route.ts` | Prepara, confirma ou cancela vendas assistidas (Meta H) no painel `/assistant`. | Sessão autenticada (`owner`/`admin`/`manager`) |
| `GET /api/whatsapp/baileys/status` | `src/app/api/whatsapp/baileys/status/route.ts` | Lista ligações, snapshots live (incluindo QR DataURL), conversas e mensagens. | Sessão autenticada (`owner`/`admin`/`manager`) |
| `POST /api/whatsapp/baileys/register` | `src/app/api/whatsapp/baileys/register/route.ts` | Regista/actualiza o número WhatsApp oficial da loja com normalização E.164/Angola. | Sessão autenticada (`owner`/`admin`/`manager`) |
| `POST /api/whatsapp/baileys/connect` | `src/app/api/whatsapp/baileys/connect/route.ts` | Inicia sessão real Baileys (gerando QR Code) ou sessão sandbox. | Sessão autenticada (`owner`/`admin`/`manager`) |
| `POST /api/whatsapp/baileys/disconnect` | `src/app/api/whatsapp/baileys/disconnect/route.ts` | Desliga ou faz logout seguro limpando credenciais Signal/Baileys. | Sessão autenticada (`owner`/`admin`/`manager`) |
| `POST /api/whatsapp/baileys/auto-reply` | `src/app/api/whatsapp/baileys/auto-reply/route.ts` | Activa ou pausa respostas automáticas da IA no canal WhatsApp. | Sessão autenticada (`owner`/`admin`/`manager`) |
| `POST /api/whatsapp/baileys/test-send` | `src/app/api/whatsapp/baileys/test-send/route.ts` | Executa envio real via Baileys ou teste guiado inbound → IA → outbox. | Sessão autenticada (`owner`/`admin`/`manager`) |
| `GET /api/reports/export` | `src/app/api/reports/export/route.ts` | Exporta extracto financeiro CSV com protecção contra formula injection. | Sessão autenticada (`owner`/`admin`/`manager`) |
| `POST /api/whatsapp/webhook` | `src/app/api/whatsapp/webhook/route.ts` | Recebe eventos de mensagens inbound, valida assinatura HMAC-SHA256, resolve `store_id` pela ligação persistida e enfileira de forma idempotente. | Cabeçalho `x-edvania-signature` (`WHATSAPP_WEBHOOK_SECRET`) |
| `POST /api/whatsapp/outbox/dispatch` | `src/app/api/whatsapp/outbox/dispatch/route.ts` | Despacha lotes da fila `whatsapp_outbox` respeitando leases e o sender unificado (Baileys + Sandbox). | Bearer `WHATSAPP_WORKER_SECRET` ou sessão autenticada (`owner`/`admin`/`manager`) |

---

## 3. Componentes Partilhados (`src/components/`)

- `src/components/workspace-shell.tsx` — Estrutura lateral e barra superior de todas as rotas autenticadas do painel (incluindo `/assistant`).
- `src/components/assistant-whatsapp-panel.tsx` — Painel dividido interactivo de chat com a IA Edvânia e gestão completa do canal WhatsApp/Baileys.
- `src/components/motion-primitives.tsx` — Wrappers suaves (`PageEntrance`, `SmoothCard`) com `motion/react` e suporte a redução de movimento.
- `src/components/landing-preview.tsx` — Demonstração interactiva por separadores na página inicial (`/`).
- `src/components/auth-form.tsx` — Formulário partilhado entre `/login` e `/register`.

---

## 4. Extensões Adicionais Previstas

1. **Em `/settings`:** selecção oficial de `angola_provinces` / `angola_municipalities` e configuração de `proxypay_payments` / Multicaixa Express (edição de perfil e gestão de papéis da equipa já concluídas).
2. **Em `/reports`:** exportação PDF complementar (filtros por datas, exportação CSV e orçamento diário de IA já concluídos).
3. **Em produção Supabase:** executar as migrations e testes SQL (`supabase/migrations/*.sql`, `supabase/tests/*.sql`) num projecto Supabase ou PostgreSQL isolado e configurar `SUPABASE_SECRET_KEY` + `WHATSAPP_CREDENTIALS_KEYRING` para persistência cifrada entre reinícios do servidor.
