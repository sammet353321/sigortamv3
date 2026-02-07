const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

module.exports = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    port: process.env.PORT || 3004,
    apiSecret: process.env.API_SECRET || 'SigortaSecurev3_2026_Key' // Fallback for local dev
};