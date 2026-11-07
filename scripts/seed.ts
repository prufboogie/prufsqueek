/**
 * Seeds the vault with clearly labelled DEMO rewards and puts the first drop on the calendar.
 * No partners are created: a partner appears only when an admin adds one.
 */
import { db } from "../src/server/db";
import { ensureSchedule } from "../src/server/drops";

async function main() {
  const vault = await db.rewardVault.upsert({ where: { name: "District Vault" }, create: { name: "District Vault" }, update: {} });
  let campaign = await db.rewardCampaign.findFirst({ where: { title: "Field Test Crates", isDemo: true } });
  if (!campaign) {
    campaign = await db.rewardCampaign.create({
      data: {
        vaultId: vault.id, title: "Field Test Crates", isDemo: true, status: "ACTIVE",
        description: "Demo rewards for the test group. They exist to exercise the draw and the claim flow and have no value. No partner is involved.",
        requirements: "Own a qualifying shelter at the snapshot.",
      },
    });
    await db.reward.createMany({
      data: [
        { campaignId: campaign.id, kind: "COLLECTIBLE", title: "Demo: Survivor's Patch", description: "A demo collectible badge for your profile. No on-chain asset.", quantity: 3, isDemo: true },
        { campaignId: campaign.id, kind: "WHITELIST", title: "Demo: Whitelist voucher", description: "Stands in for a partner whitelist spot. Not redeemable anywhere.", quantity: 2, isDemo: true },
        { campaignId: campaign.id, kind: "FREE_MINT", title: "Demo: Free mint pass", description: "Stands in for a partner free mint. Not redeemable anywhere.", quantity: 1, isDemo: true },
      ],
    });
    console.log("Seeded demo campaign Field Test Crates");
  }
  const created = await ensureSchedule();
  const drop = created ?? (await db.supplyDrop.findFirst({ where: { status: { in: ["SCHEDULED", "OPEN"] } }, orderBy: { endsAt: "asc" } }));
  if (drop) {
    const n = await db.reward.updateMany({ where: { campaignId: campaign.id, status: "AVAILABLE" }, data: { dropId: drop.id, status: "ALLOCATED" } });
    if (n.count) console.log(`Allocated ${n.count} demo reward batches to ${drop.name}`);
  }
}

main().finally(() => db.$disconnect());
