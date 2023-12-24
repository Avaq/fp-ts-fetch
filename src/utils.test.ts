import {AssertionError} from 'node:assert';
import {inspect} from 'node:util';
import * as $S from 'fp-ts/lib/Show.js';
import * as $E from 'fp-ts/lib/Eq.js';
import * as FC from 'fast-check';
import test from 'oletus';

export const ShowUnknown: $S.Show<unknown> = {
  show: (x: unknown) => inspect(x, {depth: Infinity, customInspect: true}),
};

export const assertionError = <T, A extends T, B extends T>(
  message: string,
  expected: A,
  actual: B,
  S: $S.Show<T> = ShowUnknown
) => new AssertionError({
  expected: expected,
  actual: actual,
  message: `${message}\nExpected: ${S.show(expected)}\nActual:   ${S.show(actual)}`,
});

export const eq = <T, A extends T, B extends T>(
  expected: A,
  actual: B,
  E: $E.Eq<T>,
  S: $S.Show<T> = ShowUnknown
) => {
  if (E.equals(expected, actual)) { return; }
  throw assertionError('Inputs not equal', expected, actual, S);
};

export const eqBy = <T>(E: $E.Eq<T>, S: $S.Show<T> = ShowUnknown) => (
  <A extends T, B extends T>(expected: A, actual: B) => eq(expected, actual, E, S)
);

export const hold = <T>(name: string, prop: FC.IRawProperty<T>, opts?: FC.Parameters<T>) => (
  test(`'${name}' holds`, () => FC.assert(prop, opts))
);
