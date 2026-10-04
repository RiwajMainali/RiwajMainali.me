// The unlit tube is the real text (readable at first paint); the lit layer
// is a ::after overlay that flickers on and carries the drifting "bubbles".
export default function NeonName({ text }: { text: string }) {
  return (
    <h1 className="neon" data-text={text}>
      {text}
    </h1>
  );
}
