import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, profilesTable } from "@workspace/db";
import {
  GetMyProfileResponse,
  SaveMyProfileBody,
  SaveMyProfileResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function toApiProfile(
  profile: typeof profilesTable.$inferSelect,
): Record<string, unknown> {
  return {
    ...profile,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

router.get("/profiles/me", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }

  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.clerkUserId, userId))
    .limit(1);

  const response = {
    completed: Boolean(profile),
    profile: profile ? toApiProfile(profile) : null,
  };
  res.json(GetMyProfileResponse.parse(response));
});

router.put("/profiles/me", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }

  const parsed = SaveMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? "Check your profile details and try again.",
    });
    return;
  }

  const [profile] = await db
    .insert(profilesTable)
    .values({ clerkUserId: userId, ...parsed.data })
    .onConflictDoUpdate({
      target: profilesTable.clerkUserId,
      set: { ...parsed.data, updatedAt: new Date() },
    })
    .returning();

  res.json(SaveMyProfileResponse.parse(toApiProfile(profile)));
});

export default router;