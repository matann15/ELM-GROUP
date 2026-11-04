// אזורים, יישובים וזיהוי יישוב מתוך כתובת חופשית.
// קואורדינטות הן מרכז משוער של היישוב — לשימוש בהערכת מרחק בלבד, לא בניווט.

export type RegionCode =
  | "haifa_krayot"
  | "west_galilee"
  | "upper_galilee"
  | "valleys"
  | "hadera_caesarea"
  | "sharon"
  | "gush_dan"
  | "samaria"
  | "shfela"
  | "jerusalem"
  | "south";

export const REGIONS: Record<RegionCode, { name: string; lat: number; lng: number; neighbors: RegionCode[] }> = {
  haifa_krayot: { name: "חיפה והקריות", lat: 32.81, lng: 35.04, neighbors: ["west_galilee", "valleys", "hadera_caesarea"] },
  west_galilee: { name: "גליל מערבי וכרמיאל", lat: 32.95, lng: 35.22, neighbors: ["haifa_krayot", "upper_galilee", "valleys"] },
  upper_galilee: { name: "גליל עליון וגולן", lat: 33.08, lng: 35.6, neighbors: ["west_galilee", "valleys"] },
  valleys: { name: "עמקים ונצרת", lat: 32.66, lng: 35.27, neighbors: ["haifa_krayot", "west_galilee", "upper_galilee", "hadera_caesarea"] },
  hadera_caesarea: { name: "חדרה וקיסריה", lat: 32.47, lng: 34.95, neighbors: ["haifa_krayot", "sharon", "valleys"] },
  sharon: { name: "השרון", lat: 32.25, lng: 34.89, neighbors: ["hadera_caesarea", "gush_dan", "samaria"] },
  gush_dan: { name: "גוש דן ופתח תקווה", lat: 32.05, lng: 34.8, neighbors: ["sharon", "shfela", "samaria"] },
  samaria: { name: "שומרון", lat: 32.12, lng: 35.07, neighbors: ["sharon", "gush_dan"] },
  shfela: { name: "שפלה ואשדוד", lat: 31.88, lng: 34.76, neighbors: ["gush_dan", "jerusalem", "south"] },
  jerusalem: { name: "ירושלים והסביבה", lat: 31.78, lng: 35.13, neighbors: ["shfela"] },
  south: { name: "דרום", lat: 31.4, lng: 34.65, neighbors: ["shfela"] },
};

export const REGION_CODES = Object.keys(REGIONS) as RegionCode[];

type City = { name: string; region: RegionCode; lat: number; lng: number; aliases: string[] };

// aliases נכתבים בצורה מנורמלת (ראה normalizeForMatch). הכינויים כוללים קיצורים וטעויות כתיב שמופיעים בקובץ המקור.
export const CITIES: City[] = [
  { name: "קריית ביאליק", region: "haifa_krayot", lat: 32.837, lng: 35.085, aliases: ["קריית ביאליק", "קרית ביאליק", "ק ביאליק", "קביאליק", "ק באיליק", "קבאיליק", "ביאליק", "באיליק"] },
  { name: "קריית אתא", region: "haifa_krayot", lat: 32.81, lng: 35.11, aliases: ["קריית אתא", "קרית אתא", "ק אתא", "קאתא", "א אתא"] },
  { name: "קריית מוצקין", region: "haifa_krayot", lat: 32.837, lng: 35.077, aliases: ["קריית מוצקין", "קרית מוצקין", "ק מוצקין", "קמוצקין"] },
  { name: "קריית חיים", region: "haifa_krayot", lat: 32.826, lng: 35.06, aliases: ["קריית חיים", "קרית חיים", "ק חיים"] },
  { name: "חיפה", region: "haifa_krayot", lat: 32.794, lng: 35.0, aliases: ["חיפה", "מ חיפה", "מחיפה", "מ חיפב", "צק פוסט"] },
  { name: "נשר", region: "haifa_krayot", lat: 32.766, lng: 35.04, aliases: ["נשר", "תל חנן"] },
  { name: "טירת כרמל", region: "haifa_krayot", lat: 32.76, lng: 34.97, aliases: ["טירת הכרמל", "טירת כרמל"] },
  { name: "שפרעם", region: "haifa_krayot", lat: 32.805, lng: 35.17, aliases: ["שפרעם"] },
  { name: "עכו", region: "west_galilee", lat: 32.927, lng: 35.084, aliases: ["עכו"] },
  { name: "נהריה", region: "west_galilee", lat: 33.006, lng: 35.097, aliases: ["נהריה"] },
  { name: "שלומי", region: "west_galilee", lat: 33.072, lng: 35.145, aliases: ["שלומי"] },
  { name: "מעלות-תרשיחא", region: "west_galilee", lat: 33.015, lng: 35.27, aliases: ["מעלות", "מעולות"] },
  { name: "תפן", region: "west_galilee", lat: 32.99, lng: 35.27, aliases: ["תפן", "מגדל תפן", "מגכדל תפן"] },
  { name: "כרמיאל", region: "west_galilee", lat: 32.915, lng: 35.295, aliases: ["כרמיאל"] },
  { name: "משגב", region: "west_galilee", lat: 32.86, lng: 35.25, aliases: ["משגב"] },
  { name: "בקעת בית הכרם", region: "west_galilee", lat: 32.93, lng: 35.33, aliases: ["בקעת הכרם", "בקעת בית הכרם"] },
  { name: "גליל מערבי", region: "west_galilee", lat: 32.98, lng: 35.15, aliases: ["גליל מערבי"] },
  { name: "קריית שמונה", region: "upper_galilee", lat: 33.207, lng: 35.57, aliases: ["קריית שמונה", "קרית שמונה", "ק שמונה"] },
  { name: "חצור הגלילית", region: "upper_galilee", lat: 32.98, lng: 35.54, aliases: ["חצור הגלילית"] },
  { name: "קצרין", region: "upper_galilee", lat: 32.99, lng: 35.69, aliases: ["קצרין"] },
  { name: "צפת", region: "upper_galilee", lat: 32.965, lng: 35.496, aliases: ["צפת"] },
  { name: "טבריה", region: "upper_galilee", lat: 32.79, lng: 35.53, aliases: ["טבריה"] },
  { name: "יבנאל", region: "valleys", lat: 32.71, lng: 35.5, aliases: ["יבניאל", "יבנאל"] },
  { name: "יקנעם", region: "valleys", lat: 32.655, lng: 35.105, aliases: ["יקנעם", "יוקנעם"] },
  { name: "מגדל העמק", region: "valleys", lat: 32.675, lng: 35.24, aliases: ["מגדל העמק"] },
  { name: "נוף הגליל", region: "valleys", lat: 32.71, lng: 35.32, aliases: ["נצרת עילית", "נוף הגליל"] },
  { name: "נצרת", region: "valleys", lat: 32.7, lng: 35.3, aliases: ["נצרת"] },
  { name: "עפולה", region: "valleys", lat: 32.607, lng: 35.29, aliases: ["עפולה"] },
  { name: "בית שאן", region: "valleys", lat: 32.497, lng: 35.497, aliases: ["בית שאן"] },
  { name: "עין חרוד", region: "valleys", lat: 32.55, lng: 35.39, aliases: ["עין חרוד"] },
  { name: "רמת ישי", region: "valleys", lat: 32.7, lng: 35.17, aliases: ["רמת ישי"] },
  { name: "חדרה", region: "hadera_caesarea", lat: 32.434, lng: 34.919, aliases: ["חדרה"] },
  { name: "קיסריה", region: "hadera_caesarea", lat: 32.49, lng: 34.92, aliases: ["קיסריה"] },
  { name: "פרדס חנה-כרכור", region: "hadera_caesarea", lat: 32.47, lng: 34.97, aliases: ["פרדס חנה", "כרכור"] },
  { name: "מעגן מיכאל", region: "hadera_caesarea", lat: 32.555, lng: 34.915, aliases: ["מעגן מיכאל"] },
  { name: "אור עקיבא", region: "hadera_caesarea", lat: 32.51, lng: 34.92, aliases: ["אור עקיבא"] },
  { name: "נתניה", region: "sharon", lat: 32.32, lng: 34.86, aliases: ["נתניה", "נץניה"] },
  { name: "כפר סבא", region: "sharon", lat: 32.175, lng: 34.907, aliases: ["כפר סבא", "כס"] },
  { name: "רעננה", region: "sharon", lat: 32.184, lng: 34.871, aliases: ["רעננה"] },
  { name: "הרצליה", region: "sharon", lat: 32.163, lng: 34.844, aliases: ["הרצליה"] },
  { name: "הוד השרון", region: "sharon", lat: 32.15, lng: 34.89, aliases: ["הוד השרון"] },
  { name: "רמת השרון", region: "sharon", lat: 32.146, lng: 34.84, aliases: ["רמת השרון", "רמהש"] },
  { name: "קדימה-צורן", region: "sharon", lat: 32.278, lng: 34.915, aliases: ["קדימה", "צורן"] },
  { name: "צור יגאל", region: "sharon", lat: 32.22, lng: 34.98, aliases: ["צור יגאל", "צור יגעל"] },
  { name: "נורדיה", region: "sharon", lat: 32.315, lng: 34.9, aliases: ["נורדיה"] },
  { name: "עמק חפר", region: "sharon", lat: 32.36, lng: 34.92, aliases: ["עמק חפר", "חפר", "בחן"] },
  { name: "אבן יהודה", region: "sharon", lat: 32.27, lng: 34.89, aliases: ["אבן יהודה"] },
  { name: "תל אביב-יפו", region: "gush_dan", lat: 32.08, lng: 34.78, aliases: ["תל אביב", "תא", "יפו", "תל-אביב"] },
  { name: "חולון", region: "gush_dan", lat: 32.016, lng: 34.78, aliases: ["חולון"] },
  { name: "בת ים", region: "gush_dan", lat: 32.02, lng: 34.75, aliases: ["בת ים"] },
  { name: "רמת גן", region: "gush_dan", lat: 32.07, lng: 34.82, aliases: ["רמת גן", "רג"] },
  { name: "גבעתיים", region: "gush_dan", lat: 32.07, lng: 34.81, aliases: ["גבעתיים"] },
  { name: "בני ברק", region: "gush_dan", lat: 32.084, lng: 34.834, aliases: ["בני ברק", "בב"] },
  { name: "אור יהודה", region: "gush_dan", lat: 32.03, lng: 34.85, aliases: ["אור יהודה"] },
  { name: "יהוד-מונוסון", region: "gush_dan", lat: 32.03, lng: 34.89, aliases: ["יהוד"] },
  { name: "גבעת שמואל", region: "gush_dan", lat: 32.078, lng: 34.85, aliases: ["גבעת שמואל"] },
  { name: "פתח תקווה", region: "gush_dan", lat: 32.09, lng: 34.88, aliases: ["פתח תקווה", "פתח תקוה", "פת", "קריית אריה", "קרית אריה", "ק אריה", "קאריה", "סגולה"] },
  { name: "ראש העין", region: "gush_dan", lat: 32.095, lng: 34.95, aliases: ["ראש העין", "ראש-העין"] },
  { name: "פרדס כץ", region: "gush_dan", lat: 32.09, lng: 34.84, aliases: ["פרדס כץ"] },
  { name: "ברקן", region: "samaria", lat: 32.11, lng: 35.1, aliases: ["ברקן"] },
  { name: "קרני שומרון", region: "samaria", lat: 32.17, lng: 35.1, aliases: ["קרני שומרון"] },
  { name: "אריאל", region: "samaria", lat: 32.105, lng: 35.18, aliases: ["אריאל"] },
  { name: "ראשון לציון", region: "shfela", lat: 31.96, lng: 34.8, aliases: ["ראשון לציון", "ראשלצ", "ראשל צ"] },
  { name: "נס ציונה", region: "shfela", lat: 31.93, lng: 34.8, aliases: ["נס ציונה", "נס-ציונה"] },
  { name: "רחובות", region: "shfela", lat: 31.894, lng: 34.81, aliases: ["רחובות"] },
  { name: "יבנה", region: "shfela", lat: 31.877, lng: 34.74, aliases: ["יבנה", "גב ים יבנה"] },
  { name: "גן יבנה", region: "shfela", lat: 31.787, lng: 34.706, aliases: ["גן יבנה"] },
  { name: "אשדוד", region: "shfela", lat: 31.8, lng: 34.65, aliases: ["אשדוד"] },
  { name: "גדרה", region: "shfela", lat: 31.81, lng: 34.78, aliases: ["גדרה"] },
  { name: "רמלה", region: "shfela", lat: 31.93, lng: 34.87, aliases: ["רמלה"] },
  { name: "לוד", region: "shfela", lat: 31.95, lng: 34.89, aliases: ["לוד"] },
  { name: "מזור", region: "shfela", lat: 32.05, lng: 34.93, aliases: ["מזור"] },
  { name: "מצליח", region: "shfela", lat: 31.91, lng: 34.89, aliases: ["מצליח"] },
  { name: "גאליה", region: "shfela", lat: 31.9, lng: 34.75, aliases: ["גאליה"] },
  { name: "בית עזרא", region: "shfela", lat: 31.73, lng: 34.66, aliases: ["בית עזרא"] },
  { name: "קריית מלאכי", region: "south", lat: 31.73, lng: 34.75, aliases: ["קריית מלאכי", "קרית מלאכי", "ק מלאכי", "קמלאכי"] },
  { name: "מודיעין", region: "shfela", lat: 31.9, lng: 35.0, aliases: ["מודיעין"] },
  { name: "ירושלים", region: "jerusalem", lat: 31.77, lng: 35.21, aliases: ["ירושלים", "י ם"] },
  { name: "בית שמש", region: "jerusalem", lat: 31.75, lng: 34.99, aliases: ["בית שמש"] },
  { name: "מישור אדומים", region: "jerusalem", lat: 31.79, lng: 35.3, aliases: ["מישור אדומים"] },
  { name: "גבעת זאב", region: "jerusalem", lat: 31.86, lng: 35.17, aliases: ["גבעת זאב"] },
  { name: "באר שבע", region: "south", lat: 31.25, lng: 34.79, aliases: ["באר שבע", "בש"] },
  { name: "אשקלון", region: "south", lat: 31.67, lng: 34.57, aliases: ["אשקלון"] },
  { name: "שדרות", region: "south", lat: 31.52, lng: 34.6, aliases: ["שדרות"] },
  { name: "נתיבות", region: "south", lat: 31.42, lng: 34.59, aliases: ["נתיבות"] },
  { name: "קריית גת", region: "south", lat: 31.61, lng: 34.77, aliases: ["קריית גת", "קרית גת", "ק גת", "קגת"] },
  { name: "דימונה", region: "south", lat: 31.07, lng: 35.03, aliases: ["דימונה"] },
  { name: "ערד", region: "south", lat: 31.26, lng: 35.21, aliases: ["ערד"] },
  { name: "שקמים", region: "south", lat: 31.6, lng: 34.62, aliases: ["שקמים"] },
  { name: "חבל אילות", region: "south", lat: 29.9, lng: 35.06, aliases: ["חבל אילות", "גרופית", "אילת"] },
  { name: "ערבה", region: "south", lat: 30.6, lng: 35.18, aliases: ["ערבה", "מישור ימין"] },
];

/** נרמול לצורך התאמה: מסיר נקודות, גרשיים ומקפים, ומאחד רווחים. */
export function normalizeForMatch(s: string): string {
  return (" " + s + " ")
    .replace(/[֑-ׇ]/g, "") // ניקוד
    .replace(/["'״׳`]/g, "")
    .replace(/[.,\-–_/\\;:()]/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ");
}

export type ParsedAddress = {
  raw: string;
  street: string | null;
  city: string | null;
  zip: string | null;
  isPoBox: boolean;
  navigable: boolean;
  region: RegionCode | null;
  regionCertain: boolean;
  notes: string[];
};

const PO_BOX_RE = /(^|[\s,])(ת\.?\s?ד\.?|תא דואר|תיבת דואר)\s*\d+/;

export function parseAddress(raw: string | null | undefined): ParsedAddress {
  const notes: string[] = [];
  const text = (raw ?? "").toString().replace(/\s+/g, " ").trim();
  if (!text) {
    return { raw: "", street: null, city: null, zip: null, isPoBox: false, navigable: false, region: null, regionCertain: false, notes: ["כתובת חסרה"] };
  }
  const zips = text.replace(/(ת\.?\s?ד\.?)\s*\d+/g, " ").match(/(?<!\d)(\d{7}|\d{5})(?!\d)/g);
  const zip = zips ? zips[zips.length - 1] : null;
  const isPoBox = PO_BOX_RE.test(text) || /^ת\.?ד/.test(text);

  const norm = normalizeForMatch(text);
  // התאמה לפי הכינוי הארוך ביותר; נדרש גבול מילה משני הצדדים
  const hits: { city: City; alias: string; idx: number }[] = [];
  for (const city of CITIES) {
    for (const alias of city.aliases) {
      const a = " " + normalizeForMatch(alias).trim() + " ";
      const idx = norm.indexOf(a);
      if (idx >= 0) hits.push({ city, alias: a, idx });
    }
  }
  // מסננים כינויים שמוכלים בכינוי ארוך יותר שנמצא (למשל "יבנה" בתוך "גן יבנה")
  const filtered = hits.filter(
    (h) => !hits.some((o) => o !== h && o.alias.length > h.alias.length && o.idx <= h.idx && o.idx + o.alias.length >= h.idx + h.alias.length),
  );
  const distinctCities = Array.from(new Map(filtered.map((h) => [h.city.name, h.city])).values());

  let city: City | null = null;
  let regionCertain = false;
  if (distinctCities.length === 1) {
    city = distinctCities[0];
    regionCertain = true;
  } else if (distinctCities.length > 1) {
    // בוחרים את היישוב שמופיע אחרון (בדרך כלל היישוב בפועל), ומסמנים לבדיקה
    city = filtered.sort((a, b) => b.idx - a.idx)[0].city;
    const regions = new Set(distinctCities.map((c) => c.region));
    regionCertain = false;
    notes.push(`זוהו כמה יישובים בכתובת: ${distinctCities.map((c) => c.name).join(", ")}${regions.size > 1 ? " (באזורים שונים)" : ""}`);
  } else {
    notes.push("היישוב לא זוהה אוטומטית");
  }

  // רחוב: המקטע הראשון שאינו ת.ד/אזור תעשייה ומכיל מספר בית
  let street: string | null = null;
  if (!isPoBox || text.split(",").length > 2) {
    const seg = text
      .split(/[,;]/)
      .map((s) => s.trim())
      .find((s) => /[א-ת]{2,}.*\s?\d{1,4}\b/.test(s) && !PO_BOX_RE.test(" " + s) && !/^\d+$/.test(s) && !/^(א\.?ת|ד\.?נ)/.test(s));
    if (seg) street = seg.replace(/\b\d{5,7}\b/, "").trim();
  }

  // כתובת נחשבת יעד ניווט רק אם יש רחוב (לא ת.ד) ויישוב שזוהה
  const navigable = !!street && !!city;
  if (isPoBox && !street) notes.push("תיבת דואר — אינה יעד ניווט");
  if (!street && !isPoBox) notes.push("כתובת חלקית — חסר רחוב ומספר");

  return { raw: text, street, city: city?.name ?? null, zip, isPoBox, navigable, region: city?.region ?? null, regionCertain, notes };
}

export function cityCoords(cityName: string | null | undefined): { lat: number; lng: number } | null {
  if (!cityName) return null;
  const c = CITIES.find((x) => x.name === cityName);
  return c ? { lat: c.lat, lng: c.lng } : null;
}

export function findCityByText(text: string): City | null {
  const name = parseAddress(text).city;
  return name ? CITIES.find((c) => c.name === name) ?? null : null;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** הערכת זמן נסיעה בדקות: מרחק אווירי × 1.35, ממוצע 55 קמ"ש, מינימום 10 דקות. הערכה בלבד. */
export function estimateDriveMinutes(a: { lat: number; lng: number } | null, b: { lat: number; lng: number } | null): number | null {
  if (!a || !b) return null;
  const km = haversineKm(a, b) * 1.35;
  return Math.max(10, Math.round((km / 55) * 60));
}

export function regionName(code: string | null | undefined) {
  if (!code) return "לא משויך";
  return REGIONS[code as RegionCode]?.name ?? code;
}

export function wazeLink(address: string) {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}
export function googleMapsLink(address: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}
