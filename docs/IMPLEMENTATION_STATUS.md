# Estado da implementação autónoma Edvânia

- **Actualizado:** 2026-11-21
- **Repositório oficial:** `Hugo-JC/Edvania`
- **Branch de trabalho:** `hugo-pc21-edvania-implementation`
- **Referência funcional:** `Hugo-JC/Edvania-v2` (`main`)

## Checkpoint actual

O incremento actual avançou as Metas F, G e H no código Next.js/TypeScript e completou o fluxo Web de Caixa (`/cash`), mantendo todas as fronteiras de segurança e sem activar WhatsApp real nem alterar base remota:
- **Caixa Web (`/cash`):** criada a página operacional `src/app/cash/page.tsx`, formulários com confirmação explícita de fecho (`src/app/cash/cash-forms.tsx`), acção `recordCashExpense` em `src/app/cash/actions.ts` e ligação no painel `/dashboard`.
- **Meta F (Outbound + UI Sandbox):** criado `src/lib/whatsapp/session-sender.ts` (ligando `WhatsAppSessionManager` ao `OutboundSender` para recusar envios sem sessão `connected`), o runtime sandbox server-only `src/lib/whatsapp/sandbox-runtime.server.ts` e o painel autenticado `src/app/whatsapp/page.tsx` + `src/app/whatsapp/actions.ts` (estado de ligação, QR efémero sandbox, desconexão/logout, paginação de conversas, mensagens, fila outbox e simulador inbound→assistente→outbox).
- **Meta G (Providers LLM + Rate Limiter):** criado `src/lib/domain/assistant-providers.ts` (adaptadores configuráveis Gemini e OpenAI-compatible com guarda SSRF `assertSafeLlmEndpointUrl`, limite de 512 tokens e provider determinístico read-only para modo sandbox), `src/lib/domain/assistant-providers.server.ts`, `src/lib/domain/assistant-rate-limit.ts` (janela deslizante por utilizador e orçamento diário por loja) e placeholders vazios em `.env.example`.
- **Meta H (Preview autoritativo, store e executor):** criado `src/lib/domain/confirmations-store.ts` (`InMemoryConfirmationStore` com consumo atómico único e TTL) e `src/lib/domain/confirmations.server.ts` (`createDomainOperationPreviewer` consultando catálogo/caixas do `store_id` e `createDomainConfirmedExecutor` chamando os serviços de domínio com a chave idempotente emitida pelo servidor).
- **Validação local integrada após este incremento:** **53/53** testes unitários (`node --experimental-strip-types --test src/lib/domain/*.test.mjs src/lib/whatsapp/*.test.mjs`), `npm run typecheck`, `npm run lint` e `npm run build` passaram. Nenhuma validação PostgreSQL/SQL foi executada (ambiente sem `psql`, `pg_ctl`, Docker ou Supabase CLI), nenhuma chave real foi carregada e nenhum número real foi ligado.

**Próximo passo concreto:** validar migrations B/C e os testes SQL em PostgreSQL descartável autorizado, comparando com o schema aplicável; substituir `InMemoryConfirmationStore` e `InMemoryTenantRateLimiter` por persistência/RPC PostgreSQL; e implementar o adapter Baileys real apenas após cumprir os gates de `docs/WHATSAPP_PILOT_CHECKLIST.md`.

## Progresso por meta

| Meta | Estado | Evidência e próximo passo |
|---|---|---|
| A — Baseline | Parcial | Plano integral, baseline, modelo de dados, Meta 3, README, `package.json`, CI e código local inspeccionados. `git status --short --branch` confirmou a branch `hugo-pc21-edvania-implementation` e alterações locais rastreadas/não rastreadas deste trabalho; `HEAD`, remoto e estado remoto das migrations não foram confirmados. A baseline e lista remota nos documentos existentes são divergentes e não foram tratadas como estado actual. |
| B — Gate Meta 3 | Em curso | Os serviços e Server Actions passam a chamar RPCs que agrupam mutação e auditoria na mesma transacção. Adicionada `supabase/migrations/20261121080000_atomic_domain_audit.sql`, incluindo replay auditado idempotente para operações com chave e movimento de caixa. Corrigido o argumento `category` opcional para a assinatura SQL obrigatória. Testes SQL de rollback e replay foram acrescentados/actualizados, mas não executados. A migration não foi aplicada remotamente. |
| C — Schema WhatsApp | Preparada, não validada no PostgreSQL | `20261121100000_whatsapp_durable_processing.sql` associa conversas/mensagens a ligação, permite várias ligações, deduplica por conexão, adiciona `whatsapp_jobs` e `whatsapp_outbox`; todas as RPCs de claim, finalização e limpeza exigem `store_id`, claims usam `SKIP LOCKED`, finalização exige lease token vigente e retries são limitados. Envio ambíguo fica `unknown`. Testes SQL cobrem claims/finalização cross-tenant, duplicação, stale leases, retry e status ambíguo. Nenhum SQL foi executado em PostgreSQL; `psql`, `pg_ctl`, `docker` e `supabase` CLI não estão disponíveis neste ambiente. Nada foi aplicado remotamente; Meta C não concluída. |
| D — Provider e sessão | Avanço mockável validado; meta não concluída | Criado contrato de provider para consumo pelo backend e gestor de ciclo de sessão em memória, com chave composta por tenant/conexão, mutex por conexão, invalidação de callbacks obsoletos, expiração de QR, logout sem reconexão, shutdown que cancela retries e fecha sockets, backoff exponencial com jitter e limite. Estado consultado por chave específica, sem broadcast de eventos. Testes usam provider falso; não há adapter Baileys, persistência de credenciais nem conexão real. |
| E — Inbound e fila | Normalização e adapter RPC local; meta não concluída | `inbound.ts` só aceita JIDs individuais numéricos, texto limitado e flags explícitas de origem. `inbound-store.server.ts` grava via RPC que resolve conversation e insere mensagem/job atomicamente, deduplicando por tenant/connection/provider ID. Sem webhook autenticado, callback real ou worker. |
| F — Outbound e inbox | Avanço UI sandbox + session sender; meta não concluída | `outbox.ts` exige claims `sending` com tenant/connection/lease token; `outbox-store.ts` liga claim/finalização aos RPCs tenant-scoped; `outbox-worker.ts` processa sequencialmente um lote limitado por loja; `session-sender.ts` valida estado `connected` no `WhatsAppSessionManager` antes do envio; `/whatsapp` (`src/app/whatsapp/page.tsx`) e `/cash` (`src/app/cash/page.tsx`) fornecem UI operacional autenticada com paginação, QR efémero sandbox e simulador E2E. Falta cron/worker persistente em produção, adapter Baileys real e validação SQL em PostgreSQL isolado. |
| G — Orquestração mínima | Providers configuráveis + rate limiter; meta não concluída | Allowlist read-only e orquestração testada com provider injetável, uma ronda de tools, limites de 512 tokens e 12.000 chars, timeout e fallback único. Adicionados `assistant-providers.ts` (Gemini e OpenAI-compatible com validação HTTPS/SSRF + fallback sandbox determinístico) e `assistant-rate-limit.ts` (janela deslizante + orçamento diário por loja). Falta persistência distribuída de rate limit/orçamento em PostgreSQL e ligação ao fluxo WhatsApp real. |
| H — Operações mutáveis | Preview autoritativo + executor + store local; meta não concluída | `confirmations.ts` gera token de 256 bits, persiste SHA-256 e vincula user/tenant/conversation/operação/fingerprint/expiração/chave idempotente. Adicionados `confirmations-store.ts` (consumo atómico único em memória com limpeza de expirados) e `confirmations.server.ts` (previewer consultando catálogo/caixas por `store_id` e executor ligado aos serviços/RPCs comerciais). Falta RPC/tabela PostgreSQL para confirmações multi-instância e recuperação de resultado após consumo. |
| I — Segurança e fiabilidade | Primitiva AEAD testada; meta não concluída | `credential-encryption.ts` cria envelope AES-256-GCM versionado, usa AAD por store/conexão/sessão, fail-closed sem versão de chave e suporta keyring de rotação. `.env.example` lista apenas nomes de segredos vazios. Não integrado à persistência Baileys; migrations/RLS/concorrência/runtime continuam por validar. |
| J — Piloto controlado | Checklist preparatório; meta não concluída | `docs/WHATSAPP_PILOT_CHECKLIST.md` documenta gates, pairing sandbox futuro, operação, troubleshooting, rotação/restore e incidentes. Checklist marca **NOT READY**: migrations/Postgres, provider, persistência, UI e autorização ainda não verificados. Nenhuma ligação, mensagem, webhook público ou deploy ocorreu. |

## Gate Meta 3: alterações locais

- A nova migration oferece `*_with_audit` para vendas, compras, caixa, despesas, produtos, categorias, clientes, fornecedores e entradas de stock. Os wrappers de venda/compra/caixa chamam primeiro as RPCs de domínio existentes e só devolvem sucesso depois da auditoria; qualquer falha propaga-se para rollback.
- As operações com idempotency key usam lock transaccional e metadata da chave para não gerar auditoria duplicada num replay. O helper valida autenticação e membership antes da consulta.
- Serviços de domínio e Server Actions Web foram encaminhados pelos novos wrappers; as Server Actions de caixa deixaram de usar cast `as never`.
- `registerExpense` envia `""` para categoria ausente, normalizada pela função SQL para `NULL`, alinhando o contrato opcional com a assinatura PostgREST gerada.
- Testes SQL cobrem falha de auditoria com rollback de venda e replay sem duplicação para venda, compra e caixa.
- A alteração é apenas local: sem estado confirmado da base remota, não aplicar a migration. A sequência remota documentada em `BASELINE_2026-11-20.md`, `DATABASE.md` e `supabase/migrations/README.md` não coincide; precisa de confirmação em ambiente Supabase isolado antes de activação.

## Meta C: preparada, não validada no PostgreSQL

- `20261121100000_whatsapp_durable_processing.sql` é aditiva e inclui validações de dados legados antes de remover a unicidade por loja. Liga mensagens e conversas à ligação com chaves compostas por `store_id`; conserva histórico restringindo a remoção de ligações referenciadas.
- `whatsapp_jobs` deduplica por loja/ligação/chave e usa `FOR UPDATE SKIP LOCKED`, lease token, limite de tentativas e dead-letter. Claims, finalizações e limpeza recebem `store_id` explícito; finalizações exigem lease vigente/token atual e resultados `retry` são limitados. Códigos de erro aceitam apenas identificadores sanitizados. `whatsapp_outbox` usa chave idempotente, claim por lease, finalização fenced e converte leases outbound expiradas em `unknown`, sem retry automático de resultado ambíguo.
- O schema TypeScript local acompanha colunas, tabelas, relações e RPCs.
- `supabase/tests/whatsapp_durable_processing.sql` agora cobre múltiplas ligações, deduplicação por ligação, referências cross-tenant, claims e finalizações tenant-scoped, exclusividade/reclaim de lease, rejeição de tokens obsoletos, retries finitos, dead-letter, outbound desconhecido e grants.
- A Meta C **não está concluída**: testes SQL não executados, migration não aplicada, e ausência de ingress/worker/provider impede provar o fluxo end-to-end.

## Meta D: ciclo de sessão mockável, ainda não concluída

- `src/lib/whatsapp/provider.ts` define o contrato para início de conexão, callbacks de QR/abertura/fecho, logout, envio e erro tipado de provider; não inclui uma dependência ou implementação Baileys nem é protegido por guard server-only.
- `src/lib/whatsapp/session-manager.ts` mantém sessões isoladas por chave tenant/conexão, serializa mutações por mutex, ignora callbacks de gerações antigas, remove QR expirado e não reconecta automaticamente após logout. Não oferece envio directo; o envio deve passar pelo dispatcher/outbox da Meta F.
- `shutdown()` invalida gerações, cancela timers de retry e tenta fechar todas as sessões sob os respectivos locks; tenta todas mesmo se uma falhar e devolve erro sanitizado quando o encerramento não é completo.
- O estado é consultado com `getStatus(tenantId, connectionId)` e não é emitido num canal global; autorização de chamadas/QR continua a cargo de um ponto de entrada ainda não implementado.
- Retentativas são limitadas e usam backoff exponencial com jitter limitado. Falhas e estado são expostos ao chamador, não há credenciais persistidas neste gestor em memória.
- `src/lib/whatsapp/session-manager.test.mjs` usa provider mockado para concorrência de início, callbacks obsoletos, logout, isolamento entre tenants, expiração de QR, cálculo de backoff e shutdown com falha segura (10 testes).
- D permanece **incompleta**: falta adapter real seguro (não ativado), integração com credenciais cifradas/rotação, persistência do estado, autorização/RLS no ponto de entrada e prova de concorrência em PostgreSQL.

## Meta E: normalização inbound, ainda não concluída

- `src/lib/whatsapp/inbound.ts` converte um envelope provider em texto inbound limitado e normalizado, exige IDs UUID de tenant/conexão, identificador externo para idempotência, sender individual (grupos são rejeitados), timestamp não futuro além de tolerância e conteúdo textual dentro dos limites do schema.
- Exige flags de origem para ignorar mensagens próprias e broadcast; status/grupo não entram no store. O tenant/connection ainda é fornecido pelo chamador mockado, não resolvido a partir da ligação interna.
- Tipos de mensagem não suportados são rejeitados explicitamente; conteúdo bruto/provider object não é persistido. `ingestInboundMessage` delega ao port `InboundMessageStore` e propaga falhas de persistência sem fallback de sucesso.
- `enqueue_whatsapp_inbound` na migration C valida tenant/connection por FK, exige JID individual, mensagem/timestamp dentro de limites, faz upsert da conversa e cria mensagem + job na mesma transação; reentrega retorna os IDs existentes sem duplicar. O adapter usa secret server-only e erro genérico, e testes mockados provam o mapeamento e falha explícita.
- `src/lib/whatsapp/inbound.test.mjs` usa store mockado para normalização, validação de input, rejeição explícita de mídia, tenant/idempotency e propagação de falha.
- `supabase/tests/whatsapp_durable_processing.sql` agora inclui verificações transacionais de enqueue atomicamente tenant-scoped, deduplicação de entrega repetida e recusa de conexão de outro tenant; continuam pendentes de execução PostgreSQL.
- E permanece **incompleta**: o adapter RPC está implementado, mas ainda não existe callback/webhook autenticado que derive o tenant pela ligação nem worker persistente. A migration e os testes SQL continuam sem validação PostgreSQL.

## Meta F: dispatcher outbound mockável, ainda não concluída

- `src/lib/whatsapp/outbox.ts` exige um item já claimed em `sending`, UUIDs de tenant/conexão/mensagem/chave/lease, recipient/body dentro dos limites e lease válido; envia a mesma idempotency key ao sender e finaliza com claim+lease para fencing.
- Resultado ambíguo (incluindo erro não tipado ou receipt inválido) é marcado `unknown`, sem retry automático. Falha definitivamente retryable entra em `retry_wait` com jitter/backoff limitado até `maxAttempts`; o dispatcher expõe lease perdido em vez de ocultar a falha.
- `src/lib/whatsapp/outbox.test.mjs` usa sender/store falsos e cobre sucesso tenant-scoped, ambiguidades, limite de retry, lease perdido e claim inválido. Nenhuma mensagem foi enviada.
- `outbox-store.ts` converte claims do RPC para o contrato do dispatcher e persiste status via `finalize_whatsapp_outbox`, repassando loja/token e delay finito; falhas da RPC e resultados inválidos propagam erro codificado sem vazar mensagens do banco. `outbox-store.server.ts` cria cliente Supabase com segredo server-only e chama exclusivamente RPCs tipadas. Os testes mockados provam escopo de loja e fencing.
- `outbox-worker.ts` faz claim de no máximo 100 itens, confere tenant antes de enviar e despacha sequencialmente; sender/store são dependências explícitas, então não há ativação automática ou envio nesta tarefa.
- F permanece **incompleta**: não existe worker/cron autorizado nem sender integrado à sessão; falta UI/inbox e validar migrations/testes SQL em PostgreSQL isolado.

## Meta G: ferramentas read-only limitadas, ainda não concluída

- `src/lib/domain/assistant-tools.ts` fornece allowlist de três consultas (`search_products`, `get_product_details`, `check_stock`), schemas Zod estritos, limites pequenos e rejeição de wildcard/inputs inesperados. Cada handler backend chama os serviços de domínio existentes, que validam associação/papel via `authorizeStore`.
- A saída para o modelo projetada minimiza dados: remove custo de produto e IDs de localização; falhas de serviço são preservadas, e operação desconhecida/mutável é rejeitada.
- `src/lib/domain/assistant-tools.server.ts` mantém os handlers reais no backend com `server-only`. Os testes usam handlers falsos para validar allowlist, validação, isolamento de chamada e minimização.
- `assistant-orchestration.ts` fornece uma fronteira mockável para providers primário/fallback, timeout, limite de saída de 512 tokens e no máximo uma ronda de tools; rate limiting é uma dependência injetada, não uma implementação persistente. O fallback só ocorre uma vez e falhas são propagadas sem resposta de sucesso fabricada.
- `assistant-orchestration.server.ts` fixa a execução das tools aos handlers server-only já ligados aos serviços de domínio, sem permitir que chamadores dessa facade substituam o executor; o teste de prompt injection confirma rejeição de chamada para ferramenta mutável antes de executar qualquer tool.
- Antes da segunda chamada ao provider, a orquestração limita o payload JSON agregado das tools a 12.000 caracteres e falha fechado em dados não serializáveis ou excedentes; o teste prova que resposta excessiva não é transmitida de volta ao provider.
- G permanece **incompleta**: não há provider LLM configurado, rate-limit persistente por tenant/remetente, controlo de orçamento/custo, prompt/context minimization end-to-end ou integração WhatsApp.

## Meta H: núcleo de confirmação única mockável, ainda não concluída

- `src/lib/domain/confirmations.ts` só permite operações comerciais conhecidas, valida payloads existentes com Zod e pede ao previewer backend um resumo/fingerprint de dados autoritativos.
- Gera token aleatório de 256 bits, retorna-o uma vez, persiste apenas SHA-256, e vincula intent a tenant, utilizador, conversa, operação, fingerprint, expiração curta (máximo 10 min) e idempotency key gerada no servidor.
- Na confirmação, revalida o mesmo payload/preview e exige consumo atômico do token no port antes de invocar executor; tentativa expirada, adulterada, de outro contexto ou concorrente é rejeitada. O executor deve usar a chave idempotente devolvida pelo store.
- `src/lib/domain/confirmations.test.mjs` cobre payload/preview alterado, expiração, vínculo de contexto, concorrência de consumo e operação fora da allowlist.
- H permanece **incompleta**: não existe persistência/RPC para compare-and-consume, auth/contexto confiável, preview autoritativo, executor ligado às RPCs comerciais nem recuperação do resultado se falhar após consumir; não há UI que mostre resumo e peça confirmação.

## Meta I: primitiva de cifra AEAD, ainda não concluída

- `src/lib/whatsapp/credential-encryption.ts` cifra bytes com AES-256-GCM e envelope `v1.<keyVersion>.<nonce>.<tag>.<ciphertext>`; usa AAD com store/conexão/sessão/versão, limita tamanho e rejeita plaintext, chave inválida, versão desconhecida e autenticação/tag inválida.
- `credential-encryption.server.ts` lê exclusivamente keyring de variáveis server-only e falha fechado sem chave/versão válida; `.env.example` contém nomes sem valores.
- Testes usam apenas chave e estado fictícios; cobrem roundtrip, alteração de contexto, tampering, ausência de versão e leitura de versão antiga para re-cifra com versão ativa.
- I permanece **incompleta**: nenhuma credencial é lida/cifrada nem escrita na tabela, não há segredo real carregado, integração Baileys, rotação operacional/backup, RLS/grants validados, rate limiting, retenção, autenticidade de provider ou testes Postgres.

## Meta J: documentação preparatória, ainda não concluída

- `docs/WHATSAPP_PILOT_CHECKLIST.md` registra readiness gates e procedimentos futuros de sandbox para pairing, operação, troubleshooting, chave/backup/restore e incidentes.
- O documento declara explicitamente **NOT READY** e proíbe inferir prontidão de mocks/typecheck/build. Os gates de Postgres/RLS/CI, provider, integração de credenciais, workers/outbox, autenticação/UI e autorização de teste continuam abertos.
- Nenhum número foi ligado, nenhuma mensagem real foi enviada, nenhum webhook foi publicado e nenhum deploy/migration remota foi feito.

## Referência Edvania-v2: decisões de reutilização

Não foi copiado código da v2. A aplicação oficial continua Next.js, TypeScript, Supabase/PostgreSQL, Auth e RLS.

| Funcionalidade/padrão observado | Decisão | Aplicação/limite |
|---|---|---|
| Baileys: ciclo de sessão, QR, ligação/desligamento, reconexão | ADAPTAR | Provider server-only; estado e credenciais geridos pelo backend seguro e tenant-scoped. |
| Mutex por sessão, callbacks de socket obsoleto e testes de idempotência | ADOTAR | Adoptar os casos de teste/conceitos, reimplementando em TypeScript com isolamento e concorrência. |
| Inbox, histórico e normalização de mensagens | ADAPTAR | Supabase com `store_id`, ligação, paginação, validação e deduplicação provider/connection/message. |
| Auto-reply e chatbot OpenAI-compatible | ADAPTAR | Sem singleton global; contexto mínimo, tools estritas, autorização por chamada e limites/segredos no servidor. Investigar SSRF do endpoint de geração. |
| Webhook outbound, retries e validação HTTPS/SSRF | ADAPTAR / INVESTIGAR | Outbox durável, assinatura, timeout e retry finito; rever DNS rebinding/redirects antes de reutilizar conceitos. |
| Campanhas, listas, templates, agendamento e retry | ADAPTAR, fora do MVP actual | Só reconsiderar em Postgres, tenant-scoped, transaccional e idempotente, após escopo/consentimento; campanhas em massa e spintax continuam rejeitadas pelo plano. |
| Dashboard/QR/inbox/logs e UI operacional | ADAPTAR | Integrar no painel Next.js; não criar frontend paralelo. |
| WebSocket broadcast global e scheduler que percorre tenants globalmente | REJEITAR | Não transportar; eventos e jobs têm de respeitar tenant e autorização. |
| GET com efeito colateral e confirmação apenas no browser | REJEITAR | Mutação só por endpoint autenticado e confirmação explícita, expirada, idempotente e auditada no servidor. |
| Express/CommonJS, ownership por email, SQLite/modelos locais | REJEITAR | Incompatíveis com a fonte de verdade e isolamento Supabase da Edvânia. |
| Scraper de grupos/participantes | INVESTIGAR / rejeitar por agora | Sem finalidade e consentimento definidos; fora do MVP. |
| AES/CBC/GCM e gestão de chaves da v2 | INVESTIGAR | Não reutilizar sem rever formato, fallback legado, autenticação e rotação; preferir AEAD com chave externa à BD/Git. |
| Licença MIT e atribuição | PRESERVAR se houver reutilização substancial | Não houve cópia nesta implementação; manter `LICENSE`, `ATTRIBUTION.md`, `NOTICE` e cabeçalhos se código da v2 vier a ser incorporado. |

## Validação, estado remoto e bloqueios

- `.github/workflows/ci.yml` agora executa os testes unitários de domínio e WhatsApp, além de typecheck, lint e build. A suíte local corresponde ao novo comando de CI; CI remota não foi consultada.
- `npm ci --no-audit --no-fund`: passou; instalou 355 pacotes. `package-lock.json` permaneceu igual (SHA-256 antes/depois: `82ADD8DE77901854030B999EC719B93191F8B5722A985B6753A8D584EA282E46`).
- `node --experimental-strip-types --test src/lib/domain/*.test.mjs src/lib/whatsapp/*.test.mjs`: passou **46/46** após incluir o worker de lote.
- O teste direcionado `node --experimental-strip-types --test src/lib/whatsapp/outbox-worker.test.mjs` também passou **2/2**.
- A validação CI-equivalente posterior ao worker concluiu com exit code 0: testes **46/46**, `npm run typecheck`, `npm run lint` e `npm run build`; Next.js compilou e gerou as 10 páginas estáticas.
- Avisos Node `MODULE_TYPELESS_PACKAGE_JSON` nos testes são não bloqueantes.
- A atualização local do workflow CI agora inclui os testes WhatsApp. CI remota não foi consultada.
- Os testes SQL `supabase/tests/*.sql` **não foram executados**: não foi disponibilizado PostgreSQL/Supabase descartável. CI remoto também não foi consultado; os resultados locais não provam CI verde.
- Verificação do ambiente local em 2026-11-21: `psql`, `pg_ctl`, `docker` e `supabase` CLI não encontrados; não há mecanismo PostgreSQL local disponível para validar migrations com segurança.
- Revisão estática da migration C: referências/ordem de criação e constraints compostas verificadas; todas as RPCs de fila recebem `store_id`, claims usam `SKIP LOCKED` com limites, finalização verifica token e lease ainda válido, retry tem limite e permissões ficam em `service_role`; o teste de integração cobre operação cross-tenant e tokens obsoletos. Isto não substitui parse/execução PostgreSQL.
- Node 26 emitiu avisos `MODULE_TYPELESS_PACKAGE_JSON` nos testes; build e typecheck passaram. npm indicou depreciação/unsupported do eslint 9.39.1.
- `git status --short --branch` foi executado e confirmou a branch de trabalho, alterações locais rastreadas e ficheiros novos; não foi criado commit. `HEAD` e remotos não foram verificados.
- Estado de migrations remotas e permissões Supabase não foi consultado; os dados nos documentos existentes são evidência histórica, não prova do estado actual.
- Próximo: executar os testes SQL em base descartável; rever a migration contra o schema remoto isolado. Só então concluir B e continuar C–J. Nunca aplicar no projecto de produção, ligar número real, enviar mensagens, publicar webhook ou fazer deploy sem autorização explícita.
