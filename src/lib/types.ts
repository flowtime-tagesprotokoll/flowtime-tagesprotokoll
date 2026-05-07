export type Rolle = 'admin' | 'bezirksleiter' | 'mitarbeiter';

export interface Shop {
  id: string;
  name: string;
  kurz: string;
  aktiv: boolean;
  reihenfolge: number;
  created_at: string;
}

export interface Profile {
  id: string;
  auth_user_id: string | null;
  name: string;
  rolle: Rolle;
  aktiv: boolean;
  reihenfolge: number;
  created_at: string;
  pin_hash: string | null;
}

export interface Protokoll {
  id: string;
  shop_id: string;
  datum: string;
  erstellt_von: string | null;
  erstellt_am: string;
  aktualisiert_am: string;
}

export type KassenbewegungTyp = 'einlage' | 'entnahme';

export interface Kassenbewegung {
  id: string;
  schicht_id: string;
  typ: KassenbewegungTyp;
  beschreibung: string | null;
  betrag: number;
  reihenfolge: number;
}

export interface Schicht {
  id: string;
  protokoll_id: string;
  schicht_nr: 1 | 2;
  mitarbeiter_id: string | null;
  zeit_von: string | null;
  zeit_bis: string | null;
  kassenstart: number | null;
  kassenstart_manuell: boolean;
  kassenstart_grund: string | null;
  kassenabrechnung: number | null;
  beleg_storage_path: string | null;
  guthaben_kundenkarte: number | null;
  offene_auszahlungen: number | null;
  kassenist: number | null;
  kommentar: string | null;
  uebergabe_notiz: string | null;
}

export interface AuditEntry {
  id: number;
  ts: string;
  profile_id: string | null;
  user_name: string | null;
  rolle: string | null;
  action: string;
  proto_id: string | null;
  field: string | null;
  old_val: unknown;
  new_val: unknown;
}

/** Aktive Session: entweder Admin (mit Supabase-Auth) oder Mitarbeiter (nur Profil). */
export type Session =
  | { kind: 'admin'; profile: Profile; authUserId: string }
  | { kind: 'mitarbeiter'; profile: Profile };
