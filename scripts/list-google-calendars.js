const path = require("node:path");
const fs = require("node:fs/promises");
const Module = require("node:module");

const home = process.env.HOME || process.cwd();
const moduleRequire = Module.createRequire(path.join(home, "MagicMirror/modules/MMM-HomeScheduler/package.json"));
const { google } = moduleRequire("googleapis");

const credentialsPath = process.argv[2] || path.join(home, "Home-Scheduler/secrets/google-calendar-credentials.json");
const tokenPath = process.argv[3] || path.join(home, "Home-Scheduler/secrets/google-calendar-token.json");

async function readJson(filePath, label) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${label} at ${filePath}: ${error.message}`);
  }
}

async function getAuth() {
  const credentials = await readJson(credentialsPath, "Google credentials");
  const token = await readJson(tokenPath, "Google token");
  const clientConfig = credentials.installed || credentials.web;

  if (!clientConfig?.client_id || !clientConfig?.client_secret) {
    throw new Error("Google credentials JSON is missing client_id or client_secret.");
  }

  const auth = new google.auth.OAuth2(
    clientConfig.client_id,
    clientConfig.client_secret,
    clientConfig.redirect_uris?.[0] || "http://localhost"
  );
  auth.setCredentials(token);
  await auth.getAccessToken();
  return auth;
}

async function main() {
  const auth = await getAuth();
  const calendar = google.calendar({ version: "v3", auth });
  const calendarList = await calendar.calendarList.list({
    auth,
    minAccessRole: "reader"
  });

  const calendars = calendarList.data.items || [];
  console.log("Available Google calendars:");

  for (const item of calendars) {
    console.log(`- ${item.summary}`);
    console.log(`  id: ${item.id}`);
    console.log(`  access: ${item.accessRole}`);

    const events = await calendar.events.list({
      auth,
      calendarId: item.id,
      timeMin: new Date().toISOString(),
      maxResults: 3,
      singleEvents: true,
      orderBy: "startTime"
    });

    for (const event of events.data.items || []) {
      const start = event.start?.dateTime || event.start?.date || "no start";
      console.log(`  next: ${start} - ${event.summary || "(no title)"}`);
    }
  }
}

main().catch((error) => {
  console.error(`Could not list Google calendars: ${error.message}`);
  process.exit(1);
});
