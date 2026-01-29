require('dotenv').config();
module.exports = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    port: process.env.PORT || 3004
};
