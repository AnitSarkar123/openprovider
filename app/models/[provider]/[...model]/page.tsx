import type { Metadata } from 'next';
import { ModelDetail } from '@/components/models/model-detail';
import { getCatalogSnapshotForUser, type PublicModel } from '@/lib/openprovider/catalog';
import { createPageMetadata } from '@/lib/seo';
import { providerName } from '@/lib/provider-meta';

export const revalidate = 300;

type ModelDetailPageProps = {
  params: Promise<{ provider: string; model: string[] }>;
};

function findRouteModel(models: PublicModel[], provider: string, modelId: string): PublicModel | undefined {
  const normalizedModelId = modelId.toLowerCase();
  const normalizedRouteId = `${provider}/${modelId}`.toLowerCase();

  return models.find(model => (
    model.provider === provider
    && (
      model.modelId.toLowerCase() === normalizedModelId
      || model.id.toLowerCase() === normalizedRouteId
    )
  ));
}

function modelDetailPath(provider: string, modelId: string): string {
  return `/models/${provider}/${encodeURIComponent(modelId)}`;
}

export async function generateMetadata({
  params,
}: ModelDetailPageProps): Promise<Metadata> {
  const resolved = await params;
  const provider = resolved.provider;
  const modelId = decodeURIComponent(resolved.model.join('/'));
  const snapshot = await getCatalogSnapshotForUser(null);
  const model = findRouteModel(snapshot.models, provider, modelId);

  if (!model) {
    return createPageMetadata({
      title: 'Model not found',
      description: `OpenProvider could not find ${modelId} from ${providerName(provider)} in the current free model catalog.`,
      path: modelDetailPath(provider, modelId),
      noIndex: true,
    });
  }

  const providerLabel = providerName(model.provider);
  return createPageMetadata({
    title: `${model.name} by ${providerLabel}`,
    description: model.description || `${model.name} is a free ${providerLabel} ${model.category} model available through OpenProvider.`,
    path: modelDetailPath(provider, modelId),
  });
}

export default async function ModelDetailPage({
  params,
}: ModelDetailPageProps) {
  const resolved = await params;
  const provider = resolved.provider;
  const modelId = decodeURIComponent(resolved.model.join('/'));
  const snapshot = await getCatalogSnapshotForUser(null);
  const initialModel = findRouteModel(snapshot.models, provider, modelId);

  return (
    <ModelDetail
      initialModel={initialModel}
      provider={provider}
      modelId={modelId}
    />
  );
}
