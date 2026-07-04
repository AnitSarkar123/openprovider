import { NextResponse } from 'next/server';
import { authenticateOpenProviderApiKey } from '@/lib/openprovider/api-keys';

export async function requireOpenProviderApiKey(request: Request) {
  const auth = await authenticateOpenProviderApiKey(request);
  if (!auth) {
    return {
      response: NextResponse.json(
        {
          error: {
            message: 'Missing or invalid OpenProvider API key.',
            type: 'authentication_error',
          },
        },
        { status: 401 }
      ),
    };
  }

  return { auth };
}
