-- Sonic Heist accounts and leaderboard. Lives in its own schema because the database is shared with other apps.
-- The app connects as a role that can only EXECUTE these functions, so a connection string pulled from the APK can't read tables.
-- Run once as the database owner, for example in Neon's SQL Editor, after replacing CHOOSE_A_LONG_RANDOM_PASSWORD.
-- Then put the role's connection string in app/.env as EXPO_PUBLIC_DATABASE_URL (see app/.env.example).
CREATE ROLE sonic_heist_app LOGIN PASSWORD 'CHOOSE_A_LONG_RANDOM_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 50;
ALTER ROLE sonic_heist_app SET statement_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS sonic_heist;

CREATE TABLE IF NOT EXISTS sonic_heist.players (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  auth_salt TEXT NOT NULL,
  auth_hash TEXT NOT NULL,
  wallet_address TEXT NOT NULL UNIQUE,
  encrypted_key TEXT NOT NULL,
  failed_logins INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS players_username_lower ON sonic_heist.players (lower(username));

CREATE TABLE IF NOT EXISTS sonic_heist.sessions (
  token_hash TEXT PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES sonic_heist.players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sonic_heist.robs (
  loot_id BIGINT PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES sonic_heist.players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS robs_player ON sonic_heist.robs (player_id);

CREATE OR REPLACE FUNCTION sonic_heist.hash_text(p TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog
AS $$ SELECT encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;

CREATE OR REPLACE FUNCTION sonic_heist.new_session(p_player BIGINT) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = sonic_heist, pg_temp
AS $$
DECLARE v_token TEXT := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
BEGIN
  INSERT INTO sessions (token_hash, player_id) VALUES (hash_text(v_token), p_player);
  RETURN v_token;
END $$;

-- p_auth is derived from the password on the phone (PBKDF2), so the real password never reaches the database.
CREATE OR REPLACE FUNCTION sonic_heist.signup(p_username TEXT, p_auth TEXT, p_address TEXT, p_key TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = sonic_heist, pg_temp
AS $$
DECLARE v_salt TEXT := replace(gen_random_uuid()::text, '-', ''); v_id BIGINT;
BEGIN
  IF p_username !~ '^[A-Za-z0-9_]{3,20}$' THEN RETURN jsonb_build_object('error', 'BAD_USERNAME'); END IF;
  IF p_auth !~ '^[0-9a-f]{64}$' OR p_address !~ '^0x[0-9a-fA-F]{40}$' OR length(p_key) NOT BETWEEN 40 AND 400 THEN
    RETURN jsonb_build_object('error', 'BAD_REQUEST');
  END IF;
  IF EXISTS (SELECT 1 FROM players WHERE lower(username) = lower(p_username)) THEN RETURN jsonb_build_object('error', 'USERNAME_TAKEN'); END IF;
  IF EXISTS (SELECT 1 FROM players WHERE lower(wallet_address) = lower(p_address)) THEN RETURN jsonb_build_object('error', 'WALLET_TAKEN'); END IF;
  INSERT INTO players (username, auth_salt, auth_hash, wallet_address, encrypted_key)
  VALUES (p_username, v_salt, hash_text(v_salt || p_auth), p_address, p_key)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('token', new_session(v_id), 'username', p_username);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('error', 'USERNAME_TAKEN');
END $$;

CREATE OR REPLACE FUNCTION sonic_heist.login(p_username TEXT, p_auth TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = sonic_heist, pg_temp
AS $$
DECLARE v players%ROWTYPE; v_robs BIGINT;
BEGIN
  SELECT * INTO v FROM players WHERE lower(username) = lower(p_username);
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'BAD_LOGIN'); END IF;
  IF v.locked_until IS NOT NULL AND v.locked_until > now() THEN RETURN jsonb_build_object('error', 'LOCKED'); END IF;
  IF hash_text(v.auth_salt || p_auth) <> v.auth_hash THEN
    -- Returns instead of raising, because raising would roll this counter back.
    UPDATE players SET
      locked_until = CASE WHEN failed_logins + 1 >= 10 THEN now() + interval '15 minutes' END,
      failed_logins = CASE WHEN failed_logins + 1 >= 10 THEN 0 ELSE failed_logins + 1 END
    WHERE id = v.id;
    RETURN jsonb_build_object('error', 'BAD_LOGIN');
  END IF;
  UPDATE players SET failed_logins = 0, locked_until = NULL WHERE id = v.id;
  SELECT count(*) INTO v_robs FROM robs WHERE player_id = v.id;
  RETURN jsonb_build_object('token', new_session(v.id), 'username', v.username, 'address', v.wallet_address, 'key', v.encrypted_key, 'robs', v_robs);
END $$;

-- shortcut: trusts the logged-in phone that this loot was won; a modified app could claim robs. Check the loot on-chain if the board ever has stakes.
CREATE OR REPLACE FUNCTION sonic_heist.record_rob(p_token TEXT, p_loot_id BIGINT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = sonic_heist, pg_temp
AS $$
DECLARE v_player BIGINT;
BEGIN
  SELECT player_id INTO v_player FROM sessions WHERE token_hash = hash_text(p_token);
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'BAD_SESSION'); END IF;
  INSERT INTO robs (loot_id, player_id) VALUES (p_loot_id, v_player) ON CONFLICT (loot_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION sonic_heist.leaderboard(p_limit INT) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = sonic_heist, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
    SELECT p.username, count(r.loot_id) AS robs
    FROM players p LEFT JOIN robs r ON r.player_id = p.id
    GROUP BY p.id, p.username
    ORDER BY robs DESC, p.username ASC
    LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
  ) t
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA sonic_heist FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sonic_heist FROM PUBLIC;
GRANT USAGE ON SCHEMA sonic_heist TO sonic_heist_app;
GRANT EXECUTE ON FUNCTION sonic_heist.signup(TEXT, TEXT, TEXT, TEXT) TO sonic_heist_app;
GRANT EXECUTE ON FUNCTION sonic_heist.login(TEXT, TEXT) TO sonic_heist_app;
GRANT EXECUTE ON FUNCTION sonic_heist.record_rob(TEXT, BIGINT) TO sonic_heist_app;
GRANT EXECUTE ON FUNCTION sonic_heist.leaderboard(INT) TO sonic_heist_app;
