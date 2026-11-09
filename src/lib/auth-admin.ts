import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import pool from "@/db/client";

export interface AdminUser {
  id: string;
  email: string;
}

// Gate server-side para rutas /admin/* y /api/admin/*. Si no hay sesión o el
// usuario no tiene is_admin=true, llama notFound() para que la respuesta sea
// 404 (decisión D2 del plan: no revelar la existencia del panel a quien no
// tenga acceso).
//
// Lanzar notFound() en App Router interrumpe el render y devuelve la página
// not-found.tsx más cercana — funciona igual desde un layout o page server
// component y desde una Route Handler.
export async function requireAdmin(): Promise<AdminUser> {
  const session = await auth();
  if (!session?.user?.id) {
    notFound();
  }

  const { rows } = await pool.query(
    "SELECT id, email, is_admin FROM users WHERE id = $1",
    [session.user.id],
  );
  const user = rows[0];
  if (!user || !user.is_admin) {
    notFound();
  }

  return { id: user.id, email: user.email };
}
