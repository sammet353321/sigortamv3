const fs = require('fs');

class InMemoryStore {
    constructor() {
        this.contacts = {};
        this.chats = {};
        this.messages = {};
    }

    bind(ev) {
        ev.on('contacts.upsert', (contacts) => {
            for (const contact of contacts) {
                this.contacts[contact.id] = {
                    ...this.contacts[contact.id],
                    ...contact
                };
            }
        });
        
        ev.on('contacts.update', (updates) => {
             for (const update of updates) {
                 if (this.contacts[update.id]) {
                     Object.assign(this.contacts[update.id], update);
                 }
             }
        });
    }

    readFromFile(path) {
        try {
            if (fs.existsSync(path)) {
                const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
                this.contacts = data.contacts || {};
                this.chats = data.chats || {};
            }
        } catch (e) {
            console.error('Failed to read store:', e);
        }
    }

    writeToFile(path) {
        try {
            fs.writeFileSync(path, JSON.stringify({
                contacts: this.contacts,
                chats: this.chats
            }, null, 2));
        } catch (e) {
            console.error('Failed to write store:', e);
        }
    }
}

module.exports = () => new InMemoryStore();
