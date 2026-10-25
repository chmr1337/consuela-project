import type { Config, Context } from "@netlify/edge-functions";

// Parola pentru Panoul de Redactare / Centrul de Control
const PASSWORD = "Apple";
const COOKIE_NAME = "panou_auth";
const MAX_AGE = 60 * 60 * 2; // 2 ore — după aceea parola este cerută din nou

async function sha256(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Token = "<timestamp>.<hash>", legat de parolă și de momentul autentificării
async function tokenFor(password: string, issuedAt: number): Promise<string> {
  return `${issuedAt}.${await sha256(`discover-romania-panou-v2:${password}:${issuedAt}`)}`;
}

async function isValidToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const issuedAt = Number(token.split(".")[0]);
  if (!Number.isFinite(issuedAt)) return false;
  const age = Date.now() / 1000 - issuedAt;
  if (age < 0 || age > MAX_AGE) return false;
  return token === (await tokenFor(PASSWORD, issuedAt));
}

// Normalizează adresa (bare oblice duble, majuscule, caractere codificate) ca să nu poată fi ocolită protecția
function isPanouPath(pathname: string): boolean {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // păstrează forma originală
  }
  path = path.replace(/\\/g, "/").replace(/\/{2,}/g, "/").toLowerCase();
  return /^\/panou(\.html?)?(\/.*)?$/.test(path);
}

function loginPage(error = false): Response {
  const html = `<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>Acces Panou — Drumuri bune</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/assets/css/styles.css">
</head>
<body class="min-h-screen flex items-center justify-center px-6">
  <form method="POST" class="w-full max-w-sm rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
    <div class="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">Panou de Administrare</div>
    <h1 class="mt-1 text-2xl font-bold text-[var(--foreground)]">Acces restricționat</h1>
    <p class="mt-2 text-sm text-[var(--muted-foreground)]">Introdu parola pentru a accesa panoul de redactare a articolelor.</p>
    ${error ? `<p class="mt-4 rounded-md bg-[var(--primary-light)] px-3 py-2 text-sm font-semibold text-[var(--primary)]">Parolă incorectă. Încearcă din nou.</p>` : ""}
    <label for="password" class="mt-5 block text-sm font-semibold text-[var(--foreground)]">Parolă</label>
    <input id="password" name="password" type="password" required autofocus autocomplete="current-password"
      class="mt-1.5 w-full rounded-md border border-[var(--input)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]">
    <button type="submit" class="mt-5 w-full rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]">Intră în panou</button>
    <a href="/" class="mt-4 block text-center text-xs text-[var(--muted-foreground)] hover:underline">← Înapoi la site</a>
  </form>
</body>
</html>`;
  return new Response(html, {
    status: error ? 401 : 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  if (!isPanouPath(url.pathname)) return context.next();

  if (url.searchParams.has("logout")) {
    context.cookies.delete({ name: COOKIE_NAME, path: "/" });
    return new Response(null, { status: 303, headers: { location: "/" } });
  }

  if (request.method === "POST") {
    const form = await request.formData();
    const password = String(form.get("password") ?? "");
    if (password !== PASSWORD) return loginPage(true);

    context.cookies.set({
      name: COOKIE_NAME,
      value: await tokenFor(PASSWORD, Math.floor(Date.now() / 1000)),
      path: "/",
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "Lax",
    });
    // Redirecționează înapoi la aceeași adresă (păstrând parametrii ?judet=...&topic=...)
    return new Response(null, { status: 303, headers: { location: "/panou.html" + url.search } });
  }

  if (!(await isValidToken(context.cookies.get(COOKIE_NAME)))) return loginPage();

  const response = await context.next();
  response.headers.set("cache-control", "no-store");
  return response;
};

export const config: Config = {
  path: "/*",
  excludedPath: ["/assets/*"],
};
