# Crypto Portfolio Dashboard

Webanwendung zur Auswertung eines persönlichen Krypto-Portfolios. Benutzer importieren den CSV-Export ihrer Börse (derzeit Crypto.com Exchange). Die Anwendung zeigt daraus Bestände, Trade-Historie (FIFO), Performance, Märkte und Live-Charts.

Die Anwendung ist eine React-Single-Page-Anwendung (React 19, TypeScript, Vite, Tailwind). Das Backend ist Supabase (PostgreSQL, Auth, Storage), gehostet wird auf Netlify. Einen eigenen Applikationsserver gibt es nicht, der Browser spricht direkt mit der Datenbank. **Die Zugriffskontrolle liegt deshalb vollständig in den Row-Level-Security-Regeln der Datenbank.** Prüfungen im Frontend (ausgeblendete Menüpunkte, Routenprüfung, Formularprüfung) dienen nur der Bedienerführung und sind kein Schutz.

## Benutzertypen

| Rolle   | Rechte |
| ------- | ------ |
| `user`  | Sieht und bearbeitet nur die eigenen Börsenkonten, Transaktionen, Importdateien, Chart-Zusammenstellungen und Einstellungen. |
| `admin` | Alle Rechte eines `user`. Zusätzlich: Benutzerübersicht unter `/admin` (nur Zählwerte) und Umstellen der Rolle anderer Benutzer. Kein Einblick in fremde Transaktionen, Importdateien oder Bestände. |

Jeder neue Benutzer bekommt die Rolle `user`. Der letzte Administrator kann nicht herabgestuft werden.

## Voraussetzungen

- Node.js 20 oder höher (siehe `.nvmrc`), npm
- Ein Supabase-Projekt (kostenloser Plan reicht)
- Für das Hosting optional ein Netlify-Konto

## Supabase-Projekt einrichten

1. Unter <https://supabase.com> ein neues Projekt anlegen.
2. **Datenbank aufsetzen**, abhängig vom Ausgangszustand:
   - **Neues, leeres Projekt:** Den gesamten Inhalt von `supabase/schema.sql` im SQL-Editor ausführen. Die Datei beschreibt den Sollzustand und legt Tabellen, Funktionen, Trigger, Zugriffsregeln und den Storage-Bucket an. Die Migrationsskripte werden dann nicht benötigt.
   - **Bestehende Datenbank mit dem alten Schema:** Die Migrationsskripte in der Reihenfolge unten einspielen.
3. **Passwortregel setzen:** Unter *Authentication → Sign In / Providers → Email* (je nach Supabase-Version *Authentication → Policies* bzw. *Password Settings*) die minimale Passwortlänge auf **8** stellen. Das Registrierungsformular prüft dieselbe Regel. Die Prüfung im Browser allein ist aber kein Schutz, weil sie sich umgehen lässt. Verbindlich ist die Einstellung in Supabase.
4. **Redirect-URL setzen:** Unter *Authentication → URL Configuration* die Site URL (z. B. `https://<deine-seite>.netlify.app`) und für die lokale Entwicklung `http://localhost:5173/dashboard` als Redirect-URL eintragen. Dorthin führt der Bestätigungslink der Registrierungs-Mail.
5. Unter *Project Settings → API* die **Project URL** und den **Publishable Key** kopieren (siehe Umgebungsvariablen).

### Reihenfolge der Migrationsskripte

Nur für eine bestehende Datenbank. **Zuerst auf einer Kopie der Datenbank testen.** Jedes Skript läuft in einer Transaktion: Schlägt ein Schritt fehl, wird nichts übernommen.

| Nr. | Datei | Inhalt |
| --- | ----- | ------ |
| 1 | `supabase/migrations/01_dritte_normalform.sql` | Bringt das Schema in die dritte Normalform: entfernt doppelt gespeicherte und transitiv abhängige Spalten, lagert die Handelspaare der Chart-Zusammenstellungen in `live_chart_preset_assets` aus, ersetzt den Dateinamen in Transaktionen durch den Fremdschlüssel `import_file_id` und stellt die Zugriffsregeln auf die Prüfung über das Börsenkonto um. |
| 2 | `supabase/migrations/02_benutzerrollen.sql` | Führt die Rollen `user` und `admin` ein, mit Rollenschutz per Trigger, Zusatzrechten für Administratoren und der Funktion `admin_user_overview()`. |

Vor Skript 1 prüfen, ob die Handelspaare als Textliste gespeichert sind:

```sql
select assets from public.live_chart_presets limit 5;
-- erwartet z. B. ["BTC_EUR","ETH_EUR"]
```

Nach Skript 1 prüfen, wie viele Transaktionen keiner Importdatei zugeordnet werden konnten:

```sql
select count(*) filter (where import_file_id is null) as ohne_datei,
       count(*) as gesamt
from public.imported_transactions;
```

Hinweis: In `schema.sql` kürzt die Registrierungsfunktion `handle_new_user` den Anzeigenamen auf 60 Zeichen, passend zur neuen Prüfung `profiles_display_name_len`. Die Migrationsskripte ändern diese Funktion nicht. Für bestehende Datenbanken die Funktion `handle_new_user` aus `schema.sql` zusätzlich einmal ausführen, sonst schlägt eine Registrierung mit überlangem Namen fehl.

### Ersten Administrator setzen

Nach Skript 2 (bzw. nach `schema.sql`) haben alle Benutzer die Rolle `user`. Den ersten Administrator einmalig im SQL-Editor setzen (E-Mail anpassen, der Benutzer muss bereits registriert sein):

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'DEINE@ADRESSE.AT');
```

Das funktioniert nur im SQL-Editor, weil dort kein angemeldeter App-Benutzer aktiv ist. Weitere Administratoren ernennt danach ein Administrator in der Anwendung unter `/admin`.

## Umgebungsvariablen

Im Projektverzeichnis eine Datei `.env` anlegen (Vorlage: `.env.example`). Die `.env` ist in `.gitignore` eingetragen und kommt nicht ins Repository.

| Variable | Bedeutung |
| -------- | --------- |
| `VITE_SUPABASE_URL` | Project URL des Supabase-Projekts. **Muss mit `https://` beginnen**, sonst startet die Anwendung nicht und zeigt eine Fehlermeldung. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) Key des Projekts. Dieser Schlüssel ist öffentlich und gewährt nur, was die Zugriffsregeln erlauben. Niemals den `service_role`-Key eintragen. |

Beispiel:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

Auf Netlify werden dieselben Variablen unter *Site configuration → Environment variables* hinterlegt.

## Starten und bauen

```bash
npm install        # Abhängigkeiten installieren
npm run dev        # Entwicklungsserver, http://localhost:5173
npm run build      # Typprüfung (TypeScript strict) und Produktions-Build nach dist/
npm run preview    # gebauten Stand lokal ansehen
```

## Hosting auf Netlify

`netlify.toml` enthält Buildbefehl, Ausgabeordner, die Weiterleitung aller Pfade auf `index.html` (Single-Page-Anwendung) und Sicherheitsköpfe (`Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`). Weitere Hinweise stehen in `docs/netlify-deploy.md`.

## Projektstruktur (Auszug)

| Pfad | Inhalt |
| ---- | ------ |
| `src/lib/transactionImports.ts` | CSV-Import und Aufbereitung der Transaktionen, Bestände nach Durchschnittskosten |
| `src/lib/tradeHistory.ts` | FIFO-Zuordnung von Käufen und Verkäufen |
| `src/lib/calculations.ts` | Kennzahlen des Dashboards |
| `src/context/AppDataContext.tsx` | Laden der Transaktionen, Importablauf |
| `src/context/UserDataContext.tsx` | Profil und Rolle, Börsenkonten, Chart-Zusammenstellungen, Einstellungen |
| `src/pages/AdminPage.tsx` | Administrationsbereich |
| `supabase/schema.sql` | Sollzustand der Datenbank |
| `supabase/migrations/` | Migrationsskripte vom alten Schema zum Sollzustand |
