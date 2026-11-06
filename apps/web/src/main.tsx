import React from 'react';
import ReactDOM from 'react-dom/client';
import { UiApp } from './ui/UiApp';
import './ui/pixel.css';
import App from './App';
import './index.css';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('App Crash:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '24px', background: '#020617', color: '#f8fafc', minHeight: '100vh', fontFamily: 'sans-serif' }}>
          <h1 style={{ color: '#ef4444', fontSize: '20px', fontWeight: 'bold' }}>Application Render Error</h1>
          <p style={{ marginTop: '12px', fontSize: '14px', color: '#94a3b8' }}>
            {this.state.error?.message || 'Unknown render error occurred.'}
          </p>
          <pre style={{ marginTop: '16px', padding: '12px', background: '#0f172a', borderRadius: '8px', fontSize: '11px', overflowX: 'auto', color: '#cbd5e1' }}>
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: '16px', padding: '10px 18px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const isLegacy = typeof window !== 'undefined' && window.location.search.includes('legacy=1');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isLegacy ? <App /> : <UiApp />}
    </ErrorBoundary>
  </React.StrictMode>
);
