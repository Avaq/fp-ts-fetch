import {pipe, flow, identity, constant} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import * as R from 'fp-ts/Record';
import * as O from 'fp-ts/Option';
import * as T from 'fp-ts/ReadonlyTuple';
import {Json} from 'fp-ts/Json';

import * as H from './headers';
import * as U from './url';
import * as Req from './request';
import * as Res from './response';

const fetch_ = (options: RequestInit) => (request: Request) => fetch(request, options);

export type Result = readonly [Response, Request];

export const request = (request: Request): TE.TaskEither<Error, Result> => pipe(
  TE.fromIO<Request, Error>(() => request.clone()),
  TE.chain(TE.tryCatchK(fetch_({redirect: 'manual'}), E.toError)),
  TE.map(response => [response, request] as const),
);

export const retrieve = (url: string) => (headers: Headers) => (
  new Request(url, {headers})
);

export const send = (method: string) => (url: string) => (headers: Headers) => (body: BodyInit) => (
  new Request(url, {headers, method, body})
);

export const sendJson = (method: string) => (url: string) => (headers: Headers) => (body: Json) => (
  new Request(url, {
    method: method,
    headers: pipe(new Headers({'content-type': 'application/json'}), H.union(headers)),
    body: JSON.stringify(body),
  })
);

type Transform<A> = (result: Result) => A;
type Pattern<T> = Record<number, Transform<T>>;

export const matchStatus = <T>(onMismatch: Transform<T>, pattern: Pattern<T>) => (
  (result: Result): T => pipe(
    result[0].status.toString(),
    k => pipe(pattern, R.lookup(k)),
    O.fold(() => onMismatch(result), transform => transform(result)),
  )
);

export const acceptStatus = (code: number) => matchStatus<E.Either<Result, Result>>(
  E.left,
  {[code]: E.right}
);

export type RedirectionStrategy = (result: Result) => Request;

export const redirectAnyRequest: RedirectionStrategy = ([response, request]) => pipe(
  response.headers,
  H.lookup('location'),
  O.map(U.merge(request.url)),
  O.fold(constant(request), flow(
    E.fromPredicate(U.sameOrigin(request.url), identity),
    E.fold(
      url => new Request(url, request),
      url => new Request(url, {...request, headers: H.omitConfidential(request.headers)})
    )
  )),
);

export const redirectIfGetMethod: RedirectionStrategy = result => (
  result[1].method === 'GET' ? redirectAnyRequest(result) : result[1]
);

export const redirectUsingGetMethod: RedirectionStrategy = ([response, request]) => (
  redirectAnyRequest([response, new Request(request.url, {...request, method: 'GET'})])
);

export const retryWithoutCondition: RedirectionStrategy = ([, request]) => (
  request.method !== 'GET' ? request : new Request(
    request.url,
    {...request, headers: H.omitConditional(request.headers)}
  )
);

export const defaultRedirectionStrategy: RedirectionStrategy = matchStatus(T.snd, {
  301: redirectIfGetMethod,
  302: redirectIfGetMethod,
  303: redirectUsingGetMethod,
  305: redirectAnyRequest,
  307: redirectIfGetMethod,
});

export const aggressiveRedirectionPolicy: RedirectionStrategy = matchStatus(T.snd, {
  301: redirectAnyRequest,
  302: redirectAnyRequest,
  303: redirectUsingGetMethod,
  304: retryWithoutCondition,
  305: redirectAnyRequest,
  307: redirectAnyRequest,
});

export const followRedirectsWith = (strategy: RedirectionStrategy) => (_max: number) => (
  (_result: Result) => {
    const seen: Request[] = [];
    const followUp = (max: number) => (result: Result): TE.TaskEither<Error, Result> => {
      if (max < 1) {
        return TE.right(result);
      }
      seen.push(result[1]);
      const nextRequest = strategy(result);
      for (let i = seen.length - 1; i >= 0; i -= 1) {
        if (pipe(nextRequest, Req.equivalent(seen[i]))) {
          return TE.right(result);
        }
      }
      return pipe(
        request(nextRequest),
        TE.mapLeft (e => new Error ('After redirect: ' + e.message)),
        TE.chain (followUp (max - 1)),
      );
    };
    return followUp (_max) (_result);
  }
);

export const followRedirects = followRedirectsWith(defaultRedirectionStrategy);

export const blob = (result: Result) => pipe(result, T.fst, Res.blob);

export const json = (result: Result) => pipe(result, T.fst, Res.json);

export const buffer = (result: Result) => pipe(result, T.fst, Res.buffer);
