import "server-only";
import {
  runAssistantTurn,
  type AssistantTurnInput,
} from "./assistant-orchestration";
import {executeDomainAssistantTool} from "./assistant-tools.server";

type DomainAssistantTurnInput = Omit<AssistantTurnInput, "executeTool">;

export function runDomainAssistantTurn(input: DomainAssistantTurnInput) {
  return runAssistantTurn({
    ...input,
    executeTool: executeDomainAssistantTool,
  });
}
