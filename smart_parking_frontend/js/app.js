const SERVER_URL = 'http://10.224.232.175:3000';

const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });

const dom = {
  available:    document.getElementById('stat-available'),
  occupied:     document.getElementById('stat-occupied'),
  total:        document.getElementById('stat-total'),
  gate:         document.getElementById('stat-gate'),
  entries:      document.getElementById('stat-entries'),
  exits:        document.getElementById('stat-exits'),
  peakHour:     document.getElementById('peak-hour'),
  peakCount:    document.getElementById('peak-count'),
  slotGrid:     document.getElementById('slot-grid'),
  activityLog:  document.getElementById('activity-log'),
  notifBox:     document.getElementById('notif-container'),
  statusDot:    document.getElementById('status-dot'),
  statusText:   document.getElementById('status-text'),
  chartTitle:   document.getElementById('chart-title'),
  datePrevBtn:  document.getElementById('date-prev'),
  dateNextBtn:  document.getElementById('date-next'),
  dateChips:    document.getElementById('date-chips'),
};

let activityHistory   = [];
let hourlyChart       = null;
let availableDates    = [];
let selectedDate      = getTodayIST(); // YYYY-MM-DD
let chipAnchorDate    = getTodayIST(); // For date chip navigation

// ── Helpers ──────────────────────────────────────────────────────
function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function formatDateLabel(dateStr) {
  const today     = getTodayIST();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  if (dateStr === today) return 'Today';
  if (dateStr === yStr)  return 'Yesterday';

  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatHour(h) {
  if (h === 0)  return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

// ── Socket events ────────────────────────────────────────────────
socket.on('connect',        () => setConnectionStatus(true));
socket.on('disconnect',     () => setConnectionStatus(false));
socket.on('parkingUpdate',  (data) => { updateDashboard(data); if (selectedDate === getTodayIST()) loadHourlyChart(selectedDate); loadDailySummary(selectedDate); });
socket.on('notification',   (data) => { showNotification(data); addActivityEntry(data); });

// ── Connection Status ────────────────────────────────────────────
function setConnectionStatus(connected) {
  if (connected) {
    dom.statusDot.className    = 'w-3 h-3 rounded-full bg-green-500 live-dot';
    dom.statusText.textContent = 'Live';
    dom.statusText.className   = 'text-sm text-green-400 font-medium';
  } else {
    dom.statusDot.className    = 'w-3 h-3 rounded-full bg-red-500 animate-pulse';
    dom.statusText.textContent = 'Disconnected';
    dom.statusText.className   = 'text-sm text-red-400';
  }
}

// ── Dashboard Update ─────────────────────────────────────────────
function updateDashboard(data) {
  const occupiedCount = data.totalSlots - data.availableSlots;
  dom.available.textContent = data.availableSlots;
  dom.occupied.textContent  = occupiedCount;
  dom.total.textContent     = data.totalSlots;
  dom.gate.textContent      = data.gateStatus;
  dom.gate.className        = data.gateStatus === 'Open'
    ? 'text-3xl font-bold gate-open'
    : 'text-3xl font-bold gate-closed';

  if (data.todayStats) {
    dom.entries.textContent = data.todayStats.totalEntries;
    dom.exits.textContent   = data.todayStats.totalExits;
    if (data.todayStats.peakHour !== null && data.todayStats.peakHour !== undefined) {
      dom.peakHour.textContent  = formatHour(data.todayStats.peakHour);
      dom.peakCount.textContent = `${data.todayStats.peakCount} Entries`;
    } else {
      dom.peakHour.textContent  = '—';
      dom.peakCount.textContent = 'No data yet';
    }
  }

  renderSlotGrid(data.totalSlots, data.occupiedSlots || []);
}

// ── Slot Grid ────────────────────────────────────────────────────
function renderSlotGrid(total, occupiedList) {
  let html = '';
  for (let i = 1; i <= total; i++) {
    const occupied   = occupiedList.includes(i);
    const cardClass  = occupied ? 'slot-occupied' : 'slot-available';
    const icon       = occupied ? '🚗' : '✅';
    const label      = occupied ? 'Occupied' : 'Available';
    const labelColor = occupied ? 'text-red-300' : 'text-green-300';
    html += `
      <div class="slot-card ${cardClass} rounded-xl p-4 text-center cursor-default">
        <div class="text-4xl mb-2">${icon}</div>
        <div class="text-base font-bold text-white">Slot ${i}</div>
        <div class="text-xs ${labelColor} mt-0.5">${label}</div>
      </div>`;
  }
  dom.slotGrid.innerHTML = html;
}

// ── Notifications ────────────────────────────────────────────────
function showNotification(data) {
  const el      = document.createElement('div');
  const isEntry = data.type === 'entry';
  el.className  = `notif-enter rounded-xl shadow-2xl p-4 flex items-start gap-3 ${isEntry ? 'bg-blue-700' : 'bg-purple-700'} text-white`;
  el.innerHTML  = `
    <span class="text-2xl mt-0.5">${isEntry ? '🚗 ➡️' : '⬅️ 🚗'}</span>
    <div class="flex-1">
      <p class="font-semibold text-sm">${data.message}</p>
      <p class="text-xs text-gray-200 mt-0.5">${new Date(data.timestamp).toLocaleTimeString()}</p>
    </div>
    <button onclick="this.parentElement.remove()" class="text-gray-200 hover:text-white text-lg leading-none ml-1">×</button>`;
  dom.notifBox.appendChild(el);
  setTimeout(() => {
    el.classList.remove('notif-enter');
    el.classList.add('notif-leave');
    setTimeout(() => el.remove(), 500);
  }, 5000);
}

// ── Activity Log ─────────────────────────────────────────────────
function addActivityEntry(data) {
  activityHistory.unshift(data);
  if (activityHistory.length > 30) activityHistory.pop();
  dom.activityLog.innerHTML = activityHistory.map(item => {
    const isEntry = item.type === 'entry';
    const dot     = isEntry ? '🟢' : '🔴';
    const time    = new Date(item.timestamp).toLocaleTimeString();
    return `
      <div class="flex items-center gap-3 p-3 bg-gray-700 rounded-xl">
        <span class="text-xl">${dot}</span>
        <div class="flex-1 min-w-0">
          <p class="text-sm text-gray-100 truncate">${item.message}</p>
          <p class="text-xs text-gray-400 mt-0.5">${time}</p>
        </div>
      </div>`;
  }).join('') || '<p class="text-gray-500 text-center py-4 text-sm">No activity yet</p>';
}

// ════════════════════════════════════════════════════════════════
//  ✅ DATE NAVIGATION — Android Step-Count Style
//  Shows last 7 days as chips + prev/next arrows for older dates
// ════════════════════════════════════════════════════════════════
function generateDateChips(anchorDate, count = 7) {
  const chips = [];
  const anchor = new Date(anchorDate + 'T00:00:00');
  const minDate = new Date(availableDates[availableDates.length - 1] + 'T00:00:00');

  for (let i = 0; i < count; i++) {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() - i);

    if (d < minDate) break;

    const str = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    chips.push({ label: formatDateLabel(str), value: str });
  }

  return chips;
}

function renderDateChips() {
  const today = getTodayIST();
  const chips = generateDateChips(chipAnchorDate, 7);
  const minDate = availableDates[availableDates.length - 1];

  dom.dateNextBtn.disabled = chipAnchorDate === today;
  dom.datePrevBtn.disabled = chipAnchorDate === minDate;

  dom.dateChips.innerHTML = chips.map(chip => {
    const isActive = chip.value === selectedDate;
    const hasData = availableDates.includes(chip.value);

    return `
      <button onclick="selectDate('${chip.value}')"
        class="px-3 py-1.5 rounded-xl text-xs
        ${isActive ? 'bg-teal-500 text-white' : 'bg-gray-700 text-gray-200'}">
        ${chip.label}
        ${isActive ? '•' : ''}
      </button>`;
  }).join('');
}

function shiftChipWindow(direction) {
  const anchor = new Date(chipAnchorDate + 'T00:00:00');
  anchor.setDate(anchor.getDate() + direction * 7);

  const today = new Date(getTodayIST() + 'T00:00:00');
  const minDate = new Date(availableDates[availableDates.length - 1] + 'T00:00:00');

  if (anchor > today || anchor < minDate) return;

  chipAnchorDate = anchor.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  renderDateChips();
}

async function selectDate(dateStr) {
  selectedDate = dateStr;
  renderDateChips();
  await loadHourlyChart(dateStr);
  await loadDailySummary(dateStr);
}

// ── Hourly Chart ─────────────────────────────────────────────────
async function loadHourlyChart(dateStr) {
  if (!dateStr) dateStr = selectedDate;

  try {
    const res  = await fetch(`${SERVER_URL}/api/hourly?date=${dateStr}`);
    const data = await res.json();

    const labels  = Array.from({ length: 24 }, (_, i) => formatHour(i));
    const entries = new Array(24).fill(0);
    const exits   = new Array(24).fill(0);

    data.forEach(item => {
      if (item._id.type === 'entry') entries[item._id.hour] = item.count;
      else                           exits[item._id.hour]   = item.count;
    });

    const isToday = dateStr === getTodayIST();
    if (dom.chartTitle) {
      dom.chartTitle.textContent = isToday
        ? "📈 Today's Hourly Activity"
        : `📅 Activity — ${formatDateLabel(dateStr)} (${dateStr})`;
    }

    const ctx = document.getElementById('hourly-chart').getContext('2d');
    if (hourlyChart) hourlyChart.destroy();

    hourlyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label:           'Entries',
            data:            entries,
            backgroundColor: 'rgba(59,130,246,0.7)',
            borderColor:     'rgba(59,130,246,1)',
            borderWidth:     1,
            borderRadius:    4,
          },
          {
            label:           'Exits',
            data:            exits,
            backgroundColor: 'rgba(168,85,247,0.7)',
            borderColor:     'rgba(168,85,247,1)',
            borderWidth:     1,
            borderRadius:    4,
          }
        ]
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#9ca3af', font: { size: 12 } } }
        },
        scales: {
          x: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: '#374151' } },
          y: { beginAtZero: true, ticks: { color: '#6b7280', stepSize: 1 }, grid: { color: '#374151' } }
        }
      }
    });
  } catch (err) {
    console.error('Chart load failed:', err);
  }
}

// ── Daily Summary ────────────────────────────────────────────────
async function loadDailySummary(dateStr) {
  try {
    const res  = await fetch(`${SERVER_URL}/api/daily-summary?date=${dateStr}`);
    const data = await res.json();

    dom.entries.textContent = data.totalEntries;
    dom.exits.textContent   = data.totalExits;

    if (data.peakHour !== null && data.peakHour !== undefined) {
      dom.peakHour.textContent  = formatHour(data.peakHour);
      dom.peakCount.textContent = `${data.peakCount} Entries`;
    } else {
      dom.peakHour.textContent  = '— ';
      dom.peakCount.textContent = 'No data';
    }

  } catch (err) {
    console.error('Daily summary load failed:', err);
  }
}

// ── Init ─────────────────────────────────────────────────────────
async function init() {
  try {
    const [statusRes, datesRes] = await Promise.all([
      fetch(`${SERVER_URL}/api/status`),
      fetch(`${SERVER_URL}/api/available-dates`)
    ]);

    const statusData = await statusRes.json();
    availableDates   = await datesRes.json();

    // ✅ FIX: initialize AFTER data load
    const earliestDate = availableDates[availableDates.length - 1];
    const latestDate = availableDates[0];

    updateDashboard(statusData);
    renderDateChips();
    await loadHourlyChart(selectedDate);
    await loadDailySummary(selectedDate);

    // Refresh chart every 5 minutes if viewing today
    setInterval(() => {
      if (selectedDate === getTodayIST()) {
        loadHourlyChart(selectedDate);
        loadDailySummary(selectedDate);
      }
    }, 5 * 60 * 1000);

  } catch (err) {
    console.error('Init failed:', err);
    dom.activityLog.innerHTML = `
      <p class="text-red-400 text-center py-4 text-sm">
        ❌ Cannot reach server at <strong>${SERVER_URL}</strong><br>
        Make sure <code>node server.js</code> is running.
      </p>`;
  }
}

init();