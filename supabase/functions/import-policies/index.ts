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
    // We inject the user.id as employee_id for security
    const processedRows = rows.map(row => ({
      policy_no: row.policy_no,
      customer_name: row.customer_name,
      branch: row.branch,
      start_date: row.start_date,
      end_date: row.end_date,
      premium_amount: row.premium_amount,
      commission_amount: row.commission_amount || 0,
      employee_id: user.id, // Secure injection
      // created_at is handled by DB default or preserved if provided
    }))

    // Perform Bulk Upsert
    const { data, error } = await supabaseClient
      .from('policies')
      .upsert(processedRows, { 
        onConflict: 'policy_no',
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
