// Global leaderboard backed by Supabase (table: public.becozy_scores).
// The client is loaded lazily so the menus stay light, and the whole feature
// switches itself off if the env vars are missing.
const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const leaderboardEnabled = Boolean(URL && KEY);
export const supabaseEnabled = leaderboardEnabled;

const TABLE = 'becozy_scores';
let clientPromise = null;

/** Shared lazy Supabase client (leaderboard + online rooms). */
export function getSupabase() {
  return client();
}

function client() {
  clientPromise ||= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } }),
  );
  return clientPromise;
}

function friendly(error) {
  if (error?.code === 'PGRST205' || /relation .* does not exist|schema cache/i.test(error?.message || '')) {
    return 'The leaderboard table is missing. Run the SQL migration in supabase/migrations first.';
  }
  return error?.message || 'Could not reach the leaderboard.';
}

/** rows: [{ game_id, mode, difficulty, duration_s, player_name, score, ... }] */
export async function submitScores(rows) {
  const { error } = await (await client()).from(TABLE).insert(rows);
  if (error) throw new Error(friendly(error));
}

export async function fetchTop({ gameId, mode, difficulty, duration, limit = 20 }) {
  let q = (await client())
    .from(TABLE)
    .select('id, created_at, player_name, score, survived_s, sliced, gesture, players')
    .eq('game_id', gameId)
    .eq('mode', mode)
    .eq('difficulty', difficulty);
  q = duration ? q.eq('duration_s', duration) : q.is('duration_s', null);
  const { data, error } = await q.order('score', { ascending: false }).order('created_at', { ascending: true }).limit(limit);
  if (error) throw new Error(friendly(error));
  return data;
}
