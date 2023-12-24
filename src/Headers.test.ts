import test from 'oletus';
import * as H from './Headers.js';
import {pipe} from 'fp-ts/lib/function.js';
import * as Str from 'fp-ts/lib/string.js';
import * as O from 'fp-ts/lib/Option.js';
import {eqBy, hold} from './utils.test.js';
import * as FC from 'fast-check';

const Headers$ = FC.array(FC.tuple(FC.stringMatching(/^\S+$/), FC.string())).map(
  tuples => new Headers(tuples),
  headers => headers instanceof Headers ? [...headers.entries()] : []
);

hold('Eq Reflexivity', FC.property(Headers$, headers => (
  H.Eq.equals(headers, headers) === true
)));

hold('Eq Symmetry', FC.property(Headers$, Headers$, (a, b) => (
  H.Eq.equals(a, b) === H.Eq.equals(b, a)
)));

hold('Eq Transitivity', FC.property(Headers$, Headers$, Headers$, (a, b, c) => (
  H.Eq.equals(a, b) && H.Eq.equals(b, c) ? H.Eq.equals(a, c) : true
)));

hold('Show produces String', FC.property(Headers$, headers => (
  typeof H.Show.show(headers) === 'string'
)));

const headersEq = eqBy(H.Eq, H.Show);
const optionStrEq = eqBy(O.getEq(Str.Eq), O.getShow(Str.Show));

test('from', () => {
  headersEq(H.from({}), new Headers());
  headersEq(H.from({foo: 'bar', baz: 'qux'}), new Headers([['foo', 'bar'], ['baz', 'qux']]));
});

test('lookup', () => {
  optionStrEq(pipe(H.from({}), H.lookup('foo')), O.none);
  optionStrEq(pipe(H.from({foo: 'bar'}), H.lookup('foo')), O.some('bar'));
  optionStrEq(pipe(H.from({Foo: 'bar'}), H.lookup('foo')), O.some('bar'));
  optionStrEq(pipe(H.from({foo: 'bar'}), H.lookup('Foo')), O.some('bar'));
});

test('set', () => {
  headersEq(pipe(H.from({}), H.set('foo', 'bar')), new Headers([['foo', 'bar']]));
  headersEq(pipe(H.from({foo: 'baz'}), H.set('foo', 'bar')), new Headers([['foo', 'bar']]));
  headersEq(pipe(H.from({baz: 'qux'}), H.set('foo', 'bar')), new Headers([['foo', 'bar'], ['baz', 'qux']]));
});

test('append', () => {
  headersEq(pipe(H.from({}), H.append('foo', 'bar')), new Headers([['foo', 'bar']]));
  headersEq(pipe(H.from({foo: 'baz'}), H.append('foo', 'bar')), new Headers([['foo', 'baz, bar']]));
  headersEq(pipe(H.from({baz: 'qux'}), H.append('foo', 'bar')), new Headers([['foo', 'bar'], ['baz', 'qux']]));
});

test('unset', () => {
  headersEq(pipe(H.from({}), H.unset('foo')), new Headers());
  headersEq(pipe(H.from({foo: 'baz'}), H.unset('foo')), new Headers());
  headersEq(pipe(H.from({baz: 'qux'}), H.unset('foo')), new Headers([['baz', 'qux']]));
});

test('omitConfidential', () => {
  headersEq(pipe(H.from({}), H.omitConfidential), new Headers());
  headersEq(pipe(H.from({foo: 'bar'}), H.omitConfidential), new Headers([['foo', 'bar']]));
  headersEq(pipe(H.from({authorization: 'bar'}), H.omitConfidential), new Headers());
  headersEq(pipe(H.from({cookie: 'bar'}), H.omitConfidential), new Headers());
});

test('omitConditional', () => {
  headersEq(pipe(H.from({}), H.omitConditional), new Headers());
  headersEq(pipe(H.from({foo: 'bar'}), H.omitConditional), new Headers([['foo', 'bar']]));
  headersEq(pipe(H.from({'if-match': 'bar'}), H.omitConditional), new Headers());
  headersEq(pipe(H.from({'if-modified-since': 'bar'}), H.omitConditional), new Headers());
  headersEq(pipe(H.from({'if-none-match': 'bar'}), H.omitConditional), new Headers());
  headersEq(pipe(H.from({'if-unmodified-since': 'bar'}), H.omitConditional), new Headers());
});
