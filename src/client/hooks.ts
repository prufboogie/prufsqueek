"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, ApiError } from "./api";
import { toast } from "./store";
import type { Me } from "./types";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/api/me"), staleTime: 30_000 });
}

export function useApi<T>(path: string | null, opts: { refetchInterval?: number } = {}) {
  return useQuery({ queryKey: [path], queryFn: () => api<T>(path!), enabled: Boolean(path), refetchInterval: opts.refetchInterval, retry: (n, e) => n < 1 && !(e instanceof ApiError && e.status < 500) });
}

/** A write that refreshes everything afterwards and reports the outcome as a toast. */
export function useAction<I, O = unknown>(fn: (input: I) => Promise<O>, opts: { success?: (o: O, i: I) => string | null; onDone?: (o: O) => void } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (o, i) => {
      const msg = opts.success?.(o, i);
      if (msg) toast({ kind: "ok", title: msg });
      opts.onDone?.(o);
      void qc.invalidateQueries();
    },
    onError: (e) => toast({ kind: "error", title: e instanceof ApiError ? e.message : "That didn't work." }),
  });
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
