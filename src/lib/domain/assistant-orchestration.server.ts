import "server-only";
import {
  runAssistantTurn,
  type AssistantExecutionTrace,
  type AssistantTurnInput,
} from "./assistant-orchestration";
import {resolveConfiguredAssistantProviders} from "./assistant-providers.server";
import {getSharedAssistantRateLimiter} from "./assistant-rate-limit.server";
import {executeDomainAssistantTool} from "./assistant-tools.server";
import {recordAiUsageLog} from "./assistant-usage.server";
import type {AssistantToolName} from "./assistant-tools";
import type {StoreRole} from "./contracts";

type DomainAssistantTurnInput = Omit<AssistantTurnInput, "executeTool">;

export function runDomainAssistantTurn(input: DomainAssistantTurnInput) {
  return runAssistantTurn({
    ...input,
    executeTool: executeDomainAssistantTool,
  });
}

const EMPLOYEE_ALLOWED_TOOLS: readonly AssistantToolName[] = [
  "search_products",
  "get_product_details",
  "check_stock",
];

const MANAGER_ALLOWED_TOOLS: readonly AssistantToolName[] = [
  "get_store_summary",
  "search_products",
  "get_product_details",
  "check_stock",
  "search_customers",
  "get_customer_balance",
  "get_sales_summary",
  "get_cash_register_status",
];

export async function runStoreAssistantConversation(params: Readonly<{
  storeId: string;
  userId: string;
  role: StoreRole;
  message: string;
  history?: readonly {role: "user" | "assistant"; text: string}[];
  taskType?: string;
}>) {
  const providers = resolveConfiguredAssistantProviders();
  let trace: AssistantExecutionTrace = {
    usedFallback: false,
    toolsUsed: [],
    latencyMs: 0,
  };

  const allowedToolsOverride = ["owner", "admin", "manager"].includes(params.role)
    ? MANAGER_ALLOWED_TOOLS
    : EMPLOYEE_ALLOWED_TOOLS;

  const result = await runDomainAssistantTurn({
    context: {storeId: params.storeId, userId: params.userId},
    message: params.message,
    history: params.history,
    allowedToolsOverride,
    primary: providers.primary,
    fallback: providers.fallback,
    rateLimiter: getSharedAssistantRateLimiter(),
    onTrace: (t) => {
      trace = t;
    },
  });

  const usedModel = trace.usedFallback && providers.fallbackModel
    ? providers.fallbackModel
    : providers.primaryModel;
  const usedProvider = trace.usedFallback
    ? "openai_compatible"
    : providers.primaryProvider;

  await recordAiUsageLog({
    storeId: params.storeId,
    provider: usedProvider,
    model: usedModel,
    success: result.ok,
    latencyMs: trace.latencyMs,
    statusCode: result.ok ? 200 : 500,
    taskType: params.taskType ?? "assistant_panel_chat",
  });

  return {
    result,
    mode: providers.mode,
    provider: usedProvider,
    model: usedModel,
    toolsUsed: trace.toolsUsed,
    latencyMs: trace.latencyMs,
    errorCode: trace.errorCode,
  };
}
