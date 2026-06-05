declare module "ical" {
  const ical: {
    parseICS(input: string): Record<string, unknown>;
  };
  export default ical;
}
