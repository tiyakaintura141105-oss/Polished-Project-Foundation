import assert from "node:assert/strict";
import test from "node:test";
import type { WellnessEntry, WellnessEntryKind } from "@workspace/api-client-react";
import { buildWellnessInsights } from "./wellness-insights";

function entry(
  kind: WellnessEntryKind,
  date: string,
  data: Record<string, unknown>,
  id: number,
): WellnessEntry {
  return {
    id,
    key: `${kind}-${date}-${id}`,
    kind,
    date,
    data,
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
  };
}

test("empty windows keep every chart point absent and avoid invented takeaways", () => {
  const insights = buildWellnessInsights([], 7, "2026-10-05", true);
  assert.equal(insights.series.activity.length, 7);
  assert.ok(insights.series.activity.every((point) => point.value === null));
  assert.ok(insights.series.nutrition.every((point) => point.value === null));
  assert.ok(insights.series.sleep.every((point) => point.value === null));
  assert.ok(insights.series.energy.every((point) => point.value === null));
  assert.ok(insights.series.feelings.every((point) => point.value === null));
  assert.ok(insights.series.experiments.every((point) => point.value === null));
  assert.ok(insights.series.period?.every((point) => point.value === null));
  assert.match(insights.strongestPositive, /not enough comparable logging/);
  assert.match(insights.mostConsistentHabit, /still taking shape/);
  assert.equal(insights.activity.averageSteps, null);
  assert.equal(insights.sleep.comparison, null);
});

test("one logged day renders as one value without claiming a trend", () => {
  const insights = buildWellnessInsights([
    entry("steps", "2026-10-03", { count: 4_200 }, 1),
    entry("calories", "2026-10-03", { count: 1_950 }, 2),
    entry("sleep", "2026-10-03", {
      bedtime: "23:10",
      wakeTime: "06:30",
      durationMinutes: 440,
      quality: 3,
    }, 3),
    entry("energy", "2026-10-03", { level: 70, action: "Stretch", completed: true }, 4),
    entry("feeling", "2026-10-03", { feeling: "good", intensity: 6 }, 5),
  ], 7, "2026-10-05");

  assert.equal(insights.activity.loggedDays, 1);
  assert.equal(insights.activity.averageSteps, 4_200);
  assert.equal(insights.series.activity.filter((point) => point.value !== null).length, 1);
  assert.equal(insights.series.activity.find((point) => point.date === "2026-10-03")?.value, 4_200);
  assert.equal(insights.nutrition.loggedDays, 1);
  assert.equal(insights.sleep.averageMinutes, 440);
  assert.equal(insights.energy.averageLevel, 70);
  assert.equal(insights.feelings.mostLogged, "good");
  assert.match(insights.strongestPositive, /not enough comparable logging/);
});

test("30-day charts preserve the selected range and keep gaps blank", () => {
  const insights = buildWellnessInsights([
    entry("steps", "2026-09-06", { count: 3_000 }, 1),
    entry("steps", "2026-10-05", { count: 8_000 }, 2),
  ], 30, "2026-10-05");

  assert.equal(insights.window.start, "2026-09-06");
  assert.equal(insights.window.days, 30);
  assert.equal(insights.series.activity.length, 30);
  assert.equal(insights.series.activity[0].value, 3_000);
  assert.equal(insights.series.activity[29].value, 8_000);
  assert.equal(insights.series.activity.filter((point) => point.value === null).length, 28);
});

test("normal history compares matched windows and summarizes logged wellness areas", () => {
  const entries: WellnessEntry[] = [];
  for (const [index, date] of [
    "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25",
  ].entries()) {
    entries.push(
      entry("steps", date, { count: 4_000 + index * 100 }, index * 10 + 1),
      entry("calories", date, { count: 1_800 }, index * 10 + 2),
      entry("sleep", date, {
        bedtime: ["21:30", "23:00", "22:00", "00:00"][index],
        wakeTime: "06:30",
        durationMinutes: 400 + index * 10,
        quality: 3,
      }, index * 10 + 3),
    );
  }
  for (const [index, date] of [
    "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02",
  ].entries()) {
    entries.push(
      entry("steps", date, { count: 7_000 + index * 500 }, 100 + index * 10 + 1),
      entry("calories", date, { count: 2_000 }, 100 + index * 10 + 2),
      entry("sleep", date, {
        bedtime: ["22:00", "22:15", "22:00", "22:30"][index],
        wakeTime: "06:30",
        durationMinutes: 450,
        quality: 4,
      }, 100 + index * 10 + 3),
      entry("energy", date, { level: 70, action: "Walk", completed: true }, 100 + index * 10 + 4),
      entry("feeling", date, { feeling: "good", intensity: 5 }, 100 + index * 10 + 5),
      entry("experiment-checkin", date, {
        experimentKey: "sleep-routine",
        completed: true,
        rating: 4,
      }, 100 + index * 10 + 6),
    );
  }
  entries.push(
    entry("experiment", "2026-09-29", {
      title: "A calmer evening",
      status: "active",
    }, 201),
    entry("period", "2026-10-01", {
      startDate: "2026-10-01",
      symptoms: ["cramps", "No symptoms"],
    }, 202),
  );

  const insights = buildWellnessInsights(entries, 7, "2026-10-05", true);
  assert.equal(insights.activity.averageSteps, 7_750);
  assert.equal(insights.activity.previousAverageSteps, 4_150);
  assert.match(insights.strongestPositive, /average steps increased this week/);
  assert.equal(insights.nutrition.loggedDays, 4);
  assert.equal(insights.sleep.loggedDays, 4);
  assert.equal(insights.energy.loggedDays, 4);
  assert.equal(insights.feelings.mostLogged, "good");
  assert.equal(insights.experiments.checkins, 4);
  assert.equal(insights.experiments.activeExperiments[0]?.title, "A calmer evening");
  assert.equal(insights.period?.loggedStarts, 1);
  assert.deepEqual(insights.period?.symptoms, [{ label: "cramps", count: 1 }]);
  assert.ok(insights.series.experiments.some((point) => point.value === 1));

  const withoutPeriod = buildWellnessInsights(entries, 7, "2026-10-05");
  assert.equal(withoutPeriod.period, null);
  assert.equal(withoutPeriod.series.period, null);
});

test("missing or malformed fields stay absent instead of becoming zero-valued data", () => {
  const entries = [
    entry("steps", "2026-10-01", { count: "5000" }, 1),
    entry("calories", "2026-10-02", {}, 2),
    entry("sleep", "2026-10-03", { bedtime: "not-a-time" }, 3),
    entry("energy", "2026-10-04", { level: 55 }, 4),
    entry("feeling", "2026-10-04", { feeling: "unknown" }, 5),
    entry("experiment-checkin", "2026-10-04", {
      experimentKey: "test",
      completed: true,
      rating: 8,
    }, 6),
    entry("period", "2026-10-04", { symptoms: "cramps" }, 7),
  ];
  const insights = buildWellnessInsights(entries, 7, "2026-10-05", true);
  assert.equal(insights.activity.averageSteps, null);
  assert.equal(insights.nutrition.averageCalories, null);
  assert.equal(insights.sleep.averageMinutes, null);
  assert.equal(insights.sleep.bedtimeVariationMinutes, null);
  assert.equal(insights.energy.averageLevel, null);
  assert.equal(insights.feelings.mostLogged, null);
  assert.equal(insights.experiments.checkins, 0);
  assert.equal(insights.period?.loggedStarts, 0);
  assert.ok(insights.series.activity.every((point) => point.value === null));
});
