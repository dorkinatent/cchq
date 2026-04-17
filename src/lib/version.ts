export const APP_VERSION: string =
  process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0";

export function isNewerVersion(current: string, remote: string): boolean {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10));

  const c = parse(current);
  const r = parse(remote);

  for (let i = 0; i < 3; i++) {
    if ((r[i] ?? 0) > (c[i] ?? 0)) return true;
    if ((r[i] ?? 0) < (c[i] ?? 0)) return false;
  }

  return false;
}
