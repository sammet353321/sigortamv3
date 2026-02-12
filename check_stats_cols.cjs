
const { createClient } = require('@supabase/supabase-js');
const config = require('./whatsapp-backend/src/config');

const supabase = createClient(config.supabaseUrl, config.supabaseKey);

async function checkCols() {
  const { data, error } = await supabase
    .from('daily_employee_stats')
    .select('product_breakdown, company_breakdown')
    .limit(1);
    
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Breakdown Cols:', data);
  }
}

checkCols();
