# Edvânia — Rastreador Mestre de Conclusão

**Fonte de referência:** `Edvania_Plano_Mestre_Metas_e_Criterios_de_Conclusao.docx`, versão 1.0, 23/11/2026  
**Repositório:** `Hugo-JC/Edvania`  
**Branch observada:** `hugo-pc21-edvania-plano-mestre`  
**HEAD observado:** `13b87875554388e0e2119158f9fe3d56b4f90cbc`  
**Data desta revisão:** 23/11/2026  
**Estado Git observado antes desta edição:** worktree limpa; sem ficheiros staged, unstaged ou untracked

## Estados e prioridades

- Estados: `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `ACCEPTED`.
- Apenas o responsável pelo produto pode mudar `DONE` para `ACCEPTED` quando exigir aprovação humana.
- `P0`: segurança ou integridade; `P1`: piloto ou operação essencial; `P2`: conclusão de funcionalidade anunciada; `P3`: dívida/qualidade aceite.
- Uma observação em código ou num relatório não constitui conclusão. Evidência exige comando, ambiente, commit, resultado e artefacto verificáveis.

## Resumo executivo

| ID | Fase | Estado | Prioridade | Próxima ação |
|---|---|---|---|---|
| EDV-P0 | Baseline e inventário | DONE | P1 | Manter o baseline actualizado após novas alterações |
| EDV-P1 | Estabilização e dependências | BLOCKED | P1 | Confirmar o diff, a versão Zod, testes, audit e relatório da Fase 1 |
| EDV-P2 | PostgreSQL, migrations, RLS e isolamento | BLOCKED | P1 | Obter PostgreSQL/Supabase descartável autorizado e executar a suite SQL |
| EDV-P3 | Integridade transaccional e domínio comercial | NOT_STARTED | P0/P1 | Definir/revisar âmbito comercial, regressão E2E e reconciliação |
| EDV-P4 | Confirmações seguras e ações sensíveis | NOT_STARTED | P0 | Implementar apenas após P2/P3 e garantir compare-and-consume na base |
| EDV-P5 | WhatsApp sandbox e operação controlada | BLOCKED | P1/P2 | Decidir provider/termos e obter contas sandbox autorizadas |
| EDV-P6 | IA, ferramentas e quotas | NOT_STARTED | P1/P2 | Configurar provider testável e completar allowlist, quotas e avaliação |
| EDV-P7 | Pagamentos e reconciliação | BLOCKED | P1/P2 | Confirmar contrato e credenciais de sandbox do provider contratado |
| EDV-P8 | Contexto angolano, fiscalidade e conformidade | BLOCKED | P1 | Obter validação por fontes/profissional competente |
| EDV-P9 | Observabilidade, backups e recuperação | NOT_STARTED | P1 | Definir RPO/RTO, alertas, restore e runbooks |
| EDV-P10 | QA integral, piloto e lançamento | NOT_STARTED | P0/P1 | Preparar staging/sandbox e checklist apenas após aprovação |

---

## EDV-P0 — Baseline e inventário

- **Estado:** `DONE`
- **Prioridade:** P1
- **Responsável:** GitHub Copilot / responsável técnico
- **Objetivo:** manter uma fotografia verificável do repositório, branches, worktrees, módulos, migrations, dependências, CI e lacunas.

### Critérios detalhados

- Inventariar branch, HEAD, worktrees, commits, diffs staged/unstaged/untracked e relação com `origin`.
- Inventariar rotas, Server Actions, módulos de domínio, tabelas, RPCs, migrations, policies e testes.
- Separar explicitamente confirmado, observado apenas no código, não testado e desconhecido.
- Produzir mapa de funcionalidades e matriz de riscos priorizada.
- Manter o repositório sem alterações remotas e sem afirmações de prontidão de produção.

### Dependências

- Nenhuma; serve de entrada para P1-P10.

### Riscos

- Risco P1 de confundir código existente com comportamento validado.
- Risco P1 de usar documentos ou snapshots antigos como estado remoto actual.

### Evidência existente

- Branch/worktree/HEAD capturados nesta revisão.
- Worktree limpa antes da criação deste tracker.
- Consolidação em 23/11/2026: HEAD `13b87875554388e0e2119158f9fe3d56b4f90cbc`; branch `hugo-pc21-edvania-plano-mestre`.
- Esta worktree continha apenas `docs/PROJECT_COMPLETION_TRACKER.md` como alteração untracked após a criação do tracker.
- `git worktree list --porcelain` confirmou uma worktree principal, uma worktree detached de prewarm e duas worktrees Edvânia.
- Nenhuma alteração foi copiada ou aplicada automaticamente a partir de outra worktree.
- Auditoria comunicada: branch principal `main`, commit `3ba1c11b9abf82751b54fe5fbb7ad019a715bbee`, CI run `45060940688` aprovado.
- O estado remoto de migrations, RLS, backups/restores e advisors não foi confirmado diretamente nesta revisão.

### Commit/data

- Commit da verificação desta revisão: `13b87875554388e0e2119158f9fe3d56b4f90cbc`
- Data: 23/11/2026

### Próximo passo

Manter esta evidência ligada ao HEAD e ao estado Git desta worktree.

---

## EDV-P1 — Estabilização e dependências

- **Estado:** `BLOCKED`
- **Prioridade:** P1
- **Responsável:** GitHub Copilot / responsável técnico
- **Objetivo:** confirmar estabilização de dependências e regressões sem alterar trabalho preexistente.

### Critérios detalhados

- Confirmar a versão instalada de Zod sem advisory aplicável e consistência de `package.json`/`package-lock.json`.
- Executar `npm ci`, testes, typecheck, lint, build, `git diff --check` e auditoria de dependências aplicável.
- Guardar comandos, versão do runtime e resultados sem secrets.
- Separar alterações desta fase das alterações preexistentes.
- Confirmar o relatório `docs/audits/FASE-1-ESTABILIZACAO.md`, se exigido pelo processo.

### Dependências

- P0 para contexto Git e inventário.

### Riscos

- Risco P1 de declarar dependências estáveis sem reproduzir as verificações no HEAD final.
- Risco P1 de regressão por package-lock ou versão incompatível.

### Evidência requerida

- Versão Zod instalada.
- Saída curta de `npm ci`, testes, typecheck, lint, build, diff check e `npm audit --omit=dev`.
- Relatório Fase 1 presente e ligado ao HEAD verificado.

### Evidência confirmada em 23/11/2026

- `npm ci` concluiu com código de saída 0 e instalou 355 pacotes; a saída reportou 356 pacotes auditados e 1 vulnerabilidade de alta severidade.
- `npm ls zod --all` confirmou Zod efectivo `4.1.12` nesta worktree.
- `package.json` declara Zod `4.1.12`.
- `package-lock.json` declara Zod `4.1.12` no pacote raiz e efectivo `node_modules/zod@4.1.12`, com resolved URL para `zod-4.1.12.tgz`.
- `npm audit --omit=dev` terminou com código de saída 1 e encontrou Zod `<4.6.6` vulnerável; a correção indicada é Zod `4.6.7`.
- Estado Git desta worktree: branch `hugo-pc21-edvania-plano-mestre`, HEAD `13b87875554388e0e2119158f9fe3d56b4f90cbc`, apenas `docs/PROJECT_COMPLETION_TRACKER.md` está untracked.
- Foi encontrado o relatório `docs/audits/FASE-1-ESTABILIZACAO.md` na worktree `hugo-pc21-supreme-spoon` (`hugo-pc21-edvania-implementation`) sem cópia ou alteração automática.
- Nesse relatório, a worktree anterior comunica Zod `4.6.7`, testes 48/48, typecheck, lint, build e `npm audit --omit=dev` sem vulnerabilidades. Esses resultados não são reaplicados nem considerados validados nesta worktree atual.

### Proposta prevista — não executada

Se a actualização Zod for aprovada para esta worktree, o diff previsto é limitado a:

- `package.json`: `"zod": "4.1.12"` → `"zod": "4.6.7"`.
- `package-lock.json`: versão raiz Zod `4.1.12` → `4.6.7`.
- `package-lock.json`: entrada `node_modules/zod`:
  - `4.1.12` → `4.6.7`
  - resolved de `zod-4.1.12.tgz` → `zod-4.6.7.tgz`
  - integrity corresponde à versão 4.6.7 já registrada noutra worktree, mas deve ser regenerada/reconfirmada nesta worktree pelo npm.
- Nenhum ficheiro de código, migration, workflow, secret ou configuração é incluído nesta proposta.

### Commit/data

- Commit desta verificação: `13b87875554388e0e2119158f9fe3d56b4f90cbc`.
- Data: 23/11/2026.
- A actualização Zod não foi aplicada.

### Próximo passo

Aguardar validação da proposta Zod 4.6.7 nesta worktree correcta; não alterar dependências nesta etapa.

---

## EDV-P2 — PostgreSQL, migrations, RLS e isolamento multi-tenant

- **Estado:** `BLOCKED`
- **Prioridade:** P1
- **Responsável:** GitHub Copilot com infraestrutura PostgreSQL/Supabase autorizada
- **Objetivo:** provar que o modelo de dados e a autorização resistem a acesso cruzado, falsificação de tenant e concorrência.

### Critérios detalhados

- Comparar migrations locais com o schema remoto por mecanismo oficial/read-only, sem aplicar migrations.
- Criar ambiente PostgreSQL descartável alinhado à versão/extensões usadas.
- Aplicar e testar migrations do domínio/auditoria, WhatsApp durável e confirmações apenas no ambiente descartável.
- Inventariar tabelas, views, funções, triggers, índices, constraints, grants, roles e policies RLS.
- Testar dois tenants e utilizadores em leitura, criação, edição, eliminação, RPCs, joins, views e Storage.
- Testar ausência de membership, membership revogada, tenant inválido e tentativa de falsificar `tenant_id/store_id`.
- Auditar funções `SECURITY DEFINER`, `search_path`, EXECUTE/grants e ownership.
- Garantir índices em tenant keys e chaves de junção relevantes.

### Dependências

- P0/P1.
- PostgreSQL/Supabase descartável disponível.
- Autorização para inspeção remota apenas read-only.

### Riscos

- P0: bypass de RLS, ownership ou tenant pode expor dados entre lojas.
- P1: migrations locais não correspondem ao schema remoto.
- P1: falta de testes SQL pode deixar RPC concorrentes ou idempotência não comprovadas.

### Evidência existente

- Código contém migrations locais para auditoria e processamento WhatsApp, mas não estão executadas/aprovadas nesta revisão.
- Não há evidência confirmada de testes Postgres, RLS remota ou migrations remotas neste tracker.

### Evidência requerida

- Versão PostgreSQL, migrations aplicadas, schema diff, suite SQL positiva/negativa e output sanitizado.
- Inventário remoto/descartável e divergências.
- Nenhuma migration remota aplicada sem aprovação.

### Commit/data

- Nenhum; P2 não concluída.

### Próximo passo

Obter acesso a um ambiente descartável autorizado e disponibilizar ferramentas de PostgreSQL/Supabase.

---

## EDV-P3 — Integridade transaccional e domínio comercial

- **Estado:** `NOT_STARTED`
- **Prioridade:** P0/P1
- **Responsável:** equipa técnica
- **Objetivo:** fechar os fluxos operacionais e financeiros aprovados do núcleo comercial.

### Critérios detalhados

- Lojas/empresas, membros, papéis, convites e isolamento completos.
- Produtos/categorias, clientes/fornecedores, vendas, compras, stock e caixa com ciclo de vida aprovado.
- Compras suportam recepção total/parcial apenas se aprovado.
- Cancelamentos/devoluções/crédito usam lançamentos compensatórios; não apagam histórico.
- Movimentos de stock têm origem, motivo, actor, timestamp e referência; saldo reconciliável.
- Ajustes exigem papel/motivo/auditoria; regras de saldo negativo documentadas.
- Caixa abre/fecha, reconcilia movimentos e explica diferenças.
- Auditoria registra actor, tenant, ação, entidade, ID, timestamp, origem e resultado.
- Dashboards reconciliam documentos, pagamentos, stock e caixa por tenant/período.
- Máquinas de estado e transições válidas existem para vendas, compras, pagamentos, stock e caixa.
- Testes cobrem concorrência, retries, rollback e idempotência.

### Dependências

- P2.
- Escopo comercial e regras de descontos/impostos aprovados.

### Riscos

- P0: corrupção de stock, caixa, pagamentos ou auditoria.
- P1: operação não transacional ou replay gera duplicação.

### Evidência requerida

- Testes E2E por caso de uso.
- Testes SQL de rollback/concorrência/idempotência.
- Reconciliação de documentos, pagamentos, stock e caixa.
- Matriz de papéis e auditoria verificável.

### Commit/data

- Pendente.

### Próximo passo

Depois da aprovação de implementação, rever P2 e fechar gaps por fluxo, sem mudar schema remoto.

---

## EDV-P4 — Confirmações seguras e ações sensíveis

- **Estado:** `NOT_STARTED`
- **Prioridade:** P0
- **Responsável:** equipa técnica
- **Objetivo:** impedir mutações sem autorização válida, vínculo de contexto e uso único.

### Critérios detalhados

- Vincular confirmação a tenant, utilizador, conversa, ação e fingerprint/payload.
- Validar TTL mínimo/máximo na aplicação e na RPC.
- Garantir uso único/write-once e resultado não substituível.
- Usar chave/idempotency constraints resistentes a concorrência.
- Revalidar autorização ao consumir; invalidar contexto alterado, payload alterado ou expiração.
- Nunca considerar resposta da IA como autorização isolada.
- Testar replay, expiração, concorrência, falha parcial e troca de tenant/user/conversa.

### Dependências

- P2 e P3.
- RPC/constraints persistentes validadas.

### Riscos

- P0: mutação duplicada, resultado reutilizado ou alteração de payload.
- P0: confirmação enganada por alteração de contexto.

### Evidência requerida

- Suite negativa/concorrência.
- Garantia SQL/transactional, não apenas in-memory.
- Diff e migration em ambiente descartável.

### Commit/data

- Pendente.

### Próximo passo

Não implementar até P2 validar persistência, e P3 definir os executores comerciais seguros.

---

## EDV-P5 — WhatsApp sandbox e operação controlada

- **Estado:** `BLOCKED`
- **Prioridade:** P1/P2
- **Responsável:** equipa técnica e responsável pelo produto
- **Objetivo:** concluir integração de mensagens durável sem comprometer contas, privacidade ou consistência.

### Critérios detalhados

- Separar provider, sessão, ingressão, processamento, outbox e envio.
- Validar assinatura, payload, tamanho, rate limit e deduplicação do webhook.
- Persistir inbound/outbound, estado, tentativas, leases, `next_retry_at` e dead-letter.
- Recuperar após restart/lease/falha sem dois workers enviarem a mesma mensagem.
- Usar backoff com jitter, limite de tentativas e circuit breaker.
- Validar compatibilidade/termos antes de escolher e integrar Baileys ou outro provider.
- Cifrar credenciais, gerir/rotacionar chave e impedir logs de QR/tokens.
- Testar sandbox autorizado: reconnect, logout, restart, timeout, rede, callback e duplicação.
- Implementar opt-in, identificação, consentimento, preferências e opt-out antes de mensagens a clientes.
- Proibir campanhas/spam e mensagens comerciais sem consentimento adequado.

### Dependências

- P2.
- Decisão de provider e modelo de consentimento.
- Contas/números sandbox autorizados.

### Riscos

- P0: mensagem enviada sem consentimento, credencial exposta ou operação comercial indevida.
- P1: worker duplicado, callback obsoleto ou lease perdido.
- P2: piloto bloqueado sem webhook/provider/worker testado.

### Evidência requerida

- Testes sandbox completos.
- Execução/recuperação após restart.
- Dedupe, outbox, leases e opt-out comprovados.
- Monitorização e runbook.

### Commit/data

- Pendente; nenhuma ligação ou envio real ocorreu nesta revisão.

### Próximo passo

Confirmar o provider/termos e obter aprovação separada para sandbox; nenhuma conta real deve ser ligada.

---

## EDV-P6 — IA, ferramentas e quotas

- **Estado:** `NOT_STARTED`
- **Prioridade:** P1/P2
- **Responsável:** equipa técnica
- **Objetivo:** tornar a IA útil sem autoridade indevida ou exposição excessiva de dados.

### Critérios detalhados

- Provider independente de fornecedor e configurável por ambiente.
- Allowlist explícita; consultas read-only por omissão; autorização/tenant scope no servidor.
- Toda ação mutável passa por P4 e validação de domínio; nenhum SQL arbitrário.
- Separar dados e instruções; proteger contra prompt injection e pedidos por dados recuperados.
- Sanitizar/máscarar dados pessoais, financeiros e secrets.
- Timeout, retries limitados, fallback validado e tratamento de 429/5xx.
- Quotas persistentes por tenant/utilizador/provider/modelo/período com concorrência e orçamento.
- Logs mínimos com latência/tokens/custo/fallback, sem conteúdo sensível desnecessário.
- Avaliar qualidade, alucinação e casos adversariais em português de Angola.

### Dependências

- P2/P4.
- Provider/modelos, limites e termos confirmados.

### Riscos

- P0: fuga de dados ou operação não autorizada.
- P1: custo ilimitado, rate limit ausente ou fallback silencioso.
- P2: IA incorreta em contexto comercial.

### Evidência requerida

- Suite de avaliação.
- Testes negativos de prompt injection.
- Quotas persistentes e isolamento.
- Política de privacidade/retenção.

### Commit/data

- Pendente.

### Próximo passo

Resolver provider/modelos e implementar via fronteira testável após P4 estar disponível.

---

## EDV-P7 — Pagamentos e reconciliação

- **Estado:** `BLOCKED`
- **Prioridade:** P1/P2
- **Responsável:** equipa técnica e responsável comercial
- **Objetivo:** suportar métodos contratados para Angola com sandbox e reconciliacão segura.

### Critérios detalhados

- Confirmar contrato, documentação, credenciais sandbox e capacidades reais.
- Implementar estados explícitos: criado, pendente, confirmado, falhado, expirado, cancelado e reembolsado quando suportado.
- Validar montantes AOA, precisão decimal, entidade/referência, expiração WAT e dados necessários.
- Validar callback conforme provider e comparar assinatura em tempo constante quando aplicável.
- Garantir idempotência por identificador externo/evento; evitar dupla liquidação ou dupla baixa de stock.
- Implementar reconciliação/poll apenas conforme API contratada.
- Testar callbacks fora de ordem, repetição, atraso, timeout, estorno e falha entre provider/BD.
- Separar sandbox e produção; nunca colocar secrets no repositório ou relatório.

### Dependências

- P2/P3/P4.
- Contrato, docs e credenciais sandbox confirmados.
- Escopo aprovações para ProxyPay/OPG/Multicaixa Express.

### Riscos

- P0: cobrança duplicada, dupla baixa ou perda de reconciliação.
- P1: assinatura/callback incorreto ou falha entre sistemas.

### Evidência requerida

- Cenários sandbox repetíveis.
- Ledger interno reconciliado.
- Idempotência e recuperação simuladas.
- Plano de reversão e aprovação separada para produção.

### Commit/data

- Pendente; nenhuma ativação real está autorizada.

### Próximo passo

Resolver contrato/provider e manter toda a implementação em sandbox até aprovação separada.

---

## EDV-P8 — Contexto angolano, fiscalidade e conformidade

- **Estado:** `BLOCKED`
- **Prioridade:** P1
- **Responsável:** responsável do produto com validação profissional
- **Objetivo:** assegurar que moeda, timezone, dados locais e regras aplicáveis sejam correctos, versionados e validados.

### Critérios detalhados

- Definir AOA/formatação, WAT, telefones `+244` e validações legais apenas quando confirmadas.
- Versionar províncias/municípios a partir de fonte oficial atualizada.
- Confirmar regras fiscais, documentos, taxas, retenções e facturação com legislação/profissional competente.
- Registrar fonte e data para cada regra; evitar alterar retroativamente documentos emitidos.
- Definir privacidade, consentimento, retenção, direitos do titular e resposta a incidentes.

### Dependências

- Fontes oficiais.
- Validação profissional competente.
- Decisões de âmbito e regras locais.

### Riscos

- P0/P1: alegação incorreta de conformidade ou cálculo/documento fiscal errado.
- P2: dados geográficos desatualizados ou UX incorrecta.

### Evidência requerida

- Matriz de requisitos com fonte, data e responsável.
- Validação competente.
- Nenhuma alegação de conformidade sem evidência.

### Commit/data

- Pendente.

### Próximo passo

Marcar cada requisito como aprovado/apresentação limitada/pendente; não implementar regras fiscais não validadas.

---

## EDV-P9 — Observabilidade, backups, recuperação e segurança operacional

- **Estado:** `NOT_STARTED`
- **Prioridade:** P1
- **Responsável:** operações técnica
- **Objetivo:** tornar falhas visíveis, recuperar dados e operar o sistema com limites conhecidos.

### Critérios detalhados

- Logs estruturados com correlação por request/job/evento.
- Métricas de erro, latência, filas, retries, quotas e consumo.
- Alertas testados para webhook, backlog, jobs, pagamentos, auth e storage.
- Política de backup/retensão cifrada e cópia fora do ambiente principal quando viável.
- Restore ensaiado em ambiente separado; RPO/RTO aprovados.
- Runbooks para incidentes, secrets, revogação, worker, rollback e comunicação.
- Rever dependências, headers, CORS, CSRF, SSRF, rate limiting, access control, upload, exportações e abuso.

### Dependências

- P2-P7 conforme serviços a observar.
- Infraestrutura de monitorização/backups/restore disponível.

### Riscos

- P0: perda de dados ou incapacidade de responder a incidente.
- P1: alerta não acionável ou worker/integração fora de controlo.

### Evidência requerida

- Alertas testados.
- Restore ensaiado.
- RPO/RTO documentados.
- Runbooks executados em teste.
- Vulnerabilidades críticas/altas resolvidas ou aceites formalmente.

### Commit/data

- Pendente.

### Próximo passo

Definir RPO/RTO e o ambiente mínimo de ensaio antes de implementar a infraestrutura operacional.

---

## EDV-P10 — QA integral, piloto e lançamento

- **Estado:** `NOT_STARTED`
- **Prioridade:** P0/P1
- **Responsável:** equipa técnica e responsável pelo produto
- **Objetivo:** demonstrar prontidão integral e executar piloto somente com aprovação.

### Critérios detalhados

- Unitários, integração, SQL, RLS, E2E, regressão, acessibilidade e desempenho adequados ao risco.
- Aceitação com utilizadores de teste e dados sintéticos.
- Staging equivalente à produção com secrets separados e integrações sandbox.
- Plano de release, rollback, migração, monitorização, suporte e responsável operacional.
- Piloto limitado apenas com aprovação, contas/lojas autorizadas, consentimentos e plano de interrupção.
- Fechar bugs P0/P1; P2 só permanece com aceite formal e sem impacto em segurança/dados/operação essencial.
- Checklist assinada, testes críticos aprovados e ausência de bloqueadores críticos/altos.

### Dependências

- P0-P9 concluídos ou formalmente aceites.
- Aprovação separada para piloto/produção.

### Riscos

- P0: lançamento antes de validação de segurança, dados ou integridade financeira.
- P1: rollback/incidente sem suporte operacional.

### Evidência requerida

- Relatórios de QA completos.
- Checklist de lançamento assinada.
- Staging/sandbox e plano de rollback.
- Aprovação explícita do responsável pelo produto.

### Commit/data

- Pendente.

### Próximo passo

Não preparar ativo nem executar piloto até todas as dependências obrigatórias estarem resolvidas.

---

## Bloqueios conhecidos e decisões pendentes

| Tema | Estado | Decisão/bloqueio necessário | Próxima ação segura |
|---|---|---|---|
| Confirmação final da Fase 1 | BLOCKED | Confirmar diff, Zod, package-lock, relatório e verificações no HEAD actual | Verificação documental/local |
| PostgreSQL/Supabase | BLOCKED | Ambiente descartável e acesso oficial/read-only | Inspecionar sem aplicar migrations |
| Provider WhatsApp | BLOCKED | Provider, termos, compatibilidade e contas sandbox | Nenhuma ligação real |
| Provider pagamentos | BLOCKED | Contrato/capacidades/credenciais sandbox | Nenhuma cobrança real |
| Regras angolanas | BLOCKED | Validação competente e fontes oficiais | Nenhuma alegação fiscal |
| IA | NOT_STARTED/BLOQUEADO a confirmar | Providers/modelos, limites, preços e termos | Nenhuma chave real no código |
| RPO/RTO/retention | NOT_STARTED | Valores aprovados por responsável | Documentar requisitos |

## Matriz de evidências obrigatórias

| Área | Evidência mínima |
|---|---|
| Código | Diff revisto, commit base, ficheiros, análise estática e revisão de segurança |
| Testes | Comandos exactos, runtime, resultado, logs sem secrets e cobertura relevante |
| Base de dados | Ambiente descartável, migrations, schema diff, testes SQL/RLS positivos/negativos |
| Integrações | Versão/documentação do provider, sandbox, payloads anonimizados, retry e falha simulada |
| Operação | Métricas, alertas testados, backup/restore ensaiado e runbooks |
| Legal/Angola | Fontes oficiais datadas e validação profissional |
| Lançamento | Checklist assinada, aprovação, rollback e plano de suporte |

## Condições para conclusão global

A Edvânia só pode ser declarada concluída quando todos os IDs obrigatórios estiverem `ACCEPTED`, não existirem P0/P1 abertos, todas as funcionalidades aprovadas tiverem E2E/evidência, o isolamento multi-tenant tiver sido testado negativamente, operações financeiras/stock forem transacionais e idempotentes, confirmações forem write-once na base, integrações tiverem sandbox aprovado, quotas/custos forem controláveis, backup/restore estiver comprovado e o responsável pelo produto aprovar formalmente.
