export const dynamic = "force-static";

function Maintenance() {
  return (
    <main style={{ minHeight: "100vh", background: "#05070a", position: "relative", overflow: "hidden" }}>
      {/* subtle background */}
      <div style={{
        position: "absolute", inset: 0,
        background:
          "radial-gradient(800px 400px at 20% 10%, rgba(255,255,255,0.06), transparent 60%)," +
          "radial-gradient(700px 350px at 80% 30%, rgba(255,255,255,0.05), transparent 55%)," +
          "radial-gradient(900px 500px at 50% 90%, rgba(255,255,255,0.04), transparent 60%)",
        filter: "blur(10px)",
        transform: "scale(1.05)"
      }} />
      {/* vignette */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.7))"
      }} />

      {/* modal */}
      <div style={{
        position: "relative",
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px"
      }}>
        <div style={{
          width: "min(520px, 92vw)",
          borderRadius: "18px",
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(10,12,16,0.55)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
          padding: "22px 18px"
        }}>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "rgba(255,255,255,0.92)", letterSpacing: "0.2px" }}>
            Maintenance in progress
          </div>
          <div style={{ marginTop: "10px", fontSize: "14px", lineHeight: 1.5, color: "rgba(255,255,255,0.72)" }}>
            We’re optimizing the network. Please check back soon.
          </div>
          <div style={{ marginTop: "14px", fontSize: "12px", color: "rgba(255,255,255,0.55)" }}>
            Status: Recovery Mode
          </div>
        </div>
      </div>
    </main>
  );
}

export default Maintenance;
