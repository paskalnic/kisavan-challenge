# Challenge Ki'Savan — Cloudflare Pages + Supabase

Le dossier `functions/` crée automatiquement des **Pages Functions**, qui tournent sur le runtime Cloudflare Workers. Il n'est donc pas nécessaire de créer un Worker séparé pour ce MVP.

## 1. Supabase
1. Crée un projet Supabase.
2. Ouvre **SQL Editor** et exécute `supabase-schema.sql`.
3. Récupère l'URL du projet et une **Secret key** serveur (ou l'ancienne clé `service_role`).
4. Ne mets jamais cette clé dans `public/app.js` ni dans GitHub.

## 2. GitHub et Cloudflare Pages
1. Mets ce dossier dans un dépôt GitHub.
2. Cloudflare > Workers & Pages > Create > Pages > Connect to Git.
3. Build command : vide.
4. Build output directory : `public`.
5. Déploie.

## 3. Secrets Cloudflare
Dans le projet Pages : **Settings > Variables and Secrets**.
Ajoute en Production :
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

Ajoute-les comme secrets, puis redéploie. Fais pareil pour Preview si nécessaire.

## 4. Routes créées
- `/api/quiz`
- `/api/submit`
- `/api/leaderboard`

## Limites de ce MVP
- Pas de nom, e-mail ou téléphone.
- Surnom généré automatiquement.
- Une tentative par navigateur via `localStorage` : cela ne bloque pas totalement la triche.
- Pour un concours avec cadeau : ajouter Cloudflare Turnstile, une limitation de débit et un règlement.
- Cloudflare et Supabase peuvent conserver leurs propres journaux techniques.
