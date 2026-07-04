'use client';

import { providerIconUrl, providerName } from '@/lib/provider-meta';

export function ProviderMark({ provider }: { provider: string }) {
  const iconUrl = providerIconUrl(provider);
  const label = providerName(provider);

  return (
    <span className="provider-mark" title={label}>
      <span>{label.slice(0, 1)}</span>
      {iconUrl && (
        <img
          alt=""
          onError={event => {
            event.currentTarget.hidden = true;
          }}
          src={iconUrl}
        />
      )}
    </span>
  );
}
