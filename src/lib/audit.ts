import { supabase } from './supabase';
import { useAuth } from './authStore';

interface LogAuditArgs {
  action: string;
  protoId?: string | null;
  field?: string | null;
  oldVal?: unknown;
  newVal?: unknown;
}

/**
 * Schreibt einen Eintrag in public.audit_log. Liest die aktuelle Session aus
 * dem AuthStore (nicht aus einem React-Hook), damit der Aufruf auch ausserhalb
 * von Komponenten funktioniert. Fehler werden geschluckt — der Audit darf den
 * Save-Pfad nicht abbrechen.
 */
export async function logAudit(args: LogAuditArgs): Promise<void> {
  const session = useAuth.getState().session;
  if (!session) return;
  try {
    await supabase.from('audit_log').insert({
      profile_id: session.profile.id,
      user_name: session.profile.name,
      rolle: session.profile.rolle,
      action: args.action,
      proto_id: args.protoId ?? null,
      field: args.field ?? null,
      old_val: args.oldVal === undefined ? null : args.oldVal,
      new_val: args.newVal === undefined ? null : args.newVal,
    });
  } catch (e) {
    console.warn('[audit] log failed:', e);
  }
}
