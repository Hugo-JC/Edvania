# EDVÂNIA — Plano autónomo de conclusão do produto
## Análise comparativa de Edvania e Edvania-v2 para Copilot App

**Repositório oficial:** Hugo-JC/Edvania (main)  
**Referência funcional:** Hugo-JC/Edvania-v2 (main)

**Instrução central ao Copilot:** executar as metas pela ordem definida, avançando automaticamente quando os critérios de saída forem cumpridos. Não perguntar “terminei a meta, devo avançar?”. Deve continuar sem pedir confirmação entre metas. Só parar perante bloqueio real de segurança, credenciais/autorizações externas, decisão de produto irreversível ou risco de perda de dados.

---

# 1. Decisão executiva

Edvania é o produto oficial e a única fonte de verdade. Edvania-v2 é uma base de referência funcional de onde devem ser retirados selectivamente componentes, padrões e fluxos úteis. Não substituir Edvania pela v2 nem importar a arquitectura inteira.

## Edvania — aplicação oficial
A versão principal é Next.js App Router, React, TypeScript, Supabase/PostgreSQL 17, Supabase Auth, RLS e Zod. O núcleo comercial já inclui lojas/membros, catálogo, stock baseado em ledger, clientes, fornecedores, vendas, compras, pagamentos, despesas e caixa. O README estabelece que Web e WhatsApp devem partilhar backend, regras de negócio e base de dados. Vendas e recepção de compras usam RPCs transaccionais e idempotência.

Documentos importantes encontrados:
- docs/BASELINE_2026-11-20.md
- docs/DATABASE.md
- docs/META_3_DOMAIN_SERVICES.md

A baseline assinala gaps de testes SQL no CI, testes de isolamento/concorrência, confirmação explícita de operações, consolidação de fluxos de caixa, ausência de adaptador/webhook/fila WhatsApp funcional e necessidade de rever CI. Meta 3 já tem contratos, serviços e backend tools, mas há limitações documentadas que têm de ser verificadas no HEAD actual.

## Edvania-v2 — referência
A v2 é um servidor Node.js/Express em JavaScript, baseado em Baileys e SQLite local (better-sqlite3). Tem gestão multi-sessão, QR, reconexão, inbox, mensagens, auto-replies, chatbot configurável, webhooks, API REST, logs, dashboard HTML/JS e testes Jest.

Árvore funcional identificada:
- src/services/whatsapp.js, webhook.js, aiChatbot.js;
- src/routes/api.js, auth.js, chats.js, autoReply.js;
- src/middleware/auth.js e errorHandler.js;
- src/utils/crypto.js, validation.js e response.js;
- src/models/Session.js, ChatMessage.js, AutoReply.js e ActivityLog.js;
- admin/dashboard.html, admin/inbox.html, admin/ai-chatbot.html e admin/auto-replies.html;
- testes de WhatsApp, webhook, chatbot, autenticação, modelos e utilitários.

A v2 é mais avançada no fluxo WhatsApp e nas interfaces operacionais. Contudo, usa SQLite local e identidade/sessões próprias do servidor. Edvania usa Supabase Auth, memberships, RLS e isolamento por store_id. Estes modelos não são intercambiáveis.

**Decisão:** adoptar selectivamente os comportamentos e padrões úteis da v2, adaptando-os ao Next.js/Supabase/TypeScript da Edvania. Não criar dois backends nem duplicar domínio comercial.

---

# 2. Regras inegociáveis

1. Não substituir Next.js, TypeScript, Supabase/PostgreSQL ou o schema comercial de Edvania por Express/SQLite.
2. Não criar segunda base de dados comercial nem duplicar produtos, clientes, stock, vendas, compras, caixa ou pagamentos.
3. Não contornar RLS, RPCs, políticas de papel, serviços de domínio ou validação Zod.
4. O LLM nunca recebe acesso directo à BD, SQL, service-role key, filesystem, shell ou APIs arbitrárias.
5. Nunca confiar em store_id, user_id, papel, identidade do remetente ou permissões vindas do texto ou argumentos do modelo. O backend deriva o contexto da ligação e da sessão autenticada.
6. Nenhuma operação comercial mutável sem resumo e confirmação explícita vinculada à operação exacta.
7. Não transportar campanhas em massa, scraping de grupos/participantes ou funcionalidades de spam da v2 para o MVP.
8. Não ligar números reais, enviar mensagens reais, activar webhooks públicos ou fazer deploy sem autorização explícita.
9. Nunca expor QR, tokens, credenciais Baileys ou chaves em logs, browser, erros ou Git.
10. Não editar migrations já aplicadas. Criar migrations correctivas e validar primeiro em ambiente isolado.
11. Não afirmar que testes/build/CI passaram sem os executar e guardar evidência.
12. Preservar licença, NOTICE, ATTRIBUTION.md e cabeçalhos da v2 se forem reutilizados trechos substanciais. A v2 declara MIT e atribui a autoria original a Alucard0x1. Confirmar os ficheiros de licença antes de distribuir.

---

# 3. Matriz de reutilização

| Área da v2 | Decisão | Aplicação em Edvania |
|---|---|---|
| Ciclo de vida de sessões WhatsApp | ADOPTAR / ADAPTAR | Connect, disconnect, QR, estados, reconexão, logout e concorrência num provider adapter server-only. |
| Mutex por sessão e protecção contra sockets obsoletos | ADOPTAR | Impedir ligações concorrentes e callbacks antigos de alterarem o estado actual. |
| Reconexão | ADAPTAR | Backoff exponencial com jitter, classificação de erros e limite; coordenar entre workers. |
| QR e painel de ligação | ADOPTAR / ADAPTAR | UX de QR efémero, expiração e estado; só utilizadores autorizados podem ver QR. |
| Inbox e histórico | ADOPTAR / ADAPTAR | Reutilizar padrões visuais/UX, mas consultar Supabase com tenant scope e paginação. |
| Normalização Baileys | ADOPTAR / ADAPTAR | Parser independente e testado para eventos, JID, remetente e texto. |
| Auto-replies por palavras-chave | ADAPTAR | Regras determinísticas simples, sem contornar permissões ou executar operações financeiras. |
| Chatbot OpenAI-compatible | ADAPTAR | Reutilizar abstracção de provider e testes; ligar ao orquestrador Edvania e a ferramentas estritas. |
| Webhook outbound com retry | ADAPTAR | Reutilizar validação HTTPS, SSRF guard, timeout e retry; usar outbox durável e assinatura. |
| Criptografia utilitária | INVESTIGAR | Rever algoritmo, IV/nonce, autenticação e rotação; preferir AEAD como AES-256-GCM. |
| Auth Express e utilizadores SQLite | REJEITAR | Usar Supabase Auth, memberships e RLS. |
| Modelos/schema SQLite | REJEITAR | Mapear comportamentos para tabelas Edvania; não migrar tabelas comerciais da v2. |
| API REST v1 | ADAPTAR | Usar como referência de capacidades; expor Route Handlers/Server Actions com Zod e autorização. |
| Dashboard HTML/JS | ADAPTAR | Reproduzir UX dentro do painel Next.js existente; não criar segundo frontend. |
| Logs/ActivityLog | ADAPTAR | Separar logs técnicos de audit_logs comerciais. |
| Campanhas, listas e Spintax | REJEITAR NO MVP | Fora do âmbito inicial e com risco de abuso/banimento. |
| Scraping de grupos | REJEITAR | Não pertence ao produto comercial. |
| Download automático de media | ADIAR | MVP começa com texto; media exige validação, limites e storage privado. |
| Analytics de throughput | ADAPTAR MAIS TARDE | Métricas agregadas de operação, sem copiar o dashboard SQLite. |

---

# 4. Arquitectura alvo

Fluxo recomendado:

WhatsApp Provider (Baileys ou provider suportado)
→ Adapter
→ Webhook / Ingress
→ Normalização e validação
→ Persistência idempotente
→ Fila durável / worker
→ Orquestrador Edvania
→ Backend Tools
→ Domain Services
→ RPCs / PostgreSQL / RLS
→ Outbox de resposta
→ Outbound Dispatcher
→ Provider

Web e WhatsApp são canais distintos da mesma camada de aplicação. Regras comerciais não são implementadas nos adapters.

## Interface do provider
Definir operações equivalentes a:
- startConnection(connectionId)
- disconnect(connectionId)
- getStatus(connectionId)
- sendText(connectionId, recipient, text, idempotencyKey)
- normalizeIncomingEvent(rawEvent)

A implementação Baileys é server-only. Nunca importar Baileys em componentes client-side.

## Responsabilidades
- Provider: protocolo e socket.
- Adapter: converte eventos para contratos internos.
- Ingress: valida evento, limita payload e persiste rapidamente.
- Worker: processamento assíncrono, ordenação por conversa, retry e idempotência.
- Orquestrador: interpreta intenção e escolhe ferramenta estrita.
- Domain services: autorização e regras comerciais.
- Outbox: regista respostas a enviar e estado de entrega.
- UI: apresenta ligação, QR, conversas e estados.

O webhook não deve aguardar LLM, operação comercial ou envio de resposta; deve persistir/enfileirar e responder rapidamente.

---

# 5. Gate obrigatório: estabilizar Meta 3

Antes de activar WhatsApp, revalidar o código e a documentação actuais. O documento Meta 3 descreve ferramentas e limitações. O serviço observado executa a RPC comercial e depois chama writeAudit separadamente. Se a operação comercial tiver sucesso e a auditoria falhar, pode devolver erro apesar de a venda/compra/caixa já estar efectivada, criando risco de retry confuso.

O Copilot deve:
1. Inspeccionar a migration 20261120120000_domain_audit_rpc.sql e confirmar estado remoto, função, grants e compatibilidade.
2. Tornar a operação comercial e auditoria obrigatória atómicas: ambas confirmam ou ambas fazem rollback. Preferir inserir auditoria na mesma RPC/transacção.
3. Preservar append-only, validação actor/tenant e lista permitida de acções.
4. Testar falha de auditoria, rollback, retry e idempotência.
5. Não ignorar falha de auditoria nem devolver sucesso fictício.

Revalidar também o erro TypeScript previamente identificado no serviço de domínio: campo opcional category enviado a RPC que espera string. O HEAD actual é a fonte de verdade. Corrigir com normalização/tipos explícitos, sem any ou casts inseguros.

Executar:
- npm ci
- testes de domínio
- testes SQL em base descartável
- npm run typecheck
- npm run lint
- npm run build

Confirmar o workflow CI na branch/PR. Corrigir falhas reais. Não iniciar tráfego WhatsApp enquanto existirem bloqueios críticos.

Rever backend-tools/index.ts, contratos e serviços. Ferramentas necessárias devem estar implementadas e seguras. Se não existir RPC para recepção posterior de compra, manter recusa explícita; não escrever directamente nas tabelas para contornar.

**Gate de saída:** Meta 3 documentada, testes/typecheck/lint/build e CI aprovados, auditoria consistente, permissões e ferramentas verificadas. Limitações não resolvidas devem ficar registadas e não podem ser contornadas.

---

# 6. Metas sequenciais autónomas

## Meta A — Baseline
- Confirmar branch, commit, worktree, scripts, migrations, schema, CI e documentação.
- Ler integralmente docs/BASELINE_2026-11-20.md, docs/DATABASE.md e docs/META_3_DOMAIN_SERVICES.md.
- Ler os módulos relevantes da v2 e registar paths concretos.
- Não reconstruir o que já existe.
- Criar docs/IMPLEMENTATION_STATUS.md com tarefas, evidências, commits e bloqueios.

**Saída:** inventário reproduzível e plano actualizado.

## Meta B — Gate Meta 3
Executar a secção 5, corrigir bloqueios e adicionar testes de regressão.

**Saída:** gate cumprido com evidência, ou bloqueios explícitos sem contornar segurança.

## Meta C — Schema WhatsApp
Inspeccionar whatsapp_connections, baileys_auth_state, whatsapp_conversations, whatsapp_messages, RLS, índices, grants e tipos.
- Mapear campos existentes antes de alterar.
- Criar migrations incrementais apenas para lacunas comprovadas.
- Garantir unicidade de mensagem externa por ligação/provider.
- Garantir tenant scope em todas as queries e relações.
- Definir estados de ligação, mensagem e processamento.
- Criar fila/outbox durável e mecanismo de claim/lease.
- Credenciais nunca em texto simples.

**Saída:** schema/contratos aprovados por testes.

## Meta D — Adapter Baileys
- Provider isolado.
- Connect/disconnect protegidos contra concorrência.
- Ignorar callbacks de sockets obsoletos.
- Reconexão com backoff exponencial, jitter e limite.
- Logout exige novo pairing; não reconectar infinitamente.
- QR efémero, expirável e autorizado.
- Libertar sockets no shutdown.
- Testes com mocks; não ligar números reais.

**Saída:** testes do ciclo de vida aprovados.

## Meta E — Inbound e fila
- Normalizar texto, remetente, JID, timestamp e provider ID.
- No MVP ignorar grupos, broadcast, status e mensagens próprias.
- Validar tamanho, tipo e estrutura.
- Determinar loja pela ligação interna, nunca pelo texto.
- Resolver remetente através de vínculo explícito e autorizado.
- Persistir antes de responder ao webhook.
- Deduplicar por provider + connection + external_message_id.
- Processar via fila durável; retry não repete operações comerciais.

**Saída:** testes de webhook, duplicação, tenant isolation e retry.

## Meta F — Outbound e inbox
- Envio de texto pelo provider.
- Persistir outbound antes do dispatch; actualizar estado após provider.
- Idempotency key e reconciliação de resultado desconhecido.
- Não repetir indefinidamente envio ambíguo.
- Criar UI no painel Next.js: estado, QR, última actividade, conversas e mensagens.
- Paginação, loading/error/empty states e autorização.
- Usar v2 como referência visual, não copiar auth/persistência.

**Saída:** E2E com provider mock.

## Meta G — Orquestração mínima
- Consultas determinísticas: produto, preço, stock, resumo comercial e estado de caixa conforme papel.
- Usar backend-tools existentes.
- Criar provider LLM configurável. Gemini primário e Groq fallback são opções provisórias, não dependências hardcoded.
- LLM recebe apenas contexto mínimo e schemas de tools.
- Zod e autorização no servidor em cada chamada.
- Não enviar secrets ou dados de outras lojas.
- Timeout, limite de tokens, rate limit, orçamento e fallback seguro.
- Falha de IA não perde mensagem nem desencadeia operação repetida.

**Saída:** testes de tools, falha de provider e prompt injection.

## Meta H — Operações mutáveis
- Preparar intenção sem executar.
- Mostrar resumo com itens, quantidades, preços, total e consequência.
- Pedir confirmação explícita.
- Vincular confirmação a user, store, conversation, operação, fingerprint e expiração.
- Executar uma única vez com idempotency key.
- Responder sucesso só após backend confirmar.
- Rejeitar confirmação expirada ou payload alterado.
- Se não houver RPC/tool segura, recusar operação.

**Saída:** testes sem confirmação, expiração, alteração de payload, concorrência e duplicação.

## Meta I — Segurança e fiabilidade
- Rever RLS/grants e testar cross-store.
- Cifrar credenciais com AEAD (ex.: AES-256-GCM), chave fora da BD/Git.
- Rotação/versão de chave; sem chave, falhar fechado e não persistir credenciais.
- Sanitizar logs e erros.
- Rate limit por ligação/remetente/loja.
- Validar URLs e prevenir SSRF onde houver fetch.
- Proteger endpoints e validar autenticidade do provider.
- Retenção/minimização de dados.
- Testar restart, falhas de rede, outbox e mensagens duplicadas.

**Saída:** checklist de segurança e testes negativos aprovados.

## Meta J — Piloto controlado
- Sandbox/test env e .env.example sem valores secretos.
- Documentar pairing, operação, troubleshooting, rotação, backup/restauro e incidentes.
- E2E com provider mock/sandbox.
- Preparar checklist para piloto com número de teste e autorização explícita.
- Não ligar número real, enviar mensagens reais, publicar webhook ou fazer deploy sem autorização.

**Saída:** MVP pronto para piloto autorizado, mas sem activação de produção automática.

---

# 7. Modelo de dados e estados

Reutilizar primeiro as tabelas existentes:
- whatsapp_connections
- baileys_auth_state
- whatsapp_conversations
- whatsapp_messages

Só se faltar suporte, adicionar migrations para fila/jobs e outbox. Estados sugeridos (confirmar constraints existentes antes de usar):
- Ligação: pending, connecting, qr_required, connected, disconnected, logged_out, error.
- Inbound: received, queued, processing, processed, failed.
- Outbound: queued, sending, sent, failed, unknown.
- Job: pending, processing, retry_wait, completed, dead_letter.

Não assumir que estes estados já existem no schema.

---

# 8. Multi-tenancy e autorização

- Uma ligação pertence a exactamente uma loja.
- O servidor resolve store_id a partir da ligação persistida e autenticada.
- Remetente só opera loja com associação explícita e activa.
- Número WhatsApp não ganha papel owner/admin por enviar mensagem.
- Associação/onboarding via painel autenticado.
- Se o mesmo número pertencer a várias lojas, exigir escolha/associação segura; nunca adivinhar.
- Cada backend tool revalida autorização.
- Aplicar menor privilégio por papel.
- Não revelar dados da loja a remetente não autorizado.
- Mensagens são input não confiável; prompt injection não altera permissões nem executa SQL/código.

---

# 9. Fiabilidade e observabilidade

- Webhook persiste e responde rapidamente; worker processa depois.
- Inbound único por provider/ligação/id externo.
- Idempotência da operação comercial separada da idempotência da mensagem.
- Outbox transaccional para outbound e reconciliação de estados ambíguos.
- Retry com backoff+jitter, limite e dead-letter.
- Lease/lock de job e serialização por conversa.
- Auditoria comercial atómica com operação.
- Métricas: ligações, mensagens recebidas/processadas/falhadas, latência, retries e fila pendente.
- Logs com correlation ID, sem QR/tokens/credenciais ou payload sensível integral.
- Não confundir logs técnicos, métricas e audit_logs.

---

# 10. Testes obrigatórios

### Unitários
Normalização de JID/payload; eventos ignorados; estados; mutex/sockets obsoletos; backoff; cifra/decifra e chave ausente; idempotência; autorização por papel; confirmação/expiração; schemas Zod.

### Integração
Webhook válido/inválido; duplicados; ligação desconhecida/desligada; remetente não associado; isolamento entre lojas; falha de persistência; worker retomado; provider success/failure/unknown; retry sem duplicar venda; falha de auditoria com rollback; prompt injection; ferramenta proibida por papel; confirmação ausente/expirada/alterada.

### E2E
1. Utilizador autenticado abre painel.
2. Inicia ligação de teste e vê QR simulado/efémero.
3. Provider mock confirma ligação.
4. Mensagem é recebida e persistida uma vez.
5. Worker associa à loja correcta.
6. Consulta de produto/preço/stock usa backend tool.
7. Operação mutável é preparada, mas não executada.
8. Sem confirmação não há escrita.
9. Com confirmação válida, RPC executa uma vez e auditoria é atómica.
10. Resposta é colocada na outbox e enviada pelo mock.
11. Evento duplicado não duplica operação nem resposta.
12. Desligar limpa socket/estado transitório sem apagar auditoria.

---

# 11. Critérios globais de conclusão

- [ ] Edvania continua como aplicação e fonte de verdade.
- [ ] Nenhum schema comercial foi substituído por SQLite/modelos v2.
- [ ] Gate Meta 3 cumprido.
- [ ] Typecheck, lint, build e CI aprovados.
- [ ] Testes de domínio, SQL, isolamento, idempotência e concorrência aprovados.
- [ ] Provider isolado e testado.
- [ ] Ligação/desligamento/QR autorizados e persistidos.
- [ ] Inbound/outbound texto com deduplicação e outbox.
- [ ] Inbox no painel Web.
- [ ] Tools reutilizam domain services e RPCs.
- [ ] Confirmação explícita antes de mutações.
- [ ] Credenciais cifradas e ausentes de logs/browser/Git.
- [ ] RLS/grants revistos; testes cross-tenant aprovados.
- [ ] Documentação e .env.example actualizados.
- [ ] Licença/atribuição v2 preservadas quando aplicável.
- [ ] Nenhum número real, campanha ou ambiente de produção activado sem autorização.

---

# 12. Protocolo de autonomia do Copilot App

**Não perguntar se deve avançar para a próxima meta. Avançar automaticamente.**

Em cada meta:
1. Ler este documento e o estado real do repo.
2. Identificar o que já está concluído e não repetir.
3. Executar alterações pequenas e coerentes.
4. Adicionar testes de regressão.
5. Executar verificações.
6. Rever diff, segurança, tenancy e migrations.
7. Fazer commits pequenos e descritivos quando adequado.
8. Actualizar docs/IMPLEMENTATION_STATUS.md.
9. Iniciar automaticamente a meta seguinte.

Parar e pedir decisão apenas se for necessária credencial/autorização inexistente; houver risco de perda de dados/alteração irreversível de produção; for necessário ligar número real, enviar mensagens reais ou fazer deploy; existir conflito de produto não resolvido por este documento; ou uma alteração de schema remoto tiver risco não mitigável.

Não parar por conclusão de meta nem pedir autorização para continuar trabalho local, reversível e testado.

### Relatório por meta
Indicar meta, estado encontrado, ficheiros alterados, decisões sobre v2, migrations e estado remoto/local, testes exactos, CI/PR/commit, riscos e meta seguinte iniciada ou bloqueio concreto.

### Relatório final
Indicar funcionalidades realmente implementadas, evidências/links, resultados CI, estado migrations, limitações e passos do piloto. Não declarar MVP concluído sem cumprir critérios.

---

# 13. Referências inspeccionadas

### Edvania
README.md; package.json; docs/BASELINE_2026-11-20.md; docs/DATABASE.md; docs/META_3_DOMAIN_SERVICES.md; src/lib/domain/services.ts; src/lib/domain/audit.ts; src/lib/backend-tools/index.ts; supabase/migrations/20261120120000_domain_audit_rpc.sql; árvore completa do repositório.

### Edvania-v2
README.md; package.json; ATTRIBUTION.md; NOTICE; LICENSE; src/services/whatsapp.js; src/services/webhook.js; src/services/aiChatbot.js; src/middleware/auth.js; src/utils/crypto.js; src/models/Session.js; src/models/ChatMessage.js; src/routes/api.js; src/routes/chats.js; src/routes/auth.js; src/routes/autoReply.js; páginas admin e testes.

**Limite de evidência:** esta análise foi feita por leitura da árvore, README, manifests, documentação e módulos seleccionados através da GitHub API. Não foi executado código de nenhum dos repositórios nesta análise. O Copilot deve validar comportamentos no código actual e executar testes antes de os considerar comprovados.
