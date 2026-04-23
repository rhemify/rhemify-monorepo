import { createFileRoute, Navigate } from "@tanstack/react-router";

const DEMO_KEY = "e3c91e2d-8120-479a-a2a0-acd8393c7872";

export const Route = createFileRoute("/_marketing/demo/$key")({
  component: DemoGate,
});

function DemoGate() {
  const { key } = Route.useParams();

  if (key !== DEMO_KEY) {
    return <Navigate to="/" />;
  }

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        margin: 0,
        padding: 0,
        overflow: "hidden",
      }}
    >
      <iframe
        src={`/${DEMO_KEY}.html`}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
        }}
        title="Rhemify Demo"
      />
    </div>
  );
}
