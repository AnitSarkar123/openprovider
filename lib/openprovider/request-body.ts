import { OpenProviderError } from '@/src/utils/errors';
import { MEDIA_BODY_BYTES, assertRequestContentLength, readJsonObject } from './request-guards';

type UploadField = {
  bodyKey: string;
  defaultMimeType: string;
  fieldNames: string[];
  label: string;
};

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function isUpload(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
    typeof value !== 'string' &&
    typeof value.arrayBuffer === 'function'
  );
}

async function fileToDataUrl(file: File, fallbackMimeType: string, label: string): Promise<string> {
  if (file.size <= 0) {
    throw new OpenProviderError(`${label} upload cannot be empty.`, 400);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new OpenProviderError(`${label} upload exceeds the 20 MB limit.`, 413);
  }

  const mimeType = file.type.trim() || fallbackMimeType;
  const bytes = Buffer.from(await file.arrayBuffer());
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

async function readFormBody(request: Request, uploadFields: UploadField[]): Promise<Record<string, unknown>> {
  assertRequestContentLength(request, MEDIA_BODY_BYTES);

  const form = await request.formData();
  const body: Record<string, unknown> = {};

  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') {
      body[key] = value;
    }
  }

  for (const field of uploadFields) {
    const upload = field.fieldNames
      .map(name => form.get(name))
      .find(isUpload);

    if (upload) {
      body[field.bodyKey] = await fileToDataUrl(upload, field.defaultMimeType, field.label);
    }
  }

  return body;
}

export async function readOpenProviderRequestBody(
  request: Request,
  uploadFields: UploadField[] = []
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';

  if (
    contentType.includes('multipart/form-data') ||
    contentType.includes('application/x-www-form-urlencoded')
  ) {
    return readFormBody(request, uploadFields);
  }

  return readJsonObject(request, {
    invalidTypeMessage: 'Request body must be a JSON object or form data.',
    maxBytes: MEDIA_BODY_BYTES,
  });
}
