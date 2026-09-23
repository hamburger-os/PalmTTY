type BrandProps = {
  eyebrow?: string;
  hero?: boolean;
};

export function Brand({ eyebrow, hero = false }: BrandProps) {
  return (
    <div className={`brand ${hero ? "brand-hero" : "brand-header"}`}>
      <img
        className="brand-mark"
        src="/icon-192.png"
        alt=""
        aria-hidden="true"
        width={hero ? 72 : 48}
        height={hero ? 72 : 48}
        draggable={false}
      />
      <div className="brand-copy">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>PalmTTY</h1>
      </div>
    </div>
  );
}
