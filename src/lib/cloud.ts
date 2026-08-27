import { Session, SupabaseClient, createClient } from '@supabase/supabase-js';

/**
 * The cloud is optional. With no Supabase keys the app behaves exactly as it
 * always has — everything in this browser, no account, no network — so a
 * checkout with an empty .env still runs.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Google sends the session back in the URL fragment on return.
        detectSessionInUrl: true,
      },
    })
  : null;

export const cloudinaryCloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;

/** Where Google should send people back to after consenting. */
function redirectTo(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error('Cloud accounts are not configured in this build.');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectTo() },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

/**
 * Removes the account and everything in it. The row for each table cascades
 * from auth.users, so one call takes the lot; the RPC runs as the definer and
 * only ever deletes the caller.
 */
export async function deleteAccount(): Promise<void> {
  if (!supabase) throw new Error('Cloud accounts are not configured in this build.');
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await supabase.auth.signOut();
}

export function currentUserId(session: Session | null): string | null {
  return session?.user.id ?? null;
}

/**
 * The access token the server needs to know who is calling. Read fresh rather
 * than cached: it rotates roughly hourly.
 */
export async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Asks the project which providers are switched on.
 *
 * Without this the Google button would bounce people to a raw Supabase error
 * page whenever the provider has not been configured yet — a button that
 * looks alive and leads nowhere useful.
 */
export async function googleSignInAvailable(): Promise<boolean> {
  if (!cloudConfigured) return false;
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey as string },
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) return false;
    const settings = (await response.json()) as { external?: Record<string, boolean> };
    return Boolean(settings.external?.google);
  } catch {
    // Offline, or the project is unreachable: let the button try anyway rather
    // than locking someone out over a flaky network.
    return true;
  }
}
