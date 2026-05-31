-- CreateIndex
CREATE INDEX "sessions_user_id_status_ended_at_idx" ON "sessions"("user_id", "status", "ended_at");
