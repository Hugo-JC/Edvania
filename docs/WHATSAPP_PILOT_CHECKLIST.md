# WhatsApp pilot readiness checklist

**Current state: PILOT SOFTWARE READY (PENDING REMOTE DB MIGRATION & SECRETS FOR PRODUCTION PERSISTENCE).** The Baileys v7 adapter (`baileys-runtime.server.ts`), encrypted auth state adapter (`baileys-auth-adapter.server.ts`), `/assistant` UI panel, and live AI integration (`@google/genai`) are implemented and verified locally. Before enabling long-lived multi-restart production sessions on real merchant numbers, verify the PostgreSQL gates below.

## Readiness gates

- [ ] Run all pending migrations and SQL integration tests (`20261121080000`, `20261121100000`, `20261122090000`, `20261123080000`) in the target PostgreSQL/Supabase environment.
- [ ] Verify `store_id`/connection isolation, RLS, grants, RPC fencing, inbox pagination, and concurrent duplicate delivery in PostgreSQL.
- [x] Complete the server-only provider adapter (`baileys-runtime.server.ts`) and prove that only authorized operators can view an ephemeral QR or change connection state (`authorizeWhatsAppManagerRoute`).
- [x] Integrate encrypted credential persistence (`baileys-auth-adapter.server.ts` -> `createServerEncryptedCredentialStore`) with fail-closed RAM isolation when `WHATSAPP_CREDENTIALS_KEYRING` / `SUPABASE_SECRET_KEY` are absent.
- [x] Connect inbound persistence to the connection-resolved tenant (`baileys-runtime.server.ts` + `/api/whatsapp/webhook`) with deduplication.
- [x] Connect outbound dispatch to atomic claim/finalization RPCs and unified Baileys + Sandbox outbox sender.
- [x] Complete the authenticated inbox/connection UI (`/assistant` & `/whatsapp`), LLM controls and limits (`/api/assistant/health`, daily store budget), confirmation persistence (`confirmations.server.ts`), and audit trail.
- [ ] Pass CI workflow and configure `SUPABASE_SECRET_KEY` + `WHATSAPP_CREDENTIALS_KEYRING` in deployment secrets before persistent pilot rollout.

Do not treat a green TypeScript build or mock tests as proof that any remote PostgreSQL gate above passed.

## Pairing and operation (future authorized sandbox only)

Pairing is blocked until every readiness gate is verified and a named operator has written authorization for a disposable sandbox account. QR codes must be short-lived, served only after server-side tenant/role authorization, excluded from logs and analytics, and invalidated on disconnect, expiry, logout, or ownership change. Never copy a QR into tickets, chat, screenshots, or source control.

During an authorized sandbox run, record only tenant-scoped connection status, timestamps, queue counts, and sanitized error codes. Do not log message bodies, authentication state, tokens, phone numbers, or QR content. Stop dispatch immediately if tenant scope, lease ownership, or provider delivery state is uncertain.

## Troubleshooting and recovery

- **QR expired:** request a fresh QR only through the authorized connection flow; do not reuse cached QR state.
- **Repeated connection failures:** allow only configured bounded retries; inspect sanitized provider error codes, then stop and investigate rather than increasing retries blindly.
- **Inbound duplicate:** retain the existing message/job identified by provider + connection + external message ID; never repeat a commercial operation because a message was redelivered.
- **Expired outbound lease or ambiguous provider result:** mark `unknown`; reconcile through provider evidence before any manual retry.
- **Unexpected tenant or authorization mismatch:** pause the affected connection and queues, preserve audit evidence, and do not continue on a guessed tenant.
- **Lost encryption key/version:** fail closed; do not fall back to plaintext, an older unverified format, or another tenant's key.

## Key rotation and backup/restore

Keep all credential-encryption keys outside the database, repository, logs, and client bundles. Maintain an active key version plus only the older versions required for decrypting existing records. Before rotation, test decrypt/re-encrypt in an isolated environment, verify tenant/connection/session authenticated data, and retain a recoverable encrypted backup under the approved retention policy. Remove an old version only after every required record is migrated and restore has been tested. The current repository contains encryption primitives but does not yet persist Baileys credentials or implement operational rotation.

Restore must be tested in an isolated environment with a deliberate tenant/connection/session match. A failed authentication tag or missing key version is a stop condition; never bypass it by changing the associated context.

## Incident response

1. Pause the affected connection and outbound dispatcher without deleting jobs or audit records.
2. Revoke the provider session through an authorized operator and preserve sanitized timestamps/error codes.
3. If credential exposure is suspected, rotate the external keyring and provider session; do not export plaintext auth state.
4. Determine whether any outbound item is `unknown` before considering a retry.
5. Resume only after tenant isolation, key recovery, and pending queue state are independently verified and approval is renewed.

These are proposed controls, not evidence that the corresponding runtime procedures or systems exist today.
