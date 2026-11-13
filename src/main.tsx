import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { getState } from './store';
import { computeGeometry } from './model/geometry';
import { initPwa } from './pwa';

function currentGeometry() {
  const { model, diagramId } = getState();
  return computeGeometry(model, model.diagrams[diagramId]);
}

Object.assign(window, { __idefka: { getState, geometry: currentGeometry } });

initPwa();
createRoot(document.getElementById('root')!).render(<App />);

if (process.env.NODE_ENV !== 'production') {
  new EventSource('/esbuild').addEventListener('change', () => location.reload());
}
