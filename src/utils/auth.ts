export function bearerToken(apiKey: string): string {
  return apiKey
    .trim()
    .replace(/^Authorization\s*:\s*/i, '')
    .replace(/^Bearer\s+/i, '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[^\x21-\x7e]+/g, '');
}

export function bearerAuthorizationHeader(apiKey: string): string {
  const token = bearerToken(apiKey);
  return token ? `Bearer ${token}` : '';
}
