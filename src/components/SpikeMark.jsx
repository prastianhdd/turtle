// Anthropic-style 8-spoke radial spike-mark glyph.
// Reusable di Header, Sidebar, ChatWindow.

function SpikeMark({ className = '', size = 24 }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 1.5L13.2 9.6L21.5 9L15.6 14.4L18.9 22L12 17.4L5.1 22L8.4 14.4L2.5 9L10.8 9.6L12 1.5Z" />
    </svg>
  );
}

export default SpikeMark;
