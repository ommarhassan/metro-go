import { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { issueTicket, loadTickets, qrImage, scanAtGate, tamper, ticketStatus, tokenFrom, type Ticket, type Verdict } from './ticketing';
import { fareForStops, lineColors, lineNames, linePaths, planRoute, stations, type LineId, type Route } from './metro';

type IconName = 'grid' | 'route' | 'ticket' | 'clock' | 'pin' | 'swap' | 'arrow' | 'chevron' | 'search' | 'train' | 'spark' | 'close' | 'check' | 'info' | 'menu' | 'heart' | 'external' | 'user';

function Icon({ name, size = 20, strokeWidth = 1.8 }: { name: IconName; size?: number; strokeWidth?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    route: <><circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v7a5 5 0 0 0 5 5h5M18 17V9a4 4 0 0 0-4-4h-2"/></>,
    ticket: <><path d="M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a4 4 0 0 0 0 8v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a4 4 0 0 0 0-8Z"/><path d="M13 4v3m0 3v4m0 3v3" strokeDasharray="2 3"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.3"/></>,
    swap: <><path d="M5 7h14m-4-4 4 4-4 4M19 17H5m4-4-4 4 4 4"/></>,
    arrow: <><path d="M19 12H5m6-6-6 6 6 6"/></>,
    chevron: <path d="m9 6 6 6-6 6"/>,
    search: <><circle cx="10.8" cy="10.8" r="7"/><path d="m16 16 5 5"/></>,
    train: <><rect x="5" y="2.5" width="14" height="16" rx="4"/><path d="M5 11h14M8 22l2-3.5m6 0 2 3.5M8.5 15h.01M15.5 15h.01"/></>,
    spark: <><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2ZM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></>,
    close: <path d="M5 5 19 19M19 5 5 19"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
    heart: <path d="M20.8 8.5c0 4.4-8.8 10.3-8.8 10.3S3.2 12.9 3.2 8.5a4.6 4.6 0 0 1 8.8-1.8 4.6 4.6 0 0 1 8.8 1.8Z"/>,
    external: <><path d="M13 5h6v6m0-6-9 9"/><path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

const nav = [
  { id: 'home', label: 'الرئيسية', icon: 'grid' },
  { id: 'lines', label: 'الخطوط والمحطات', icon: 'route' },
  { id: 'tickets', label: 'التذاكر والأسعار', icon: 'ticket' },
  { id: 'mytickets', label: 'تذاكري', icon: 'ticket' },
  { id: 'gate', label: 'بوابة التحقق', icon: 'train' },
] as const;
type Page = typeof nav[number]['id'];
const dateFormat = new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Cairo' });
const timeFormat = new Intl.DateTimeFormat('ar-EG', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Cairo' });
const num = (n: number) => new Intl.NumberFormat('ar-EG').format(n);

function StationPicker({ label, value, onChange, accent }: { label: string; value: string; onChange: (value: string) => void; accent: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const filtered = stations.filter(s => s.name.includes(query.trim())).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  return <div className="station-picker" ref={wrap}>
    <span className="field-label">{label}</span>
    <button type="button" className={`station-trigger ${open ? 'is-open' : ''}`} onClick={() => { setQuery(''); setOpen(!open); }} aria-expanded={open} aria-label={`${label}: ${value || 'اختر محطة'}`}>
      <span className="station-dot" style={{ borderColor: accent }}><span style={{ background: accent }}/></span>
      <span className={value ? '' : 'muted'}>{value || 'اختر محطة'}</span>
      <span className="trigger-chevron"><Icon name="chevron" size={17}/></span>
    </button>
    {open && <div className="station-dropdown">
      <div className="station-search"><Icon name="search" size={18}/><input autoFocus placeholder="ابحث عن محطة..." value={query} onChange={e => setQuery(e.target.value)} aria-label="ابحث عن محطة" /></div>
      <div className="station-list">
        {filtered.length ? filtered.map(s => <button key={s.id} type="button" className={`station-option ${value === s.id ? 'selected' : ''}`} onClick={() => { onChange(s.id); setOpen(false); setQuery(''); }}>
          <span>{s.name}</span><span className="option-lines">{s.lines.map(line => <i key={line} style={{ background: lineColors[line] }} title={lineNames[line]}/>)}</span>
        </button>) : <div className="empty-search">لا توجد محطة بهذا الاسم</div>}
      </div>
    </div>}
  </div>;
}

function LineBadge({ line }: { line: LineId }) { return <span className="line-badge" style={{ color: lineColors[line], backgroundColor: `${lineColors[line]}18` }}><span style={{ backgroundColor: lineColors[line] }}/>{lineNames[line]}</span>; }

function RouteResult({ route, from, to, onTicket }: { route: Route; from: string; to: string; onTicket: () => void }) {
  const changes = route.names.flatMap((name, i) => i > 0 && i < route.lines.length && route.lines[i] !== route.lines[i - 1] ? [{ name, from: route.lines[i - 1], to: route.lines[i] }] : []);
  const segments: { line: LineId; start: string; end: string; stops: number }[] = [];
  route.lines.forEach((line, i) => {
    if (segments.length && segments[segments.length - 1].line === line) { segments[segments.length - 1].end = route.names[i + 1]; segments[segments.length - 1].stops++; }
    else segments.push({ line, start: route.names[i], end: route.names[i + 1], stops: 1 });
  });
  return <div className="result-card">
    <div className="result-head"><div><span className="eyebrow green">مسارك المقترح</span><h3>وصلتك أسهل مما تتخيل</h3></div><span className="result-pill"><Icon name="check" size={14}/> مسار متاح</span></div>
    <div className="result-stats"><div><span>المدة التقديرية</span><strong>{num(route.minutes)} <small>دقيقة</small></strong></div><div><span>عدد المحطات</span><strong>{num(route.stops)} <small>محطة</small></strong></div><div><span>سعر التذكرة</span><strong>{num(route.fare)} <small>جنيه</small></strong></div></div>
    <div className="route-timeline">
      <div className="timeline-row"><span className="timeline-marker origin"/><div><strong>{from}</strong><small>بداية الرحلة</small></div></div>
      {segments.map((segment, i) => <div className="timeline-segment" key={`${segment.line}-${i}`} style={{ '--segment-color': lineColors[segment.line] } as React.CSSProperties}>
        <span className="segment-track"/><div className="segment-content"><LineBadge line={segment.line}/><span>{num(segment.stops)} {segment.stops === 1 ? 'محطة' : 'محطات'}</span></div>
        {changes[i] && <div className="transfer-row"><span className="timeline-marker transfer"/><div><strong>{changes[i].name}</strong><small>بدّل إلى {lineNames[changes[i].to]}</small></div><span className="transfer-tag">تبديل</span></div>}
      </div>)}
      <div className="timeline-row end"><span className="timeline-marker destination"/><div><strong>{to}</strong><small>الوصول</small></div></div>
    </div>
    <button className="dark-button full" onClick={onTicket}><Icon name="ticket" size={19}/> اعرض تذكرة تجريبية <Icon name="arrow" size={18}/></button>
    <p className="estimate-note"><Icon name="info" size={15}/> المدة تقديرية وليست موعد قطار مباشر. السعر حسب شريحة عدد المحطات.</p>
  </div>;
}

function TicketModal({ route, onClose }: { route: Route; onClose: () => void }) {
  const [name, setName] = useState('');
  const [pay, setPay] = useState('Visa');
  const [step, setStep] = useState<'form' | 'paying' | 'issued'>('form');
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [qr, setQr] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [onClose]);
  const submit = async () => {
    setStep('paying'); setFailed(false);
    try {
      const [t] = await Promise.all([issueTicket(route, name.trim(), pay), new Promise(r => setTimeout(r, 1200))]);
      setTicket(t); setQr(await qrImage(t.token)); setStep('issued');
    } catch { setFailed(true); setStep('form'); }
  };
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" dir="rtl">
    <button className="modal-close" onClick={onClose} aria-label="إغلاق"><Icon name="close" size={20}/></button>
    {step !== 'issued' || !ticket ? <><div className="modal-icon"><Icon name="ticket" size={26}/></div><span className="eyebrow green">احجز تذكرتك</span><h2 id="modal-title">ادفع واستلم تذكرة QR.</h2><p className="modal-copy">الدفع هنا تجريبي ومفيش أي فلوس بتتسحب. التذكرة بتشتغل على بوابة MetroGo التجريبية بس.</p>
      <div className="modal-route"><div><small>من</small><strong>{route.names[0]}</strong></div><Icon name="arrow" size={20}/><div><small>إلى</small><strong>{route.names.at(-1)}</strong></div></div>
      <div className="modal-price"><span>السعر الإرشادي للرحلة</span><strong>{num(route.fare)} جنيه</strong></div>
      <label className="name-label" htmlFor="rider-name">اسم الراكب</label><input id="rider-name" className="name-input" placeholder="الاسم اللي هيتكتب على التذكرة" maxLength={50} value={name} onChange={e => setName(e.target.value)} disabled={step === 'paying'}/>
      <div className="pay-options" role="radiogroup" aria-label="وسيلة الدفع">{['Visa', 'محفظة إلكترونية'].map(m => <button key={m} role="radio" aria-checked={pay === m} className={`pay-option ${pay === m ? 'active' : ''}`} onClick={() => setPay(m)} disabled={step === 'paying'}>{m}</button>)}</div>
      {failed && <p className="modal-copy" role="alert">حصلت مشكلة وإحنا بنصدر التذكرة. جرّب تاني.</p>}
      <button className="dark-button full modal-action" disabled={!name.trim() || step === 'paying'} onClick={submit}>{step === 'paying' ? 'جاري الدفع…' : <>ادفع {num(route.fare)} جنيه <Icon name="arrow" size={18}/></>}</button>
    </> : <><div className="ticket-preview"><div className="ticket-preview-top"><span className="ticket-brand">metro<span>go</span><i>.</i></span><span>{ticket.id}</span></div><div className="ticket-preview-body"><span className="eyebrow">رحلة واحدة · صالحة لمدة ساعتين</span><h2 id="modal-title">رحلة سعيدة، {ticket.name}</h2><div className="ticket-stops"><div><small>من</small><strong>{ticket.from}</strong></div><Icon name="arrow" size={18}/><div><small>إلى</small><strong>{ticket.to}</strong></div></div><img className="qr-img" src={qr} alt="رمز QR للتذكرة، يُمسح مرة واحدة عند البوابة"/><div className="ticket-bottom"><span>{num(ticket.stops)} محطة · {ticket.pay}</span><strong>{num(ticket.fare)} جنيه</strong></div></div></div><p className="estimate-note center">التذكرة اتحفظت على جهازك وبتشتغل من غير إنترنت. امسحها من صفحة «بوابة التحقق».</p><button className="outline-button full" onClick={onClose}>تمام</button></>}
  </div></div>;
}

const statusText = { valid: 'صالحة', used: 'مستخدمة', expired: 'منتهية' } as const;
const clock = new Intl.DateTimeFormat('ar-EG', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Cairo' });

function MyTicketsPage({ onPlan }: { onPlan: () => void }) {
  const [tickets] = useState(loadTickets);
  const [qrs, setQrs] = useState<Record<string, string>>({});
  useEffect(() => { tickets.forEach(async t => { const url = await qrImage(t.token); setQrs(q => ({ ...q, [t.id]: url })); }); }, [tickets]);
  return <div className="subpage"><div className="page-heading"><span className="eyebrow green">محفظتك</span><h1>تذاكرك، في جيبك.</h1><p>كل تذكرة اشتريتها محفوظة هنا وبتشتغل من غير إنترنت.</p></div>
    {tickets.length === 0 ? <div className="result-card empty-result"><div className="empty-illustration"><Icon name="ticket" size={48}/></div><span className="eyebrow green">لسه مفيش</span><h3>مفيش تذاكر محفوظة.</h3><p>خطط رحلتك واحجز أول تذكرة.</p><button className="dark-button" onClick={onPlan}>ابدأ رحلة جديدة <Icon name="arrow" size={16}/></button></div>
      : <div className="wallet-grid">{tickets.map(t => { const st = ticketStatus(t); return <article className={`wallet-card ${st}`} key={t.id}>{qrs[t.id] && <img className="qr-img small" src={qrs[t.id]} alt={`رمز تذكرة ${t.id}`}/>}<div><span className={`status-pill ${st}`}>{statusText[st]}</span><h3>{t.from} ← {t.to}</h3><p>{t.name} · {num(t.fare)} جنيه</p><small>{t.id} · تنتهي {clock.format(t.exp)}</small></div></article>; })}</div>}
  </div>;
}

function GatePage() {
  const [tickets, setTickets] = useState(loadTickets);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const handle = async (token: string) => {
    setVerdict(await scanAtGate(token)); setTickets(loadTickets());
    window.setTimeout(() => setVerdict(null), 4500);
  };
  useEffect(() => {
    if (!scanning) return;
    let stop = false; let stream: MediaStream | undefined;
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(s => {
      stream = s; const v = video.current!; v.srcObject = s; void v.play();
      const tick = () => {
        if (stop) return;
        if (v.readyState === v.HAVE_ENOUGH_DATA) {
          canvas.width = v.videoWidth; canvas.height = v.videoHeight; ctx.drawImage(v, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height); const code = jsQR(img.data, img.width, img.height);
          if (code) { stop = true; setScanning(false); void handle(tokenFrom(code.data)); return; }
        }
        requestAnimationFrame(tick);
      };
      tick();
    }).catch(() => { setScanning(false); setCamError(true); });
    return () => { stop = true; stream?.getTracks().forEach(t => t.stop()); };
  }, [scanning]);
  const state = verdict ? (verdict.ok ? 'ok' : 'no') : 'idle';
  return <div className="subpage"><div className="page-heading"><span className="eyebrow green">محاكاة ماكينة الدخول</span><h1>امسح، وادخل.</h1><p>البوابة بتتحقق من التوقيع والصلاحية، وبترفض أي رمز اتستخدم قبل كده.</p></div>
    <div className="network-layout"><div className={`gate-card ${state}`} aria-live="polite"><div className="gate-doors"><i/><i/></div>
      {scanning ? <video ref={video} className="scan-video" muted playsInline/> : <><h2>{!verdict ? 'جاهزة للمسح' : verdict.ok ? 'اتفضل، تم التحقق ✓' : `مرفوض: ${verdict.message}`}</h2><p>{!verdict ? 'اختار تذكرة من القائمة أو شغّل الكاميرا.' : verdict.ok ? `${verdict.name} · ${verdict.from} ← ${verdict.to}` : 'البوابة فضلت مقفولة.'}</p></>}
      <div className="gate-actions"><button className="dark-button" onClick={() => { setCamError(false); setScanning(s => !s); }}>{scanning ? 'إيقاف الكاميرا' : 'امسح بالكاميرا'}</button>
        <button className="outline-button" disabled={!tickets[0]} onClick={() => handle(tamper(tickets[0].token))}>جرّب رمز مزوّر</button></div>
      {camError && <p className="gate-error">مقدرناش نفتح الكاميرا. اسمح بالوصول أو امسح من القائمة.</p>}
    </div>
    <aside className="network-aside"><h3>تذاكرك</h3>{tickets.length === 0 ? <p>احجز تذكرة الأول من الرئيسية.</p> : <ul className="gate-list">{tickets.map(t => { const st = ticketStatus(t); return <li key={t.id}><div><strong>{t.from} ← {t.to}</strong><small>{t.id} · {statusText[st]}</small></div><button className="outline-button" onClick={() => handle(t.token)}>امسح</button></li>; })}</ul>}</aside></div>
  </div>;
}

function LinesPage() {
  const [selected, setSelected] = useState<LineId>('1');
  const paths = linePaths.filter(p => p.line === selected);
  const count = new Set(paths.flatMap(p => p.names)).size;
  return <div className="subpage"><div className="page-heading"><span className="eyebrow green">شبكة القاهرة الكبرى</span><h1>كل محطة، في مكان واحد.</h1><p>تصفّح محطات الخطوط الثلاثة العاملة، بما فيها فرعا الخط الثالث.</p></div>
    <div className="line-tabs">{(['1', '2', '3'] as LineId[]).map(id => <button key={id} className={`line-tab ${selected === id ? 'active' : ''}`} onClick={() => setSelected(id)} style={{ '--line-color': lineColors[id] } as React.CSSProperties}><span className="line-tab-dot"/>{lineNames[id]}<small>{new Set(linePaths.filter(p => p.line === id).flatMap(p => p.names)).size} محطة</small></button>)}</div>
    <div className="network-layout"><div className="network-card"><div className="network-header"><div><span className="eyebrow green">دليل المحطات</span><h2>{lineNames[selected]}</h2></div><span className="network-count">{num(count)} محطة</span></div>
      {paths.map((path, index) => <div className="network-branch" key={index}>{path.branch && <h3>{path.branch}</h3>}<div className="network-stations" style={{ '--line-color': lineColors[selected] } as React.CSSProperties}>{path.names.map((name, i) => { const station = stations.find(s => s.name === name)!; return <div className="network-station" key={name}><span className={`network-node ${station.lines.length > 1 ? 'interchange' : ''}`}/><span className="network-name">{name}</span>{station.lines.length > 1 && <span className="interchange-label">تبديل {station.lines.filter(l => l !== selected).map(l => lineNames[l]).join('، ')}</span>}{i === path.names.length - 1 && <span className="terminal-label">نهاية المسار</span>}</div>; })}</div></div>)}
    </div><aside className="network-aside"><div className="aside-symbol"><Icon name="route" size={26}/></div><h3>شبكة تربط المدينة ببعضها.</h3><p>من حلوان للمرج، ومن شبرا للمنيب، لحد عدلي منصور وفرعَي الخط الثالث. اختار محطتك وخطط رحلتك بسهولة.</p><div className="aside-divider"/><span>المحطات الفريدة بالشبكة</span><strong>{num(stations.length)}</strong><small>محطة تشغيلية على ٣ خطوط</small></aside></div>
    <p className="source-note">قائمة الخطوط التشغيلية فقط؛ المحطات المخططة وغير المفتتحة غير معروضة. <a href="https://www.mobilitycairo.com/en/travel-information/maps" target="_blank" rel="noreferrer">راجع خريطة المشغّل <Icon name="external" size={13}/></a></p>
  </div>;
}

function TicketsPage({ onPlan }: { onPlan: () => void }) {
  const tiers = [{ stops: 'من ١ إلى ٩ محطات', price: 10, hint: 'للمشاوير القريبة' }, { stops: 'من ١٠ إلى ١٦ محطة', price: 12, hint: 'لمشاويرك اليومية' }, { stops: 'من ١٧ إلى ٢٣ محطة', price: 15, hint: 'المسافات المتوسطة' }, { stops: '٢٤ محطة فأكثر', price: 20, hint: 'للمشاوير الطويلة' }];
  return <div className="subpage"><div className="page-heading"><span className="eyebrow green">أسعار التذاكر</span><h1>اعرف تكلفتها قبل ما تتحرك.</h1><p>الأسعار العادية لتذكرة الرحلة الواحدة حسب عدد المحطات في مسارك.</p></div><div className="fare-grid">{tiers.map((tier, i) => <div className={`fare-card ${i === 1 ? 'featured' : ''}`} key={tier.price}><div className="fare-card-top"><span>0{i + 1}</span><Icon name="ticket" size={22}/></div><span className="fare-hint">{tier.hint}</span><h2>{tier.stops}</h2><div className="fare-value">{num(tier.price)} <small>جنيه مصري</small></div><div className="fare-card-bottom"><Icon name="check" size={16}/> تذكرة رحلة واحدة</div></div>)}</div><div className="fare-info"><div className="fare-info-icon"><Icon name="info" size={24}/></div><div><h3>معلومة مهمة عن الأسعار</h3><p>دي أسعار التذاكر العادية المنشورة من مشغّل الخط الثالث Mobility Cairo. الخصومات والاشتراكات لها شروط وأسعار مختلفة، وقد تتغير التعريفة الرسمية. التأكيد النهائي عند الشراء من المحطة.</p><a href="https://www.mobilitycairo.com/en/tickets/choose-your-ticket" target="_blank" rel="noreferrer">عرض الأسعار من المصدر <Icon name="external" size={15}/></a></div></div><div className="ticket-cta"><div><span className="eyebrow">مستعد للانطلاق؟</span><h2>خطط رحلتك واعرف سعرها فورًا.</h2></div><button className="light-button" onClick={onPlan}>خطط رحلتي <Icon name="arrow" size={18}/></button></div></div>;
}

function Shell() {
  const [page, setPage] = useState<Page>('home');
  const [from, setFrom] = useState('الشهداء');
  const [to, setTo] = useState('جامعة القاهرة');
  const [shownRoute, setShownRoute] = useState<Route | null>(() => planRoute('الشهداء', 'جامعة القاهرة'));
  const [error, setError] = useState('');
  const [ticketOpen, setTicketOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30000); return () => clearInterval(timer); }, []);
  const formattedDate = useMemo(() => dateFormat.format(now), [now]);
  const submit = () => { if (!from || !to) { setError('اختار محطة البداية والوصول الأول.'); setShownRoute(null); return; } if (from === to) { setError('اختار محطتين مختلفتين عشان نقدر نحسب الرحلة.'); setShownRoute(null); return; } const route = planRoute(from, to); setShownRoute(route); setError(route ? '' : 'مش قادرين نحدد مسار بين المحطتين.'); };
  const go = (id: Page) => { setPage(id); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  return <div className="app-shell" dir="rtl">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Icon name="train" size={24} strokeWidth={2.1}/></div><span>metro<strong>go</strong><i>.</i><small>رحلتك، على طريقتك</small></span></div>
      <div className="sidebar-section-title">القائمة الرئيسية</div><nav className="sidebar-nav" aria-label="القائمة الرئيسية">{nav.map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => go(item.id)}><Icon name={item.icon} size={20}/><span>{item.label}</span>{page === item.id && <span className="nav-active-indicator"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="side-help"><div className="side-help-icon"><Icon name="spark" size={21}/></div><strong>كل مشوار له حكاية.</strong><p>خطط رحلتك واستكشف المدينة خطوة بخطوة.</p><button onClick={() => go('home')}>ابدأ رحلة جديدة <Icon name="arrow" size={15}/></button></div><div className="sidebar-footer">صُنع لتبقى المدينة أقرب إليك <span>© MetroGo</span></div></div>
    </aside>
    {menuOpen && <button className="mobile-overlay" aria-label="إغلاق القائمة" onClick={() => setMenuOpen(false)}/>}
    <main className="main-content"><header className="topbar"><div className="topbar-right"><button className="mobile-menu" aria-label="فتح القائمة" onClick={() => setMenuOpen(true)}><Icon name="menu" size={22}/></button><span className="breadcrumb">MetroGo</span><Icon name="chevron" size={14}/><strong>{nav.find(n => n.id === page)?.label}</strong></div><div className="topbar-left"><span className="live-clock"><span className="live-dot"/> توقيت القاهرة <strong>{timeFormat.format(now)}</strong></span><span className="topbar-avatar"><Icon name="user" size={19}/></span></div></header>
      {page === 'home' ? <div className="dashboard"><div className="welcome"><div><span className="eyebrow green">صباحًا أو مساءً، المدينة مستنياك</span><h1>أهلًا بيك في <span>MetroGo.</span></h1><p>مشوارك الجاي أسهل من أي وقت فات. من أول محطة لآخر محطة، إحنا معاك.</p></div><div className="date-chip"><Icon name="clock" size={18}/>{formattedDate}</div></div>
        <section className="hero"><div className="hero-photo" role="img" aria-label="قطار مترو في محطة بالقاهرة"/><div className="hero-pattern"/><div className="hero-copy"><span className="hero-kicker"><span className="hero-kicker-dot"/> اكتشف القاهرة بطريقتك</span><h2>المشوار الحلو<br/>بيبدأ <em>بخطة.</em></h2><p>كل خطوط المترو ومحطاته بين إيديك. اختار وجهتك، وسيب الباقي علينا.</p><button onClick={() => document.getElementById('planner')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>خطط رحلتك دلوقتي <Icon name="arrow" size={18}/></button></div><div className="hero-photo-credit">تصوير: Abdelrahman Ismail / Unsplash</div></section>
        <div className="section-title-row"><div><span className="eyebrow green">يلا نتحرك</span><h2>رحلتك تبدأ من هنا <span className="heading-spark"><Icon name="spark" size={18}/></span></h2></div><span className="section-helper">خطوات بسيطة، ووصول أسرع.</span></div>
        <div className="planner-grid"><section className="planner-card" id="planner"><div className="card-top"><div className="card-icon"><Icon name="route" size={22}/></div><div><h3>خطط مشوارك</h3><p>قولنا رايح فين وهنظبطلك الطريق</p></div><span className="card-step">01 / خطط الرحلة</span></div><div className="picker-stack"><StationPicker label="محطة البداية" value={from} onChange={v => { setFrom(v); setError(''); setShownRoute(null); }} accent="#68aa82"/><button className="swap-button" onClick={() => { setFrom(to); setTo(from); setShownRoute(null); setError(''); }} aria-label="تبديل محطتي البداية والوصول"><Icon name="swap" size={18}/></button><StationPicker label="محطة الوصول" value={to} onChange={v => { setTo(v); setError(''); setShownRoute(null); }} accent="#dd8b67"/></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="dark-button plan-button" onClick={submit}>اعرض أفضل مسار <Icon name="arrow" size={19}/></button><div className="planner-foot"><Icon name="spark" size={16}/> مسار محسوب عبر الخطوط الثلاثة والمحطات التشغيلية</div></section>
          {shownRoute ? <RouteResult route={shownRoute} from={shownRoute.names[0]} to={shownRoute.names.at(-1)!} onTicket={() => setTicketOpen(true)}/> : <div className="result-card empty-result"><div className="empty-illustration"><Icon name="route" size={48}/></div><span className="eyebrow green">مستنيينك</span><h3>اختار محطتين، وشوف الطريق.</h3><p>هنحسبلك المسار والمحطات والتكلفة التقديرية في ثواني.</p></div>}
        </div>
        <div className="quick-section"><div className="section-title-row"><div><span className="eyebrow green">مفيد ليك</span><h2>كل اللي تحتاجه في سكة واحدة.</h2></div></div><div className="quick-grid"><button className="quick-card" onClick={() => go('lines')}><span className="quick-icon peach"><Icon name="route" size={24}/></span><span><strong>استكشف الخطوط</strong><small>شوف كل المحطات ومساراتها</small></span><Icon name="arrow" size={18}/></button><button className="quick-card" onClick={() => go('tickets')}><span className="quick-icon mint"><Icon name="ticket" size={24}/></span><span><strong>أسعار التذاكر</strong><small>اعرف السعر قبل ما تتحرك</small></span><Icon name="arrow" size={18}/></button><div className="quick-card static"><span className="quick-icon lavender"><Icon name="clock" size={24}/></span><span><strong>وقت مضبوط</strong><small>الساعة بتوقيت القاهرة مباشرة</small></span><span className="quick-clock">{timeFormat.format(now)}</span></div></div></div>
        <footer className="main-footer"><span>MetroGo — نموذج أولي لتجربة التنقل بالمترو</span><span>المواعيد تقديرية · التذاكر تجريبية وليست صالحة للسفر</span></footer>
      </div> : page === 'lines' ? <LinesPage/> : page === 'mytickets' ? <MyTicketsPage onPlan={() => go('home')}/> : page === 'gate' ? <GatePage/> : <TicketsPage onPlan={() => go('home')}/>}
    </main>{ticketOpen && shownRoute && <TicketModal route={shownRoute} onClose={() => setTicketOpen(false)}/>}
  </div>;
}

function VerifyScreen({ token }: { token: string }) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const ran = useRef(false);
  useEffect(() => { if (ran.current) return; ran.current = true; void scanAtGate(token).then(setVerdict); }, [token]);
  const state = verdict ? (verdict.ok ? 'ok' : 'no') : 'idle';
  return <div className="verify-screen" dir="rtl"><div className={`gate-card ${state}`} aria-live="polite"><div className="gate-doors"><i/><i/></div>
    <h2>{!verdict ? 'جاري التحقق…' : verdict.ok ? 'تم التحقق ✓ اتفضل' : `مرفوض: ${verdict.message}`}</h2>
    <p>{verdict?.ok ? `${verdict.name} · ${verdict.from} ← ${verdict.to}` : verdict ? 'البوابة فضلت مقفولة.' : ''}</p>
    <div className="gate-actions"><a className="outline-button" href={window.location.pathname}>الرجوع لـ MetroGo</a></div></div></div>;
}

export default function App() {
  const token = new URLSearchParams(window.location.search).get('verify');
  return token ? <VerifyScreen token={token}/> : <Shell/>;
}
