import './styles.css';
import { createElement } from '@asymmetric-effort/specifyjs';
import { createRoot } from '@asymmetric-effort/specifyjs/dom';
import { App } from './App';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(createElement(App, null));
}
