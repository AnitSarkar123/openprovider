const providerDomains: Record<string, string> = {
  apifreellm: 'apifreellm.com',
  atxp: 'atxp.ai',
  cerbes: 'cerebras.ai',
  cloudflare: 'cloudflare.com',
  cohere: 'cohere.com',
  freemodel: 'freemodel.dev',
  google: 'aistudio.google.com',
  groq: 'groq.com',
  huggingface: 'huggingface.co',
  llm7: 'llm7.io',
  llmgateway: 'llmgateway.io',
  mistral: 'mistral.ai',
  nvidia: 'nvidia.com',
  ollama: 'ollama.com',
  openrouter: 'openrouter.ai',
  pollinations: 'pollinations.ai',
  puter: 'puter.com',
  routeway: 'routeway.ai',
  sambanova: 'sambanova.ai',
  shuttleai: 'shuttleai.com',
  siliconflow: 'siliconflow.com',
  zai: 'z.ai',
  zenmux: 'zenmux.ai',
};

const providerNames: Record<string, string> = {
  apifreellm: 'ApiFreeLLM',
  atxp: 'ATXP',
  cerbes: 'Cerebras',
  cloudflare: 'Cloudflare',
  cohere: 'Cohere',
  freemodel: 'FreeModel',
  google: 'Google AI Studio',
  groq: 'Groq',
  huggingface: 'Hugging Face',
  llm7: 'LLM7.io',
  llmgateway: 'LLMGateway',
  mistral: 'Mistral',
  nvidia: 'NVIDIA',
  ollama: 'Ollama',
  openprovider: 'OpenProvider',
  openrouter: 'OpenRouter',
  pollinations: 'Pollinations.ai',
  puter: 'Puter',
  routeway: 'Routeway',
  sambanova: 'SambaNova Cloud',
  shuttleai: 'ShuttleAI',
  siliconflow: 'SiliconFlow',
  zai: 'Z.AI',
  zenmux: 'ZenMux',
};

export function providerName(provider: string): string {
  return providerNames[provider] ?? provider;
}

export function providerIconUrl(provider: string): string | undefined {
  if (provider === 'openprovider') {
    return '/brand/openprovider-icon.png';
  }

  const domain = providerDomains[provider];

  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : undefined;
}
