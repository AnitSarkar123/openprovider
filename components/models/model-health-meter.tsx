'use client';

type ModelHealthStatus = 'unknown' | 'working' | 'failing';

type ModelHealthMeterProps = {
  checkedAt?: string;
  error?: string;
  latencyMs?: number;
  segments?: number;
  status?: ModelHealthStatus;
};

const STATUS_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

function normalizedStatus(status?: ModelHealthStatus): ModelHealthStatus {
  return status === 'working' || status === 'failing' ? status : 'unknown';
}

export function modelStatusLabel(status?: ModelHealthStatus, checkedAt?: string, error?: string): string {
  const normalized = normalizedStatus(status);
  if (normalized === 'working') return 'Working';
  if (normalized === 'failing') return 'Failing';
  if (checkedAt || error) return 'Needs review';
  return 'Untested';
}

export function modelStatusTitle({
  checkedAt,
  error,
  latencyMs,
  status,
}: ModelHealthMeterProps): string {
  const label = modelStatusLabel(status, checkedAt, error);
  const checked = checkedAt ? `Checked ${STATUS_DATE_TIME_FORMATTER.format(new Date(checkedAt))}` : 'Not checked yet';
  const latency = latencyMs ? ` in ${latencyMs}ms` : '';
  const detail = error ? `: ${error}` : '';

  return `${label}. ${checked}${latency}${detail}`;
}

export function ModelHealthMeter({
  checkedAt,
  error,
  latencyMs,
  segments = 18,
  status,
}: ModelHealthMeterProps) {
  const normalized = normalizedStatus(status);
  const title = modelStatusTitle({
    checkedAt,
    error,
    latencyMs,
    status: normalized,
  });

  return (
    <span
      aria-label={`Model status: ${title}`}
      className={`model-health-meter ${normalized}`}
      title={title}
    >
      {Array.from({ length: segments }, (_, index) => (
        <span aria-hidden="true" key={index} />
      ))}
    </span>
  );
}
