import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export function GET(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "64px 72px",
        background: "linear-gradient(120deg, #0b0b0e, #20190f)",
        color: "#f2eadb",
        fontFamily: "sans-serif",
        border: "14px solid #7a5220",
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", color: "#d7913a", fontSize: 22 }}
      >
        <span>KFC HELPER</span>
        <span>WoW Forever · Skill 1–300</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <span style={{ fontSize: 68, fontWeight: 700, letterSpacing: "-0.04em" }}>
          Profession leveling.
        </span>
        <span style={{ color: "#f0c040", fontSize: 68, fontWeight: 700, letterSpacing: "-0.04em" }}>
          Less wasted gold.
        </span>
        <span style={{ fontSize: 27, color: "#b8b1a6", marginTop: 10 }}>
          AH material prices + recipe costs + a crafting shopping list.
        </span>
      </div>
      <div
        style={{ display: "flex", borderTop: "1px solid #7a5220", paddingTop: 24, fontSize: 22 }}
      >
        kfcguild.online/tools/forever/trader/leveling
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" },
    },
  );
}
