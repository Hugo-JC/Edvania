import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSafeLlmEndpointUrl,
  createDeterministicSandboxProvider,
  createGeminiAssistantProvider,
  createOpenAiCompatibleProvider,
  resolveAssistantProvidersFromEnv,
} from "./assistant-providers.ts";

test("assertSafeLlmEndpointUrl rejects non-HTTPS, embedded credentials, and private/loopback targets", () => {
  assert.throws(() => assertSafeLlmEndpointUrl("http://api.groq.com/openai/v1"), RangeError);
  assert.throws(() => assertSafeLlmEndpointUrl("https://user:pass@api.groq.com/openai/v1"), RangeError);
  assert.throws(() => assertSafeLlmEndpointUrl("https://localhost/v1"), RangeError);
  assert.throws(() => assertSafeLlmEndpointUrl("https://127.0.0.1/v1"), RangeError);
  assert.throws(() => assertSafeLlmEndpointUrl("https://169.254.169.254/latest"), RangeError);
  assert.throws(() => assertSafeLlmEndpointUrl("https://192.168.1.10/v1"), RangeError);
  assert.equal(assertSafeLlmEndpointUrl("https://api.groq.com/openai/v1").hostname, "api.groq.com");
});

test("Gemini and OpenAI-compatible providers parse tool calls and text safely using mocked fetch", async () => {
  const controller = new AbortController();
  const gemini = createGeminiAssistantProvider({
    apiKey: "test-key",
    model: "gemini-2.5-flash",
    async fetchImpl(_url, init) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.generationConfig.maxOutputTokens, 512);
      assert.equal(init?.redirect, "error");
      return new Response(JSON.stringify({
        candidates: [{content: {parts: [{functionCall: {name: "search_products", args: {query: "arroz"}}}]}}],
      }), {status: 200});
    },
  });

  const geminiResult = await gemini.generate({
    userMessage: "Preço do arroz?",
    toolResults: [],
    allowedTools: ["search_products"],
    allowToolCalls: true,
    maxOutputTokens: 512,
  }, controller.signal);
  assert.deepEqual(geminiResult, {toolCalls: [{name: "search_products", arguments: {query: "arroz"}}]});

  const openai = createOpenAiCompatibleProvider({
    baseUrl: "https://api.groq.com/openai/v1",
    apiKey: "test-key",
    model: "llama-3.1-8b-instant",
    async fetchImpl(_url, init) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.max_tokens, 512);
      return new Response(JSON.stringify({
        choices: [{message: {content: "O arroz custa 500 AOA."}}],
      }), {status: 200});
    },
  });

  const openaiResult = await openai.generate({
    userMessage: "Preço do arroz?",
    toolResults: [],
    allowedTools: ["search_products"],
    allowToolCalls: false,
    maxOutputTokens: 512,
  }, controller.signal);
  assert.deepEqual(openaiResult, {text: "O arroz custa 500 AOA."});
});

test("deterministic sandbox provider blocks mutating commands and queries catalog read-only", async () => {
  const controller = new AbortController();
  const sandbox = createDeterministicSandboxProvider();
  const blocked = await sandbox.generate({
    userMessage: "Criar venda de 2 sacos de arroz",
    toolResults: [],
    allowedTools: ["search_products"],
    allowToolCalls: true,
    maxOutputTokens: 512,
  }, controller.signal);
  assert.match(blocked.text, /confirmação explícita/);

  const lookup = await sandbox.generate({
    userMessage: "Quanto custa arroz?",
    toolResults: [],
    allowedTools: ["search_products"],
    allowToolCalls: true,
    maxOutputTokens: 512,
  }, controller.signal);
  assert.deepEqual(lookup, {toolCalls: [{name: "search_products", arguments: {query: "arroz", limit: 5}}]});
});

test("resolveAssistantProvidersFromEnv defaults to gemini-4-hydrogen primary and gpt-4o-mini fallback", async () => {
  const sandbox = resolveAssistantProvidersFromEnv({});
  assert.equal(sandbox.mode, "sandbox");
  assert.equal(sandbox.fallback, undefined);

  const calledUrls = [];
  const configured = resolveAssistantProvidersFromEnv(
    {
      GEMINI_API_KEY: "test-gemini-key",
      LLM_FALLBACK_API_KEY: "test-openai-key",
    },
    async (url) => {
      calledUrls.push(String(url));
      if (String(url).includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({candidates: [{content: {parts: [{text: "ok-gemini"}]}}]}), {status: 200});
      }
      return new Response(JSON.stringify({choices: [{message: {content: "ok-openai"}}]}), {status: 200});
    },
  );
  assert.equal(configured.mode, "configured");
  assert.equal(configured.primaryModel, "gemini-4-hydrogen");
  assert.equal(configured.fallbackModel, "gpt-4o-mini");

  const controller = new AbortController();
  const req = {
    userMessage: "Olá",
    toolResults: [],
    allowedTools: ["search_products"],
    allowToolCalls: false,
    maxOutputTokens: 512,
  };
  await configured.primary.generate(req, controller.signal);
  await configured.fallback?.generate(req, controller.signal);

  assert.match(calledUrls[0], /models\/gemini-4-hydrogen:generateContent$/);
  assert.equal(calledUrls[1], "https://api.openai.com/v1/chat/completions");
});
