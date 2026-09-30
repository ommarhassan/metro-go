export type LineId = '1' | '2' | '3';
export type Station = { id: string; name: string; lines: LineId[] };

// Operational Cairo Metro stations only. Line 3 has two branches after Kit Kat.
// Planned stations (including Line 4 and the airport branch) are intentionally excluded.
export const linePaths: { line: LineId; branch?: string; names: string[] }[] = [
  {
    line: '1',
    names: 'المرج الجديدة|المرج|عزبة النخل|عين شمس|المطرية|حلمية الزيتون|حدائق الزيتون|سراي القبة|حمامات القبة|كوبري القبة|منشية الصدر|الدمرداش|غمرة|الشهداء|عرابي|جمال عبد الناصر|السادات|سعد زغلول|السيدة زينب|الملك الصالح|مار جرجس|الزهراء|دار السلام|حدائق المعادي|المعادي|ثكنات المعادي|طرة البلد|كوتسيكا|طرة الأسمنت|المعصرة|حدائق حلوان|وادي حوف|جامعة حلوان|عين حلوان|حلوان'.split('|'),
  },
  {
    line: '2',
    names: 'شبرا الخيمة|كلية الزراعة|المظلات|الخلفاوي|سانت تريزا|روض الفرج|مسرة|الشهداء|العتبة|محمد نجيب|السادات|الأوبرا|الدقي|البحوث|جامعة القاهرة|فيصل|الجيزة|أم المصريين|ساقية مكي|المنيب'.split('|'),
  },
  {
    line: '3',
    names: 'عدلي منصور|الهايكستب|عمر بن الخطاب|قباء|هشام بركات|النزهة|نادي الشمس|ألف مسكن|هليوبوليس|هارون|الأهرام|كلية البنات|الاستاد|أرض المعارض|العباسية|عبده باشا|الجيش|باب الشعرية|العتبة|جمال عبد الناصر|ماسبيرو|صفاء حجازي|الكيت كات'.split('|'),
  },
  { line: '3', branch: 'فرع روض الفرج', names: 'الكيت كات|السودان|إمبابة|البوهي|القومية|الطريق الدائري|محور روض الفرج'.split('|') },
  { line: '3', branch: 'فرع جامعة القاهرة', names: 'الكيت كات|التوفيقية|وادي النيل|جامعة الدول العربية|بولاق الدكرور|جامعة القاهرة'.split('|') },
];

const stationMap = new Map<string, Station>();
for (const path of linePaths) {
  for (const name of path.names) {
    const existing = stationMap.get(name);
    if (existing) {
      if (!existing.lines.includes(path.line)) existing.lines.push(path.line);
    } else stationMap.set(name, { id: name, name, lines: [path.line] });
  }
}
export const stations = [...stationMap.values()];
export const lineColors: Record<LineId, string> = { '1': '#e06654', '2': '#355f9c', '3': '#72966b' };
export const lineNames: Record<LineId, string> = { '1': 'الخط الأول', '2': 'الخط الثاني', '3': 'الخط الثالث' };

type Edge = { to: string; line: LineId };
const graph = new Map<string, Edge[]>();
for (const station of stations) graph.set(station.id, []);
for (const path of linePaths) {
  for (let i = 1; i < path.names.length; i++) {
    graph.get(path.names[i - 1])!.push({ to: path.names[i], line: path.line });
    graph.get(path.names[i])!.push({ to: path.names[i - 1], line: path.line });
  }
}

export type Route = { names: string[]; lines: LineId[]; stops: number; transfers: number; minutes: number; fare: number };

// Optimize transfers first, then stops. Changing lines at an interchange does not add a station.
export function planRoute(from: string, to: string): Route | null {
  if (!graph.has(from) || !graph.has(to) || from === to) return null;
  type Node = { station: string; line: LineId | null; cost: number; names: string[]; lines: LineId[]; transfers: number };
  const queue: Node[] = [{ station: from, line: null, cost: 0, names: [from], lines: [], transfers: 0 }];
  const best = new Map<string, number>();
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift()!;
    const key = `${current.station}:${current.line}`;
    if (best.has(key) && best.get(key)! <= current.cost) continue;
    best.set(key, current.cost);
    if (current.station === to) {
      const stops = current.lines.length;
      return { names: current.names, lines: current.lines, stops, transfers: current.transfers, minutes: Math.round(stops * 2.5 + current.transfers * 5), fare: fareForStops(stops) };
    }
    for (const edge of graph.get(current.station)!) {
      const transfer = current.line !== null && current.line !== edge.line ? 1 : 0;
      const cost = current.cost + 1 + transfer * 100;
      if (cost < (best.get(`${edge.to}:${edge.line}`) ?? Infinity)) {
        queue.push({ station: edge.to, line: edge.line, cost, names: [...current.names, edge.to], lines: [...current.lines, edge.line], transfers: current.transfers + transfer });
      }
    }
  }
  return null;
}

// Standard single-use ticket tiers, as listed by Mobility Cairo.
export function fareForStops(stops: number) {
  if (stops <= 9) return 10;
  if (stops <= 16) return 12;
  if (stops <= 23) return 15;
  return 20;
}
