import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  activeCustomEndpoint,
  customEndpointLabel,
  ollamaEndpointLabel,
  prettyModelName,
  removeCustomEndpoint,
  resolveCustomEndpoints,
  selectCustomEndpoint,
  upsertCustomEndpoint,
} from '../src/custom-endpoints'
import { streamOpenAiCompatible } from '../src/protocols/openai-compatible'
import { okResponse, sseStream } from './test-utils'
import { sanitizeAiSettings } from '../src/ai-settings-guard'
import { defaultAiSettings, resolveAiSettings } from '../src/providers'
import { normalizeAiSettings } from '../src/legacy-settings'
import { normalizeOllamaServers, ollamaBaseUrl } from '../src/ollama-servers'
import type { AiCustomEndpoint } from '../src/types'

const ollama: AiCustomEndpoint = {
  id: 'a',
  name: 'Ollama',
  baseUrl: 'http://localhost:11434/v1',
  apiKey: '',
  model: 'llama3',
}
const gateway: AiCustomEndpoint = {
  id: 'b',
  name: '',
  baseUrl: 'https://gw.example.com/v1',
  apiKey: 'k',
  model: 'gpt-x',
  models: ['gpt-x', 'gpt-y'],
}

describe('Ollama server persistence', () => {
  const server = {
    id: 'local',
    name: 'Local',
    baseUrl: ollama.baseUrl,
    apiKey: '',
    endpointIds: ['a'],
  }

  it('round-trips servers with and without models through IPC and file normalization', () => {
    const settings = {
      ...defaultAiSettings(),
      customEndpoints: [ollama, gateway],
      customEndpoint: gateway.id,
      ollamaServers: [server, { ...server, id: 'empty', endpointIds: [] }],
    }
    const saved = sanitizeAiSettings(settings)
    const read = normalizeAiSettings(JSON.parse(JSON.stringify(saved)))
    expect(read.ollamaServers).toEqual(settings.ollamaServers)
    expect(read.customEndpoints).toEqual(settings.customEndpoints)
    expect(read.customEndpoint).toBe('b')
    expect(read.providers.custom.baseUrl).toBe(gateway.baseUrl)
    const removed = normalizeAiSettings(sanitizeAiSettings({ ...read, ollamaServers: [] }))
    expect(removed.ollamaServers).toEqual([])
  })

  it('rejects malformed metadata and prevents duplicate server or endpoint ownership', () => {
    const raw = [
      null,
      [],
      123,
      {},
      { ...server, baseUrl: 'file:///secret' },
      { ...server, baseUrl: 'http://user:password@localhost/v1' },
      server,
      { ...server, name: 'duplicate' },
      { ...server, id: 'second', endpointIds: ['a', 'b', 'b', null] },
    ]
    const expected = [server, { ...server, id: 'second', endpointIds: ['b'] }]
    expect(normalizeOllamaServers(raw)).toEqual(expected)
    expect(
      sanitizeAiSettings({ ...defaultAiSettings(), ollamaServers: raw })?.ollamaServers,
    ).toEqual(expected)
    expect(normalizeAiSettings({ providers: {}, ollamaServers: raw }).ollamaServers).toEqual(
      expected,
    )
    expect(ollamaBaseUrl(' http://localhost:11434/v1/ ')).toBe(ollama.baseUrl)
    expect(ollamaBaseUrl('javascript:alert(1)')).toBeUndefined()
  })
})

describe('resolveCustomEndpoints', () => {
  it('seeds the list from a pre-list custom slot and mirrors it back', () => {
    const settings = defaultAiSettings()
    settings.providers.custom = { apiKey: 'k', model: 'm', baseUrl: 'http://h/v1' }
    const next = resolveCustomEndpoints(settings)
    expect(next.customEndpoints).toHaveLength(1)
    expect(next.customEndpoints![0]).toMatchObject({
      apiKey: 'k',
      model: 'm',
      baseUrl: 'http://h/v1',
    })
    expect(next.customEndpoint).toBe(next.customEndpoints![0]!.id)
    expect(next.providers.custom).toEqual({ apiKey: 'k', model: 'm', baseUrl: 'http://h/v1' })
  })

  it('leaves an unconfigured file without a list', () => {
    const next = resolveCustomEndpoints(defaultAiSettings())
    expect(next.customEndpoints).toBeUndefined()
    expect(next.customEndpoint).toBeUndefined()
  })

  it('falls back to the first entry when the active id is stale', () => {
    const next = resolveCustomEndpoints({
      ...defaultAiSettings(),
      customEndpoints: [ollama, gateway],
      customEndpoint: 'gone',
    })
    expect(next.customEndpoint).toBe('a')
    expect(next.providers.custom.baseUrl).toBe(ollama.baseUrl)
  })

  it('drops duplicate and id-less entries', () => {
    const next = resolveCustomEndpoints({
      ...defaultAiSettings(),
      customEndpoints: [ollama, { ...gateway, id: 'a' }, { ...gateway, id: '' }],
    })
    expect(next.customEndpoints!.map((e) => e.id)).toEqual(['a'])
  })

  it('runs as part of resolveAiSettings', () => {
    const stored = {
      provider: 'custom',
      providers: { custom: { apiKey: '', model: 'old', baseUrl: 'http://old/v1' } },
      customEndpoints: [ollama, gateway],
      customEndpoint: 'b',
    }
    const settings = resolveAiSettings(stored, defaultAiSettings())
    expect(settings.providers.custom).toEqual({
      apiKey: 'k',
      model: 'gpt-x',
      baseUrl: gateway.baseUrl,
    })
    expect(activeCustomEndpoint(settings)?.id).toBe('b')
  })
})

describe('select / upsert / remove', () => {
  const base = resolveCustomEndpoints({
    ...defaultAiSettings(),
    customEndpoints: [ollama, gateway],
    customEndpoint: 'a',
  })

  it('switching the active endpoint swaps the slot', () => {
    const next = selectCustomEndpoint(base, 'b')
    expect(next.providers.custom.model).toBe('gpt-x')
    expect(base.providers.custom.model).toBe('llama3')
  })

  it('upsert edits in place and appends new ids as active', () => {
    const edited = upsertCustomEndpoint(base, { ...ollama, model: 'mistral' })
    expect(edited.customEndpoints!.map((e) => e.model)).toEqual(['mistral', 'gpt-x'])
    expect(edited.providers.custom.model).toBe('mistral')
    const added = upsertCustomEndpoint(base, { ...gateway, id: 'c', name: 'Third' })
    expect(added.customEndpoints).toHaveLength(3)
    expect(added.customEndpoint).toBe('c')
  })

  it('removing the active entry activates the next one, removing the last clears the slot', () => {
    const one = removeCustomEndpoint(base, 'a')
    expect(one.customEndpoint).toBe('b')
    expect(one.providers.custom.baseUrl).toBe(gateway.baseUrl)
    const none = removeCustomEndpoint(one, 'b')
    expect(none.customEndpoints).toBeUndefined()
    expect(none.providers.custom).toEqual({ apiKey: '', model: '', baseUrl: '' })
  })

  it('labels fall back to the host', () => {
    expect(customEndpointLabel(ollama, 'Custom')).toBe('Ollama')
    expect(customEndpointLabel(gateway, 'Custom')).toBe('gw.example.com')
    expect(customEndpointLabel({ ...gateway, baseUrl: '' }, 'Custom')).toBe('Custom')
  })
})

describe('sanitizeAiSettings', () => {
  it('keeps the endpoint list, drops bad base URLs and oversized ids', () => {
    const out = sanitizeAiSettings({
      provider: 'custom',
      providers: {},
      customEndpoints: [
        gateway,
        { ...ollama, id: 'x'.repeat(100), baseUrl: 'javascript:alert(1)' },
        { name: 'no id' },
      ],
      customEndpoint: 'b',
    })
    expect(out?.customEndpoints).toHaveLength(2)
    expect(out?.customEndpoints![0]).toEqual(gateway)
    expect(out?.customEndpoints![1]!.id).toHaveLength(64)
    expect(out?.customEndpoints![1]!.baseUrl).toBe('')
    expect(out?.customEndpoint).toBe('b')
  })

  it('omits the list when nothing survives', () => {
    const out = sanitizeAiSettings({ provider: 'custom', providers: {}, customEndpoints: 'nope' })
    expect(out?.customEndpoints).toBeUndefined()
  })

  it('preserves effort on custom endpoints and providers.custom', () => {
    const withEffort: AiCustomEndpoint = {
      ...ollama,
      effort: 'high',
    }
    const out = sanitizeAiSettings({
      provider: 'custom',
      providers: { custom: { apiKey: '', model: 'm', effort: 'high' } },
      customEndpoints: [withEffort],
      customEndpoint: withEffort.id,
    })
    expect(out?.customEndpoints?.[0]?.effort).toBe('high')
    expect(out?.providers.custom.effort).toBe('high')

    const resolved = resolveCustomEndpoints({
      ...defaultAiSettings(),
      customEndpoints: [withEffort],
      customEndpoint: withEffort.id,
    })
    expect(resolved.providers.custom.effort).toBe('high')
  })
})

describe('prettyModelName and ollamaEndpointLabel', () => {
  it('formats raw model tags cleanly', () => {
    expect(prettyModelName('gemma-4-e4b-q4-0-it:latest')).toBe('Gemma 4 E4b')
    expect(prettyModelName('qwen2.5:14b')).toBe('Qwen2.5 14b')
    expect(prettyModelName('llama3.2:1b')).toBe('Llama3.2 1b')
    expect(prettyModelName('deepseek-r1:8b')).toBe('Deepseek R1 8b')
    expect(prettyModelName('mistral:latest')).toBe('Mistral')
  })

  it('formats endpoint labels with effort or legacy fallback', () => {
    const epWithEffort: AiCustomEndpoint = {
      ...ollama,
      model: 'gemma-4-e4b-q4-0-it:latest',
      effort: 'medium',
    }
    expect(ollamaEndpointLabel(epWithEffort)).toBe('Gemma 4 E4b medium')

    const epWithoutEffort: AiCustomEndpoint = {
      ...ollama,
      name: 'Local / llama3',
      model: 'llama3:latest',
    }
    expect(ollamaEndpointLabel(epWithoutEffort)).toBe('Local / llama3')
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('streamOpenAiCompatible effort handling', () => {
  it('injects preset temperature and options for low, medium, and high', async () => {
    let sentBody: Record<string, unknown> = {}
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      sentBody = JSON.parse(init.body as string)
      return okResponse(
        sseStream([
          'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}',
          'data: [DONE]',
        ]),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    // low effort
    await streamOpenAiCompatible(
      'http://localhost:11434/v1',
      { apiKey: '', model: 'llama3.2', effort: 'low' },
      'system',
      [{ role: 'user', text: 'hi' }],
      [],
      1000,
      { signal: new AbortController().signal, onDelta: () => {}, onToolCall: () => {} },
    )
    expect(sentBody.temperature).toBe(0.2)
    expect(sentBody.options).toEqual({ num_ctx: 8192, num_predict: 1024 })

    // high effort
    await streamOpenAiCompatible(
      'http://localhost:11434/v1',
      { apiKey: '', model: 'llama3.2', effort: 'high' },
      'system',
      [{ role: 'user', text: 'hi' }],
      [],
      1000,
      { signal: new AbortController().signal, onDelta: () => {}, onToolCall: () => {} },
    )
    expect(sentBody.temperature).toBe(0.8)
    expect(sentBody.options).toEqual({ num_ctx: 32768, num_predict: 3072 })

    // default without effort
    await streamOpenAiCompatible(
      'http://localhost:11434/v1',
      { apiKey: '', model: 'llama3.2' },
      'system',
      [{ role: 'user', text: 'hi' }],
      [],
      1000,
      { signal: new AbortController().signal, onDelta: () => {}, onToolCall: () => {} },
    )
    expect(sentBody.temperature).toBe(0.3)
    expect(sentBody.options).toBeUndefined()
  })
})
