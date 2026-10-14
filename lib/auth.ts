import { cookies } from "next/headers";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

export const SESSION_COOKIE = "teamflow_session";

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const apiUrl = process.env.AUTH_API_URL ?? "http://localhost:4000";
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/auth/me`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`Authentication service returned ${response.status}.`);
  }
  const result = await response.json() as { user: CurrentUser };
  return result.user;
}
