import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { createHash, randomUUID } from "node:crypto";

// Trebuie să fie identice cu cele din edge-functions/panou-auth.ts
const PASSWORD = "romania";
const COOKIE_NAME = "panou_auth";
const MAX_AGE = 60 * 60 * 2;
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

function isValidToken(token: string | undefined): boolean {
  if (!token) return false;
  const issuedAt = Number(token.split(".")[0]);
  if (!Number.isFinite(issuedAt)) return false;
  const age = Date.now() / 1000 - issuedAt;
  if (age < 0 || age > MAX_AGE) return false;
  const hash = createHash("sha256").update(`discover-romania-panou-v2:${PASSWORD}:${issuedAt}`).digest("hex");
  return token === `${issuedAt}.${hash}`;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export default async (request: Request, context: Context) => {
  const store = getStore("imagini-articole");

  // Servește o imagine încărcată: GET /imagini/<cheie>
  if (request.method === "GET") {
    const key = context.params.key;
    if (!key) return new Response("Not found", { status: 404 });
    const result = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!result) return new Response("Not found", { status: 404 });
    return new Response(result.data, {
      headers: {
        "content-type": String(result.metadata.contentType || "application/octet-stream"),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  }

  // Încarcă o imagine: POST /api/imagini (doar din panou, cu parola validă)
  if (request.method === "POST") {
    if (!isValidToken(context.cookies.get(COOKIE_NAME))) {
      return json({ error: "Sesiunea a expirat. Reautentifică-te în panou." }, 401);
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "Niciun fișier primit." }, 400);
    if (!ALLOWED_TYPES.includes(file.type)) return json({ error: "Format neacceptat. Folosește JPG, PNG, WEBP, GIF sau AVIF." }, 400);
    if (file.size > MAX_SIZE) return json({ error: "Imaginea depășește 5 MB." }, 400);

    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const key = `${Date.now()}-${randomUUID()}.${ext}`;
    await store.set(key, await file.arrayBuffer(), { metadata: { contentType: file.type, name: file.name } });
    return json({ url: `/imagini/${key}` });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: ["/api/imagini", "/imagini/:key"],
};
