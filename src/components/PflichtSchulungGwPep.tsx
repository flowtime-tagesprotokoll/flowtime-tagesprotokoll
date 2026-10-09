import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/authStore';
import { firstName } from '../lib/types';

/**
 * Pflicht-Schulung Geldwäsche-Verdachtsmeldung + PEP-Check.
 *
 * Wird dem Mitarbeiter nach dem Login angezeigt, solange er noch keine
 * oder zu wenige Bestätigungen abgegeben hat (Pflichtphase), danach als
 * regelmäßige Auffrischung (alle ~30 Tage).
 *
 * Jede Bestätigung wird im audit_log unter Action
 * 'PFLICHT_SCHULUNG_GW_PEP_OK' gespeichert — damit kann im Doku-Bericht
 * für die Behördenkontrolle nachgewiesen werden, dass der MA regelmäßig
 * geschult + bestätigt wurde.
 */

interface Props {
  /** true = Pflichtphase, kann nicht abgebrochen werden. false = Auffrischung. */
  pflicht: boolean;
  /** Wievielte Bestätigung ist das (für Fortschrittsanzeige in Pflichtphase). */
  anzahl: number;
  /** Mindest-Anzahl Bestätigungen in Pflichtphase. */
  pflichtAnzahl: number;
  onBestaetigt: () => void;
  onSpaeter?: () => void;
}

export function PflichtSchulungGwPep({
  pflicht,
  anzahl,
  pflichtAnzahl,
  onBestaetigt,
  onSpaeter,
}: Props) {
  const session = useAuth((s) => s.session)!;
  const qc = useQueryClient();
  const [scrolledBottom, setScrolledBottom] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const bestaetigenMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('audit_log').insert({
        profile_id: session.profile.id,
        user_name: session.profile.name,
        rolle: session.profile.rolle,
        action: 'PFLICHT_SCHULUNG_GW_PEP_OK',
        new_val: {
          anzahl_nach_bestaetigung: anzahl + 1,
          pflichtphase: pflicht,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pflicht-schulung-gw-pep'] });
      onBestaetigt();
    },
    onError: (e) => setErr(String(e instanceof Error ? e.message : e)),
  });

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-auto"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="bg-surface border-4 rounded-xl w-full max-w-3xl my-4 shadow-2xl flex flex-col"
        style={{ borderColor: '#f87171', maxHeight: 'calc(100vh - 2rem)' }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 border-b-2 rounded-t-lg flex items-center gap-3 flex-shrink-0"
          style={{ borderColor: '#f87171', background: 'rgba(248,113,113,0.08)' }}
        >
          <div className="text-4xl">⚠️</div>
          <div className="flex-1">
            <h2 className="text-xl sm:text-2xl font-bold" style={{ color: '#f87171' }}>
              {pflicht ? 'Pflicht-Schulung' : 'Auffrischung'}
            </h2>
            <p className="text-sm text-muted mt-0.5">
              Geldwäsche-Verdachtsmeldung &amp; PEP-Prüfung ·{' '}
              <strong>{firstName(session.profile.name)}</strong>
            </p>
          </div>
          {pflicht && (
            <div
              className="text-xs mono px-2 py-1 rounded"
              style={{
                background: 'rgba(248,113,113,0.15)',
                color: '#f87171',
                border: '1px solid rgba(248,113,113,0.4)',
              }}
            >
              Bestätigung {anzahl + 1} / {pflichtAnzahl}
            </div>
          )}
        </div>

        {/* Scrollbarer Inhalt */}
        <div
          className="px-5 py-4 overflow-y-auto flex-1 space-y-5"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 20) {
              setScrolledBottom(true);
            }
          }}
        >
          <p className="text-base">
            Hallo <strong>{firstName(session.profile.name)}</strong>, bitte lies
            dir das kurz durch. Bei <strong>Behördenkontrolle</strong> wirst du
            gefragt, wie du eine Verdachtsmeldung abgibst und wie du eine PEP
            prüfst. Du musst das zeigen können.
          </p>

          {/* PEP-Teil */}
          <section
            className="rounded-lg p-4 space-y-3"
            style={{
              background: 'rgba(96,165,250,0.08)',
              border: '2px solid rgba(96,165,250,0.4)',
            }}
          >
            <div className="flex items-center gap-3">
              <IconPepCheck className="w-14 h-14 rounded-lg flex-shrink-0" />
              <div>
                <h3 className="text-lg font-bold" style={{ color: '#60a5fa' }}>
                  1. PEP-Prüfung — Free PEP Check
                </h3>
                <p className="text-xs text-muted">
                  Icon <em>„Free PEP Check"</em> auf dem Desktop
                </p>
              </div>
            </div>
            <div className="text-sm space-y-2">
              <p>
                <strong>PEP = Politisch Exponierte Person:</strong> Politiker,
                Behördenleiter, Richter, hohe Beamte — plus deren Familie und
                enge Vertraute.
              </p>
              <p>
                <strong>So prüfst du:</strong>
              </p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>
                  Doppelklick auf das Desktop-Icon{' '}
                  <strong>„Free PEP Check"</strong> (türkis-schwarzes Streifen-Icon)
                </li>
                <li>Name des Kunden eingeben → Suche starten</li>
                <li>
                  Wenn Treffer: <strong>sofort Tamer melden</strong>
                </li>
                <li>Keinen Treffer: dokumentieren und Kunden normal behandeln</li>
              </ol>
            </div>
          </section>

          {/* Geldwäsche-Teil */}
          <section
            className="rounded-lg p-4 space-y-3"
            style={{
              background: 'rgba(248,113,113,0.08)',
              border: '2px solid rgba(248,113,113,0.4)',
            }}
          >
            <div className="flex items-center gap-3">
              <IconAnonymerHinweis className="w-14 h-14 rounded-lg flex-shrink-0" />
              <div>
                <h3 className="text-lg font-bold" style={{ color: '#f87171' }}>
                  2. Geldwäsche-Verdachtsmeldung — anonymer Hinweis
                </h3>
                <p className="text-xs text-muted">
                  Icon <em>„anonymer Hinweis Geldwäsche"</em> auf dem Desktop
                </p>
              </div>
            </div>
            <div className="text-sm space-y-2">
              <p>
                <strong>Bei Verdacht auf Geldwäsche:</strong>
              </p>
              <ol className="list-decimal pl-5 space-y-1.5">
                <li>
                  <strong>Ruhig bleiben.</strong> Kunden normal weiter behandeln
                  — keine direkte Konfrontation.
                </li>
                <li>
                  Beobachtungen <strong>sofort dokumentieren</strong> über den
                  Doku-Button <span className="bg-warn/20 border border-warn/50 text-warn px-1.5 py-0.5 rounded text-xs font-bold">📋 Vorfall dokumentieren</span>{' '}
                  oben in der App. So viele Details wie möglich: Betrag,
                  Uhrzeit, Verhalten, Personen.
                </li>
                <li>
                  <strong>Tamer sofort informieren</strong> (Telefon).
                </li>
                <li>
                  Für die <strong>anonyme Meldung an die FIU (goAML)</strong>:
                  Doppelklick auf Desktop-Icon{' '}
                  <strong>„anonymer Hinweis Geldwäsche"</strong> (Icon mit Hand
                  + Geldschein) → Formular ausfüllen → absenden.
                </li>
                <li>
                  Dem Kunden gegenüber{' '}
                  <strong>niemals erwähnen</strong>, dass eine Meldung erfolgt
                  ist („Tipping-Off"-Verbot — strafbar!).
                </li>
              </ol>
            </div>
          </section>

          {/* Behördenkontrolle-Hinweis */}
          <section
            className="rounded-lg p-4"
            style={{
              background: 'rgba(251,191,36,0.08)',
              border: '2px solid rgba(251,191,36,0.4)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🏛️</span>
              <h3 className="text-base font-bold" style={{ color: '#fbbf24' }}>
                Wenn die Behörde kommt
              </h3>
            </div>
            <p className="text-sm">
              Du wirst gefragt: <em>„Wie geben Sie eine Geldwäsche-
              Verdachtsmeldung ab? Wie prüfen Sie eine PEP?"</em> Zeig ihnen
              die <strong>beiden Desktop-Icons</strong> und erkläre den Ablauf
              oben — genau so wie hier beschrieben.
            </p>
          </section>

          {/* Rechtlicher Hinweis */}
          <div
            className="text-xs text-muted italic p-3 rounded"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #2a2a2a' }}
          >
            Mit der untenstehenden Bestätigung erklärst du, dass du den Inhalt
            dieser Schulung <strong>gelesen und verstanden</strong> hast und
            weißt, wie du im Verdachtsfall zu handeln hast. Die Bestätigung
            wird mit Zeitstempel und deinem Namen im Audit-Log gespeichert
            (gemäß GwG §6).
          </div>

          {err && (
            <div className="text-sm text-minus bg-minus/10 border border-minus/30 rounded px-3 py-2">
              {err}
            </div>
          )}
        </div>

        {/* Footer mit Bestätigungs-Button */}
        <div
          className="px-5 py-4 border-t-2 rounded-b-lg flex items-center justify-between gap-3 flex-shrink-0 flex-wrap"
          style={{ borderColor: '#f87171', background: 'rgba(0,0,0,0.3)' }}
        >
          {!pflicht && onSpaeter ? (
            <button
              type="button"
              onClick={onSpaeter}
              className="btn-ghost text-sm px-3 py-2"
            >
              Später erinnern
            </button>
          ) : (
            <div className="text-xs text-muted">
              {scrolledBottom
                ? '✓ Du hast alles gelesen.'
                : '↓ Bitte komplett durchlesen (nach unten scrollen).'}
            </div>
          )}
          <button
            type="button"
            onClick={() => bestaetigenMut.mutate()}
            disabled={bestaetigenMut.isPending || !scrolledBottom}
            className="rounded-lg px-5 py-3 text-base font-bold text-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: scrolledBottom ? '#4ade80' : '#2a2a2a',
              color: scrolledBottom ? '#0a0a0a' : '#555',
            }}
          >
            {bestaetigenMut.isPending
              ? 'Speichere …'
              : '✓ Ich habe es gelesen und verstanden'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Vereinfachtes SVG des „Free PEP Check"-Desktop-Icons:
 * türkis-schwarze Streifen auf weißem Grund.
 */
function IconPepCheck({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ background: '#ffffff' }}
    >
      <g>
        <path d="M8 14 L50 10 L46 20 L4 22 Z" fill="#2ec5d3" />
        <path d="M14 24 L54 22 L50 32 L10 32 Z" fill="#1a1a1a" />
        <path d="M8 34 L52 32 L48 42 L4 44 Z" fill="#2ec5d3" />
        <path d="M14 46 L54 44 L48 54 L10 54 Z" fill="#1a1a1a" />
        <path d="M12 50 L18 56 L22 52" stroke="#2ec5d3" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/**
 * Vereinfachtes SVG des „anonymer Hinweis Geldwäsche"-Icons:
 * Hand mit Geldschein (grün-orange).
 */
function IconAnonymerHinweis({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ background: '#ffffff' }}
    >
      <g>
        {/* Geldschein (grün-gelb) */}
        <rect x="12" y="20" width="36" height="22" rx="2" fill="#a3d33a" stroke="#1a1a1a" strokeWidth="1.5" />
        <circle cx="30" cy="31" r="5" fill="#f4a742" stroke="#1a1a1a" strokeWidth="1" />
        <text x="30" y="34.5" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#1a1a1a">$</text>
        {/* Hand (orange) oben rechts */}
        <path
          d="M44 18 L54 16 L56 22 L48 26 Z"
          fill="#f4a742"
          stroke="#1a1a1a"
          strokeWidth="1"
        />
        {/* Pfeil (türkis) unten links */}
        <path
          d="M8 48 L18 52 L16 46 L22 50"
          stroke="#2ec5d3"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
