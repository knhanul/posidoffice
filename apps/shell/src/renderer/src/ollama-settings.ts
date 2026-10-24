import {
  newCustomEndpointId,
  removeCustomEndpoint,
  resolveCustomEndpoints,
  selectCustomEndpoint,
  upsertCustomEndpoint,
} from '@genoffice/ai-provider/browser'
import type { AiOllamaServer, AiSettings } from '@genoffice/ai-provider/browser'

/** An absent list is a first visit; an empty list means the user removed all servers. */
export function withDefaultOllamaServer(settings: AiSettings, name: string): AiSettings {
  if (settings.ollamaServers !== undefined) return settings
  return {
    ...settings,
    ollamaServers: [
      {
        id: 'ollama-local',
        name,
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
        endpointIds: [],
      },
    ],
  }
}

export function saveOllamaServer(settings: AiSettings, server: AiOllamaServer): AiSettings {
  let next = resolveCustomEndpoints(settings)
  const previous = next.ollamaServers?.find((s) => s.id === server.id)
  const updated = { ...server, endpointIds: previous?.endpointIds ?? [] }
  for (const endpoint of next.customEndpoints ?? []) {
    if (!updated.endpointIds.includes(endpoint.id)) continue
    next = upsertCustomEndpoint(next, {
      ...endpoint,
      baseUrl: server.baseUrl,
      apiKey: server.apiKey,
      name:
        endpoint.name === `${previous?.name} / ${endpoint.model}`.slice(0, 128)
          ? `${server.name} / ${endpoint.model}`.slice(0, 128)
          : endpoint.name,
    })
  }
  return {
    ...next,
    ollamaServers: previous
      ? next.ollamaServers!.map((s) => (s.id === server.id ? updated : s))
      : [...(next.ollamaServers ?? []), updated],
  }
}

export function registerOllamaModel(
  settings: AiSettings,
  serverId: string,
  model: string,
): AiSettings {
  let next = resolveCustomEndpoints(settings)
  const server = next.ollamaServers?.find((s) => s.id === serverId)
  if (!server || !model.trim()) return settings
  if (next.customEndpoints?.some((e) => server.endpointIds.includes(e.id) && e.model === model))
    return settings
  const active = next.customEndpoint
  const id = newCustomEndpointId()
  next = upsertCustomEndpoint(next, {
    id,
    name: `${server.name} / ${model}`.slice(0, 128),
    baseUrl: server.baseUrl,
    apiKey: server.apiKey,
    model,
    models: [model],
  })
  // Adding to the catalogue must not switch an already selected Custom model.
  if (active) next = selectCustomEndpoint(next, active)
  return {
    ...next,
    ollamaServers: next.ollamaServers!.map((s) =>
      s.id === serverId ? { ...s, endpointIds: [...s.endpointIds, id] } : s,
    ),
  }
}

export function unregisterOllamaModel(
  settings: AiSettings,
  serverId: string,
  endpointId: string,
): AiSettings {
  const server = settings.ollamaServers?.find((s) => s.id === serverId)
  if (!server?.endpointIds.includes(endpointId)) return settings
  const next = removeCustomEndpoint(resolveCustomEndpoints(settings), endpointId)
  return {
    ...next,
    ollamaServers: next.ollamaServers!.map((s) =>
      s.id === serverId
        ? { ...s, endpointIds: s.endpointIds.filter((id) => id !== endpointId) }
        : s,
    ),
  }
}

export function removeOllamaServer(settings: AiSettings, serverId: string): AiSettings {
  let next = settings
  const server = settings.ollamaServers?.find((s) => s.id === serverId)
  if (!server) return settings
  for (const id of server.endpointIds) next = unregisterOllamaModel(next, serverId, id)
  return { ...next, ollamaServers: next.ollamaServers?.filter((s) => s.id !== serverId) }
}
