import { chatAnthropic } from './protocols/anthropic'
import { chatGemini } from './protocols/gemini'
import { chatOpenAiCompatible } from './protocols/openai-compatible'
import { ResponseBodyTooLargeError } from './protocols/shared'
import { chatCodexAppServer } from './codex-app-server'
import { chatClaudeCodeCli } from './claude-code-cli'
import { explainOllamaSystemError, isOllamaOrCustomRequest } from './ollama-friendly-error'
import { getProviderAdapter, type ResolvedEndpoint } from './registry'
import type { AiChatResponse, AiProviderConfig, AiProviderSelection } from './types'
import { AI_CHAT_RESPONSE_TIMEOUT_MS, createStreamWatchdog } from './watchdog'

/** route a one-shot (non-streaming, non-tool-calling) chat call by provider id */
export async function chatForProvider(
  provider: AiProviderSelection,
  config: AiProviderConfig,
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<AiChatResponse> {
  // non-streaming: the server generates the full answer before the headers arrive,
  // so the connect phase gets the long budget; the body read then gets the idle budget.
  // An endpoint's own timeout (e.g. a slow-loading Ollama server) can only widen it.
  const wd = createStreamWatchdog(
    signal,
    Math.max(AI_CHAT_RESPONSE_TIMEOUT_MS, config.connectTimeoutMs ?? 0),
  )
  const userMessages = [{ role: 'user' as const, text: user }]
  const friendlyEligible = isOllamaOrCustomRequest(config.baseUrl ?? '', provider === 'custom')
  const result = wd.guard(() => {
    let endpoint: ResolvedEndpoint
    try {
      endpoint = getProviderAdapter(provider).resolveEndpoint(config)
    } catch (e) {
      // config errors (unknown provider, missing base URL) report as a failed reply, not a rejection
      return Promise.resolve({
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      })
    }
    if (endpoint.model) config = { ...config, model: endpoint.model }
    switch (endpoint.protocol) {
      case 'codex-app-server':
        return chatCodexAppServer(config, system, user, wd.signal)
      case 'claude-code-cli':
        return chatClaudeCodeCli(wd, config, system, user)
      case 'anthropic':
        return chatAnthropic(wd, config, system, user, endpoint.baseUrl)
      case 'gemini':
        return chatGemini(wd, config, system, user, endpoint.baseUrl, {
          omitTemperature: endpoint.omitTemperature,
        })
      case 'openai-compatible':
        return chatOpenAiCompatible(wd, endpoint.baseUrl, config, system, user, {
          omitTemperature: endpoint.omitTemperature,
          bodyExtras: endpoint.bodyExtras,
          isCustomProvider: provider === 'custom',
        })
    }
  })
  return result
    .then((res) => {
      if (!res.ok && friendlyEligible && !signal?.aborted) {
        const friendly = explainOllamaSystemError(res.error, config, userMessages, system)
        if (friendly) return { ok: true as const, content: friendly }
      }
      return res
    })
    .catch((e) => {
      if (friendlyEligible && !signal?.aborted) {
        const friendly = explainOllamaSystemError(e, config, userMessages, system)
        if (friendly) return { ok: true as const, content: friendly }
      }
      if (e instanceof ResponseBodyTooLargeError) return { ok: false as const, error: e.message }
      throw e
    })
}
