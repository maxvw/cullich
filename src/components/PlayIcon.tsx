export function PlayIcon({ size = 16, color = "white", opacity = 1 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={{ opacity, display: "block" }}
    >
      <polygon points="3,1 14,8 3,15" fill={color} />
    </svg>
  );
}
