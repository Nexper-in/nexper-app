// One base colour per category (picked by hashing the name). Backgrounds
// and text are mixed from it with the theme's own colours, so chips read
// well on both Night and Light.
const CHIP_BASES = ["#8b5cf6", "#e0911f", "#e5484d", "#6366f1", "#d946ef", "#0ea5e9"];

function mix(base) {
  return {
    base,
    bg: `color-mix(in srgb, ${base} 16%, transparent)`,
    text: `color-mix(in srgb, ${base} 72%, var(--text-primary))`,
  };
}

export function categoryColor(category) {
  let h = 0;
  for (let i = 0; i < (category || "").length; i++) h = (h * 31 + category.charCodeAt(i)) >>> 0;
  return mix(CHIP_BASES[h % CHIP_BASES.length]);
}

export default function CategoryChip({ category }) {
  const c = categoryColor(category);
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.text }}>
      {category}
    </span>
  );
}
