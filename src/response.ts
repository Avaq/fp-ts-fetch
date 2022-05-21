import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';

export const blob = TE.tryCatchK((response: Response) => response.blob(), E.toError);

export const json = TE.tryCatchK((response: Response) => response.json(), E.toError);

export const buffer = TE.tryCatchK((response: Response) => response.arrayBuffer(), E.toError);
