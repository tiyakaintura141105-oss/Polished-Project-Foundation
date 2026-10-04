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
  });
  const oneNight = entry("sleep", "2026-10-04", {
    bedtime: "23:00",
    wakeTime: "05:00",
    durationMinutes: 360,
    quality: 3,
    referenceTargetMinutes: 420,
  });
  assert.equal(sleepSummary([oneNight], 7, "2026-10-04").estimatedDebtMinutes, 60);
  assert.equal(sleepSummary([oneNight], 7, "2026-10-04").averageMinutes, 360);
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
  ];
  assert.deepEqual(loggingConsistency(entries, 7, "2026-10-04"), {
    loggedDays: 2,
    totalDays: 7,
    percent: 29,
  });
  assert.match(energyAction(10), /gentle/);
  assert.match(energyAction(90), /comfortable|movement|walk|experiment/i);
  assert.equal(localDay(new Date(2026, 9, 4)), "2026-10-04");
});