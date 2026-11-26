import type { Rng, SpinStreams } from '../../src/engine';
import { ONE, mul, rat, type Rational } from '../../src/engine/rational';

/**
 * Walks every possible sequence of draws a function makes from an outcome stream, with the
 * exact probability of each: a depth-first search that replays the function with a script
 * of choices and branches at the first draw past the script. `nextInt(n)` branches n ways
 * with 1/n each; `pickWeighted(w)` branches over the non-zero weights with wᵢ/Σw each. The
 * cosmetic stream always answers 0, which changes no outcome. For exact toy tests only: the
 * tree grows with every draw, so the configuration must be tiny.
 */

class NeedChoice {
  constructor(readonly options: readonly { readonly value: number; readonly p: Rational }[]) {}
}

class ScriptedRng implements Rng {
  private pos = 0;
  constructor(private readonly script: readonly number[]) {}

  private next(options: () => { value: number; p: Rational }[]): number {
    const i = this.pos++;
    if (i < this.script.length) return this.script[i] as number;
    throw new NeedChoice(options());
  }

  nextUint32(): number {
    throw new Error('The draw tree does not branch on raw 32-bit draws.');
  }

  nextInt(n: number): number {
    return this.next(() => Array.from({ length: n }, (_, value) => ({ value, p: rat(1, n) })));
  }

  pickWeighted(weights: readonly number[]): number {
    const total = weights.reduce((a, w) => a + w, 0);
    return this.next(() =>
      weights.flatMap((w, value) => (w > 0 ? [{ value, p: rat(w, total) }] : [])),
    );
  }
}

/** A cosmetic stream that always picks the first option. */
const ZERO_RNG: Rng = {
  nextUint32: () => 0,
  nextInt: () => 0,
  pickWeighted: (weights) => weights.findIndex((w) => w > 0),
};

/** Every leaf of `run`'s draw tree: its result and exact probability. */
export function drawTree<T>(run: (streams: SpinStreams) => T): { readonly result: T; readonly p: Rational }[] {
  const leaves: { result: T; p: Rational }[] = [];
  const visit = (script: number[], p: Rational): void => {
    try {
      const result = run({ outcome: new ScriptedRng(script), cosmetic: ZERO_RNG } as SpinStreams);
      leaves.push({ result, p });
    } catch (e) {
      if (!(e instanceof NeedChoice)) throw e;
      for (const o of e.options) visit([...script, o.value], mul(p, o.p));
    }
  };
  visit([], ONE);
  return leaves;
}
