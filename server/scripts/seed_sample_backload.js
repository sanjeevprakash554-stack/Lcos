const db = require('../config/db');

async function seedSampleBackloads() {
  console.log('Return Load Hub check: No sample backloads injected (clean production mode).');
}

if (require.main === module) {
  seedSampleBackloads()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Error seeding backloads:', err);
      process.exit(1);
    });
}

module.exports = { seedSampleBackloads };
