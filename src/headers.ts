import {flow, pipe, tupled} from 'fp-ts/lib/function.js'
import * as O from 'fp-ts/lib/Option.js'
import * as A from 'fp-ts/lib/Array.js'
import {tuple as tupleEq, contramap as cmapEq} from 'fp-ts/lib/Eq.js'
import {Eq as StringEq} from 'fp-ts/lib/string.js'
import {Headers} from 'node-fetch';

export type Header = [key: string, value: string];

export const from = (xs: Record<string, string>) => new Headers(xs);

export const fromArray = (xs: Header[]) => new Headers(xs);

export const toArray = (h: Headers): Header[] => Array.from(h.entries());

export const Eq = pipe(tupleEq(StringEq, StringEq), A.getEq, cmapEq(toArray));

export const filterWithIndex = (pred: (k: string, v: string) => boolean) => (
  flow(toArray, A.filter(tupled(pred)), fromArray)
);

const byKey = pipe(StringEq, cmapEq(([k]: Header) => k));

export const union = (x: Headers) => flow(toArray, A.union(byKey)(toArray(x)), fromArray);

export const lookup = (k: string) => (headers: Headers) => pipe(headers.get(k), O.fromNullable);

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
