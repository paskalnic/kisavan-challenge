function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function onRequestGet(context) {
  const origin = new URL(context.request.url).origin;
  const target = `${origin}/?source=share`;
  const image = `${origin}/assets/share-challenge.png`;

  return new Response(`<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Challenge français 5e Ki'Savan</title>
<meta name="description" content="Teste tes compétences essentielles en français 5e en quelques minutes.">
<meta property="og:type" content="website">
<meta property="og:title" content="Peux-tu réussir le challenge français 5e ?">
<meta property="og:description" content="10 questions pour tester compréhension, orthographe, conjugaison, grammaire et vocabulaire.">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${escapeHtml(`${origin}/partage/challenge`)}">
<meta name="twitter:card" content="summary_large_image">
<script>location.replace(${JSON.stringify(target)});</script>
</head><body><p>Ouverture du challenge… <a href="${escapeHtml(target)}">Continuer</a></p></body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" }
  });
}
