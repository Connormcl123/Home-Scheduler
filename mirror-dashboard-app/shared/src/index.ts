export type Priority = "low" | "normal" | "high";

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  location?: string;
  source: "ical" | "google" | "demo";
}

export interface Task {
  id: number;
  title: string;
  notes?: string | null;
  dueDate?: string | null;
  priority: Priority;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: number;
  date: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeatherSummary {
  locationName: string;
  current: {
    temperature: number;
    apparentTemperature: number;
    windSpeed: number;
    weatherCode: number;
    description: string;
  };
  daily: Array<{
    date: string;
    high: number;
    low: number;
    weatherCode: number;
    description: string;
  }>;
}

export interface NewsArticle {
  id: string;
  title: string;
  source: string;
  link: string;
  publishedAt?: string;
}

export interface FinanceQuote {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

export interface DashboardSummary {
  generatedAt: string;
  calendar: CalendarEvent[];
  tasks: Task[];
  todayNote: Note | null;
  weather: WeatherSummary;
  news: NewsArticle[];
  finance: {
    provider: string;
    quotes: FinanceQuote[];
  };
}

export interface AppSettings {
  calendarFeedUrl: string;
  weatherLatitude: string;
  weatherLongitude: string;
  weatherTimezone: string;
  rssFeeds: string[];
  financeWatchlist: string[];
}
