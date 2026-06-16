require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const ParkingEvent = require('./models/ParkingEvent');

if (!process.env.MONGODB_URI) {
  console.error('ERROR: MONGODB_URI is not defined in your .env file!');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

// ── Parking State ────────────────────────────────────────────────
let parkingState = {
  totalSlots: 4,
  availableSlots: 4,
  occupiedSlots: [],
  gateStatus: 'Closed',
  todayStats: {
    totalEntries: 0,
    totalExits: 0,
    peakHour: null,
    peakCount: 0
  }
};

// ── MongoDB Connection ───────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB Atlas');
    initializeDailyStats();
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// ── Helper: get today string in IST (YYYY-MM-DD) ─────────────────
function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// ── Initialize Today's Stats from DB ────────────────────────────
async function initializeDailyStats() {
  try {
    const todayStr = getTodayIST();

    const entries = await ParkingEvent.countDocuments({
      eventType: 'entry',
      $expr: {
        $eq: [
          { $dateToString: { date: '$timestamp', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } },
          todayStr
        ]
      }
    });

    const exits = await ParkingEvent.countDocuments({
      eventType: 'exit',
      $expr: {
        $eq: [
          { $dateToString: { date: '$timestamp', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } },
          todayStr
        ]
      }
    });

    const occupied = Math.max(0, entries - exits);
    parkingState.todayStats.totalEntries = entries;
    parkingState.todayStats.totalExits   = exits;
    parkingState.availableSlots = Math.max(0, parkingState.totalSlots - occupied);
    parkingState.occupiedSlots  = [];
    for (let i = 1; i <= occupied; i++) parkingState.occupiedSlots.push(i);

    await calculatePeakHour();
    console.log('📊 Daily stats loaded:', parkingState.todayStats);
  } catch (err) {
    console.error('Error loading daily stats:', err.message);
  }
}

// ── Calculate Peak Hour ──────────────────────────────────────────
async function calculatePeakHour() {
  const todayStr = getTodayIST();

  const result = await ParkingEvent.aggregate([
    {
      $match: {
        eventType: 'entry',
        $expr: {
          $eq: [
            { $dateToString: { date: '$timestamp', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } },
            todayStr
          ]
        }
      }
    },
    {
      $group: {
        _id: { $hour: { date: '$timestamp', timezone: 'Asia/Kolkata' } },
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 1 }
  ]);

  if (result.length > 0) {
    parkingState.todayStats.peakHour  = result[0]._id;
    parkingState.todayStats.peakCount = result[0].count;
  } else {
    parkingState.todayStats.peakHour  = null;
    parkingState.todayStats.peakCount = 0;
  }
}

function getNextAvailableSlot() {
  for (let i = 1; i <= parkingState.totalSlots; i++) {
    if (!parkingState.occupiedSlots.includes(i)) return i;
  }
  return null;
}

// ════════════════════════════════════════════════════════════════
//  API ROUTES
// ════════════════════════════════════════════════════════════════

// GET /api/status
app.get('/api/status', (req, res) => res.json(parkingState));

// POST /api/entry
app.post('/api/entry', async (req, res) => {
  if (parkingState.availableSlots <= 0) {
    io.emit('notification', {
      type: 'entry',
      message: 'Parking Full — No slot available!',
      status: 'error',
      timestamp: new Date()
    });
    return res.status(400).json({ success: false, message: 'Parking Full', gateOpen: false });
  }

  const slotNumber = getNextAvailableSlot();
  try {
    await new ParkingEvent({ eventType: 'entry', slotNumber }).save();
    parkingState.availableSlots--;
    parkingState.occupiedSlots.push(slotNumber);
    parkingState.todayStats.totalEntries++;
    parkingState.gateStatus = 'Open';

    io.emit('parkingUpdate', parkingState);
    io.emit('notification', {
      type: 'entry',
      message: `Car entered — Slot ${slotNumber} is now occupied`,
      status: 'success',
      timestamp: new Date(),
      slotNumber
    });

    setTimeout(() => {
      parkingState.gateStatus = 'Closed';
      io.emit('parkingUpdate', parkingState);
    }, 5000);

    await calculatePeakHour();
    res.json({ success: true, slotNumber, gateOpen: true, availableSlots: parkingState.availableSlots, message: `Car entered at Slot ${slotNumber}`, timestamp: new Date() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/exit
app.post('/api/exit', async (req, res) => {
  if (parkingState.occupiedSlots.length === 0) {
    io.emit('notification', {
      type: 'exit',
      message: 'No cars to exit — All slots are empty!',
      status: 'error',
      timestamp: new Date()
    });
    return res.status(400).json({ success: false, message: 'No cars to exit', gateOpen: false });
  }

  const slotNumber = parkingState.occupiedSlots.shift();
  try {
    await new ParkingEvent({ eventType: 'exit', slotNumber }).save();
    parkingState.availableSlots++;
    parkingState.todayStats.totalExits++;
    parkingState.gateStatus = 'Open';

    io.emit('parkingUpdate', parkingState);
    io.emit('notification', {
      type: 'exit',
      message: `Car exited — Slot ${slotNumber} is now available`,
      status: 'success',
      timestamp: new Date(),
      slotNumber
    });

    setTimeout(() => {
      parkingState.gateStatus = 'Closed';
      io.emit('parkingUpdate', parkingState);
    }, 5000);

    res.json({ success: true, slotNumber, gateOpen: true, availableSlots: parkingState.availableSlots, message: `Car exited from Slot ${slotNumber}`, timestamp: new Date() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
//  ✅ UPDATED: GET /api/hourly?date=YYYY-MM-DD
//  Supports any past date — not just today.
//  If no date param, defaults to today (IST).
// ════════════════════════════════════════════════════════════════
app.get('/api/hourly', async (req, res) => {
  try {
    // Use provided date or today in IST
    const dateStr = req.query.date || getTodayIST(); // YYYY-MM-DD

    const data = await ParkingEvent.aggregate([
      {
        $match: {
          $expr: {
            $eq: [
              { $dateToString: { date: '$timestamp', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } },
              dateStr
            ]
          }
        }
      },
      {
        $group: {
          _id: {
            hour: { $hour: { date: '$timestamp', timezone: 'Asia/Kolkata' } },
            type: '$eventType'
          },
          count: { $sum: 1 }
        }
      }
    ]);

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
//  ✅ NEW: GET /api/available-dates
//  Returns list of all dates that have parking data (for date picker)
// ════════════════════════════════════════════════════════════════
app.get('/api/available-dates', async (req, res) => {
  try {
    const dates = await ParkingEvent.aggregate([
      {
        $group: {
          _id: {
            $dateToString: { date: '$timestamp', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' }
          }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 60 }
    ]);
    res.json(dates.map(d => d._id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
//  ✅ NEW: GET /api/daily-summary?date=YYYY-MM-DD
//  Returns total entries, exits, peak hour for a specific date
// ════════════════════════════════════════════════════════════════
app.get('/api/daily-summary', async (req, res) => {
  try {
    const dateStr = req.query.date || getTodayIST();

    const matchStage = {
      $match: {
        $expr: {
          $eq: [
            { $dateToString: { date: '$timestamp', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } },
            dateStr
          ]
        }
      }
    };

    const [entries, exits, peak] = await Promise.all([
      ParkingEvent.countDocuments({
        eventType: 'entry',
        $expr: { $eq: [{ $dateToString: { date: '$timestamp', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } }, dateStr] }
      }),
      ParkingEvent.countDocuments({
        eventType: 'exit',
        $expr: { $eq: [{ $dateToString: { date: '$timestamp', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } }, dateStr] }
      }),
      ParkingEvent.aggregate([
        matchStage,
        { $match: { eventType: 'entry' } },
        { $group: { _id: { $hour: { date: '$timestamp', timezone: 'Asia/Kolkata' } }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 }
      ])
    ]);

    res.json({
      date: dateStr,
      totalEntries: entries,
      totalExits: exits,
      peakHour: peak[0]?._id ?? null,
      peakCount: peak[0]?.count ?? 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WebSocket ────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('🌐 Dashboard connected:', socket.id);
  console.log('📊 Daily stats loaded:', parkingState.todayStats);
  socket.emit('parkingUpdate', parkingState);
  socket.on('disconnect', () => console.log('🔌 Dashboard disconnected:', socket.id));
});

const PORT = process.env.PORT || 3003;
server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));