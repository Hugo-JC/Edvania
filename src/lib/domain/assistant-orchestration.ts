import {z} from "zod";
import {failure, type DomainResult, type ToolContext} from "./contracts.ts";
import type {AssistantToolName} from "./assistant-tools.ts";

const allowedTools: readonly AssistantToolName[] = [
  "get_store_summary",
  "search_products",
  "get_product_details",
  "check_stock",
  "search_customers",
  "get_customer_balance",
  "get_sales_summary",
  "get_cash_register_status",
];
const maxToolResultCharacters = 12_000;
const responseSchema = z.object({
  text: z.string().max(4_000).optional(),
  toolCalls: z.array(z.object({
    name: z.enum(allowedTools),
    arguments: z.record(z.string(), z.unknown()),
  }).strict()).max(3).optional(),
}).strict();

export type AssistantToolResult = Readonly<{
  name: AssistantToolName;
  result: DomainResult<unknown>;
}>;

export type AssistantHistoryMessage = Readonly<{
  role: "user" | "assistant";
  text: string;
}>;

export type AssistantProviderRequest = Readonly<{
  userMessage: string;
  history?: readonly AssistantHistoryMessage[];
  toolResults: readonly AssistantToolResult[];
  allowedTools: readonly AssistantToolName[];
  allowToolCalls: boolean;
  maxOutputTokens: 512;
}>;

export type AssistantExecutionTrace = Readonly<{
  usedFallback: boolean;
  toolsUsed: readonly AssistantToolName[];
  latencyMs: number;
  errorCode?: string;
}>;

export interface AssistantProvider {
  generate(request: AssistantProviderRequest, signal: AbortSignal): Promise<unknown>;
}

export interface AssistantRateLimiter {
  allow(tenantId: string, userId: string): Promise<boolean>;
}

export type AssistantTurnInput = Readonly<{
  context: ToolContext;
  message: string;
  history?: readonly AssistantHistoryMessage[];
  allowedToolsOverride?: readonly AssistantToolName[];
  primary: AssistantProvider;
  fallback?: AssistantProvider;
  rateLimiter: AssistantRateLimiter;
  executeTool: (
    context: ToolContext,
    name: AssistantToolName,
    input: unknown,
  ) => Promise<DomainResult<unknown>>;
  timeoutMs?: number;
  onTrace?: (trace: AssistantExecutionTrace) => void;
}>;

class ProviderCallError extends Error {
  readonly diagnosticCode: string;
  constructor(diagnosticCode = "provider_unavailable") {
    super("assistant_provider_unavailable");
    this.name = "ProviderCallError";
    this.diagnosticCode = diagnosticCode;
  }
}

function classifyProviderError(err: unknown): string {
  if (!(err instanceof Error)) return "provider_unavailable";
  const msg = err.message.toLowerCase();
  if (msg.includes("401") || msg.includes("403") || msg.includes("api_key_invalid") || msg.includes("api key")) {
    return "provider_auth_failed";
  }
  if (msg.includes("429") || msg.includes("quota") || msg.includes("resource_exhausted")) {
    return "provider_rate_limited";
  }
  if (msg.includes("404") || msg.includes("not found") || msg.includes("model")) {
    return "provider_model_not_found";
  }
  if (err.name === "AbortError" || msg.includes("timeout")) {
    return "provider_timeout";
  }
  return "provider_unavailable";
}

async function waitUntilDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new ProviderCallError("provider_timeout");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new ProviderCallError("provider_timeout")), remainingMs);
  });
  try {
    return await Promise.race([promise, timedOut]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function validateMessage(value: string) {
  return value.trim().length > 0
    && Array.from(value).length <= 4_000
    && !/[\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}

async function callProvider(
  provider: AssistantProvider,
  request: AssistantProviderRequest,
  deadline: number,
): Promise<unknown> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new ProviderCallError("provider_timeout");
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new ProviderCallError("provider_timeout"));
    }, remainingMs);
  });
  try {
    return await Promise.race([provider.generate(request, controller.signal), timedOut]);
  } catch (err) {
    throw new ProviderCallError(classifyProviderError(err));
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function runAssistantTurn(input: AssistantTurnInput): Promise<DomainResult<{text: string}>> {
  const startedAt = Date.now();
  if (!validateMessage(input.message)) return failure("VALIDATION", "Mensagem inválida ou demasiado longa.");
  const timeoutMs = input.timeoutMs ?? 15_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 30_000) {
    return failure("VALIDATION", "Limite de tempo inválido.");
  }

  const sanitizedHistory = (input.history ?? [])
    .filter((entry) => validateMessage(entry.text))
    .slice(-8)
    .map((entry) => ({role: entry.role, text: entry.text.trim().slice(0, 600)}));

  const effectiveAllowedTools = (input.allowedToolsOverride ?? allowedTools).filter((t) =>
    allowedTools.includes(t),
  );

  const deadline = Date.now() + timeoutMs;
  let rateAllowed: boolean;
  try {
    rateAllowed = await waitUntilDeadline(
      input.rateLimiter.allow(input.context.storeId, input.context.userId),
      deadline,
    );
  } catch {
    return failure("DEPENDENCY", "Não foi possível verificar o limite de utilização.", true);
  }
  if (!rateAllowed) return failure("CONFLICT", "Limite de utilização atingido. Tente novamente mais tarde.", true);

  let selectedProvider = input.primary;
  let usedFallback = false;
  const toolsUsed: AssistantToolName[] = [];

  const generate = async (request: AssistantProviderRequest) => {
    try {
      return await callProvider(selectedProvider, request, deadline);
    } catch (err) {
      if (selectedProvider === input.primary && input.fallback) {
        selectedProvider = input.fallback;
        usedFallback = true;
        return callProvider(selectedProvider, request, deadline);
      }
      throw err instanceof ProviderCallError ? err : new ProviderCallError();
    }
  };
  const request = (toolResults: readonly AssistantToolResult[], allowToolCalls: boolean): AssistantProviderRequest => ({
    userMessage: input.message,
    ...(sanitizedHistory.length ? {history: sanitizedHistory} : {}),
    toolResults,
    allowedTools: effectiveAllowedTools,
    allowToolCalls,
    maxOutputTokens: 512,
  });

  const emitTrace = (errorCode?: string) => {
    input.onTrace?.({
      usedFallback,
      toolsUsed,
      latencyMs: Date.now() - startedAt,
      ...(errorCode ? {errorCode} : {}),
    });
  };

  let firstResponse: unknown;
  try {
    firstResponse = await generate(request([], true));
  } catch (err) {
    const code = err instanceof ProviderCallError ? err.diagnosticCode : "provider_unavailable";
    emitTrace(code);
    return failure("DEPENDENCY", "O assistente está temporariamente indisponível.", true);
  }
  const parsedFirst = responseSchema.safeParse(firstResponse);
  if (!parsedFirst.success) {
    emitTrace("invalid_provider_response");
    return failure("DEPENDENCY", "Resposta inválida do assistente.", true);
  }

  const toolCalls = parsedFirst.data.toolCalls ?? [];
  if (toolCalls.length === 0) {
    const text = parsedFirst.data.text?.trim();
    if (text) {
      emitTrace();
      return {ok: true, data: {text}};
    }
    emitTrace("empty_provider_response");
    return failure("DEPENDENCY", "O assistente não produziu uma resposta.", true);
  }

  const toolResults: AssistantToolResult[] = [];
  for (const call of toolCalls) {
    if (!effectiveAllowedTools.includes(call.name)) {
      emitTrace("tool_not_allowed_for_role");
      return failure("FORBIDDEN", "A consulta pedida não está autorizada para o teu papel.");
    }
    let result: DomainResult<unknown>;
    try {
      result = await waitUntilDeadline(input.executeTool(input.context, call.name, call.arguments), deadline);
    } catch {
      emitTrace("tool_execution_failed");
      return failure("DEPENDENCY", "Não foi possível concluir uma consulta autorizada.", true);
    }
    toolsUsed.push(call.name);
    toolResults.push({name: call.name, result});
  }

  let serializedToolResults: string;
  try {
    serializedToolResults = JSON.stringify(toolResults);
  } catch {
    emitTrace("tool_serialization_failed");
    return failure("DEPENDENCY", "O resultado da consulta não pôde ser validado.", true);
  }
  if (typeof serializedToolResults !== "string" || serializedToolResults.length > maxToolResultCharacters) {
    emitTrace("tool_output_too_large");
    return failure("DEPENDENCY", "O resultado da consulta excede o limite permitido.", true);
  }

  let finalResponse: unknown;
  try {
    finalResponse = await generate(request(toolResults, false));
  } catch (err) {
    const code = err instanceof ProviderCallError ? err.diagnosticCode : "provider_unavailable";
    emitTrace(code);
    return failure("DEPENDENCY", "O assistente está temporariamente indisponível.", true);
  }
  const parsedFinal = responseSchema.safeParse(finalResponse);
  if (!parsedFinal.success || parsedFinal.data.toolCalls?.length) {
    emitTrace("invalid_final_response");
    return failure("DEPENDENCY", "Resposta inválida do assistente.", true);
  }
  const text = parsedFinal.data.text?.trim();
  if (text) {
    emitTrace();
    return {ok: true, data: {text}};
  }
  emitTrace("empty_final_response");
  return failure("DEPENDENCY", "O assistente não produziu uma resposta.", true);
}
