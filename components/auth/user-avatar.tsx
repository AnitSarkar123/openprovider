'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { UserRound } from 'lucide-react';

type UserAvatarProps = {
  className?: string;
  email?: string | null;
  iconSize?: number;
  image?: string | null;
  imageClassName?: string;
  name?: string | null;
};

function firstInitial(name?: string | null, email?: string | null): string {
  const label = (name || email || '').trim();
  if (!label) return '';

  return label.slice(0, 1).toUpperCase();
}

export function UserAvatar({
  className,
  email,
  iconSize = 16,
  image,
  imageClassName,
  name,
}: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = image?.trim() ?? '';
  const initial = useMemo(() => firstInitial(name, email), [email, name]);
  const showImage = Boolean(imageUrl) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <span
      aria-hidden="true"
      className={clsx(className, showImage && imageClassName)}
      title={name || email || 'Account'}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={imageUrl} onError={() => setImageFailed(true)} />
      ) : initial ? (
        <span className="avatar-initial">{initial}</span>
      ) : (
        <UserRound size={iconSize} />
      )}
    </span>
  );
}
