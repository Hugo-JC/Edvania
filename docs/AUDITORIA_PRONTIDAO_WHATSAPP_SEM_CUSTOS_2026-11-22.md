# Edvânia — auditoria de prontidão sem custos (22/11/2026)

## Âmbito e método

Revisão estática do repositório `Hugo-JC/Edvania` (branch `main`), consulta read-only ao projecto Supabase `uableowfhkmgpfelfwpn`, leitura dos migrations, testes SQL, checklist do piloto, workflow CI e logs do último job.

**Não foram executados DDL/DML, migrations, pairing WhatsApp, envios, deploys ou alterações à base de dados.** Não foi criada uma Supabase branch paga. Esta revisão não substitui testes reais em PostgreSQL.

## Resultado executivo

**Estado: NÃO PRONTO para ligar número real ou abrir piloto WhatsApp.**

A documentação `docs/WHATSAPP_PILOT_CHECKLIST.md` já declara `NOT READY`. A consulta remota confirma que as três migrations incrementais ainda não estão aplicadas. O último CI de `main` falhou antes de executar testes, typecheck, lint ou build.

## Evidência confirmada

### 1. Supabase remoto

- Projecto activo: PostgreSQL 17, região `eu-west-1`.
- Existem 15 migrations registadas; a mais recente é `20261120104412_atomic_cash_operations`.
- Não estão registadas:
  - `20261121080000_atomic_domain_audit`
  - `20261121100000_whatsapp_durable_processing`
  - `20261122090000_assistant_confirmations`
- A consulta ao catálogo remoto encontrou as tabelas base `whatsapp_connections`, `whatsapp_conversations`, `whatsapp_messages`, `baileys_auth_state` e `ai_usage_logs`.
- Não encontrou `whatsapp_jobs`, `whatsapp_outbox` ou `assistant_confirmations`.
- Também não encontrou as RPCs incrementais `write_audit_log`, `write_operation_audit_log`, `enqueue_whatsapp_inbound`, `claim_whatsapp_jobs`, `claim_whatsapp_outbox`, `create_assistant_confirmation` ou `consume_assistant_confirmation`.
- As tabelas base `baileys_auth_state` já expõem `encrypted_data` e `encryption_key_version`; isso não prova que o keyring externo, rotação e restore estejam operacionalmente configurados.

### 2. GitHub Actions / CI

Último run: [CI #86 — 45025081946](https://github.com/Hugo-JC/Edvania/actions/runs/45025081946), commit `0dd4299dbd62ad14bb95a7856679f5cd982ce23c`.

- Falhou no passo **Install dependencies**.
- Causa exacta: `npm ci` detectou divergência entre `package.json` e `package-lock.json`.
- O log lista dependências ausentes no lock, incluindo `@tailwindcss/postcss@4.3.5`, `lucide-react@1.77.0`, `motion@14.14.0` e `tailwindcss@4.3.5`.
- Os passos de testes de domínio/WhatsApp, TypeScript, lint e build foram ignorados. Portanto, o estado actual desses passos é **não validado neste commit**.
- O run anterior #85 passou antes do commit de upgrade; não valida o estado actual.

**Correcção necessária:** regenerar e commitar o lockfile com a mesma versão de npm usada no CI (Node 22 / npm 10.9.x), depois repetir o workflow completo. Não substituir `npm ci` por `npm install` no CI como atalho, pois isso remove a garantia de instalação reproduzível.

### 3. Migrations e testes SQL

- A migration de auditoria define wrappers transaccionais e auditoria idempotente. A revisão estática não demonstra execução PostgreSQL.
- A migration WhatsApp cria filas duráveis, leases e RPCs tenant-scoped; o respectivo teste SQL cobre deduplicação, isolamento de tenant, reclaim de leases, fencing, retries e resultado outbound ambíguo. Continua sem execução PostgreSQL.
- A migration de confirmações cria a tabela e RPCs de criação/consumo/recuperação de resultado.
- A pasta `supabase/tests` contém actualmente `cash_operations.sql`, `purchase_receipts.sql`, `sales_hardening.sql` e `whatsapp_durable_processing.sql`. Não foram encontrados testes dedicados `atomic_domain_audit.sql` ou `assistant_confirmations.sql`.
- Na migration de confirmações, a validação de expiração máxima (10 minutos) é feita no domínio segundo a documentação, mas não é repetida pela RPC SQL. Recomenda-se impor também o limite na camada SQL. A RPC `save_assistant_confirmation_result` permite actualizar novamente um resultado já gravado; confirmar se a intenção é write-once e, se for, acrescentar condição `result_json IS NULL`.

### 4. Advisors Supabase

- **Security:** aviso `auth_leaked_password_protection` — protecção contra palavras-passe comprometidas desactivada. [Documentação de remediação](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- **Performance:** uma FK sem índice — `purchases_created_by_fkey`. [Documentação de remediação](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
- Existem 31 avisos informativos de índices ainda não utilizados. Como a base é recente, não remover índices sem workload e medição.
- **Health:** sem avisos.

## Plano de correcção, sem criar recursos pagos

1. Regenerar `package-lock.json` e voltar a executar CI.
2. Corrigir eventuais falhas TypeScript/lint/build reveladas depois de o CI ultrapassar a instalação.
3. Acrescentar testes SQL dedicados para atomicidade da auditoria (rollback e replay) e confirmações (expiração, vínculo tenant/utilizador/conversa, consumo concorrente e recuperação de resultado).
4. Endurecer a RPC de confirmação para validar janela de expiração no banco e decidir/documentar se o resultado é write-once.
5. Validar as três migrations e todos os testes SQL num PostgreSQL descartável gratuito/local, ou numa instância de teste já disponível e autorizada. **Não aplicar na base principal para simular um ambiente descartável.**
6. Só depois actualizar `database.types.ts` a partir do schema realmente validado.
7. Completar worker/cron, provider Baileys server-only, autorização de QR, integração real com credenciais cifradas, rate limit/orçamento persistente e reconciliação outbound.
8. Reexecutar a checklist integral e obter autorização explícita antes de qualquer pairing ou envio real.

## Limites desta auditoria

- Sem Supabase branch: a criação anterior cotava US$ 0,01344/hora; não foi criada.
- Sem execução SQL de migrations ou testes no PostgreSQL.
- Sem acesso nem necessidade de receber `.env.local` ou segredos.
- Sem alterações à aplicação ou à base de dados nesta auditoria.
- A revisão estática pode identificar riscos e inconsistências, mas não certifica comportamento runtime.

## Decisão

Manter o piloto WhatsApp bloqueado. O primeiro bloqueio prático e gratuito é reparar o lockfile/CI; em paralelo, preparar testes PostgreSQL e reforçar as RPCs de confirmação antes de qualquer migração remota.
