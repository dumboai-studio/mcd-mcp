const paths = {
  close: "M6 6l12 12M18 6L6 18",
  store: "M3 10V6l2-3h14l2 3v4M3 10h18M5 10v11h14V10M9 21v-7h6v7M2 6h20",
  delivery:
    "M3 6h11v12H3zM14 10h4l3 4v4h-7M7 18a2 2 0 1 0 0 .1M17 18a2 2 0 1 0 0 .1",
  car: "M4 10l2-6h12l2 6M3 10h18v8H3zM6 14h1M17 14h1M6 18v2M18 18v2",
  cart: "M2 3h3l2 12h12l3-9H6M9 20h.01M18 20h.01",
  meal: "M3 3v7m3-7v7m3-7v7M3 10h6M6 10v11M17 3v18M17 3c-4 3-4 8 0 8",
  cup: "M4 8h13v9a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM17 9h2a3 3 0 1 1 0 6h-2M7 3v2m4-2v2m4-2v2",
};

/** Monochrome interface symbols; product photographs retain their original colors. */
export function Icon({
  name,
  size = 20,
}: {
  name: keyof typeof paths;
  size?: number;
}) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
