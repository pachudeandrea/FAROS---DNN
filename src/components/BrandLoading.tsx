import React from 'react';
import { BrandLogo } from './BrandLogo';
export function BrandLoading({ children }: React.PropsWithChildren) {
  return <div role="status" className="p-6 flex items-center gap-3 text-muted"><BrandLogo size="md" /><span>{children}</span></div>;
}
