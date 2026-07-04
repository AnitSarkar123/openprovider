import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { privateBrowserCacheHeaders } from '@/lib/http/cache';
import { deleteConversation, getConversationWithMessages, renameConversation, replaceConversationMessages } from '@/lib/openprovider/chat';
import { readJsonObject } from '@/lib/openprovider/request-guards';
import { OpenProviderError } from '@/src/utils/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const { id } = await params;

  if (!userId) {
    return NextResponse.json(
      { error: { message: 'Authentication is required for this route.' } },
      { headers: privateBrowserCacheHeaders(), status: 401 }
    );
  }

  const conversation = await getConversationWithMessages(userId, id);
  if (!conversation) {
    return NextResponse.json(
      { error: { message: 'Conversation not found.' } },
      { headers: privateBrowserCacheHeaders(), status: 404 }
    );
  }

  return NextResponse.json({ data: conversation }, { headers: privateBrowserCacheHeaders() });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const { id } = await params;

  if (!userId) {
    return NextResponse.json(
      { error: { message: 'Authentication is required for this route.' } },
      { headers: privateBrowserCacheHeaders(), status: 401 }
    );
  }

  let body: { title?: unknown; messages?: unknown };
  try {
    body = await readJsonObject(request);
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : 'Invalid JSON body.' } },
      {
        headers: privateBrowserCacheHeaders(),
        status: error instanceof OpenProviderError ? error.status ?? 400 : 400,
      }
    );
  }

  try {
    if (Array.isArray(body.messages)) {
      const messages: Array<{ role: 'user' | 'assistant'; content: string; tokenUsage?: unknown }> = [];

      for (const message of body.messages) {
        if (!message || typeof message !== 'object') {
          throw new OpenProviderError('Conversation messages must be objects.', 400);
        }

        const candidate = message as { role?: unknown; content?: unknown; tokenUsage?: unknown };
        const role = candidate.role;
        if (role !== 'user' && role !== 'assistant') {
          throw new OpenProviderError('Conversation messages must use user or assistant roles.', 400);
        }

        if (typeof candidate.content !== 'string') {
          throw new OpenProviderError('Conversation messages must include string content.', 400);
        }

        messages.push({
          role,
          content: candidate.content,
          tokenUsage: candidate.tokenUsage,
        });
      }

      const conversation = await replaceConversationMessages(userId, id, messages);
      if (!conversation) {
        return NextResponse.json(
          { error: { message: 'Conversation not found.' } },
          { headers: privateBrowserCacheHeaders(), status: 404 }
        );
      }

      return NextResponse.json({ data: conversation }, { headers: privateBrowserCacheHeaders() });
    }

    if (typeof body.title !== 'string') {
      return NextResponse.json(
        { error: { message: 'Enter a conversation title.' } },
        { headers: privateBrowserCacheHeaders(), status: 400 }
      );
    }

    const conversation = await renameConversation(userId, id, body.title);
    if (!conversation) {
      return NextResponse.json(
        { error: { message: 'Conversation not found.' } },
        { headers: privateBrowserCacheHeaders(), status: 404 }
      );
    }

    return NextResponse.json({ data: conversation }, { headers: privateBrowserCacheHeaders() });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : 'Unable to update this conversation.',
        },
      },
      {
        headers: privateBrowserCacheHeaders(),
        status: error instanceof OpenProviderError ? error.status : 400,
      }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const { id } = await params;

  if (!userId) {
    return NextResponse.json(
      { error: { message: 'Authentication is required for this route.' } },
      { headers: privateBrowserCacheHeaders(), status: 401 }
    );
  }

  const deleted = await deleteConversation(userId, id);
  if (!deleted) {
    return NextResponse.json(
      { error: { message: 'Conversation not found.' } },
      { headers: privateBrowserCacheHeaders(), status: 404 }
    );
  }

  return NextResponse.json({ ok: true }, { headers: privateBrowserCacheHeaders() });
}
