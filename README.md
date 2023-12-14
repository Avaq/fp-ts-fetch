# FP-TS Fetch

Fetch wrapper for fp-ts users, inspired by
[fluture-node](https://github.com/fluture-js/fluture-node/#http).

## Design Philosophy

Because this library offers *yet another* HTTP client, you must be wondering
what sets it aside from the others.

- **Composition before configuration**: Most HTTP clients offer an interface
  like `request({...tons_of_options})`. Content negotation, response body
  decoding, redirection following, error retries, etc. are all often configured
  via this one complicated structure of interacting options. *FP-TS Fetch*
  leverages function composition to give you as much control over HTTP requests
  and responses as possible, while still keeping boilerplate relatively low.
  Furthermore, features such as retrying or JSON decoding that are better
  handled by specialized libraries such as [retry-ts][] or [io-ts][] incorporate
  seamlessly into the composition approach, and allow the footprint of
  this library to remain small.
- **Simplicity before ease of use**: Many HTTP clients attempt to make
  interaction with HTTP servers easier by making assumptions about how these
  servers will likely act, and making decisions for you. A typical example would
  be that Axios rejects the returned Promise when the server issues certain
  status codes. *FP-TS Fetch* makes no assumptions about the HTTP server you are
  interacting with. This means developers need to handle everything explicitly,
  but the library is a lot more predictable in return, and better suited to deal
  with HTTP servers that do things differently from the norm.
- **Native types before custom types**: As much as possible, this library tries
  to leverage JavaScript's built-in types and avoid inventing anything that
  already exists. This means that the library is easy to mix with vanilla code
  or other libraries that leverage these same types.

## Usage

### Simple Example

The following example sends a GET request for `example.com` and prints the
response text to the console. If a network error occurs, its message is printed
to the console instead.

```ts
import * as Fetch from 'fp-ts-fetch';
import {identity, pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';

const task = pipe(
  Fetch.retrieve('https://example.com')(new Headers),
  Fetch.transfer,
  TE.chain(Fetch.text),
  TE.match(e => e.message, identity)
);

task().then(console.log);

```

### Extended Example

The following snippet shows a very extended example of using the library
together with other libraries in the fp-ts ecosystem. It uses the Node
FileSystem to get the README contents, and the GitHub API to render them.
It features:

- Following redirects in a customized way using
  [`followRedirectsWith`](#followredirectswith).
- Parsing and decoding returned JSON using [io-ts][].
- Request retrying using [retry-ts][].
- Special handling of the 401 response code using [`matchStatus`](#matchstatus).

```ts
import * as Fetch from 'fp-ts-fetch';
import * as Headers from 'fp-ts-fetch/headers';
import * as FS from 'node:fs/promises';
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import * as t from 'io-ts';
import * as Retry from 'retry-ts';
import * as RetryTask from 'retry-ts/Task';
import * as Console from 'fp-ts/Console'
import * as O from 'fp-ts/Option'
import * as PR from 'io-ts/PathReporter';
import {pipe, identity, flow, constVoid} from 'fp-ts/function';

// Don't forget to put your own API token here:
const myGitHubToken = '<YOUR_TOKEN>';

// Fetch.send is curried, so we can create our own functions that correspond to
// specific request methods, and easily include non-standard methods.
const post = Fetch.send('POST');

// Supply URL and Headers, leaving only the request body to be provided.
const markdownReq = post('https://api.github.com/markdown/raw')(Headers.from({
  'Accept': 'application/vnd.github+json',
  'Authorization': `Bearer ${myGitHubToken}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'text/plain',
}));

// Specify the shape of an error returned from the GitHub API.
const GitHubError = t.type({
  message: t.string,
  documentation_url: t.string,
}, 'GitHubError');

// Any error response can be handled by parsing JSON and then decoding
// with the GitHubError codec. We also specify what happens if the error
// couldn't be decoded.
const handleGitHubErrorResponse = flow(
  Fetch.json,
  TE.map(GitHubError.decode),
  TE.chainEitherK(E.mapLeft(e => new Error(
    `Unexpected GitHub Error format: ${PR.failure(e).join("; ")}`
  )))
);

// Define a retry policy to use.
const retryPolicy = Retry.capDelay(2000, Retry.Monoid.concat(
  Retry.exponentialBackoff(200),
  Retry.limitRetries(5)
));

// Define an approach to logging request retries.
const logRetry = (status: Retry.RetryStatus) => pipe(
  status.previousDelay,
  O.map((delay) => `Retrying in ${delay} milliseconds...`),
  O.fold(() => constVoid, Console.log),
  TE.rightIO
);

const task = pipe(
  // Get the README.md contents
  TE.tryCatch(() => FS.readFile('./README.md'), E.toError),

  // Create a Request
  TE.map(markdownReq),

  // Transfer the request
  TE.chain(Fetch.transfer),

  // Enable following redirects with a custom strategy
  TE.chain(Fetch.followRedirectsWith(Fetch.aggressiveRedirectionStrategy)(20)),

  // Handle 200 responses as text, 401 with special handling, and everything
  // else as an error
  TE.chain(Fetch.matchStatus(Fetch.error, {
    200: Fetch.text,
    401: flow(handleGitHubErrorResponse, TE.chain(e => TE.left(new Error(
      `Unauthorized: ${e.message} - See ${e.documentation_url}; ` +
      'Maybe you forgot to replace the contents of myGitHubToken in the code?'
    ))))
  })),

  // In case errors happened, retry the whole thing
  task => RetryTask.retrying(
    retryPolicy,
    flow(logRetry, TE.apSecond(task)),
    E.isLeft
  ),

  // Fold into a String for logging
  TE.match(e => `<h1>Something went wrong</h1>\n<p>${e.message}</p>`, identity)
);

// Run the task 🚀
task().then(console.log);
```

## API

### `Result`

```ts
declare type Result = readonly [Response, Request];
```

The Result type is the type that the library is built around. It's simply a
[Tuple][] containing a [Response][] and the (typically) associated [Request][].

Having these paired allows for things like retries and following redirects.

You'll typically want to `Tuple.mapFst` over it to get at the Response.

### `request`

```ts
declare const request = (request: Request) => TaskEither<Error, Result>
```

Given a [Request][], returns a [TaskEither][] which makes an HTTP request and
resolves with the [Result](#result). The TaskEither only rejects if a network
error was encountered, and always resolves if an HTTP response was
successfully obtained.

> [!NOTE]
>
> See the [simple usage example](#simple-example) for usage.

### `retrieve`

```ts
declare const retrieve = (url: string) => (headers: Headers) => Request
```

Constructs a GET [Request][] for a given URL with the given [Headers][].
Automatically sets the `redirect` option to `manual` for
[`followRedirects`](#followredirects).

> [!NOTE]
>
> See the [simple usage example](#simple-example) for usage.

### `send`

```ts
declare const send = (method: string) => (url: string) => (
  (headers: Headers) => (body: BodyInit) => Request
)
```

Constructs a [Request][] using the given [request method][], for a given URL,
with the given [Headers][], and a given [request body][]. Automatically sets
the `redirect` option to `manual` for [`followRedirects`](#followredirects).

> [!NOTE]
>
> See the [extended usage example](#extended-example) for usage.

### `sendJson`

```ts
declare const const sendJson = (method: string) => (url: string) => (
  (headers: Headers) => (body: Json) => Request
)
```

The same as [send](#send), but specifically for [Json][] bodies. The resulting
Request automatically includes a `Content-Type` header with `application/json`,
and the body is automatically stringified with `JSON.stringify`. Automatically
sets the `redirect` option to `manual` for
[`followRedirects`](#followredirects).

### `matchStatus`

```ts
declare type Transform<A> = (result: Result) => A

declare type Pattern<T> = Record<number, Transform<T>>

declare const matchStatus = (
  <T>(onMismatch: Transform<T>, pattern: Pattern<T>) => (result: Result) => T
)
```

Case-analysis of a [Result](#result) using the [Response][]'s status code as
the differentiator. This makes it easy to handle different response status codes
in different ways.

The first argument is used to transform any results that didn't match the given
pattern. The [`error`](#error) function is provided as a convenient value to
use here for catching unexpected cases.

> [!NOTE]
>
> See the [extended usage example](#extended-example) for usage.

### `matchStatusW`

```ts
declare type Transform<A> = (result: Result) => A

declare type Pattern<T> = Record<number, Transform<T>>

declare const matchStatus = (
  <A, B>(onMismatch: Transform<A>, pattern: Pattern<B>) => (
    (result: Result) => A | B
  )
)
```

A type-widening version of [`matchStatus`](#matchstatus).

### `acceptStatus`

```ts
declare const acceptStatus = (code: number) => (result: Result) => (
  Either<Result, Result>
)
```

Tags a [Result](#result) by its [Response][]'s status code. Enables easy
code branching based on the status code of a response.

The example below extends the [simple usage example](#simple-example) so that
non-200 responses are no longer handled the same way as 200 responses.

```ts
import * as Fetch from 'fp-ts-fetch';
import {identity, pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';

const task = pipe(
  Fetch.retrieve('https://example.com')(new Headers),
  Fetch.transfer,
  TE.map(Fetch.acceptStatus(200)),
  TE.chainEitherK(E.mapLeft(([res]) => (
    new Error(`Unexpected ${res.status} response`)
  ))),
  TE.chain(Fetch.text),
  TE.match(e => e.message, identity)
);

task().then(console.log);
```

### `followRedirects`

```ts
declare const followRedirects: (max: number) => (result: Result) => (
  TaskEither<Error, Result>
)
```

A default way to follow redirects up to a given number of redirections. Uses
the [default redirection strategy](#defaultredirectionstrategy). See
[`followRedirectsWith`](#followredirectswith) for more information.

The example below extends the [simple usage example](#simple-example) so that
redirects are automatically followed, up to a maximum of 20 redirections.

```ts
import * as Fetch from 'fp-ts-fetch';
import {identity, pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';

const task = pipe(
  Fetch.retrieve('https://example.com')(new Headers),
  Fetch.transfer,
  TE.chain(Fetch.followRedirects(20)),
  TE.chain(Fetch.text),
  TE.match(e => e.message, identity)
);

task().then(console.log);
```

### `RedirectionStrategy`

```ts
declare type Transform<A> = (result: Result) => A

declare type RedirectionStrategy = Transform<Request>
```

The `RedirectionStrategy` type alias embodies what it means to redirect. It's
just a transformation of a [Result](#result) to a new [Request][]. Redirection
Strategies are used by [`followRedirectsWith`](#followredirectswith) to
determine its redirection behaviour.

### `redirectAnyRequest`

A [Redirection Strategy](#RedirectionStrategy) that will indiscriminately follow
redirects as long as the response contains a `Location` header.

If the new location is on an external host, then any confidential headers
(such as the cookie header) will be dropped from the new request.

Used in the [`defaultRedirectionStrategy`](#defaultredirectionstrategy) and the
[`aggressiveRedirectionStrategy`](#aggressiveredirectionstrategy).

### `redirectIfGetMethod`

A [Redirection Strategy](#RedirectionStrategy) that will follow
redirects as long as the response contains a `Location` header and the request
was issued using the `GET` method.

If the new location is on an external host, then any confidential headers
(such as the cookie header) will be dropped from the new request.

Used in the [`defaultRedirectionStrategy`](#defaultredirectionstrategy).

### `redirectUsingGetMethod`

A [Redirection Strategy](#RedirectionStrategy) that sends a new `GET` request
based on the original request to the Location specified in the given Response.
If the response does not contain a location, the request is not redirected.

The original request method and body are discarded, but other properties are
preserved. If the new location is on an external host, then any confidential
headers (such as the cookie header) will be dropped from the new request.

Used in the [`defaultRedirectionStrategy`](#defaultredirectionstrategy) and the
[`aggressiveRedirectionStrategy`](#aggressiveredirectionstrategy).

### `retryWithoutCondition`

A [Redirection Strategy](#RedirectionStrategy) that will retry the same request
but without any [conditional headers][], to ensure that caching layers are
skipped.

Used in the [`aggressiveRedirectionStrategy`](#aggressiveredirectionstrategy).

### `defaultRedirectionStrategy`

A [Redirection Strategy](#RedirectionStrategy) that carefully follows redirects
in strict accordance with [RFC2616 Section 10.3][].

Redirections with status codes 301, 302, and 307 are only followed if the
original request used the GET method, and redirects with status code 304 are
left alone for a caching layer to deal with.

This redirection strategy is used by the simple
[`followRedirects`](#followredirects) function.

If you want to modify or extend its behaviour for specific status codes, you can
use the [`matchStatus`](#matchstatus) function. In the example below, we
override the behaviour for `301` responses to *never redirect* and for `307`
responses to *always redirect*:

```ts
import * as Fetch from 'fp-ts-fetch';
import * as Tuple from 'fp-ts/Tuple';

const myRedirectionStrategy = (
  Fetch.matchStatus(Fetch.defaultRedirectionStrategy)({
    301: Tuple.snd,
    307: Fetch.redirectAnyRequest,
  })
);
```

See also the [`aggressiveRedirectionStrategy`](#aggressiveredirectionstrategy).

### `aggressiveRedirectionStrategy`

A [Redirection Strategy](#RedirectionStrategy) that aggressively follows
redirects in mild violation of [RFC2616 Section 10.3][]. In particular, anywhere
that a redirection should be interrupted for user confirmation or caching, this
policy follows the redirection nonetheless.

Redirections with status codes 301, 302, and 307 are always followed without
user intervention, and redirects with status code 304 are retried without
conditions if the original request had any conditional headers.

See also the [`defaultRedirectionStrategy`](#defaultredirectionstrategy). The
aggressive strategy can be extended/customized in the same way that the default
one can.

### `followRedirectsWith`

```ts
declare const followRedirectsWith: (strategy: RedirectionStrategy) => (
  (max: number) => (result: Result) => TaskEither<Error, Result>
)
```

Given a [Redirection Strategy](#RedirectionStrategy), a maximum number of
redirects, and a [Result](#result), returns a [TaskEither][] that will transfer
the new requests provided by the given strategy for as long as some conditions
hold:

1. The maximum number of transferred requests has not been exceeded; and
2. the request has not been sent before.

This means that a [Redirection Strategy](#RedirectionStrategy) can signal that
it's done redirecting by simply returning the original request.

It also means that exceeding the maximum number of redirects is not seen as an
error, and won't reject any tasks. Instead, the `3xx` response is returned
normally as part of the final [Result](#result). Users are expected to handle
redirects that couldn't be followed by observing a `3xx` response status code
after attempting to follow redirects. Thankfully, this will typically happen
automatically as a result of using [`acceptStatus`](#acceptstatus) or
[`matchStatus`](#matchstatus).

> [!NOTE]
>
> See the [extended usage example](#extended-example) for usage.

### `blob`

```ts
declare const blob: (result: Result) => TaskEither<Error, Blob>
```

Convert a [Result](#result) to a [Blob][] using [`Response#blob()`][].

### `text`

```ts
declare const text: (result: Result) => TaskEither<Error, string>
```

Convert a [Result](#result) to a string using [`Response#text()`][].

### `json`

```ts
declare const json: (result: Result) => TaskEither<Error, Json>
```

Convert a [Result](#result) to [Json][] using [`Response#json()`][].

### `buffer`

```ts
declare const buffer: (result: Result) => TaskEither<Error, ArrayBuffer>
```

Convert a [Result](#result) to an [ArrayBuffer][] using
[`Response#arrayBuffer()`][].

### `error`

```ts
declare const error: (result: Result) => TaskEither<Error, never>
```

Convert a [Result](#result) to an [Error][] formatted like:

```txt
Unexpected <statusText> (<statusCode>) response. Response body:

  <body_as_text>
```

The resulting `TaskEither` is always rejected with the resulting Error.

This function is a convenience function to use as a default handler for
unexpected cases in, for example, [`matchStatus`](#matchstatus).

[Blob]: https://developer.mozilla.org/docs/Web/API/Blob
[ArrayBuffer]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer
[Error]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Error
[Request]: https://developer.mozilla.org/docs/Web/API/Request
[Response]: https://developer.mozilla.org/docs/Web/API/Response
[`Response#text()`]: https://developer.mozilla.org/docs/Web/API/Response/text
[`Response#blob()`]: https://developer.mozilla.org/docs/Web/API/Response/blob
[`Response#json()`]: https://developer.mozilla.org/docs/Web/API/Response/json
[`Response#arrayBuffer()`]: https://developer.mozilla.org/docs/Web/API/Response/arrayBuffer
[Headers]: https://developer.mozilla.org/docs/Web/API/Headers
[conditional headers]: https://developer.mozilla.org/docs/Web/HTTP/Headers#Conditionals
[request body]: https://developer.mozilla.org/docs/Web/API/Request/Request#body
[request method]: https://developer.mozilla.org/docs/Web/API/Request/Request#method

[TaskEither]: https://gcanti.github.io/fp-ts/modules/TaskEither.ts.html
[Tuple]: https://gcanti.github.io/fp-ts/modules/Tuple.ts.html
[Json]: https://gcanti.github.io/fp-ts/modules/Json.ts.html
[io-ts]: https://gcanti.github.io/io-ts/
[retry-ts]: https://gcanti.github.io/retry-ts/

[RFC2616 Section 10.3]: https://tools.ietf.org/html/rfc2616#section-10.3
