const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Sample initial data structure
let transportData = {
  routes: [
    {
      id: 1,
      name: "Route A",
      bus: "Bus 1",
      stops: "Shewrapara@08:00, Mirpur-10@08:15, Mirpur-11@08:30, Mirpur-12@08:45"
    },
    {
      id: 2,
      name: "Route B",
      bus: "Bus 2",
      stops: "Kalshi@09:00, ECB Chottor@09:15, Kuril@09:30, Kanchon@09:45"
    }
  ],
  schedules: [
    {
      id: 1,
      bus: "Bus 1",
      routeId: 1,
      routeName: "Route A",
      departure: "08:00",
      arrival: "09:00",
      driver: "Driver A",
      contact: "01712345678",
      totalSeats: 30,
      availableSeats: 25,
      status: "On Route"
    },
    {
      id: 2,
      bus: "Bus 2",
      routeId: 2,
      routeName: "Route B",
      departure: "09:00",
      arrival: "10:00",
      driver: "Driver B",
      contact: "01812345678",
      totalSeats: 30,
      availableSeats: 20,
      status: "On Route"
    }
  ],
  busLocations: [
    {
      busId: 1,
      busNumber: "Bus 1",
      routeId: 1,
      routeName: "Route A",
      location: "Mirpur-10",
      availableSeats: 25,
      status: "On Route"
    },
    {
      busId: 2,
      busNumber: "Bus 2",
      routeId: 2,
      routeName: "Route B",
      location: "ECB Chottor",
      availableSeats: 20,
      status: "On Route"
    }
  ]
};

// Data structure for pickup requests
let pickupRequests = [];
let nextPickupRequestId = 1;

// File path for persistence
const pickupRequestsFile = path.join(__dirname, 'pickupRequests.json');

// Load pickup requests from file on server start
function loadPickupRequests() {
  try {
    if (fs.existsSync(pickupRequestsFile)) {
      const data = fs.readFileSync(pickupRequestsFile, 'utf-8');
      pickupRequests = JSON.parse(data);
      const maxId = pickupRequests.reduce((max, req) => req.id > max ? req.id : max, 0);
      nextPickupRequestId = maxId + 1;
      console.log('Loaded pickup requests from file.');
    }
  } catch (err) {
    console.error('Error loading pickup requests:', err);
  }
}

// Save pickup requests to file
function savePickupRequests() {
  try {
    fs.writeFileSync(pickupRequestsFile, JSON.stringify(pickupRequests, null, 2));
    console.log('Saved pickup requests to file.');
  } catch (err) {
    console.error('Error saving pickup requests:', err);
  }
}

// Call loadPickupRequests on server start
loadPickupRequests();

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('New client connected');

  // Send initial data to new client
  socket.emit('initialData', transportData);

  // Send current pickup requests to new client
  socket.emit('pickupRequestsUpdated', pickupRequests);

  // Handle route updates
  socket.on('updateRoutes', (routes) => {
    transportData.routes = routes;
    io.emit('routesUpdated', routes);
  });

  // Handle schedule updates
  socket.on('updateSchedules', (schedules) => {
    transportData.schedules = schedules;
    io.emit('schedulesUpdated', schedules);
  });

  // Handle bus location updates
  socket.on('updateBusLocation', (update) => {
    const { busId, location, availableSeats, status, busNumber, routeName } = update;

    // Update in schedules
    const scheduleIndex = transportData.schedules.findIndex(s => s.id === busId);
    if (scheduleIndex !== -1) {
      transportData.schedules[scheduleIndex].availableSeats = availableSeats;
      transportData.schedules[scheduleIndex].status = status;
    }

    // Update in busLocations
    const existingIndex = transportData.busLocations.findIndex(b => b.busId === busId);
    if (existingIndex !== -1) {
      transportData.busLocations[existingIndex] = {
        ...transportData.busLocations[existingIndex],
        location,
        availableSeats,
        status,
        busNumber: busNumber || transportData.busLocations[existingIndex].busNumber,
        routeName: routeName || transportData.busLocations[existingIndex].routeName
      };
    } else {
      transportData.busLocations.push({
        busId,
        busNumber,
        routeName,
        location,
        availableSeats,
        status
      });
    }

    // Broadcast to all clients
    io.emit('busLocationUpdated', {
      busId,
      location,
      availableSeats,
      status,
      busNumber,
      routeName
    });
  });

  // Handle bus locations updates (batch)
  socket.on('updateBusLocations', (locations) => {
    transportData.busLocations = locations;
    io.emit('busLocationsUpdated', locations);
  });

  // Handle new pickup request
  socket.on('pickupRequest', (request) => {
    const newRequest = { ...request, id: nextPickupRequestId++ };
    pickupRequests.push(newRequest);
    savePickupRequests();
    io.emit('pickupRequestsUpdated', pickupRequests);
  });

  // Handle delete pickup request
  socket.on('deletePickupRequest', (id) => {
    pickupRequests = pickupRequests.filter(req => req.id !== id);
    savePickupRequests();
    io.emit('pickupRequestsUpdated', pickupRequests);
  });

  // Handle get pickup requests
  socket.on('getPickupRequests', () => {
    socket.emit('pickupRequestsUpdated', pickupRequests);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// API endpoint to get current data (optional)
app.get('/api/transport', (req, res) => {
  res.json(transportData);
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
