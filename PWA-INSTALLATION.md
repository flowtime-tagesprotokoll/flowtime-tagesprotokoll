# Flowtime PWA — Installation auf den Kassen-PCs

**URL:** https://flowtime-tagesprotokoll.github.io/flowtime-tagesprotokoll/

Die App läuft jetzt als Web-Anwendung im Browser. Damit sie sich anfühlt wie ein
echtes Programm (eigenes Fenster, Icon im Startmenü, Reminder als
Windows-Toasts), wird sie auf jedem PC einmalig **als App installiert**.

## Auf jeder Kasse einmal:

1. **Firefox** öffnen (auf den Tipwin-PCs vorhanden, von Tipwin geduldet)
2. Adresszeile: `https://flowtime-tagesprotokoll.github.io/flowtime-tagesprotokoll/` → Enter
3. Mit Admin / PIN einloggen → es kommt die Frage **"Benachrichtigungen erlauben?"** → **Erlauben**
4. Browser-Menü oben rechts (☰) → **"App installieren"** (oder bei manchen Versionen über die URL-Leiste das ⊕-Icon)
   - Falls Firefox das nicht anbietet: alternativ **Lesezeichen auf den Desktop ziehen** (geht zur Not auch)
5. Es entsteht ein Desktop-Icon **"Flowtime"** und ein Eintrag im Startmenü

Doppelklick auf das Icon → eigenes Fenster ohne Browser-Leiste.

## Reminder als Windows-Toast

Wenn die Benachrichtigungen einmal erlaubt wurden, ploppen die
Schicht-Reminder als Windows-System-Toast unten rechts auf — auch wenn die
App im Hintergrund ist. Klick auf den Toast → die App-Fenster kommt nach
vorn und zeigt das Vollbild-Reminder-Modal.

## Updates

Es gibt **keine manuellen Updates mehr**. Sobald wir Änderungen in den
Code pushen, baut GitHub Actions die neue Version, deployed sie, und der
Service-Worker holt sie beim nächsten App-Start automatisch im Hintergrund.

## Fehler-Diagnose

| Problem | Lösung |
|---------|--------|
| Keine Reminder-Toasts | Firefox → Einstellungen → Datenschutz & Sicherheit → Berechtigungen → Benachrichtigungen → "flowtime-tagesprotokoll.github.io" auf "Erlauben" |
| Login-Bildschirm leer | Internet weg → kurz F5 drücken |
| App "klemmt" mit alter Version | Strg+Shift+R (Hard-Reload) — der SW lädt dann die neue Version |
