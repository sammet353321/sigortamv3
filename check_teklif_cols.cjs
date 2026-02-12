
const { createClient } = require('@supabase/supabase-js');
const config = require('./whatsapp-backend/src/config');

const supabase = createClient(config.supabaseUrl, config.supabaseKey);

async function checkColumns() {
  const { data, error } = await supabase
    .from('policeler')
    .select('*')
    .limit(1);
    
  if (error) {
    console.error('Error:', error);
  } else {
    if (data.length > 0) {
        console.log('Policeler Columns:', Object.keys(data[0]));
    }
  }
}

checkColumns();
