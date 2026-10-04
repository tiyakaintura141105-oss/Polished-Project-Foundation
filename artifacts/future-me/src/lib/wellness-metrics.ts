import type { Profile, WellnessEntry, WellnessEntryKind } from "@workspace/api-client-react";

export type WellnessDay = {
  date: string;
  value: number | null;
};

const activityMultipliers: Record<Profile["activityLevel"], number> = {
  sedentary: 1.2,
  "lightly-active": 1.375,
  "moderately-active": 1.55,
  "very-active": 1.725,
};

function objectData(entry: WellnessEntry): Record<string, unknown> {
  return entry.data && typeof entry.data === "object" ? entry.data : {};
}

export function localDay(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function addCalendarDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function dayDifference(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  return Math.round((end - start) / 86_400_000);
}

export function entryCount(entry: WellnessEntry | undefined): number {
  const value = entry ? objectData(entry).count : undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function entriesOfKind(
  entries: WellnessEntry[],
  kind: WellnessEntryKind,
): WellnessEntry[] {
  return entries
    .filter((entry) => entry.kind === kind)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

export function entryForDay(
  entries: WellnessEntry[],
  kind: WellnessEntryKind,
  day: string,
): WellnessEntry | undefined {
  return entries.find((entry) => entry.kind === kind && entry.date === day);
}

export function dailySeries(
  entries: WellnessEntry[],
  kind: WellnessEntryKind,
  days: number,
  through = localDay(),
): WellnessDay[] {
  const first = addCalendarDays(through, -(days - 1));
  const byDay = new Map(
    entriesOfKind(entries, kind)
      .filter((entry) => entry.date >= first && entry.date <= through)
      .map((entry) => [entry.date, entryCount(entry)]),
  );
  return Array.from({ length: days }, (_, index) => {
    const date = addCalendarDays(first, index);
    return { date, value: byDay.get(date) ?? null };
  });
}

export function calculateStepGoal(profile: Profile): number {
  const activityAdjustment: Record<Profile["activityLevel"], number> = {
    sedentary: -500,
    "lightly-active": 0,
    "moderately-active": 500,
    "very-active": 1_000,
  };
  const ageAdjustment = profile.age >= 65 ? -500 : profile.age < 18 ? -250 : 0;
  const statureAdjustment = profile.heightCm >= 185 ? 250 : profile.heightCm < 155 ? -250 : 0;
  const sizeAdjustment = profile.weightKg >= 100 ? 250 : profile.weightKg < 50 ? -250 : 0;
  const sexAdjustment = profile.sex === "male" ? 250 : 0;
  const goalAdjustment =
    profile.goal === "lose-weight" ? 500 : profile.goal === "gain-weight" ? 250 : 0;
  const estimate =
    7_000 +
    activityAdjustment[profile.activityLevel] +
    ageAdjustment +
    statureAdjustment +
    sizeAdjustment +
    sexAdjustment +
    goalAdjustment;
  return Math.min(12_000, Math.max(4_000, Math.round(estimate / 500) * 500));
}

export function calculateCalorieTarget(profile: Profile): number | null {
  if (profile.age < 18) return null;
  const sexConstant = profile.sex === "male" ? 5 : -161;
  const restingEstimate =
    10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + sexConstant;
  const goalAdjustment =
    profile.goal === "lose-weight" ? -200 : profile.goal === "gain-weight" ? 200 : 0;
  const estimate = restingEstimate * activityMultipliers[profile.activityLevel] + goalAdjustment;
  if (!Number.isFinite(estimate) || estimate < 1_200 || estimate > 5_500) return null;
  return Math.round(estimate / 50) * 50;
}

export function stepProgress(steps: number, goal: number) {
  return {
    remaining: Math.max(0, goal - steps),
    percent: Math.min(100, Math.round((steps / goal) * 100)),
    message:
      steps >= goal
        ? "Goal completed"
        : steps / goal >= 0.75
          ? "Almost there"
          : steps / goal >= 0.3
            ? "Good progress"
            : "Just getting started",
  };
}

export function habitProjection(entries: WellnessEntry[], through = localDay()) {
  const week = dailySeries(entries, "steps", 7, through);
  const loggedDays = week.filter((day) => day.value !== null);
  if (loggedDays.length < 3) {
    return { enoughData: false as const, loggedDays: loggedDays.length };
  }
  const average = Math.round(
    loggedDays.reduce((sum, day) => sum + (day.value ?? 0), 0) / loggedDays.length,
  );
  return {
    enoughData: true as const,
    loggedDays: loggedDays.length,
    average,
    projected7Days: average * 7,
    projected30Days: average * 30,
  };
}

type NumericSummary = {
  loggedDays: number;
  average: number | null;
};

function measurementSummary(
  entries: WellnessEntry[],
  kind: WellnessEntryKind,
  field: string,
  minimum: number,
  maximum: number,
  through: string,
  allowedValues?: ReadonlySet<number>,
): NumericSummary {
  const first = addCalendarDays(through, -29);
  const values = entriesOfKind(entries, kind)
    .filter((entry) => entry.date >= first && entry.date <= through)
    .map((entry) => ({ date: entry.date, value: objectData(entry)[field] }))
    .filter(
      (item): item is { date: string; value: number } =>
        typeof item.value === "number" &&
        Number.isFinite(item.value) &&
        Number.isInteger(item.value) &&
        item.value >= minimum &&
        item.value <= maximum &&
        (!allowedValues || allowedValues.has(item.value)),
    );
  return {
    loggedDays: new Set(values.map((item) => item.date)).size,
    average: values.length
      ? Math.round(values.reduce((sum, item) => sum + item.value, 0) / values.length)
      : null,
  };
}

export type FutureMeProjection = {
  enoughData: boolean;
  sampleDays: number;
  observedDays: number;
  projectedRecordDays7: number;
  projectedRecordDays30: number;
  steps: NumericSummary & {
    projectedMovementDays7: number;
    projectedMovementDays30: number;
    projectedSteps7: number | null;
    projectedSteps30: number | null;
  };
  calories: NumericSummary;
  sleep: NumericSummary;
  energy: NumericSummary;
  feelings: { loggedDays: number; mostLogged: string | null };
  experiments: {
    checkins: number;
    completed: number;
    averageRating: number | null;
  };
  periodEntries: number;
};

export function futureMeProjection(
  entries: WellnessEntry[],
  through = localDay(),
  days: number = 30,
): FutureMeProjection {
  const safeDays = Number.isInteger(days) && days > 0 ? days : 30;
  const first = addCalendarDays(through, -(safeDays - 1));
  const windowEntries = entries.filter(
    (entry) => entry.date >= first && entry.date <= through,
  );
  const observedDays = new Set(windowEntries.map((entry) => entry.date)).size;
  const steps = measurementSummary(
    windowEntries,
    "steps",
    "count",
    0,
    150_000,
    through,
  );
  const calories = measurementSummary(
    windowEntries,
    "calories",
    "count",
    0,
    20_000,
    through,
  );
  const sleep = measurementSummary(
    windowEntries,
    "sleep",
    "durationMinutes",
    0,
    1_440,
    through,
  );
  const energy = measurementSummary(
    windowEntries,
    "energy",
    "level",
    10,
    90,
    through,
    new Set([10, 30, 50, 70, 90]),
  );
  const feelings = entriesOfKind(windowEntries, "feeling")
    .map((entry) => objectData(entry).feeling)
    .filter((feeling): feeling is string => typeof feeling === "string" && feeling.length > 0);
  const feelingCounts = new Map<string, number>();
  feelings.forEach((feeling) =>
    feelingCounts.set(feeling, (feelingCounts.get(feeling) ?? 0) + 1),
  );
  const mostLogged = [...feelingCounts.entries()].sort(
    ([leftLabel, leftCount], [rightLabel, rightCount]) =>
      rightCount - leftCount || leftLabel.localeCompare(rightLabel),
  )[0]?.[0] ?? null;
  const checkins = entriesOfKind(windowEntries, "experiment-checkin").map(objectData);
  const ratings = checkins
    .filter((data) => data.phase !== "before")
    .map((data) => data.rating)
    .filter(
      (rating): rating is number =>
        typeof rating === "number" &&
        Number.isInteger(rating) &&
        rating >= 1 &&
        rating <= 5,
    );
  const projectedMovementDays7 = Math.round((steps.loggedDays / safeDays) * 7);
  const projectedMovementDays30 = Math.round((steps.loggedDays / safeDays) * 30);
  const movementRate = steps.loggedDays / safeDays;

  return {
    enoughData: observedDays >= 3,
    sampleDays: safeDays,
    observedDays,
    projectedRecordDays7: Math.round((observedDays / safeDays) * 7),
    projectedRecordDays30: Math.round((observedDays / safeDays) * 30),
    steps: {
      ...steps,
      projectedMovementDays7,
      projectedMovementDays30,
      projectedSteps7: steps.loggedDays >= 3 && steps.average !== null
        ? Math.round(steps.average * movementRate * 7)
        : null,
      projectedSteps30: steps.loggedDays >= 3 && steps.average !== null
        ? Math.round(steps.average * movementRate * 30)
        : null,
    },
    calories,
    sleep,
    energy,
    feelings: { loggedDays: new Set(
      entriesOfKind(windowEntries, "feeling").map((entry) => entry.date),
    ).size, mostLogged },
    experiments: {
      checkins: checkins.length,
      completed: checkins.filter((data) => data.completed === true).length,
      averageRating: ratings.length
        ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10
        : null,
    },
    periodEntries: entriesOfKind(windowEntries, "period").length,
  };
}

export function loggingConsistency(
  entries: WellnessEntry[],
  days: 7 | 30,
  through = localDay(),
) {
  const first = addCalendarDays(through, -(days - 1));
  const loggedDates = new Set(
    entries
      .filter((entry) => entry.date >= first && entry.date <= through)
      .map((entry) => entry.date),
  );
  return {
    loggedDays: loggedDates.size,
    totalDays: days,
    percent: Math.round((loggedDates.size / days) * 100),
  };
}

export function sleepSummary(
  entries: WellnessEntry[],
  days = 7,
  through = localDay(),
) {
  const first = addCalendarDays(through, -(days - 1));
  const sleepEntries = entriesOfKind(entries, "sleep").filter(
    (entry) => entry.date >= first && entry.date <= through,
  );
  const durations = sleepEntries
    .map((entry) => objectData(entry).durationMinutes)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const targetEntry = [...sleepEntries].reverse().find((entry) => {
    const target = objectData(entry).referenceTargetMinutes;
    return typeof target === "number" && target >= 180 && target <= 720;
  });
  const target = targetEntry
    ? Number(objectData(targetEntry).referenceTargetMinutes)
    : 480;
  const totalShortfall = durations.reduce(
    (sum, duration) => sum + Math.max(0, target - duration),
    0,
  );
  const bedtimeMinutes = sleepEntries
    .map((entry) => objectData(entry).bedtime)
    .filter((value): value is string => typeof value === "string" && /^\d{2}:\d{2}$/.test(value))
    .map((value) => {
      const [hours, minutes] = value.split(":").map(Number);
      return (hours * 60 + minutes + 720) % 1_440;
    });
  const bedtimeVariation = bedtimeMinutes.length > 1
    ? Math.round(
        bedtimeMinutes.slice(1).reduce(
          (sum, value, index) =>
            sum + Math.min(
              Math.abs(value - bedtimeMinutes[index]),
              1_440 - Math.abs(value - bedtimeMinutes[index]),
            ),
          0,
        ) / (bedtimeMinutes.length - 1),
      )
    : null;
  return {
    loggedNights: durations.length,
    averageMinutes: durations.length
      ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length)
      : null,
    referenceTargetMinutes: target,
    estimatedDebtMinutes: totalShortfall,
    bedtimeVariationMinutes: bedtimeVariation,
  };
}

export function feelingSleepPattern(
  entries: WellnessEntry[],
  feeling: string,
  through = localDay(),
) {
  const first = addCalendarDays(through, -6);
  const reportedDays = entries
    .filter((entry) =>
      entry.kind === "feeling" &&
      entry.date >= first &&
      entry.date <= through &&
      objectData(entry).feeling === feeling,
    )
    .map((entry) => entry.date);
  const sleeps = entriesOfKind(entries, "sleep").filter(
    (entry) => entry.date >= first && entry.date <= through,
  );
  const sleepDurations = sleeps
    .map((entry) => objectData(entry).durationMinutes)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (reportedDays.length < 2 || sleepDurations.length < 2) return null;
  const averageSleep = sleepDurations.reduce((sum, value) => sum + value, 0) / sleepDurations.length;
  const sleepByDay = new Map(
    sleeps.map((entry) => [entry.date, objectData(entry).durationMinutes]),
  );
  const matched = [...new Set(reportedDays)]
    .map((day) => sleepByDay.get(day))
    .filter((value): value is number => typeof value === "number");
  if (matched.length < 2) return null;
  const belowAverage = matched.filter((minutes) => minutes < averageSleep).length;
  return {
    feelingDays: new Set(reportedDays).size,
    matchedDays: matched.length,
    belowAverageSleepDays: belowAverage,
    averageSleepMinutes: Math.round(averageSleep),
    message: `On ${belowAverage} of ${matched.length} days you logged ${feeling} and sleep below your recent logged average. Your logs show a pattern worth watching, not a cause.`,
  };
}

export function cycleSummary(entries: WellnessEntry[], today = localDay()) {
  const periods = entriesOfKind(entries, "period")
    .filter((entry) => entry.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));
  const latest = periods[0];
  if (!latest) return { cycleDay: null, estimatedNextPeriod: null, history: periods };
  const cycleIntervals = periods.slice(0, 4).slice(1).map((entry, index) =>
    dayDifference(entry.date, periods[index].date),
  ).filter((days) => days >= 15 && days <= 90);
  const explicitLength = objectData(latest).cycleLength;
  const cycleLength = typeof explicitLength === "number" && explicitLength >= 15 && explicitLength <= 90
    ? explicitLength
    : cycleIntervals.length
      ? Math.round(cycleIntervals.reduce((sum, days) => sum + days, 0) / cycleIntervals.length)
      : null;
  return {
    cycleDay: dayDifference(latest.date, today) + 1,
    estimatedNextPeriod: cycleLength ? addCalendarDays(latest.date, cycleLength) : null,
    history: periods,
  };
}

export function energyAction(level: 10 | 30 | 50 | 70 | 90): string {
  if (level <= 10) return "Drink some water and take two gentle minutes to stretch.";
  if (level <= 30) return "Take a five-minute walk or try a short stretch.";
  if (level <= 50) return "Try a 10-minute walk outside at a comfortable pace.";
  if (level <= 70) return "Choose 15 minutes of movement that feels good today.";
  return "Take a longer walk, prepare a simple meal, or check in on an experiment.";
}