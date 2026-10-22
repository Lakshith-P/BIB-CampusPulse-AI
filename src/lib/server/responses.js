import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";
export function createChatCall(request, config, messages, system) {
  const provider = createOpenAICompatible({
    name: "llm",
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
  const result = streamText({
    model: provider.chatModel(config.model),
    ...(system ? { system } : {}),
    messages,
    abortSignal: request.signal,
  });
  return { result };
}
