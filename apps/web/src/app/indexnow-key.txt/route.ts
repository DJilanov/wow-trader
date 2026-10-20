const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

export const dynamic = "force-dynamic";

export function GET(): Response {
  const key = process.env.INDEXNOW_KEY;
  if (!key || !KEY_PATTERN.test(key)) return new Response("Not found\n", { status: 404 });
  return new Response(`${key}\n`, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
