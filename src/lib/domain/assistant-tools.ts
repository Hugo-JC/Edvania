import {z} from "zod";
import {failure, type DomainResult, type ToolContext} from "./contracts.ts";

const searchProductsSchema = z.object({
  query: z.string().trim().max(120).refine((value) => !/[%_\\\u0000-\u001f]/.test(value), "Unsupported search characters.").optional(),
  limit: z.number().int().min(1).max(10).default(5),
}).strict();

const searchCustomersSchema = z.object({
  query: z.string().trim().max(120).refine((value) => !/[%_\\\u0000-\u001f]/.test(value), "Unsupported search characters.").optional(),
  limit: z.number().int().min(1).max(10).default(5),
}).strict();

const productDetailsSchema = z.object({productId: z.string().uuid()}).strict();
const checkStockSchema = z.object({productId: z.string().uuid().optional()}).strict();
const customerBalanceSchema = z.object({customerId: z.string().uuid()}).strict();
const emptyArgsSchema = z.object({}).strict();

export type AssistantToolName =
  | "get_store_summary"
  | "search_products"
  | "get_product_details"
  | "check_stock"
  | "search_customers"
  | "get_customer_balance"
  | "get_sales_summary"
  | "get_cash_register_status";

export type AssistantToolHandlers = Readonly<{
  searchProducts: (context: ToolContext, query: string, limit: number) => Promise<DomainResult<unknown>>;
  getProductDetails: (context: ToolContext, productId: string) => Promise<DomainResult<unknown>>;
  checkStock: (context: ToolContext, productId?: string) => Promise<DomainResult<unknown>>;
  getStoreSummary?: (context: ToolContext) => Promise<DomainResult<unknown>>;
  searchCustomers?: (context: ToolContext, query: string, limit: number) => Promise<DomainResult<unknown>>;
  getCustomerBalance?: (context: ToolContext, customerId: string) => Promise<DomainResult<unknown>>;
  getSalesSummary?: (context: ToolContext) => Promise<DomainResult<unknown>>;
  getCashRegisterStatus?: (context: ToolContext) => Promise<DomainResult<unknown>>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function selectProduct(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const allowedFields = ["id", "name", "sku", "sale_price", "unit", "track_stock", "min_stock"] as const;
  return Object.fromEntries(allowedFields.flatMap((field) => field in value ? [[field, value[field]]] : []));
}

function selectStock(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const allowedFields = ["product_id", "quantity_on_hand"] as const;
  return Object.fromEntries(allowedFields.flatMap((field) => field in value ? [[field, value[field]]] : []));
}

function selectCustomer(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const allowedFields = ["id", "name", "status"] as const;
  return Object.fromEntries(allowedFields.flatMap((field) => field in value ? [[field, value[field]]] : []));
}

function selectCashSession(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const allowedFields = ["id", "opening_amount", "opened_at"] as const;
  return Object.fromEntries(allowedFields.flatMap((field) => field in value ? [[field, value[field]]] : []));
}

function projectSuccess(
  result: DomainResult<unknown>,
  project: (value: unknown) => unknown,
): DomainResult<unknown> {
  if (!result.ok) return result;
  return {ok: true, data: project(result.data)};
}

export async function executeAssistantTool(
  context: ToolContext,
  name: unknown,
  input: unknown,
  handlers: AssistantToolHandlers,
): Promise<DomainResult<unknown>> {
  if (name === "get_store_summary") {
    if (!handlers.getStoreSummary) return failure("VALIDATION", "Ferramenta de resumo indisponível.");
    const parsed = emptyArgsSchema.safeParse(input ?? {});
    if (!parsed.success) return failure("VALIDATION", "Parâmetros de resumo inválidos.");
    return handlers.getStoreSummary(context);
  }
  if (name === "search_products") {
    const parsed = searchProductsSchema.safeParse(input);
    if (!parsed.success) return failure("VALIDATION", "Parâmetros de pesquisa inválidos.");
    const result = await handlers.searchProducts(context, parsed.data.query ?? "", parsed.data.limit);
    return projectSuccess(result, (data) => Array.isArray(data) ? data.map(selectProduct).filter((product) => product !== null) : []);
  }
  if (name === "get_product_details") {
    const parsed = productDetailsSchema.safeParse(input);
    if (!parsed.success) return failure("VALIDATION", "Parâmetros de produto inválidos.");
    const result = await handlers.getProductDetails(context, parsed.data.productId);
    return projectSuccess(result, selectProduct);
  }
  if (name === "check_stock") {
    const parsed = checkStockSchema.safeParse(input ?? {});
    if (!parsed.success) return failure("VALIDATION", "Parâmetros de stock inválidos.");
    const result = await handlers.checkStock(context, parsed.data.productId);
    return projectSuccess(result, (data) => Array.isArray(data) ? data.slice(0, 25).map(selectStock).filter((row) => row !== null) : []);
  }
  if (name === "search_customers") {
    if (!handlers.searchCustomers) return failure("VALIDATION", "Ferramenta de clientes indisponível.");
    const parsed = searchCustomersSchema.safeParse(input);
    if (!parsed.success) return failure("VALIDATION", "Parâmetros de pesquisa de clientes inválidos.");
    const result = await handlers.searchCustomers(context, parsed.data.query ?? "", parsed.data.limit);
    return projectSuccess(result, (data) => Array.isArray(data) ? data.map(selectCustomer).filter((row) => row !== null) : []);
  }
  if (name === "get_customer_balance") {
    if (!handlers.getCustomerBalance) return failure("VALIDATION", "Ferramenta de saldo indisponível.");
    const parsed = customerBalanceSchema.safeParse(input);
    if (!parsed.success) return failure("VALIDATION", "Parâmetros de cliente inválidos.");
    return handlers.getCustomerBalance(context, parsed.data.customerId);
  }
  if (name === "get_sales_summary") {
    if (!handlers.getSalesSummary) return failure("VALIDATION", "Ferramenta de vendas indisponível.");
    const parsed = emptyArgsSchema.safeParse(input ?? {});
    if (!parsed.success) return failure("VALIDATION", "Parâmetros de vendas inválidos.");
    const result = await handlers.getSalesSummary(context);
    return projectSuccess(result, (data) => {
      if (!isRecord(data)) return {};
      return {
        count: data.count,
        confirmedTotal: data.confirmedTotal,
        recentSales: Array.isArray(data.recentSales) ? data.recentSales.slice(0, 10) : [],
      };
    });
  }
  if (name === "get_cash_register_status") {
    if (!handlers.getCashRegisterStatus) return failure("VALIDATION", "Ferramenta de caixa indisponível.");
    const parsed = emptyArgsSchema.safeParse(input ?? {});
    if (!parsed.success) return failure("VALIDATION", "Parâmetros de caixa inválidos.");
    const result = await handlers.getCashRegisterStatus(context);
    return projectSuccess(result, (data) => Array.isArray(data) ? data.map(selectCashSession).filter((row) => row !== null) : []);
  }
  return failure("VALIDATION", "Ferramenta de consulta não permitida.");
}
