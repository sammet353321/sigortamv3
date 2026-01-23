require('dotenv').config();
const db = require('./src/Database');

(async () => {
    console.log('Checking/Creating Storage Bucket "chat-media"...');
    try {
        const { data: buckets, error } = await db.client.storage.listBuckets();
        if (error) throw error;

        const exists = buckets.find(b => b.name === 'chat-media');
        if (exists) {
            console.log('Bucket "chat-media" already exists.');
        } else {
            console.log('Bucket "chat-media" does not exist. Creating...');
            const { data, error: createError } = await db.client.storage.createBucket('chat-media', {
                public: true,
                fileSizeLimit: 5242880, // 5MB
                allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
            });
            if (createError) throw createError;
            console.log('Bucket "chat-media" created successfully.');
        }
    } catch (err) {
        console.error('Bucket setup error:', err);
    }
    process.exit(0);
})();