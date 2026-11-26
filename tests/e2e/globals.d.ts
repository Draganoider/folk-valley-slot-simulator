import type { SceneSnapshot } from '../../src/renderer/scene';

// The read-only hook App.tsx puts on the page, typed for page.evaluate.
declare global {
  interface Window {
    __fv?: { readonly scene: () => SceneSnapshot };
  }
}
