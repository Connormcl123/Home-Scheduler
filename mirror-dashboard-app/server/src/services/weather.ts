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
  61: "Rain",
  71: "Snow",
  80: "Rain showers",
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
    if (!response.ok) throw new Error(`Weather fetch failed: ${response.status}`);
    const data: any = await response.json();
    return {
      locationName: "Home",
      current: {
        temperature: Math.round(data.current.temperature_2m),
        apparentTemperature: Math.round(data.current.apparent_temperature),
        windSpeed: Math.round(data.current.wind_speed_10m),
        weatherCode: data.current.weather_code,
        description: label(data.current.weather_code)
      },
      daily: data.daily.time.slice(0, 5).map((date: string, index: number) => ({
        date,
        high: Math.round(data.daily.temperature_2m_max[index]),
        low: Math.round(data.daily.temperature_2m_min[index]),
        weatherCode: data.daily.weather_code[index],
        description: label(data.daily.weather_code[index])
      }))
    };
  } catch (error) {
    console.warn("Weather unavailable, using demo weather:", error);
    return demoWeather();
  }
}

function label(code: number) {
  return weatherLabels[code] || "Mixed";
}

function demoWeather(): WeatherSummary {
  return {
    locationName: "Home",
    current: { temperature: 72, apparentTemperature: 74, windSpeed: 6, weatherCode: 2, description: "Partly cloudy" },
    daily: [
      { date: new Date().toISOString().slice(0, 10), high: 76, low: 61, weatherCode: 2, description: "Partly cloudy" }
    ]
  };
}
