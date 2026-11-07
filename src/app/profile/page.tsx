"use client";
import { useEffect, useState } from "react";
import { api } from "@/client/api";
import { useAction, useApi, useMe } from "@/client/hooks";
import type { PublicProfile } from "@/client/types";
import { ProfileView } from "@/components/ProfileView";
import { Gate } from "@/components/Shell";
import { ErrorBox, Loading, Panel } from "@/components/ui";

export default function ProfilePage() {
  return <Gate><Mine /></Gate>;
}

function Mine() {
  const { data: me } = useMe();
  const wallet = me?.signedIn ? me.wallet : null;
  const { data, error, isLoading, refetch } = useApi<PublicProfile>(wallet ? `/api/players/${wallet}` : null);
  if (isLoading || !data) return error ? <ErrorBox error={error} retry={() => refetch()} /> : <Loading />;
  return <ProfileView p={data} editor={<Editor p={data} />} />;
}

function Editor({ p }: { p: PublicProfile }) {
  const [callsign, setCallsign] = useState(p.callsign ?? "");
  const earned = p.badges.filter((b) => b.earnedAt);
  const current = earned.find((b) => b.name === p.title)?.key ?? "";
  const [title, setTitle] = useState(current);
  useEffect(() => setTitle(current), [current]);
  const save = useAction((input: { callsign: string; title: string | null }) => api("/api/me", { method: "PATCH", body: input }), { success: () => "Survivor file updated." });
  return (
    <Panel className="p-5">
      <form className="flex flex-wrap items-end gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate({ callsign: callsign.trim(), title: title || null }); }}>
        <label className="min-w-[12rem] flex-1"><span className="eyebrow mb-1.5 block">Callsign</span><input className="field" maxLength={24} placeholder="Shown instead of your address" value={callsign} onChange={(e) => setCallsign(e.target.value)} /></label>
        <label className="min-w-[12rem] flex-1"><span className="eyebrow mb-1.5 block">Title</span>
          <select className="field" value={title} onChange={(e) => setTitle(e.target.value)}>
            <option value="">No title</option>
            {earned.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}
          </select>
        </label>
        <button className="btn btn-hazard" disabled={save.isPending}>Save</button>
      </form>
      {earned.length === 0 && <p className="mt-2 text-xs text-bone-mute">Titles unlock as you earn badges.</p>}
    </Panel>
  );
}
