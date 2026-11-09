"use client";

import { useMemo, useState } from "react";
import type { AdminUserRow } from "@/lib/admin-users";

type SortKey =
  | "email"
  | "created_at"
  | "last_activity_at"
  | "queries_total"
  | "gold_month"
  | "conversations_count"
  | "uploads_done"
  | "uploads_failed";

type SortDir = "asc" | "desc";

interface Column {
  key: SortKey;
  label: string;
  numeric?: boolean;
}

const COLUMNS: Column[] = [
  { key: "email", label: "Usuario" },
  { key: "created_at", label: "Registro" },
  { key: "last_activity_at", label: "Última actividad" },
  { key: "queries_total", label: "Queries", numeric: true },
  { key: "gold_month", label: "🪙 mes", numeric: true },
  { key: "conversations_count", label: "Convs", numeric: true },
  { key: "uploads_done", label: "Ingestas OK", numeric: true },
  { key: "uploads_failed", label: "Ingestas KO", numeric: true },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "ahora mismo";
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} días`;
  const m = Math.floor(d / 30);
  if (m < 12) return `hace ${m} meses`;
  return `hace ${Math.floor(m / 12)} años`;
}

export default function UsersTable({ rows }: { rows: AdminUserRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("last_activity_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];

      // null al final independientemente de la dirección
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;

      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // numéricos y fechas por defecto descendentes (más alto / más reciente primero)
      const col = COLUMNS.find((c) => c.key === key);
      const isDateOrNum =
        col?.numeric ||
        key === "created_at" ||
        key === "last_activity_at";
      setSortDir(isDateOrNum ? "desc" : "asc");
    }
  }

  function sortIndicator(key: SortKey): string {
    if (key !== sortKey) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 cursor-pointer select-none hover:text-amber-200 ${
                  col.numeric ? "text-right" : "text-left"
                }`}
                onClick={() => toggleSort(col.key)}
              >
                {col.label}
                {sortIndicator(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((u) => (
            <tr key={u.id} className="border-t border-zinc-800 hover:bg-zinc-900/50">
              <td className="px-4 py-3 text-zinc-200">
                <div className="flex items-center gap-2">
                  <span>{u.email}</span>
                  {u.is_admin && (
                    <span className="text-[10px] uppercase tracking-wide bg-amber-200/10 text-amber-200 px-1.5 py-0.5 rounded">
                      admin
                    </span>
                  )}
                </div>
                {u.name && (
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {u.name} · {u.timezone}
                  </div>
                )}
                {!u.name && (
                  <div className="text-xs text-zinc-500 mt-0.5">{u.timezone}</div>
                )}
              </td>
              <td className="px-4 py-3 text-zinc-400" title={u.created_at}>
                {formatDate(u.created_at)}
              </td>
              <td className="px-4 py-3 text-zinc-400" title={u.last_activity_at ?? ""}>
                {formatRelative(u.last_activity_at)}
              </td>
              <td className="px-4 py-3 text-right text-zinc-300">{u.queries_total}</td>
              <td className="px-4 py-3 text-right text-zinc-300">{u.gold_month}</td>
              <td className="px-4 py-3 text-right text-zinc-300">{u.conversations_count}</td>
              <td className="px-4 py-3 text-right text-zinc-300">{u.uploads_done}</td>
              <td className="px-4 py-3 text-right text-zinc-300">
                {u.uploads_failed === 0 ? (
                  "0"
                ) : (
                  <span className="text-red-400">{u.uploads_failed}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
