import {pipe} from 'fp-ts/function';
import * as O from 'fp-ts/Option';
import {getEq} from 'fp-ts/Array';
import {Eq} from 'fp-ts/Eq';

const stringEntryEq: Eq<[string, string]> = {
  equals: ([la, lb], [ra, rb]) => la === ra && lb === rb
};

const stringEntriesEq = getEq(stringEntryEq);

export const eq: Eq<Headers> = {
  equals: (a, b) => stringEntriesEq.equals(Array.from(a.entries()), Array.from(b.entries()))
};

export const filterWithIndex = (pred: (k: string, v: string) => boolean) => (input: Headers) => {
  const output = new Headers;
  input.forEach((v, k) => {
    if (pred(k, v)) {
      output.set(k, v);
    }
  });
  return output;
};

export const union = (x: Headers) => (y: Headers) => {
  const z = new Headers;
  y.forEach((v, k) => z.set(k, v));
  x.forEach((v, k) => z.set(k, v));
  return z;
};

export const lookup = (k: string) => (headers: Headers) => pipe(
  headers.get(k),
  O.fromNullable,
);

export const omit = (ks: string[]) => filterWithIndex(k => !ks.includes(k));

// See https://github.com/fluture-js/fluture-node/security/advisories/GHSA-32x6-qvw6-mxj4
export const omitConfidential = omit([
  'authorization',
  'cookie'
]);

// See https://developer.mozilla.org/docs/Web/HTTP/Headers#Conditionals
export const omitConditional = omit([
  'if-match',
  'if-modified-since',
  'if-none-match',
  'if-unmodified-since',
]);
