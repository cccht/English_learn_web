import { memo } from 'react';
import catalog from '../shared/illustrations.json';

export type IllustrationKind = keyof typeof catalog.items;
type Size = 'brand' | 'heading' | 'empty' | 'rail' | 'dialog' | 'report';

export const Illustration = memo(function Illustration({
  kind,
  size = 'heading',
  priority = false,
}: {
  kind: IllustrationKind;
  size?: Size;
  priority?: boolean;
}) {
  const asset = catalog.items[kind];
  return (
    <img
      src={asset.src}
      alt=""
      aria-hidden="true"
      width={asset.width}
      height={asset.height}
      className={`buddy-illustration buddy-size-${size}`}
      data-illustration={kind}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onError={(event) => {
        event.currentTarget.style.visibility = 'hidden';
      }}
    />
  );
});
