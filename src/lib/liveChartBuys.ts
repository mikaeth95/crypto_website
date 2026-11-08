/**
 * Kaufmarkierungen für die Live-Charts
 *
 * Zweck:
 *   Fasst alle Käufe eines Handelspaares (z. B. BTC_EUR) pro Kalendertag
 *   zusammen, damit im Live-Kurschart je Tag eine Markierung mit Gesamtmenge,
 *   Gesamtkosten, Durchschnittspreis und Anzahl der Käufe angezeigt werden kann.
 *
 * Eingaben:
 *   TransactionRow[] (importierte Transaktionen); ausgewertet werden nur Zeilen
 *   vom Typ "Kauf" (Groß-/Kleinschreibung und Leerzeichen egal).
 *
 * Ausgaben:
 *   Map<MarketSymbol, LiveChartBuyDay[]>: pro Symbol die Kauftage, aufsteigend
 *   nach Tages-Zeitstempel (Sekunden, 00:00 UTC) sortiert – das Format, das die
 *   Chart-Bibliothek für Marker erwartet.
 *
 * Annahmen:
 *   - Gruppierung nach datum (UTC-Tag), nicht nach exakter Uhrzeit.
 *   - Symbol = "ASSET_QUOTE", normalisiert über normalizeMarketSymbol; Zeilen ohne
 *     gültiges Symbol oder Datum werden ignoriert.
 *   - Menge bevorzugt menge vor nettomenge und Kosten bruttoWert vor nettowert,
 *     d. h. der Durchschnittspreis entspricht dem Ausführungspreis ohne Gebühren
 *     (anders als die FIFO-Berechnung, die Nettowerte bevorzugt).
 *   - Nur positive Mengen und Kosten zählen; es gibt keine Währungsumrechnung.
 */
import { parseLocalizedNumber, safeDate } from "./parsers";
import { normalizeMarketSymbol, type LiveChartBuyDay, type MarketSymbol } from "../types/market";
import type { TransactionRow } from "../types/portfolio";

// Unix-Zeitstempel in Sekunden für Tagesbeginn (UTC), passend zu Tageskerzen im Chart.
const toUtcDayTimestamp = (date: string): number => Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);

const buildAggregateKey = (symbol: MarketSymbol, date: string) => `${symbol}|${date}`;

// Aggregiert Käufe je Symbol und Tag und liefert sie nach Symbol gruppiert.
export const buildLiveChartBuyDaysBySymbol = (
  transactions: TransactionRow[],
): Map<MarketSymbol, LiveChartBuyDay[]> => {
  const aggregateMap = new Map<string, LiveChartBuyDay>();
  const buyDaysBySymbol = new Map<MarketSymbol, LiveChartBuyDay[]>();

  transactions.forEach((transaction) => {
    if (transaction.typ.trim().toLowerCase() !== "kauf") {
      return;
    }

    const date = safeDate(transaction.datum);
    const symbol = normalizeMarketSymbol(`${transaction.asset}_${transaction.quote ?? ""}`);

    if (!date || !symbol) {
      return;
    }

    const totalQuantity = parseLocalizedNumber(transaction.menge) ?? parseLocalizedNumber(transaction.nettomenge);
    const totalCost = parseLocalizedNumber(transaction.bruttoWert) ?? parseLocalizedNumber(transaction.nettowert);

    if (totalQuantity === null || totalQuantity <= 0 || totalCost === null || totalCost <= 0) {
      return;
    }

    const aggregateKey = buildAggregateKey(symbol, date);
    const currentAggregate = aggregateMap.get(aggregateKey);

    if (!currentAggregate) {
      aggregateMap.set(aggregateKey, {
        symbol,
        date,
        time: toUtcDayTimestamp(date),
        totalQuantity,
        totalCost,
        averagePrice: totalCost / totalQuantity,
        tradeCount: 1,
      });
      return;
    }

    // Weiterer Kauf am selben Tag: Summen erhöhen und mengengewichteten Durchschnittspreis neu berechnen.
    currentAggregate.totalQuantity += totalQuantity;
    currentAggregate.totalCost += totalCost;
    currentAggregate.tradeCount += 1;
    currentAggregate.averagePrice =
      currentAggregate.totalQuantity > 0 ? currentAggregate.totalCost / currentAggregate.totalQuantity : currentAggregate.averagePrice;
  });

  aggregateMap.forEach((buyDay) => {
    const symbolBuyDays = buyDaysBySymbol.get(buyDay.symbol) ?? [];
    symbolBuyDays.push(buyDay);
    buyDaysBySymbol.set(buyDay.symbol, symbolBuyDays);
  });

  // Chart-Marker müssen zeitlich aufsteigend vorliegen.
  buyDaysBySymbol.forEach((buyDays, symbol) => {
    buyDaysBySymbol.set(
      symbol,
      buyDays.sort((left, right) => left.time - right.time),
    );
  });

  return buyDaysBySymbol;
};
