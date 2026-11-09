import Link from "next/link";

/**
 * Footer mínimo con enlaces a las 3 páginas legales obligatorias en
 * España (LSSI Art. 10 + GDPR Art. 13). Se incluye en páginas públicas
 * (auth, legales) y se omite en el área autenticada full-screen (chat,
 * docs) para no romper el layout.
 */
export default function LegalFooter() {
  return (
    <footer className="mt-12 pb-6 text-center text-xs text-zinc-600">
      <div className="flex items-center justify-center gap-3">
        <Link href="/privacy" className="hover:text-zinc-400 transition-colors">
          Privacidad
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/legal" className="hover:text-zinc-400 transition-colors">
          Aviso legal
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/terms" className="hover:text-zinc-400 transition-colors">
          Condiciones
        </Link>
      </div>
      <p className="mt-2 text-zinc-700">© Bardo</p>
    </footer>
  );
}
