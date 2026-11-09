import Link from "next/link";
import LegalFooter from "@/components/LegalFooter";

export const metadata = {
  title: "Privacidad — Bardo",
  description: "Política de privacidad y tratamiento de datos personales en Bardo.",
};

const LAST_UPDATED = "2026-05-09";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black text-zinc-200">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <header className="mb-10">
          <Link href="/" className="text-amber-400 text-sm tracking-widest uppercase font-serif">
            ← Bardo
          </Link>
          <h1 className="text-3xl font-serif text-amber-400 mt-4">Política de privacidad</h1>
          <p className="text-zinc-500 text-sm mt-2">Última actualización: {LAST_UPDATED}</p>
        </header>

        <main className="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">1. Quién es el responsable</h2>
            <p>
              El responsable del tratamiento de los datos personales es{" "}
              <strong>[NOMBRE COMPLETO]</strong>, persona física residente en España.
              Para cualquier consulta puedes escribir a <strong>[EMAIL_CONTACTO]</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">2. Qué datos recogemos</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Datos de cuenta:</strong> email, nombre o alias, contraseña
                (almacenada cifrada con bcrypt) y zona horaria del navegador.
              </li>
              <li>
                <strong>Contenido subido:</strong> notas de partida, archivos (TXT,
                DOCX, PDF) y mensajes del chat. El contenido es libre y depende de
                lo que cada usuario decida cargar.
              </li>
              <li>
                <strong>Metadatos técnicos:</strong> tokens consumidos, modelo de
                IA usado, marcas temporales, identificador de sesión NextAuth.
              </li>
              <li>
                <strong>No recogemos:</strong> dirección IP persistente, datos de
                pago (no hay pagos), analítica de terceros, cookies de marketing.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">3. Para qué usamos los datos</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Permitir el inicio de sesión y mantener la cuenta activa.</li>
              <li>
                Procesar las notas y consultas a través de modelos de IA para
                construir y mantener la documentación de tu campaña.
              </li>
              <li>
                Calcular y aplicar la cuota mensual de uso (saldo de monedas), que
                se reinicia el día 1 a las 00:00 de tu zona horaria local.
              </li>
              <li>Auditar el consumo (qué modelo respondió, cuántos tokens) para control de costes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">4. Base legal del tratamiento</h2>
            <p>
              El tratamiento se basa en:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Ejecución del contrato</strong> (Art. 6.1.b RGPD): es necesario
                tratar los datos para prestar el servicio que has contratado al
                registrarte.
              </li>
              <li>
                <strong>Consentimiento</strong> (Art. 6.1.a RGPD): al subir contenido a
                la plataforma consientes que se procese mediante los modelos de IA
                descritos en el apartado 5.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">5. Terceros que tratan tus datos</h2>
            <p>
              El procesado por modelos de IA implica enviar el contenido subido (notas,
              consultas, documentos derivados) a:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Anthropic, PBC</strong> (Estados Unidos). Modelo por defecto:
                <code className="text-amber-200 mx-1">claude-haiku-5-5</code>.
              </li>
              <li>
                <strong>OpenAI L.L.C.</strong> (Estados Unidos). Modelo como alternativa:
                <code className="text-amber-200 mx-1">gpt-5.6-luna</code>.
              </li>
            </ul>
            <p className="mt-2">
              La transferencia internacional a EE. UU. está cubierta por las{" "}
              <strong>Cláusulas Contractuales Tipo (Standard Contractual Clauses)</strong>{" "}
              aprobadas por la Comisión Europea. No se ofrece opt-out: el procesado por
              estos terceros es esencial para el servicio. Si no estás conforme, la
              alternativa es no usar Bardo.
            </p>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">6. Cookies</h2>
            <p>
              Bardo solo usa cookies estrictamente necesarias para el funcionamiento del
              servicio:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Cookie de sesión NextAuth:</strong> identifica al usuario
                autenticado durante su visita. Sin esta cookie no se puede mantener el
                login.
              </li>
            </ul>
            <p className="mt-2">
              No se utilizan cookies de analítica, publicidad ni de terceros. Por este
              motivo no se muestra banner de consentimiento (las cookies estrictamente
              necesarias están exentas según el Considerando 30 RGPD y el Art. 22.2
              LSSI).
            </p>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">7. Conservación</h2>
            <p>
              Los datos se conservan mientras la cuenta esté activa. Si solicitas la
              supresión (apartado 8), se borran de forma inmediata excepto las
              obligaciones de retención que imponga la ley.
            </p>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">8. Tus derechos</h2>
            <p>
              Tienes derecho a:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Acceder</strong> a los datos que tenemos sobre ti.</li>
              <li><strong>Rectificarlos</strong> si son inexactos.</li>
              <li><strong>Suprimirlos</strong> (derecho al olvido, Art. 17 RGPD).</li>
              <li><strong>Limitar</strong> el tratamiento o <strong>oponerte</strong> a él.</li>
              <li><strong>Portabilidad:</strong> recibir una copia de tus datos en formato estructurado.</li>
              <li>
                <strong>Reclamar</strong> ante la Agencia Española de Protección de
                Datos (AEPD, <a href="https://www.aepd.es" target="_blank" rel="noreferrer" className="text-amber-400 hover:text-amber-300">www.aepd.es</a>) si crees que hemos vulnerado tus derechos.
              </li>
            </ul>
            <p className="mt-2">
              Para ejercer cualquiera de estos derechos escribe a{" "}
              <strong>[EMAIL_CONTACTO]</strong> indicando tu email registrado y el
              derecho que quieres ejercer.
            </p>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">9. Seguridad</h2>
            <p>
              Las contraseñas se almacenan cifradas con bcrypt (12 rounds). El acceso
              a la base de datos está restringido al servidor que aloja la aplicación.
              Las comunicaciones del navegador con el servidor van cifradas por TLS.
            </p>
          </section>

          <section>
            <h2 className="text-amber-300 font-serif text-lg mb-2">10. Cambios a esta política</h2>
            <p>
              Si modificamos esta política se actualizará la fecha en la cabecera. Los
              cambios sustanciales se comunicarán por email a las cuentas activas.
            </p>
          </section>
        </main>

        <LegalFooter />
      </div>
    </div>
  );
}
