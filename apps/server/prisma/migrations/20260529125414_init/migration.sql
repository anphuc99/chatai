-- CreateTable
CREATE TABLE "users_meta" (
    "user_id" TEXT NOT NULL,
    "tutorial_step" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_meta_pkey" PRIMARY KEY ("user_id")
);
