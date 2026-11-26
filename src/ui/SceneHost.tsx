import { useEffect, useRef, useState } from 'react';
import { PixiScene } from '../renderer/pixi-scene';
import type { Scene } from '../renderer/scene';

/**
 * Mounts the PixiJS scene imperatively into a div (DR-007): React owns the div, the scene owns
 * the canvas inside it, and React never renders Pixi objects. If WebGL cannot start, the scene
 * stays null, a note says so, and the game plays on in text.
 */
export function SceneHost({ onScene }: { onScene: (scene: Scene | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (element === null) return;
    let cancelled = false;
    let scene: PixiScene | null = null;
    PixiScene.create(element).then(
      (created) => {
        // Under StrictMode the effect runs twice; the first scene is torn down once it exists.
        if (cancelled) {
          created.destroy();
          return;
        }
        scene = created;
        onScene(created);
      },
      (error: unknown) => {
        if (cancelled) return;
        console.warn('The reel scene could not start:', error);
        setFailed(true);
        onScene(null);
      },
    );
    return () => {
      cancelled = true;
      if (scene !== null) {
        onScene(null);
        scene.destroy();
      }
    };
  }, [onScene]);

  return (
    <div className="scene" ref={host}>
      {failed && <p className="scene-note">The reel picture could not start in this browser. The game plays on in text below.</p>}
    </div>
  );
}
