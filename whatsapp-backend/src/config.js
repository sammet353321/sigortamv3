const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file (Root directory)
dotenv.config({ path: path.join(__dirname, '../../.env') });

module.exports = {
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
    port: process.env.PORT || 3004,
    apiSecret: process.env.API_SECRET || 'SigortaSecurev3_2026_Key', // Fallback for local dev
    geminiApiKey: process.env.GEMINI_API_KEY
};