import {contramap} from 'fp-ts/lib/Eq.js';
import {some, none, Option} from 'fp-ts/lib/Option.js';
import {Eq as StrEq, Show as StrShow} from 'fp-ts/lib/string.js';
import {pipe} from 'fp-ts/lib/function.js';
import {Show as $Show} from 'fp-ts/lib/Show.js';

// Note: As of the time of writing, URLs can only be compared (in Node) after
//       converting them to string. See https://is.gd/78LE3y.
export const Eq = pipe(StrEq, contramap((u: URL) => u.toString()));

export const Show: $Show<URL> = {
  show: u => `new URL(${StrShow.show(u.toString())})`
};

export const params = (params: URLSearchParams) => (url: URL) => {
  const out = new URL(url);
  out.search = params.toString();
  return out;
};

export const param = (key: string, value: string) => (url: URL) => {
  const searchParams = new URLSearchParams(url.searchParams);
  searchParams.set(key, value);
  return pipe(url, params(searchParams));
};

export const unsetParam = (key: string) => (url: URL) => {
  const searchParams = new URLSearchParams(url.searchParams);
  searchParams.delete(key);
  return pipe(url, params(searchParams));
};

export const unsafeParse = (url: string) => new URL(url);

export const parse = (url: string): Option<URL> => (
  URL.canParse(url) ? some(new URL(url)) : none
);

export const navigate = (location: string) => (base: URL): Option<URL> => (
  URL.canParse(location, base.toString()) ? some(new URL(location, base)) : none
);

export const sameSite = (origin: URL) => (dest: URL) => (
  (origin.protocol === dest.protocol || dest.protocol === 'https:') &&
  (origin.host === dest.host || dest.host.endsWith ('.' + origin.host))
);
