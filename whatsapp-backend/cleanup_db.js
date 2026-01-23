const db = require('./src/Database');

(async () => {
    console.log('Force cleaning ALL sessions in DB...');
    try {
        const { error } = await db.client
            .from('whatsapp_sessions')
            .update({ 
                status: 'disconnected', 
                qr_code: null, 
                phone_number: null,
                updated_at: new Date().toISOString()
            })
            .neq('status', 'disconnected'); // Update all that are NOT disconnected

        if (error) {
            console.error('Error cleaning DB:', error);
        } else {
            console.log('Successfully disconnected all stale sessions.');
        }
    } catch (err) {
        console.error('Fatal cleanup error:', err);
    }
    process.exit(0);
})();