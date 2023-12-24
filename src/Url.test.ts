import {throws} from 'assert';
import test from 'oletus';
import * as O from 'fp-ts/lib/Option.js';
import {pipe} from 'fp-ts/lib/function.js';
import * as Bool from 'fp-ts/lib/boolean.js';
import * as Url from './Url.js';
import {eqBy, hold} from './utils.test.js';
import * as FC from 'fast-check';

const Url$ = FC.webUrl().map(Url.unsafeParse, String);

hold('Eq Reflexivity', FC.property(Url$, url => (
  Url.Eq.equals(url, url) === true
)));

hold('Eq Symmetry', FC.property(Url$, Url$, (a, b) => (
  Url.Eq.equals(a, b) === Url.Eq.equals(b, a)
)));

hold('Eq Transitivity', FC.property(Url$, Url$, Url$, (a, b, c) => (
  Url.Eq.equals(a, b) && Url.Eq.equals(b, c) ? Url.Eq.equals(a, c) : true
)));

hold('Show produces String', FC.property(Url$, url => (
  typeof Url.Show.show(url) === 'string'
)));

const urlEq = eqBy(Url.Eq, Url.Show);
const optionUrlEq = eqBy(O.getEq(Url.Eq), O.getShow(Url.Show));
const boolEq = eqBy(Bool.Eq, Bool.Show);

test('parse', () => {
  optionUrlEq(Url.parse('not_a_url'), O.none);
  optionUrlEq(pipe(Url.parse('file:///')), O.some(new URL('file:///')));
  optionUrlEq(pipe(Url.parse('http://example.com/')), O.some(new URL('http://example.com/')));
});

test('unsafeParse', () => {
  throws(() => Url.unsafeParse('not_a_url'));
  urlEq(Url.unsafeParse('file:///'), new URL('file:///'));
  urlEq(Url.unsafeParse('http://example.com/'), new URL('http://example.com/'));
});

test('navigate', () => {
  optionUrlEq(
    pipe(Url.unsafeParse('http://example.com/test/'), Url.navigate('//')),
    O.none
  );

  optionUrlEq(
    pipe(Url.unsafeParse('http://example.com/test/'), Url.navigate('../')),
    O.some(new URL('http://example.com/'))
  );

  optionUrlEq(
    pipe(Url.unsafeParse('http://example.com/test/'), Url.navigate('/home')),
    O.some(new URL('http://example.com/home'))
  );

  optionUrlEq(
    pipe(Url.unsafeParse('http://example.com/test/'), Url.navigate('home')),
    O.some(new URL('http://example.com/test/home'))
  );

  optionUrlEq(
    pipe(Url.unsafeParse('http://example.com/test'), Url.navigate('home')),
    O.some(new URL('http://example.com/home'))
  );

  optionUrlEq(
    pipe(Url.unsafeParse('http://example.com/'), Url.navigate('?foo=bar')),
    O.some(new URL('http://example.com/?foo=bar'))
  );
});

test('params', () => {
  const params = new URLSearchParams({foo: 'bar :D'});
  const noParams = new URLSearchParams();

  urlEq(
    pipe(Url.unsafeParse('http://example.com/'), Url.params(params)),
    new URL('http://example.com/?foo=bar+%3AD')
  );

  urlEq(
    pipe(Url.unsafeParse('http://example.com/?baz=qux'), Url.params(params)),
    new URL('http://example.com/?foo=bar+%3AD')
  );

  urlEq(
    pipe(Url.unsafeParse('http://example.com/?baz=qux'), Url.params(noParams)),
    new URL('http://example.com/')
  );
});

test('param', () => {
  urlEq(
    pipe(Url.unsafeParse('http://example.com/'), Url.param('foo', 'bar :D')),
    new URL('http://example.com/?foo=bar+%3AD')
  );

  urlEq(
    pipe(Url.unsafeParse('http://example.com/?baz=qux'), Url.param('foo', 'bar :D')),
    new URL('http://example.com/?baz=qux&foo=bar+%3AD')
  );

  urlEq(
    pipe(Url.unsafeParse('http://example.com/?baz=qux'), Url.param('baz', 'bar')),
    new URL('http://example.com/?baz=bar')
  );
});

test('unsetParam', () => {
  urlEq(
    pipe(Url.unsafeParse('http://example.com/'), Url.unsetParam('foo')),
    new URL('http://example.com/')
  );

  urlEq(
    pipe(Url.unsafeParse('http://example.com/?foo=bar'), Url.unsetParam('foo')),
    new URL('http://example.com/')
  );

  urlEq(
    pipe(Url.unsafeParse('http://example.com/?baz=qux&foo=bar'), Url.unsetParam('foo')),
    new URL('http://example.com/?baz=qux')
  );
});

test('sameSite', () => {
  const check = (a: string, b: string) => pipe(
    Url.unsafeParse(a),
    Url.sameSite(Url.unsafeParse(b))
  );

  boolEq(check('http://example.com', 'http://example.com'), true);
  boolEq(check('http://foo.example.com', 'http://example.com'), true);
  boolEq(check('http://example.com', 'http://foo.example.com'), false);

  boolEq(check('http://example.com', 'https://example.com'), false);
  boolEq(check('https://example.com', 'http://example.com'), true);
});
