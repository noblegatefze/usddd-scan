export const dynamic = "force-static";

function Shell({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#05070a",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(900px 450px at 15% 10%, rgba(255,255,255,0.07), transparent 60%)," +
            "radial-gradient(800px 420px at 85% 25%, rgba(255,255,255,0.06), transparent 55%)," +
            "radial-gradient(1100px 600px at 50% 95%, rgba(255,255,255,0.05), transparent 65%)",
          filter: "blur(12px)",
          transform: "scale(1.06)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(0,0,0,0.78))",
        }}
      />

      <div
        style={{
          position: "relative",
          width: "min(620px, 94vw)",
          borderRadius: "22px",
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(10,12,16,0.58)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: "0 28px 90px rgba(0,0,0,0.65)",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "relative" }}>
          <img
            src="/maintenance/scan-banner.png"
            alt="USDDD Fund"
            style={{
              width: "100%",
              height: "180px",
              objectFit: "cover",
              display: "block",
              filter: "saturate(1.05) contrast(1.05)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(0,0,0,0.75))",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "16px",
              bottom: "14px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <img
              src="/maintenance/digster.png"
              alt="Digster"
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(0,0,0,0.25)",
              }}
            />
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "12px" }}>
              Status: <span style={{ color: "rgba(255,255,255,0.65)" }}>Funding Paused</span>
            </div>
          </div>
        </div>

        <div style={{ padding: "18px 18px 16px 18px" }}>
          <div
            style={{
              fontSize: "20px",
              fontWeight: 800,
              color: "rgba(255,255,255,0.93)",
              letterSpacing: "0.2px",
            }}
          >
            {title}
          </div>
          <div
            style={{
              marginTop: "10px",
              fontSize: "14px",
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.72)",
            }}
          >
            {subtitle}
          </div>

          <div
            style={{
              marginTop: "16px",
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <a
              href="https://t.me/digdugdo"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px 12px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.88)",
                textDecoration: "none",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              Join Telegram
            </a>

            <a
              href="https://x.com/toastpunk"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px 12px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.78)",
                textDecoration: "none",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              Follow @toastpunk
            </a>
          </div>

          <div style={{ marginTop: "14px", fontSize: "12px", color: "rgba(255,255,255,0.50)" }}>
            Deposits are temporarily disabled while we harden performance and safety checks.
          </div>
        </div>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Shell
      title="USDDD Fund is temporarily paused"
      subtitle="We’re optimizing infrastructure and restoring stability. Please check back soon."
    />
  );
}
