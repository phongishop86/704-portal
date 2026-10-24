export interface User {
  id: string;
  full_name: string;
  role: string;
  telegram_id?: string;
  is_active?: boolean;
}

/** Tài sản đúng như lưu trong collection `assets` (dùng chung với giao diện 704-assets). */
export interface WebAsset {
  id: string;
  code: string;
  name: string;
  category_id?: string | null;
  department_id?: string | null;
  current_user_id?: string | null;
  status?: string;
  _kw?: string[];
  _del?: boolean;
  [k: string]: unknown;
}

export interface Repair {
  id: string;
  ticket_code?: string;
  asset_id: string;
  description?: string;
  status: string;
  it_id?: string | null;
  tcth_at?: string | null;
  created_at?: string;
  _del?: boolean;
  [k: string]: unknown;
}

export interface Button {
  text: string;
  data: string;
}

export interface Reply {
  text: string;
  buttons?: Button[];
}
