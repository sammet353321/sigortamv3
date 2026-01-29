const Baileys = require('@whiskeysockets/baileys');
console.log('Keys in Baileys:', Object.keys(Baileys));
if (Baileys.default) {
    console.log('Keys in Baileys.default:', Object.keys(Baileys.default));
}
