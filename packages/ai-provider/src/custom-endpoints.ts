// Several user-hosted OpenAI-compatible servers side by side. The request path
// only ever reads `providers.custom`, so the list is kept next to it and the
// active entry is copied into that slot on every change: nothing downstream
// learns about endpoints, and a settings file from before the list existed
// still works because its single slot becomes the first entry.
import type { AiCustomEndpoint, AiModelEffort, AiProviderConfig, AiSettings } from './types'

export const OLLAMA_EFFORT_PRESETS: Record<
  AiModelEffort,
  { temperature: number; num_ctx: number; num_predict: number }
> = {
  low: { temperature: 0.2, num_ctx: 8192, num_predict: 1024 },
  medium: { temperature: 0.5, num_ctx: 16384, num_predict: 2048 },
  high: { temperature: 0.8, num_ctx: 32768, num_predict: 3072 },
}

export function prettyModelName(model: string): string {
  return model
    .replace(/:latest$/i, '')
    .replace(/-q[0-9](?:_[0-9])?.*$/i, '')
    .replace(/[:\-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function newCustomEndpointId(): string {
  let id = ''
  for (let i = 0; i < 8; i += 1) id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]
  return `ep-${id}`
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function configuredSlot(config: AiProviderConfig | undefined): boolean {
  return Boolean(str(config?.baseUrl) || str(config?.model) || str(config?.apiKey))
}

function normalizeEndpoints(raw: unknown): AiCustomEndpoint[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: AiCustomEndpoint[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as Record<string, unknown>
    const id = str(e.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const models = Array.isArray(e.models)
      ? [
          ...new Set(
            e.models.filter((m): m is string => typeof m === 'string').map((m) => m.trim()),
          ),
        ].filter(Boolean)
      : undefined
    const effortRaw = e.effort
    const effort =
      effortRaw === 'low' || effortRaw === 'medium' || effortRaw === 'high' ? effortRaw : undefined
    out.push({
      id,
      name: str(e.name),
      baseUrl: str(e.baseUrl),
      apiKey: str(e.apiKey),
      model: str(e.model),
      ...(models && models.length > 0 ? { models } : {}),
      ...(effort ? { effort } : {}),
    })
  }
  return out
}

/**
 * The endpoint list and the `custom` slot made consistent. A file with a slot
 * but no list gets a one-entry list; a stale active id falls to the first
 * entry; the active entry is copied into the slot. Pure: returns a new object.
 */
export function resolveCustomEndpoints(settings: AiSettings): AiSettings {
  let endpoints = normalizeEndpoints(settings.customEndpoints)
  const slot = settings.providers?.custom
  if (endpoints.length === 0 && configuredSlot(slot)) {
    endpoints = [
      {
        id: newCustomEndpointId(),
        name: '',
        baseUrl: str(slot?.baseUrl),
        apiKey: str(slot?.apiKey),
        model: str(slot?.model),
      },
    ]
  }
  if (endpoints.length === 0) {
    const { customEndpoints: _list, customEndpoint: _active, ...rest } = settings
    return rest
  }
  const active =
    endpoints.find((e) => e.id === str(settings.customEndpoint)) ??
    (endpoints[0] as AiCustomEndpoint)
  return {
    ...settings,
    customEndpoints: endpoints,
    customEndpoint: active.id,
    providers: {
      ...settings.providers,
      custom: {
        apiKey: active.apiKey,
        model: active.model,
        baseUrl: active.baseUrl,
        ...(active.effort ? { effort: active.effort } : {}),
      },
    },
  }
}

export function activeCustomEndpoint(settings: AiSettings): AiCustomEndpoint | undefined {
  return settings.customEndpoints?.find((e) => e.id === settings.customEndpoint)
}

export function selectCustomEndpoint(settings: AiSettings, id: string): AiSettings {
  return resolveCustomEndpoints({ ...settings, customEndpoint: id })
}

/** Replace the entry with the same id, or append; the new entry becomes active when `activate` is set. */
export function upsertCustomEndpoint(
  settings: AiSettings,
  endpoint: AiCustomEndpoint,
  activate = false,
): AiSettings {
  const list = settings.customEndpoints ?? []
  const exists = list.some((e) => e.id === endpoint.id)
  const customEndpoints = exists
    ? list.map((e) => (e.id === endpoint.id ? endpoint : e))
    : [...list, endpoint]
  return resolveCustomEndpoints({
    ...settings,
    customEndpoints,
    customEndpoint: activate || !exists ? endpoint.id : settings.customEndpoint,
  })
}

export function removeCustomEndpoint(settings: AiSettings, id: string): AiSettings {
  const customEndpoints = (settings.customEndpoints ?? []).filter((e) => e.id !== id)
  // the slot mirrored the removed entry; cleared first or it would be re-seeded as a new entry
  const blank: AiProviderConfig = { apiKey: '', model: '', baseUrl: '' }
  return resolveCustomEndpoints({
    ...settings,
    customEndpoints,
    providers: { ...settings.providers, custom: blank },
  })
}

/** Display name for a picker row: the user's name, else the host part of the address. */
export function customEndpointLabel(endpoint: AiCustomEndpoint, fallback: string): string {
  if (endpoint.name) return endpoint.name
  try {
    return new URL(endpoint.baseUrl).host || fallback
  } catch {
    return endpoint.baseUrl || fallback
  }
}

/** Display name for an Ollama endpoint: pretty model name + effort, or saved name for legacy entries. */
export function ollamaEndpointLabel(endpoint: AiCustomEndpoint, fallback = 'Ollama'): string {
  const pretty = prettyModelName(endpoint.model)
  if (endpoint.effort) {
    return `${pretty} ${endpoint.effort}`
  }
  return customEndpointLabel(endpoint, fallback)
}
