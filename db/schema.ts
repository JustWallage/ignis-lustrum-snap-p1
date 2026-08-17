import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    salt: text("salt").notNull(),
    avatarUpdatedAt: integer("avatar_updated_at", { mode: "timestamp" }),
    avatarKey: text("avatar_key"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    uniqueIndex("users_name_idx").on(t.name),
    uniqueIndex("users_avatar_key_idx").on(t.avatarKey),
  ],
);

export const avatarSprites = sqliteTable(
  "avatar_sprites",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    key: text("key").notNull(),
    contentType: text("content_type").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    uniqueIndex("avatar_sprites_key_idx").on(t.key),
    index("avatar_sprites_user_idx").on(t.userId),
  ],
);

export const avatarGenerations = sqliteTable(
  "avatar_generations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    day: integer("day").notNull(),
    used: integer("used").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [uniqueIndex("avatar_generations_user_day_idx").on(t.userId, t.day)],
);

export const photos = sqliteTable(
  "photos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    r2Key: text("r2_key"),
    contentType: text("content_type").notNull(),
    day: integer("day").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    index("photos_day_idx").on(t.day),
    uniqueIndex("photos_user_day_idx").on(t.userId, t.day),
  ],
);

export const retiredPhotos = sqliteTable(
  "retired_photos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // NOT `.references(() => photos.id)`: D1 enforces foreign keys and the `photos`
    // row dies in the same batch that writes this one, so a real reference makes
    // every retirement fail.
    photoId: integer("photo_id").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    day: integer("day").notNull(),
    r2Key: text("r2_key"),
    contentType: text("content_type").notNull(),
    retiredAt: integer("retired_at", { mode: "timestamp" }).notNull(),
    retiredBy: integer("retired_by")
      .notNull()
      .references(() => users.id),
  },
  (t) => [
    index("retired_photos_day_idx").on(t.day),
    uniqueIndex("retired_photos_key_idx").on(t.r2Key),
  ],
);

export const photoScores = sqliteTable(
  "photo_scores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    photoId: integer("photo_id")
      .notNull()
      .references(() => photos.id),
    aiScore: real("ai_score").notNull(),
    critique: text("critique").notNull(),
    bonusDetected: integer("bonus_detected", { mode: "boolean" }).notNull(),
    bonusReason: text("bonus_reason").notNull(),
    aiStatus: text("ai_status", { enum: ["ok", "failed"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [uniqueIndex("photo_scores_photo_idx").on(t.photoId)],
);

export const dayRankings = sqliteTable(
  "day_rankings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    day: integer("day").notNull(),
    runStamp: integer("run_stamp").notNull(),
    status: text("status", { enum: ["ok", "failed"] }).notNull(),
    ranAt: integer("ran_at", { mode: "timestamp" }),
  },
  (t) => [uniqueIndex("day_rankings_day_idx").on(t.day)],
);

export const photoDescriptions = sqliteTable(
  "photo_descriptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    photoId: integer("photo_id")
      .notNull()
      .references(() => photos.id),
    description: text("description").notNull(),
    status: text("status", { enum: ["ok", "failed"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [uniqueIndex("photo_descriptions_photo_idx").on(t.photoId)],
);

export const prizes = sqliteTable(
  "prizes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    label: text("label").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    prizeSet: text("prize_set", { enum: ["ordinary", "bowser"] })
      .notNull()
      .default("ordinary"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("prizes_order_idx").on(t.sortOrder)],
);

export const bowserDays = sqliteTable(
  "bowser_days",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    day: integer("day").notNull(),
    markedBy: integer("marked_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [uniqueIndex("bowser_days_day_idx").on(t.day)],
);

export const riggedDays = sqliteTable(
  "rigged_days",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    day: integer("day").notNull(),
    // NOT `.references(() => prizes.id)`: D1 enforces foreign keys, so a real reference
    // would make the manager's Delete fail on any prize some day is rigged to. A rig
    // naming a row that has gone is read as no rig at all.
    prizeId: integer("prize_id").notNull(),
    riggedBy: integer("rigged_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [uniqueIndex("rigged_days_day_idx").on(t.day)],
);

export const prizeAwards = sqliteTable(
  "prize_awards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    day: integer("day").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    prizeLabel: text("prize_label").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [uniqueIndex("prize_awards_day_idx").on(t.day)],
);

export const comments = sqliteTable(
  "comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    subjectType: text("subject_type", { enum: ["photo", "avatar"] }).notNull(),
    subjectId: integer("subject_id").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("comments_subject_idx").on(t.subjectType, t.subjectId)],
);

export const likes = sqliteTable(
  "likes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    photoId: integer("photo_id")
      .notNull()
      .references(() => photos.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [uniqueIndex("likes_photo_user_idx").on(t.photoId, t.userId)],
);

export const votes = sqliteTable(
  "votes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    voterId: integer("voter_id")
      .notNull()
      .references(() => users.id),
    photoId: integer("photo_id")
      .notNull()
      .references(() => photos.id),
    day: integer("day").notNull(),
    rank: integer("rank").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    uniqueIndex("votes_voter_day_rank_idx").on(t.voterId, t.day, t.rank),
    uniqueIndex("votes_voter_photo_day_idx").on(t.voterId, t.photoId, t.day),
  ],
);

export const gameState = sqliteTable("game_state", {
  id: integer("id").primaryKey(),
  day: integer("day").notNull().default(1),
  phase: text("phase").notNull().default("submission"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: integer("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type PhotoRow = typeof photos.$inferSelect;
export type NewPhotoRow = typeof photos.$inferInsert;
export type CommentRow = typeof comments.$inferSelect;
export type PrizeRow = typeof prizes.$inferSelect;
export type LikeRow = typeof likes.$inferSelect;
