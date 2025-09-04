import React, { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { FilePicker } from "@capawesome/capacitor-file-picker";

/* =========================================================
   Error Boundary
   ========================================================= */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: any }> {
  constructor(props: any) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: any) { return { error }; }
  componentDidCatch(err: any, info: any) { try { console.error('[UI Error]', err, info); } catch {} }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Une erreur est survenue dans l'interface.</div>
          <div style={{ fontSize: 12, opacity: .8 }}>Vérifiez la dernière action ou rechargez la page.</div>
        </div>
      );
    }
    return <>{this.props.children}</>;
  }
}

/* =========================================================
   Couleurs & mini UI
   ========================================================= */
const COLORS = {
  ink: "#0f172a",
  slate: "#64748b",
  bg: "#f8fafc",
  white: "#fff",
  green: "#10b981",
  red: "#ef4444",
  amber: "#f59e0b",
  blue: "#3b82f6",
  indigo: "#6366f1",
  teal: "#14b8a6",
} as const;

function renderSafe(node: React.ReactNode): React.ReactNode {
  if (node === undefined || node === null || typeof node === "boolean") return null;
  if (Array.isArray(node)) {
    return (node as any[]).map((n, i) => <React.Fragment key={i}>{renderSafe(n)}</React.Fragment>);
  }
  if (typeof node === "string" || typeof node === "number" || React.isValidElement(node)) return node;
  return null;
}

const Card: React.FC<React.PropsWithChildren<{ style?: React.CSSProperties }>> = ({ style, children }) => (
  <div style={{ background: COLORS.white, borderRadius: 16, padding: 16, boxShadow: "0 2px 10px rgba(2,6,23,.08)", ...style }}>
    {renderSafe(children)}
  </div>
);
const H1: React.FC<React.PropsWithChildren<{}>> = ({ children }) => (
  <h1 style={{ fontWeight: 800, fontSize: 20, marginBottom: 12 }}>{renderSafe(children)}</h1>
);
const H2: React.FC<React.PropsWithChildren<{ title?: string }>> = ({ children, title }) => (
  <h2 title={title} style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{renderSafe(children)}</h2>
);

const LabelInput: React.FC<{ label: string; hint?: React.ReactNode; children: React.ReactElement<any, any> | null }> = ({ label, hint, children }) => (
  <div>
    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{label}</div>
    <div style={{ display: "grid" }}>
      {children
        ? React.cloneElement(children, {
            ...(children.props || {}),
            style: {
              ...(children.props?.style || {}),
              width: "100%",
              border: "1px solid #cbd5e1",
              borderRadius: 12,
              padding: "8px 12px",
            },
          })
        : null}
    </div>
    {hint ? (
      <div style={{ fontSize: 11, color: COLORS.slate, marginTop: 6 }}>{renderSafe(hint)}</div>
    ) : null}
  </div>
);

const Pill: React.FC<React.PropsWithChildren<{ color?: string }>> = ({ children, color = COLORS.ink }) => (
  <span style={{ padding: "4px 8px", borderRadius: 999, background: "rgba(2,6,23,.06)", color }}>{renderSafe(children)}</span>
);

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }> = ({
  variant = "primary",
  style,
  children,
  ...props
}) => (
  <button
    {...props}
    style={{
      padding: "10px 14px",
      borderRadius: 12,
      border: "none",
      cursor: "pointer",
      background: variant === "primary" ? COLORS.indigo : "transparent",
      color: variant === "primary" ? COLORS.white : COLORS.ink,
      boxShadow: variant === "primary" ? "0 2px 8px rgba(79,70,229,.35)" : "none",
      ...style,
    }}
  >
    {renderSafe(children)}
  </button>
);

/* =========================================================
   Helpers & stats
   ========================================================= */
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const debutSemaine = (d: Date) => {
  const tmp = new Date(d);
  const day = (tmp.getDay() + 6) % 7; // lundi=0
  tmp.setDate(tmp.getDate() - day);
  tmp.setHours(0, 0, 0, 0);
  return tmp;
};
const ajouterJours = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const joursSemaine = (debut: Date) => [...Array(7)].map((_, i) => ajouterJours(debut, i));
const moyenne = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const ecartType = (a: number[]) => {
  if (a.length <= 1) return 0;
  const m = moyenne(a);
  return Math.sqrt(moyenne(a.map((x) => (x - m) ** 2)));
};

/* =========================================================
   Domaines & calculs
   ========================================================= */
type BienEtre = {
  // Hooper « qualité » 1–7 : 1 = très mauvais / 7 = très bon
  sommeil?: number;
  douleurs?: number;
  stress?: number;
  // Items « positifs » 1–7 : 1 = très faible/mauvaise / 7 = très élevée/très bonne
  energie?: number;
  humeur?: number;
  // Suivi séparé : durée du sommeil (heures)
  sommeilDuree?: number;
  maladie?: number;
};

const CHAMPS_BIEN_ETRE = ["sommeil", "energie", "douleurs", "stress", "humeur"] as const;
type BienEtreKey = typeof CHAMPS_BIEN_ETRE[number];
const LABELS_BIEN_ETRE: Record<BienEtreKey, string> = {
  sommeil: "Sommeil (qualité 1–7)",
  energie: "Énergie (1–7)",
  douleurs: "Douleurs (1–7)",
  stress: "Stress (1–7)",
  humeur: "Humeur (1–7)",
};

type Seance = { duree: number; rpe: number };
type DonneesAthlete = { seances: Record<string, Seance[]>; bienEtre: Record<string, BienEtre> };

function calculerScoreSante({ sommeil = 4, energie = 4, douleurs = 4, stress = 4, humeur = 4, maladie = 0 }: BienEtre) {
  const s = clamp(sommeil, 1, 7);
  const e = clamp(energie, 1, 7);
  const invDouleurs = 8 - clamp(douleurs, 1, 7);
  const invStress = 8 - clamp(stress, 1, 7);
  const h = clamp(humeur, 1, 7);
  const poids = { sommeil: 0.22, energie: 0.22, douleurs: 0.18, stress: 0.18, humeur: 0.18 };
  const base = (s * poids.sommeil + e * poids.energie + invDouleurs * poids.douleurs + invStress * poids.stress + h * poids.humeur) / 7;
  const penaliteMaladie = maladie ? 0.15 : 0;
  return clamp(Math.round((base - penaliteMaladie) * 100), 0, 100);
}

const chargeJour = (seances?: Seance[]) => (seances || []).reduce((s, x) => s + (Number(x.duree) || 0) * (Number(x.rpe) || 0), 0);

function calculerMetriques(dates: Date[], data: DonneesAthlete) {
  const charges: number[] = [];
  const sante: number[] = [];
  const sommeilJ: number[] = [];
  const symptJ: number[] = [];
  const sommeilH: number[] = [];
  let chargeTotale = 0;

  dates.forEach((d) => {
    const key = fmt(d);
    const chargeDuJour = chargeJour(data.seances?.[key]);
    charges.push(chargeDuJour);
    chargeTotale += chargeDuJour;

    const b = data.bienEtre?.[key] || {};
    const score = calculerScoreSante({
      sommeil: Number(b.sommeil ?? 4),
      energie: Number(b.energie ?? 4),
      douleurs: Number(b.douleurs ?? 4),
      stress: Number(b.stress ?? 4),
      humeur: Number(b.humeur ?? 4),
      maladie: Number(b.maladie ?? 0),
    });
    sante.push(score);

    const sommeilQ = Number(b.sommeil ?? 0);
    const fatigue = b.energie ? 8 - Number(b.energie) : 0;
    const douleurs = Number(b.douleurs ?? 0);
    const stress = Number(b.stress ?? 0);
    const humeurBad = b.humeur ? 8 - Number(b.humeur) : 0;
    sommeilJ.push(sommeilQ);
    symptJ.push(fatigue + douleurs + stress + humeurBad);

    const h = Number(b.sommeilDuree ?? 0);
    sommeilH.push(h);
  });

  const m = moyenne(charges);
  const sd = ecartType(charges);
  const monotonie = sd === 0 ? (m > 0 ? 7 : 0) : m / sd;
  const strain = chargeTotale * monotonie;
  const moyenneSante = Math.round(moyenne(sante));
  const sommeilMoy = moyenne(sommeilJ);
  const symptMoy = moyenne(symptJ);
  const sommeilHeuresMoy = moyenne(sommeilH);

  return {
    chargeTotale,
    monotonie,
    strain,
    moyenneSante,
    chargesQuotidiennes: charges,
    santeQuotidienne: sante,
    sommeilMoy,
    symptMoy,
    sommeilHeuresMoy,
  };
}

function calculerBaselines(data: DonneesAthlete, semaineDebut: Date, weeks = 4) {
  const valeurs = { sommeil: [] as number[], sympt: [] as number[], sommeilH: [] as number[] };
  for (let k = 1; k <= weeks; k++) {
    const start = debutSemaine(new Date(semaineDebut.getTime() - k * 7 * 86400000));
    const jours = joursSemaine(start);
    const met = calculerMetriques(jours, data);
    valeurs.sommeil.push(met.sommeilMoy || 0);
    valeurs.sympt.push(met.symptMoy || 0);
    valeurs.sommeilH.push(met.sommeilHeuresMoy || 0);
  }
  return {
    sommeilBase: moyenne(valeurs.sommeil.filter((x) => x > 0)) || null,
    symptBase: moyenne(valeurs.sympt.filter((x) => x > 0)) || null,
    sommeilHeuresBase: moyenne(valeurs.sommeilH.filter((x) => x > 0)) || null,
  } as { sommeilBase: number | null; symptBase: number | null; sommeilHeuresBase: number | null };
}

/* =========================================================
   Seuils
   ========================================================= */
const seuilsParDefaut = {
  MONOTONIE: 2.0,
  STRAIN: 8000,
  SANTE_BASSE: 60,
  SLEEP_DROP_PCT: 20,
  SYMPTOMS_INCR_PCT: 25,
  SLEEP_HOURS_DROP_PCT: 20, // durée du sommeil (heures)
  BASELINE_WEEKS: 4,
};

/* =========================================================
   Icônes + Sparkline
   ========================================================= */
const IconLogout = () => <span style={{ fontWeight: 700 }}>↩︎</span>;
const IconUser = () => <span>👤</span>;
const IconStaff = () => <span>🛡️</span>;

const Sparkline: React.FC<{ values: number[]; width?: number; height?: number; stroke?: string; baseline?: number | null }> = ({
  values,
  width = 220,
  height = 48,
  stroke = COLORS.blue,
  baseline = null,
}) => {
  const v = values && values.length ? values : [0];
  const min = Math.min(...v);
  const max = Math.max(...v);
  const range = max - min || 1;
  const pts = v
    .map((val, i) => {
      const x = (i / (v.length - 1 || 1)) * width;
      const y = height - ((val - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");
  const baseY = baseline != null ? height - ((baseline - min) / range) * height : null;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: "block" }}>
      {baseline != null && <line x1={0} y1={baseY!} x2={width} y2={baseY!} stroke={COLORS.slate} strokeDasharray="4 4" />}
      <polyline fill="none" stroke={stroke} strokeWidth={2} points={pts} />
    </svg>
  );
};

/* =========================================================
   Navigation Semaine
   ========================================================= */
const SemaineNav: React.FC<{
  start: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}> = ({ start, onPrev, onNext, onToday }) => {
  const fin = ajouterJours(start, 6);
  const fmtFR = (d: Date) => d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" });
  const titre = `Semaine du ${fmtFR(start)} au ${fmtFR(fin)}`;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <Button variant="ghost" onClick={onPrev} title="Semaine précédente">←</Button>
      <Pill>{titre}</Pill>
      <Button variant="ghost" onClick={onNext} title="Semaine suivante">→</Button>
      <Button variant="ghost" onClick={onToday} title="Revenir à cette semaine">Aujourd'hui</Button>
    </div>
  );
};

/* =========================================================
   Login & types
   ========================================================= */
export type Role = "athlete" | "staff";
const CODE_STAFF = "0000";
type Utilisateur = { id: string; nom: string; role: Role; codeAcces?: string };
type Session = { role: Role; courant?: string } | null;

/* =========================================================
   Storage keys
   ========================================================= */
const CLE_DATA = "nat-prevent-data-v10";
const CLE_USERS = "nat-prevent-users-v10";
const CLE_SESSION = "nat-prevent-session-v10";
const CLE_SEUILS = "nat-prevent-seuils-v10";
const charger = <T,>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};

/* =========================================================
   Backend Sheets — API minimal (pull/push) + debounce
   ========================================================= */
// ⚙️ Lis l'URL et le token depuis .env
const SHEETS_SYNC_URL = (import.meta as any).env?.VITE_SHEETS_SYNC_URL || "https://script.google.com/macros/s/AKfycbz0vj00dQ6zak-Al3EHTVRQSRBuH_vxfGW8VOtTs342tpGawxEgrvRnciebaMzTw6C4/exec";
const SHEETS_TOKEN    = ((import.meta as any).env?.VITE_SHEETS_TOKEN || "CHANGE_ME_TOKEN").trim();

const hasRemote = !!SHEETS_SYNC_URL && !!SHEETS_TOKEN;

// Petit log de config (token masqué)
console.log("[cfg] SHEETS_SYNC_URL =", SHEETS_SYNC_URL || "https://script.google.com/macros/s/AKfycbz0vj00dQ6zak-Al3EHTVRQSRBuH_vxfGW8VOtTs342tpGawxEgrvRnciebaMzTw6C4/exec");
console.log("[cfg] SHEETS_TOKEN    =", SHEETS_TOKEN ? SHEETS_TOKEN.slice(0, 4) + "…" : "CHANGE_ME_TOKEN");

async function pullFromSheets() {
  if (!hasRemote) return null;

  const url = `${SHEETS_SYNC_URL}?path=sync&token=${encodeURIComponent(SHEETS_TOKEN)}`;
  console.log("[sheets] pull →", url.replace(SHEETS_TOKEN, SHEETS_TOKEN.slice(0, 4) + "…"));

  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const txt = await res.text();
  let json: any = {};
  try { json = JSON.parse(txt); } catch {}
  if (!res.ok || json?.ok === false) {
    console.warn("[sheets] pull response:", txt);
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return json; // { ok:true, users, data, seuils }
}

async function pushToSheets(payload: { users: any; data: any; seuils: any }) {
  if (!hasRemote) return;

  // 👉 Passe le token dans l’URL (Apps Script lit e.parameter.token)
  const url = `${SHEETS_SYNC_URL}?token=${encodeURIComponent(SHEETS_TOKEN)}`;

  // 👉 Le corps contient "path" + "payload" (Apps Script lit e.parameter.path et e.postData)
  const body = new URLSearchParams();
  body.set("path", "sync");
  body.set("payload", JSON.stringify(payload));

  // Pas d'entêtes customs → pas de preflight (CORS)
  const res = await fetch(url, { method: "POST", body, cache: "no-store" });

  const txt = await res.text();
  let json: any = {};
  try { json = JSON.parse(txt); } catch {}
  if (!res.ok || json?.ok === false) {
    console.warn("[sheets] push response:", txt);
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
}

function debounce<F extends (...args: any[]) => void>(fn: F, ms = 600) {
  let t: any;
  return (...args: Parameters<F>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* =========================================================
   Conversion helper pour Filesystem (string | Blob)
   ========================================================= */
async function toText(data: string | Blob | undefined): Promise<string> {
  if (!data) return "";
  return typeof data === "string" ? data : await data.text();
}

/* =========================================================
   Login
   ========================================================= */
const Login: React.FC<{ users: Record<string, Utilisateur>; onAuth: (s: Session) => void }> = ({ users, onAuth }) => {
  const [role, setRole] = useState<Role>("athlete");
  const [ath, setAth] = useState<string>("");
  const [code, setCode] = useState("");
  const [codeAth, setCodeAth] = useState("");
  const ids = Object.keys(users).filter((id) => users[id].role === "athlete");
  useEffect(() => { if (ids.length && !ath) setAth(ids[0]); }, [ids.join("|")]);
  return (
    <Card>
      <H1>Connexion</H1>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Button variant={role === "athlete" ? "primary" : "ghost"} onClick={() => setRole("athlete")}>
          <IconUser /> Athlète
        </Button>
        <Button variant={role === "staff" ? "primary" : "ghost"} onClick={() => setRole("staff")}>
          <IconStaff /> Staff
        </Button>
      </div>
      {role === "athlete" ? (
        <div style={{ display: "grid", gap: 12 }}>
          <LabelInput label="Athlète">
            <select value={ath} onChange={(e) => setAth(e.target.value)}>
              {ids.map((id) => (
                <option key={id} value={id}>
                  {users[id]?.nom || id}
                </option>
              ))}
            </select>
          </LabelInput>
          <LabelInput label="Code d’accès (fourni par le staff)">
            <input type="password" value={codeAth} onChange={(e) => setCodeAth(e.target.value)} placeholder="ex. 1234" />
          </LabelInput>
          <Button onClick={() => {
            const u = users[ath];
            if (!u) { alert("Athlète inconnu"); return; }
            if (!u.codeAcces) { alert("Aucun code défini pour cet athlète. Demandez au staff."); return; }
            if (codeAth !== u.codeAcces) { alert("Code invalide"); return; }
            onAuth({ role: "athlete", courant: ath });
          }}>
            Se connecter
          </Button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <LabelInput label="Code Staff">
            <input type="password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="0000" />
          </LabelInput>
          <Button onClick={() => { if (code === CODE_STAFF) onAuth({ role: "staff" }); else alert("Code invalide"); }}>
            Se connecter
          </Button>
        </div>
      )}
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>La session est mémorisée (reconnexion auto).</div>
    </Card>
  );
};

/* =========================================================
   Saisie jour
   ========================================================= */
const ChampsBienEtre: React.FC<{ bienEtre: BienEtre; onMajBienEtre: (patch: Partial<BienEtre>) => void }> = ({ bienEtre, onMajBienEtre }) => {
  const HINTS: Record<BienEtreKey, React.ReactNode> = {
    sommeil: "1 = très mauvais · 7 = très bon",
    energie: "1 = très faible · 7 = très élevée",
    douleurs: "1 = aucune douleur · 7 = très fortes douleurs",
    stress: "1 = pas de stress · 7 = extrêmement stressé",
    humeur: "1 = très mauvaise · 7 = excellente",
  };
  return (
    <>
      {CHAMPS_BIEN_ETRE.map((champ: BienEtreKey) => (
        <LabelInput key={champ} label={LABELS_BIEN_ETRE[champ]} hint={HINTS[champ]}>
          <input
            type="number"
            min={1}
            max={7}
            step={1}
            value={bienEtre[champ] ?? ""}
            onChange={(e) => onMajBienEtre({ [champ]: Number(e.target.value) })}
          />
        </LabelInput>
      ))}
      <LabelInput label="Sommeil — durée (h)" hint="Heures dormies, suivi séparé (n'influe pas l'index Hooper)">
        <input
          type="number"
          min={0}
          max={14}
          step={0.25}
          value={bienEtre.sommeilDuree ?? ""}
          onChange={(e) => onMajBienEtre({ sommeilDuree: Number(e.target.value) })}
        />
      </LabelInput>
      <LabelInput label="Malade">
        <select value={bienEtre.maladie ?? 0} onChange={(e) => onMajBienEtre({ maladie: Number(e.target.value) })}>
          <option value={0}>Sain</option>
          <option value={1}>Malade</option>
        </select>
      </LabelInput>
    </>
  );
};

function CarteJour({
  date, seances, bienEtre, onAjouter, onMajSeance, onSupprSeance, onMajBienEtre, peutVoir, baseline, seuils,
}: {
  date: Date;
  seances: Seance[];
  bienEtre: BienEtre;
  onAjouter: () => void;
  onMajSeance: (i: number, champ: keyof Seance, val: number) => void;
  onSupprSeance: (i: number) => void;
  onMajBienEtre: (patch: Partial<BienEtre>) => void;
  peutVoir: boolean;
  baseline: { sommeilBase: number | null; symptBase: number | null; sommeilHeuresBase: number | null } | null;
  seuils: typeof seuilsParDefaut;
}) {
  const titre = date.toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "2-digit" });
  const charge = chargeJour(seances);
  const score = calculerScoreSante({
    sommeil: Number(bienEtre.sommeil ?? 4),
    energie: Number(bienEtre.energie ?? 4),
    douleurs: Number(bienEtre.douleurs ?? 4),
    stress: Number(bienEtre.stress ?? 4),
    humeur: Number(bienEtre.humeur ?? 4),
    maladie: Number(bienEtre.maladie ?? 0),
  });
  const dureeH = Number(bienEtre.sommeilDuree ?? 0);
  const baseH = baseline?.sommeilHeuresBase || 0;
  const alerteDuree = baseH > 0 && ((baseH - dureeH) / baseH) * 100 > (seuils.SLEEP_HOURS_DROP_PCT || 20);

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ textTransform: "capitalize", fontWeight: 600 }}>{titre}</div>
        {peutVoir && <div style={{ fontSize: 12, opacity: 0.7 }}>Charge du jour : <b>{charge}</b></div>}
      </div>

      {(seances || []).map((s, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 56px", gap: 8, marginBottom: 6 }}>
          <LabelInput label="Durée (min)">
            <input type="number" value={s.duree} onChange={(e) => onMajSeance(i, "duree", Number(e.target.value))} />
          </LabelInput>
          <LabelInput label="RPE (0–10)">
            <input type="number" min={0} max={10} step={0.5} value={s.rpe} onChange={(e) => onMajSeance(i, "rpe", Number(e.target.value))} />
          </LabelInput>
          <button onClick={() => onSupprSeance(i)} style={{ borderRadius: 12, background: "#e2e8f0" }} title="Supprimer la séance">✖</button>
        </div>
      ))}

      <Button onClick={onAjouter} style={{ width: "100%", background: COLORS.teal }}>
        + Ajouter séance
      </Button>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 8, marginTop: 8 }}>
        <ChampsBienEtre bienEtre={bienEtre} onMajBienEtre={onMajBienEtre} />
      </div>

      {peutVoir && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, fontSize: 12, opacity: 0.9 }}>
          <div>Santé: <b>{score}</b></div>
          {baseline && (
            <div style={{ display: "flex", gap: 6 }}>
              {baseline.sommeilBase &&
                ((baseline.sommeilBase - Number(bienEtre.sommeil ?? 0)) / baseline.sommeilBase) * 100 > (seuils.SLEEP_DROP_PCT || 20) &&
                <Pill color={COLORS.red}>Sommeil (qualité) ↓</Pill>}
              {(() => {
                const fat = bienEtre.energie ? 8 - Number(bienEtre.energie) : 0;
                const dlp = Number(bienEtre.douleurs ?? 0);
                const str = Number(bienEtre.stress ?? 0);
                const hum = bienEtre.humeur ? 8 - Number(bienEtre.humeur) : 0;
                const symp = fat + dlp + str + hum;
                const base = baseline.symptBase || 0;
                return base > 0 && ((symp - base) / base) * 100 > (seuils.SYMPTOMS_INCR_PCT || 25);
              })() && <Pill color={COLORS.amber}>Symptômes ↑</Pill>}
              {alerteDuree && <Pill color={COLORS.amber}>Sommeil (heures) ↓</Pill>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* =========================================================
   Vue semaine
   ========================================================= */
function VueSemaineAthlete({
  id, nom, donnees, jours, maj, peutVoir, seuils,
}: {
  id: string;
  nom: string;
  donnees: DonneesAthlete;
  jours: Date[];
  maj: (fn: (d: DonneesAthlete) => DonneesAthlete) => void;
  peutVoir: boolean;
  seuils: typeof seuilsParDefaut;
}) {
  const ajouter = (d: Date) =>
    maj((cur) => {
      const k = fmt(d);
      const s = (cur.seances[k] || []).concat({ duree: 60, rpe: 5 });
      return { ...cur, seances: { ...cur.seances, [k]: s } };
    });
  const majSeance = (d: Date, i: number, champ: keyof Seance, val: number) =>
    maj((cur) => {
      const k = fmt(d);
      const s = [...(cur.seances[k] || [])];
      s[i] = { ...s[i], [champ]: val } as Seance;
      return { ...cur, seances: { ...cur.seances, [k]: s } };
    });
  const supprSeance = (d: Date, i: number) =>
    maj((cur) => {
      const k = fmt(d);
      const s = [...(cur.seances[k] || [])];
      s.splice(i, 1);
      return { ...cur, seances: { ...cur.seances, [k]: s } };
    });
  const majBienEtre = (d: Date, patch: Partial<BienEtre>) =>
    maj((cur) => {
      const k = fmt(d);
      const b = { ...(cur.bienEtre[k] || {}), ...patch };
      return { ...cur, bienEtre: { ...cur.bienEtre, [k]: b } };
    });

  const met = useMemo(() => calculerMetriques(jours, donnees), [JSON.stringify(donnees), jours.map(fmt).join("|")]);
  const base = useMemo(
    () => calculerBaselines(donnees, debutSemaine(jours[0]), seuils.BASELINE_WEEKS || 4),
    [JSON.stringify(donnees), jours[0].toISOString(), seuils.BASELINE_WEEKS]
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {peutVoir && (
        <Card>
          <H2 title={id}>{nom} — Résumé semaine</H2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            <div><div style={{ fontSize: 12, opacity: 0.6 }}>Charge</div><div style={{ fontSize: 24, fontWeight: 700 }}>{Math.round(met.chargeTotale)}</div></div>
            <div><div style={{ fontSize: 12, opacity: 0.6 }}>Monotonie</div><div style={{ fontSize: 24, fontWeight: 700 }}>{met.monotonie.toFixed(2)}</div></div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>Strain</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {Math.round(met.strain)} {met.strain < 6000 ? <Pill color={COLORS.green}>Vert</Pill> : met.strain <= 8000 ? <Pill color={COLORS.amber}>Orange</Pill> : <Pill color={COLORS.red}>Rouge</Pill>}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "center", marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>Sommeil (qualité 1–7) — moyenne vs baseline</div>
              <Sparkline values={jours.map((d) => Number(donnees.bienEtre[fmt(d)]?.sommeil ?? 0))} baseline={base.sommeilBase || null} />
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Moyenne: <b>{(met.sommeilMoy || 0).toFixed(2)}</b> • Baseline: <b>{(base.sommeilBase || 0).toFixed(2)}</b></div>
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>Sommeil (heures) — moyenne vs baseline</div>
              <Sparkline values={jours.map((d) => Number(donnees.bienEtre[fmt(d)]?.sommeilDuree ?? 0))} baseline={base.sommeilHeuresBase || null} />
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Moyenne: <b>{(met.sommeilHeuresMoy || 0).toFixed(2)}</b> h • Baseline: <b>{(base.sommeilHeuresBase || 0).toFixed(2)}</b> h</div>
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>Symptômes (plus haut = moins bien) — moyenne vs baseline</div>
              <Sparkline
                values={jours.map((d) => {
                  const b = donnees.bienEtre[fmt(d)] || {};
                  const fat = b.energie ? 8 - Number(b.energie) : 0;
                  const dlp = Number(b.douleurs ?? 0);
                  const str = Number(b.stress ?? 0);
                  const hum = b.humeur ? 8 - Number(b.humeur) : 0;
                  return fat + dlp + str + hum;
                })}
                baseline={base.symptBase || null}
              />
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Moyenne: <b>{(met.symptMoy || 0).toFixed(2)}</b> • Baseline: <b>{(base.symptBase || 0).toFixed(2)}</b></div>
            </div>
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {jours.map((d) => (
          <CarteJour
            key={fmt(d)}
            date={d}
            seances={donnees.seances[fmt(d)] || []}
            bienEtre={donnees.bienEtre[fmt(d)] || {}}
            onAjouter={() => ajouter(d)}
            onMajSeance={(i, c, v) => majSeance(d, i, c, v)}
            onSupprSeance={(i) => supprSeance(d, i)}
            onMajBienEtre={(p) => majBienEtre(d, p)}
            peutVoir={peutVoir}
            baseline={peutVoir ? base : null}
            seuils={seuils}
          />
        ))}
      </div>
    </div>
  );
}

/* =========================================================
   Alertes Staff & Seuils
   ========================================================= */
function TableauAlertes({
  athletes,
}: {
  athletes: Array<{ id: string; nom: string; met: ReturnType<typeof calculerMetriques>; base: { sommeilBase: number | null; symptBase: number | null; sommeilHeuresBase: number | null }; seuils: typeof seuilsParDefaut }>;
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
      <thead>
        <tr style={{ background: "#e2e8f0" }}>
          <th style={{ textAlign: "left", padding: "6px 8px" }}>Athlète</th>
          <th style={{ textAlign: "right", padding: "6px 8px" }}>Charge</th>
          <th style={{ textAlign: "right", padding: "6px 8px" }}>Monotonie</th>
          <th style={{ textAlign: "right", padding: "6px 8px" }}>Strain</th>
          <th style={{ textAlign: "center", padding: "6px 8px" }}>Zone</th>
          <th style={{ textAlign: "right", padding: "6px 8px" }}>Santé</th>
          <th style={{ textAlign: "center", padding: "6px 8px" }}>Alertes</th>
        </tr>
      </thead>
      <tbody>
        {athletes.map((a) => (
          <tr key={a.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
            <td style={{ padding: "4px 8px" }}>{a.nom}</td>
            <td style={{ padding: "4px 8px", textAlign: "right" }}>{Math.round(a.met.chargeTotale)}</td>
            <td style={{ padding: "4px 8px", textAlign: "right" }}>{a.met.monotonie.toFixed(2)}</td>
            <td style={{ padding: "4px 8px", textAlign: "right" }}>{Math.round(a.met.strain)}</td>
            <td style={{ padding: "4px 8px", textAlign: "center" }}>
              {a.met.strain < 6000 ? <Pill color={COLORS.green}>Vert</Pill> : a.met.strain <= 8000 ? <Pill color={COLORS.amber}>Orange</Pill> : <Pill color={COLORS.red}>Rouge</Pill>}
            </td>
            <td style={{ padding: "4px 8px", textAlign: "right" }}>{a.met.moyenneSante}</td>
            <td style={{ padding: "4px 8px", textAlign: "center" }}>
              {(() => {
                const flags: string[] = [];
                if (a.base.sommeilBase && ((a.base.sommeilBase - (a.met.sommeilMoy || 0)) / a.base.sommeilBase) * 100 > (a.seuils.SLEEP_DROP_PCT || 20)) flags.push("Qualité sommeil ↓");
                if (a.base.symptBase && (((a.met.symptMoy || 0) - a.base.symptBase) / a.base.symptBase) * 100 > (a.seuils.SYMPTOMS_INCR_PCT || 25)) flags.push("Symptômes ↑");
                if (a.base.sommeilHeuresBase && (((a.base.sommeilHeuresBase - (a.met.sommeilHeuresMoy || 0)) / a.base.sommeilHeuresBase) * 100 > (a.seuils.SLEEP_HOURS_DROP_PCT || 20))) flags.push("Sommeil (heures) ↓");
                return flags.length ? flags.join(" • ") : "—";
              })()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PanneauSeuils({ seuils, onChange }: { seuils: typeof seuilsParDefaut; onChange: (s: typeof seuilsParDefaut) => void }) {
  const [t, setT] = useState(seuils);
  useEffect(() => setT(seuils), [JSON.stringify(seuils)]);
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <H2>Seuils d'alerte</H2>
        <Button
          onClick={() =>
            onChange({
              ...t,
              MONOTONIE: Number((t as any).MONOTONIE) || 2,
              STRAIN: Number((t as any).STRAIN) || 8000,
              SANTE_BASSE: Number((t as any).SANTE_BASSE) || 60,
              SLEEP_DROP_PCT: Number((t as any).SLEEP_DROP_PCT) || 20,
              SYMPTOMS_INCR_PCT: Number((t as any).SYMPTOMS_INCR_PCT) || 25,
              SLEEP_HOURS_DROP_PCT: Number((t as any).SLEEP_HOURS_DROP_PCT) || 20,
              BASELINE_WEEKS: Number((t as any).BASELINE_WEEKS) || 4,
            })
          }
        >
          Sauvegarder
        </Button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        <LabelInput label="Monotonie max"><input type="number" step={0.1} value={(t as any).MONOTONIE} onChange={(e) => setT((s) => ({ ...s, MONOTONIE: e.target.value as any }))} /></LabelInput>
        <LabelInput label="Strain max (u)"><input type="number" value={(t as any).STRAIN} onChange={(e) => setT((s) => ({ ...s, STRAIN: e.target.value as any }))} /></LabelInput>
        <LabelInput label="Santé min (0–100)"><input type="number" value={(t as any).SANTE_BASSE} onChange={(e) => setT((s) => ({ ...s, SANTE_BASSE: e.target.value as any }))} /></LabelInput>
        <LabelInput label="Baisse sommeil (qualité) %"><input type="number" value={(t as any).SLEEP_DROP_PCT} onChange={(e) => setT((s) => ({ ...s, SLEEP_DROP_PCT: e.target.value as any }))} /></LabelInput>
        <LabelInput label="Hausse symptômes %"><input type="number" value={(t as any).SYMPTOMS_INCR_PCT} onChange={(e) => setT((s) => ({ ...s, SYMPTOMS_INCR_PCT: e.target.value as any }))} /></LabelInput>
        <LabelInput label="Baisse sommeil (heures) %"><input type="number" value={(t as any).SLEEP_HOURS_DROP_PCT} onChange={(e) => setT((s) => ({ ...s, SLEEP_HOURS_DROP_PCT: e.target.value as any }))} /></LabelInput>
        <LabelInput label="Semaines baseline"><input type="number" value={(t as any).BASELINE_WEEKS} onChange={(e) => setT((s) => ({ ...s, BASELINE_WEEKS: e.target.value as any }))} /></LabelInput>
      </div>
    </Card>
  );
}

/* =========================================================
   Données de démo
   ========================================================= */
function creerDemoAthletes(): Record<string, DonneesAthlete> {
  const today = new Date();
  const debut = debutSemaine(today);
  const jours = joursSemaine(debut);
  const mkSeances = (mult: number) =>
    jours.reduce<Record<string, Seance[]>>((acc, d, idx) => {
      acc[fmt(d)] = idx === 3 ? [{ duree: 90 * mult, rpe: 8 }] : idx % 2 === 0 ? [{ duree: 60 * mult, rpe: 6 }] : [{ duree: 45 * mult, rpe: 5 }];
      return acc;
    }, {});
  const mkBE = (base: number) =>
    jours.reduce<Record<string, BienEtre>>((acc, d, idx) => {
      acc[fmt(d)] = {
        sommeil: clamp(base + (idx % 3 === 0 ? -1 : 0), 1, 7),
        energie: clamp(base + (idx % 4 === 0 ? -1 : 0), 1, 7),
        douleurs: clamp(3 + (idx % 5 === 0 ? 1 : 0), 1, 7),
        stress: clamp(3 + (idx % 6 === 0 ? 1 : 0), 1, 7),
        humeur: clamp(5 - (idx % 4 === 0 ? 1 : 0), 1, 7),
        sommeilDuree: 7 - (idx % 3 === 0 ? 1.5 : 0),
        maladie: 0,
      };
      return acc;
    }, {});
  return {
    a1: { seances: mkSeances(1), bienEtre: mkBE(5) },
    a2: { seances: mkSeances(1.4), bienEtre: mkBE(4) },
    a3: { seances: mkSeances(1.1), bienEtre: mkBE(5) },
  };
}
function creerDemoUsers(): Record<string, Utilisateur> {
  return {
    a1: { id: "a1", nom: "Alice", role: "athlete", codeAcces: "1111" },
    a2: { id: "a2", nom: "Bob", role: "athlete", codeAcces: "2222" },
    a3: { id: "a3", nom: "Chloé", role: "athlete", codeAcces: "3333" },
    staff: { id: "staff", nom: "Staff", role: "staff" },
  };
}

/* =========================================================
   App
   ========================================================= */
const App: React.FC = () => {
  const [users, setUsers] = useState<Record<string, Utilisateur>>(() => charger(CLE_USERS, creerDemoUsers()));
  const [data, setData] = useState<Record<string, DonneesAthlete>>(() => charger(CLE_DATA, creerDemoAthletes()));
  const [seuils, setSeuils] = useState<typeof seuilsParDefaut>(() => charger(CLE_SEUILS, seuilsParDefaut));
  const [session, setSession] = useState<Session>(() => charger(CLE_SESSION, null));

  // Navigation par semaine
  const [start, setStart] = useState<Date>(() => debutSemaine(new Date()));
  const jours = useMemo(() => joursSemaine(start), [start]);
  const gotoWeek = (delta: number) => setStart((s) => ajouterJours(s, delta * 7));
  const gotoToday = () => setStart(debutSemaine(new Date()));

  // Sélection/Comparaison
  const athleteIds = useMemo(() => Object.keys(users).filter((id) => users[id].role === "athlete"), [users]);
  const [sel, setSel] = useState<string>("");
  const [multi, setMulti] = useState<string[]>([]);
  const [nomNouv, setNomNouv] = useState("");

  // Sync status (UI)
  const [syncStatus, setSyncStatus] = useState<"idle" | "ok" | "error" | "syncing">("idle");

  // Sélection par défaut
  useEffect(() => {
    if (!sel && athleteIds.length) {
      setSel(athleteIds[0]);
      setMulti([athleteIds[0]]);
    }
  }, [athleteIds.join("|")]);

  // Local persistence
  useEffect(() => localStorage.setItem(CLE_USERS, JSON.stringify(users)), [JSON.stringify(users)]);
  useEffect(() => localStorage.setItem(CLE_DATA, JSON.stringify(data)), [JSON.stringify(data)]);
  useEffect(() => localStorage.setItem(CLE_SEUILS, JSON.stringify(seuils)), [JSON.stringify(seuils)]);
  useEffect(() => localStorage.setItem(CLE_SESSION, JSON.stringify(session)), [JSON.stringify(session)]);

  // majAthlete
  const majAthlete = React.useCallback(
    (id: string, fn: (d: DonneesAthlete) => DonneesAthlete) => {
      setData((prev) => {
        const courant = prev[id] || { seances: {}, bienEtre: {} };
        return { ...prev, [id]: fn(courant) };
      });
    },
    []
  );

  // Gestion athlètes (Staff)
  function slug(s: string) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 12);
  }
  const genereId = (nom: string, exist: Set<string>) => {
    let base = slug(nom) || 'athlete';
    let id = base; let i = 1;
    while (exist.has(id)) { id = `${base}${i++}`; }
    return id;
  };
  const genPin = () => String(Math.floor(1000 + Math.random() * 9000));
  const setCodeAthlete = (id: string, code: string) => setUsers(prev => ({ ...prev, [id]: { ...prev[id], codeAcces: code } }));
  const ajouterAthlete = (nom: string) => {
    const trimmed = nom.trim();
    if (!trimmed) { alert('Nom vide'); return; }
    const exist = new Set(Object.keys(users));
    const id = genereId(trimmed, exist);
    setUsers(prev => ({ ...prev, [id]: { id, nom: trimmed, role: 'athlete', codeAcces: genPin() } }));
    setData(prev => ({ ...prev, [id]: { seances: {}, bienEtre: {} } }));
    setNomNouv("");
  };
  const renommerAthlete = (id: string, nom: string) => setUsers(prev => ({ ...prev, [id]: { ...prev[id], nom } }));
  const supprimerAthlete = (id: string) => {
    if (!confirm('Supprimer cet athlète ?')) return;
    setUsers(prev => { const { [id]:_, ...rest } = prev; return rest; });
    setData(prev => { const { [id]:_, ...rest } = prev; return rest; });
    setMulti(m => m.filter(x => x !== id));
    if (sel === id) {
      const restIds = Object.keys(users).filter(x => x !== id && users[x].role === 'athlete');
      setSel(restIds[0] || '');
    }
  };

  // Tableau Staff (métriques)
  const rows = useMemo(
    () =>
      athleteIds.map((id) => {
        const met = calculerMetriques(jours, (data[id] || { seances: {}, bienEtre: {} }));
        const base = calculerBaselines((data[id] || { seances: {}, bienEtre: {} }), start, seuils.BASELINE_WEEKS || 4);
        const nom = users[id]?.nom || id;
        return { id, nom, met, base, seuils };
      }),
    [athleteIds.join("|"), JSON.stringify(data), jours.map(fmt).join("|"), start.getTime(), JSON.stringify(seuils)]
  );

  // ======== Sheets Sync ========
  // Pull au démarrage
  useEffect(() => {
    (async () => {
      if (!hasRemote) return;
      try {
        setSyncStatus("syncing");
        const remote = await pullFromSheets();
        if (remote) {
          const hasAny =
            (remote.users && Object.keys(remote.users).length > 0) ||
            (remote.data && Object.keys(remote.data).length > 0);
          if (hasAny) {
            setUsers(remote.users || {});
            setData(remote.data || {});
            if (remote.seuils) setSeuils(remote.seuils);
          } else {
            // Feuille vide : pousser l'état local initial
            await pushToSheets({ users, data, seuils });
          }
        }
        setSyncStatus("ok");
      } catch (e) {
        console.warn("[sheets] pull failed:", e);
        setSyncStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push debounced à chaque changement
  const pushDebounced = useMemo(
    () =>
      debounce(async (u: any, d: any, s: any) => {
        if (!hasRemote) return;
        try {
          setSyncStatus("syncing");
          await pushToSheets({ users: u, data: d, seuils: s });
          setSyncStatus("ok");
        } catch (e) {
          console.warn("[sheets] push failed:", e);
          setSyncStatus("error");
        }
      }, 800),
    []
  );
  useEffect(() => {
    pushDebounced(users, data, seuils);
  }, [JSON.stringify(users), JSON.stringify(data), JSON.stringify(seuils)]);

  // ======== Boutons "Pull" / "Push" manuels ========
  async function forcePullUI() {
    if (!hasRemote) { alert("Sync distante désactivée : configure VITE_SHEETS_SYNC_URL et VITE_SHEETS_TOKEN."); return; }
    try {
      setSyncStatus("syncing");
      const remote = await pullFromSheets();
      if (remote) {
        setUsers(remote.users || {});
        setData(remote.data || {});
        if (remote.seuils) setSeuils(remote.seuils);
      }
      setSyncStatus("ok");
      alert("Pull terminé ✅");
    } catch (e: any) {
      console.warn("[sheets] force pull failed:", e);
      setSyncStatus("error");
      alert("Pull échoué: " + (e?.message || e));
    }
  }

  async function forcePushUI() {
    if (!hasRemote) { alert("Sync distante désactivée : configure VITE_SHEETS_SYNC_URL et VITE_SHEETS_TOKEN."); return; }
    try {
      setSyncStatus("syncing");
      await pushToSheets({ users, data, seuils });
      setSyncStatus("ok");
      alert("Push terminé ✅");
    } catch (e: any) {
      console.warn("[sheets] force push failed:", e);
      setSyncStatus("error");
      alert("Push échoué: " + (e?.message || e));
    }
  }

  // ======== Export / Import JSON + Reset local ========
  const snapshot = () => JSON.stringify({ users, data, seuils }, null, 2);

  function downloadOnWeb(filename: string, text: string) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  }

  async function handleExportJson() {
    try {
      const fileName = `natation-export-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
      const content = snapshot();

      if (Capacitor.isNativePlatform()) {
        const writeRes: any = await Filesystem.writeFile({
          path: fileName,
          data: content,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
          recursive: true,
        });

        // Partage (si possible)
        const shareUrl = writeRes?.uri || writeRes?.path;
        if (shareUrl) {
          try {
            await Share.share({ title: "Export JSON", text: "Export des données", url: shareUrl, dialogTitle: "Partager l'export" });
          } catch {
            // si Share indisponible, rien de grave
          }
        }
        alert(`Fichier exporté : ${fileName}`);
      } else {
        downloadOnWeb(fileName, content);
      }
    } catch (e: any) {
      console.error(e);
      alert("Export échoué: " + (e?.message || e));
    }
  }

  function applyImportedJson(txt: string) {
    const parsed = JSON.parse(txt || "{}");
    setUsers(parsed.users || {});
    setData(parsed.data || {});
    if (parsed.seuils) setSeuils(parsed.seuils);
    alert("Import JSON terminé ✅");
  }

  async function handleImportJson() {
    try {
      if (Capacitor.isNativePlatform()) {
        const picked = await FilePicker.pickFiles({
          types: ["application/json"],
          readData: true, // pour obtenir blob/data
        });

        if (!picked.files || picked.files.length === 0) return;
        const f = picked.files[0];
        let text = "";

        if ((f as any).data) {
          text = await toText((f as any).data);
        } else if ((f as any).blob) {
          text = await (f as any).blob.text();
        } else if (f.path) {
          const read = await Filesystem.readFile({ path: f.path, encoding: Encoding.UTF8 });
          text = await toText(read.data as any);
        } else {
          alert("Fichier non lisible");
          return;
        }

        applyImportedJson(text);
      } else {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json";
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          const txt = await file.text();
          applyImportedJson(txt);
        };
        input.click();
      }
    } catch (e: any) {
      console.error(e);
      alert("Import échoué: " + (e?.message || e));
    }
  }

  async function handleResetLocal() {
    try {
      if (!confirm("Réinitialiser les données locales (utilisateurs, données, seuils, session) ?")) return;
      localStorage.removeItem(CLE_USERS);
      localStorage.removeItem(CLE_DATA);
      localStorage.removeItem(CLE_SEUILS);
      localStorage.removeItem(CLE_SESSION);
      setUsers(creerDemoUsers());
      setData(creerDemoAthletes());
      setSeuils(seuilsParDefaut);
      setSession(null);
      alert("Réinitialisation locale effectuée ✅");
    } catch (e: any) {
      console.error(e);
      alert("Reset échoué: " + (e?.message || e));
    }
  }

  // --- Login ---
  if (!session) {
    return (
      <ErrorBoundary>
        <div style={{ minHeight: "100vh", background: COLORS.bg, padding: 16, maxWidth: 720, margin: '0 auto' }}>
          <Login users={users} onAuth={setSession} />
        </div>
      </ErrorBoundary>
    );
  }

  // --- Vue Athlète ---
  if (session.role === "athlete" && session.courant) {
    const id = session.courant;
    const u = users[id];
    return (
      <ErrorBoundary>
        <div style={{ minHeight: "100vh", background: COLORS.bg, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <H1>Suivi — {u?.nom || id}</H1>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Session conservée</span>
              <Button variant="ghost" onClick={() => setSession(null)} title="Se déconnecter"><IconLogout /></Button>
            </div>
          </div>

          {/* Navigation semaine */}
          <div style={{ marginBottom: 12 }}>
            <SemaineNav start={start} onPrev={() => gotoWeek(-1)} onNext={() => gotoWeek(1)} onToday={gotoToday} />
          </div>

          <VueSemaineAthlete
            id={id}
            nom={u?.nom || id}
            donnees={data[id] || { seances: {}, bienEtre: {} }}
            jours={jours}
            maj={(fn) => majAthlete(id, fn)}
            peutVoir={false}
            seuils={seuils}
          />
        </div>
      </ErrorBoundary>
    );
  }

  // --- Vue Staff ---
  return (
    <ErrorBoundary>
      <div style={{ minHeight: "100vh", background: COLORS.bg, padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <H1>Tableau de bord — Staff</H1>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* Indicateur de sync */}
            <div title="État de synchronisation Sheets">
              {syncStatus === "ok" && <Pill color={COLORS.green}>Sync ✓</Pill>}
              {syncStatus === "syncing" && <Pill color={COLORS.amber}>Sync…</Pill>}
              {syncStatus === "error" && <Pill color={COLORS.red}>Sync ⚠︎</Pill>}
              {syncStatus === "idle" && <Pill>Sync —</Pill>}
            </div>

            {/* Maintenance / I/O */}
            <Button variant="ghost" onClick={forcePullUI} title="Récupérer depuis Sheets">Pull</Button>
            <Button variant="ghost" onClick={forcePushUI} title="Envoyer vers Sheets">Push</Button>
            <Button variant="ghost" onClick={handleExportJson} title="Exporter les données locales en JSON">Exporter JSON</Button>
            <Button variant="ghost" onClick={handleImportJson} title="Importer un JSON (remplace les données locales)">Importer JSON</Button>
            <Button variant="ghost" onClick={handleResetLocal} title="Réinitialiser les données locales">Réinitialiser (local)</Button>

            <LabelInput label="Sélection athlète">
              <select value={sel} onChange={(e) => setSel(e.target.value)}>
                {athleteIds.map((id) => (
                  <option key={id} value={id}>{users[id]?.nom || id}</option>
                ))}
              </select>
            </LabelInput>
            <Button variant="ghost" onClick={() => { if (sel && !multi.includes(sel)) setMulti((m) => [...m, sel]); }} title="Ajouter à la comparaison">+ Comparer</Button>
            <Button variant="ghost" onClick={() => setMulti([])}>Réinitialiser</Button>
            <Button variant="ghost" onClick={() => setSession(null)} title="Déconnexion"><IconLogout /></Button>
          </div>
        </div>

        {/* Navigation semaine */}
        <div>
          <SemaineNav start={start} onPrev={() => gotoWeek(-1)} onNext={() => gotoWeek(1)} onToday={gotoToday} />
        </div>

        <Card>
          <H2>Gestion des athlètes</H2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 8 }}>
            <LabelInput label="Nom de l'athlète">
              <input type="text" value={nomNouv} onChange={(e) => setNomNouv(e.target.value)} placeholder="ex. Emma" />
            </LabelInput>
            <Button onClick={() => ajouterAthlete(nomNouv)} style={{ alignSelf: 'end' }}>+ Ajouter</Button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {athleteIds.map((id) => (
              <div key={id} style={{ display: 'grid', gridTemplateColumns: '1fr 160px auto auto', alignItems: 'end', gap: 8 }}>
                <LabelInput label="Nom">
                  <input type="text" value={users[id]?.nom || id} onChange={(e) => renommerAthlete(id, e.target.value)} />
                </LabelInput>
                <LabelInput label="Code d'accès">
                  <input
                    type="text"
                    value={users[id]?.codeAcces || ""}
                    onChange={(e) => setCodeAthlete(id, e.target.value.replace(/\s/g, "").slice(0, 12))}
                    placeholder="ex. 1234"
                  />
                </LabelInput>
                <Button variant="ghost" onClick={() => setCodeAthlete(id, genPin())} title="Régénérer un code à 4 chiffres">
                  Générer PIN
                </Button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="ghost" onClick={() => { if (!multi.includes(id)) setMulti((m) => [...m, id]); }}>Comparer</Button>
                  <Button variant="ghost" onClick={() => supprimerAthlete(id)}>Supprimer</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <H2>Alertes Staff (semaine courante)</H2>
          <TableauAlertes athletes={rows} />
        </Card>

        <PanneauSeuils seuils={seuils} onChange={setSeuils} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          {(multi.length ? multi : sel ? [sel] : []).map((id) => (
            <VueSemaineAthlete
              key={id}
              id={id}
              nom={users[id]?.nom || id}
              donnees={data[id] || { seances: {}, bienEtre: {} }}
              jours={jours}
              maj={(fn) => majAthlete(id, fn)}
              peutVoir={true}
              seuils={seuils}
            />
          ))}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default App;
