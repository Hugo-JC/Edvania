import test from "node:test";
import assert from "node:assert/strict";
import {prepareOperationConfirmation} from "./confirmations.ts";
import {
  confirmOperationWithRecovery,
  InMemoryConfirmationDraftStore,
  InMemoryConfirmationRecoveryStore,
} from "./confirmations-recovery.ts";
import {InMemoryConfirmationStore} from "./confirmations-store.ts";

const context = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  conversationId: "33333333-3333-4333-8333-333333333333",
};

const saleInput = {
  items: [{productId: "44444444-4444-4444-8444-444444444444", quantity: 1}],
  paymentMethod: "cash",
  paidAmount: 500,
};

test("confirmOperationWithRecovery returns cached outcome on retry without re-executing RPC", async () => {
  const confirmationStore = new InMemoryConfirmationStore();
  const recoveryStore = new InMemoryConfirmationRecoveryStore();
  let now = Date.parse("2026-11-22T10:00:00.000Z");
  const preview = async () => ({summary: "Venda de 1 artigo · 500 AOA", fingerprintData: {total: 500}});

  const prepared = await prepareOperationConfirmation(context, "create_sale", saleInput, preview, confirmationStore, {
    now: () => now,
  });

  let executions = 0;
  const executor = async () => {
    executions += 1;
    return {ok: true, data: {saleId: "55555555-5555-4555-8555-555555555555"}};
  };

  const first = await confirmOperationWithRecovery(
    context,
    "create_sale",
    saleInput,
    prepared.token,
    preview,
    confirmationStore,
    executor,
    recoveryStore,
    {nowMs: now + 1_000},
  );
  const retry = await confirmOperationWithRecovery(
    context,
    "create_sale",
    saleInput,
    prepared.token,
    preview,
    confirmationStore,
    executor,
    recoveryStore,
    {nowMs: now + 2_000},
  );

  assert.equal(executions, 1);
  assert.deepEqual(first, retry);
});

test("InMemoryConfirmationDraftStore isolates drafts by tenant/user and expires stale previews", () => {
  const drafts = new InMemoryConfirmationDraftStore();
  const expiresAt = "2026-11-22T10:05:00.000Z";
  drafts.save({
    draftId: "draft-1",
    context,
    operation: "create_sale",
    input: saleInput,
    token: "secret-token-value",
    summary: "Venda teste",
    expiresAt,
  });

  assert.equal(
    drafts.getForContext("draft-1", "99999999-9999-4999-8999-999999999999", context.userId, Date.parse("2026-11-22T10:01:00.000Z")),
    null,
  );
  assert.equal(
    drafts.getForContext("draft-1", context.tenantId, "99999999-9999-4999-8999-999999999999", Date.parse("2026-11-22T10:01:00.000Z")),
    null,
  );
  assert.equal(
    drafts.getForContext("draft-1", context.tenantId, context.userId, Date.parse("2026-11-22T10:01:00.000Z"))?.summary,
    "Venda teste",
  );
  assert.equal(
    drafts.getForContext("draft-1", context.tenantId, context.userId, Date.parse("2026-11-22T10:06:00.000Z")),
    null,
  );
});

