# 🍉 BeCozy

Cozy hand-gesture party games for up to 4 players, played with just a webcam.
Built with React + Vite + MediaPipe. Live: https://jasonllanes.github.io/BeCozy/

## Run locally

```bash
npm install        # also copies the MediaPipe WASM and downloads the hand/face models
cp .env.example .env   # then fill in your Supabase values
npm run dev
```

## Supabase leaderboard (optional)

The global leaderboard uses one table, `public.becozy_scores`, prefixed so it can live in an existing project.

1. Supabase Dashboard → **SQL Editor** → paste and run
   [`supabase/migrations/20261110120000_create_becozy_scores.sql`](supabase/migrations/20261110120000_create_becozy_scores.sql)
2. Put your project URL and publishable key in `.env`:
   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_...
   ```

Without these variables the game works normally; the leaderboard just switches itself off.

Row Level Security allows anyone to **read** and **insert** scores, and nobody to update or delete from the client.
Column `CHECK` constraints cap name length and score range. Because scores are posted from the browser, a determined
person could still submit fake ones – fine for a friendly game night, not for prizes.

## Deploy (GitHub Pages)

Pushing to `main` builds and deploys via `.github/workflows/deploy.yml`.

1. Repo **Settings → Pages → Source: GitHub Actions**
2. Repo **Settings → Secrets and variables → Actions → New repository secret**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

## Online multiplayer (Fruit Ninja)

**Setup screen → 🌐 Play online.** One player creates a room and shares the 4-letter code or invite link
(`…/BeCozy/?room=ABCD`); up to 4 players join.

- **Lobby:** seats, ready-up, and the **host's room rules** (mode, difficulty, round length, bombs, power-ups, blade trail).
- **Avatars:** pick a generated body (🎲 shuffle for more); **your live camera is the head**. Camera sharing can be switched off per player (emoji face instead).
- **Gestures:** everyone chooses their own (point, fist, nose, or a recorded one).
- **Fair play:** every player runs their own board on their own machine, with the *same* fruit sequence (shared seed). A live scoreboard shows everyone's avatar, score and hearts. The round's high scorer can post their name to the leaderboard.

How it works: Supabase Realtime (broadcast + presence) handles rooms, settings, scores and WebRTC signalling;
WebRTC (peer-to-peer) carries only the small camera streams. No extra tables are needed.

Requirements: Realtime enabled on the Supabase project (it is by default; public channels must be allowed).
Optional: set `VITE_TURN_URL` / `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL` for a TURN relay if video won't connect on strict networks;
without it the game still works and heads fall back to emoji faces.
