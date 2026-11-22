import assert from "node:assert/strict";
import test from "node:test";
import { createMockSupabaseClient } from "./mock.ts";

function makeClientWithMemorySession() {
  let session = null;
  return createMockSupabaseClient({
    getSession: () => session,
    setSession: (next) => {
      session = next;
    },
  });
}

test("mock auth enforces duplicate signup rejection and salted password verification", async () => {
  const client = makeClientWithMemorySession();
  const uniqueEmail = `merchant-${Date.now()}-${Math.random()}@example.com`;

  const signup = await client.auth.signUp({
    email: uniqueEmail,
    password: "StrongPassword123!",
    options: { data: { full_name: "Ana Costa" } },
  });
  assert.equal(signup.error, null);
  assert.ok(signup.data.user?.id);

  const duplicate = await client.auth.signUp({
    email: uniqueEmail,
    password: "AnotherPassword123!",
  });
  assert.equal(duplicate.error?.message, "User already registered");

  await client.auth.signOut();

  const wrongPass = await client.auth.signInWithPassword({
    email: uniqueEmail,
    password: "WrongPassword!",
  });
  assert.equal(wrongPass.error?.message, "Invalid login credentials");

  const validPass = await client.auth.signInWithPassword({
    email: uniqueEmail,
    password: "StrongPassword123!",
  });
  assert.equal(validPass.error, null);
  assert.equal(validPass.data.user?.email, uniqueEmail);
});

test("mock client isolates tenants and requires active store membership on RPCs and queries", async () => {
  const owner = makeClientWithMemorySession();
  const outsider = makeClientWithMemorySession();

  await owner.auth.signUp({
    email: `owner-${Date.now()}-${Math.random()}@example.com`,
    password: "OwnerPassword123!",
  });
  const storeRes = await owner.rpc("create_store_for_current_user", { p_name: "Loja Segura" });
  assert.equal(storeRes.error, null);
  const storeId = String(storeRes.data);

  const productRes = await owner.rpc("create_product_with_audit", {
    p_store_id: storeId,
    p_name: "Arroz 5kg",
    p_sale_price: 4500,
    p_cost_price: 3200,
    p_opening_quantity: 10,
  });
  assert.equal(productRes.error, null);

  await outsider.auth.signUp({
    email: `outsider-${Date.now()}-${Math.random()}@example.com`,
    password: "OutsiderPassword123!",
  });

  const crossTenantWrite = await outsider.rpc("create_product_with_audit", {
    p_store_id: storeId,
    p_name: "Produto Invasor",
    p_sale_price: 100,
  });
  assert.equal(crossTenantWrite.error?.message, "store_access_denied");

  const crossTenantRead = await outsider
    .from("products")
    .select("id,name")
    .eq("store_id", storeId);
  assert.deepEqual(crossTenantRead.data, []);
});
