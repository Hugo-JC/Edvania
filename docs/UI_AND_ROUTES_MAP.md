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
| `/whatsapp` | `src/app/whatsapp/page.tsx` + `actions.ts` | Painel Sandbox do canal WhatsApp: estado da sessão, QR efémero, simulador inbound → assistente → outbox, despacho manual da fila outbox e fluxo de **Operação assistida com confirmação explícita (Meta H)**. | `owner`, `admin`, `manager` | Híbrido (RPCs Supabase / Sandbox em memória); ligação real Baileys pendente de piloto |
| `/reports` | `src/app/reports/page.tsx` | Consolidação de receitas, compras e despesas em AOA, tabela recente de `audit_logs` e tabela de chamadas do assistente em `ai_usage_logs`. | `owner`, `admin`, `manager` | Leitura real ligada; exportação CSV/PDF e orçamento diário de IA previstos no plano |
| `/settings` | `src/app/settings/page.tsx` | Dados gerais da loja, caixas registadoras, ligações WhatsApp e membros da equipa (`store_memberships`). | Todos activos | Leitura real ligada; convites de equipa, províncias/municípios e ProxyPay previstos |

### C. Rotas de API Internas (`src/app/api/*`)

| Rota | Ficheiro | Propósito | Autenticação |
|---|---|---|---|
| `POST /api/whatsapp/webhook` | `src/app/api/whatsapp/webhook/route.ts` | Recebe eventos de mensagens inbound, valida assinatura HMAC-SHA256, resolve `store_id` pela ligação persistida e enfileira de forma idempotente. | Cabeçalho `x-edvania-signature` (`WHATSAPP_WEBHOOK_SECRET`) |
| `POST /api/whatsapp/outbox/dispatch` | `src/app/api/whatsapp/outbox/dispatch/route.ts` | Despacha lotes da fila `whatsapp_outbox` respeitando leases e o estado da sessão. | Bearer `WHATSAPP_WORKER_SECRET` ou sessão autenticada (`owner`/`admin`/`manager`) |

---

## 3. Componentes Partilhados (`src/components/`)

- `src/components/workspace-shell.tsx` — Estrutura lateral e barra superior de todas as rotas autenticadas do painel.
- `src/components/motion-primitives.tsx` — Wrappers suaves (`PageEntrance`, `SmoothCard`) com `motion/react` e suporte a redução de movimento.
- `src/components/landing-preview.tsx` — Demonstração interactiva por separadores na página inicial (`/`).
- `src/components/auth-form.tsx` — Formulário partilhado entre `/login` e `/register`.

---

## 4. Extensões Futuras Previstas (sem UI quebrada)

Com base em `docs/DATABASE.md` e `docs/PLANO_AUTONOMO_EDVANIA_V2_COPILOT.md`, quando os respectivos serviços de backend forem activados:
1. **Em `/settings`:** formulários de edição do perfil fiscal da loja, selecção oficial de `angola_provinces` / `angola_municipalities`, gestão de convites de equipa (exclusiva de `owner`) e configuração de `proxypay_payments` / Multicaixa Express.
2. **Em `/reports`:** filtro por datas, exportação de extractos financeiros e visualização de limites diários de consumo de IA por loja.
3. **Em `/whatsapp`:** associação verificada entre número WhatsApp e membro/cliente da loja, plus ligação ao adapter Baileys real após validação dos critérios de `docs/WHATSAPP_PILOT_CHECKLIST.md`.
