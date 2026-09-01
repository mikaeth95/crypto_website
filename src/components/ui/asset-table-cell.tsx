import {
  buildCryptoBubbleImageUrl,
  resolveCryptoBubbleAsset,
  type CryptoBubbleAssetLookup,
} from "../../hooks/useCryptoBubbleAssets";

export const AssetTableCell = ({
  asset,
  bubbleAssetsBySymbol,
}: {
  asset: string;
  bubbleAssetsBySymbol: CryptoBubbleAssetLookup;
}) => {
  const bubbleAsset = resolveCryptoBubbleAsset(asset, bubbleAssetsBySymbol);
  const imageUrl = buildCryptoBubbleImageUrl(bubbleAsset?.image);

  return (
    <span className="inline-flex items-center gap-2 font-medium text-slate-100">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="h-5 w-5 rounded-full bg-slate-950/60 object-cover"
          loading="lazy"
        />
      ) : null}
      <span>{asset}</span>
    </span>
  );
};
