import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export const MOCK_AUTH_COOKIE = "edvania_mock_auth";

export type MockUserSession = {
  id: string;
  email: string;
  full_name: string;
};

type MockUserAccount = {
  id: string;
  email: string;
  full_name: string;
  salt: string;
  passwordHash: string;
  emailConfirmed: boolean;
  createdAt: string;
};

type RowRecord = Record<string, unknown>;

type MockDb = {
  user_accounts: MockUserAccount[];
  idempotency_keys: Record<string, string>;
  stores: RowRecord[];
  store_memberships: RowRecord[];
  user_profiles: RowRecord[];
  categories: RowRecord[];
  products: RowRecord[];
  inventory_balances: RowRecord[];
  customers: RowRecord[];
  suppliers: RowRecord[];
  sales: RowRecord[];
  payments: RowRecord[];
  purchases: RowRecord[];
  cash_registers: RowRecord[];
  cash_sessions: RowRecord[];
  cash_movements: RowRecord[];
  expenses: RowRecord[];
  whatsapp_connections: RowRecord[];
  whatsapp_conversations: RowRecord[];
  whatsapp_messages: RowRecord[];
  whatsapp_outbox: RowRecord[];
  audit_logs: RowRecord[];
  ai_usage_logs: RowRecord[];
  saleSeq: number;
  purchaseSeq: number;
};

const globalStore = globalThis as unknown as { __edvaniaMockDb?: MockDb };

export function getMockDb(): MockDb {
  if (!globalStore.__edvaniaMockDb) {
    globalStore.__edvaniaMockDb = {
      user_accounts: [],
      idempotency_keys: {},
      stores: [],
      store_memberships: [],
      user_profiles: [],
      categories: [],
      products: [],
      inventory_balances: [],
      customers: [],
      suppliers: [],
      sales: [],
      payments: [],
      purchases: [],
      cash_registers: [],
      cash_sessions: [],
      cash_movements: [],
      expenses: [],
      whatsapp_connections: [],
      whatsapp_conversations: [],
      whatsapp_messages: [],
      whatsapp_outbox: [],
      audit_logs: [],
      ai_usage_logs: [],
      saleSeq: 1,
      purchaseSeq: 1,
    };
  }
  return globalStore.__edvaniaMockDb;
}

function makeUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "00000000-0000-4000-8000-000000000000".replace(/0/g, () =>
    Math.floor(Math.random() * 16).toString(16),
  );
}

function deterministicUserId(email: string): string {
  const normalized = email.trim().toLowerCase();
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (code + i), 0x85ebca6b) >>> 0;
  }
  const hex1 = h1.toString(16).padStart(8, "0");
  const hex2 = h2.toString(16).padStart(8, "0");
  return `${hex1}-${hex2.slice(0, 4)}-4${hex2.slice(5, 8)}-8${hex1.slice(1, 4)}-${hex1}${hex2.slice(0, 4)}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(hex.length / 2);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hashPasswordWithSalt(password: string, saltHex: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  const encoder = new TextEncoder();
  if (subtle) {
    const keyMaterial = await subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits"],
    );
    const derived = await subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: hexToBytes(saltHex),
        iterations: 100_000,
        hash: "SHA-256",
      },
      keyMaterial,
      256,
    );
    return bytesToHex(new Uint8Array(derived));
  }
  // Fallback only if subtle unavailable
  return `${saltHex}:${encoder.encode(password).length}`;
}

function randomSaltHex(): string {
  const buf = new Uint8Array(16);
  globalThis.crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

export type CookieAdapter = {
  getSession: () => MockUserSession | null;
  setSession: (session: MockUserSession | null) => void;
};

export function parseSessionCookie(raw: string | undefined): MockUserSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<MockUserSession>;
    if (typeof parsed.id === "string" && typeof parsed.email === "string") {
      return {
        id: parsed.id,
        email: parsed.email,
        full_name: typeof parsed.full_name === "string" ? parsed.full_name : "",
      };
    }
  } catch {
    return null;
  }
  return null;
}

type QueryFilter =
  | { type: "eq"; column: string; value: unknown }
  | { type: "neq"; column: string; value: unknown }
  | { type: "gte"; column: string; value: unknown }
  | { type: "lte"; column: string; value: unknown }
  | { type: "in"; column: string; values: unknown[] }
  | { type: "is"; column: string; value: null | boolean }
  | { type: "ilike"; column: string; pattern: string };

type QueryResult<T> = { data: T; error: { message: string } | null; count?: number | null };

function matchesIlike(field: unknown, pattern: string): boolean {
  const text = String(field ?? "").toLowerCase();
  const clean = pattern.replace(/[%_\\]/g, "").toLowerCase();
  if (!clean) return true;
  return text.includes(clean);
}

function createQueryBuilder(tableName: string, db: MockDb, cookies: CookieAdapter) {
  const filters: QueryFilter[] = [];
  let orderBy: { column: string; ascending: boolean } | null = null;
  let limitCount: number | null = null;
  let rangeBounds: { from: number; to: number } | null = null;
  let singleMode: "none" | "single" | "maybe" = "none";
  let headOnly = false;
  let wantCount = false;
  let upsertPayload: { rows: RowRecord[]; onConflict?: string } | null = null;
  let insertPayload: RowRecord[] | null = null;
  let updatePayload: RowRecord | null = null;

  const tableRows = (): RowRecord[] => {
    const table = (db as unknown as Record<string, unknown>)[tableName];
    return Array.isArray(table) ? (table as RowRecord[]) : [];
  };

  const getAllowedStoreIds = (userId: string): Set<string> => {
    return new Set(
      db.store_memberships
        .filter((m) => m.user_id === userId && m.status === "active")
        .map((m) => String(m.store_id)),
    );
  };

  const getRoleForStore = (userId: string, storeId: string): string | null => {
    const row = db.store_memberships.find(
      (m) => m.user_id === userId && m.store_id === storeId && m.status === "active",
    );
    return row ? String(row.role) : null;
  };

  const applyRowFilters = (input: RowRecord[]) => {
    let rows = [...input];
    for (const filter of filters) {
      if (filter.type === "eq") {
        rows = rows.filter((row) => row[filter.column] === filter.value);
      } else if (filter.type === "neq") {
        rows = rows.filter((row) => row[filter.column] !== filter.value);
      } else if (filter.type === "gte") {
        rows = rows.filter((row) => String(row[filter.column] ?? "") >= String(filter.value ?? ""));
      } else if (filter.type === "lte") {
        rows = rows.filter((row) => String(row[filter.column] ?? "") <= String(filter.value ?? ""));
      } else if (filter.type === "in") {
        rows = rows.filter((row) => filter.values.includes(row[filter.column]));
      } else if (filter.type === "is") {
        rows = rows.filter((row) => (filter.value === null ? row[filter.column] == null : row[filter.column] === filter.value));
      } else if (filter.type === "ilike") {
        rows = rows.filter((row) => matchesIlike(row[filter.column], filter.pattern));
      }
    }
    return rows;
  };

  const execute = (): QueryResult<unknown> => {
    const session = cookies.getSession();
    if (!session) {
      return { data: singleMode === "none" ? [] : null, error: { message: "not_authenticated" } };
    }

    if (upsertPayload) {
      if (tableName !== "user_profiles") {
        return { data: null, error: { message: "forbidden" } };
      }
      const target = tableRows();
      const conflictKey = upsertPayload.onConflict ?? "id";
      for (const row of upsertPayload.rows) {
        if (row.id !== session.id) {
          return { data: null, error: { message: "forbidden" } };
        }
        const idx = target.findIndex((existing) => existing[conflictKey] === row[conflictKey]);
        if (idx >= 0) {
          target[idx] = { ...target[idx], ...row };
        } else {
          target.push({ ...row });
        }
      }
      return { data: upsertPayload.rows, error: null };
    }

    if (insertPayload) {
      if (tableName !== "whatsapp_connections") {
        return { data: null, error: { message: "forbidden" } };
      }
      const target = tableRows();
      const inserted: RowRecord[] = [];
      const now = new Date().toISOString();
      for (const row of insertPayload) {
        const storeId = String(row.store_id ?? "");
        const role = getRoleForStore(session.id, storeId);
        if (!role || !["owner", "admin", "manager"].includes(role)) {
          return { data: null, error: { message: "forbidden" } };
        }
        const record: RowRecord = {
          id: makeUuid(),
          created_at: now,
          updated_at: now,
          ...row,
        };
        target.push(record);
        inserted.push(record);
      }
      if (singleMode === "single" || singleMode === "maybe") {
        return { data: inserted[0] ?? null, error: null };
      }
      return { data: inserted, error: null };
    }

    if (updatePayload) {
      const target = tableRows();
      const allowedStoreIds = getAllowedStoreIds(session.id);
      const scoped = target.filter((row) => {
        if (tableName === "stores") return allowedStoreIds.has(String(row.id));
        if (tableName === "store_memberships") return allowedStoreIds.has(String(row.store_id));
        if (tableName === "whatsapp_connections") return allowedStoreIds.has(String(row.store_id));
        return false;
      });
      const matched = new Set(applyRowFilters(scoped));
      if (matched.size === 0) {
        return { data: singleMode === "none" ? [] : null, error: null };
      }
      for (const row of matched) {
        const storeId = tableName === "stores" ? String(row.id) : String(row.store_id);
        const role = getRoleForStore(session.id, storeId);
        if (tableName === "store_memberships") {
          if (role !== "owner") {
            return { data: null, error: { message: "forbidden" } };
          }
        } else if (tableName === "stores" || tableName === "whatsapp_connections") {
          if (!role || !["owner", "admin", "manager"].includes(role)) {
            return { data: null, error: { message: "forbidden" } };
          }
        } else {
          return { data: null, error: { message: "forbidden" } };
        }
      }
      const updatedRows: RowRecord[] = [];
      const now = new Date().toISOString();
      for (const row of matched) {
        Object.assign(row, updatePayload, { updated_at: now });
        updatedRows.push(row);
      }
      if (singleMode === "single" || singleMode === "maybe") {
        return { data: updatedRows[0] ?? null, error: null };
      }
      return { data: updatedRows, error: null };
    }

    const allowedStoreIds = getAllowedStoreIds(session.id);
    let rows = [...tableRows()];

    // Enforce tenant isolation mirroring Postgres RLS in mock mode
    if (tableName === "stores") {
      rows = rows.filter((row) => allowedStoreIds.has(String(row.id)));
    } else if (tableName === "store_memberships") {
      rows = rows.filter(
        (row) => row.user_id === session.id || allowedStoreIds.has(String(row.store_id)),
      );
    } else if (tableName === "user_profiles") {
      rows = rows.filter((row) => row.id === session.id);
    } else if (tableName !== "user_accounts") {
      rows = rows.filter((row) => allowedStoreIds.has(String(row.store_id)));
    }

    rows = applyRowFilters(rows);
    const totalCount = rows.length;
    if (orderBy) {
      const { column, ascending } = orderBy;
      rows.sort((a, b) => {
        const av = String(a[column] ?? "");
        const bv = String(b[column] ?? "");
        return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    if (rangeBounds) {
      rows = rows.slice(rangeBounds.from, rangeBounds.to + 1);
    } else if (limitCount !== null) {
      rows = rows.slice(0, limitCount);
    }
    if (headOnly) {
      return { data: null, error: null, count: totalCount };
    }
    if (singleMode === "single") {
      if (!rows.length) {
        return { data: null, error: { message: "Row not found" } };
      }
      return { data: rows[0], error: null, count: wantCount ? totalCount : undefined };
    }
    if (singleMode === "maybe") {
      return { data: rows[0] ?? null, error: null, count: wantCount ? totalCount : undefined };
    }
    return { data: rows, error: null, count: wantCount ? totalCount : undefined };
  };

  const builder = {
    select(_columns?: string, options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) {
      if (options?.count) wantCount = true;
      if (options?.head) headOnly = true;
      return builder;
    },
    eq(column: string, value: unknown) {
      filters.push({ type: "eq", column, value });
      return builder;
    },
    neq(column: string, value: unknown) {
      filters.push({ type: "neq", column, value });
      return builder;
    },
    gte(column: string, value: unknown) {
      filters.push({ type: "gte", column, value });
      return builder;
    },
    lte(column: string, value: unknown) {
      filters.push({ type: "lte", column, value });
      return builder;
    },
    in(column: string, values: unknown[]) {
      filters.push({ type: "in", column, values });
      return builder;
    },
    is(column: string, value: null | boolean) {
      filters.push({ type: "is", column, value });
      return builder;
    },
    ilike(column: string, pattern: string) {
      filters.push({ type: "ilike", column, pattern });
      return builder;
    },
    order(column: string, options?: { ascending?: boolean }) {
      orderBy = { column, ascending: options?.ascending ?? true };
      return builder;
    },
    limit(count: number) {
      limitCount = count;
      return builder;
    },
    range(from: number, to: number) {
      rangeBounds = { from, to };
      return builder;
    },
    single() {
      singleMode = "single";
      return builder;
    },
    maybeSingle() {
      singleMode = "maybe";
      return builder;
    },
    insert(values: RowRecord | RowRecord[]) {
      insertPayload = Array.isArray(values) ? values : [values];
      return builder;
    },
    update(values: RowRecord) {
      updatePayload = values;
      return builder;
    },
    upsert(values: RowRecord | RowRecord[], options?: { onConflict?: string }) {
      upsertPayload = {
        rows: Array.isArray(values) ? values : [values],
        onConflict: options?.onConflict,
      };
      return builder;
    },
    then<TResult1 = QueryResult<unknown>, TResult2 = never>(
      onfulfilled?: ((value: QueryResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return Promise.resolve(execute()).then(onfulfilled, onrejected);
    },
  };

  return builder;
}

function checkStoreRole(
  db: MockDb,
  storeId: string,
  userId: string,
  allowedRoles: readonly string[],
): { ok: true } | { ok: false; message: string } {
  const membership = db.store_memberships.find(
    (m) => m.store_id === storeId && m.user_id === userId && m.status === "active",
  );
  if (!membership) {
    return { ok: false, message: "store_access_denied" };
  }
  if (!allowedRoles.includes(String(membership.role))) {
    return { ok: false, message: "insufficient_store_role" };
  }
  return { ok: true };
}

export function createMockSupabaseClient(cookies: CookieAdapter): SupabaseClient<Database> {
  const db = getMockDb();

  const client = {
    auth: {
      async getUser() {
        const session = cookies.getSession();
        if (!session) {
          return { data: { user: null }, error: null };
        }
        return {
          data: {
            user: {
              id: session.id,
              email: session.email,
              user_metadata: { full_name: session.full_name },
              app_metadata: {},
              aud: "authenticated",
              created_at: new Date().toISOString(),
            },
          },
          error: null,
        };
      },
      async signUp(params: { email: string; password: string; options?: { data?: { full_name?: string }; emailRedirectTo?: string } }) {
        const email = params.email.trim().toLowerCase();
        const existing = db.user_accounts.find((u) => u.email === email);
        if (existing) {
          return {
            data: { user: null, session: null },
            error: { message: "User already registered" },
          };
        }

        const salt = randomSaltHex();
        const passwordHash = await hashPasswordWithSalt(params.password, salt);
        const fullName = params.options?.data?.full_name?.trim() ?? "";
        const userId = deterministicUserId(email);
        const account: MockUserAccount = {
          id: userId,
          email,
          full_name: fullName,
          salt,
          passwordHash,
          emailConfirmed: true,
          createdAt: new Date().toISOString(),
        };
        db.user_accounts.push(account);

        const session: MockUserSession = {
          id: account.id,
          email: account.email,
          full_name: account.full_name,
        };
        cookies.setSession(session);
        return {
          data: {
            user: {
              id: session.id,
              email: session.email,
              user_metadata: { full_name: session.full_name },
              identities: [{ id: session.id }],
            },
            session: { access_token: "mock-session-token", user: { id: session.id, email: session.email } },
          },
          error: null,
        };
      },
      async signInWithPassword(params: { email: string; password: string }) {
        const email = params.email.trim().toLowerCase();
        const account = db.user_accounts.find((u) => u.email === email);
        if (!account) {
          return {
            data: { user: null, session: null },
            error: { message: "Invalid login credentials" },
          };
        }
        const computed = await hashPasswordWithSalt(params.password, account.salt);
        if (!constantTimeHexEqual(computed, account.passwordHash)) {
          return {
            data: { user: null, session: null },
            error: { message: "Invalid login credentials" },
          };
        }

        const session: MockUserSession = {
          id: account.id,
          email: account.email,
          full_name: account.full_name,
        };
        cookies.setSession(session);
        return {
          data: {
            user: { id: session.id, email: session.email, user_metadata: { full_name: session.full_name } },
            session: { access_token: "mock-session-token", user: { id: session.id, email: session.email } },
          },
          error: null,
        };
      },
      async resend() {
        return { data: { user: null, session: null }, error: null };
      },
      async exchangeCodeForSession() {
        const session = cookies.getSession();
        return {
          data: { user: session ? { id: session.id, email: session.email } : null, session: null },
          error: session ? null : { message: "invalid_code" },
        };
      },
      async verifyOtp() {
        const session = cookies.getSession();
        return {
          data: { user: session ? { id: session.id, email: session.email } : null, session: null },
          error: session ? null : { message: "invalid_token" },
        };
      },
      async signOut() {
        cookies.setSession(null);
        return { error: null };
      },
      async getClaims() {
        const session = cookies.getSession();
        return { data: session ? { claims: { sub: session.id } } : null, error: null };
      },
    },
    from(tableName: string) {
      return createQueryBuilder(tableName, db, cookies);
    },
    async rpc(fnName: string, args: Record<string, unknown> = {}) {
      const session = cookies.getSession();
      if (!session) {
        return { data: null, error: { message: "not_authenticated" } };
      }

      if (fnName === "create_store_for_current_user") {
        const storeId = makeUuid();
        const name = String(args.p_name ?? "Minha Loja").trim();
        const now = new Date().toISOString();
        db.stores.push({ id: storeId, name, currency_code: "AOA", timezone: "Africa/Luanda" });
        db.store_memberships.push({
          id: makeUuid(),
          store_id: storeId,
          user_id: session.id,
          role: "owner",
          status: "active",
          created_at: now,
        });
        db.customers.push({
          id: makeUuid(),
          store_id: storeId,
          name: "Cliente Balcão",
          status: "active",
          created_at: now,
        });
        db.suppliers.push({
          id: makeUuid(),
          store_id: storeId,
          name: "Fornecedor Principal",
          status: "active",
          created_at: now,
        });
        db.cash_registers.push({
          id: makeUuid(),
          store_id: storeId,
          name: "Caixa Principal",
          status: "active",
          created_at: now,
        });
        db.whatsapp_connections.push({
          id: makeUuid(),
          store_id: storeId,
          provider: "sandbox",
          phone_e164: null,
          connection_status: "disconnected",
          last_connected_at: null,
          created_at: now,
          updated_at: now,
        });
        db.audit_logs.push({
          id: db.audit_logs.length + 1,
          store_id: storeId,
          actor_user_id: session.id,
          action: "store.created",
          entity_type: "store",
          entity_id: storeId,
          created_at: now,
        });
        return { data: storeId, error: null };
      }

      const storeId = String(args.p_store_id ?? "");
      const authCheck = checkStoreRole(db, storeId, session.id, ["owner", "admin", "manager"]);
      if (!authCheck.ok) {
        return { data: null, error: { message: authCheck.message } };
      }

      const idempotencyKey = typeof args.p_idempotency_key === "string" ? args.p_idempotency_key : "";
      if (idempotencyKey) {
        const scopedKey = `${storeId}:${fnName}:${idempotencyKey}`;
        const existingResult = db.idempotency_keys[scopedKey];
        if (existingResult) {
          return { data: existingResult, error: null };
        }
      }

      if (fnName === "create_category_with_audit") {
        const categoryId = makeUuid();
        const now = new Date().toISOString();
        db.categories.push({
          id: categoryId,
          store_id: storeId,
          name: String(args.p_name),
          status: "active",
          created_at: now,
        });
        db.audit_logs.push({
          id: db.audit_logs.length + 1,
          store_id: storeId,
          actor_user_id: session.id,
          action: "category.created",
          entity_type: "category",
          entity_id: categoryId,
          created_at: now,
        });
        return { data: categoryId, error: null };
      }

      if (fnName === "create_customer_with_audit") {
        const customerId = makeUuid();
        const now = new Date().toISOString();
        db.customers.push({
          id: customerId,
          store_id: storeId,
          name: String(args.p_name),
          phone_e164: args.p_phone_e164 ? String(args.p_phone_e164) : null,
          email: args.p_email ? String(args.p_email) : null,
          tax_number: args.p_tax_number ? String(args.p_tax_number) : null,
          address: args.p_address ? String(args.p_address) : null,
          notes: args.p_notes ? String(args.p_notes) : null,
          status: "active",
          created_at: now,
        });
        db.audit_logs.push({
          id: db.audit_logs.length + 1,
          store_id: storeId,
          actor_user_id: session.id,
          action: "customer.created",
          entity_type: "customer",
          entity_id: customerId,
          created_at: now,
        });
        return { data: customerId, error: null };
      }

      if (fnName === "create_supplier_with_audit") {
        const supplierId = makeUuid();
        const now = new Date().toISOString();
        db.suppliers.push({
          id: supplierId,
          store_id: storeId,
          name: String(args.p_name),
          phone_e164: args.p_phone_e164 ? String(args.p_phone_e164) : null,
          email: args.p_email ? String(args.p_email) : null,
          tax_number: args.p_tax_number ? String(args.p_tax_number) : null,
          address: args.p_address ? String(args.p_address) : null,
          notes: args.p_notes ? String(args.p_notes) : null,
          status: "active",
          created_at: now,
        });
        db.audit_logs.push({
          id: db.audit_logs.length + 1,
          store_id: storeId,
          actor_user_id: session.id,
          action: "supplier.created",
          entity_type: "supplier",
          entity_id: supplierId,
          created_at: now,
        });
        return { data: supplierId, error: null };
      }

      if (fnName === "create_product_with_audit") {
        const productId = makeUuid();
        const openingQuantity = Number(args.p_opening_quantity ?? 0);
        const now = new Date().toISOString();
        db.products.push({
          id: productId,
          store_id: storeId,
          name: String(args.p_name),
          sku: args.p_sku ? String(args.p_sku) : null,
          sale_price: Number(args.p_sale_price ?? 0),
          cost_price: Number(args.p_cost_price ?? 0),
          min_stock: Number(args.p_min_stock ?? 0),
          unit: String(args.p_unit ?? "un"),
          category_id: args.p_category_id ? String(args.p_category_id) : null,
          status: "active",
          track_stock: true,
          created_at: now,
        });
        db.inventory_balances.push({
          store_id: storeId,
          product_id: productId,
          location_id: storeId,
          quantity_on_hand: openingQuantity,
        });
        db.audit_logs.push({
          id: db.audit_logs.length + 1,
          store_id: storeId,
          actor_user_id: session.id,
          action: "product.created",
          entity_type: "product",
          entity_id: productId,
          created_at: now,
        });
        return { data: productId, error: null };
      }

      if (fnName === "create_sale_with_audit") {
        const items = Array.isArray(args.p_items)
          ? (args.p_items as { product_id: string; quantity: number }[])
          : [];
        if (!items.length) {
          return { data: null, error: { message: "invalid_items" } };
        }
        let total = 0;
        for (const item of items) {
          if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
            return { data: null, error: { message: "invalid_quantity" } };
          }
          const product = db.products.find(
            (p) => p.id === item.product_id && p.store_id === storeId,
          );
          if (!product) {
            return { data: null, error: { message: "product_not_found" } };
          }
          const balance = db.inventory_balances.find(
            (b) => b.product_id === item.product_id && b.store_id === storeId,
          );
          const onHand = Number(balance?.quantity_on_hand ?? 0);
          if (product.track_stock && onHand < item.quantity) {
            return { data: null, error: { message: "insufficient_stock" } };
          }
          total += Number(product.sale_price ?? 0) * item.quantity;
        }
        for (const item of items) {
          const balance = db.inventory_balances.find(
            (b) => b.product_id === item.product_id && b.store_id === storeId,
          );
          if (balance) {
            balance.quantity_on_hand = Number(balance.quantity_on_hand ?? 0) - item.quantity;
          }
        }
        const saleId = makeUuid();
        const now = new Date().toISOString();
        db.sales.push({
          id: saleId,
          store_id: storeId,
          sale_number: db.saleSeq++,
          status: "confirmed",
          total,
          sold_at: now,
          created_at: now,
          customer_id: args.p_customer_id ? String(args.p_customer_id) : null,
        });
        const paidAmount = Number(args.p_paid_amount ?? 0);
        if (paidAmount > 0) {
          db.payments.push({
            id: makeUuid(),
            store_id: storeId,
            sale_id: saleId,
            amount: paidAmount,
            status: "confirmed",
          });
        }
        if (idempotencyKey) {
          db.idempotency_keys[`${storeId}:${fnName}:${idempotencyKey}`] = saleId;
        }
        db.audit_logs.push({
          id: db.audit_logs.length + 1,
          store_id: storeId,
          actor_user_id: session.id,
          action: "sale.created",
          entity_type: "sale",
          entity_id: saleId,
          created_at: now,
        });
        return { data: saleId, error: null };
      }

      if (fnName === "create_purchase_with_audit") {
        const items = Array.isArray(args.p_items)
          ? (args.p_items as { product_id: string; quantity: number; unit_cost: number }[])
          : [];
        if (!items.length) {
          return { data: null, error: { message: "invalid_items" } };
        }
        let total = 0;
        for (const item of items) {
          if (!Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unit_cost) || item.unit_cost < 0) {
            return { data: null, error: { message: "invalid_quantity" } };
          }
          const product = db.products.find(
            (p) => p.id === item.product_id && p.store_id === storeId,
          );
          if (!product) {
            return { data: null, error: { message: "product_not_found" } };
          }
          total += item.quantity * item.unit_cost;
        }
        for (const item of items) {
          const balance = db.inventory_balances.find(
            (b) => b.product_id === item.product_id && b.store_id === storeId,
          );
          if (balance) {
            balance.quantity_on_hand = Number(balance.quantity_on_hand ?? 0) + item.quantity;
          } else {
            db.inventory_balances.push({
              store_id: storeId,
              product_id: item.product_id,
              location_id: storeId,
              quantity_on_hand: item.quantity,
            });
          }
        }
        const purchaseId = makeUuid();
        const now = new Date().toISOString();
        db.purchases.push({
          id: purchaseId,
          store_id: storeId,
          purchase_number: db.purchaseSeq++,
          status: "received",
          total,
          received_at: now,
          created_at: now,
          supplier_id: args.p_supplier_id ? String(args.p_supplier_id) : null,
          supplier_reference: args.p_supplier_reference ? String(args.p_supplier_reference) : null,
        });
        if (idempotencyKey) {
          db.idempotency_keys[`${storeId}:${fnName}:${idempotencyKey}`] = purchaseId;
        }
        db.audit_logs.push({
          id: db.audit_logs.length + 1,
          store_id: storeId,
          actor_user_id: session.id,
          action: "purchase.created",
          entity_type: "purchase",
          entity_id: purchaseId,
          created_at: now,
        });
        return { data: purchaseId, error: null };
      }

      if (fnName === "open_cash_session_with_audit") {
        const registerId = String(args.p_register_id);
        const register = db.cash_registers.find((r) => r.id === registerId && r.store_id === storeId);
        if (!register) {
          return { data: null, error: { message: "cash_register_not_found" } };
        }
        const existingOpen = db.cash_sessions.find(
          (s) => s.store_id === storeId && s.register_id === registerId && s.closed_at == null,
        );
        if (existingOpen) {
          return { data: null, error: { message: "cash_session_not_open" } };
        }
        const sessionId = makeUuid();
        const now = new Date().toISOString();
        db.cash_sessions.push({
          id: sessionId,
          store_id: storeId,
          register_id: registerId,
          opening_amount: Number(args.p_opening_amount ?? 0),
          opened_at: now,
          closed_at: null,
          closing_amount: null,
          expected_amount: null,
          difference_amount: null,
          notes: args.p_notes ? String(args.p_notes) : null,
          opened_by: session.id,
        });
        if (idempotencyKey) {
          db.idempotency_keys[`${storeId}:${fnName}:${idempotencyKey}`] = sessionId;
        }
        db.audit_logs.push({
          id: db.audit_logs.length + 1,
          store_id: storeId,
          actor_user_id: session.id,
          action: "cash_session.opened",
          entity_type: "cash_session",
          entity_id: sessionId,
          created_at: now,
        });
        return { data: sessionId, error: null };
      }

      if (fnName === "record_cash_movement_with_audit") {
        const sessionId = String(args.p_session_id);
        const cashSession = db.cash_sessions.find(
          (s) => s.id === sessionId && s.store_id === storeId && s.closed_at == null,
        );
        if (!cashSession) {
          return { data: null, error: { message: "cash_session_not_open" } };
        }
        const movementId = makeUuid();
        const now = new Date().toISOString();
        db.cash_movements.push({
          id: movementId,
          store_id: storeId,
          session_id: sessionId,
          movement_type: String(args.p_movement_type),
          direction: String(args.p_direction),
          amount: Number(args.p_amount ?? 0),
          description: String(args.p_description ?? ""),
          created_at: now,
        });
        if (idempotencyKey) {
          db.idempotency_keys[`${storeId}:${fnName}:${idempotencyKey}`] = movementId;
        }
        db.audit_logs.push({
          id: db.audit_logs.length + 1,
          store_id: storeId,
          actor_user_id: session.id,
          action: "cash_movement.recorded",
          entity_type: "cash_movement",
          entity_id: movementId,
          created_at: now,
        });
        return { data: movementId, error: null };
      }

      if (fnName === "record_cash_expense_with_audit") {
        const sessionId = String(args.p_session_id);
        const cashSession = db.cash_sessions.find(
          (s) => s.id === sessionId && s.store_id === storeId && s.closed_at == null,
        );
        if (!cashSession) {
          return { data: null, error: { message: "cash_session_not_open" } };
        }
        const expenseId = makeUuid();
        const amount = Number(args.p_amount ?? 0);
        const description = String(args.p_description ?? "");
        const now = new Date().toISOString();
        db.expenses.push({
          id: expenseId,
          store_id: storeId,
          cash_session_id: sessionId,
          category: args.p_category ? String(args.p_category) : null,
          description,
          amount,
          created_at: now,
        });
        db.cash_movements.push({
          id: makeUuid(),
          store_id: storeId,
          session_id: sessionId,
          movement_type: "expense",
          direction: "out",
          amount,
          description,
          created_at: now,
        });
        if (idempotencyKey) {
          db.idempotency_keys[`${storeId}:${fnName}:${idempotencyKey}`] = expenseId;
        }
        db.audit_logs.push({
          id: db.audit_logs.length + 1,
          store_id: storeId,
          actor_user_id: session.id,
          action: "cash_expense.recorded",
          entity_type: "expense",
          entity_id: expenseId,
          created_at: now,
        });
        return { data: expenseId, error: null };
      }

      if (fnName === "close_cash_session_with_audit") {
        const sessionId = String(args.p_session_id);
        const cashSession = db.cash_sessions.find(
          (s) => s.id === sessionId && s.store_id === storeId && s.closed_at == null,
        );
        if (!cashSession) {
          return { data: null, error: { message: "cash_session_not_open" } };
        }
        const movements = db.cash_movements.filter((m) => m.session_id === sessionId);
        const delta = movements.reduce((sum, m) => {
          const amt = Number(m.amount ?? 0);
          return m.direction === "in" ? sum + amt : sum - amt;
        }, 0);
        const expected = Number(cashSession.opening_amount ?? 0) + delta;
        const counted = Number(args.p_counted_amount ?? 0);
        const now = new Date().toISOString();
        cashSession.closed_at = now;
        cashSession.expected_amount = expected;
        cashSession.closing_amount = counted;
        cashSession.difference_amount = Math.round((counted - expected) * 100) / 100;
        if (idempotencyKey) {
          db.idempotency_keys[`${storeId}:${fnName}:${idempotencyKey}`] = sessionId;
        }
        db.audit_logs.push({
          id: db.audit_logs.length + 1,
          store_id: storeId,
          actor_user_id: session.id,
          action: "cash_session.closed",
          entity_type: "cash_session",
          entity_id: sessionId,
          created_at: now,
        });
        return { data: sessionId, error: null };
      }

      return { data: makeUuid(), error: null };
    },
  };

  return client as unknown as SupabaseClient<Database>;
}
