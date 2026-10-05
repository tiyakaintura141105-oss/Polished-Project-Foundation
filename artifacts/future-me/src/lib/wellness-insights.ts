import type { WellnessEntry } from "@workspace/api-client-react";
import { addCalendarDays } from "./wellness-metrics";

export type InsightMetric =
  | "steps"
  | "calories"
  | "sleep"
  | "energy"
  | "feeling"
  | "experiments"
  | "period";

export type InsightPoint = { date: string; value: number | null };
export type InsightWindow = { start: string; end: string; days: number };
type EntryData = Record<string, unknown>;
type NumericSummary = {
  average: number | null;
  loggedDays: number;
  series: InsightPoint[];
};

const energyLevels = new Set([10, 30, 50, 70, 90]);
const validFeelingLabels = new Set([
  "tired", "stressed", "low mood", "energetic", "bloated",
  "headache", "poor focus", "good", "other",
]);
const experimentStatuses = new Set(["active", "paused", "completed", "cancelled"]);

function dataOf(entry: WellnessEntry): EntryData {
  return entry.data && typeof entry.data === "object"
    ? entry.data as EntryData
    : {};
}

function finiteNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (integer && !Number.isInteger(value)) return null;
  return value >= minimum && value <= maximum ? value : null;
}

function newestPerDate(
  entries: WellnessEntry[],
  kind: WellnessEntry["kind"],
  start: string,
  end: string,
): WellnessEntry[] {
  const byDate = new Map<string, WellnessEntry>();
  for (const entry of entries) {
    if (entry.kind !== kind || entry.date < start || entry.date > end) continue;
    const previous = byDate.get(entry.date);
    if (
      !previous ||
      entry.updatedAt > previous.updatedAt ||
      (entry.updatedAt === previous.updatedAt && entry.id > previous.id)
    ) {
      byDate.set(entry.date, entry);
    }
  }
  return [...byDate.values()];
}

function windowFor(days: number, through: string): InsightWindow {
  const safeDays = days === 30 ? 30 : 7;
  return {
    start: addCalendarDays(through, -(safeDays - 1)),
    end: through,
    days: safeDays,
  };
}

function numericValue(
  entry: WellnessEntry | undefined,
  metric: Exclude<InsightMetric, "experiments" | "period">,
): number | null {
  if (!entry) return null;
  const data = dataOf(entry);
  switch (metric) {
    case "steps":
      return finiteNumber(data.count, 0, 150_000, true);
    case "calories":
      return finiteNumber(data.count, 0, 20_000, true);
    case "sleep":
      return finiteNumber(data.durationMinutes, 1, 1_440, true);
    case "energy": {
      const level = finiteNumber(data.level, 0, 100);
      return level !== null && energyLevels.has(level) ? level : null;
    }
    case "feeling":
      return finiteNumber(data.intensity, 1, 10, true);
  }
}

function pointsForMetric(
  entries: WellnessEntry[],
  metric: Exclude<InsightMetric, "experiments" | "period">,
  window: InsightWindow,
): InsightPoint[] {
  const kind = metric === "feeling" ? "feeling" : metric;
  const byDate = new Map(
    newestPerDate(entries, kind, window.start, window.end)
      .map((entry) => [entry.date, numericValue(entry, metric)]),
  );
  return Array.from({ length: window.days }, (_, index) => {
    const date = addCalendarDays(window.start, index);
    return { date, value: byDate.get(date) ?? null };
  });
}

function summarizeSeries(series: InsightPoint[]): NumericSummary {
  const values = series.flatMap((point) =>
    point.value === null ? [] : [point.value],
  );
  return {
    average: values.length
      ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
      : null,
    loggedDays: values.length,
    series,
  };
}

function bedtimeVariation(entries: WellnessEntry[], window: InsightWindow): number | null {
  const bedtimes = newestPerDate(entries, "sleep", window.start, window.end)
    .map((entry) => dataOf(entry).bedtime)
    .filter((value): value is string =>
      typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
    )
    .map((value) => {
      const [hours, minutes] = value.split(":").map(Number);
      return hours * 60 + minutes;
    })
    .sort((left, right) => left - right);
  if (bedtimes.length < 2) return null;
  let largestGap = 0;
  for (let index = 0; index < bedtimes.length; index += 1) {
    const next = bedtimes[(index + 1) % bedtimes.length] +
      (index === bedtimes.length - 1 ? 1_440 : 0);
    largestGap = Math.max(largestGap, next - bedtimes[index]);
  }
  return 1_440 - largestGap;
}

function dailyCountSeries(
  entries: WellnessEntry[],
  kind: WellnessEntry["kind"],
  window: InsightWindow,
  isValid: (entry: WellnessEntry) => boolean = () => true,
): InsightPoint[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (
      entry.kind !== kind ||
      entry.date < window.start ||
      entry.date > window.end ||
      !isValid(entry)
    ) continue;
    counts.set(entry.date, (counts.get(entry.date) ?? 0) + 1);
  }
  return Array.from({ length: window.days }, (_, index) => {
    const date = addCalendarDays(window.start, index);
    return { date, value: counts.get(date) ?? null };
  });
}

function validCheckin(entry: WellnessEntry): boolean {
  const data = dataOf(entry);
  return typeof data.experimentKey === "string" &&
    data.experimentKey.trim().length > 0 &&
    finiteNumber(data.rating, 1, 5, true) !== null &&
    typeof data.completed === "boolean";
}

function validPeriod(entry: WellnessEntry): boolean {
  const data = dataOf(entry);
  const validDate = (value: unknown) =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  return validDate(data.startDate) ||
    validDate(data.endDate) ||
    finiteNumber(data.cycleLength, 1, 365, true) !== null ||
    typeof data.flow === "string" ||
    typeof data.mood === "string" ||
    typeof data.notes === "string" ||
    (Array.isArray(data.symptoms) &&
      data.symptoms.some((symptom) => typeof symptom === "string" && symptom.trim()));
}

function distinctDates(series: InsightPoint[]) {
  return series.filter((point) => point.value !== null).length;
}

function mean(series: InsightPoint[]): number | null {
  const values = series.flatMap((point) =>
    point.value === null ? [] : [point.value],
  );
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function dateLabel(days: number) {
  return days === 7 ? "this week" : "this 30-day window";
}

function previousWindow(window: InsightWindow): InsightWindow {
  const end = addCalendarDays(window.start, -1);
  return windowFor(window.days, end);
}

function feelingCounts(entries: WellnessEntry[], window: InsightWindow) {
  const counts = new Map<string, number>();
  for (const entry of newestPerDate(entries, "feeling", window.start, window.end)) {
    const value = dataOf(entry).feeling;
    if (typeof value !== "string" || !validFeelingLabels.has(value)) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function currentExperiments(entries: WellnessEntry[]) {
  const latestByKey = new Map<string, WellnessEntry>();
  for (const entry of entries) {
    if (entry.kind !== "experiment") continue;
    const previous = latestByKey.get(entry.key);
    if (!previous || entry.updatedAt > previous.updatedAt) {
      latestByKey.set(entry.key, entry);
    }
  }
  return [...latestByKey.values()]
    .filter((entry) => experimentStatuses.has(String(dataOf(entry).status)))
    .map((entry) => ({
      key: entry.key,
      title: typeof dataOf(entry).title === "string"
        ? String(dataOf(entry).title)
        : "Personal experiment",
      status: String(dataOf(entry).status),
    }));
}

function sleepEnergyObservation(
  entries: WellnessEntry[],
  window: InsightWindow,
): string | null {
  const sleepByDate = new Map(
    newestPerDate(entries, "sleep", window.start, window.end)
      .map((entry) => [entry.date, numericValue(entry, "sleep")]),
  );
  const energyByDate = new Map(
    newestPerDate(entries, "energy", window.start, window.end)
      .map((entry) => [entry.date, numericValue(entry, "energy")]),
  );
  const matched = [...sleepByDate.entries()]
    .flatMap(([date, sleep]) => {
      const energy = energyByDate.get(date);
      return sleep !== null && sleep !== undefined && energy !== null && energy !== undefined
        ? [{ sleep, energy }]
        : [];
    });
  if (matched.length < 4) return null;
  const recentAverage = matched.reduce((sum, day) => sum + day.sleep, 0) / matched.length;
  const sortedGaps = matched
    .map((day) => Math.abs(day.sleep - recentAverage))
    .sort((left, right) => left - right);
  const splitAt = Math.floor(matched.length / 2);
  const nearerCutoff = sortedGaps[splitAt - 1];
  const nearer = matched.filter((day) => Math.abs(day.sleep - recentAverage) <= nearerCutoff);
  const further = matched.filter((day) => Math.abs(day.sleep - recentAverage) > nearerCutoff);
  if (nearer.length < 2 || further.length < 2) return null;
  const nearerEnergy = mean(nearer.map((day) => ({ date: "", value: day.energy })));
  const furtherEnergy = mean(further.map((day) => ({ date: "", value: day.energy })));
  if (nearerEnergy === null || furtherEnergy === null || nearerEnergy - furtherEnergy < 10) {
    return null;
  }
  return "Your logged energy was often higher on days when sleep was closer to your recent average. Your logs show a pattern worth watching; they cannot tell us what caused it.";
}

export function buildWellnessInsights(
  entries: WellnessEntry[],
  days: 7 | 30,
  through: string,
  includePeriods = false,
) {
  const window = windowFor(days, through);
  const previous = previousWindow(window);
  const activity = summarizeSeries(pointsForMetric(entries, "steps", window));
  const nutrition = summarizeSeries(pointsForMetric(entries, "calories", window));
  const sleep = summarizeSeries(pointsForMetric(entries, "sleep", window));
  const energy = summarizeSeries(pointsForMetric(entries, "energy", window));
  const feeling = summarizeSeries(pointsForMetric(entries, "feeling", window));
  const experiments = dailyCountSeries(entries, "experiment-checkin", window, validCheckin);
  const period = includePeriods
    ? dailyCountSeries(entries, "period", window, validPeriod)
    : null;
  const previousActivity = summarizeSeries(pointsForMetric(entries, "steps", previous));
  const previousNutrition = summarizeSeries(pointsForMetric(entries, "calories", previous));
  const previousSleep = summarizeSeries(pointsForMetric(entries, "sleep", previous));
  const previousSleepVariation = bedtimeVariation(entries, previous);
  const sleepVariation = bedtimeVariation(entries, window);
  const nutritionDays = nutrition.loggedDays;
  const previousNutritionDays = previousNutrition.loggedDays;
  const activityChange = activity.average !== null && previousActivity.average !== null &&
    previousActivity.average > 0
    ? (activity.average - previousActivity.average) / previousActivity.average
    : null;
  const positiveChanges: { score: number; summary: string }[] = [];
  if (activityChange !== null && activityChange >= 0.05 &&
      activity.loggedDays >= 3 && previousActivity.loggedDays >= 3) {
    positiveChanges.push({
      score: activityChange,
      summary: `Your average steps increased ${dateLabel(days)}.`,
    });
  }
  if (nutritionDays > previousNutritionDays && nutritionDays >= 3 &&
      previousNutritionDays >= 2) {
    positiveChanges.push({
      score: (nutritionDays - previousNutritionDays) / days,
      summary: `You logged calorie totals on ${nutritionDays} of ${days} days, more often than in the previous ${days}-day window.`,
    });
  }
  if (sleepVariation !== null && previousSleepVariation !== null &&
      previousSleepVariation - sleepVariation >= 30) {
    positiveChanges.push({
      score: (previousSleepVariation - sleepVariation) / 1_440,
      summary: `Your sleep timing was more consistent ${dateLabel(days)}.`,
    });
  }
  positiveChanges.sort((a, b) => b.score - a.score);
  const strongestPositive = positiveChanges[0]?.summary ??
    "There is not enough comparable logging yet to identify a clear positive change.";

  const repeatedHabits = [
    { name: "Steps", loggedDays: activity.loggedDays },
    { name: "Nutrition logging", loggedDays: nutritionDays },
    { name: "Sleep", loggedDays: sleep.loggedDays },
    { name: "Energy", loggedDays: energy.loggedDays },
    { name: "Feelings", loggedDays: feeling.loggedDays },
    { name: "Wellness experiments", loggedDays: distinctDates(experiments) },
  ].sort((a, b) => b.loggedDays - a.loggedDays || a.name.localeCompare(b.name));
  const consistentHabit = repeatedHabits[0]?.loggedDays >= 2
    ? `${repeatedHabits[0].name} was your most consistent habit, logged on ${repeatedHabits[0].loggedDays} of ${days} days.`
    : "A consistent habit is still taking shape. Keep the notes that feel useful to you.";

  const recentSleepEntries = newestPerDate(entries, "sleep", window.start, window.end);
  const opportunity = sleepVariation !== null && sleepVariation >= 90
    ? "Sleep timing varied the most in this window. Reviewing your sleep notes could make that pattern easier to notice."
    : nutritionDays < Math.ceil(days * 0.35)
      ? "Nutrition logging has the most room to become more regular, if tracking it feels useful to you."
      : activity.loggedDays < Math.ceil(days * 0.35)
        ? "A few more step notes would make your activity pattern easier to compare."
        : sleep.loggedDays < Math.ceil(days * 0.35)
          ? "A few more sleep notes would make sleep timing and duration easier to compare."
          : "There is not enough repeated logging yet to name one clear opportunity.";

  const recommendedFocus = sleepVariation !== null && sleepVariation >= 90
    ? {
        title: "Notice your sleep timing",
        href: "/sleep",
        actionLabel: "Review sleep notes",
      }
    : nutritionDays < Math.ceil(days * 0.35)
      ? {
          title: "Build a simple nutrition log",
          href: "/dashboard",
          actionLabel: "Log today's calories",
        }
      : activity.loggedDays < Math.ceil(days * 0.35)
        ? {
            title: "Notice your everyday movement",
            href: "/dashboard",
            actionLabel: "Log today's steps",
          }
        : sleep.loggedDays < Math.ceil(days * 0.35)
          ? {
              title: "Add a few sleep notes",
              href: "/sleep",
              actionLabel: "Log sleep",
            }
          : {
              title: "Keep noticing what matters to you",
              href: "/future-me",
              actionLabel: "Visit Future Me",
            };

  const counts = feelingCounts(entries, window);
  const checkins = entries.filter((entry) =>
    entry.kind === "experiment-checkin" &&
    entry.date >= window.start && entry.date <= window.end &&
    validCheckin(entry),
  );
  const allPeriods = includePeriods
    ? entries.filter((entry) =>
        entry.kind === "period" &&
        entry.date >= window.start && entry.date <= window.end &&
        validPeriod(entry),
      )
    : [];
  const symptomCounts = new Map<string, number>();
  for (const entry of allPeriods) {
    const symptoms = dataOf(entry).symptoms;
    if (!Array.isArray(symptoms)) continue;
    for (const symptom of symptoms) {
      if (typeof symptom !== "string" || !symptom.trim() || symptom === "No symptoms") continue;
      symptomCounts.set(symptom, (symptomCounts.get(symptom) ?? 0) + 1);
    }
  }
  const averageCheckinRating = checkins.length
    ? Math.round(checkins.reduce((sum, entry) =>
        sum + (finiteNumber(dataOf(entry).rating, 1, 5, true) ?? 0), 0) / checkins.length * 10,
      ) / 10
    : null;

  return {
    window,
    series: {
      activity: activity.series,
      nutrition: nutrition.series,
      sleep: sleep.series,
      energy: energy.series,
      feelings: feeling.series,
      experiments,
      period,
    },
    activity: {
      averageSteps: activity.average,
      loggedDays: activity.loggedDays,
      previousAverageSteps: previousActivity.average,
      changeRatio: activityChange,
    },
    nutrition: {
      averageCalories: nutrition.average,
      loggedDays: nutritionDays,
      previousLoggedDays: previousNutritionDays,
    },
    sleep: {
      averageMinutes: sleep.average,
      loggedDays: sleep.loggedDays,
      bedtimeVariationMinutes: sleepVariation,
      previousBedtimeVariationMinutes: previousSleepVariation,
      comparison: sleepEnergyObservation(entries, window),
      loggedEntries: recentSleepEntries.length,
    },
    energy: {
      averageLevel: energy.average,
      loggedDays: energy.loggedDays,
    },
    feelings: {
      averageIntensity: feeling.average,
      loggedDays: feeling.loggedDays,
      mostLogged: counts[0]?.[0] ?? null,
      counts: counts.map(([label, count]) => ({ label, count })),
    },
    experiments: {
      checkins: checkins.length,
      checkinDays: distinctDates(experiments),
      averageRating: averageCheckinRating,
      activeExperiments: currentExperiments(entries).filter((item) => item.status === "active"),
      series: experiments,
    },
    period: includePeriods
      ? {
          loggedStarts: allPeriods.length,
          symptoms: [...symptomCounts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([label, count]) => ({ label, count })),
          series: period ?? [],
        }
      : null,
    strongestPositive,
    biggestOpportunity: opportunity,
    mostConsistentHabit: consistentHabit,
    recommendedFocus,
  };
}

