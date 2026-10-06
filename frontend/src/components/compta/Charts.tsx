// Graphiques SVG légers (aucune dépendance externe) pour le tableau de bord comptable.
import { fmtMontant, libelleMois, PointMensuel } from "../../comptaApi";

const W = 560;
const H = 240;
const M = { haut: 16, droite: 12, bas: 30, gauche: 58 };

const COULEURS = {
  recettes: "#1f8a70",
  depenses: "#b8443c",
  ca: "#15305a",
  positif: "#1f8a70",
  negatif: "#b8443c",
  grille: "#e6e3da",
  texte: "#6b7280",
};

/** Arrondit le maximum à une graduation "propre" (1, 2, 5 × 10^n). */
function maxPropre(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function abrege(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(a >= 10_000 ? 0 : 1)} k`;
  return n.toFixed(0);
}

interface Serie {
  nom: string;
  couleur: string;
  valeur: (p: PointMensuel) => number;
}

/** Histogramme mensuel : une ou plusieurs séries côte à côte ; gère les valeurs négatives. */
function Barres({ donnees, series, titre }: { donnees: PointMensuel[]; series: Serie[]; titre: string }) {
  const toutes = donnees.flatMap((p) => series.map((s) => s.valeur(p)));
  const max = maxPropre(Math.max(0, ...toutes));
  const min = Math.min(0, ...toutes);
  const minPropre = min < 0 ? -maxPropre(-min) : 0;
  const etendue = max - minPropre;
  const largeurUtile = W - M.gauche - M.droite;
  const hauteurUtile = H - M.haut - M.bas;
  const y = (v: number) => M.haut + ((max - v) / etendue) * hauteurUtile;
  const pas = largeurUtile / Math.max(donnees.length, 1);
  const largeurBarre = Math.min(26, (pas * 0.7) / series.length);
  const graduations = [0, 1, 2, 3, 4].map((i) => minPropre + (etendue * i) / 4);
  const aucuneDonnee = toutes.every((v) => v === 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titre} className="compta-chart">
      {graduations.map((g, i) => (
        <g key={i}>
          <line x1={M.gauche} x2={W - M.droite} y1={y(g)} y2={y(g)} stroke={COULEURS.grille} strokeWidth={1} />
          <text x={M.gauche - 6} y={y(g) + 3} textAnchor="end" fontSize={10} fill={COULEURS.texte}>
            {abrege(g)}
          </text>
        </g>
      ))}
      <line x1={M.gauche} x2={W - M.droite} y1={y(0)} y2={y(0)} stroke="#99968c" strokeWidth={1} />
      {donnees.map((p, i) => {
        const cx = M.gauche + pas * i + pas / 2;
        return (
          <g key={p.mois}>
            {series.map((s, k) => {
              const v = s.valeur(p);
              const x = cx - (largeurBarre * series.length) / 2 + k * largeurBarre;
              const h = Math.abs(y(v) - y(0));
              const couleur = s.couleur === "signe" ? (v >= 0 ? COULEURS.positif : COULEURS.negatif) : s.couleur;
              return (
                <rect key={s.nom} x={x} y={v >= 0 ? y(v) : y(0)} width={largeurBarre - 2} height={Math.max(h, v === 0 ? 0 : 1)} rx={2} fill={couleur}>
                  <title>{`${libelleMois(p.mois)} — ${s.nom} : ${fmtMontant(v)} TND`}</title>
                </rect>
              );
            })}
            <text x={cx} y={H - 10} textAnchor="middle" fontSize={10} fill={COULEURS.texte}>
              {libelleMois(p.mois).split(" ")[0]}
            </text>
          </g>
        );
      })}
      {aucuneDonnee && (
        <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={12} fill={COULEURS.texte}>
          Aucune écriture sur cette période
        </text>
      )}
    </svg>
  );
}

export function GraphRecettesDepenses({ donnees }: { donnees: PointMensuel[] }) {
  return (
    <>
      <Barres
        titre="Recettes et dépenses par mois"
        donnees={donnees}
        series={[
          { nom: "Recettes", couleur: COULEURS.recettes, valeur: (p) => p.recettes },
          { nom: "Dépenses", couleur: COULEURS.depenses, valeur: (p) => p.depenses },
        ]}
      />
      <div className="compta-legende">
        <span><i style={{ background: COULEURS.recettes }} />Recettes</span>
        <span><i style={{ background: COULEURS.depenses }} />Dépenses</span>
      </div>
    </>
  );
}

export function GraphChiffreAffaires({ donnees }: { donnees: PointMensuel[] }) {
  return <Barres titre="Chiffre d'affaires par mois" donnees={donnees} series={[{ nom: "Chiffre d'affaires", couleur: COULEURS.ca, valeur: (p) => p.ca }]} />;
}

export function GraphResultat({ donnees }: { donnees: PointMensuel[] }) {
  return <Barres titre="Résultat mensuel" donnees={donnees} series={[{ nom: "Résultat", couleur: "signe", valeur: (p) => p.resultat }]} />;
}

const PALETTE = ["#15305a", "#b8902e", "#1f8a70", "#b8443c", "#2d6da3", "#8f6c1e", "#6b7280", "#99968c"];

/** Anneau de répartition des charges avec légende détaillée. */
export function GraphRepartition({ donnees }: { donnees: { numero: string; libelle: string; total: number }[] }) {
  const total = donnees.reduce((s, d) => s + d.total, 0);
  if (total <= 0) return <p style={{ color: "var(--muted)" }}>Aucune charge sur cette période.</p>;

  // Au-delà de 7 postes, les plus petits sont regroupés dans "Autres".
  const principaux = donnees.slice(0, 7);
  const reste = donnees.slice(7).reduce((s, d) => s + d.total, 0);
  const parts = reste > 0 ? [...principaux, { numero: "", libelle: "Autres", total: reste }] : principaux;

  const R = 70;
  const C = 2 * Math.PI * R;
  let cumul = 0;
  return (
    <div className="compta-donut">
      <svg viewBox="0 0 180 180" role="img" aria-label="Répartition des charges" width={180} height={180}>
        <g transform="rotate(-90 90 90)">
          {parts.map((p, i) => {
            const longueur = (p.total / total) * C;
            const el = (
              <circle key={i} cx={90} cy={90} r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={26}
                strokeDasharray={`${longueur} ${C - longueur}`} strokeDashoffset={-cumul}>
                <title>{`${p.libelle} : ${fmtMontant(p.total)} TND`}</title>
              </circle>
            );
            cumul += longueur;
            return el;
          })}
        </g>
        <text x={90} y={86} textAnchor="middle" fontSize={11} fill={COULEURS.texte}>Total</text>
        <text x={90} y={104} textAnchor="middle" fontSize={13} fontWeight={700} fill="#172234">{abrege(total)} TND</text>
      </svg>
      <ul className="compta-donut-legende">
        {parts.map((p, i) => (
          <li key={i}>
            <i style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="lib">{p.libelle}</span>
            <span className="val">{((p.total / total) * 100).toFixed(1)} %</span>
            <span className="mt">{fmtMontant(p.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
