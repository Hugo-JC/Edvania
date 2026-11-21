import {z} from "zod";
import {failure, type DomainResult, type ToolContext} from "./contracts.ts";

const searchProductsSchema = z.object({
  query: z.string().trim().max(120).refine((value) => !/[%_\\\u0000-\u001f]/.test(value), "Unsupported search characters.").optional(),
  limit: z.number().int().min(1).max(10).default(5),
}).strict();
const productSchema = z.object({productId: z.string().uuid()}).strict();

export type AssistantToolName = "search_products" | "get_product_details" | "check_stock";
export type AssistantToolHandlers = Readonly<{
  searchProducts: (context: ToolContext, query: string, limit: number) => Promise<DomainResult<unknown>>;
  getProductDetails: (context: ToolContext, productId: string) => Promise<DomainResult<unknown>>;
  checkStock: (context: ToolContext, productId: string) => Promise<DomainResult<unknown>>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function selectProduct(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const allowedFields = ["id", "name", "sku", "sale_price", "unit", "track_stock"] as const;
  return Object.fromEntries(allowedFields.flatMap((field) => field in value ? [[field, value[field]]] : []));
}

function selectStock(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const allowedFields = ["product_id", "quantity_on_hand"] as const;
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
  if (name === "search_products") {
    const parsed = searchProductsSchema.safeParse(input);
    if (!parsed.success) return failure("VALIDATION", "Parâmetros de pesquisa inválidos.");
    const result = await handlers.searchProducts(context, parsed.data.query ?? "", parsed.data.limit);
    return projectSuccess(result, (data) => Array.isArray(data) ? data.map(selectProduct).filter((product) => product !== null) : []);
  }
  if (name === "get_product_details") {
    const parsed = productSchema.safeParse(input);
    if (!parsed.success) return failure("VALIDATION", "Parâmetros de produto inválidos.");
    const result = await handlers.getProductDetails(context, parsed.data.productId);
    return projectSuccess(result, selectProduct);
  }
  if (name === "check_stock") {
    const parsed = productSchema.safeParse(input);
    if (!parsed.success) return failure("VALIDATION", "Parâmetros de stock inválidos.");
    const result = await handlers.checkStock(context, parsed.data.productId);
    return projectSuccess(result, (data) => Array.isArray(data) ? data.map(selectStock).filter((row) => row !== null) : []);
  }
  return failure("VALIDATION", "Ferramenta de consulta não permitida.");
}
