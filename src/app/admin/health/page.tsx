export const dynamic = "force-dynamic";

export default function AdminHealthPlaceholder() {
  return (
    <div>
      <h1 className="text-2xl font-cinzel text-amber-200 mb-2">Salud técnica</h1>
      <p className="text-sm text-zinc-500">
        Próximamente. Errores LLM, latencia P50/P95, ratio cache hit/miss,
        distribución tamaños de ingesta. Sesión 3 del plan en{" "}
        <code className="text-amber-200">planes/panel_admin.md</code>.
      </p>
    </div>
  );
}
