import type { WeatherSummary } from "@mirror-dashboard/shared";
import { getSettings } from "./settings.js";

const weatherLabels: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Cloudy",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy showers",
  95: "Thunderstorm"
};

export async function getWeather(): Promise<WeatherSummary> {
  const settings = await getSettings();
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", settings.weatherLatitude);
  url.searchParams.set("longitude", settings.weatherLongitude);
  url.searchParams.set("timezone", settings.weatherTimezone);
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("current", "temperature_2m,apparent_temperature,wind_speed_10m,weather_code");
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,weather_code");

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Open-Meteo fetch failed: ${response.status}`);
    const data: any = await response.json();

    return {
      locationName: "Home",
      current: {
        temperature: Math.round(data.current.temperature_2m),
        apparentTemperature: Math.round(data.current.apparent_temperature),
        windSpeed: Math.round(data.current.wind_speed_10m),
        weatherCode: data.current.weather_code,
        description: weatherLabel(data.current.weather_code)
      },
      daily: data.daily.time.slice(0, 5).map((date: string, index: number) => ({
        date,
        high: Math.round(data.daily.temperature_2m_max[index]),
        low: Math.round(data.daily.temperature_2m_min[index]),
        weatherCode: data.daily.weather_code[index],
        description: weatherLabel(data.daily.weather_code[index])
      }))
    };
  } catch (error) {
    console.warn("Open-Meteo unavailable, using mock weather:", error);
    return mockWeather();
  }
}

export async function getWeatherProviderStatus() {
  return {
    provider: "open-meteo",
    configured: true,
    message: "Open-Meteo weather provider enabled with mock fallback."
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

function weatherLabel(code: number) {
  return weatherLabels[code] || "Mixed";
}
