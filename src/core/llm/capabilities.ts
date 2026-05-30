export type ProviderSdkKey = 'openai' | 'anthropic' | 'deepseek' | 'openai-compatible';

export interface ProviderCapabilityProfile {
    providerKey: string;
    sdkKey: ProviderSdkKey;
    supportsEmbeddings: boolean;
    supportsModelListing: boolean;
    stripV1BaseURL: boolean;
    omitSamplingParameters: boolean;
}

interface ProviderCapabilityEntry {
    supportsEmbeddings: boolean;
    supportsModelListing: boolean;
    stripV1BaseURL?: boolean;
    omitSamplingParameters?: boolean;
}

const PROVIDER_ALIASES: Record<string, string> = {
    '@ai-sdk/openai': 'openai',
    openai: 'openai',
    'openai-compatible': 'openai-compatible',
    anthropic: 'anthropic',
    '@ai-sdk/anthropic': 'anthropic',
    claude: 'anthropic',
    deepseek: 'deepseek',
    '@ai-sdk/deepseek': 'deepseek',
    kimi: 'kimi',
    'kimi-cn': 'kimi',
    'kimi-code': 'kimi',
    'kimi-code-cn': 'kimi',
    'kimi-coding': 'kimi',
    'kimi-coding-cn': 'kimi',
    moonshot: 'kimi',
    'moonshot-cn': 'kimi',
    gemini: 'gemini',
    google: 'gemini',
    '@ai-sdk/google': 'gemini',
    ollama: 'ollama',
    groq: 'groq',
    together: 'together',
    fireworks: 'fireworks',
    mistral: 'mistral',
    perplexity: 'perplexity',
};

const PROVIDER_CAPABILITIES: Record<string, ProviderCapabilityEntry> = {
    openai: {
        supportsEmbeddings: true,
        supportsModelListing: true,
    },
    anthropic: {
        supportsEmbeddings: false,
        supportsModelListing: false,
        stripV1BaseURL: true,
    },
    deepseek: {
        supportsEmbeddings: false,
        supportsModelListing: true,
    },
    kimi: {
        supportsEmbeddings: false,
        supportsModelListing: true,
        omitSamplingParameters: true,
    },
    gemini: {
        supportsEmbeddings: false,
        supportsModelListing: true,
    },
    ollama: {
        supportsEmbeddings: false,
        supportsModelListing: true,
    },
    groq: {
        supportsEmbeddings: false,
        supportsModelListing: true,
    },
    together: {
        supportsEmbeddings: false,
        supportsModelListing: true,
    },
    fireworks: {
        supportsEmbeddings: false,
        supportsModelListing: true,
    },
    mistral: {
        supportsEmbeddings: false,
        supportsModelListing: true,
    },
    perplexity: {
        supportsEmbeddings: false,
        supportsModelListing: true,
    },
    'openai-compatible': {
        supportsEmbeddings: false,
        supportsModelListing: true,
    },
};

function normalizeProviderKey(value?: string): string {
    const normalized = (value || '').trim().toLowerCase();
    return PROVIDER_ALIASES[normalized] ?? normalized;
}

function normalizeSdkKey(sdkIdentifier: string): ProviderSdkKey {
    const normalized = normalizeProviderKey(sdkIdentifier);
    if (normalized === 'openai' || normalized === 'anthropic' || normalized === 'deepseek') {
        return normalized;
    }
    return 'openai-compatible';
}

export function resolveProviderCapabilities(input: {
    sdkIdentifier: string;
    providerName?: string;
}): ProviderCapabilityProfile {
    const sdkKey = normalizeSdkKey(input.sdkIdentifier);
    const declaredProviderKey = normalizeProviderKey(input.providerName);
    const sdkProviderKey = normalizeProviderKey(input.sdkIdentifier);
    const providerKey = declaredProviderKey || sdkProviderKey || 'openai-compatible';
    const capabilityKey = PROVIDER_CAPABILITIES[providerKey] ? providerKey : sdkKey;
    const capabilities = PROVIDER_CAPABILITIES[capabilityKey] ?? PROVIDER_CAPABILITIES['openai-compatible'];

    return {
        providerKey,
        sdkKey,
        supportsEmbeddings: capabilities.supportsEmbeddings,
        supportsModelListing: capabilities.supportsModelListing,
        stripV1BaseURL: capabilities.stripV1BaseURL ?? false,
        omitSamplingParameters: capabilities.omitSamplingParameters ?? false,
    };
}
