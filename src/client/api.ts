export class ApiError extends Error {
  constructor(public code: string, public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export async function api<T = any>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init?.signal,
      credentials: "same-origin",
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError("network", 0, "Can't reach the district. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { error, message, ...extra } = data as { error?: string; message?: string };
    throw new ApiError(error ?? "error", res.status, message ?? "Something went wrong.", extra);
  }
  return data as T;
}

export const newRequestKey = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};
