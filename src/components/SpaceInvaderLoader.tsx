"use client";

// Classic two-frame "crab" invader, 11×8 pixels, rendered as SVG rects.
// Frame swap + marching movement are driven by CSS keyframes in globals.css.

const FRAME_A = [
  "..X.....X..",
  "...X...X...",
  "..XXXXXXX..",
  ".XX.XXX.XX.",
  "XXXXXXXXXXX",
  "X.XXXXXXX.X",
  "X.X.....X.X",
  "...XX.XX...",
];

const FRAME_B = [
  "..X.....X..",
  "X..X...X..X",
  "X.XXXXXXX.X",
  "XXX.XXX.XXX",
  "XXXXXXXXXXX",
  ".XXXXXXXXX.",
  "..X.....X..",
  ".X.......X.",
];

function Frame({ pattern, className }: { pattern: string[]; className: string }) {
  return (
    <svg
      viewBox="0 0 11 8"
      width="33"
      height="24"
      className={`absolute inset-0 ${className}`}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {pattern.flatMap((row, y) =>
        [...row].map((cell, x) =>
          cell === "X" ? (
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
          ) : null
        )
      )}
    </svg>
  );
}

export function SpaceInvaderLoader() {
  return (
    <div className="invader-march relative h-6 w-[33px] text-foreground/70" role="status" aria-label="Loading">
      <Frame pattern={FRAME_A} className="invader-frame-a" />
      <Frame pattern={FRAME_B} className="invader-frame-b" />
    </div>
  );
}
