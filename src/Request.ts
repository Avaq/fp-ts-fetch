import {Json} from 'fp-ts/lib/Json.js';
import {flow, pipe} from 'fp-ts/lib/function.js';
import * as H from './Headers.js';
import * as U from './Url.js';
import {Eq as $Eq} from 'fp-ts/lib/Eq.js';
import {Show as $Show, struct as showStruct} from 'fp-ts/lib/Show.js';
import {Show as StrShow} from 'fp-ts/lib/string.js';
import {Show as BoolShow} from 'fp-ts/lib/boolean.js';

export const Eq: $Eq<Request> = {
  equals: (a, b) => (
    a.bodyUsed === b.bodyUsed &&
    a.cache === b.cache &&
    a.credentials === b.credentials &&
    a.destination === b.destination &&
    H.Eq.equals(a.headers, b.headers) &&
    a.integrity === b.integrity &&
    a.keepalive === b.keepalive &&
    a.method === b.method &&
    a.mode === b.mode &&
    a.referrer === b.referrer &&
    a.referrerPolicy === b.referrerPolicy &&
    a.url === b.url &&
    a.redirect === b.redirect
  )
};

const OptionsShow = showStruct({
  cache: StrShow,
  credentials: StrShow,
  headers: H.Show,
  integrity: StrShow,
  keepalive: BoolShow,
  method: StrShow,
  mode: StrShow,
  redirect: StrShow,
  referrerPolicy: StrShow,
});

export const Show: $Show<Request> = {
  show: req => `new Request(${StrShow.show(req.url)}, ${OptionsShow.show(req)})`
};

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
