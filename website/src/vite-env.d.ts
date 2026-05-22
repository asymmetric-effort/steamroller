/// <reference types="vite/client" />

// Type declarations for @asymmetric-effort/specifyjs
// The package exports .d.ts files but the package.json exports map
// points to incorrect type paths. These declarations bridge the gap.
declare module '@asymmetric-effort/specifyjs' {
  export const createElement: any;
  export const Fragment: symbol;
  export const Router: any;
  export const Route: any;
  export const Link: any;
  export const useHead: (head: {
    title?: string;
    description?: string;
    keywords?: string;
    author?: string;
    canonical?: string;
    og?: Record<string, string>;
    twitter?: Record<string, string>;
    httpEquiv?: Record<string, string>;
    meta?: Array<{ name?: string; property?: string; content: string }>;
  }) => void;
  export const useState: any;
  export const useEffect: any;
  export const useRef: any;
  export const useMemo: any;
  export const useCallback: any;
  export const useContext: any;
  export const useReducer: any;
  export const useRouter: any;
  export const useParams: any;
  export const useNavigate: any;
  export const h: typeof createElement;
}

declare module '@asymmetric-effort/specifyjs/dom' {
  export function createRoot(container: HTMLElement): {
    render(element: any): void;
    unmount(): void;
  };
  export function render(element: any, container: HTMLElement): void;
}

declare module '@asymmetric-effort/specifyjs/build' {
  import type { Plugin } from 'vite';
  export function specifyJsSeoPlugin(config: {
    siteUrl: string;
    title?: string;
    description?: string;
    routes?: string[];
    docsDir?: string;
    npmPackage?: string;
    author?: string;
    license?: string;
    robotsRules?: string[];
    repository?: string;
    jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  }): Plugin;
  export function specifyJsNoscriptPlugin(config: {
    title?: string;
    description?: string;
    sections: Array<{ id: string; title: string; html: string }>;
    copyright?: string;
    classPrefix?: string;
    maxContentSize?: number;
  }): Plugin;
}
