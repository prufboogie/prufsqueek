-- CreateTable
CREATE TABLE "run_scores" (
    "id" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "guest" BOOLEAN NOT NULL DEFAULT true,
    "token_id" INTEGER,
    "score" INTEGER NOT NULL,
    "distance" INTEGER NOT NULL,
    "coins" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "run_scores_seed_key" ON "run_scores"("seed");

-- CreateIndex
CREATE INDEX "run_scores_score_idx" ON "run_scores"("score");

-- CreateIndex
CREATE INDEX "run_scores_created_at_idx" ON "run_scores"("created_at");
