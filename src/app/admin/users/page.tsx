import { getAdminUserActivity } from "@/lib/admin-users";
import UsersTable from "./UsersTable";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const rows = await getAdminUserActivity();

  return (
    <div>
      <h1 className="text-2xl font-cinzel text-amber-200 mb-2">Actividad por usuario</h1>
      <p className="text-sm text-zinc-500 mb-6">
        {rows.length} {rows.length === 1 ? "usuario" : "usuarios"}. Última actividad
        es la fecha más reciente en <code className="text-amber-200">usage_logs</code>{" "}
        (no incluye logins sin acción LLM). Monedas del mes calculadas en la TZ de
        cada usuario.
      </p>

      <UsersTable rows={rows} />
    </div>
  );
}
