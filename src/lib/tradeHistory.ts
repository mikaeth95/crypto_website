/**
 * Trade-Historie nach dem FIFO-Prinzip (First In, First Out)
 *
 * Zweck:
 *   Ordnet jedem Verkauf die ältesten noch offenen Käufe ("Lots") desselben
 *   Assets zu und berechnet daraus realisierte Gewinne/Verluste je Verkauf
 *   (ClosedTrade mit den einzelnen FifoMatch-Zuordnungen). Alle nach den
 *   Verkäufen übrig gebliebenen Kaufmengen werden als offene Positionen
 *   (OpenLot) mit unrealisiertem Gewinn/Verlust zum aktuellen Kurs geliefert.
 *   Grundlage für die Seite "Trade-Historie" des Dashboards.
 *
 * Eingaben:
 *   - transactions: TransactionRow[] (aus der Supabase-Tabelle der importierten
 *     Transaktionen). Ausgewertet werden die Typen "Kauf", "Verkauf" und
 *     "Token-Umstellung"; Zahlen liegen als (lokalisierte) Strings vor und werden
 *     mit parseLocalizedNumber gelesen.
 *   - portfolioAssets: PortfolioAssetRow[] (optional) – liefert den aktuellen
 *     Kurs (currentPrice) je Asset/Quote-Paar für die offenen Lots.
 *
 * Ausgaben:
 *   TradeHistoryResult mit
 *   - closedTrades: ein Eintrag pro Verkauf, absteigend nach Verkaufsdatum sortiert,
 *   - openLots: Restmengen der Käufe, absteigend nach Kaufdatum sortiert.
 *   Renditen (returnPct) sind in Prozent (z. B. 12.5 = 12,5 %), nicht als Anteil.
 *
 * Annahmen:
 *   - Transaktionen werden chronologisch verarbeitet (occurredAt, sonst datum;
 *     bei gleichem Zeitpunkt nach transaktionId). Ohne gültiges Datum gilt
 *     Zeitstempel 0, d. h. solche Buchungen werden zuerst verarbeitet.
 *   - Mengen bevorzugen nettomenge vor menge, Werte nettowert vor bruttoWert;
 *     alle Beträge werden per Math.abs als positiv behandelt.
 *   - Einstandswert eines Kaufs (costBasis) = nettowert; fehlt dieser,
 *     bruttoWert + in die Quote umgerechnete Gebühr. buyFee in den Matches ist nur
 *     informativ und wird nicht zusätzlich vom Gewinn abgezogen. Analog gilt beim
 *     Verkauf: Nettoerlös = nettowert, sonst bruttoWert − Gebühr.
 *   - Rundung intern auf 12 Nachkommastellen (roundTo), Vergleiche mit EPSILON 1e-9,
 *     um Gleitkomma-Reste zu vermeiden. Es findet keine Anzeige-Rundung statt.
 *   - Andere Transaktionstypen (Einzahlung, Auszahlung, Staking usw.) werden ignoriert.
 *   - Verkaufsmengen ohne passenden offenen Lot (z. B. Leerverkauf oder fehlende
 *     Kaufhistorie) werden stillschweigend verworfen; ein Verkauf ganz ohne
 *     Treffer erzeugt keinen ClosedTrade.
 *   - Offener Punkt (Wunschkriterium): Käufe und Verkäufe werden nur innerhalb
 *     desselben Paares Asset|Quote gematcht. Ein in EUR gekaufter und in USD
 *     verkaufter Coin findet keinen Lot – der USD-Verkauf wird übersprungen und
 *     der EUR-Lot bleibt fälschlich offen. Es gibt keine Währungsumrechnung
 *     zwischen Quotes. Einzige Ausnahme: Token-Umstellungen übernehmen Lots
 *     aller Quotes (die Quote des Lots bleibt dabei erhalten).
 *   - Offener Punkt (Wunschkriterium): Gebühren werden nur berücksichtigt, wenn
 *     die Gebührenwährung (waehrungGebuehr / fee_currency) der Quote oder dem
 *     Asset entspricht. Gebühren in einer dritten Währung (z. B. CRO) werden mit 0
 *     angesetzt und weder umgerechnet noch zugeordnet.
 */
import type { PortfolioAssetRow, TransactionRow } from "../types/portfolio";
import { parseLocalizedNumber } from "./parsers";

// Toleranz für Gleitkomma-Vergleiche: Mengen darunter gelten als "aufgebraucht".
const EPSILON = 1e-9;

// Interner, veränderbarer Kauf-Lot: remainingQuantity wird bei Verkäufen bzw.
// Token-Umstellungen schrittweise reduziert.
type MutableLot = {
  id: string;
  asset: string;
  quote: string;
  buyDate: string;
  buyTimestamp: number;
  originalQuantity: number;
  remainingQuantity: number;
  unitCost: number;
  buyPrice: number;
  buyFeePerUnit: number;
  buyTransactionId: string;
};

// Eine einzelne Zuordnung "Teilmenge aus Kauf X wurde in Verkauf Y verkauft".
export type FifoMatch = {
  id: string;
  asset: string;
  quote: string;
  amount: number;
  buyDate: string;
  sellDate: string;
  buyPrice: number;
  sellPrice: number;
  costBasis: number;
  buyFee: number;
  grossProceeds: number;
  sellFee: number;
  netProceeds: number;
  realizedPnl: number;
  returnPct: number | null;
  holdingDays: number;
  buyTransactionId: string;
  sellTransactionId: string;
};

// Zusammenfassung eines Verkaufs über alle zugehörigen FIFO-Matches.
export type ClosedTrade = {
  id: string;
  asset: string;
  quote: string;
  sellDate: string;
  amount: number;
  averageCost: number;
  sellPrice: number;
  costBasis: number;
  grossProceeds: number;
  sellFee: number;
  netProceeds: number;
  realizedPnl: number;
  returnPct: number | null;
  averageHoldingDays: number;
  sellTransactionId: string;
  matches: FifoMatch[];
};

// Noch nicht verkaufte Restmenge eines Kaufs inkl. Bewertung zum aktuellen Kurs.
export type OpenLot = {
  id: string;
  asset: string;
  quote: string;
  buyDate: string;
  originalQuantity: number;
  remainingQuantity: number;
  buyPrice: number;
  costBasis: number;
  currentPrice: number | null;
  currentValue: number | null;
  unrealizedPnl: number | null;
  returnPct: number | null;
  buyTransactionId: string;
};

export type TradeHistoryResult = {
  closedTrades: ClosedTrade[];
  openLots: OpenLot[];
};

// Schneidet Gleitkomma-Artefakte ab (z. B. 0.30000000000000004), ohne fachlich zu runden.
const roundTo = (value: number, decimals = 12) => Number(value.toFixed(decimals));

// Liefert Anzeigedatum (YYYY-MM-DD) und Zeitstempel für die Sortierung.
// occurredAt (exakte Uhrzeit aus dem Import) hat Vorrang vor dem reinen Datum.
const parseTransactionDate = (transaction: TransactionRow) => {
  const value = transaction.occurredAt ?? transaction.datum;
  const timestamp = value ? new Date(value).getTime() : Number.NaN;

  return {
    date: transaction.datum ?? (Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : ""),
    timestamp: Number.isFinite(timestamp) ? timestamp : 0,
  };
};

// Rechnet die Gebühr einer Transaktion in die Quote-Währung um, damit sie mit
// Einstandswert und Erlös vergleichbar ist.
// Offener Punkt (Wunschkriterium): Nur zwei Fälle werden unterstützt:
//   - Gebührenwährung == Quote  -> Gebühr unverändert,
//   - Gebührenwährung == Asset  -> Gebühr * Ausführungspreis.
// Eine Gebühr in einer dritten Währung (weder Asset noch Quote, z. B. CRO) sowie
// eine Gebühr ohne angegebene Währung wird mit 0 angesetzt – es gibt keinen
// Wechselkurs für die Umrechnung. Ist nettowert gesetzt, ist eine solche Gebühr
// nur dann im Einstandswert/Erlös enthalten, wenn der Import sie dort bereits
// eingerechnet hat; in buyFee/sellFee erscheint sie in jedem Fall nicht.
const resolveFeeInQuote = (transaction: TransactionRow, executionPrice: number) => {
  const fee = Math.abs(parseLocalizedNumber(transaction.gebuehr) ?? 0);
  const feeCurrency = transaction.waehrungGebuehr?.trim().toUpperCase();
  const asset = transaction.asset.trim().toUpperCase();
  const quote = transaction.quote?.trim().toUpperCase();

  if (fee <= EPSILON || !feeCurrency || !quote) {
    return 0;
  }

  if (feeCurrency === quote) {
    return fee;
  }

  if (feeCurrency === asset && executionPrice > EPSILON) {
    return fee * executionPrice;
  }

  return 0;
};

// Lots werden pro Paar "ASSET|QUOTE" geführt (z. B. "BTC|EUR").
// Offener Punkt (Wunschkriterium): Durch diesen Schlüssel sind BTC|EUR und
// BTC|USD getrennte FIFO-Warteschlangen; ein quote-übergreifendes Matching findet nicht statt.
const createLotKey = (asset: string, quote: string) => `${asset.toUpperCase()}|${quote.toUpperCase()}`;

// Hängt einen Lot hinten an die Warteschlange seines Paares an. Die Reihenfolge
// im Array ist die FIFO-Reihenfolge beim Verkauf.
const pushLot = (lots: Map<string, MutableLot[]>, lot: MutableLot) => {
  const key = createLotKey(lot.asset, lot.quote);
  const existing = lots.get(key) ?? [];
  existing.push(lot);
  lots.set(key, existing);
};

// Token-Umstellung (z. B. Umbenennung/Redenomination eines Coins): Überträgt
// offene Lots des alten Assets auf das neue Asset. Der Einstandswert bleibt
// erhalten, nur Menge und Stückkosten werden mit dem Umtauschverhältnis
// (nextQuantity / previousQuantity) umgerechnet. Kaufdatum und Quote des
// ursprünglichen Lots bleiben bestehen, damit die Haltedauer weiterhin ab dem
// Originalkauf zählt. Es werden Lots aller Quotes des alten Assets
// berücksichtigt (ältester zuerst); übersteigt previousQuantity die offenen
// Mengen, wird der Rest ignoriert.
// Hinweis: Die neuen Lots werden hinten an die Warteschlange des neuen Assets
// angehängt, obwohl sie das ältere Kaufdatum tragen.
const migrateLots = (
  lots: Map<string, MutableLot[]>,
  previousAsset: string,
  nextAsset: string,
  previousQuantity: number,
  nextQuantity: number,
  migrationId: string,
) => {
  if (previousQuantity <= EPSILON || nextQuantity <= EPSILON || previousAsset === nextAsset) {
    return;
  }

  let remainingPreviousQuantity = previousQuantity;
  const conversionRate = nextQuantity / previousQuantity;
  const sourceLots = Array.from(lots.values())
    .flat()
    .filter(
      (lot) => lot.asset.toUpperCase() === previousAsset.toUpperCase() && lot.remainingQuantity > EPSILON,
    )
    .sort((left, right) => left.buyTimestamp - right.buyTimestamp);

  sourceLots.forEach((lot, index) => {
    if (remainingPreviousQuantity <= EPSILON) {
      return;
    }

    const migratedQuantity = Math.min(remainingPreviousQuantity, lot.remainingQuantity);
    const nextLotQuantity = roundTo(migratedQuantity * conversionRate);
    const migratedCostBasis = roundTo(migratedQuantity * lot.unitCost);

    lot.remainingQuantity = roundTo(Math.max(lot.remainingQuantity - migratedQuantity, 0));
    remainingPreviousQuantity = roundTo(Math.max(remainingPreviousQuantity - migratedQuantity, 0));

    pushLot(lots, {
      ...lot,
      id: `${migrationId}:${index}`,
      asset: nextAsset,
      originalQuantity: nextLotQuantity,
      remainingQuantity: nextLotQuantity,
      unitCost: nextLotQuantity > EPSILON ? migratedCostBasis / nextLotQuantity : 0,
      buyFeePerUnit: lot.buyFeePerUnit / conversionRate,
    });
  });
};

/**
 * Hauptfunktion: spielt alle Transaktionen chronologisch ab, baut dabei die
 * Lot-Warteschlangen auf und verrechnet jeden Verkauf FIFO gegen die ältesten
 * offenen Käufe desselben Asset|Quote-Paares.
 */
export const calculateTradeHistory = (
  transactions: TransactionRow[],
  portfolioAssets: PortfolioAssetRow[] = [],
): TradeHistoryResult => {
  const lots = new Map<string, MutableLot[]>();
  const closedTrades: ClosedTrade[] = [];
  const currentAssets = new Map(
    portfolioAssets.map((asset) => [createLotKey(asset.asset, asset.quote), asset]),
  );
  const sortedTransactions = [...transactions].sort((left, right) => {
    const timeDifference = parseTransactionDate(left).timestamp - parseTransactionDate(right).timestamp;
    return timeDifference || left.transaktionId.localeCompare(right.transaktionId);
  });

  sortedTransactions.forEach((transaction) => {
    const asset = transaction.asset.trim().toUpperCase();
    const quote = transaction.quote?.trim().toUpperCase();
    const { date, timestamp } = parseTransactionDate(transaction);

    if (!asset || !quote) {
      return;
    }

    // Kauf: neuen Lot anlegen. Stückkosten = Einstandswert (inkl. Gebühr) / Nettomenge.
    // Fehlt ein Ausführungspreis, wird er aus Bruttowert / Menge abgeleitet.
    if (transaction.typ === "Kauf") {
      const quantity = Math.abs(
        parseLocalizedNumber(transaction.nettomenge) ?? parseLocalizedNumber(transaction.menge) ?? 0,
      );
      const grossValue = Math.abs(parseLocalizedNumber(transaction.bruttoWert) ?? 0);
      const executionPrice = Math.abs(
        parseLocalizedNumber(transaction.ausfuehrungspreis) ??
          (quantity > EPSILON ? grossValue / quantity : 0),
      );
      const costBasis = Math.abs(
        parseLocalizedNumber(transaction.nettowert) ??
          grossValue + resolveFeeInQuote(transaction, executionPrice),
      );
      // Offener Punkt (Wunschkriterium): Gebühr in Drittwährung ergibt hier 0 (siehe resolveFeeInQuote).
      const feeInQuote = resolveFeeInQuote(transaction, executionPrice);

      // Käufe ohne Menge oder ohne Wert (z. B. Gratis-Token) erzeugen keinen Lot.
      if (quantity <= EPSILON || costBasis <= EPSILON) {
        return;
      }

      pushLot(lots, {
        id: transaction.transaktionId,
        asset,
        quote,
        buyDate: date,
        buyTimestamp: timestamp,
        originalQuantity: quantity,
        remainingQuantity: quantity,
        unitCost: costBasis / quantity,
        buyPrice: executionPrice,
        buyFeePerUnit: feeInQuote / quantity,
        buyTransactionId: transaction.transaktionId,
      });
      return;
    }

    // Token-Umstellung: Beim Import steht das neue Asset in "asset", das alte
    // Asset in "quote", die neue Menge in nettomenge/menge und die alte Menge in
    // nettowert/bruttoWert. Daher wird "quote" hier als vorheriges Asset übergeben.
    if (transaction.typ === "Token-Umstellung") {
      const nextQuantity = Math.abs(
        parseLocalizedNumber(transaction.nettomenge) ?? parseLocalizedNumber(transaction.menge) ?? 0,
      );
      const previousQuantity = Math.abs(
        parseLocalizedNumber(transaction.nettowert) ?? parseLocalizedNumber(transaction.bruttoWert) ?? 0,
      );

      migrateLots(lots, quote, asset, previousQuantity, nextQuantity, transaction.transaktionId);
      return;
    }

    if (transaction.typ !== "Verkauf") {
      return;
    }

    const quantity = Math.abs(
      parseLocalizedNumber(transaction.nettomenge) ?? parseLocalizedNumber(transaction.menge) ?? 0,
    );
    const grossProceeds = Math.abs(parseLocalizedNumber(transaction.bruttoWert) ?? 0);
    const executionPrice = Math.abs(
      parseLocalizedNumber(transaction.ausfuehrungspreis) ??
        (quantity > EPSILON ? grossProceeds / quantity : 0),
    );
    // Offener Punkt (Wunschkriterium): Verkaufsgebühr in Drittwährung ergibt 0 und
    // mindert den Nettoerlös nur, wenn nettowert sie bereits enthält.
    const sellFee = resolveFeeInQuote(transaction, executionPrice);
    const netProceeds = Math.abs(
      parseLocalizedNumber(transaction.nettowert) ?? Math.max(grossProceeds - sellFee, 0),
    );

    if (quantity <= EPSILON) {
      return;
    }

    let remainingQuantity = quantity;
    const matches: FifoMatch[] = [];
    // Offener Punkt (Wunschkriterium): Es werden nur Lots mit exakt derselben
    // Quote herangezogen. Lots desselben Assets in einer anderen Quote (z. B. EUR-Kauf
    // bei USD-Verkauf) bleiben unberührt; eine Umrechnung zwischen Quotes erfolgt nicht.
    const availableLots = lots.get(createLotKey(asset, quote)) ?? [];

    // FIFO: Lots in Array-Reihenfolge (ältester zuerst) abarbeiten, bis die
    // Verkaufsmenge gedeckt ist. Erlös und Verkaufsgebühr werden anteilig
    // (matchedAmount / quantity) auf die einzelnen Matches verteilt.
    availableLots.forEach((lot, matchIndex) => {
      if (remainingQuantity <= EPSILON || lot.remainingQuantity <= EPSILON) {
        return;
      }

      const matchedAmount = Math.min(remainingQuantity, lot.remainingQuantity);
      const allocation = matchedAmount / quantity;
      const costBasis = roundTo(matchedAmount * lot.unitCost);
      const allocatedGrossProceeds = roundTo(grossProceeds * allocation);
      const allocatedNetProceeds = roundTo(netProceeds * allocation);
      const realizedPnl = roundTo(allocatedNetProceeds - costBasis);
      const holdingDays = Math.max(0, Math.floor((timestamp - lot.buyTimestamp) / 86_400_000));

      matches.push({
        id: `${transaction.transaktionId}:${matchIndex}`,
        asset,
        quote,
        amount: roundTo(matchedAmount),
        buyDate: lot.buyDate,
        sellDate: date,
        buyPrice: lot.buyPrice,
        sellPrice: executionPrice,
        costBasis,
        buyFee: roundTo(lot.buyFeePerUnit * matchedAmount),
        grossProceeds: allocatedGrossProceeds,
        sellFee: roundTo(sellFee * allocation),
        netProceeds: allocatedNetProceeds,
        realizedPnl,
        returnPct: costBasis > EPSILON ? roundTo((realizedPnl / costBasis) * 100) : null,
        holdingDays,
        buyTransactionId: lot.buyTransactionId,
        sellTransactionId: transaction.transaktionId,
      });

      lot.remainingQuantity = roundTo(Math.max(lot.remainingQuantity - matchedAmount, 0));
      remainingQuantity = roundTo(Math.max(remainingQuantity - matchedAmount, 0));
    });

    // Kein passender Lot (z. B. Kauf in anderer Quote oder fehlende Kaufhistorie):
    // Der Verkauf wird nicht in der Historie geführt.
    // Offener Punkt (Wunschkriterium): quote-übergreifende Verkäufe landen hier.
    if (!matches.length) {
      return;
    }

    // Aggregation über die tatsächlich gematchte Menge. Nicht gedeckte Restmengen
    // fließen weder in Menge noch in Erlös des ClosedTrade ein.
    // Die Haltedauer wird mengengewichtet gemittelt.
    const matchedAmount = matches.reduce((total, match) => total + match.amount, 0);
    const costBasis = matches.reduce((total, match) => total + match.costBasis, 0);
    const matchedGrossProceeds = matches.reduce((total, match) => total + match.grossProceeds, 0);
    const matchedSellFee = matches.reduce((total, match) => total + match.sellFee, 0);
    const matchedNetProceeds = matches.reduce((total, match) => total + match.netProceeds, 0);
    const realizedPnl = matchedNetProceeds - costBasis;
    const weightedHoldingDays = matches.reduce(
      (total, match) => total + match.holdingDays * match.amount,
      0,
    );

    closedTrades.push({
      id: transaction.transaktionId,
      asset,
      quote,
      sellDate: date,
      amount: roundTo(matchedAmount),
      averageCost: matchedAmount > EPSILON ? roundTo(costBasis / matchedAmount) : 0,
      sellPrice: executionPrice,
      costBasis: roundTo(costBasis),
      grossProceeds: roundTo(matchedGrossProceeds),
      sellFee: roundTo(matchedSellFee),
      netProceeds: roundTo(matchedNetProceeds),
      realizedPnl: roundTo(realizedPnl),
      returnPct: costBasis > EPSILON ? roundTo((realizedPnl / costBasis) * 100) : null,
      averageHoldingDays:
        matchedAmount > EPSILON ? Math.round(weightedHoldingDays / matchedAmount) : 0,
      sellTransactionId: transaction.transaktionId,
      matches,
    });
  });

  // Offene Lots: Restmengen zum aktuellen Kurs des gleichen Asset|Quote-Paares
  // bewerten. Ohne bekannten Kurs bleiben Wert, unrealisierter Gewinn und Rendite null.
  const openLots = Array.from(lots.values())
    .flat()
    .filter((lot) => lot.remainingQuantity > EPSILON)
    .map<OpenLot>((lot) => {
      const portfolioAsset = currentAssets.get(createLotKey(lot.asset, lot.quote));
      const currentPrice = portfolioAsset?.currentPrice ?? null;
      const costBasis = roundTo(lot.remainingQuantity * lot.unitCost);
      const currentValue = currentPrice === null ? null : roundTo(lot.remainingQuantity * currentPrice);
      const unrealizedPnl = currentValue === null ? null : roundTo(currentValue - costBasis);

      return {
        id: lot.id,
        asset: lot.asset,
        quote: lot.quote,
        buyDate: lot.buyDate,
        originalQuantity: roundTo(lot.originalQuantity),
        remainingQuantity: roundTo(lot.remainingQuantity),
        buyPrice: lot.buyPrice,
        costBasis,
        currentPrice,
        currentValue,
        unrealizedPnl,
        returnPct:
          unrealizedPnl !== null && costBasis > EPSILON
            ? roundTo((unrealizedPnl / costBasis) * 100)
            : null,
        buyTransactionId: lot.buyTransactionId,
      };
    })
    .sort((left, right) => right.buyDate.localeCompare(left.buyDate));

  return {
    closedTrades: closedTrades.sort((left, right) => right.sellDate.localeCompare(left.sellDate)),
    openLots,
  };
};
