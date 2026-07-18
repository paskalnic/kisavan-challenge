export function json(data,status=200,extraHeaders={}){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...extraHeaders}})}
export async function supabaseRequest(env,path,options={}){
  if (!env || typeof env.SUPABASE_URL !== "string" || !env.SUPABASE_URL.trim()) {
    throw new Error("Configuration Supabase manquante.");
  }

  const baseUrl = env.SUPABASE_URL.replace(/\/+$/g, "");
  const cleanPath = String(path).replace(/^\/+/, "");
  const response = await fetch(`${baseUrl}/rest/v1/${cleanPath}`, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    console.error("Supabase error", response.status, body);
    throw new Error("Erreur de base de données.");
  }
  return body;
}
export function randomAlias(){const animals=["Colibri","Jaguar","Dauphin","Iguane","Tortue","Pélican","Mango","Soleil"];const animal=animals[Math.floor(Math.random()*animals.length)];const number=crypto.getRandomValues(new Uint32Array(1))[0]%1000;return `${animal}-${String(number).padStart(3,"0")}`}
export function validUuid(value){return typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)}
