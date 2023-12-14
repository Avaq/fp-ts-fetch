import * as H from './headers';

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
