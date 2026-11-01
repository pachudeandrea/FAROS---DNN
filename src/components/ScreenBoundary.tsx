import React from 'react';
import { BrandLogo } from './BrandLogo';
import { hasPendingChanges } from '../hooks/usePendingChanges';
export class ScreenBoundary extends React.Component<React.PropsWithChildren, { failed: boolean; blocked: boolean }> {
  state = { failed: false, blocked: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div role="alert" className="p-5 m-3 rounded-2xl bg-paper border border-ink-200 text-ink-800 space-y-3">
      <BrandLogo size="lg" />
      <p>No pudimos cargar esta pantalla. Tu cuenta y tus datos guardados se conservan.</p>
      {this.state.blocked && <p>Guardá o cancelá los cambios pendientes antes de recargar.</p>}
      <button className="bg-brand-950 text-paper px-4 py-2 rounded-xl" onClick={() => hasPendingChanges() ? this.setState({ blocked: true }) : window.location.reload()}>Volver a cargar FAROS</button>
    </div>;
  }
}
