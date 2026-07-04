import { createOpenProviderClient } from '../core/openProvider';
import { categorizeModel, isChatRouteModel } from '../core/modelCategoryUtils';
import { ProviderModel } from '../core/types';

function categoryCounts(models: ProviderModel[]): Record<string, number> {
  return models.reduce<Record<string, number>>((counts, model) => {
    const category = categorizeModel(model);
    counts[category] = (counts[category] ?? 0) + 1;
    return counts;
  }, {});
}

async function main(): Promise<void> {
  const client = createOpenProviderClient();
  const results = await client.fetchProviderModelResults();
  const syncedModels = results.flatMap(result => result.models);
  const chatModels = syncedModels.filter(isChatRouteModel);
  const imageModels = syncedModels.filter(model => categorizeModel(model) === 'image');
  const visionModels = syncedModels.filter(model => categorizeModel(model) === 'vision');
  const audioModels = syncedModels.filter(model => categorizeModel(model) === 'audio');

  console.log(JSON.stringify({
    ok: results.some(result => result.ok),
    totalModels: syncedModels.length,
    categoryCounts: categoryCounts(syncedModels),
    chatModels: chatModels.length,
    imageModels: imageModels.length,
    imageToTextModels: visionModels.length,
    textToSpeechModels: audioModels.length,
    providers: results.map(result => ({
      provider: result.provider,
      ok: result.ok,
      skipped: result.skipped,
      modelCount: result.modelCount,
      categoryCounts: categoryCounts(result.models),
      discoveredModelCount: result.discoveredModelCount,
      filteredModelCount: result.filteredModelCount,
      status: result.status,
      error: result.error,
      sample: result.models.slice(0, 5).map(model => ({
        id: model.id,
        apiModel: model.modelId,
        category: categorizeModel(model),
        free: model.free,
        freeReason: model.freeReason,
      })),
    })),
  }, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({
    ok: false,
    error: (error as Error).message,
  }, null, 2));
  process.exitCode = 1;
});
