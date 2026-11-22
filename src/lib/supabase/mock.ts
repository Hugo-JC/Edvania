import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export const MOCK_AUTH_COOKIE = "edvania_mock_auth";

export type MockUserSession = {
  id: string;
  email: string;
  full_name: string;
};

type RowRecord = Record<string, unknown>;

type MockDb = {
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
  | { type: "in"; column: string; values: unknown[] }
  | { type: "is"; column: string; value: null | boolean }
  | { type: "ilike"; column: string; pattern: string };

type QueryResult<T> = { data: T; error: { message: string } | null; count?: number | null };

function matchesIlike(field: unknown, pattern: string): boolean {
  const text = String(field ?? "").toLowerCase();
  const clean = pattern.replace(/%/g, "").toLowerCase();
  if (!clean) return true;
  return text.includes(clean);
}

function createQueryBuilder(tableName: string, db: MockDb) {
  const filters: QueryFilter[] = [];
  let orderBy: { column: string; ascending: boolean } | null = null;
  let limitCount: number | null = null;
  let rangeBounds: { from: number; to: number } | null = null;
  let singleMode: "none" | "single" | "maybe" = "none";
  let headOnly = false;
  let wantCount = false;
  let upsertPayload: { rows: RowRecord[]; onConflict?: string } | null = null;

  const tableRows = (): RowRecord[] => {
    const table = (db as unknown as Record<string, unknown>)[tableName];
    return Array.isArray(table) ? (table as RowRecord[]) : [];
  };

  const execute = (): QueryResult<unknown> => {
    if (upsertPayload) {
      const target = tableRows();
      const conflictKey = upsertPayload.onConflict ?? "id";
      for (const row of upsertPayload.rows) {
        const idx = target.findIndex((existing) => existing[conflictKey] === row[conflictKey]);
        if (idx >= 0) {
          target[idx] = { ...target[idx], ...row };
        } else {
          target.push({ ...row });
        }
      }
      return { data: upsertPayload.rows, error: null };
    }

    let rows = [...tableRows()];
    for (const filter of filters) {
      if (filter.type === "eq") {
        rows = rows.filter((row) => row[filter.column] === filter.value);
      } else if (filter.type === "in") {
        rows = rows.filter((row) => filter.values.includes(row[filter.column]));
      } else if (filter.type === "is") {
        rows = rows.filter((row) => (filter.value === null ? row[filter.column] == null : row[filter.column] === filter.value));
      } else if (filter.type === "ilike") {
        rows = rows.filter((row) => matchesIlike(row[filter.column], filter.pattern));
      }
    }
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
      async signUp(params: { email: string; password: string; options?: { data?: { full_name?: string } } }) {
        const email = params.email.trim().toLowerCase();
        const session: MockUserSession = {
          id: deterministicUserId(email),
          email,
          full_name: params.options?.data?.full_name?.trim() ?? "",
        };
        cookies.setSession(session);
        return {
          data: {
            user: {
              id: session.id,
              email: session.email,
              user_metadata: { full_name: session.full_name },
            },
            session: { access_token: "mock-session-token", user: { id: session.id, email: session.email } },
          },
          error: null,
        };
      },
      async signInWithPassword(params: { email: string; password: string }) {
        const email = params.email.trim().toLowerCase();
        const session: MockUserSession = {
          id: deterministicUserId(email),
          email,
          full_name: "",
        };
        cookies.setSession(session);
        return {
          data: {
            user: { id: session.id, email: session.email, user_metadata: { full_name: "" } },
            session: { access_token: "mock-session-token", user: { id: session.id, email: session.email } },
          },
          error: null,
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
      return createQueryBuilder(tableName, db);
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
        db.stores.push({ id: storeId, name, currency_code: "AOA" });
        db.store_memberships.push({
          store_id: storeId,
          user_id: session.id,
          role: "owner",
          status: "active",
        });
        db.customers.push({
          id: makeUuid(),
          store_id: storeId,
          name: "Cliente Balcão",
          status: "active",
        });
        db.suppliers.push({
          id: makeUuid(),
          store_id: storeId,
          name: "Fornecedor Principal",
          status: "active",
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
        return { data: storeId, error: null };
      }

      if (fnName === "create_category_with_audit") {
        const categoryId = makeUuid();
        db.categories.push({
          id: categoryId,
          store_id: String(args.p_store_id),
          name: String(args.p_name),
          status: "active",
        });
        db.audit_logs.push({
          id: db.audit_logs.length + 1,
          store_id: String(args.p_store_id),
          actor_user_id: session.id,
          action: "category.created",
          entity_type: "category",
          entity_id: categoryId,
          created_at: new Date().toISOString(),
        });
        return { data: categoryId, error: null };
      }

      if (fnName === "create_customer_with_audit") {
        const customerId = makeUuid();
        db.customers.push({
          id: customerId,
          store_id: String(args.p_store_id),
          name: String(args.p_name),
          phone_e164: args.p_phone_e164 ? String(args.p_phone_e164) : null,
          email: args.p_email ? String(args.p_email) : null,
          tax_number: args.p_tax_number ? String(args.p_tax_number) : null,
          address: args.p_address ? String(args.p_address) : null,
          notes: args.p_notes ? String(args.p_notes) : null,
          status: "active",
          created_at: new Date().toISOString(),
        });
        db.audit_logs.push({
          id: db.audit_logs.length + 1,
          store_id: String(args.p_store_id),
          actor_user_id: session.id,
          action: "customer.created",
          entity_type: "customer",
          entity_id: customerId,
          created_at: new Date().toISOString(),
        });
        return { data: customerId, error: null };
      }

      if (fnName === "create_supplier_with_audit") {
        const supplierId = makeUuid();
        db.suppliers.push({
          id: supplierId,
          store_id: String(args.p_store_id),
          name: String(args.p_name),
          phone_e164: args.p_phone_e164 ? String(args.p_phone_e164) : null,
          email: args.p_email ? String(args.p_email) : null,
          tax_number: args.p_tax_number ? String(args.p_tax_number) : null,
          address: args.p_address ? String(args.p_address) : null,
          notes: args.p_notes ? String(args.p_notes) : null,
          status: "active",
          created_at: new Date().toISOString(),
        });
        db.audit_logs.push({
          id: db.audit_logs.length + 1,
          store_id: String(args.p_store_id),
          actor_user_id: session.id,
          action: "supplier.created",
          entity_type: "supplier",
          entity_id: supplierId,
          created_at: new Date().toISOString(),
        });
        return { data: supplierId, error: null };
      }

      if (fnName === "create_product_with_audit") {
        const productId = makeUuid();
        const storeId = String(args.p_store_id);
        const openingQuantity = Number(args.p_opening_quantity ?? 0);
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
        });
        db.inventory_balances.push({
          store_id: storeId,
          product_id: productId,
          location_id: storeId,
          quantity_on_hand: openingQuantity,
        });
        return { data: productId, error: null };
      }

      if (fnName === "create_sale_with_audit") {
        const storeId = String(args.p_store_id);
        const items = Array.isArray(args.p_items)
          ? (args.p_items as { product_id: string; quantity: number }[])
          : [];
        if (!items.length) {
          return { data: null, error: { message: "invalid_items" } };
        }
        let total = 0;
        for (const item of items) {
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
        return { data: saleId, error: null };
      }

      if (fnName === "create_purchase_with_audit") {
        const storeId = String(args.p_store_id);
        const items = Array.isArray(args.p_items)
          ? (args.p_items as { product_id: string; quantity: number; unit_cost: number }[])
          : [];
        if (!items.length) {
          return { data: null, error: { message: "invalid_items" } };
        }
        let total = 0;
        for (const item of items) {
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
        return { data: purchaseId, error: null };
      }

      if (fnName === "open_cash_session_with_audit") {
        const storeId = String(args.p_store_id);
        const registerId = String(args.p_register_id);
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
        return { data: sessionId, error: null };
      }

      if (fnName === "record_cash_movement_with_audit") {
        const storeId = String(args.p_store_id);
        const sessionId = String(args.p_session_id);
        const cashSession = db.cash_sessions.find(
          (s) => s.id === sessionId && s.store_id === storeId && s.closed_at == null,
        );
        if (!cashSession) {
          return { data: null, error: { message: "cash_session_not_open" } };
        }
        const movementId = makeUuid();
        db.cash_movements.push({
          id: movementId,
          store_id: storeId,
          session_id: sessionId,
          movement_type: String(args.p_movement_type),
          direction: String(args.p_direction),
          amount: Number(args.p_amount ?? 0),
          description: String(args.p_description ?? ""),
          created_at: new Date().toISOString(),
        });
        return { data: movementId, error: null };
      }

      if (fnName === "record_cash_expense_with_audit") {
        const storeId = String(args.p_store_id);
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
        return { data: expenseId, error: null };
      }

      if (fnName === "close_cash_session_with_audit") {
        const storeId = String(args.p_store_id);
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
        cashSession.closed_at = new Date().toISOString();
        cashSession.expected_amount = expected;
        cashSession.closing_amount = counted;
        cashSession.difference_amount = Math.round((counted - expected) * 100) / 100;
        return { data: sessionId, error: null };
      }

      return { data: makeUuid(), error: null };
    },
  };

  return client as unknown as SupabaseClient<Database>;
}
