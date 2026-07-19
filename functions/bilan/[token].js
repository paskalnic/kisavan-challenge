import { validUuid } from "../_common.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function onRequestGet(context) {
  const token = context.params.token;
  if (!validUuid(token)) {
    return new Response("Lien invalide.", { status: 400 });
  }

  const origin = new URL(context.request.url).origin;
  const target = `${origin}/?bilan=${encodeURIComponent(token)}`;
  const shareUrl = `${origin}/bilan/${encodeURIComponent(token)}`;
  const image = `${origin}/assets/share-parent.png`;
  const safeTarget = escapeHtml(target);

  return new Response(`<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bilan pédagogique Ki'Savan</title>
<meta name="description" content="Consultez le résultat et les compétences à consolider.">
<meta property="og:type" content="website">
<meta property="og:title" content="Un résultat Ki'Savan vous a été transmis">
<meta property="og:description" content="Découvrez les points forts et les notions à consolider, puis demandez le bilan pédagogique gratuit.">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${escapeHtml(shareUrl)}">
<meta name="twitter:card" content="summary_large_image">
<script>location.replace(${JSON.stringify(target)});</script>
</head><body><p>Ouverture du bilan… <a href="${safeTarget}">Continuer</a></p></body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" }
  });
}
