const path = require("node:path");
const fs = require("node:fs/promises");
const Module = require("node:module");

const home = process.env.HOME || process.cwd();
const moduleRequire = Module.createRequire(path.join(home, "MagicMirror/modules/MMM-HomeScheduler/package.json"));
const { google } = moduleRequire("googleapis");

const credentialsPath = process.argv[2] || path.join(home, "Home-Scheduler/secrets/google-calendar-credentials.json");
const tokenPath = process.argv[3] || path.join(home, "Home-Scheduler/secrets/google-calendar-token.json");
const calendarId = process.argv[4] || "primary";

async function readJson(filePath, label) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${label} at ${filePath}: ${error.message}`);
  }
}

async function main() {
  const credentials = await readJson(credentialsPath, "Google credentials");
  const token = await readJson(tokenPath, "Google token");
  const clientConfig = credentials.installed || credentials.web;

  if (!clientConfig?.client_id || !clientConfig?.client_secret) {
    throw new Error("Google credentials JSON is missing client_id or client_secret.");
  }

  if (!token.access_token && !token.refresh_token) {
    throw new Error("Google token does not contain OAuth access. Delete it and re-run authorize-google-calendar.js.");
  }

  const auth = new google.auth.OAuth2(
    clientConfig.client_id,
    clientConfig.client_secret,
    clientConfig.redirect_uris?.[0] || "http://localhost"
  );
  auth.setCredentials(token);
  await auth.getAccessToken();

  const calendar = google.calendar({ version: "v3", auth });
  const response = await calendar.events.list({
    auth,
    calendarId,
    timeMin: new Date().toISOString(),
    maxResults: 5,
    singleEvents: true,
    orderBy: "startTime"
  });

  console.log(`Google Calendar auth OK for ${calendarId}.`);
  console.log(`Upcoming events returned: ${(response.data.items || []).length}`);
}

main().catch((error) => {
  console.error(`Google Calendar auth check failed: ${error.message}`);
  process.exit(1);
});
