export const merge = (base: string) => (override: string) => (
  new URL(override, base).toString()
);

export const sameOrigin = (parent: string) => (child: string) => {
  const p = new URL (parent);
  const c = new URL (child);
  return (p.protocol === c.protocol || c.protocol === 'https:') &&
         (p.host === c.host || c.host.endsWith ('.' + p.host));
};
