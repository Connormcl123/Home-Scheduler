const path = require("node:path");
const fs = require("node:fs/promises");
const { authenticate } = require("@google-cloud/local-auth");

async function main() {
  const home = process.env.HOME || process.cwd();
  const credentialsPath = process.argv[2] || path.join(home, "Home-Scheduler/secrets/google-calendar-credentials.json");
  const tokenPath = process.argv[3] || path.join(home, "Home-Scheduler/secrets/google-calendar-token.json");

  await fs.mkdir(path.dirname(tokenPath), { recursive: true });

  const auth = await authenticate({
    keyfilePath: credentialsPath,
    scopes: ["https://www.googleapis.com/auth/calendar"]
  });

  await fs.writeFile(tokenPath, JSON.stringify(auth.credentials, null, 2));
  console.log(`Google Calendar token saved to ${tokenPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
