
const { createClient } = require('@supabase/supabase-js');
const config = require('./src/config');

const supabase = createClient(config.supabaseUrl, config.supabaseKey);

async function addColumn() {
    console.log('Adding quoted_message_id column via SQL function (if available) or checking schema...');
    
    // Attempt 1: Check if column exists
    const { data, error } = await supabase
        .from('messages')
        .select('quoted_message_id')
        .limit(1);

    if (error) {
        console.error('Column check failed (Expected if missing):', error.message);
        
        // Since we cannot run ALTER TABLE via supabase-js client directly without RPC,
        // we will try to use a Remote Procedure Call (RPC) if the user has one set up for exec_sql.
        // If not, we cannot automate this fully without connection string (postgres://) which we don't have.
        // The .env only has SUPABASE_URL (HTTP) and SERVICE_ROLE_KEY.
        
        // HOWEVER, we can use the Service Role Key to perhaps enable it? No, still need SQL.
        
        console.log('\n*** MANUAL ACTION REQUIRED ***');
        console.log('Please run the following SQL in your Supabase Dashboard > SQL Editor:');
        console.log('ALTER TABLE messages ADD COLUMN IF NOT EXISTS quoted_message_id TEXT;');
        console.log('********************************\n');
    } else {
        console.log('Column quoted_message_id ALREADY EXISTS.');
    }
}

addColumn();
