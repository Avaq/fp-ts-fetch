import {Json} from 'fp-ts/Json';
import {flow, pipe} from 'fp-ts/function';
import * as H from './Headers';
import * as U from './Url';

export const method = (method: string) => (request: Request) => (
  new Request(request, {method})
);

export const url = (url: URL | string) => (request: Request) => (
  new Request(url, request)
);

export const params = (params: URLSearchParams) => (request: Request) => pipe(
  request,
  url(pipe(U.unsafeParse(request.url), U.params(params)))
);

export const param = (key: string, value: string) => (request: Request) => pipe(
  request,
  url(pipe(U.unsafeParse(request.url), U.param(key, value)))
);

export const unsetParam = (key: string) => (request: Request) => pipe(
  request,
  url(pipe(U.unsafeParse(request.url), U.unsetParam(key)))
);

export const headers = (headers: Headers) => (request: Request) => (
  new Request(request, {headers})
);

export const header = (name: string, value: string) => (request: Request) => (
  new Request(request, {headers: pipe(request.headers, H.set(name, value))})
);

export const append = (name: string, value: string) => (request: Request) => (
  new Request(request, {headers: pipe(request.headers, H.append(name, value))})
);

export const unset = (name: string) => (request: Request) => (
  new Request(request, {headers: pipe(request.headers, H.unset(name))})
);

export const body = (body: BodyInit) => (request: Request) => (
  new Request(request, {body})
);

export const json = (json: Json) => flow(
  body(JSON.stringify(json)),
  header('Content-Type', 'application/json')
);

export const to = (url: string | URL) => new Request(url, {redirect: 'manual'});

export const get = flow(to, method('GET'));

export const put = flow(to, method('PUT'));

export const post = flow(to, method('POST'));

// Ignores redirect mode and cancellation signal
export const equivalent = (left: Request) => (right: Request) => (
  left.cache === right.cache &&
  left.credentials === right.credentials &&
  left.destination === right.destination &&
  H.Eq.equals(left.headers, right.headers) &&
  left.integrity === right.integrity &&
  left.keepalive === right.keepalive &&
  left.method === right.method &&
  left.mode === right.mode &&
  left.referrer === right.referrer &&
  left.referrerPolicy === right.referrerPolicy &&
  left.url === right.url
);
