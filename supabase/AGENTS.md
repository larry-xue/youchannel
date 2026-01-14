# SUPABASE KNOWLEDGE BASE

**Context:** Database migrations, RLS, and configuration.

## OVERVIEW

- **Location:** `supabase/`
- **Config:** `config.toml` (Port 54321, Shadow Port 54320).
- **Naming:** Tables use `snake_case` plural (e.g., `videos`, `video_analyses`).
- **Seed:** `seed.sql` used for local development, enabled in `config.toml`.

## MIGRATION STRATEGY

- **Format:** Timestamped files: `YYYYMMDDHHMMSS_description.sql`.
- **Location:** `supabase/migrations/`.
- **Flow:** `pnpm supabase db reset` to apply all migrations and seed.
- **Rules:**
  - Never edit applied migrations; create new ones.
  - Use `ALTER TABLE` for schema updates.
  - Include `DROP POLICY IF EXISTS` before `CREATE POLICY`.

## RLS PATTERNS

- **Mandatory:** RLS must be enabled for all tables.
- **Pattern:** User-owned data model (`auth.uid() = user_id`).
- **Direct Ownership:**
  ```sql
  CREATE POLICY "Users can manage own data" ON public.table
    FOR ALL USING (auth.uid() = user_id);
  ```
- **Relational Ownership:**
  ```sql
  CREATE POLICY "View via parent" ON public.child
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.parent
      WHERE parent.id = child.parent_id AND parent.user_id = auth.uid())
    );
  ```
- **Service Role:** Server-side functions use `service_role` to bypass RLS.
