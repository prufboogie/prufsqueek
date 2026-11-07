"use client";
import { useParams } from "next/navigation";
import { useApi } from "@/client/hooks";
import type { PublicProfile } from "@/client/types";
import { ProfileView } from "@/components/ProfileView";
import { ErrorBox, Loading } from "@/components/ui";

export default function PlayerPage() {
  const { address } = useParams<{ address: string }>();
  const { data, error, isLoading, refetch } = useApi<PublicProfile>(`/api/players/${address}`);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} retry={() => refetch()} />;
  return <ProfileView p={data} />;
}
