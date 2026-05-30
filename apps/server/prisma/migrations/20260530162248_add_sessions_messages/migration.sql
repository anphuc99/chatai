-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "summary" TEXT,
    "started_at" BIGINT NOT NULL,
    "ended_at" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "character_id" TEXT,
    "role" TEXT NOT NULL,
    "character_name" TEXT,
    "text" TEXT NOT NULL,
    "translation" TEXT,
    "emotion" TEXT,
    "intensity" TEXT,
    "words" JSONB,
    "shop_event" JSONB,
    "turn_order" INTEGER NOT NULL,
    "timestamp" BIGINT NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_user_id_story_id_status_idx" ON "sessions"("user_id", "story_id", "status");

-- CreateIndex
CREATE INDEX "sessions_story_id_status_idx" ON "sessions"("story_id", "status");

-- CreateIndex
CREATE INDEX "messages_session_id_turn_order_idx" ON "messages"("session_id", "turn_order");

-- CreateIndex
CREATE INDEX "messages_character_id_idx" ON "messages"("character_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users_meta"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
