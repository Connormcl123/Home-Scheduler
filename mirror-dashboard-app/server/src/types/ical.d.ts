declare module "ical" {
  export function parseICS(input: string): Record<string, unknown>;
}
