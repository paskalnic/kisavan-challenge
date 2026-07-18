# Challenge Ki'Savan — Cloudflare Pages + Supabase

Le dossier `functions/` crée automatiquement des **Pages Functions**, qui tournent sur le runtime Cloudflare Workers.


## Limites de ce MVP
- Pas de nom, e-mail ou téléphone.
- Surnom généré automatiquement.
- Une tentative par navigateur via `localStorage` : cela ne bloque pas totalement la triche.
- Pour un concours avec cadeau : ajouter Cloudflare Turnstile, une limitation de débit et un règlement.
- Cloudflare et Supabase peuvent conserver leurs propres journaux techniques.
