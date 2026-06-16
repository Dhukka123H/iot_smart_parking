const mongoose = require('mongoose');

mongoose.connect("YOUR_MONGODB_URL") //Replace "YOUR_MONGODB_URL" to your actual MongoDB String. 
  .then(() => {
    console.log("✅ Connected successfully");
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ Error:", err);
    process.exit(1);
  });