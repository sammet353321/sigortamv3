
const { createClient } = require('@supabase/supabase-js');
const config = require('./whatsapp-backend/src/config');

const supabase = createClient(config.supabaseUrl, config.supabaseKey);

async function fixStats() {
  const employeeId = 'db6036bd-414b-437d-9d11-e68ea462c426'; // SAMET
  
  console.log('Fetching raw quotes...');
  const { data: quotes, error } = await supabase
    .from('teklifler')
    .select('tanzim_tarihi, created_at')
    .eq('employee_id', employeeId);
    
  if (error) {
      console.error('Error fetching quotes:', error);
      return;
  }
  
  console.log(`Found ${quotes.length} quotes.`);
  
  // Group by Date
  const counts = {};
  quotes.forEach(q => {
      const dateStr = (q.tanzim_tarihi || q.created_at).split('T')[0];
      counts[dateStr] = (counts[dateStr] || 0) + 1;
  });
  
  console.log('Daily Counts:', counts);
  
  // Update Stats Table
  for (const [date, count] of Object.entries(counts)) {
      // Upsert to ensure row exists
      // First check if row exists to preserve policy_count
      const { data: existing } = await supabase
        .from('daily_employee_stats')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('date', date)
        .single();
        
      if (existing) {
          console.log(`Updating ${date}: quote_count = ${count}`);
          await supabase
            .from('daily_employee_stats')
            .update({ quote_count: count })
            .eq('id', existing.id);
      } else {
          console.log(`Inserting ${date}: quote_count = ${count}`);
          await supabase
            .from('daily_employee_stats')
            .insert({
                employee_id: employeeId,
                date: date,
                quote_count: count,
                policy_count: 0,
                total_premium: 0,
                total_commission: 0
            });
      }
  }
  
  console.log('Done fixing stats.');
}

fixStats();
