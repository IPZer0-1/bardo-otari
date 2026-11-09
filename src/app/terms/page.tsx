import Link from "next/link";
import LegalFooter from "@/components/LegalFooter";

export const metadata = {
  title: "Condiciones de uso — Bardo",
  description: "Condiciones de uso del servicio Bardo.",
};

const LAST_UPDATED = "2026-05-09";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-black text-zinc-200">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <header className="mb-10">
          <Link href="/" className="text-amber-400 text-sm tracking-widest uppercase font-serif">
            ← Bardo
          </Link>
          <h1 className="text-3xl font-serif text-amber-400 mt-4">Condiciones de uso</h1>
          <p className="text-zinc-500 text-sm mt-2">Última actualización: {LAST_UPDATED}</p>
        </header>

        <main className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">1. Aceptación</h2>
            <p>
              Al registrarte y usar Bardo aceptas estas condiciones, la{" "}
              <Link href="/privacy" className="text-amber-400 hover:text-amber-300">
                política de privacidad
              </Link>{" "}
              y el{" "}
              <Link href="/legal" className="text-amber-400 hover:text-amber-300">
                aviso legal
              </Link>. Si no las aceptas, no uses el servicio.
            </p>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">2. Edad mínima</h2>
            <p>
              Para crear una cuenta debes tener al menos <strong>14 años</strong>.
              Por debajo de esta edad la legislación española (LOPDGDD Art. 7)
              exige consentimiento parental, que actualmente no implementamos.
              Si descubres que un menor de 14 años ha creado una cuenta, contacta
              con nosotros para que la eliminemos.
            </p>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">3. Acceso por invitación</h2>
            <p>
              Durante la fase piloto el registro está cerrado: hace falta un código
              de invitación válido. Cada código se consume con un solo uso. El
              titular puede revocar el acceso a cuentas que infrinjan estas
              condiciones.
            </p>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">4. Uso aceptable</h2>
            <p>Está prohibido:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                Subir contenido ilegal, ofensivo, que incite al odio o que
                vulnere derechos de terceros.
              </li>
              <li>
                Subir datos personales de terceros sin su consentimiento (p.ej.
                notas que identifiquen a personas reales no participantes en la
                campaña).
              </li>
              <li>
                Intentar abusar de la plataforma para extraer modelos, hacer
                scraping masivo, agotar deliberadamente la cuota de otros usuarios
                o atacar la infraestructura.
              </li>
              <li>
                Compartir tus credenciales con terceros o usar la cuenta de otra
                persona.
              </li>
            </ul>
            <p className="mt-2">
              El incumplimiento puede provocar la suspensión inmediata de la cuenta.
            </p>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">5. Propiedad del contenido</h2>
            <p>
              Las notas, partidas, personajes, lugares y cualquier contenido creativo
              que subas a Bardo siguen siendo <strong>tuyos</strong>. Al subirlos
              concedes a Bardo una licencia limitada para almacenarlos y procesarlos
              con los modelos de IA descritos en la{" "}
              <Link href="/privacy" className="text-amber-400 hover:text-amber-300">
                política de privacidad
              </Link>, con el único fin de prestarte el servicio.
            </p>
            <p className="mt-2">
              No usamos tu contenido para entrenar modelos propios ni lo cedemos a
              terceros distintos de los procesadores de IA listados.
            </p>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">6. Cuota mensual de uso</h2>
            <p>
              Cada cuenta tiene un saldo mensual de "monedas de oro" que se descuenta
              por consulta o ingesta. El saldo se reinicia el día 1 de cada mes a las
              00:00 de tu zona horaria local. Si lo agotas, las operaciones serán
              bloqueadas con un mensaje informativo hasta el siguiente reinicio. La
              tarifa concreta y el tope pueden ajustarse durante la fase piloto.
            </p>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">7. Disponibilidad y limitación de responsabilidad</h2>
            <p>
              Bardo se ofrece "tal cual", durante una fase piloto sin SLA ni
              garantía de continuidad. El titular no responde por:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>Interrupciones, caídas o pérdida temporal de servicio.</li>
              <li>
                Errores en las respuestas generadas por IA (los modelos pueden
                inventar datos; verifica antes de basar decisiones reales en ellos).
              </li>
              <li>Daños indirectos derivados del uso del servicio.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">8. Eliminación de cuenta</h2>
            <p>
              Puedes solicitar la eliminación de tu cuenta y todos los datos
              asociados escribiendo a <strong>[EMAIL_CONTACTO]</strong>. La
              eliminación es inmediata y no recuperable.
            </p>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">9. Cambios en las condiciones</h2>
            <p>
              Estas condiciones pueden actualizarse. Los cambios sustanciales se
              comunicarán por email. El uso continuado del servicio tras la
              comunicación implica la aceptación de las nuevas condiciones.
            </p>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">10. Ley aplicable</h2>
            <p>
              Estas condiciones se rigen por la legislación española.
            </p>
          </section>
        </main>

        <LegalFooter />
      </div>
    </div>
  );
}
