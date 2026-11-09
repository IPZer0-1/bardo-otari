import Link from "next/link";
import { requireAdmin } from "@/lib/auth-admin";

export const metadata = {
  title: "Panel admin — Bardo",
};

const TABS = [
  { href: "/admin", label: "Métricas" },
  { href: "/admin/users", label: "Usuarios" },
  { href: "/admin/models", label: "Modelos" },
  { href: "/admin/health", label: "Salud técnica" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-cinzel text-lg text-amber-200">
            Bardo
          </Link>
          <span className="text-zinc-500 text-sm">Panel admin</span>
        </div>
        <div className="text-sm text-zinc-400">{admin.email}</div>
      </header>

      <div className="flex">
        <nav className="w-56 border-r border-zinc-800 min-h-[calc(100vh-65px)] py-4 px-2">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="block px-4 py-2 rounded text-sm text-zinc-300 hover:bg-zinc-900 hover:text-amber-200"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
