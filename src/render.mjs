const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? whole;
    const code =
      name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
  });
}

function attributes(tag) {
  const found = {};
  for (const match of tag.matchAll(/([a-zA-Z0-9_-]+)="([^"]*)"/g))
    found[match[1]] = decode(match[2]);
  return found;
}

function card(tag) {
  const attrs = attributes(tag);
  if (attrs.type !== "ask_user") return `\n[${attrs.type ?? "card"}]\n`;
  const options = Object.keys(attrs)
    .filter((key) => /^o\d+$/.test(key))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
    .map((key, i) => `  ${i + 1}. ${attrs[key]}`);
  return `\n\n${attrs.q ?? attrs.header ?? ""}\n${options.join("\n")}\n\n`;
}

function bare(url) {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

function link(tag, inner, baseUrl) {
  const label = inner.replace(/<[^>]+>/g, "");
  const href = attributes(tag).href;
  if (!href) return label;
  const url = href.startsWith("/") ? `${baseUrl}${href}` : href;
  return bare(url) === bare(decode(label).trim()) ? url : `${label} (${url})`;
}

export function replyText(html, baseUrl = "") {
  const text = String(html ?? "")
    .replace(/<ui-component\b([^>]*)>[\s\S]*?<\/ui-component>/gi, (_, tag) => card(tag))
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_, tag, inner) => link(tag, inner, baseUrl))
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|ul|ol|table|tr|blockquote|pre)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  return decode(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
