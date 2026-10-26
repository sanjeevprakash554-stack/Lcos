const db = require('../config/db');

async function seedAllDriversTrips() {
  // Clean production mode: Fleets and drivers are registered through the user interface or APIs
  console.log('Driver & fleet sync: clean production mode (no dummy fleet).');
}

if (require.main === module) {
  seedAllDriversTrips()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}

module.exports = { seedAllDriversTrips };
