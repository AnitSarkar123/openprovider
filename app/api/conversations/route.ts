import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { privateBrowserCacheHeaders } from '@/lib/http/cache';
import { countUserConversations, listRecentConversations, MAX_USER_CONVERSATIONS } from '@/lib/openprovider/chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ data: [] }, {
      headers: privateBrowserCacheHeaders(),
    });
  }

  const [data, total] = await Promise.all([
    listRecentConversations(userId),
    countUserConversations(userId),
  ]);

  return NextResponse.json({
    data,
    meta: {
      limit: MAX_USER_CONVERSATIONS,
      remaining: Math.max(0, MAX_USER_CONVERSATIONS - total),
      total,
    },
  }, {
    headers: privateBrowserCacheHeaders(),
  });
}
