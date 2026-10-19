/** A small pixel coin for $CHOG. Pure SVG on a 10x10 grid, so it stays crisp at any size. */
export function ChogIcon({ size = 16, dim = false }: { size?: number; dim?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden style={{ opacity: dim ? 0.45 : 1, flex: "none" }}>
      <path fill="#0b0806" d="M3 0h4v1h2v2h1v4H9v2H7v1H3V9H1V7H0V3h1V1h2z" />
      <path fill="#ffb347" d="M3 1h4v1h1v1h1v4H8v1H7v1H3V8H2V7H1V3h1V2h1z" />
      <path fill="#ffd166" d="M3 2h3v1H3zM2 3h1v4H2z" />
      <path fill="#7a4a10" d="M4 3h3v1H5v2h2v1H4z" />
    </svg>
  );
}
