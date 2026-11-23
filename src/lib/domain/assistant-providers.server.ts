import "server-only";
import type {AssistantProvider} from "./assistant-orchestration";
import {resolveAssistantProvidersFromEnv} from "./assistant-providers";

export function resolveConfiguredAssistantProviders(): Readonly<{
  primary: AssistantProvider;
  fallback?: AssistantProvider;
  mode: "configured" | "sandbox";
  primaryModel: string;
  primaryProvider: "gemini" | "openai_compatible" | "sandbox";
  fallbackModel?: string;
  geminiConfigured: boolean;
  fallbackConfigured: boolean;
}> {
  return resolveAssistantProvidersFromEnv(process.env);
}
