-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SurvivorStatus" AS ENUM ('ACTIVE', 'GONE');

-- CreateEnum
CREATE TYPE "ShelterStatus" AS ENUM ('ACTIVE', 'ABANDONED');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('PRIMARY', 'RESIDENT');

-- CreateEnum
CREATE TYPE "DropStatus" AS ENUM ('SCHEDULED', 'OPEN', 'SNAPSHOT', 'DRAWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketRule" AS ENUM ('PER_SURVIVOR', 'FLAT');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "RewardKind" AS ENUM ('PARTNER_NFT', 'WHITELIST', 'FREE_MINT', 'COLLECTIBLE', 'ECOSYSTEM', 'OTHER');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('AVAILABLE', 'ALLOCATED', 'DISTRIBUTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DistributionStatus" AS ENUM ('ALLOCATED', 'CLAIMED', 'FULFILLED', 'VOID', 'EXPIRED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_nonces" (
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_nonces_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "player_profiles" (
    "user_id" TEXT NOT NULL,
    "callsign" TEXT,
    "title" TEXT,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "player_badges" (
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_badges_pkey" PRIMARY KEY ("user_id","key")
);

-- CreateTable
CREATE TABLE "survivors" (
    "token_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "image_uri" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,
    "status" "SurvivorStatus" NOT NULL DEFAULT 'ACTIVE',
    "holder" TEXT,
    "custody" TEXT,
    "checked_at" TIMESTAMP(3),
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survivors_pkey" PRIMARY KEY ("token_id")
);

-- CreateTable
CREATE TABLE "shelters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "primary_token_id" INTEGER NOT NULL,
    "status" "ShelterStatus" NOT NULL DEFAULT 'ACTIVE',
    "theme" TEXT NOT NULL DEFAULT 'bunker',
    "xp" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abandoned_at" TIMESTAMP(3),
    "abandon_reason" TEXT,

    CONSTRAINT "shelters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shelter_members" (
    "id" TEXT NOT NULL,
    "shelter_id" TEXT NOT NULL,
    "token_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shelter_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shelter_stays" (
    "id" TEXT NOT NULL,
    "shelter_id" TEXT NOT NULL,
    "token_id" INTEGER NOT NULL,
    "role" "MemberRole" NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL,
    "left_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,

    CONSTRAINT "shelter_stays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shelter_resources" (
    "shelter_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shelter_resources_pkey" PRIMARY KEY ("shelter_id","kind")
);

-- CreateTable
CREATE TABLE "supply_drops" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'standard',
    "status" "DropStatus" NOT NULL DEFAULT 'SCHEDULED',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "min_survivors" INTEGER NOT NULL DEFAULT 3,
    "min_residency_hours" INTEGER NOT NULL DEFAULT 12,
    "ticket_rule" "TicketRule" NOT NULL DEFAULT 'PER_SURVIVOR',
    "max_wins_per_player" INTEGER NOT NULL DEFAULT 1,
    "seed_hash" TEXT NOT NULL,
    "seed_sealed" TEXT NOT NULL,
    "seed" TEXT,
    "snapshot_at" TIMESTAMP(3),
    "snapshot_hash" TEXT,
    "snapshot_block" INTEGER,
    "total_tickets" INTEGER,
    "entropy_block" INTEGER,
    "entropy_block_hash" TEXT,
    "randomness" TEXT,
    "drawn_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL DEFAULT 'scheduler',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancel_reason" TEXT,

    CONSTRAINT "supply_drops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_drop_eligibility" (
    "id" TEXT NOT NULL,
    "drop_id" TEXT NOT NULL,
    "shelter_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "shelter_name" TEXT NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "tickets" INTEGER NOT NULL,
    "counted" INTEGER[],
    "excluded" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "ticket_start" INTEGER,

    CONSTRAINT "supply_drop_eligibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_vaults" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_vaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "description" TEXT,
    "status" "PartnerStatus" NOT NULL DEFAULT 'PROSPECT',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_campaigns" (
    "id" TEXT NOT NULL,
    "vault_id" TEXT NOT NULL,
    "partner_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "kind" "RewardKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "status" "RewardStatus" NOT NULL DEFAULT 'AVAILABLE',
    "drop_id" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_distributions" (
    "id" TEXT NOT NULL,
    "drop_id" TEXT NOT NULL,
    "reward_id" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "ticket" INTEGER NOT NULL,
    "shelter_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "status" "DistributionStatus" NOT NULL DEFAULT 'ALLOCATED',
    "claim_by" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "reward_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_claims" (
    "id" TEXT NOT NULL,
    "distribution_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilled_at" TIMESTAMP(3),
    "fulfilment_note" TEXT,

    CONSTRAINT "reward_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "user_id" TEXT,
    "shelter_id" TEXT,
    "token_id" INTEGER,
    "drop_id" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'player',
    "data" JSONB,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard_entries" (
    "board" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "user_id" TEXT,
    "shelter_id" TEXT,
    "label" TEXT NOT NULL,
    "wallet" TEXT,
    "value" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaderboard_entries_pkey" PRIMARY KEY ("board","rank")
);

-- CreateTable
CREATE TABLE "error_logs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scope" TEXT NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallets_address_key" ON "wallets"("address");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE INDEX "survivors_holder_idx" ON "survivors"("holder");

-- CreateIndex
CREATE INDEX "shelters_owner_id_status_idx" ON "shelters"("owner_id", "status");

-- CreateIndex
CREATE INDEX "shelters_status_idx" ON "shelters"("status");

-- CreateIndex
CREATE UNIQUE INDEX "shelter_members_token_id_key" ON "shelter_members"("token_id");

-- CreateIndex
CREATE INDEX "shelter_members_shelter_id_idx" ON "shelter_members"("shelter_id");

-- CreateIndex
CREATE INDEX "shelter_members_user_id_idx" ON "shelter_members"("user_id");

-- CreateIndex
CREATE INDEX "shelter_stays_token_id_idx" ON "shelter_stays"("token_id");

-- CreateIndex
CREATE INDEX "shelter_stays_shelter_id_idx" ON "shelter_stays"("shelter_id");

-- CreateIndex
CREATE UNIQUE INDEX "supply_drops_number_key" ON "supply_drops"("number");

-- CreateIndex
CREATE INDEX "supply_drops_status_ends_at_idx" ON "supply_drops"("status", "ends_at");

-- CreateIndex
CREATE INDEX "supply_drop_eligibility_user_id_idx" ON "supply_drop_eligibility"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "supply_drop_eligibility_drop_id_shelter_id_key" ON "supply_drop_eligibility"("drop_id", "shelter_id");

-- CreateIndex
CREATE UNIQUE INDEX "reward_vaults_name_key" ON "reward_vaults"("name");

-- CreateIndex
CREATE INDEX "rewards_drop_id_idx" ON "rewards"("drop_id");

-- CreateIndex
CREATE INDEX "reward_distributions_user_id_idx" ON "reward_distributions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "reward_distributions_drop_id_slot_key" ON "reward_distributions"("drop_id", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "reward_distributions_drop_id_shelter_id_key" ON "reward_distributions"("drop_id", "shelter_id");

-- CreateIndex
CREATE UNIQUE INDEX "reward_claims_distribution_id_key" ON "reward_claims"("distribution_id");

-- CreateIndex
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at");

-- CreateIndex
CREATE INDEX "activity_logs_user_id_created_at_idx" ON "activity_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_logs_shelter_id_created_at_idx" ON "activity_logs"("shelter_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_logs_token_id_created_at_idx" ON "activity_logs"("token_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_logs_kind_idx" ON "activity_logs"("kind");

-- CreateIndex
CREATE INDEX "error_logs_created_at_idx" ON "error_logs"("created_at");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_badges" ADD CONSTRAINT "player_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shelter_members" ADD CONSTRAINT "shelter_members_shelter_id_fkey" FOREIGN KEY ("shelter_id") REFERENCES "shelters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shelter_members" ADD CONSTRAINT "shelter_members_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "survivors"("token_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shelter_members" ADD CONSTRAINT "shelter_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shelter_stays" ADD CONSTRAINT "shelter_stays_shelter_id_fkey" FOREIGN KEY ("shelter_id") REFERENCES "shelters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shelter_stays" ADD CONSTRAINT "shelter_stays_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "survivors"("token_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shelter_resources" ADD CONSTRAINT "shelter_resources_shelter_id_fkey" FOREIGN KEY ("shelter_id") REFERENCES "shelters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_drop_eligibility" ADD CONSTRAINT "supply_drop_eligibility_drop_id_fkey" FOREIGN KEY ("drop_id") REFERENCES "supply_drops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_drop_eligibility" ADD CONSTRAINT "supply_drop_eligibility_shelter_id_fkey" FOREIGN KEY ("shelter_id") REFERENCES "shelters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_drop_eligibility" ADD CONSTRAINT "supply_drop_eligibility_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_campaigns" ADD CONSTRAINT "reward_campaigns_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "reward_vaults"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_campaigns" ADD CONSTRAINT "reward_campaigns_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "reward_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_drop_id_fkey" FOREIGN KEY ("drop_id") REFERENCES "supply_drops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_distributions" ADD CONSTRAINT "reward_distributions_drop_id_fkey" FOREIGN KEY ("drop_id") REFERENCES "supply_drops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_distributions" ADD CONSTRAINT "reward_distributions_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_distributions" ADD CONSTRAINT "reward_distributions_shelter_id_fkey" FOREIGN KEY ("shelter_id") REFERENCES "shelters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_distributions" ADD CONSTRAINT "reward_distributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_distribution_id_fkey" FOREIGN KEY ("distribution_id") REFERENCES "reward_distributions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_claims" ADD CONSTRAINT "reward_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_shelter_id_fkey" FOREIGN KEY ("shelter_id") REFERENCES "shelters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_drop_id_fkey" FOREIGN KEY ("drop_id") REFERENCES "supply_drops"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A Squeek can be the primary of at most one ACTIVE shelter. Abandoned shelters keep their history.
CREATE UNIQUE INDEX "shelters_active_primary_key" ON "shelters"("primary_token_id") WHERE "status" = 'ACTIVE';
-- At most one live drop window at a time: never two OPEN drops.
CREATE UNIQUE INDEX "supply_drops_one_open" ON "supply_drops"("status") WHERE "status" = 'OPEN';
