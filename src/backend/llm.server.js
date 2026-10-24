import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

// One place that decides which model answers. Every configured model is tried in order and one
// that fails because its quota or credits are spent, or its key is rejected, is skipped for a
// while, so a single exhausted allowance never takes the assistants down. Providers, in order:
//   1. Groq (GROQ_API_KEY), fast OpenAI-compatible inference
//   2. Hugging Face (HF_API_KEY), the Inference Providers router
//   3. Gemini (LLM_API_KEY): LLM_MODEL if set, then the "latest" aliases, which have their own
//      free-tier allowances (fixed names such as gemini-2.5-flash are closed to new accounts)
// Keys and prompts never reach the browser.

const GROQ = "https://api.groq.com/openai/v1";
const HF_ROUTER = "https://router.huggingface.co/v1";
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai/";
const GEMINI_MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest"]; // the lite model answers in seconds
// How long a model that failed is left alone, by the kind of failure.
const SKIP_MS = { quota: 10 * 60 * 1000, auth: 30 * 60 * 1000, other: 60 * 1000 };

/** Every configured model, preferred first. */
export function llmConfigs(env = process.env) {
  const list = [];
  if (env["GROQ_API_KEY"])
    list.push({
      name: "groq",
      apiKey: env["GROQ_API_KEY"],
      baseURL: env["GROQ_BASE_URL"] ?? GROQ,
      model: env["GROQ_MODEL"] ?? "llama-3.3-70b-versatile",
    });
  if (env["HF_API_KEY"])
    list.push({
      name: "huggingface",
      apiKey: env["HF_API_KEY"],
      baseURL: env["HF_BASE_URL"] ?? HF_ROUTER,
      model: env["HF_CHAT_MODEL"] ?? "meta-llama/Llama-3.3-70B-Instruct",
    });
  if (env["LLM_API_KEY"]) {
    const models = [
      ...new Set(
        [env["LLM_MODEL"], ...(env["LLM_FALLBACK_MODELS"]?.split(",") ?? GEMINI_MODELS)]
          .map((m) => m?.trim())
          .filter(Boolean),
      ),
    ];
    for (const model of models)
      list.push({
        name: "llm",
        apiKey: env["LLM_API_KEY"],
        baseURL: env["LLM_BASE_URL"] ?? GEMINI,
        model,
      });
  }
  return list;
}

/** The preferred model's settings, or null when no key is configured. */
export const llmConfig = (env = process.env) => llmConfigs(env)[0] ?? null;

export const llmConfigured = () => llmConfig() !== null;

export function chatModel(config = llmConfig()) {
  if (!config) throw new Error("No language model is configured. Set HF_API_KEY or LLM_API_KEY.");
  const provider = createOpenAICompatible({
    name: "llm",
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
  return provider.chatModel(config.model);
}

const skipped = new Map(); // model key -> time until which it is left alone
const keyOf = (config) => `${config.baseURL}|${config.model}|${config.apiKey.slice(-6)}`;

export const resetLlmHealth = () => skipped.clear();

/** Remembers that a model failed so the next questions go to another one first. */
export function reportLlmFailure(config, error) {
  const status = error?.statusCode ?? error?.status;
  const kind =
    status === 429 || status === 402
      ? "quota"
      : [401, 403, 404].includes(status)
        ? "auth"
        : "other";
  skipped.set(keyOf(config), Date.now() + SKIP_MS[kind]);
  return kind;
}

const available = (config) => (skipped.get(keyOf(config)) ?? 0) <= Date.now();

export class LlmUnavailableError extends Error {
  constructor(message = "No language model is available right now.") {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

/**
 * One completion from the first model that answers. `call` can be injected so tests never touch the
 * network. Returns { text, model }; throws LlmUnavailableError when every model has failed.
 */
export async function generateWithFallback(
  { system, prompt, messages, temperature = 0.2, maxOutputTokens = 700, timeoutMs = 40_000 },
  { env = process.env, call } = {},
) {
  const configs = llmConfigs(env);
  if (!configs.length) throw new LlmUnavailableError("No language model is configured.");
  // Models that failed recently go to the back instead of being dropped, so a recovered quota is found.
  const ordered = [...configs.filter(available), ...configs.filter((c) => !available(c))];
  let last;
  for (const config of ordered) {
    try {
      const run =
        call ??
        (({ config: c }) =>
          generateText({
            model: chatModel(c),
            system,
            ...(messages ? { messages } : { prompt }),
            temperature,
            maxOutputTokens,
            maxRetries: 0,
            abortSignal: AbortSignal.timeout(timeoutMs),
          }));
      const { text } = await run({
        config,
        system,
        prompt,
        messages,
        temperature,
        maxOutputTokens,
      });
      if (!text?.trim())
        throw Object.assign(new Error("The model returned no text."), { statusCode: 0 });
      skipped.delete(keyOf(config));
      return { text: text.trim(), model: config.model };
    } catch (error) {
      reportLlmFailure(config, error);
      last = error;
    }
  }
  throw new LlmUnavailableError(
    `No language model answered (${String(last?.message ?? "unknown error").slice(0, 120)}).`,
  );
}

/** A completion for the agents; same fallback as above. */
export const generate = (options) => generateWithFallback(options);
