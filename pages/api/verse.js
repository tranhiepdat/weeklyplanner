// Curated "inspirational" books — English USFM id → Vietnamese (vi-vie) slug
// Restricting to these keeps verses meaningful AND lets us map a Vietnamese translation.
const BOOK_MAP = {
  PSA: "thi",     // Psalms / Thi thiên
  PRO: "châm",    // Proverbs / Châm ngôn
  ISA: "ê-sai",   // Isaiah / Ê-sai
  JER: "giê",     // Jeremiah / Giê-rê-mi
  MAT: "ma",      // Matthew / Ma-thi-ơ
  MRK: "mác",     // Mark / Mác
  LUK: "lu",      // Luke / Lu-ca
  JHN: "gi",      // John / Giăng
  ROM: "la-mã",   // Romans / La Mã
  "1CO": "icô",   // 1 Corinthians
  "2CO": "iicô",  // 2 Corinthians
  GAL: "gal",     // Galatians
  EPH: "êph",     // Ephesians
  PHP: "phil",    // Philippians
  COL: "côl",     // Colossians
  "1TH": "itê",   // 1 Thessalonians
  "2TH": "iitê",  // 2 Thessalonians
  "1TI": "itim",  // 1 Timothy
  "2TI": "iitim", // 2 Timothy
  HEB: "hê",      // Hebrews
  JAS: "gia-cơ",  // James
  "1JN": "igi",   // 1 John
  REV: "khải",    // Revelation
};

// Vietnamese display names for references
const VI_BOOK_NAME = {
  PSA: "Thi Thiên", PRO: "Châm Ngôn", ISA: "Ê-sai", JER: "Giê-rê-mi",
  MAT: "Mát-thêu", MRK: "Mác", LUK: "Lu-ca", JHN: "Gioan", ROM: "Rô-ma",
  "1CO": "1 Cô-rinh-tô", "2CO": "2 Cô-rinh-tô", GAL: "Ga-lát", EPH: "Ê-phê-sô",
  PHP: "Phi-líp", COL: "Cô-lô-sê", "1TH": "1 Thê-sa-lô-ni-ca", "2TH": "2 Thê-sa-lô-ni-ca",
  "1TI": "1 Ti-mô-thê", "2TI": "2 Ti-mô-thê", HEB: "Híp-ri", JAS: "Gia-cơ",
  "1JN": "1 Gioan", REV: "Khải Huyền",
};

export default async function handler(req, res) {
  const books = Object.keys(BOOK_MAP).join(",");
  try {
    // 1) Random English verse from an inspirational book
    const enRes = await fetch(`https://bible-api.com/data/web/random/${books}`);
    if (!enRes.ok) throw new Error("english fetch failed");
    const enData = await enRes.json();
    const rv = enData.random_verse || (enData.verses && enData.verses[0]);
    if (!rv) throw new Error("no verse");

    const bookId = rv.book_id;
    const chapter = rv.chapter;
    const verse = rv.verse;
    const enText = (rv.text || "").trim();
    const enRef = `${rv.book} ${chapter}:${verse}`;

    // 2) Try the Vietnamese translation for the same reference (best-effort)
    let viText = null;
    const slug = BOOK_MAP[bookId];
    if (slug) {
      try {
        const viUrl = `https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles/vi-vie/books/${encodeURIComponent(slug)}/chapters/${chapter}/verses/${verse}.json`;
        const viRes = await fetch(viUrl);
        if (viRes.ok) {
          const viData = await viRes.json();
          if (viData && viData.text) viText = viData.text.trim();
        }
      } catch { /* Vietnamese is optional */ }
    }
    const viRef = VI_BOOK_NAME[bookId] ? `${VI_BOOK_NAME[bookId]} ${chapter}:${verse}` : enRef;

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ en: enText, vi: viText, ref: enRef, refVi: viRef });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
