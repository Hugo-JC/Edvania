import {z} from "zod";
import type {AssistantProvider, AssistantProviderRequest} from "./assistant-orchestration.ts";
import type {AssistantToolName} from "./assistant-tools.ts";

const allowedToolSet = new Set<AssistantToolName>(["search_products", "get_product_details", "check_stock"]);

const toolDeclarations: Record<AssistantToolName, {description: string; parameters: Record<string, unknown>}> = {
  search_products: {
    description: "Pesquisa produtos activos pelo nome ou termo de pesquisa.",
    parameters: {
      type: "object",
      properties: {
        query: {type: "string", description: "Termo de pesquisa"},
        limit: {type: "integer", minimum: 1, maximum: 20},
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
        id: {type: "string", description: "UUID do produto"},
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  check_stock: {
    description: "Consulta o saldo de stock de um produto pelo UUID.",
    parameters: {
      type: "object",
      properties: {
        productId: {type: "string", description: "UUID do produto"},
      },
      required: ["productId"],
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
    "És a Edvânia, assistente comercial para lojas em Angola.",
    "Responde de forma clara e curta em português.",
    "Só podes consultar dados usando as ferramentas permitidas quando necessário:",
    tools || "nenhuma",
    "Nunca executes vendas, compras, alterações de stock ou operações de caixa sem confirmação explícita no painel.",
  ].join(" ");
}

function buildUserContent(request: AssistantProviderRequest): string {
  if (!request.toolResults.length) return request.userMessage;
  return `${request.userMessage}\n\nResultados das consultas:\n${JSON.stringify(request.toolResults)}`;
}

type FetchLike = typeof fetch;

export function createGeminiAssistantProvider(options: Readonly<{
  apiKey: string;
  model?: string;
  fetchImpl?: FetchLike;
}>): AssistantProvider {
  const apiKey = options.apiKey.trim();
  const model = (options.model ?? "gemini-2.5-flash").trim();
  const fetchImpl = options.fetchImpl ?? fetch;
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

  return {
    async generate(request, signal) {
      const enabledTools = request.allowToolCalls
        ? request.allowedTools.filter((name) => allowedToolSet.has(name))
        : [];
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

      const res = await fetchImpl(endpoint.toString(), {
        method: "POST",
        headers: {"Content-Type": "application/json", "x-goog-api-key": apiKey},
        body: JSON.stringify(payload),
        redirect: "error",
        signal,
      });
      if (!res.ok) throw new Error("provider_http_error");

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
      if (!res.ok) throw new Error("provider_http_error");

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
        return {text: "Consulta concluída no catálogo da loja."};
      }

      const lower = request.userMessage.trim().toLowerCase();
      if (/\b(vender|venda|comprar|compra|fechar caixa|abrir caixa|despesa)\b/.test(lower)) {
        return {
          text: "Operações que alteram vendas, compras ou caixa exigem resumo e confirmação explícita no painel antes de serem executadas.",
        };
      }

      if (request.allowToolCalls) {
        const cleaned = lower
          .replace(/\b(qual|quanto|custa|preço|preco|stock|tem|há|ha|produto|artigo|de|do|da|o|a)\b|\?/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const query = cleaned.slice(0, 60) || "a";
        return {
          toolCalls: [{name: "search_products", arguments: {query, limit: 5}}],
        };
      }

      return {text: "Posso consultar preços e produtos da loja. Indica o nome do artigo que procuras."};
    },
  };
}

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
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
  fallbackModel?: string;
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
    };
  }

  return {
    primary,
    fallback,
    mode: "configured",
    primaryModel: geminiKey ? primaryModel : fallbackModel,
    ...(fallback ? {fallbackModel} : {}),
  };
}
