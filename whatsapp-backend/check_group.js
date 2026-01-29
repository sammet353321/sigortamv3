
const db = require('./src/db');

async function check() {
    console.log('Searching for groups...');
    const { data: groups, error } = await db.client
        .from('chat_groups')
        .select('*')
        .ilike('name', '%koç%'); // Case insensitive search for koç

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Found Groups:', JSON.stringify(groups, null, 2));
    }
}

check();
