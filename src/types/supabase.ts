import type { ChartTimeframe, LiveChartProvider, MarketSymbol } from "./market";

export interface ProfileRecord {
  id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface RepresentedAccountRecord {
  id: string;
  owner_user_id: string;
  name: string;
  provider: string;
  base_currency: string | null;
  created_at: string;
  updated_at: string;
}

export interface LiveChartPresetRecord {
  id: string;
  owner_user_id: string;
  represented_account_id: string | null;
  provider: LiveChartProvider | string;
  name: string;
  assets: MarketSymbol[];
  created_at: string;
  updated_at: string;
}

export interface UserPreferencesRecord {
  owner_user_id: string;
  selected_preset_id: string | null;
  selected_timeframe: ChartTimeframe | string | null;
  selected_represented_account_id: string | null;
  updated_at: string;
}

export interface ImportedTransactionRecord {
  id: string;
  owner_user_id: string;
  represented_account_id: string;
  source_platform: string;
  external_id: string;
  source_file_name: string | null;
  occurred_at: string;
  transaction_type: string;
  asset: string;
  quote: string | null;
  quantity: number | string | null;
  execution_price: number | string | null;
  gross_value: number | string | null;
  fee: number | string | null;
  fee_currency: string | null;
  net_quantity: number | string | null;
  net_value: number | string | null;
  exchange: string;
  data_source: string;
  raw_payload: unknown;
  created_at: string;
  updated_at: string;
}

export interface ImportHistoryFileRecord {
  id: string;
  owner_user_id: string;
  represented_account_id: string;
  source_platform: string;
  stored_file_name: string;
  original_file_name: string | null;
  storage_bucket: string;
  storage_path: string;
  content_type: string | null;
  file_size_bytes: number | string;
  imported_at: string;
  created_at: string;
  updated_at: string;
}
