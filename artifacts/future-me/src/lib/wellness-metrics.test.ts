import assert from "node:assert/strict";
import test from "node:test";
import type { Profile, WellnessEntry, WellnessEntryKind } from "@workspace/api-client-react";
import {
  addCalendarDays,
  calculateCalorieTarget,
  calculateStepGoal,
  cycleSummary,
  dailySeries,
  energyAction,
  feelingPatternSummary,
  feelingSleepPattern,
  futureMeProjection,
  habitProjection,
  localDay,
  loggingConsistency,
  sleepSummary,
  stepProgress,
} from "./wellness-metrics";

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  id: 1,
  name: "Test profile",
  age: 35,
  sex: "female",
  heightCm: 165,
  weightKg: 65,
  goal: "improve-wellness",
  activityLevel: "lightly-active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

function entry(
  kind: WellnessEntryKind,
  date: string,
  data: Record<string, unknown>,
  id = 1,
): WellnessEntry {
  return {
    id,
    key: `${kind}:${date}:${id}`,
    kind,
    date,
    data,
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
  };
}

test("empty and one-day histories do not create a step projection", () => {
  assert.deepEqual(habitProjection([], "2026-10-04"), {
    enoughData: false,
    loggedDays: 0,
  });
  assert.deepEqual(
    habitProjection([entry("steps", "2026-10-04", { count: 6_200 })], "2026-10-04"),
    { enoughData: false, loggedDays: 1 },
  );
});

test("seven logged days give transparent 7- and 30-day projections", () => {
  const week = Array.from({ length: 7 }, (_, index) =>
    entry("steps", addCalendarDays("2026-09-28", index), { count: 6_200 }, index + 1),
  );
  assert.deepEqual(habitProjection(week, "2026-10-04"), {
    enoughData: true,
    loggedDays: 7,
    average: 6_200,
    projected7Days: 43_400,
    projected30Days: 186_000,
  });
});

test("Future Me stays empty with zero or one day of data", () => {
  assert.deepEqual(futureMeProjection([], "2026-10-04").enoughData, false);
  const oneDay = [
    entry("steps", "2026-10-04", { count: 6_200 }, 1),
    entry("sleep", "2026-10-04", { durationMinutes: 420 }, 2),
  ];
  const projection = futureMeProjection(oneDay, "2026-10-04");
  assert.equal(projection.enoughData, false);
  assert.equal(projection.observedDays, 1);
  assert.equal(projection.steps.projectedSteps30, null);
  assert.equal(projection.sleep.average, 420);
});

test("Future Me summarizes a seven-day sample without filling missing dates", () => {
  const week = Array.from({ length: 7 }, (_, index) =>
    entry("steps", addCalendarDays("2026-09-28", index), { count: 6_200 }, index + 1),
  );
  const projection = futureMeProjection(week, "2026-10-04");
  assert.equal(projection.enoughData, true);
  assert.equal(projection.observedDays, 7);
  assert.equal(projection.projectedRecordDays7, 2);
  assert.equal(projection.projectedRecordDays30, 7);
  assert.equal(projection.steps.average, 6_200);
  assert.equal(projection.steps.projectedMovementDays30, 7);
  assert.equal(projection.steps.projectedSteps30, 43_400);

  const weekOnly = futureMeProjection(week, "2026-10-04", 7);
  assert.equal(weekOnly.sampleDays, 7);
  assert.equal(weekOnly.projectedRecordDays7, 7);
  assert.equal(weekOnly.projectedRecordDays30, 30);
  assert.equal(weekOnly.steps.projectedSteps7, 43_400);
  assert.equal(weekOnly.steps.projectedSteps30, 186_000);
});

test("Future Me summarizes sparse calorie, sleep, feeling and experiment data from present values only", () => {
  const entries = [
    entry("calories", "2026-09-29", { count: 1_800 }, 1),
    entry("calories", "2026-10-02", { count: 2_100 }, 2),
    entry("sleep", "2026-10-02", { durationMinutes: 455 }, 3),
    entry("feeling", "2026-10-02", { feeling: "tired", intensity: 4 }, 4),
    entry("feeling", "2026-10-04", { feeling: "tired", intensity: 5 }, 5),
    entry("experiment-checkin", "2026-10-04", {
      experimentKey: "walk",
      completed: true,
      rating: 4,
    }, 6),
  ];
  const projection = futureMeProjection(entries, "2026-10-04");
  assert.equal(projection.observedDays, 3);
  assert.equal(projection.calories.loggedDays, 2);
  assert.equal(projection.calories.average, 1_950);
  assert.equal(projection.sleep.average, 455);
  assert.equal(projection.feelings.loggedDays, 2);
  assert.equal(projection.feelings.mostLogged, "tired");
  assert.equal(projection.energy.completedActions, 0);
  assert.equal(projection.energy.completedActionDays, 0);
  assert.equal(projection.experiments.checkins, 1);
  assert.equal(projection.experiments.completed, 1);
  assert.equal(projection.experiments.averageRating, 4);
});

test("Future Me excludes out-of-range measurements and records missing values as absent", () => {
  const entries = [
    entry("steps", "2026-09-28", { count: 4_000 }, 1),
    entry("steps", "2026-09-29", { count: 150_001 }, 2),
    entry("steps", "2026-09-30", { count: -1 }, 3),
    entry("calories", "2026-09-28", { count: 20_001 }, 4),
    entry("calories", "2026-09-29", { count: 0 }, 5),
    entry("energy", "2026-09-30", { level: 11 }, 6),
    entry("energy", "2026-10-01", { level: 70 }, 7),
  ];
  const projection = futureMeProjection(entries, "2026-10-04");
  assert.equal(projection.steps.loggedDays, 1);
  assert.equal(projection.steps.average, 4_000);
  assert.equal(projection.steps.projectedSteps30, null);
  assert.equal(projection.calories.loggedDays, 1);
  assert.equal(projection.calories.average, 0);
  assert.equal(projection.energy.loggedDays, 1);
  assert.equal(projection.energy.average, 70);
});

test("Future Me counts completed energy actions as recorded days, but ignores uncompleted choices", () => {
  const entries = [
    entry("energy", "2026-10-02", {
      level: 30,
      action: "A five-minute walk",
      completed: true,
    }, 1),
    entry("energy", "2026-10-02", {
      level: 50,
      action: "A short outdoor walk",
      completed: true,
    }, 2),
    entry("energy", "2026-10-03", {
      level: 10,
      action: "A breathing reset",
      completed: false,
    }, 3),
  ];
  const projection = futureMeProjection(entries, "2026-10-04", 7);
  assert.equal(projection.observedDays, 1);
  assert.equal(projection.projectedRecordDays7, 1);
  assert.equal(projection.energy.completedActions, 2);
  assert.equal(projection.energy.completedActionDays, 1);
  assert.deepEqual(loggingConsistency(entries, 7, "2026-10-04"), {
    loggedDays: 1,
    totalDays: 7,
    percent: 14,
  });
});

test("incomplete and missing dates remain missing rather than being fabricated as zero", () => {
  const partial = [
    entry("steps", "2026-09-29", { count: 4_000 }, 1),
    entry("steps", "2026-10-01", { count: 6_000 }, 2),
    entry("steps", "2026-10-04", { count: 8_000 }, 3),
  ];
  assert.equal(habitProjection(partial, "2026-10-04").enoughData, true);
  const projection = habitProjection(partial, "2026-10-04");
  assert.equal(projection.enoughData && projection.average, 6_000);
  const series = dailySeries(partial, "steps", 7, "2026-10-04");
  assert.equal(series.length, 7);
  assert.equal(series[0].value, null);
  assert.equal(series[1].value, 4_000);
  assert.equal(series[6].value, 8_000);
});

test("targets stay bounded and unsupported profile values do not produce calorie targets", () => {
  assert.ok(calculateStepGoal(profile({ age: 120, heightCm: 90, weightKg: 350 })) >= 4_000);
  assert.ok(calculateStepGoal(profile({ age: 20, heightCm: 250, weightKg: 25, activityLevel: "very-active" })) <= 12_000);
  assert.equal(calculateCalorieTarget(profile({ age: 17 })), null);
  assert.equal(calculateCalorieTarget(profile({ age: 35, heightCm: 90, weightKg: 25 })), null);
  assert.ok(calculateCalorieTarget(profile()) !== null);
});

test("step progress caps the display and changes messages at clear thresholds", () => {
  assert.deepEqual(stepProgress(0, 8_000), {
    remaining: 8_000,
    percent: 0,
    message: "Just getting started",
  });
  assert.equal(stepProgress(6_000, 8_000).message, "Almost there");
  assert.equal(stepProgress(9_000, 8_000).percent, 100);
  assert.equal(stepProgress(9_000, 8_000).message, "Goal completed");
});

test("sleep shortfall uses logged reference targets and safely handles absent data", () => {
  assert.deepEqual(sleepSummary([], 7, "2026-10-04"), {
    loggedNights: 0,
    averageMinutes: null,
    referenceTargetMinutes: 480,
    estimatedDebtMinutes: 0,
    bedtimeVariationMinutes: null,
    trend: Array.from({ length: 7 }, (_, index) => ({
      date: addCalendarDays("2026-09-28", index),
      value: null,
    })),
  });
  const oneNight = entry("sleep", "2026-10-04", {
    bedtime: "23:00",
    wakeTime: "05:00",
    durationMinutes: 360,
    quality: 3,
    referenceTargetMinutes: 420,
  });
  const summary = sleepSummary([oneNight], 7, "2026-10-04");
  assert.equal(summary.estimatedDebtMinutes, 60);
  assert.equal(summary.averageMinutes, 360);
  assert.equal(summary.referenceTargetMinutes, 420);
  assert.equal(summary.trend[6].value, 360);
  assert.equal(summary.trend[5].value, null);
});

test("sleep recovery uses the selected reference and logged naps without crediting missing nights", () => {
  const night = entry("sleep", "2026-10-04", {
    bedtime: "23:00",
    wakeTime: "05:00",
    durationMinutes: 360,
    napMinutes: 30,
    quality: 3,
    referenceTargetMinutes: 480,
  });
  const summary = sleepSummary([night], 7, "2026-10-04", 390);
  assert.equal(summary.referenceTargetMinutes, 390);
  assert.equal(summary.estimatedDebtMinutes, 0);
  assert.equal(summary.loggedNights, 1);
  assert.equal(summary.averageMinutes, 360);
  assert.equal(summary.trend.filter((day) => day.value !== null).length, 1);
});

test("sleep recovery ignores invalid durations, malformed naps, and duplicate dates", () => {
  const invalid = [
    entry("sleep", "2026-10-01", {
      bedtime: "25:99",
      wakeTime: "07:00",
      durationMinutes: 0,
      napMinutes: 600,
      quality: 4,
    }, 1),
    entry("sleep", "2026-10-02", {
      bedtime: "23:00",
      wakeTime: "06:00",
      durationMinutes: 1_500,
      quality: 4,
    }, 2),
    entry("sleep", "2026-10-03", {
      bedtime: "23:00",
      wakeTime: "06:00",
      durationMinutes: 420,
      napMinutes: -30,
      quality: 4,
    }, 3),
  ];
  const summary = sleepSummary(invalid, 7, "2026-10-04", 480);
  assert.equal(summary.loggedNights, 1);
  assert.equal(summary.averageMinutes, 420);
  assert.equal(summary.estimatedDebtMinutes, 60);
  assert.equal(summary.bedtimeVariationMinutes, null);
  assert.equal(summary.trend.filter((day) => day.value !== null).length, 1);

  const duplicateDate = [
    entry("sleep", "2026-10-04", {
      bedtime: "23:00",
      wakeTime: "05:00",
      durationMinutes: 360,
      quality: 3,
    }, 4),
    {
      ...entry("sleep", "2026-10-04", {
        bedtime: "23:00",
        wakeTime: "06:00",
        durationMinutes: 420,
        quality: 4,
      }, 5),
      updatedAt: "2026-10-04T13:00:00.000Z",
    },
  ];
  const deduped = sleepSummary(duplicateDate, 7, "2026-10-04", 480);
  assert.equal(deduped.loggedNights, 1);
  assert.equal(deduped.averageMinutes, 420);
  assert.equal(deduped.estimatedDebtMinutes, 60);
});

test("sleep bedtime consistency handles crossing midnight and invalid targets safely", () => {
  const nights = [
    entry("sleep", "2026-10-03", {
      bedtime: "23:50",
      wakeTime: "07:00",
      durationMinutes: 420,
      quality: 4,
    }, 1),
    entry("sleep", "2026-10-04", {
      bedtime: "00:10",
      wakeTime: "07:10",
      durationMinutes: 420,
      quality: 4,
    }, 2),
  ];
  assert.equal(sleepSummary(nights, 7, "2026-10-04", 3).referenceTargetMinutes, 480);
  assert.equal(sleepSummary(nights, 7, "2026-10-04").bedtimeVariationMinutes, 20);
});

test("feeling and sleep observations require enough matched days and never imply causation", () => {
  const oneFeeling = [
    entry("feeling", "2026-10-02", { feeling: "tired", intensity: 6 }),
    entry("sleep", "2026-10-02", { durationMinutes: 300, bedtime: "23:30" }, 2),
    entry("sleep", "2026-10-03", { durationMinutes: 420, bedtime: "23:00" }, 3),
  ];
  assert.equal(feelingSleepPattern(oneFeeling, "tired", "2026-10-04"), null);
  const enough = [
    ...oneFeeling,
    entry("feeling", "2026-10-03", { feeling: "tired", intensity: 4 }, 4),
  ];
  const pattern = feelingSleepPattern(enough, "tired", "2026-10-04");
  assert.ok(pattern);
  assert.match(pattern.message, /pattern worth watching, not a cause/);
});

test("period cycle estimates support irregular lengths without inventing missing history", () => {
  assert.deepEqual(cycleSummary([], "2026-10-04"), {
    cycleDay: null,
    estimatedNextPeriod: null,
    history: [],
  });
  const period = entry("period", "2026-09-01", {
    startDate: "2026-09-01",
    cycleLength: 40,
    symptoms: [],
  });
  const summary = cycleSummary([period], "2026-10-04");
  assert.equal(summary.cycleDay, 34);
  assert.equal(summary.estimatedNextPeriod, "2026-10-11");
});

test("logging consistency counts unique logged calendar days and energy suggestions stay nonjudgmental", () => {
  const entries = [
    entry("steps", "2026-10-04", { count: 100 }, 1),
    entry("sleep", "2026-10-04", { durationMinutes: 480 }, 2),
    entry("feeling", "2026-10-02", { feeling: "good", intensity: 7 }, 3),
    entry("energy", "2026-10-02", { level: 10, action: "A breath", completed: true }, 4),
    entry("energy", "2026-10-03", { level: 30, action: "A walk", completed: false }, 5),
  ];
  assert.deepEqual(loggingConsistency(entries, 7, "2026-10-04"), {
    loggedDays: 2,
    totalDays: 7,
    percent: 29,
  });
  assert.match(energyAction(10), /gentle/);
  assert.match(energyAction(30), /five-minute/i);
  assert.match(energyAction(50), /10 minutes/i);
  assert.match(energyAction(70), /15/i);
  assert.match(energyAction(90), /comfortable|movement|walk|experiment/i);
  assert.equal(localDay(new Date(2026, 9, 4)), "2026-10-04");
});

test("feeling pattern summaries stay sparse and keep missing days blank", () => {
  const empty = feelingPatternSummary([], undefined, "2026-10-04");
  assert.equal(empty.feeling, null);
  assert.equal(empty.feelingDays, 0);
  assert.equal(empty.averageIntensity, null);
  assert.equal(empty.enoughData, false);
  assert.deepEqual(empty.trend.map((day) => day.value), Array(7).fill(null));
  assert.deepEqual(empty.sleep, {
    matchedDays: 0,
    belowAverageDays: null,
    recentAverage: null,
  });

  const oneCheckIn = entry("feeling", "2026-10-04", {
    feeling: "tired",
    intensity: 6,
  });
  const sparse = feelingPatternSummary([oneCheckIn], undefined, "2026-10-04");
  assert.equal(sparse.feeling, "tired");
  assert.equal(sparse.feelingDays, 1);
  assert.equal(sparse.averageIntensity, 6);
  assert.equal(sparse.trend[6].value, 6);
  assert.equal(sparse.enoughData, false);
  assert.deepEqual(sparse.possiblePatterns, []);
});

test("three feeling days without any matched lifestyle records remain insufficient", () => {
  const entries = [
    entry("feeling", "2026-10-01", { feeling: "stressed", intensity: 4 }, 1),
    entry("feeling", "2026-10-02", { feeling: "stressed", intensity: 5 }, 2),
    entry("feeling", "2026-10-04", { feeling: "stressed", intensity: 6 }, 3),
  ];
  const summary = feelingPatternSummary(entries, "stressed", "2026-10-04");
  assert.equal(summary.feelingDays, 3);
  assert.equal(summary.enoughData, false);
  assert.deepEqual(summary.possiblePatterns, []);
  assert.equal(summary.sleep.matchedDays, 0);
  assert.equal(summary.loggingConsistency.loggedDays, 3);
});

test("feeling summaries support the 30-day window without filling unlogged dates", () => {
  const summary = feelingPatternSummary([
    entry("feeling", "2026-09-05", { feeling: "good", intensity: 8 }, 1),
    entry("feeling", "2026-10-04", { feeling: "good", intensity: 7 }, 2),
  ], "good", "2026-10-04", 30);
  assert.equal(summary.days, 30);
  assert.equal(summary.trend.length, 30);
  assert.equal(summary.trend[0].date, "2026-09-05");
  assert.equal(summary.trend[0].value, 8);
  assert.equal(summary.trend[28].value, null);
  assert.equal(summary.trend[29].value, 7);
  assert.deepEqual(summary.loggingConsistency, {
    loggedDays: 2,
    totalDays: 30,
    percent: 7,
  });
});

test("feeling comparisons use actual matched days and label repeated overlap as non-causal", () => {
  const entries = [
    entry("feeling", "2026-09-28", { feeling: "tired", intensity: 7 }, 1),
    entry("feeling", "2026-09-30", { feeling: "tired", intensity: 5 }, 2),
    entry("feeling", "2026-10-01", { feeling: "tired", intensity: 6 }, 3),
    entry("feeling", "2026-10-02", { feeling: "good", intensity: 4 }, 4),
    entry("sleep", "2026-09-28", { durationMinutes: 360 }, 5),
    entry("sleep", "2026-09-29", { durationMinutes: 480 }, 6),
    entry("sleep", "2026-09-30", { durationMinutes: 400 }, 7),
    entry("sleep", "2026-10-01", { durationMinutes: 600 }, 8),
    entry("steps", "2026-09-28", { count: 6_000 }, 9),
    entry("steps", "2026-09-29", { count: 8_000 }, 10),
    entry("steps", "2026-09-30", { count: 4_000 }, 11),
    entry("steps", "2026-10-01", { count: 7_000 }, 12),
    entry("energy", "2026-09-28", { level: 10, action: "Rest", completed: true }, 13),
    entry("energy", "2026-09-29", { level: 70, action: "Walk", completed: true }, 14),
    entry("energy", "2026-09-30", { level: 30, action: "Stretch", completed: false }, 15),
    entry("energy", "2026-10-01", { level: 90, action: "Walk", completed: true }, 16),
    entry("calories", "2026-09-28", { count: 1_800 }, 17),
    entry("calories", "2026-09-30", { count: 2_000 }, 18),
    entry("calories", "2026-10-02", { count: 1_900 }, 19),
    entry("experiment-checkin", "2026-09-30", {
      experimentKey: "walk",
      completed: true,
      rating: 4,
    }, 20),
    entry("period", "2026-09-30", {
      startDate: "2026-09-30",
      endDate: "2026-10-01",
    }, 21),
  ];
  const summary = feelingPatternSummary(entries, "tired", "2026-10-04");

  assert.equal(summary.feelingDays, 3);
  assert.equal(summary.averageIntensity, 6);
  assert.deepEqual(
    summary.trend.map((day) => day.value),
    [7, null, 5, 6, null, null, null],
  );
  assert.deepEqual(summary.sleep, {
    matchedDays: 3,
    belowAverageDays: 2,
    recentAverage: 460,
  });
  assert.equal(summary.steps.matchedDays, 3);
  assert.equal(summary.steps.belowAverageDays, 2);
  assert.equal(summary.energy.matchedDays, 3);
  assert.equal(summary.energy.belowAverageDays, 2);
  assert.equal(summary.calories.daysLogged, 3);
  assert.equal(summary.calories.feelingDaysLogged, 2);
  assert.equal(summary.experiments.daysLogged, 1);
  assert.equal(summary.experiments.feelingDaysLogged, 1);
  assert.equal(summary.period.daysLogged, 2);
  assert.equal(summary.period.feelingDaysLogged, 2);
  assert.equal(summary.loggingConsistency.loggedDays, 5);
  assert.equal(summary.enoughData, true);
  assert.equal(summary.possiblePatterns.length, 3);
  assert.ok(summary.possiblePatterns.every((pattern) =>
    pattern.includes("may be associated") &&
    pattern.includes("pattern worth watching") &&
    !pattern.includes("caused"),
  ));
});

test("feeling summaries deduplicate dates and ignore invalid or out-of-window values", () => {
  const entries = [
    entry("feeling", "2026-10-04", { feeling: "other", intensity: 4 }, 1),
    entry("feeling", "2026-10-04", { feeling: "other", intensity: 8 }, 2),
    entry("feeling", "2026-10-03", { feeling: "other", intensity: 11 }, 3),
    entry("feeling", "2026-09-26", { feeling: "other", intensity: 6 }, 4),
    entry("feeling", "2026-10-02", { feeling: "not-a-feeling", intensity: 6 }, 5),
    entry("sleep", "2026-10-04", { durationMinutes: 0 }, 6),
    entry("steps", "2026-10-04", { count: -1 }, 7),
    entry("energy", "2026-10-04", { level: 25, action: "Invalid", completed: true }, 8),
    entry("calories", "2026-10-04", { count: 20_001 }, 9),
    entry("experiment-checkin", "2026-10-04", {
      experimentKey: "",
      completed: true,
      rating: 6,
    }, 10),
  ];
  const summary = feelingPatternSummary(entries, "other", "2026-10-04");
  assert.equal(summary.feelingDays, 1);
  assert.equal(summary.averageIntensity, 6);
  assert.equal(summary.trend[6].value, 6);
  assert.equal(summary.sleep.matchedDays, 0);
  assert.equal(summary.steps.matchedDays, 0);
  assert.equal(summary.energy.matchedDays, 0);
  assert.equal(summary.calories.daysLogged, 0);
  assert.equal(summary.experiments.daysLogged, 0);
  assert.equal(summary.period.daysLogged, 0);
  assert.equal(summary.enoughData, false);
});