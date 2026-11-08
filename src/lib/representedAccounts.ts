/**
 * Börsenkonten (represented_accounts).
 *
 * Zweck:
 *   Konstanten und Hilfsfunktionen für Börsenkonten. Ein Börsenkonto bündelt die
 *   Transaktionen, Importdateien und Chart-Zusammenstellungen einer Plattform.
 *
 * Eingaben:
 *   Kontodatensätze mit provider und name.
 *
 * Ausgaben:
 *   Erkennung und Sortierung des Sammelkontos "All", Vorlage für neue Konten.
 *
 * Annahmen:
 *   - Jeder Benutzer hat ein Sammelkonto "All" (provider "all"). Es enthält selbst
 *     keine Transaktionen, sondern steht in der Oberfläche für "alle Konten".
 *   - provider eines echten Kontos ist die Importplattform. Daraus leiten sich
 *     Börse und Plattform jeder Transaktion ab (3. Normalform).
 */
export const ALL_REPRESENTED_ACCOUNT_PROVIDER = "all";
export const ALL_REPRESENTED_ACCOUNT_NAME = "All";
export const DEFAULT_REPRESENTED_ACCOUNT_BASE_CURRENCY = "EUR";

export const DEFAULT_ALL_REPRESENTED_ACCOUNT = {
  name: ALL_REPRESENTED_ACCOUNT_NAME,
  provider: ALL_REPRESENTED_ACCOUNT_PROVIDER,
  base_currency: DEFAULT_REPRESENTED_ACCOUNT_BASE_CURRENCY,
} as const;

export const isAllRepresentedAccount = (
  account: { provider: string; name: string } | null | undefined,
): boolean =>
  Boolean(
    account &&
      (account.provider === ALL_REPRESENTED_ACCOUNT_PROVIDER || account.name === ALL_REPRESENTED_ACCOUNT_NAME),
  );

export const sortRepresentedAccounts = <T extends { provider: string; name: string; created_at: string }>(
  accounts: T[],
): T[] =>
  [...accounts].sort((left, right) => {
    if (isAllRepresentedAccount(left) && !isAllRepresentedAccount(right)) {
      return -1;
    }

    if (!isAllRepresentedAccount(left) && isAllRepresentedAccount(right)) {
      return 1;
    }

    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  });

export const createRepresentedAccountSeed = (
  provider: string,
  name: string,
  baseCurrency: string = DEFAULT_REPRESENTED_ACCOUNT_BASE_CURRENCY,
) => ({
  provider,
  name,
  base_currency: baseCurrency,
});
