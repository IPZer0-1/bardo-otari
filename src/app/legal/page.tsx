import Link from "next/link";
import LegalFooter from "@/components/LegalFooter";

export const metadata = {
  title: "Aviso legal — Bardo",
  description: "Información del titular del sitio según la LSSI-CE.",
};

const LAST_UPDATED = "2026-05-09";

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-black text-zinc-200">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <header className="mb-10">
          <Link href="/" className="text-amber-400 text-sm tracking-widest uppercase font-serif">
            ← Bardo
          </Link>
          <h1 className="text-3xl font-serif text-amber-400 mt-4">Aviso legal</h1>
          <p className="text-zinc-500 text-sm mt-2">Última actualización: {LAST_UPDATED}</p>
        </header>

        <main className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">1. Titular del sitio</h2>
            <p>
              En cumplimiento del Artículo 10 de la Ley 34/2002, de Servicios de la
              Sociedad de la Información y Comercio Electrónico (LSSI-CE), se informa
              de los siguientes datos del titular:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li><strong>Nombre:</strong> [NOMBRE COMPLETO]</li>
              <li><strong>Naturaleza jurídica:</strong> persona física sin actividad económica</li>
              <li><strong>País:</strong> España</li>
              <li><strong>Email de contacto:</strong> [EMAIL_CONTACTO]</li>
            </ul>
            <p className="mt-2 text-zinc-500 text-xs">
              No se incluye NIF al no operar como autónomo ni persona jurídica
              registrada. La actividad de Bardo es sin ánimo de lucro y sin
              percepción económica de los usuarios.
            </p>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">2. Objeto</h2>
            <p>
              Bardo es una herramienta para grupos de juego de rol que permite
              subir notas de partida y consultar la documentación generada
              automáticamente con asistencia de modelos de inteligencia artificial.
              El acceso es por invitación durante la fase de piloto.
            </p>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">3. Propiedad intelectual</h2>
            <p>
              El código de la aplicación es propiedad del titular. El contenido
              subido por cada usuario (notas, partidas, personajes) sigue siendo
              de su autoría — Bardo solo lo procesa y almacena para la prestación
              del servicio. Ver{" "}
              <Link href="/terms" className="text-amber-400 hover:text-amber-300">
                Condiciones de uso
              </Link>{" "}
              para el detalle.
            </p>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">4. Responsabilidad</h2>
            <p>
              El titular no garantiza la disponibilidad continua del servicio durante
              la fase piloto. La información generada por los modelos de IA puede
              contener errores; el usuario debe verificar cualquier dato relevante
              antes de basar decisiones en él.
            </p>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">5. Legislación y jurisdicción</h2>
            <p>
              Esta relación se rige por la legislación española. Para cualquier
              controversia, las partes se someten a los Juzgados y Tribunales del
              domicilio del titular, salvo que la ley imponga otro fuero.
            </p>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">6. Documentos relacionados</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <Link href="/privacy" className="text-amber-400 hover:text-amber-300">
                  Política de privacidad
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-amber-400 hover:text-amber-300">
                  Condiciones de uso
                </Link>
              </li>
            </ul>
          </section>
        </main>

        <LegalFooter />
      </div>
    </div>
  );
}
