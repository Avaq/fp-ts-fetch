import {flow, pipe} from 'fp-ts/lib/function.js'
import * as O from 'fp-ts/lib/Option.js'
import * as $E from 'fp-ts/lib/Eq.js'
import {Show as $Show} from 'fp-ts/lib/Show.js';
import {getShow as getArrayShow} from 'fp-ts/lib/ReadonlyArray.js';
import {Show as StrShow} from 'fp-ts/lib/string.js';

export const Eq: $E.Eq<Headers> = {
  equals: (as, bs) => {
    let size = 0;
    for (const [key, value] of as.entries()) {
      if (bs.get(key) !== value) return false;
      size += 1;
    }
    return size === [...bs.keys()].length;
  }
};

const ShowPair: $Show<[key: string, value: string]> = {
  show: ([a, b]) => `[${StrShow.show(a)}, ${StrShow.show(b)}]`
};

const ShowPairs = getArrayShow(ShowPair);

export const Show: $Show<Headers> = {
  show: xs => `new Headers(${ShowPairs.show([...xs.entries()])})`
};

export const set = (name: string, value: string) => (headers: Headers) => {
  const clone = new Headers(headers);
  clone.set(name, value);
  return clone;
};

export const append = (name: string, value: string) => (headers: Headers) => {
  const clone = new Headers(headers);
  clone.append(name, value);
  return clone;
};

export const unset = (name: string) => (headers: Headers) => {
  const clone = new Headers(headers);
  clone.delete(name);
  return clone;
};

export const from = (xs: Record<string, string>) => new Headers(xs);

export const lookup = (name: string) => (headers: Headers) => pipe(
  headers.get(name),
  O.fromNullable
);

// See https://github.com/fluture-js/fluture-node/security/advisories/GHSA-32x6-qvw6-mxj4
export const omitConfidential = flow(
  unset('authorization'),
  unset('cookie')
);

// See https://developer.mozilla.org/docs/Web/HTTP/Headers#Conditionals
export const omitConditional = flow(
  unset('if-match'),
  unset('if-modified-since'),
  unset('if-none-match'),
  unset('if-unmodified-since'),
);
