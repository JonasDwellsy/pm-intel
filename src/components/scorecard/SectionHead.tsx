export function SectionHead({
  num,
  title,
  lede,
}: {
  num: string;
  title: string;
  lede?: React.ReactNode;
}) {
  return (
    <header className="mb-6">
      <p className="dq-eyebrow">Section {num}</p>
      <h2 className="dq-h2 mt-1.5">{title}</h2>
      <div className="dq-section-rule" />
      {lede && <p className="dq-section-lede">{lede}</p>}
    </header>
  );
}
