import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export function GET(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background:
          "radial-gradient(circle at 76% 30%, rgba(199, 154, 80, 0.2), transparent 34%), linear-gradient(135deg, #060708 0%, #15110c 55%, #07090b 100%)",
        color: "#f2eadb",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Georgia, serif",
        height: "100%",
        justifyContent: "space-between",
        padding: "58px 68px",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          border: "1px solid rgba(199, 154, 80, 0.55)",
          display: "flex",
          inset: "34px",
          position: "absolute",
        }}
      />
      <div style={{ alignItems: "center", display: "flex", gap: "22px" }}>
        <div
          style={{
            alignItems: "center",
            border: "2px solid #d6a354",
            color: "#efc574",
            display: "flex",
            fontSize: "40px",
            fontWeight: 700,
            height: "72px",
            justifyContent: "center",
            width: "72px",
          }}
        >
          K
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <span style={{ fontSize: "29px", fontWeight: 700, letterSpacing: "0.18em" }}>
            KFC HELPER
          </span>
          <span
            style={{
              color: "#b7aa96",
              fontFamily: "Arial, sans-serif",
              fontSize: "16px",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
            }}
          >
            Build-aware Azeroth intelligence
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "1000px" }}>
        <span
          style={{
            color: "#d6a354",
            fontFamily: "Arial, sans-serif",
            fontSize: "20px",
            fontWeight: 700,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          WoW Forever + TBC
        </span>
        <span style={{ fontSize: "72px", fontWeight: 700, letterSpacing: "-0.025em" }}>
          Trader & Encyclopedia
        </span>
        <span
          style={{
            color: "#d0c4b1",
            fontFamily: "Arial, sans-serif",
            fontSize: "27px",
          }}
        >
          Search items, recipes, professions, crafting chains, and Auction House opportunities.
        </span>
      </div>

      <div
        style={{
          alignItems: "center",
          color: "#a99b87",
          display: "flex",
          fontFamily: "Arial, sans-serif",
          fontSize: "17px",
          justifyContent: "space-between",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        <span>Audited game data · explainable calculations</span>
        <span style={{ color: "#d6a354" }}>helper.kfcguild.online</span>
      </div>
    </div>,
    {
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
      width: 1200,
    },
  );
}
