
export type Role = 'admin' | 'employee' | 'sub_agent';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  created_at: string;
}

export type TeklifDurumu = 'bekliyor' | 'islemde' | 'hesaplandi' | 'policelestirme_bekliyor' | 'reddedildi' | 'policelesti' | 'tamamlandi' | 'iptal';

export interface Teklif {
  id: string;
  ad_soyad?: string;
  dogum_tarihi?: string;
  sirket?: string;
  tarih: string; // created_at
  tanzim_tarihi?: string;
  sasi?: string;
  plaka: string;
  tc_vkn?: string;
  belge_no?: string;
  arac_cinsi?: string;
  brut_prim?: number;
  tur?: string;
  kesen_id?: string;
  ilgili_kisi_id: string; // sub_agent_id
  police_no?: string;
  acente?: string;
  kart_bilgisi?: string;
  ek_bilgiler?: string;
  net_prim?: number;
  komisyon?: number;
  
  durum: TeklifDurumu;
  notlar?: string;
  guncellenme_tarihi: string;

  // Additional Fields for Compatibility
  sasi_no?: string; // Mapped to sasi
  tc?: string;      // Mapped to tc_vkn
  ruhsat_seri_no?: string; // Mapped to belge_no

  // Guest Info (JSONB)
  misafir_bilgi?: {
    source?: 'whatsapp' | 'whatsapp_group' | 'web';
    phone?: string;
    group_id?: string;
    group_name?: string;
  };

  // Joins
  ilgili_kisi?: { name: string }; // joined user
}

export type PoliceDurumu = 'aktif' | 'iptal';

export interface Police {
  id: string;
  ad_soyad?: string;
  dogum_tarihi?: string;
  sirket?: string;
  tarih: string;
  sasi?: string;
  plaka: string;
  tc_vkn?: string;
  belge_no?: string;
  arac_cinsi?: string;
  brut_prim?: number;
  tur?: string;
  kesen_id?: string;
  ilgili_kisi_id: string;
  police_no: string;
  acente?: string;
  kart_bilgisi?: string;
  ek_bilgiler?: string;
  net_prim?: number;
  komisyon?: number;
  
  teklif_id?: string;
  pdf_url?: string;
  durum: PoliceDurumu;
  guncellenme_tarihi: string;

  // Additional Fields for Compatibility
  sasi_no?: string; // Mapped to sasi

  ilgili_kisi?: { name: string };
}

export interface Policy {
  id: string;
  policy_no: string;
  customer_name: string;
  branch: string;
  start_date: string;
  end_date: string;
  premium_amount: number;
  created_at: string;
}
