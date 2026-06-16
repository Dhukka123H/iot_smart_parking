# 🚗 IoT Smart Parking System

A real-time smart parking management system built with an **ESP8266** microcontroller, a **Node.js + Socket.io** backend, and a **live web dashboard**. IR sensors detect cars entering and exiting, a servo-controlled gate opens automatically, and every event is pushed live to a browser dashboard with charts and notifications.

---

## ✨ Features

- 🔄 **Real-time updates** via WebSockets (Socket.io) — no page refresh needed
- 🅿️ **Live slot grid** showing available / occupied parking spots
- 🚧 **Automatic gate control** using a servo motor, triggered by IR sensors
- 📟 **LCD display** on the hardware unit showing live slot count and gate status
- 📊 **Hourly activity chart** with date navigation (today, yesterday, and historical days)
- 🔔 **Toast notifications** and a scrollable activity log for entries/exits
- 🌙 **Light/dark theme toggle** on the dashboard
- 📈 **Daily summary stats** — total entries, exits, and peak hour

---

## 🏗️ Architecture

```
ESP8266 (sensors + gate + LCD)
        │  HTTP POST /api/entry, /api/exit
        ▼
Node.js Backend (Express + Socket.io + MongoDB)
        │  WebSocket: parkingUpdate, notification
        ▼
Web Dashboard (HTML + Tailwind + Chart.js)
```

- The **ESP8266** detects cars via IR sensors, opens/closes the gate, updates its onboard LCD, and notifies the backend over HTTP whenever a car enters or exits.
- The **backend** maintains the current parking state, stores historical entry/exit events in MongoDB, exposes a REST API for stats, and broadcasts live updates to all connected dashboards via Socket.io.
- The **frontend** is a single-page dashboard that connects over WebSockets for live updates and calls the REST API for historical charts and daily summaries.

---

## 📁 Project Structure

```
smart_parking_backend/
├── models/              # Mongoose schemas
├── node_modules/
├── .env                 # Environment variables (not committed)
├── package.json
├── server.js            # Express + Socket.io server
└── test.js

smart_parking_frontend/
├── js/
│   └── app.js           # Dashboard logic (sockets, charts, UI)
└── index.html            # Dashboard markup

smart_parking_using_esp8266/
└── smart_parking_using_esp8266.ino   # Firmware for the ESP8266
```

---

## 🔧 Hardware Setup (ESP8266)

| Component         | Pin   |
|--------------------|-------|
| IR Sensor (Entry)  | D5    |
| IR Sensor (Exit)   | D6    |
| Servo (Gate)       | D4    |
| Green LED          | D3    |
| Red LED            | D7    |
| LCD SDA            | D1    |
| LCD SCL            | D2    |

The LCD uses an I2C interface (`LiquidCrystal_I2C`, default address `0x27`, 16×2).

### Required Arduino Libraries
- `ESP8266WiFi`
- `ESP8266HTTPClient`
- `Servo`
- `Wire`
- `LiquidCrystal_I2C`

### Firmware Configuration
Before flashing, update these values in `smart_parking_using_esp8266.ino`:

```cpp
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_IP     = "YOUR_BACKEND_LOCAL_IP";   // e.g. 192.168.0.159
const int   SERVER_PORT   = 3000;
```

> ⚠️ **Security note:** Wi-Fi credentials are currently hardcoded directly in the `.ino` file. Avoid committing real credentials to a public repo — consider moving them to a separate untracked header file (e.g. `secrets.h`, added to `.gitignore`) if you plan to publish this project.

---

## 🖥️ Backend Setup

```bash
cd smart_parking_backend
npm install
```

Create a `.env` file in `smart_parking_backend/` with at least:

```
PORT=3000
MONGODB_URI=your_mongodb_atlas_connection_string
```

Start the server:

```bash
node server.js
```

The server should now be listening on `http://<your-local-ip>:3000`.

---

## 🌐 Frontend Setup

1. Open `smart_parking_frontend/js/app.js` and set the backend address:

   ```js
   const SERVER_URL = 'http://<your-backend-local-ip>:3000';
   ```

2. Open `smart_parking_frontend/index.html` in a browser (or serve it with any static file server / Live Server extension).

The dashboard will automatically connect over WebSockets and start showing live data once the backend is running.

---

## 📡 API Reference (inferred from frontend usage)

| Method | Endpoint                       | Description                                  |
|--------|----------------------------------|-----------------------------------------------|
| GET    | `/api/status`                   | Current slot/gate status + today's stats       |
| GET    | `/api/hourly?date=YYYY-MM-DD`   | Hourly entry/exit counts for a given date      |
| GET    | `/api/daily-summary?date=YYYY-MM-DD` | Total entries, exits, and peak hour for a date |
| GET    | `/api/available-dates`          | List of dates with recorded activity           |
| POST   | `/api/entry`                    | Called by ESP8266 when a car enters            |
| POST   | `/api/exit`                     | Called by ESP8266 when a car exits             |

### Socket.io Events

| Event            | Direction        | Payload                                                   |
|-------------------|------------------|-------------------------------------------------------------|
| `parkingUpdate`   | server → client  | `{ totalSlots, availableSlots, gateStatus, occupiedSlots, todayStats }` |
| `notification`    | server → client  | `{ type: 'entry' \| 'exit', message, timestamp }`           |

> These are based on how `js/app.js` consumes the API and sockets — double-check against `server.js` for exact field names and validation logic.

---

## 🚀 Running the Full System

1. Flash the firmware to the ESP8266 (with correct Wi-Fi + server IP).
2. Start the backend: `node server.js` (inside `smart_parking_backend/`).
3. Open the dashboard (`index.html`) in a browser on the same network.
4. Trigger the IR sensors — watch the dashboard update live, the gate open/close, and the LCD reflect the new slot count.

---

## 🛠️ Tech Stack

- **Hardware:** ESP8266, IR sensors, servo motor, 16×2 I2C LCD
- **Backend:** Node.js, Express, Socket.io, MongoDB Atlas
- **Frontend:** HTML, Tailwind CSS, Chart.js, Socket.io client

---

## 🤝 Contributing

This is a personal/academic IoT project. Suggestions and PRs are welcome — please open an issue first if you're planning a larger change (e.g. modifying the API contract between firmware and backend).

---

## 📄 License

Add your preferred license here (e.g. MIT) if you intend to make this repo public.
