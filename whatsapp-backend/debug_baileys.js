const Baileys = require('@whiskeysockets/baileys');
console.log('Baileys keys:', Object.keys(Baileys));
console.log('default keys:', Baileys.default ? Object.keys(Baileys.default) : 'no default');
console.log('makeInMemoryStore:', Baileys.makeInMemoryStore);
