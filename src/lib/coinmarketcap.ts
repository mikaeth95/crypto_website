export type CmcMapItem = {
  id: number;
  name: string;
  symbol: string;
  slug: string;
};

const CMC_SYMBOL_OVERRIDES: Record<string, string> = {
  "1INCH": "1inch",
  ADA: "cardano",
  ALGO: "algorand",
  APT: "aptos",
  ARB: "arbitrum",
  ATOM: "cosmos",
  AVAX: "avalanche",
  BCH: "bitcoin-cash",
  BOBA: "boba-network",
  BNB: "bnb",
  BTC: "bitcoin",
  COMP: "compound",
  CRO: "cronos",
  DIA: "dia",
  DOGE: "dogecoin",
  DOT: "polkadot-new",
  EGLD: "multiversx-egld",
  ETC: "ethereum-classic",
  ETH: "ethereum",
  FIL: "filecoin",
  GNO: "gnosis-gno",
  HBAR: "hedera",
  INJ: "injective",
  KAVA: "kava",
  LINK: "chainlink",
  LSK: "lisk",
  LTC: "litecoin",
  OP: "optimism-ethereum",
  PAXG: "pax-gold",
  PYR: "vulcan-forged-pyr",
  RENDER: "render",
  RONIN: "ronin",
  SAND: "the-sandbox",
  SHIB: "shiba-inu",
  SOL: "solana",
  TAO: "bittensor",
  TFUEL: "theta-fuel",
  TON: "toncoin",
  TRX: "tron",
  UNI: "uniswap",
  VRA: "verasity",
  WBTC: "wrapped-bitcoin",
  XAUT: "tether-gold",
  XLM: "stellar",
  XRP: "xrp",
  XTZ: "tezos",
  YFI: "yearn-finance",
  YGG: "yield-guild-games",
};

let cachedItemsBySymbol: Map<string, CmcMapItem[]> | null = null;

export function getBaseSymbol(instrument: string): string {
  return instrument.split("_")[0]?.trim() ?? "";
}

export function buildCoinMarketCapUrl(slug: string): string {
  return `https://coinmarketcap.com/currencies/${slug}/`;
}

export function setCoinMarketCapMap(items: CmcMapItem[] | null): void {
  if (!items || items.length === 0) {
    cachedItemsBySymbol = null;
    return;
  }

  const nextLookup = new Map<string, CmcMapItem[]>();

  items.forEach((item) => {
    const symbol = item.symbol.trim().toUpperCase();
    const slug = item.slug.trim();

    if (!symbol || !slug) {
      return;
    }

    const existing = nextLookup.get(symbol);

    if (existing) {
      existing.push(item);
    } else {
      nextLookup.set(symbol, [item]);
    }
  });

  cachedItemsBySymbol = nextLookup;
}

const resolveSlugFromCachedMap = (baseSymbol: string): string | null => {
  if (!cachedItemsBySymbol) {
    return null;
  }

  const matches = cachedItemsBySymbol.get(baseSymbol);

  if (!matches || matches.length !== 1) {
    return null;
  }

  const [match] = matches;
  const slug = match.slug.trim();

  return slug || null;
};

export function resolveCoinMarketCapUrlForInstrument(instrument: string): string | null {
  const baseSymbol = getBaseSymbol(instrument).toUpperCase();

  if (!baseSymbol) {
    return null;
  }

  const overrideSlug = CMC_SYMBOL_OVERRIDES[baseSymbol];

  if (overrideSlug) {
    return buildCoinMarketCapUrl(overrideSlug);
  }

  const cachedSlug = resolveSlugFromCachedMap(baseSymbol);

  if (cachedSlug) {
    return buildCoinMarketCapUrl(cachedSlug);
  }

  return null;
}
