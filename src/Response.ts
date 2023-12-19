import {pipe} from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as E from 'fp-ts/lib/Either'
import {Json} from 'fp-ts/lib/Json'

export const blob = TE.tryCatchK((response: Response) => response.blob(), E.toError);

export const text = TE.tryCatchK((response: Response) => response.text(), E.toError);

export const json = TE.tryCatchK(
  (response: Response) => response.json() as Promise<Json>,
  E.toError
);

export const buffer = TE.tryCatchK((response: Response) => response.arrayBuffer(), E.toError);

export const error = (response: Response) => pipe(
  text(response),
  TE.chain(body => TE.left(new Error(
    `Unexpected ${response.statusText} (${response.status}) response. ` +
    `Response body:\n\n${body.split ('\n').map (x => `  ${x}`).join ('\n')}`
  )))
);
