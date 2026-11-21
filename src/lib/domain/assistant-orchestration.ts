import {z} from "zod";
import {failure, type DomainResult, type ToolContext} from "./contracts.ts";
import type {AssistantToolName} from "./assistant-tools.ts";

const allowedTools: readonly AssistantToolName[] = ["search_products", "get_product_details", "check_stock"];
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

export type AssistantProviderRequest = Readonly<{
  userMessage: string;
  toolResults: readonly AssistantToolResult[];
  allowedTools: readonly AssistantToolName[];
  allowToolCalls: boolean;
  maxOutputTokens: 512;
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
  primary: AssistantProvider;
  fallback?: AssistantProvider;
  rateLimiter: AssistantRateLimiter;
  executeTool: (
    context: ToolContext,
    name: AssistantToolName,
    input: unknown,
  ) => Promise<DomainResult<unknown>>;
  timeoutMs?: number;
}>;

class ProviderCallError extends Error {
  constructor() {
    super("assistant_provider_unavailable");
    this.name = "ProviderCallError";
  }
}

async function waitUntilDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new ProviderCallError();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new ProviderCallError()), remainingMs);
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
  if (remainingMs <= 0) throw new ProviderCallError();
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new ProviderCallError());
    }, remainingMs);
  });
  try {
    return await Promise.race([provider.generate(request, controller.signal), timedOut]);
  } catch {
    throw new ProviderCallError();
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function runAssistantTurn(input: AssistantTurnInput): Promise<DomainResult<{text: string}>> {
  if (!validateMessage(input.message)) return failure("VALIDATION", "Mensagem inválida ou demasiado longa.");
  const timeoutMs = input.timeoutMs ?? 15_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 30_000) {
    return failure("VALIDATION", "Limite de tempo inválido.");
  }

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
  const generate = async (request: AssistantProviderRequest) => {
    try {
      return await callProvider(selectedProvider, request, deadline);
    } catch {
      if (selectedProvider === input.primary && input.fallback) {
        selectedProvider = input.fallback;
        return callProvider(selectedProvider, request, deadline);
      }
      throw new ProviderCallError();
    }
  };
  const request = (toolResults: readonly AssistantToolResult[], allowToolCalls: boolean): AssistantProviderRequest => ({
    userMessage: input.message,
    toolResults,
    allowedTools,
    allowToolCalls,
    maxOutputTokens: 512,
  });

  let firstResponse: unknown;
  try {
    firstResponse = await generate(request([], true));
  } catch {
    return failure("DEPENDENCY", "O assistente está temporariamente indisponível.", true);
  }
  const parsedFirst = responseSchema.safeParse(firstResponse);
  if (!parsedFirst.success) return failure("DEPENDENCY", "Resposta inválida do assistente.", true);

  const toolCalls = parsedFirst.data.toolCalls ?? [];
  if (toolCalls.length === 0) {
    const text = parsedFirst.data.text?.trim();
    return text ? {ok: true, data: {text}} : failure("DEPENDENCY", "O assistente não produziu uma resposta.", true);
  }

  const toolResults: AssistantToolResult[] = [];
  for (const call of toolCalls) {
    let result: DomainResult<unknown>;
    try {
      result = await waitUntilDeadline(input.executeTool(input.context, call.name, call.arguments), deadline);
    } catch {
      return failure("DEPENDENCY", "Não foi possível concluir uma consulta autorizada.", true);
    }
    toolResults.push({name: call.name, result});
  }

  let serializedToolResults: string;
  try {
    serializedToolResults = JSON.stringify(toolResults);
  } catch {
    return failure("DEPENDENCY", "O resultado da consulta não pôde ser validado.", true);
  }
  if (typeof serializedToolResults !== "string" || serializedToolResults.length > maxToolResultCharacters) {
    return failure("DEPENDENCY", "O resultado da consulta excede o limite permitido.", true);
  }

  let finalResponse: unknown;
  try {
    finalResponse = await generate(request(toolResults, false));
  } catch {
    return failure("DEPENDENCY", "O assistente está temporariamente indisponível.", true);
  }
  const parsedFinal = responseSchema.safeParse(finalResponse);
  if (!parsedFinal.success || parsedFinal.data.toolCalls?.length) {
    return failure("DEPENDENCY", "Resposta inválida do assistente.", true);
  }
  const text = parsedFinal.data.text?.trim();
  return text ? {ok: true, data: {text}} : failure("DEPENDENCY", "O assistente não produziu uma resposta.", true);
}
