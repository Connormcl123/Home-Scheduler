const baseUrl = process.env.HOME_SCHEDULER_BASE_URL;
const token = process.env.HOME_SCHEDULER_VOICE_TOKEN;

export async function handler(event) {
  const request = event.request || {};
  if (request.type === "LaunchRequest") {
    return speak("Home Scheduler is ready. You can say create task sign the papers, or add calendar event dentist tomorrow at 2 PM.");
  }

  if (request.type === "IntentRequest") {
    const intent = request.intent || {};
    if (intent.name === "CreateTaskIntent") return createTask(intent);
    if (intent.name === "CreateCalendarEventIntent") return createCalendarEvent(intent);
    if (intent.name === "AMAZON.HelpIntent") return speak("Try saying, create task sign the papers, or add calendar event dentist tomorrow at 2 PM.");
    if (intent.name === "AMAZON.CancelIntent" || intent.name === "AMAZON.StopIntent") return speak("Okay.");
  }

  return speak("I did not catch that Home Scheduler command.");
}

async function createTask(intent) {
  const title = slotValue(intent, "taskTitle");
  if (!title) return speak("What should I call the task?");
  await postToScheduler("/api/voice/task", { title });
  return speak(`Added task: ${title}.`);
}

async function createCalendarEvent(intent) {
  const title = slotValue(intent, "eventTitle");
  const date = slotValue(intent, "eventDate");
  const time = slotValue(intent, "eventTime");
  const durationText = slotValue(intent, "eventDuration");
  if (!title) return speak("What should I call the calendar event?");
  await postToScheduler("/api/voice/calendar-event", {
    title,
    date,
    time,
    durationMinutes: durationToMinutes(durationText) || 60
  });
  return speak(`Added calendar event: ${title}.`);
}

async function postToScheduler(path, body) {
  if (!baseUrl || !token) throw new Error("HOME_SCHEDULER_BASE_URL and HOME_SCHEDULER_VOICE_TOKEN are required.");
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Home Scheduler request failed: ${response.status}`);
  return response.json();
}

function slotValue(intent, name) {
  return intent.slots?.[name]?.value || "";
}

function durationToMinutes(value) {
  if (!value) return null;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
  if (!match) return null;
  return Number(match[1] || 0) * 60 + Number(match[2] || 0);
}

function speak(text) {
  return {
    version: "1.0",
    response: {
      outputSpeech: {
        type: "PlainText",
        text
      },
      shouldEndSession: true
    }
  };
}
