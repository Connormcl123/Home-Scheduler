import type { WeatherSummary } from "@mirror-dashboard/shared";

export async function getWeather(): Promise<WeatherSummary> {
  return mockWeather();
}

export async function getWeatherProviderStatus() {
  return {
    provider: "mock",
    configured: false,
    message: "Phase 1 uses mock weather data. Open-Meteo will be added in a later phase."
  };
}

function mockWeather(): WeatherSummary {
  return {
    locationName: "Home",
    current: { temperature: 72, apparentTemperature: 74, windSpeed: 6, weatherCode: 2, description: "Partly cloudy" },
    daily: [
      { date: dateOffset(0), high: 76, low: 61, weatherCode: 2, description: "Partly cloudy" },
      { date: dateOffset(1), high: 73, low: 58, weatherCode: 1, description: "Mostly clear" },
      { date: dateOffset(2), high: 70, low: 56, weatherCode: 3, description: "Cloudy" },
      { date: dateOffset(3), high: 78, low: 63, weatherCode: 0, description: "Clear" }
    ]
  };
}

function dateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
