import {pipe, constant, identity} from 'fp-ts/lib/function.js'
import * as TE from 'fp-ts/lib/TaskEither.js';
import * as E from 'fp-ts/lib/Either.js';
import * as R from 'fp-ts/lib/Record.js';
import * as O from 'fp-ts/lib/Option.js';
import * as T from 'fp-ts/lib/ReadonlyTuple.js';

import * as H from './Headers.js';
import * as U from './Url.js';
import * as Req from './Request.js';
import * as Res from './Response.js';

export type Result = readonly [Response, Request];

export const transfer = (request: Request): TE.TaskEither<Error, Result> => pipe(
  TE.fromIO<Request, Error>(() => request.clone()),
  TE.chain(TE.tryCatchK(fetch, E.toError)),
  TE.map(response => [response, request] as const),
);

type Transform<A> = (result: Result) => A;
type Pattern<T> = Record<number, Transform<T>>;

export const matchStatusW = <A, B>(onMismatch: Transform<A>, pattern: Pattern<B>) => (
  (result: Result) => pipe(
    result[0].status.toString(),
    k => pipe(pattern, R.lookup(k)),
    O.foldW(() => onMismatch(result), transform => transform(result)),
  )
);

export const matchStatus = <T>(onMismatch: Transform<T>, pattern: Pattern<T>) => (
  matchStatusW(onMismatch, pattern)
);

export const acceptStatus = (code: number) => matchStatus<E.Either<Result, Result>>(
  E.left,
  {[code]: E.right}
);

export type RedirectionStrategy = Transform<Request>;

export const redirectAnyRequest: RedirectionStrategy = ([response, request]) => pipe(
  response.headers,
  H.lookup('location'),
  O.bindTo('location'),
  O.apS('origin', U.parse(request.url)),
  O.bind('dest', ({origin, location}) => pipe(origin, U.navigate(location))),
  O.fold(constant(request), ({origin, dest}) => pipe(
    request,
    Req.url(dest),
    pipe(dest, U.sameOrigin(origin)) ? identity : Req.headers(
      H.omitConfidential(request.headers)
    )
  )),
);

export const redirectIfGetMethod: RedirectionStrategy = result => (
  result[1].method === 'GET' ? redirectAnyRequest(result) : result[1]
);

export const redirectUsingGetMethod: RedirectionStrategy = ([response, request]) => (
  redirectAnyRequest([response, pipe(request, Req.method('GET'))])
);

export const retryWithoutCondition: RedirectionStrategy = ([, request]) => (
  request.method !== 'GET'
    ? request
    : pipe(request, Req.headers(H.omitConditional(request.headers)))
);

export const defaultRedirectionStrategy: RedirectionStrategy = matchStatus(T.snd, {
  301: redirectIfGetMethod,
  302: redirectIfGetMethod,
  303: redirectUsingGetMethod,
  305: redirectAnyRequest,
  307: redirectIfGetMethod,
});

export const aggressiveRedirectionStrategy: RedirectionStrategy = matchStatus(T.snd, {
  301: redirectAnyRequest,
  302: redirectAnyRequest,
  303: redirectUsingGetMethod,
  304: retryWithoutCondition,
  305: redirectAnyRequest,
  307: redirectAnyRequest,
});

export const followRedirectsWith = (strategy: RedirectionStrategy) => (max: number) => (
  (result: Result) => {
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
        transfer(nextRequest),
        TE.mapLeft (e => new Error ('After redirect: ' + e.message)),
        TE.chain (followUp (max - 1)),
      );
    };
    return followUp (max) (result);
  }
);

export const followRedirects = followRedirectsWith(defaultRedirectionStrategy);

export const blob = (result: Result) => pipe(result, T.fst, Res.blob);

export const text = (result: Result) => pipe(result, T.fst, Res.text);

export const json = (result: Result) => pipe(result, T.fst, Res.json);

export const buffer = (result: Result) => pipe(result, T.fst, Res.buffer);

export const error = (result: Result) => pipe(result, T.fst, Res.error);
