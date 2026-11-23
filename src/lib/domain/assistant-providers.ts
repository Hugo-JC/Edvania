import {GoogleGenAI, type FunctionDeclaration} from "@google/genai";
import {z} from "zod";
import type {AssistantProvider, AssistantProviderRequest} from "./assistant-orchestration.ts";
import type {AssistantToolName} from "./assistant-tools.ts";

export const ALL_READ_ONLY_ASSISTANT_TOOLS: readonly AssistantToolName[] = [
  "get_store_summary",
  "search_products",
  "get_product_details",
  "check_stock",
  "search_customers",
  "get_customer_balance",
  "get_sales_summary",
  "get_cash_register_status",
];

const allowedToolSet = new Set<AssistantToolName>(ALL_READ_ONLY_ASSISTANT_TOOLS);

const toolDeclarations: Record<AssistantToolName, {description: string; parameters: Record<string, unknown>}> = {
  get_store_summary: {
    description: "Obtém o resumo comercial da loja (nome, moeda, nº de produtos, clientes, total de vendas, total de compras e sessões de caixa abertas).",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  search_products: {
    description: "Pesquisa produtos activos pelo nome ou termo de pesquisa.",
    parameters: {
      type: "object",
      properties: {
        query: {type: "string", description: "Termo de pesquisa"},
        limit: {type: "integer", minimum: 1, maximum: 10},
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  get_product_details: {
    description: "Obtém detalhes de um produto pelo UUID.",
    parameters: {
      type: "object",
      properties: {
        productId: {type: "string", description: "UUID do produto"},
      },
      required: ["productId"],
      additionalProperties: false,
    },
  },
  check_stock: {
    description: "Consulta o saldo de stock de um produto específico (por productId UUID) ou de todo o inventário da loja (sem productId).",
    parameters: {
      type: "object",
      properties: {
        productId: {type: "string", description: "UUID opcional do produto"},
      },
      additionalProperties: false,
    },
  },
  search_customers: {
    description: "Pesquisa clientes activos pelo nome.",
    parameters: {
      type: "object",
      properties: {
        query: {type: "string", description: "Nome ou parte do nome do cliente"},
        limit: {type: "integer", minimum: 1, maximum: 10},
      },
      additionalProperties: false,
    },
  },
  get_customer_balance: {
    description: "Consulta o saldo em aberto (a receber em AOA) de um cliente específico pelo UUID.",
    parameters: {
      type: "object",
      properties: {
        customerId: {type: "string", description: "UUID do cliente"},
      },
      required: ["customerId"],
      additionalProperties: false,
    },
  },
  get_sales_summary: {
    description: "Obtém o total de vendas confirmadas e as 10 vendas mais recentes da loja.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  get_cash_register_status: {
    description: "Lista as sessões de caixa actualmente abertas e o saldo inicial.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
};

function isPrivateOrLocalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    lower === "localhost"
    || lower === "0.0.0.0"
    || lower === "::1"
    || lower.endsWith(".localhost")
    || lower.endsWith(".local")
    || lower.endsWith(".internal")
  ) {
    return true;
  }
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipv4Match) {
    const [a, b] = [Number(ipv4Match[1]), Number(ipv4Match[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")) {
    return true;
  }
  return false;
}

export function assertSafeLlmEndpointUrl(rawUrl: string): URL {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "https:") {
    throw new RangeError("LLM endpoint must use HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new RangeError("LLM endpoint must not include embedded credentials.");
  }
  if (isPrivateOrLocalHostname(parsed.hostname)) {
    throw new RangeError("LLM endpoint hostname is not allowed.");
  }
  return parsed;
}

function buildSystemInstruction(request: AssistantProviderRequest): string {
  const tools = request.allowedTools.filter((name) => allowedToolSet.has(name)).join(", ");
  return [
    "És a Edvânia, assistente comercial oficial para lojas e comerciantes em Angola (moeda AOA, fuso horário Africa/Luanda).",
    "Responde sempre de forma clara, objectiva e cordial em português (pt-AO).",
    "Quando o utilizador perguntar por preços, produtos, stock, vendas, clientes ou estado de caixa, usa as ferramentas read-only disponíveis:",
    tools || "nenhuma",
    "Nunca inventes valores nem assumas preços ou saldos sem consultar as ferramentas.",
    "Nunca executes vendas, compras, alterações de stock ou operações de caixa autonomamente — orienta o operador a usar a confirmação explícita no painel.",
  ].join(" ");
}

function buildUserContent(request: AssistantProviderRequest): string {
  const historyLines = (request.history ?? [])
    .slice(-8)
    .map((entry) => `${entry.role === "user" ? "Utilizador" : "Edvânia"}: ${entry.text.slice(0, 600)}`)
    .join("\n");
  const baseMessage = historyLines
    ? `Contexto recente da conversa:\n${historyLines}\n\nMensagem actual:\n${request.userMessage}`
    : request.userMessage;

  if (!request.toolResults.length) return baseMessage;
  return `${baseMessage}\n\nResultados das consultas autorizadas:\n${JSON.stringify(request.toolResults)}`;
}

type FetchLike = typeof fetch;

export function createGeminiAssistantProvider(options: Readonly<{
  apiKey: string;
  model?: string;
  fetchImpl?: FetchLike;
}>): AssistantProvider {
  const apiKey = options.apiKey.trim();
  const model = (options.model ?? DEFAULT_GEMINI_MODEL).trim();
  const fetchImpl = options.fetchImpl;
  if (!apiKey) throw new RangeError("Gemini API key is required.");
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(model)) throw new RangeError("Invalid Gemini model name.");

  const endpoint = assertSafeLlmEndpointUrl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
  );

  const responseValidator = z.object({
    candidates: z.array(z.object({
      content: z.object({
        parts: z.array(z.object({
          text: z.string().optional(),
          functionCall: z.object({
            name: z.string(),
            args: z.record(z.string(), z.unknown()).optional(),
          }).optional(),
        })).optional(),
      }).optional(),
    })).optional(),
  });

  // Use official @google/genai SDK in runtime; retain injected fetchImpl strictly for unit-test mocks.
  const sdkClient = fetchImpl
    ? null
    : new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

  return {
    async generate(request, signal) {
      const enabledTools = request.allowToolCalls
        ? request.allowedTools.filter((name) => allowedToolSet.has(name))
        : [];

      if (sdkClient) {
        const declarations: FunctionDeclaration[] = enabledTools.map((name) => ({
          name,
          description: toolDeclarations[name].description,
          parametersJsonSchema: toolDeclarations[name].parameters,
        }));

        const isGemini4 = model.startsWith("gemini-4-");
        const response = await sdkClient.models.generateContent({
          model,
          contents: buildUserContent(request),
          config: {
            systemInstruction: buildSystemInstruction(request),
            ...(isGemini4 ? {} : {maxOutputTokens: request.maxOutputTokens, temperature: 0.2}),
            abortSignal: signal,
            ...(declarations.length ? {tools: [{functionDeclarations: declarations}]} : {}),
          },
        });

        const calls = (response.functionCalls ?? []).slice(0, 3).map((call) => ({
          name: call.name ?? "",
          arguments: (call.args && typeof call.args === "object" && !Array.isArray(call.args))
            ? (call.args as Record<string, unknown>)
            : {},
        })).filter((call) => call.name.length > 0);

        if (calls.length > 0) {
          return {toolCalls: calls};
        }

        const text = (response.text ?? "").trim();
        return {text: text.slice(0, 4_000)};
      }

      const payload = {
        systemInstruction: {parts: [{text: buildSystemInstruction(request)}]},
        contents: [{role: "user", parts: [{text: buildUserContent(request)}]}],
        generationConfig: {maxOutputTokens: request.maxOutputTokens, temperature: 0.2},
        ...(enabledTools.length
          ? {
            tools: [{
              functionDeclarations: enabledTools.map((name) => ({
                name,
                description: toolDeclarations[name].description,
                parameters: toolDeclarations[name].parameters,
              })),
            }],
          }
          : {}),
      };

      const res = await fetchImpl!(endpoint.toString(), {
        method: "POST",
        headers: {"Content-Type": "application/json", "x-goog-api-key": apiKey},
        body: JSON.stringify(payload),
        redirect: "error",
        signal,
      });
      if (!res.ok) throw new Error(`provider_http_error_${res.status}`);

      const parsed = responseValidator.parse(await res.json());
      const parts = parsed.candidates?.[0]?.content?.parts ?? [];
      const toolCalls = parts
        .filter((part): part is {functionCall: {name: string; args?: Record<string, unknown>}} => Boolean(part.functionCall))
        .slice(0, 3)
        .map((part) => ({
          name: part.functionCall.name,
          arguments: part.functionCall.args ?? {},
        }));
      if (toolCalls.length > 0) {
        return {toolCalls};
      }
      const text = parts.map((part) => part.text ?? "").join("").trim();
      return {text: text.slice(0, 4_000)};
    },
  };
}

export function createOpenAiCompatibleProvider(options: Readonly<{
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: FetchLike;
}>): AssistantProvider {
  const apiKey = options.apiKey.trim();
  const model = options.model.trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!apiKey) throw new RangeError("Provider API key is required.");
  if (!model || model.length > 100) throw new RangeError("Invalid model name.");

  const base = assertSafeLlmEndpointUrl(options.baseUrl.replace(/\/+$/, ""));
  const endpoint = assertSafeLlmEndpointUrl(`${base.toString()}/chat/completions`);

  const responseValidator = z.object({
    choices: z.array(z.object({
      message: z.object({
        content: z.string().nullable().optional(),
        tool_calls: z.array(z.object({
          function: z.object({
            name: z.string(),
            arguments: z.string(),
          }),
        })).optional(),
      }).optional(),
    })).optional(),
  });

  return {
    async generate(request, signal) {
      const enabledTools = request.allowToolCalls
        ? request.allowedTools.filter((name) => allowedToolSet.has(name))
        : [];
      const payload = {
        model,
        max_tokens: request.maxOutputTokens,
        temperature: 0.2,
        messages: [
          {role: "system", content: buildSystemInstruction(request)},
          {role: "user", content: buildUserContent(request)},
        ],
        ...(enabledTools.length
          ? {
            tools: enabledTools.map((name) => ({
              type: "function",
              function: {
                name,
                description: toolDeclarations[name].description,
                parameters: toolDeclarations[name].parameters,
              },
            })),
          }
          : {}),
      };

      const res = await fetchImpl(endpoint.toString(), {
        method: "POST",
        headers: {"Content-Type": "application/json", Authorization: `Bearer ${apiKey}`},
        body: JSON.stringify(payload),
        redirect: "error",
        signal,
      });
      if (!res.ok) throw new Error(`provider_http_error_${res.status}`);

      const parsed = responseValidator.parse(await res.json());
      const msg = parsed.choices?.[0]?.message;
      const toolCalls = (msg?.tool_calls ?? []).slice(0, 3).map((call) => {
        let args: Record<string, unknown> = {};
        try {
          const decoded = JSON.parse(call.function.arguments);
          if (typeof decoded === "object" && decoded !== null && !Array.isArray(decoded)) {
            args = decoded as Record<string, unknown>;
          }
        } catch {
          args = {};
        }
        return {name: call.function.name, arguments: args};
      });
      if (toolCalls.length > 0) {
        return {toolCalls};
      }
      return {text: (msg?.content ?? "").trim().slice(0, 4_000)};
    },
  };
}

export function createDeterministicSandboxProvider(): AssistantProvider {
  return {
    async generate(request) {
      if (request.toolResults.length > 0) {
        const search = request.toolResults.find((item) => item.name === "search_products");
        if (search && search.result.ok && Array.isArray(search.result.data)) {
          const rows = search.result.data as {name?: string; sale_price?: number | string; unit?: string}[];
          if (!rows.length) {
            return {text: "Não encontrei artigos correspondentes no catálogo activo desta loja."};
          }
          const lines = rows.slice(0, 5).map(
            (row) => `• ${row.name ?? "Artigo"}: ${Number(row.sale_price ?? 0).toFixed(2)} AOA (${row.unit ?? "un"})`,
          );
          return {text: `Artigos encontrados:\n${lines.join("\n")}`};
        }

        const summary = request.toolResults.find((item) => item.name === "get_store_summary");
        if (summary && summary.result.ok && summary.result.data && typeof summary.result.data === "object") {
          const s = summary.result.data as {
            store?: {name?: string};
            productCount?: number;
            customerCount?: number;
            salesTotal?: number;
            openCashSessions?: number;
          };
          return {
            text: `Resumo da loja ${s.store?.name ?? ""}: ${s.productCount ?? 0} produto(s), ${s.customerCount ?? 0} cliente(s), vendas confirmadas de ${Number(s.salesTotal ?? 0).toFixed(2)} AOA e ${s.openCashSessions ?? 0} caixa(s) aberta(s).`,
          };
        }

        const cash = request.toolResults.find((item) => item.name === "get_cash_register_status");
        if (cash && cash.result.ok && Array.isArray(cash.result.data)) {
          return {
            text: cash.result.data.length
              ? `Tens ${cash.result.data.length} sessão(ões) de caixa aberta(s) neste momento.`
              : "Não há sessões de caixa abertas nesta loja neste momento.",
          };
        }

        return {text: "Consulta concluída no catálogo e registos da loja."};
      }

      const lower = request.userMessage.trim().toLowerCase();
      if (/\b(vender|venda|comprar|compra|fechar caixa|abrir caixa|despesa)\b/.test(lower)
        && !/\b(resumo|total|quantas|como est[aá]|estado)\b/.test(lower)) {
        return {
          text: "Operações que alteram vendas, compras ou caixa exigem resumo e confirmação explícita no painel antes de serem executadas.",
        };
      }

      if (request.allowToolCalls) {
        if (/\b(resumo|loja|indicador|hoje|relat[oó]rio)\b/.test(lower) && request.allowedTools.includes("get_store_summary")) {
          return {toolCalls: [{name: "get_store_summary", arguments: {}}]};
        }
        if (/\b(caixa|turno|sess[aã]o)\b/.test(lower) && request.allowedTools.includes("get_cash_register_status")) {
          return {toolCalls: [{name: "get_cash_register_status", arguments: {}}]};
        }
        const cleaned = lower
          .replace(/\b(qual|quanto|custa|preço|preco|stock|tem|há|ha|produto|artigo|de|do|da|o|a)\b|\?/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const query = cleaned.slice(0, 60) || "a";
        return {
          toolCalls: [{name: "search_products", arguments: {query, limit: 5}}],
        };
      }

      return {text: "Posso consultar preços, stock, clientes, vendas e caixa da loja. O que gostarias de verificar?"};
    },
  };
}

export const DEFAULT_GEMINI_MODEL = "gemini-4-hydrogen";
export const DEFAULT_OPENAI_FALLBACK_URL = "https://api.openai.com/v1";
export const DEFAULT_OPENAI_FALLBACK_MODEL = "gpt-4o-mini";

export function resolveAssistantProvidersFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  fetchImpl?: FetchLike,
): Readonly<{
  primary: AssistantProvider;
  fallback?: AssistantProvider;
  mode: "configured" | "sandbox";
  primaryModel: string;
  primaryProvider: "gemini" | "openai_compatible" | "sandbox";
  fallbackModel?: string;
  geminiConfigured: boolean;
  fallbackConfigured: boolean;
}> {
  const geminiKey = env.GEMINI_API_KEY?.trim();
  const primaryModel = env.LLM_PRIMARY_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const fallbackKey = env.LLM_FALLBACK_API_KEY?.trim();
  const fallbackUrl = env.LLM_FALLBACK_URL?.trim() || DEFAULT_OPENAI_FALLBACK_URL;
  const fallbackModel = env.LLM_FALLBACK_MODEL?.trim() || DEFAULT_OPENAI_FALLBACK_MODEL;

  let primary: AssistantProvider | undefined;
  let fallback: AssistantProvider | undefined;

  if (geminiKey) {
    primary = createGeminiAssistantProvider({
      apiKey: geminiKey,
      model: primaryModel,
      fetchImpl,
    });
  }

  if (fallbackKey) {
    const openAiCompatible = createOpenAiCompatibleProvider({
      baseUrl: fallbackUrl,
      apiKey: fallbackKey,
      model: fallbackModel,
      fetchImpl,
    });
    if (!primary) {
      primary = openAiCompatible;
    } else {
      fallback = openAiCompatible;
    }
  }

  if (!primary) {
    return {
      primary: createDeterministicSandboxProvider(),
      mode: "sandbox",
      primaryModel: "sandbox",
      primaryProvider: "sandbox",
      geminiConfigured: false,
      fallbackConfigured: false,
    };
  }

  return {
    primary,
    fallback,
    mode: "configured",
    primaryModel: geminiKey ? primaryModel : fallbackModel,
    primaryProvider: geminiKey ? "gemini" : "openai_compatible",
    geminiConfigured: Boolean(geminiKey),
    fallbackConfigured: Boolean(fallbackKey),
    ...(fallback ? {fallbackModel} : {}),
  };
}
