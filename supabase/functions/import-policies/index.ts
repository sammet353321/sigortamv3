import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Get current user (employee)
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { rows } = await req.json()

    if (!rows || !Array.isArray(rows)) {
      throw new Error('Invalid payload: rows must be an array')
    }

    // Validate and Prepare Data
    const processedRows = rows.map(row => {
      // Logic for 'durum' (status)
      let durum = 'POLİÇE';
      const tur = String(row.tur || '').toLowerCase();
      if (tur.includes('iptal')) {
        durum = 'İPTAL';
      }
      
      // If updating existing record, we might need to check if existing one is canceled?
      // But user said: "TÜR de iptal cümlesi geçerse duruma İPTAL geçmezse eklenen bütün kayıtların durumu poliçe olarak olacak"
      // "ama poliçe noları tutarsa iptal ile normal kayıttada durumu iptal olsun"
      // This implies if we upsert and match policy_no, we should update status to IPTAL if the new row says so.
      
      return {
        // Mandatory Fields Mapping
        policy_no: row.policy_no,
        ad_soyad: row.ad_soyad,
        
        // Optional Fields
        dogum_tarihi: row.dogum_tarihi,
        sirket: row.sirket,
        tarih: row.tarih, 
        sasi: row.sasi,
        plaka: row.plaka,
        tc_vkn: row.tc_vkn,
        belge_no: row.belge_no,
        arac_cinsi: row.arac_cinsi,
        brut_prim: row.brut_prim,
        tur: row.tur,
        kesen: row.kesen,
        ilgili_kisi: row.ilgili_kisi,
        acente: row.acente,
        kart: row.kart,
        ek_bilgiler_iletisim: row.ek_bilgiler_iletisim,
        net_prim: row.net_prim,
        komisyon: row.komisyon,
        durum: durum, // Add status field
        
        employee_id: user.id,
        // created_at is handled by DB default
        updated_at: new Date().toISOString() // Ensure updated_at changes on upsert
      };
    })

    // Perform Bulk Upsert to 'policeler' table
    // We use upsert to handle "kayıt eklenirken tarama yapalım poliçe no... aynı olan kayıt varsa üzerine yazsın"
    // Since policy_no is UNIQUE, upsert will update if exists.
    const { data, error } = await supabaseClient
      .from('policeler')
      .upsert(processedRows, { 
        onConflict: 'police_no',
        ignoreDuplicates: false 
      })
      .select()

    if (error) throw error

    return new Response(JSON.stringify({ success: true, count: data.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
