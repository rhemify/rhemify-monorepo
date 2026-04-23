import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_marketing/")({
  component: ComingSoon,
});

function ComingSoon() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#09090b",
        color: "#fafafa",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>
          Rhem<span style={{ color: "#C8F03A" }}>ify</span>
        </h1>
        <p style={{ color: "#71717a", fontSize: 14, marginTop: 8 }}>Coming soon.</p>
      </div>
    </div>
  );
}
