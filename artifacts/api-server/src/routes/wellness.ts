import { getAuth } from "@clerk/express";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  profilesTable,
  wellnessEntriesTable,
  type WellnessEntry,
} from "@workspace/db";
import {
  DeleteWellnessEntryParams,
  ListWellnessEntriesQueryParams,
  ListWellnessEntriesResponse,
  UpsertWellnessEntryBody,
  UpsertWellnessEntryResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

type EntryKind =
  | "steps"
  | "calories"
  | "sleep"
  | "energy"
  | "feeling"
  | "experiment"
  | "experiment-checkin"
  | "period";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedInteger(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function boundedString(value: unknown, min: number, max: number) {
  return typeof value === "string" && value.trim().length >= min && value.length <= max;
}

function validTime(value: unknown) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseQueryDate(value: unknown): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !validCalendarDate(value)) return new Date(Number.NaN);
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOnly(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return value;
}

function normalizeEntryDataDates(kind: EntryKind, value: unknown) {
  if (!isRecord(value)) return value;
  if (kind === "experiment") {
    return {
      ...value,
      startedAt: dateOnly(value.startedAt),
      endedAt: value.endedAt === undefined ? undefined : dateOnly(value.endedAt),
    };
  }
  if (kind === "period") {
    return {
      ...value,
      startDate: dateOnly(value.startDate),
      endDate: value.endDate === undefined ? undefined : dateOnly(value.endDate),
    };
  }
  return value;
}

function dataMatchesKind(kind: EntryKind, value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  switch (kind) {
    case "steps":
      return boundedInteger(value.count, 0, 150_000);
    case "calories":
      return boundedInteger(value.count, 0, 20_000);
    case "sleep":
      return validTime(value.bedtime) && validTime(value.wakeTime) &&
        boundedInteger(value.durationMinutes, 0, 1_440) &&
        boundedInteger(value.quality, 1, 5) &&
        (value.napMinutes === undefined || boundedInteger(value.napMinutes, 0, 600)) &&
        (value.referenceTargetMinutes === undefined || boundedInteger(value.referenceTargetMinutes, 180, 720));
    case "energy":
      return [10, 30, 50, 70, 90].includes(Number(value.level)) &&
        boundedString(value.action, 1, 160) && typeof value.completed === "boolean";
    case "feeling":
      return ["tired", "stressed", "low mood", "energetic", "bloated", "headache", "poor focus", "good", "other"].includes(String(value.feeling)) &&
        boundedInteger(value.intensity, 1, 10) &&
        (value.note === undefined || boundedString(value.note, 0, 1_000));
    case "experiment":
      return boundedString(value.title, 1, 120) &&
        boundedString(value.goal, 1, 500) &&
        boundedInteger(value.durationDays, 1, 90) &&
        Array.isArray(value.metrics) && value.metrics.length >= 1 && value.metrics.length <= 8 &&
        value.metrics.every((metric) => boundedString(metric, 1, 80)) &&
        ["active", "paused", "completed", "cancelled"].includes(String(value.status)) &&
        validCalendarDate(value.startedAt) &&
        (value.endedAt === undefined || validCalendarDate(value.endedAt));
    case "experiment-checkin":
      return boundedString(value.experimentKey, 1, 120) &&
        typeof value.completed === "boolean" &&
        boundedInteger(value.rating, 1, 5) &&
        (value.note === undefined || boundedString(value.note, 0, 1_000));
    case "period":
      return validCalendarDate(value.startDate) &&
        (value.endDate === undefined || validCalendarDate(value.endDate)) &&
        (value.cycleLength === undefined || boundedInteger(value.cycleLength, 15, 90)) &&
        (value.flow === undefined || boundedString(value.flow, 0, 120)) &&
        (value.symptoms === undefined || (Array.isArray(value.symptoms) &&
          value.symptoms.length <= 20 && value.symptoms.every((symptom) => boundedString(symptom, 0, 80)))) &&
        (value.mood === undefined || boundedString(value.mood, 0, 80)) &&
        (value.notes === undefined || boundedString(value.notes, 0, 1_000)) &&
        (value.endDate === undefined || String(value.endDate) >= String(value.startDate));
  }
}

function toApiEntry(entry: WellnessEntry) {
  return {
    id: entry.id,
    key: entry.entryKey,
    kind: entry.kind,
    date: entry.entryDate,
    data: entry.data,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function serializeParsedEntry(entry: {
  id: number;
  key: string;
  kind: EntryKind;
  date: Date;
  data: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...entry,
    date: entry.date.toISOString().slice(0, 10),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

router.get("/wellness/entries", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }

  const parsed = ListWellnessEntriesQueryParams.safeParse({
    ...req.query,
    from: parseQueryDate(req.query.from),
    to: parseQueryDate(req.query.to),
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Use valid dates and wellness entry filters." });
    return;
  }
  const from = parsed.data.from?.toISOString().slice(0, 10);
  const to = parsed.data.to?.toISOString().slice(0, 10);
  if ((from && !validCalendarDate(from)) || (to && !validCalendarDate(to)) || (from && to && from > to)) {
    res.status(400).json({ error: "The selected date range is invalid." });
    return;
  }

  const profile = await db
    .select({ sex: profilesTable.sex })
    .from(profilesTable)
    .where(eq(profilesTable.clerkUserId, userId))
    .limit(1);
  if (parsed.data.kind === "period" && profile[0]?.sex !== "female") {
    res.status(403).json({ error: "This entry is not available for this profile." });
    return;
  }

  const filters = [eq(wellnessEntriesTable.clerkUserId, userId)];
  if (from) filters.push(gte(wellnessEntriesTable.entryDate, from));
  if (to) filters.push(lte(wellnessEntriesTable.entryDate, to));
  if (parsed.data.kind) filters.push(eq(wellnessEntriesTable.kind, parsed.data.kind));
  const rows = await db
    .select()
    .from(wellnessEntriesTable)
    .where(and(...filters))
    .orderBy(asc(wellnessEntriesTable.entryDate), asc(wellnessEntriesTable.id));
  const visibleRows = profile[0]?.sex === "female"
    ? rows
    : rows.filter((entry) => entry.kind !== "period");
  const response = ListWellnessEntriesResponse.parse({ entries: visibleRows.map(toApiEntry) });
  res.json({ entries: response.entries.map(serializeParsedEntry) });
});

router.put("/wellness/entries", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }

  const parsed = UpsertWellnessEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check this entry and try again." });
    return;
  }

  const date = parsed.data.date.toISOString().slice(0, 10);
  if (!validCalendarDate(date)) {
    res.status(400).json({ error: "Enter a valid calendar date." });
    return;
  }
  const normalizedData = normalizeEntryDataDates(parsed.data.kind, parsed.data.data);
  if (!dataMatchesKind(parsed.data.kind, normalizedData)) {
    res.status(400).json({ error: "Check this entry and try again." });
    return;
  }
  const entryData = normalizedData;

  if (parsed.data.kind === "period") {
    const [profile] = await db
      .select({ sex: profilesTable.sex })
      .from(profilesTable)
      .where(eq(profilesTable.clerkUserId, userId))
      .limit(1);
    if (profile?.sex !== "female") {
      res.status(403).json({ error: "This entry is not available for this profile." });
      return;
    }
  }

  if (parsed.data.kind === "experiment-checkin") {
    const experimentKey = String(entryData.experimentKey);
    const [experiment] = await db
      .select({ entryKey: wellnessEntriesTable.entryKey })
      .from(wellnessEntriesTable)
      .where(and(
        eq(wellnessEntriesTable.clerkUserId, userId),
        eq(wellnessEntriesTable.entryKey, experimentKey),
        eq(wellnessEntriesTable.kind, "experiment"),
      ))
      .limit(1);
    if (!experiment) {
      res.status(404).json({ error: "That experiment could not be found." });
      return;
    }
  }

  const [entry] = await db
    .insert(wellnessEntriesTable)
    .values({
      clerkUserId: userId,
      entryKey: parsed.data.key,
      kind: parsed.data.kind,
      entryDate: date,
      data: entryData,
    })
    .onConflictDoUpdate({
      target: [wellnessEntriesTable.clerkUserId, wellnessEntriesTable.entryKey],
      set: {
        kind: parsed.data.kind,
        entryDate: date,
        data: entryData,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json(serializeParsedEntry(UpsertWellnessEntryResponse.parse(toApiEntry(entry))));
});

router.delete("/wellness/entries/:entryKey", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }
  const params = DeleteWellnessEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "That entry key is invalid." });
    return;
  }
  const [entry] = await db
    .delete(wellnessEntriesTable)
    .where(and(
      eq(wellnessEntriesTable.clerkUserId, userId),
      eq(wellnessEntriesTable.entryKey, params.data.entryKey),
    ))
    .returning({ kind: wellnessEntriesTable.kind });
  if (!entry) {
    res.status(404).json({ error: "Entry not found." });
    return;
  }
  res.sendStatus(204);
});

export default router;