import test from "node:test";
import assert from "node:assert/strict";
import {executeAssistantTool} from "./assistant-tools.ts";

const context = {
  storeId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
};

function createHandlers() {
  const calls = [];
  return {
    calls,
    handlers: {
      async searchProducts(...args) {
        calls.push(["searchProducts", ...args]);
        return {ok: true, data: [{id: "product-1", name: "Arroz", sale_price: 10, cost_price: 7, unit: "kg", supplier_secret: "private"}]};
      },
      async getProductDetails(...args) {
        calls.push(["getProductDetails", ...args]);
        return {ok: true, data: {id: args[1], name: "Arroz", sale_price: 10, cost_price: 7, unit: "kg"}};
      },
      async checkStock(...args) {
        calls.push(["checkStock", ...args]);
        return {ok: true, data: [{product_id: args[1], quantity_on_hand: 8, location_id: "private-location"}]};
      },
    },
  };
}

test("assistant tools call only the read-only, tenant-scoped service allowlist", async () => {
  const {handlers, calls} = createHandlers();
  const result = await executeAssistantTool(context, "search_products", {query: "Arroz", limit: 3}, handlers);

  assert.deepEqual(calls, [["searchProducts", context, "Arroz", 3]]);
  assert.deepEqual(result, {
    ok: true,
    data: [{id: "product-1", name: "Arroz", sale_price: 10, unit: "kg"}],
  });
});

test("assistant tools reject unknown, malformed, and wildcard queries before calling services", async () => {
  const {handlers, calls} = createHandlers();

  assert.equal((await executeAssistantTool(context, "create_sale", {}, handlers)).ok, false);
  assert.equal((await executeAssistantTool(context, "search_products", {query: "%", limit: 3}, handlers)).ok, false);
  assert.equal((await executeAssistantTool(context, "check_stock", {productId: "not-a-uuid"}, handlers)).ok, false);
  assert.equal(calls.length, 0);
});

test("assistant tool failures remain failures and stock output omits location identifiers", async () => {
  const {handlers} = createHandlers();
  const failed = await executeAssistantTool(context, "get_product_details", {productId: "33333333-3333-4333-8333-333333333333"}, {
    ...handlers,
    async getProductDetails() {
      return {ok: false, error: {code: "DEPENDENCY", message: "Unavailable", retryable: true}};
    },
  });
  const stock = await executeAssistantTool(context, "check_stock", {productId: "33333333-3333-4333-8333-333333333333"}, handlers);

  assert.equal(failed.ok, false);
  assert.deepEqual(stock, {
    ok: true,
    data: [{product_id: "33333333-3333-4333-8333-333333333333", quantity_on_hand: 8}],
  });
});
