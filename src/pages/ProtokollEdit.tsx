import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { BelegUpload } from '../components/BelegUpload';
import { useAuth } from '../lib/authStore';
import { useProfiles, useShops } from '../lib/queries';
import {
  useDeleteProtokoll,
  useEnsureProtokoll,
  useProtokoll,
  useReplaceBewegungen,
  useUpdateSchicht,
  useVortagKasse,
} from '../lib/protokollQueries';
import {
  DIFF_WARN_THRESHOLD,
  calcShift,
  calcStunden,
  diffIsWarn,
  formatEur,
  formatStunden,
  isShiftComplete,
} from '../lib/calc';
import type { Kassenbewegung, Profile, Schicht } from '../lib/types';

interface BewegungZeile {
  beschreibung: string;
  betrag: string;
}

interface ShiftForm {
  mitarbeiter_id: string;
  zeit_von: string;
  zeit_bis: string;
  kassenstart: string;
  kassenstart_manuell: boolean;
  kassenstart_grund: string;
  kassenabrechnung: string;
  kassenist: string;
  guthaben_kundenkarte: string;
  offene_auszahlungen: string;
  kommentar: string;
  einlagen: BewegungZeile[];
  entnahmen: BewegungZeile[];
}

function numToStr(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : String(n).replace('.', ',');
}

function strToNum(s: string): number | null {
  if (s.trim() === '') return null;
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function shiftToForm(s: Schicht, bw: Kassenbewegung[]): ShiftForm {
  return {
    mitarbeiter_id: s.mitarbeiter_id ?? '',
    zeit_von: s.zeit_von?.slice(0, 5) ?? '',
    zeit_bis: s.zeit_bis?.slice(0, 5) ?? '',
    kassenstart: numToStr(s.kassenstart),
    kassenstart_manuell: s.kassenstart_manuell,
    kassenstart_grund: s.kassenstart_grund ?? '',
    kassenabrechnung: numToStr(s.kassenabrechnung),
    kassenist: numToStr(s.kassenist),
    guthaben_kundenkarte: numToStr(s.guthaben_kundenkarte),
    offene_auszahlungen: numToStr(s.offene_auszahlungen),
    kommentar: s.kommentar ?? '',
    einlagen: bw
      .filter((b) => b.typ === 'einlage')
      .sort((a, b) => a.reihenfolge - b.reihenfolge)
      .map((b) => ({
        beschreibung: b.beschreibung ?? '',
        betrag: numToStr(b.betrag),
      })),
    entnahmen: bw
      .filter((b) => b.typ === 'entnahme')
      .sort((a, b) => a.reihenfolge - b.reihenfolge)
      .map((b) => ({
        beschreibung: b.beschreibung ?? '',
        betrag: numToStr(b.betrag),
      })),
  };
}

function calcLiveSums(form: ShiftForm) {
  const liveSchicht = {
    kassenstart: strToNum(form.kassenstart),
    kassenabrechnung: strToNum(form.kassenabrechnung),
    kassenist: strToNum(form.kassenist),
    zeit_von: form.zeit_von,
    zeit_bis: form.zeit_bis,
  };
  const liveBewegungen = [
    ...form.einlagen.map((z) => ({
      typ: 'einlage' as const,
      betrag: strToNum(z.betrag) ?? 0,
    })),
    ...form.entnahmen.map((z) => ({
      typ: 'entnahme' as const,
      betrag: strToNum(z.betrag) ?? 0,
    })),
  ];
  return calcShift(liveSchicht, liveBewegungen);
}

export function ProtokollEditPage() {
  const params = useParams<{ shopId: string; datum: string }>();
  const shopId = params.shopId!;
  const datum = params.datum!;
  const navigate = useNavigate();
  const session = useAuth((s) => s.session)!;

  const { data: shops } = useShops();
  const { data: profiles } = useProfiles();
  const shop = shops?.find((s) => s.id === shopId);
  const mitarbeiter = useMemo(
    () =>
      (profiles ?? []).filter(
        (p) => p.rolle === 'mitarbeiter' || p.rolle === 'bezirksleiter',
      ),
    [profiles],
  );

  const ensure = useEnsureProtokoll();
  const { data: full, isLoading, error: protoErr } = useProtokoll(shopId, datum);
  const { data: vortag } = useVortagKasse(shopId, datum);
  const updateSchicht = useUpdateSchicht();
  const replaceBewegungen = useReplaceBewegungen();
  const deleteProtokoll = useDeleteProtokoll();
  const isAdmin = session.kind === 'admin';

  // Form-State pro Schicht
  const [s1Form, setS1Form] = useState<ShiftForm | null>(null);
  const [s2Form, setS2Form] = useState<ShiftForm | null>(null);
  const [s1Dirty, setS1Dirty] = useState(false);
  const [s2Dirty, setS2Dirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Beim ersten Laden: Protokoll anlegen falls nicht da
  useEffect(() => {
    if (!isLoading && !full && !ensure.isPending && !ensure.isSuccess) {
      ensure.mutate({ shopId, datum, erstelltVon: session.profile.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, full, shopId, datum]);

  // Form-State synchronisieren wenn DB-Daten kommen (und keine ungespeicherten Changes)
  const schicht1 = full?.schichten.find((s) => s.schicht_nr === 1);
  const schicht2 = full?.schichten.find((s) => s.schicht_nr === 2);
  const bw1 = useMemo(
    () => full?.bewegungen.filter((b) => b.schicht_id === schicht1?.id) ?? [],
    [full, schicht1?.id],
  );
  const bw2 = useMemo(
    () => full?.bewegungen.filter((b) => b.schicht_id === schicht2?.id) ?? [],
    [full, schicht2?.id],
  );

  // Initial sync: Form-State NUR beim ersten Mal aus DB laden (per Schicht-ID).
  // Danach ist der Form-State Wahrheit; sonst springt der Cursor beim Tippen.
  const initS1Id = useRef<string | null>(null);
  const initS2Id = useRef<string | null>(null);
  useEffect(() => {
    if (schicht1 && initS1Id.current !== schicht1.id) {
      initS1Id.current = schicht1.id;
      setS1Form(shiftToForm(schicht1, bw1));
    }
  }, [schicht1, bw1]);
  useEffect(() => {
    if (schicht2 && initS2Id.current !== schicht2.id) {
      initS2Id.current = schicht2.id;
      setS2Form(shiftToForm(schicht2, bw2));
    }
  }, [schicht2, bw2]);

  // Vortags-Kasse als Schicht-1-Kassenstart vorschlagen — nur einmal nach Initial-Load
  const vortagApplied = useRef(false);
  useEffect(() => {
    if (vortagApplied.current) return;
    if (!schicht1 || !vortag || !s1Form) return;
    if (schicht1.kassenstart !== null) return;
    if (schicht1.kassenstart_manuell) return;
    if (s1Form.kassenstart !== '') return;
    vortagApplied.current = true;
    setS1Form((f) =>
      f
        ? { ...f, kassenstart: numToStr(vortag.ist), kassenstart_manuell: false }
        : f,
    );
    setS1Dirty(true);
    scheduleSave(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schicht1?.id, vortag?.ist, s1Form?.kassenstart]);

  // Auto-Carry S1 → S2: wenn S1 komplett, S2.kassenstart auf S1.IST setzen
  // (im Form-State; wird beim nächsten Save persistiert)
  useEffect(() => {
    if (!s1Form || !s2Form) return;
    if (!schicht1 || !isShiftComplete(schicht1)) return;
    if (s2Form.kassenstart_manuell) return;
    const istVal = strToNum(s1Form.kassenist);
    if (istVal === null) return;
    if (strToNum(s2Form.kassenstart) === istVal) return;
    setS2Form((f) => (f ? { ...f, kassenstart: numToStr(istVal) } : f));
    setS2Dirty(true);
    scheduleSave(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s1Form?.kassenist, s1Form?.mitarbeiter_id, s1Form?.zeit_bis]);

  // Refs auf den jeweils aktuellsten Form-State, damit verspätete Save-Timer
  // nicht mit veralteten Closure-Werten arbeiten.
  const s1FormRef = useRef<ShiftForm | null>(null);
  const s2FormRef = useRef<ShiftForm | null>(null);
  s1FormRef.current = s1Form;
  s2FormRef.current = s2Form;

  // Save-Funktionen mit Debounce
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function scheduleSave(which: 1 | 2) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveShift(which), 800);
  }

  async function saveShift(which: 1 | 2) {
    const form = which === 1 ? s1FormRef.current : s2FormRef.current;
    const schicht = which === 1 ? schicht1 : schicht2;
    if (!form || !schicht) return;
    setSaveErr(null);
    try {
      const kassenstartNum = strToNum(form.kassenstart);
      const kassenstartManuell =
        form.kassenstart_manuell ||
        (kassenstartNum !== null &&
          schicht.kassenstart !== null &&
          kassenstartNum !== schicht.kassenstart);
      await updateSchicht.mutateAsync({
        shopId,
        datum,
        schichtId: schicht.id,
        patch: {
          mitarbeiter_id: form.mitarbeiter_id || null,
          zeit_von: form.zeit_von || null,
          zeit_bis: form.zeit_bis || null,
          kassenstart: kassenstartNum,
          kassenstart_manuell: kassenstartManuell,
          kassenstart_grund: form.kassenstart_grund || null,
          kassenabrechnung: strToNum(form.kassenabrechnung),
          kassenist: strToNum(form.kassenist),
          guthaben_kundenkarte: strToNum(form.guthaben_kundenkarte),
          offene_auszahlungen: strToNum(form.offene_auszahlungen),
          kommentar: form.kommentar || null,
        },
      });
      const allBewegungen = [
        ...form.einlagen
          .filter((z) => z.beschreibung || z.betrag)
          .map((z, i) => ({
            typ: 'einlage' as const,
            beschreibung: z.beschreibung,
            betrag: strToNum(z.betrag) ?? 0,
            reihenfolge: i,
          })),
        ...form.entnahmen
          .filter((z) => z.beschreibung || z.betrag)
          .map((z, i) => ({
            typ: 'entnahme' as const,
            beschreibung: z.beschreibung,
            betrag: strToNum(z.betrag) ?? 0,
            reihenfolge: i,
          })),
      ];
      await replaceBewegungen.mutateAsync({
        shopId,
        datum,
        schichtId: schicht.id,
        bewegungen: allBewegungen,
      });
      if (which === 1) setS1Dirty(false);
      else setS2Dirty(false);
      setSavedAt(new Date());
    } catch (e) {
      setSaveErr(String(e instanceof Error ? e.message : e));
    }
  }

  function patchS1<K extends keyof ShiftForm>(key: K, val: ShiftForm[K]) {
    setS1Form((f) => (f ? { ...f, [key]: val } : f));
    setS1Dirty(true);
    scheduleSave(1);
  }
  function patchS2<K extends keyof ShiftForm>(key: K, val: ShiftForm[K]) {
    setS2Form((f) => (f ? { ...f, [key]: val } : f));
    setS2Dirty(true);
    scheduleSave(2);
  }

  function patchKassenstartS1(val: string) {
    setS1Form((f) =>
      f ? { ...f, kassenstart: val, kassenstart_manuell: true } : f,
    );
    setS1Dirty(true);
    scheduleSave(1);
  }
  function patchKassenstartS2(val: string) {
    setS2Form((f) =>
      f ? { ...f, kassenstart: val, kassenstart_manuell: true } : f,
    );
    setS2Dirty(true);
    scheduleSave(2);
  }

  if (protoErr || ensure.error) {
    const e = (protoErr ?? ensure.error) as Error;
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-6 py-10 space-y-3">
          <div className="bg-minus/10 border border-minus/30 text-minus rounded p-4 text-sm">
            <div className="font-semibold mb-1">Fehler beim Laden</div>
            <div className="font-mono text-xs whitespace-pre-wrap">{e.message}</div>
          </div>
          <button onClick={() => navigate('/')} className="btn-ghost">
            ← zurück
          </button>
        </div>
      </Layout>
    );
  }

  if (isLoading || !full || !shop || !s1Form || !s2Form || !schicht1 || !schicht2) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-6 py-10 text-muted text-sm">
          Lade Protokoll …
        </div>
      </Layout>
    );
  }

  const sums1 = calcLiveSums(s1Form);
  const sums2 = calcLiveSums(s2Form);
  const stunden1 = calcStunden(s1Form.zeit_von, s1Form.zeit_bis);
  const stunden2 = calcStunden(s2Form.zeit_von, s2Form.zeit_bis);

  const dirty = s1Dirty || s2Dirty;
  const isAutoCarriedS2 =
    !s2Form.kassenstart_manuell &&
    isShiftComplete(schicht1) &&
    schicht1.kassenist !== null &&
    String(schicht1.kassenist) === s2Form.kassenstart.replace(',', '.');
  const isFromVortagS1 =
    !s1Form.kassenstart_manuell &&
    !!vortag &&
    String(vortag.ist) === s1Form.kassenstart.replace(',', '.');

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-xs text-muted hover:text-accent mb-1 mono"
            >
              ← Dashboard
            </button>
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">
              {shop.name}
            </h1>
            <div className="text-sm text-muted mono">{datum}</div>
          </div>
          <div className="text-right text-xs mono pt-1">
            {dirty ? (
              <span className="text-warn">● ungespeichert</span>
            ) : savedAt ? (
              <span className="text-plus">● gespeichert um {savedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
            ) : null}
          </div>
        </div>

        {saveErr && (
          <div className="bg-minus/10 border border-minus/30 text-minus rounded p-3 text-sm">
            Speichern fehlgeschlagen: {saveErr}
          </div>
        )}

        {isAdmin && datum !== new Date().toISOString().slice(0, 10) && (
          <div className="bg-warn/10 border border-warn/30 text-warn rounded p-2 text-xs mono">
            ⚠ Admin-Bearbeitung — dies ist nicht das heutige Datum.
          </div>
        )}

        <div className="protokoll-table">
          {/* Spaltenüberschriften */}
          <div className="row">
            <div className="label-cell" />
            <div className="head-cell">SCHICHT 1 (FRÜH)</div>
            <div className="head-cell">SCHICHT 2 (SPÄT)</div>
          </div>

          {/* Mitarbeiter */}
          <div className="row">
            <div className="label-cell">👤 Mitarbeiter</div>
            <div className="data-cell">
              <MitarbeiterSelect
                value={s1Form.mitarbeiter_id}
                onChange={(v) => patchS1('mitarbeiter_id', v)}
                options={mitarbeiter}
              />
            </div>
            <div className="data-cell">
              <MitarbeiterSelect
                value={s2Form.mitarbeiter_id}
                onChange={(v) => patchS2('mitarbeiter_id', v)}
                options={mitarbeiter}
              />
            </div>
          </div>

          {/* Zeit */}
          <div className="row">
            <div className="label-cell">🕐 Kommen → Gehen</div>
            <div className="data-cell">
              <ZeitInputs
                von={s1Form.zeit_von}
                bis={s1Form.zeit_bis}
                stunden={stunden1}
                onVon={(v) => patchS1('zeit_von', v)}
                onBis={(v) => patchS1('zeit_bis', v)}
              />
            </div>
            <div className="data-cell">
              <ZeitInputs
                von={s2Form.zeit_von}
                bis={s2Form.zeit_bis}
                stunden={stunden2}
                onVon={(v) => patchS2('zeit_von', v)}
                onBis={(v) => patchS2('zeit_bis', v)}
              />
            </div>
          </div>

          {/* Kassenstart */}
          <div className="row">
            <div className="label-cell">💶 Kassenstart</div>
            <div className="data-cell">
              <KassenstartInput
                value={s1Form.kassenstart}
                onChange={patchKassenstartS1}
                manuell={s1Form.kassenstart_manuell}
                grund={s1Form.kassenstart_grund}
                onGrund={(v) => patchS1('kassenstart_grund', v)}
                hint={
                  isFromVortagS1
                    ? `↳ automatisch übernommen aus Vortag (${vortag!.datum})`
                    : undefined
                }
                vortagBtn={
                  vortag && !isFromVortagS1
                    ? {
                        label: `↺ Vortag (${formatEur(vortag.ist)})`,
                        onClick: () => patchS1('kassenstart', numToStr(vortag.ist)),
                      }
                    : undefined
                }
              />
            </div>
            <div className="data-cell">
              <KassenstartInput
                value={s2Form.kassenstart}
                onChange={patchKassenstartS2}
                manuell={s2Form.kassenstart_manuell}
                grund={s2Form.kassenstart_grund}
                onGrund={(v) => patchS2('kassenstart_grund', v)}
                hint={
                  isAutoCarriedS2
                    ? '↳ automatisch von Schicht 1 IST übernommen'
                    : undefined
                }
              />
            </div>
          </div>

          {/* Einlagen */}
          <div className="row section-row">
            <div className="section-title" style={{ color: '#4ade80' }}>
              ＋ Einlagen
            </div>
          </div>
          <div className="row">
            <div className="label-cell">
              Einlagen
              <span className="sub">manuell zugeführt</span>
            </div>
            <div className="data-cell">
              <Lines
                zeilen={s1Form.einlagen}
                onChange={(z) => patchS1('einlagen', z)}
                summe={sums1.einlagenSumme}
              />
            </div>
            <div className="data-cell">
              <Lines
                zeilen={s2Form.einlagen}
                onChange={(z) => patchS2('einlagen', z)}
                summe={sums2.einlagenSumme}
              />
            </div>
          </div>

          {/* Entnahmen */}
          <div className="row section-row">
            <div className="section-title" style={{ color: '#f87171' }}>
              − Entnahmen
            </div>
          </div>
          <div className="row">
            <div className="label-cell">
              Entnahmen
              <span className="sub">alle Geldausgänge</span>
            </div>
            <div className="data-cell">
              <Lines
                zeilen={s1Form.entnahmen}
                onChange={(z) => patchS1('entnahmen', z)}
                summe={sums1.entnahmenSumme}
              />
            </div>
            <div className="data-cell">
              <Lines
                zeilen={s2Form.entnahmen}
                onChange={(z) => patchS2('entnahmen', z)}
                summe={sums2.entnahmenSumme}
              />
            </div>
          </div>

          {/* Kassenabrechnung Z-Bon */}
          <div
            className="row section-row"
            style={{
              background:
                'linear-gradient(to right, rgba(251,191,36,0.18), rgba(251,191,36,0.08))',
              borderTop: '2px solid #fbbf24',
              borderBottom: '2px solid #fbbf24',
            }}
          >
            <div className="section-title" style={{ color: '#fbbf24', fontSize: 13 }}>
              🧾 Letzter Schritt — Kassenabrechnung (Z-Bon)
            </div>
          </div>
          <div className="row">
            <div
              className="label-cell"
              style={{
                color: '#fbbf24',
                background: 'rgba(251,191,36,0.08)',
                fontSize: 14,
              }}
            >
              Kassenabrechnung
            </div>
            <div
              className="data-cell"
              style={{
                background: 'rgba(251,191,36,0.10)',
                borderLeft: '3px solid #fbbf24',
              }}
            >
              <ZBonInput
                value={s1Form.kassenabrechnung}
                onChange={(v) => patchS1('kassenabrechnung', v)}
              />
              <div className="mt-2">
                <BelegUpload
                  shopId={shopId}
                  datum={datum}
                  schichtNr={1}
                  belegPath={schicht1.beleg_storage_path}
                  onChange={(path) =>
                    updateSchicht.mutate({
                      shopId,
                      datum,
                      schichtId: schicht1.id,
                      patch: { beleg_storage_path: path },
                    })
                  }
                />
              </div>
            </div>
            <div
              className="data-cell"
              style={{
                background: 'rgba(251,191,36,0.10)',
                borderLeft: '3px solid #fbbf24',
              }}
            >
              <ZBonInput
                value={s2Form.kassenabrechnung}
                onChange={(v) => patchS2('kassenabrechnung', v)}
              />
              <div className="mt-2">
                <BelegUpload
                  shopId={shopId}
                  datum={datum}
                  schichtNr={2}
                  belegPath={schicht2.beleg_storage_path}
                  onChange={(path) =>
                    updateSchicht.mutate({
                      shopId,
                      datum,
                      schichtId: schicht2.id,
                      patch: { beleg_storage_path: path },
                    })
                  }
                />
              </div>
            </div>
          </div>

          {/* SOLL */}
          <div className="row">
            <div className="label-cell" style={{ color: '#60a5fa' }}>
              ≡ KASSE SOLL
              <span className="sub">automatisch</span>
            </div>
            <div className="big-cell soll">{formatEur(sums1.soll)}</div>
            <div className="big-cell soll">{formatEur(sums2.soll)}</div>
          </div>

          {/* IST */}
          <div className="row">
            <div className="label-cell" style={{ color: '#d4ff00' }}>
              📦 KASSE IST
              <span className="sub">aus Zählung</span>
            </div>
            <div className="data-cell">
              <input
                type="text"
                inputMode="decimal"
                value={s1Form.kassenist}
                onChange={(e) => patchS1('kassenist', e.target.value)}
                placeholder="0,00"
                className="big-input"
              />
            </div>
            <div className="data-cell">
              <input
                type="text"
                inputMode="decimal"
                value={s2Form.kassenist}
                onChange={(e) => patchS2('kassenist', e.target.value)}
                placeholder="0,00"
                className="big-input"
              />
            </div>
          </div>

          {/* DIFF */}
          <div className="row">
            <div
              className="label-cell"
              style={{
                color: diffIsWarn(sums1.diff) || diffIsWarn(sums2.diff) ? '#f87171' : '#d4ff00',
              }}
            >
              Δ DIFFERENZ
              <span className="sub">IST minus SOLL</span>
            </div>
            <DiffCell diff={sums1.diff} />
            <DiffCell diff={sums2.diff} />
          </div>

          {/* Kundenkarte */}
          <div className="row">
            <div className="label-cell">
              💳 Guthaben Kundenkarte
              <span className="sub">offener Betrag</span>
            </div>
            <div className="data-cell">
              <input
                type="text"
                inputMode="decimal"
                value={s1Form.guthaben_kundenkarte}
                onChange={(e) => patchS1('guthaben_kundenkarte', e.target.value)}
                placeholder="0,00"
                className="field-input mono text-right"
              />
            </div>
            <div className="data-cell">
              <input
                type="text"
                inputMode="decimal"
                value={s2Form.guthaben_kundenkarte}
                onChange={(e) => patchS2('guthaben_kundenkarte', e.target.value)}
                placeholder="0,00"
                className="field-input mono text-right"
              />
            </div>
          </div>

          {/* Offene Auszahlungen */}
          <div className="row">
            <div className="label-cell">
              💸 Offene Auszahlungen
              <span className="sub">noch nicht ausgezahlt</span>
            </div>
            <div className="data-cell">
              <input
                type="text"
                inputMode="decimal"
                value={s1Form.offene_auszahlungen}
                onChange={(e) => patchS1('offene_auszahlungen', e.target.value)}
                placeholder="0,00"
                className="field-input mono text-right"
              />
            </div>
            <div className="data-cell">
              <input
                type="text"
                inputMode="decimal"
                value={s2Form.offene_auszahlungen}
                onChange={(e) => patchS2('offene_auszahlungen', e.target.value)}
                placeholder="0,00"
                className="field-input mono text-right"
              />
            </div>
          </div>

          {/* Kommentar */}
          <div className="row">
            <div className="label-cell">💬 Kommentar</div>
            <div className="data-cell">
              <textarea
                value={s1Form.kommentar}
                onChange={(e) => patchS1('kommentar', e.target.value)}
                rows={2}
                placeholder="Bemerkungen…"
                className="field-input"
              />
            </div>
            <div className="data-cell">
              <textarea
                value={s2Form.kommentar}
                onChange={(e) => patchS2('kommentar', e.target.value)}
                rows={2}
                placeholder="Bemerkungen…"
                className="field-input"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-between items-center pt-1 flex-wrap">
          {isAdmin ? (
            <button
              type="button"
              onClick={async () => {
                if (
                  !window.confirm(
                    `Protokoll für ${shop.name} am ${datum} wirklich löschen?\n\nAlle Schichten und Bewegungen werden dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`,
                  )
                )
                  return;
                try {
                  await deleteProtokoll.mutateAsync({
                    shopId,
                    datum,
                    protokollId: full.protokoll.id,
                  });
                  navigate('/');
                } catch (e) {
                  setSaveErr(String(e instanceof Error ? e.message : e));
                }
              }}
              disabled={deleteProtokoll.isPending}
              className="text-xs text-minus hover:underline disabled:opacity-50"
            >
              {deleteProtokoll.isPending ? 'Lösche …' : '🗑 Protokoll löschen'}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => navigate('/')}
            className="btn-primary px-5 py-2 text-sm"
          >
            Fertig & Zurück
          </button>
        </div>
      </div>
    </Layout>
  );
}

function MitarbeiterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Profile[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="field-input"
    >
      <option value="">— wählen —</option>
      {options.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

function ZeitInputs({
  von,
  bis,
  stunden,
  onVon,
  onBis,
}: {
  von: string;
  bis: string;
  stunden: number;
  onVon: (v: string) => void;
  onBis: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
      <input
        type="time"
        value={von}
        onChange={(e) => onVon(e.target.value)}
        className="field-input mono"
      />
      <input
        type="time"
        value={bis}
        onChange={(e) => onBis(e.target.value)}
        className="field-input mono"
      />
      <span className="text-xs mono text-accent px-2">
        {stunden > 0 ? formatStunden(stunden) : '–'}
      </span>
    </div>
  );
}

function KassenstartInput({
  value,
  onChange,
  manuell,
  grund,
  onGrund,
  hint,
  vortagBtn,
}: {
  value: string;
  onChange: (v: string) => void;
  manuell: boolean;
  grund: string;
  onGrund: (v: string) => void;
  hint?: string;
  vortagBtn?: { label: string; onClick: () => void };
}) {
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto] gap-1.5">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0,00"
          className="field-input mono text-right"
        />
        {vortagBtn && (
          <button
            type="button"
            onClick={vortagBtn.onClick}
            className="btn-ghost px-3 text-[11px] mono"
            title={vortagBtn.label}
          >
            {vortagBtn.label}
          </button>
        )}
      </div>
      {hint && (
        <div className="text-[11px] mono mt-1 text-plus">{hint}</div>
      )}
      {manuell && (
        <input
          type="text"
          value={grund}
          onChange={(e) => onGrund(e.target.value)}
          placeholder="Grund für manuelle Eingabe (optional)"
          className="field-input text-[12px] mt-2"
          style={{ color: '#fbbf24' }}
        />
      )}
    </div>
  );
}

function ZBonInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Endbetrag €"
        style={{
          width: '100%',
          padding: '14px 16px',
          borderRadius: 6,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 24,
          fontWeight: 700,
          textAlign: 'right',
          background: '#0a0a0a',
          border: '2px solid #fbbf24',
          color: '#fbbf24',
          boxShadow: '0 0 0 1px rgba(251,191,36,0.3)',
        }}
      />
      <div
        className="text-[11px] mono mt-1.5 mb-1"
        style={{ color: '#fbbf24', opacity: 0.85 }}
      >
        ↑ Endbetrag aus Kassenausdruck eintragen
      </div>
    </>
  );
}

function Lines({
  zeilen,
  onChange,
  summe,
}: {
  zeilen: BewegungZeile[];
  onChange: (z: BewegungZeile[]) => void;
  summe: number;
}) {
  function update(i: number, patch: Partial<BewegungZeile>) {
    onChange(zeilen.map((z, idx) => (idx === i ? { ...z, ...patch } : z)));
  }
  function add() {
    onChange([...zeilen, { beschreibung: '', betrag: '' }]);
  }
  function remove(i: number) {
    onChange(zeilen.filter((_, idx) => idx !== i));
  }
  return (
    <div>
      {zeilen.map((z, i) => (
        <div key={i} className="line-grid">
          <input
            type="text"
            value={z.beschreibung}
            onChange={(e) => update(i, { beschreibung: e.target.value })}
            placeholder="Beschreibung"
            className="field-input"
          />
          <input
            type="text"
            inputMode="decimal"
            value={z.betrag}
            onChange={(e) => update(i, { betrag: e.target.value })}
            placeholder="0,00"
            className="field-input mono text-right"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label="Zeile entfernen"
            className="text-muted-2 hover:text-minus text-lg leading-none"
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex justify-between items-center mt-2">
        <button
          type="button"
          onClick={add}
          className="text-xs text-muted hover:text-accent mono"
        >
          + Zeile
        </button>
        <span className="sum-pill">Σ {formatEur(summe)}</span>
      </div>
    </div>
  );
}

function DiffCell({ diff }: { diff: number | null }) {
  const warn = diffIsWarn(diff);
  const color =
    diff === null
      ? '#888'
      : diff < 0
        ? '#f87171'
        : diff > 0
          ? '#4ade80'
          : '#f5f5f5';
  return (
    <div
      className="big-cell"
      style={{
        color,
        background: warn ? 'rgba(248,113,113,0.08)' : 'transparent',
      }}
    >
      <div>
        {formatEur(diff)}
        {warn && (
          <div
            className="text-[11px] mt-1"
            style={{ color: '#f87171', fontWeight: 500 }}
          >
            ⚠ über {formatEur(DIFF_WARN_THRESHOLD)}
          </div>
        )}
      </div>
    </div>
  );
}
