-- F1: enforce one message per (session, turnOrder) so concurrent turn-writes
-- surface as a hard error instead of silently corrupting conversation order.
DROP INDEX "messages_session_id_turn_order_idx";

-- CreateIndex
CREATE UNIQUE INDEX "messages_session_id_turn_order_key" ON "messages"("session_id", "turn_order");

-- F10: give users a starter gem balance so contextual/system shop purchases are
-- testable end-to-end (Postgres is the source of truth for the wallet).
ALTER TABLE "users_meta" ALTER COLUMN "gems" SET DEFAULT 100;
UPDATE "users_meta" SET "gems" = 100 WHERE "gems" = 0;
