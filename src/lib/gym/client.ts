export async function api<T>(
  route: string,
  method = 'GET',
  body?: unknown
): Promise<T> {
  const res = await fetch('/api/gym/' + route, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    const error = new Error(data.error ?? 'Request failed') as Error & {
      status: number;
    };
    error.status = res.status;
    throw error;
  }
  return data;
}
