import stringify from 'json-stable-stringify';

export function canonicalizeLicenseJson(obj: unknown): string {
  return stringify(obj);
}
