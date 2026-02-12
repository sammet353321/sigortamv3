
const { createClient } = require('@supabase/supabase-js');
const config = require('./whatsapp-backend/src/config');

const supabase = createClient(config.supabaseUrl, config.supabaseKey);

async function checkStats() {
  const { data, error } = await supabase
    .from('daily_employee_stats')
    .select('*')
    .limit(5);
    
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Stats Data Sample:', data);
    console.log('Count:', data.length);
  }
}

checkStats();
