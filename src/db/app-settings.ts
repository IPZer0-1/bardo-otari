import pool from "./client";

export interface AppSetting {
  value: string;
  updated_at: Date;
  updated_by_email: string | null;
}

export async function getAppSetting(key: string): Promise<AppSetting | null> {
  const { rows } = await pool.query<AppSetting>(
    `SELECT s.value, s.updated_at, u.email AS updated_by_email
     FROM app_settings s
     LEFT JOIN users u ON u.id = s.updated_by
     WHERE s.key = $1`,
    [key],
  );
  return rows[0] ?? null;
}

export async function setAppSetting(key: string, value: string, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at, updated_by)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [key, value, userId],
  );
}
