import { useEffect, useState } from "react";

export type CryptoBubbleAsset = {
  image?: string;
  slug?: string;
  symbol?: string;
  symbols?: Record<string, string | undefined>;
};

export type CryptoBubbleAssetLookup = Record<string, CryptoBubbleAsset>;

const BUBBLES_DATA_URL = "/data/bubbles1000.json";
const CRYPTO_BUBBLES_ASSET_BASE_URL = "https://cryptobubbles.net/backend/";
const BUBBLE_SYMBOL_ALIASES: Record<string, string> = {
  GRAM: "TON",
};

let cachedAssetsBySymbol: CryptoBubbleAssetLookup | null = null;
let pendingAssetsRequest: Promise<CryptoBubbleAssetLookup> | null = null;

const loadCryptoBubbleAssets = () => {
  if (cachedAssetsBySymbol) {
    return Promise.resolve(cachedAssetsBySymbol);
  }

  if (pendingAssetsRequest) {
    return pendingAssetsRequest;
  }

  pendingAssetsRequest = fetch(BUBBLES_DATA_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to load bubbles data: ${response.status}`);
      }

      return response.json() as Promise<CryptoBubbleAsset[]>;
    })
    .then((bubbleAssets) => {
      cachedAssetsBySymbol = bubbleAssets.reduce<CryptoBubbleAssetLookup>((lookup, asset) => {
        const symbol = asset.symbol?.trim().toUpperCase();

        if (symbol && !lookup[symbol]) {
          lookup[symbol] = asset;
        }

        return lookup;
      }, {});

      return cachedAssetsBySymbol;
    })
    .finally(() => {
      pendingAssetsRequest = null;
    });

  return pendingAssetsRequest;
};

export const resolveCryptoBubbleAsset = (symbol: string, assetsBySymbol: CryptoBubbleAssetLookup) => {
  const normalizedSymbol = symbol.trim().toUpperCase();
  return assetsBySymbol[normalizedSymbol] ?? assetsBySymbol[BUBBLE_SYMBOL_ALIASES[normalizedSymbol]];
};

export const buildCryptoBubbleImageUrl = (imagePath: string | undefined) => {
  if (!imagePath) {
    return null;
  }

  return new URL(imagePath, CRYPTO_BUBBLES_ASSET_BASE_URL).toString();
};

export const useCryptoBubbleAssets = () => {
  const [assetsBySymbol, setAssetsBySymbol] = useState<CryptoBubbleAssetLookup>(cachedAssetsBySymbol ?? {});

  useEffect(() => {
    let cancelled = false;

    void loadCryptoBubbleAssets()
      .then((nextAssetsBySymbol) => {
        if (!cancelled) {
          setAssetsBySymbol(nextAssetsBySymbol);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAssetsBySymbol({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return assetsBySymbol;
};
