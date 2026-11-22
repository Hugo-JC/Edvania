import "server-only";
import type {AssistantProvider} from "./assistant-orchestration";
import {resolveAssistantProvidersFromEnv} from "./assistant-providers";

export function resolveConfiguredAssistantProviders(): Readonly<{
  primary: AssistantProvider;
  fallback?: AssistantProvider;
  mode: "configured" | "sandbox";
}> {
  const resolved = resolveAssistantProvidersFromEnv(process.env);
  return {
    primary: resolved.primary,
    fallback: resolved.fallback,
    mode: resolved.mode,
  };
}
