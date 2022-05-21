import * as H from './headers.js'
import {Request} from 'node-fetch';

// Ignores redirect mode and cancellation signal
// Also misses some props from native fetch:
//   cache, credentials, destination, integrity, keepalive, mode, referrerPolicy
export const equivalent = (left: Request) => (right: Request) => (
  H.Eq.equals(left.headers, right.headers) &&
  left.method === right.method &&
  left.referrer === right.referrer &&
  left.url === right.url
);
