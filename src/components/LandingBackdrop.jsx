// Backdrop global landing: blob glow + film grain + art glow.
// Layer fixed di belakang seluruh konten (.landing).

export default function LandingBackdrop() {
  return (
    <div className="landing-bg" aria-hidden="true">
      <div className="landing-blob landing-blob--a" />
      <div className="landing-blob landing-blob--b" />
      <div className="landing-blob landing-blob--c" />
      <div className="landing-glow" />
      <svg className="landing-grain" width="100%" height="100%">
        <filter id="landing-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0.08
                                0 0 0 0 0.08
                                0 0 0 0 0.08
                                0 0 0 0.4 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#landing-noise)" />
      </svg>
    </div>
  );
}
