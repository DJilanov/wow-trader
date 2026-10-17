export function publicJsonResponse(
  data: unknown,
  options: { readonly status?: number; readonly maxAgeSeconds?: number } = {},
): Response {
  const status = options.status ?? 200;
  const maxAgeSeconds = options.maxAgeSeconds ?? 300;
  return new Response(
    JSON.stringify(data, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
    {
      status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": `public, max-age=0, s-maxage=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 2}`,
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
