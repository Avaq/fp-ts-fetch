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
import * as Req from 'fp-ts-fetch/Request';
import {identity, pipe} from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';

const task = pipe(
  Req.get('https://example.com'),
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
  [`followRedirectsWith`](#fetchfollowredirectswith).
- Parsing and decoding returned JSON using [io-ts][].
- Request retrying using [retry-ts][].
- Special handling of the 401 response code using
  [`matchStatus`](#fetchmatchstatus).

> [!CAUTION]
>
> This example **only works on Node 20** and up, or other runtimes that
> impelement the `node:fs/promises` module.

```ts
import * as Fetch from 'fp-ts-fetch';
import * as Req from 'fp-ts-fetch/Request';
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

// We can prebuild a Request with some of the common options.
const markdownReq = pipe(
  Req.post('https://api.github.com/markdown/raw'),
  Req.header('Accept', 'application/vnd.github+json'),
  Req.header('Authorization', `Bearer ${myGitHubToken}`),
  Req.header('X-GitHub-Api-Version', '2022-11-28'),
  Req.header('Content-Type', 'text/plain'),
);

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

  // Finalize our Request by supplying it with a body
  TE.map(body => pipe(markdownReq, Req.body(body))),

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

This package exports five modules:

- [The `Headers` module](#the-headers-module) for working with [Headers][].
- [The `Url` module](#the-url-module) for workig with [URL][]s.
- [The `Request` module](#the-request-module) for working with [Request][]s.
- [The `Response` module](#the-response-module) for working with [Response][]s.
- [The `Fetch` module](#the-fetch-module) that puts it all together.

> [!TIP]
>
> In most cases you'll only need [the `Request` module](#the-request-module)
> for creating [Request][]s, and [the `Fetch` module](#the-fetch-module) for
> transferring those requests and processing their [Result](#fetchresult).

### The `Headers` module

Utilities for creation and immutable transformations of [Headers][] instances.
You will likely only use this module indirectly via
[the `Request` module](#the-request-module).

```ts
import * as Headers from 'fp-ts-fetch/Headers';
```

#### `Headers.Eq`

```ts
declare const Eq: Eq<Headers>
```

An [Eq][] instance for [Headers][]. Two Headers collections are considered
equal if and only if they have the same amount of keys, and the same value at
each corresponding key. The insertion order of keys is not considered.

#### `Headers.from`

```ts
declare const from: (xs: Record<string, string>) => Headers
```

Constructs a new [Headers][] from a string-map of keys and values.

#### `Headers.lookup`

```ts
declare const lookup: const lookup: (name: string) => (headers: Headers) => O.Option<string>
```

Obtain the value corresponding to the given header name from the given
[Headers][]. The name is case insensitive.

#### `Headers.set`

```ts
declare const set: (name: string, value: string) => (headers: Headers) => Headers
```

Set a header to the given value in the given [Headers][]. This overrides
previous values if they were present.

> [!IMPORTANT]
>
> The comma symbol (`,`) has special meaning to many servers as a separator of
> values for headers that have multiple values. Any commas in the value provided
> are **not** automatically escaped. See also [`append`](#headersappend).

#### `Headers.append`

```ts
declare const append: (name: string, value: string) => (headers: Headers) => Headers
```

Appends the given value to any potentially existing value corresponding to the
given key in the given [Headers][]. This is done by adding a comma at the end
of the existing value, and concatenating the given value. If the given value
also contains commas, then these are **not** escaped, and so might be treated
by a server as multiple values.

#### `Headers.unset`

```ts
declare const unset: (name: string) => (headers: Headers) => Headers
```

Remove the header of the given name from the given [Headers][].

#### `Headers.omitConfidential`

```ts
declare const omitConfidential: (headers: Headers) => Headers
```

Removes authorization and cookie headers from the given [Headers][]. This is
used by [`Fetch.followRedirects`](#fetchfollowredirects) to avoid CVE-2022-0155.

#### `Headers.omitConditional`

```ts
declare const omitConditional: (headers: Headers) => Headers
```

Removes any client-side [conditional headers][] from the given [Headers][].
This is used by the
[aggressive redirection strategy](#fetchaggressiveredirectionstrategy)
to cache-bust out of a 304 response.

### The `Url` module

Utilities for creation and immutable transformations of [URL][] instances.
You will likely only use this module indirectly via
[the `Request` module](#the-request-module).

```ts
import * as Url from 'fp-ts-fetch/Url';
```

#### `Url.parse`

```ts
declare const parse: (url: string) => Option<URL>
```

Safely parse a string to a [URL][].

#### `Url.unsafeParse`

```ts
declare const unsafeParse: (url: string) => URL
```

Parse a string to a [URL][]. Throws a `TypeError` if the string could not be
parsed. This function can be useful when parsing strings that you already know
are valid URLs, like for example the [request URL][] property. For all other
cases, we recommend using [`Url.parse`](#urlparse).

#### `Url.navigate`

```ts
declare const navigate: (location: string) => (base: URL) => Option<URL>
```

"Navigate" from the given [URL][] to a given location, returning the URL that
represents the fully qualified new location.

```ts
import * as Url from 'fp-ts-fetch/Url';
import * as O from 'fp-ts/Option';
import {pipe} from 'fp-ts/function';

assert.deepStrictEqual(
  pipe(
    Url.parse('https://example.com'),
    O.chain(Url.navigate('/test.html')),
    O.map(String)
  ),
  O.some('https://example.com/test.html'),
);
```

#### `Url.params`

```ts
declare const params: (params: URLSearchParams) => (url: URL) => URL
```

Override the `searchParams` property of a [URL][] with the provided one.

#### `Url.param`

```ts
declare const param: (key: string, value: string) => (url: URL) => URL
```

Set the search parameter identified by the given key to the given value
on a [URL][].

#### `Url.unsetParam`

```ts
declare const unsetParam: (key: string) => (url: URL) => URL
```

Remove the search parameter identified by the given key from a [URL][].

#### `Url.sameOrigin`

```ts
declare const sameOrigin: (origin: URL) => (dest: URL) => boolean
```

Returns `true` if the given destination [URL][] is considered to be on the same
origin as a given origin [URL][]. A protocol downgrade (from https to http) is
also considered a different origin.

### The `Request` module

Immutable utilities for the [Request][] type.

```ts
import * as Req from 'fp-ts-fetch/Request';
```

#### `Req.to`

```ts
declare const to: (url: string | URL) => Request
```

Construct a [Request][] from a [URL][]. Sets the [redirect mode][]
to `manual` to favour manual redirection via
[`Fetch.followRedirects`](#fetchfollowredirects). All other [request options][]
are left on their default values.

#### `Req.get`

```ts
declare const get: (url: string | URL) => Request
```

Alternative to [`Req.to`](#reqto) that sets the [request method][] to `GET`.

#### `Req.put`

```ts
declare const put: (url: string | URL) => Request
```

Alternative to [`Req.to`](#reqto) that sets the [request method][] to `PUT`.

#### `Req.post`

```ts
declare const post: (url: string | URL) => Request
```

Alternative to [`Req.to`](#reqto) that sets the [request method][] to `POST`.

#### `Req.method`

```ts
declare const method: (method: string) => (request: Request) => Request
```

Sets the [request method][] of a request to the given value.

#### `Req.url`

```ts
declare const url: (url: URL | string) => (request: Request) => Request
```

Sets the [request URL][] to the given [URL][] or string.

#### `Req.params`

```ts
declare const params: (params: URLSearchParams) => (request: Request) => Request
```

Override the [request URL][] parameters with the given [URLSearchParams][].

#### `Req.param`

```ts
declare const param: (key: string, value: string) => (request: Request) => Request
```

Set the [request URL][] parameter of the given key to the given value.

#### `Req.unsetParam`

```ts
declare const unsetParam: (key: string) => (request: Request) => Request
```

Remove a given search parameter from the [request URL][].

#### `Req.headers`

```ts
declare const headers: (headers: Headers) => (request: Request) => Request
```

Override all of the [request headers][] on a request with the given [Headers][].

#### `Req.header`

```ts
declare const header: (name: string, value: string) => (request: Request) => Request
```

Sets one of the [request headers][] of a request to the given value. Uses
[`Headers.set`](#headersset) so be aware of its gotchas.

#### `Req.append`

```ts
declare const append: (name: string, value: string) => (request: Request) => Request
```

Appends a second value to one of the [request headers][] of a request. Uses
[`Headers.append`](#headersappend) so be aware of its gotchas.

#### `Req.unset`

```ts
declare const unset: (name: string) => (request: Request) => Request
```

Removes one of the [request headers][] from a request via
[`Headers.unset`](#headersunset).

#### `Req.body`

```ts
declare const body: (body: BodyInit) => (request: Request) => Request
```

Sets the [request body][] of a given request using the given "request body
initializer". This can be a [Blob][], an [ArrayBuffer][], a [TypedArray][], a
[DataView][], a [FormData][], a [URLSearchParams][], a string, or a
[ReadableStream][] object.

#### `Req.json`

```ts
declare const json: (json: Json) => (request: Request) => Request
```

Sets the [request body][] of a request to the stringified result of the given
[Json][] value. Also updates the [request headers][] to include a `Content-Type`
with value `application/json`.

#### `Req.equivalent`

```ts
delcare const equivalent: (left: Request) => (right: Request) => boolean
```

Returns `true` if two given [Request][]s are equivalent. Two requests are
considered equivalent if all properties except for the body are the same.

### The `Response` module

TODO

```ts
import * as Res from 'fp-ts-fetch/Response';
```

### The `Fetch` module

Functional alternative to the [Fetch API][].

```ts
import * as Fetch from 'fp-ts-fetch';
```

#### `Fetch.Result`

```ts
declare type Result = readonly [Response, Request];
```

The Result type is the type that the library is built around. It's simply a
[Tuple][] containing a [Response][] and the (typically) associated [Request][].

Having these paired allows for things like retries and following redirects.

You'll typically want to `Tuple.mapFst` over it to get at the Response.

#### `Fetch.request`

```ts
declare const request = (request: Request) => TaskEither<Error, Result>
```

Given a [Request][], returns a [TaskEither][] which makes an HTTP request and
resolves with the [Result](#fetchresult). The TaskEither only rejects if a network
error was encountered, and always resolves if an HTTP response was
successfully obtained.

> [!NOTE]
>
> See the [simple usage example](#simple-example) for usage.

#### `Fetch.matchStatus`

```ts
declare type Transform<A> = (result: Result) => A

declare type Pattern<T> = Record<number, Transform<T>>

declare const matchStatus = (
  <T>(onMismatch: Transform<T>, pattern: Pattern<T>) => (result: Result) => T
)
```

Case-analysis of a [Result](#fetchresult) using the [Response][]'s status code
as the differentiator. This makes it easy to handle different response status
codes in different ways.

The first argument is used to transform any results that didn't match the given
pattern. The [`error`](#fetcherror) function is provided as a convenient value
to use here for catching unexpected cases.

> [!NOTE]
>
> See the [extended usage example](#extended-example) for usage.

#### `Fetch.matchStatusW`

```ts
declare type Transform<A> = (result: Result) => A

declare type Pattern<T> = Record<number, Transform<T>>

declare const matchStatus = (
  <A, B>(onMismatch: Transform<A>, pattern: Pattern<B>) => (
    (result: Result) => A | B
  )
)
```

A type-widening version of [`matchStatus`](#fetchmatchstatus).

#### `Fetch.acceptStatus`

```ts
declare const acceptStatus = (code: number) => (result: Result) => (
  Either<Result, Result>
)
```

Tags a [Result](#fetchresult) by its [Response][]'s status code. Enables easy
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

#### `Fetch.followRedirects`

```ts
declare const followRedirects: (max: number) => (result: Result) => (
  TaskEither<Error, Result>
)
```

A default way to follow redirects up to a given number of redirections. Uses
the [default redirection strategy](#fetchdefaultredirectionstrategy). See
[`followRedirectsWith`](#fetchfollowredirectswith) for more information.

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

#### `Fetch.RedirectionStrategy`

```ts
declare type Transform<A> = (result: Result) => A

declare type RedirectionStrategy = Transform<Request>
```

The `RedirectionStrategy` type alias embodies what it means to redirect. It's
just a transformation of a [Result](#fetchresult) to a new [Request][].
Redirection Strategies are used by
[`followRedirectsWith`](#fetchfollowredirectswith) to determine its
redirection behaviour.

#### `Fetch.redirectAnyRequest`

A [Redirection Strategy](#fetchredirectionstrategy) that will indiscriminately
follow redirects as long as the response contains a `Location` header.

If the new location is on an external host (according to
[`Url.sameOrigin`](#urlsameorigin)), then any confidential headers will be
dropped from the new request (using
[`Headers.omitConfidential`](#headersomitconfidential)).

Used in the [`defaultRedirectionStrategy`](#fetchdefaultredirectionstrategy)
and the [`aggressiveRedirectionStrategy`](#fetchaggressiveredirectionstrategy).

#### `Fetch.redirectIfGetMethod`

A [Redirection Strategy](#fetchredirectionstrategy) that will follow
redirects as long as the response contains a `Location` header and the request
was issued using the `GET` method.

If the new location is on an external host, then any confidential headers
(such as the cookie header) will be dropped from the new request.

Used in the [`defaultRedirectionStrategy`](#fetchdefaultredirectionstrategy).

#### `Fetch.redirectUsingGetMethod`

A [Redirection Strategy](#fetchredirectionstrategy) that sends a new `GET`
request based on the original request to the Location specified in the given
Response. If the response does not contain a location, the request is not
redirected.

The original request method and body are discarded, but other properties are
preserved. If the new location is on an external host, then any confidential
headers (such as the cookie header) will be dropped from the new request.

Used in the [`defaultRedirectionStrategy`](#fetchdefaultredirectionstrategy)
and the [`aggressiveRedirectionStrategy`](#fetchaggressiveredirectionstrategy).

#### `Fetch.retryWithoutCondition`

A [Redirection Strategy](#redirectionstrategy) that will retry the same request
but without any [conditional headers][], to ensure that caching layers are
skipped.

Used in the
[`aggressiveRedirectionStrategy`](#fetchaggressiveredirectionstrategy).

#### `Fetch.defaultRedirectionStrategy`

A [Redirection Strategy](#fetchredirectionstrategy) that carefully follows
redirects in strict accordance with [RFC2616 Section 10.3][].

Redirections with status codes 301, 302, and 307 are only followed if the
original request used the GET method, and redirects with status code 304 are
left alone for a caching layer to deal with.

This redirection strategy is used by the simple
[`followRedirects`](#fetchfollowredirects) function.

If you want to modify or extend its behaviour for specific status codes, you can
use the [`matchStatus`](#fetchmatchstatus) function. In the example below, we
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

See also the
[`aggressiveRedirectionStrategy`](#fetchaggressiveredirectionstrategy).

#### `Fetch.aggressiveRedirectionStrategy`

A [Redirection Strategy](#fetchredirectionstrategy) that aggressively follows
redirects in mild violation of [RFC2616 Section 10.3][]. In particular, anywhere
that a redirection should be interrupted for user confirmation or caching, this
policy follows the redirection nonetheless.

Redirections with status codes 301, 302, and 307 are always followed without
user intervention, and redirects with status code 304 are retried without
conditions if the original request had any conditional headers.

See also the [`defaultRedirectionStrategy`](#fetchdefaultredirectionstrategy).
The aggressive strategy can be extended/customized in the same way that the
default one can.

#### `Fetch.followRedirectsWith`

```ts
declare const followRedirectsWith: (strategy: RedirectionStrategy) => (
  (max: number) => (result: Result) => TaskEither<Error, Result>
)
```

Given a [Redirection Strategy](#fetchredirectionstrategy), a maximum number of
redirects, and a [Result](#fetchresult), returns a [TaskEither][] that will
transfer the new requests provided by the given strategy for as long as some
conditions hold:

1. The maximum number of transferred requests has not been exceeded; and
2. an [equivalent](#reqequivalent) request has not been sent before.

This means that a [Redirection Strategy](#fetchredirectionstrategy) can signal
that it's done redirecting by simply returning the original request.

It also means that exceeding the maximum number of redirects is not seen as an
error, and won't reject any tasks. Instead, the `3xx` response is returned
normally as part of the final [Result](#fetchresult). Users are expected to
handle redirects that couldn't be followed by observing a `3xx` response status
code after attempting to follow redirects. Thankfully, this will typically
happen automatically as a result of using [`acceptStatus`](#fetchacceptstatus)
or [`matchStatus`](#fetchmatchstatus).

> [!NOTE]
>
> See the [extended usage example](#extended-example) for usage.

#### `Fetch.blob`

```ts
declare const blob: (result: Result) => TaskEither<Error, Blob>
```

Convert a [Result](#fetchresult) to a [Blob][] using [`Response#blob()`][].

#### `Fetch.text`

```ts
declare const text: (result: Result) => TaskEither<Error, string>
```

Convert a [Result](#fetchresult) to a string using [`Response#text()`][].

#### `Fetch.json`

```ts
declare const json: (result: Result) => TaskEither<Error, Json>
```

Convert a [Result](#fetchresult) to [Json][] using [`Response#json()`][].

#### `Fetch.buffer`

```ts
declare const buffer: (result: Result) => TaskEither<Error, ArrayBuffer>
```

Convert a [Result](#fetchresult) to an [ArrayBuffer][] using
[`Response#arrayBuffer()`][].

#### `Fetch.error`

```ts
declare const error: (result: Result) => TaskEither<Error, never>
```

Convert a [Result](#fetchresult) to an [Error][] formatted like:

```txt
Unexpected <statusText> (<statusCode>) response. Response body:

  <body_as_text>
```

The resulting `TaskEither` is always rejected with the resulting Error.

This function is a convenience function to use as a default handler for
unexpected cases in, for example, [`matchStatus`](#fetchmatchstatus).

[Fetch API]: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API

[Request]: https://developer.mozilla.org/docs/Web/API/Request
[request options]: https://developer.mozilla.org/docs/Web/API/Request/Request#options
[request URL]: https://developer.mozilla.org/docs/Web/API/Request/url
[request body]: https://developer.mozilla.org/docs/Web/API/Request/body
[request method]: https://developer.mozilla.org/docs/Web/API/Request/method
[request headers]: https://developer.mozilla.org/docs/Web/API/Request/headers
[redirect mode]: https://developer.mozilla.org/docs/Web/API/Request/redirect

[Response]: https://developer.mozilla.org/docs/Web/API/Response
[`Response#text()`]: https://developer.mozilla.org/docs/Web/API/Response/text
[`Response#blob()`]: https://developer.mozilla.org/docs/Web/API/Response/blob
[`Response#json()`]: https://developer.mozilla.org/docs/Web/API/Response/json
[`Response#arrayBuffer()`]: https://developer.mozilla.org/docs/Web/API/Response/arrayBuffer

[Blob]: https://developer.mozilla.org/docs/Web/API/Blob
[ArrayBuffer]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer
[TypedArray]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/TypedArray
[DataView]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/DataView
[FormData]: https://developer.mozilla.org/en-US/docs/Web/API/FormData
[URLSearchParams]: https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams
[ReadableStream]: https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream
[Error]: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Error
[URL]: https://developer.mozilla.org/docs/Web/API/URL
[Headers]: https://developer.mozilla.org/docs/Web/API/Headers
[conditional headers]: https://developer.mozilla.org/docs/Web/HTTP/Headers#Conditionals

[TaskEither]: https://gcanti.github.io/fp-ts/modules/TaskEither.ts.html
[Tuple]: https://gcanti.github.io/fp-ts/modules/Tuple.ts.html
[Eq]: https://gcanti.github.io/fp-ts/modules/Eq.ts.html
[Json]: https://gcanti.github.io/fp-ts/modules/Json.ts.html
[io-ts]: https://gcanti.github.io/io-ts/
[retry-ts]: https://gcanti.github.io/retry-ts/

[RFC2616 Section 10.3]: https://tools.ietf.org/html/rfc2616#section-10.3
