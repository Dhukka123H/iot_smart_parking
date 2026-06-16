const mongoose = require('mongoose');

const parkingEventSchema = new mongoose.Schema({
  eventType: {
    type: String,
    enum: ['entry', 'exit'],
    required: true
  },
  slotNumber: {
    type: Number,
    required: true
  },
  timestamp: {
  type: Date,
  default: () => new Date()
  }
});

parkingEventSchema.index({ eventType: 1, timestamp: -1 });

module.exports = mongoose.model('ParkingEvent', parkingEventSchema);
