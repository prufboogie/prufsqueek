import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BADGES, RULES, THEMES, TIERS, capacityFor, describeRules } from "@/shared/rules";
import snapshot from "@/server/deployment-snapshot.json";

export const metadata: Metadata = { title: "Field manual", description: "How The Last District works: shelters, stacking, supply drops and the verifiable draw." };

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="plate plate-bolts scroll-mt-24 p-6">
      <h2 className="stencil mb-3 text-2xl text-hazard">{title}</h2>
      <div className="space-y-3 text-[0.95rem] leading-relaxed text-bone-dim [&_b]:text-bone">{children}</div>
    </section>
  );
}

export default function Manual() {
  const nft = snapshot.contracts.SqueekNFT.address;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="eyebrow">Issued to every arrival</p>
        <h1 className="stencil text-5xl sm:text-6xl">Field manual</h1>
        <p className="mt-3 max-w-2xl text-bone-dim">Nobody remembers exactly when the lights went out. What&apos;s left of the city is ruins above and tunnels below. The Last District is one of the few places still organised: shelters dug under the streets, people looking after each other, and the planes that still come over every few days with supplies for whoever is ready.</p>
        <nav className="mt-4 flex flex-wrap gap-2 font-mono text-xs">
          {[["survivors", "Survivors"], ["shelters", "Shelters"], ["stacking", "Stacking"], ["drops", "Supply drops"], ["fairness", "The draw"], ["progress", "Progression"], ["accounts", "Shelter accounts"], ["data", "Data & limits"]].map(([id, l]) => <a key={id} href={`#${id}`} className="chip hover:text-hazard">{l}</a>)}
        </nav>
      </header>

      <Section id="survivors" title="Survivors">
        <p>Your Survivors are your <b>Squeeks</b>, the Genesis collection on Sepolia (SqueekNFT <span className="break-all font-mono text-xs">{nft}</span>). A Squeek counts whether it sits in your wallet or is deposited in SqueekStaking: the game reads the depositor. Nothing is ever transferred, burned, staked or locked to play, and the game never asks you to sign a transaction.</p>
        <p>Name, art, traits and level are the official on-chain data from <span className="font-mono text-xs">tokenURI</span> and <span className="font-mono text-xs">level()</span>. Anything the game adds, like days sheltered or drops counted, is shown as a <b>game stat</b>, never as an NFT property.</p>
        <p>If a Squeek leaves your wallet, or is burned as the donor in a merge, it leaves its shelter the next time the game checks: when you open your roster, when you change that shelter, or at the next snapshot.</p>
      </Section>

      <Section id="shelters" title="Shelters">
        <p>A shelter is led by one <b>primary</b> Survivor. The primary&apos;s level sets the beds, and the beds include the primary: <b>beds = {RULES.baseCapacity} + level</b>.</p>
        <div className="thin-scrollbar overflow-x-auto">
          <table className="w-full min-w-[480px] text-center font-mono text-sm">
            <thead><tr className="text-bone-mute"><th className="py-1 text-left font-normal">Primary level</th>{Array.from({ length: 10 }, (_, i) => <th key={i} className="font-normal">{i + 1}</th>)}</tr></thead>
            <tbody><tr className="text-bone"><td className="py-1 text-left text-bone-mute">Beds</td>{Array.from({ length: 10 }, (_, i) => <td key={i}>{capacityFor(i + 1)}</td>)}</tr></tbody>
          </table>
        </div>
        <p>You can run up to <b>{RULES.maxShelters} shelters</b>. The primary can&apos;t be moved; disband the shelter to free it. If the primary leaves your wallet, the shelter is abandoned and everyone inside is freed. Names are {RULES.nameMin}–{RULES.nameMax} characters.</p>
      </Section>

      <Section id="stacking" title="Stacking">
        <p>Placing a Survivor in a shelter runs these checks in order, on the server: you hold the Survivor right now (a fresh Sepolia read), you still hold the shelter&apos;s primary, the Survivor isn&apos;t already in another shelter, the shelter has a free bed, then the move is written and recorded. One Survivor can only ever be in one shelter; the database enforces it too.</p>
        <p>Moving between your own shelters is allowed once a Survivor has been in place for <b>{RULES.moveCooldownMinutes} minutes</b>.</p>
      </Section>

      <Section id="drops" title="Supply drops">
        <p>A drop is scheduled every <b>{RULES.dropIntervalHours / 24} days</b>. It opens, runs until its <b>snapshot</b>, and is then drawn. The default rules:</p>
        <ul className="list-inside list-disc space-y-1 marker:text-hazard">{describeRules({ minSurvivors: RULES.defaultMinSurvivors, minResidencyHours: RULES.defaultMinResidencyHours, ticketRule: "PER_SURVIVOR", maxWinsPerPlayer: 1 }).map((t) => <li key={t}>{t}</li>)}</ul>
        <p>Each drop page shows its own rules. Rules can change only before a drop opens; once it opens they are locked. There are no hidden multipliers, and nothing you earn in the game changes your odds.</p>
        <p>Rewards a draw couldn&apos;t hand out, because too few shelters qualified, go back to the vault. Winners have <b>{RULES.claimDays} days</b> to claim.</p>
      </Section>

      <Section id="fairness" title="How the draw works">
        <ol className="list-inside list-decimal space-y-1.5 marker:text-hazard">
          <li>When a drop is created, the server picks a secret 32-byte <b>seed</b> and publishes its keccak256 hash. The hash can&apos;t change afterwards.</li>
          <li>At the snapshot, every qualifying shelter and its ticket count is frozen and hashed. The list and the hash are published on the drop page.</li>
          <li>The snapshot also names a Sepolia block {RULES.entropyDelayBlocks} blocks in the future. Nobody knows its hash yet.</li>
          <li>Once that block has {RULES.entropyConfirmations} confirmations: <span className="font-mono text-xs">randomness = keccak256(seed ‖ blockHash ‖ snapshotHash)</span>. Slot <i>i</i> picks ticket <span className="font-mono text-xs">keccak256(randomness ‖ i) mod remainingTickets</span>. A winning shelter leaves the pool.</li>
          <li>The seed is revealed. Anyone can press <b>Verify this draw</b> on the drop page, which re-runs the same code in the browser.</li>
        </ol>
        <p><b>What this guarantees:</b> the server can&apos;t pick the seed after seeing the block, and can&apos;t change the snapshot after it&apos;s published. <b>What it doesn&apos;t:</b> it isn&apos;t on-chain randomness (no VRF is used). The operator could refuse to reveal a seed, which would be visible, and a Sepolia block producer could in theory influence a block hash. For a testnet MVP with test rewards that&apos;s a reasonable trade; real-value rewards should move to an on-chain VRF.</p>
      </Section>

      <Section id="progress" title="Progression">
        <p>Shelters earn <b>development points</b> only from drops: 10 for each drop they qualify for, plus 1 per Survivor counted. Points unlock fit-outs:</p>
        <ul className="grid gap-2 sm:grid-cols-2">{TIERS.map((t) => <li key={t.tier} className="rounded-[3px] border border-ash-700 px-3 py-2"><b>Tier {t.tier} · {t.name}</b> <span className="font-mono text-xs text-bone-mute">({t.minXp}+ pts)</span><span className="block text-xs">{THEMES[t.theme].name}: {THEMES[t.theme].blurb}</span></li>)}</ul>
        <p>Badges: {Object.values(BADGES).map((b) => b.name).join(", ")}. Each one unlocks a profile title. All of it is cosmetic: no pay-to-win, and no effect on eligibility or odds.</p>
      </Section>

      <Section id="accounts" title="Shelter accounts (ERC-6551)">
        <p>Each shelter shows the <b>token-bound account</b> address of its primary Squeek, computed from the canonical ERC-6551 registry (<span className="font-mono text-xs">0x000000006551c19487814612e58FE06813775758</span>) and the Tokenbound v3 account proxy, both deployed on Sepolia. The account is <b>not deployed</b> by the game. Shelter state stays off-chain for now so play costs no gas; the address is where partner NFTs or shelter assets can live later, controlled by whoever holds the primary.</p>
      </Section>

      <Section id="data" title="Data & limits">
        <p>Contract addresses come from the published deployment record (release <span className="font-mono text-xs">{snapshot.release}</span>) and are checked against the chain: network, bytecode hash and SqueekCore binding. The official Squeekchain API lists a wallet&apos;s Squeeks quickly; anything that decides who gets what re-reads ownership from the contracts.</p>
        <p>This is a <b>community-built</b> game, not an official Squeekchain product, running against the <b>Sepolia testnet</b>. Rewards marked Demo are test rewards with no value. No partner is shown unless a partnership has been confirmed.</p>
        <p><Link href="/" className="link">Back to the district</Link></p>
      </Section>
    </div>
  );
}
