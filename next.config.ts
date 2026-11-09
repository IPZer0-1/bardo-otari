import type { NextConfig } from "next";

// Orígenes extra permitidos en `next dev` (p. ej. la IP del servidor),
// separados por comas. Vacío por defecto.
const allowedDevOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins,
  output: "standalone",
};

export default nextConfig;
