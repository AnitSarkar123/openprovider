import { NextRequest, NextResponse } from 'next/server';
import { getCatalogSnapshotForUser, type PublicModel } from '@/lib/openprovider/catalog';
import { requireOpenProviderApiKey } from '@/lib/openprovider/api-auth';
import { recordOpenProviderApiUsage, statusCodeFromOpenProviderError } from '@/lib/openprovider/api-usage';
import { modelListCacheHeaders } from '@/lib/http/cache';
import { parseModelCategory, parseModalitySet, parseSupportedParameters } from '@/lib/openprovider/model-filters';
import { modelHasAllModalities, modelSupportsAllParameters } from '@/src/core/modelCategoryUtils';
import type { RuntimeModelStatus } from '@/src/core/modelStatus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toOpenAIModel(model: PublicModel) {
  return {
    id: model.id,
    model_id: model.modelId,
    provider_model_id: model.modelId,
    object: 'model',
    created: 0,
    owned_by: model.provider,
    name: model.name,
    description: model.description,
    provider: model.provider,
    route_format: model.routeFormat ?? 'openai-compatible',
    category: model.category,
    input_modalities: model.inputModalities,
    output_modalities: model.outputModalities,
    context_length: model.maxInputTokens,
    max_output_tokens: model.maxOutputTokens,
    supports_tools: model.supportsTools,
    supports_reasoning: model.supportsReasoning,
    free: true,
    status: model.status ?? 'unknown',
    locked: model.locked,
    lock_reason: model.lockReason,
    routing_disabled: model.locked,
    routing_disabled_reason: model.lockReason,
  };
}

type V1ModelsResponsePayload = {
  object: 'list';
  data: ReturnType<typeof toOpenAIModel>[];
};

function withRouteCacheHeader(headers: HeadersInit, value: 'hit' | 'miss' | 'skip'): HeadersInit {
  return {
    ...Object.fromEntries(new Headers(headers)),
    'X-OpenProvider-Cache': value,
  };
}

function parseRuntimeStatuses(value: string | null): Set<RuntimeModelStatus> | null {
  if (!value) return null;

  const statuses = value
    .split(',')
    .map(status => status.trim().toLowerCase())
    .filter((status): status is RuntimeModelStatus => (
      status === 'unknown' || status === 'working' || status === 'failing'
    ));

  return statuses.length > 0 ? new Set(statuses) : null;
}

export async function GET(request: NextRequest) {
  const authResult = await requireOpenProviderApiKey(request);
  if ('response' in authResult) return authResult.response;
  const startedAt = Date.now();

  try {
    const refresh = request.nextUrl.searchParams.get('refresh') === 'true';
    const cacheHeaders = modelListCacheHeaders({ refresh, userSpecific: true });

    const snapshot = await getCatalogSnapshotForUser(
      authResult.auth.userId,
      refresh
    );
    const category = parseModelCategory(request.nextUrl.searchParams.get('category'));
    const provider = request.nextUrl.searchParams.get('provider')?.trim();
    const inputModalities = parseModalitySet(request.nextUrl.searchParams.get('input_modalities'));
    const outputModalities = parseModalitySet(request.nextUrl.searchParams.get('output_modalities'));
    const supportedParameters = parseSupportedParameters(request.nextUrl.searchParams.get('supported_parameters'));
    const statuses = parseRuntimeStatuses(request.nextUrl.searchParams.get('status'));
    const models = snapshot.models
      .filter(model => !category || model.category === category)
      .filter(model => !provider || model.provider === provider)
      .filter(model => !statuses || statuses.has(model.status ?? 'unknown'))
      .filter(model => modelHasAllModalities(model.inputModalities, inputModalities))
      .filter(model => modelHasAllModalities(model.outputModalities, outputModalities))
      .filter(model => modelSupportsAllParameters(model, supportedParameters))
      .map(toOpenAIModel);
    const payload: V1ModelsResponsePayload = {
      object: 'list',
      data: models,
    };

    await recordOpenProviderApiUsage({
      auth: authResult.auth,
      endpoint: '/v1/models',
      method: 'GET',
      ok: true,
      startedAt,
      statusCode: 200,
      workflow: 'models',
    });

    return NextResponse.json(payload, {
      headers: withRouteCacheHeader(cacheHeaders, refresh ? 'skip' : 'miss'),
    });
  } catch (error) {
    await recordOpenProviderApiUsage({
      auth: authResult.auth,
      endpoint: '/v1/models',
      error,
      method: 'GET',
      ok: false,
      startedAt,
      statusCode: statusCodeFromOpenProviderError(error),
      workflow: 'models',
    });
    throw error;
  }
}
