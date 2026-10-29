function safeUnwrapObject(val, fallback = {}) {
    let cur = val;
    while (typeof cur === 'string') {
        try {
            const p = JSON.parse(cur);
            if (p === cur) break;
            cur = p;
        } catch(e) { break; }
    }
    return (cur && typeof cur === 'object' && !Array.isArray(cur)) ? cur : fallback;
}

function safeUnwrapArray(val, fallback = []) {
    let cur = val;
    while (typeof cur === 'string') {
        try {
            const p = JSON.parse(cur);
            if (p === cur) break;
            cur = p;
        } catch(e) { break; }
    }
    return Array.isArray(cur) ? cur : fallback;
}

/**
 * Logistics Operations Control System (LCOS) - State Management & API Sync
 * Connects UI state directly to the Express + PostgreSQL Backend APIs.
 */

const LCOS_State = {
    data: {
       branches: [
    { id: 'BR-ARI', name: 'Ariyalur', lat: 11.1401, lng: 79.0786 },
    { id: 'BR-CGL', name: 'Chengalpattu', lat: 12.6841, lng: 79.9836 },
    { id: 'BR-CHE', name: 'Chennai', lat: 13.0827, lng: 80.2707 },
    { id: 'BR-CBE', name: 'Coimbatore', lat: 11.0168, lng: 76.9558 },
    { id: 'BR-CUD', name: 'Cuddalore', lat: 11.7480, lng: 79.7714 },
    { id: 'BR-DHA', name: 'Dharmapuri', lat: 12.1277, lng: 78.1579 },
    { id: 'BR-DGL', name: 'Dindigul', lat: 10.3673, lng: 77.9803 },
    { id: 'BR-ERD', name: 'Erode', lat: 11.3410, lng: 77.7172 },
    { id: 'BR-KAL', name: 'Kallakurichi', lat: 11.7384, lng: 78.9639 },
    { id: 'BR-KNC', name: 'Kanchipuram', lat: 12.8342, lng: 79.7036 },
    { id: 'BR-KKI', name: 'Kanyakumari', lat: 8.1833, lng: 77.4119 },
    { id: 'BR-KAR', name: 'Karur', lat: 10.9601, lng: 78.0766 },
    { id: 'BR-KRI', name: 'Krishnagiri', lat: 12.5266, lng: 78.2146 },
    { id: 'BR-MDU', name: 'Madurai', lat: 9.9252, lng: 78.1198 },
    { id: 'BR-MAY', name: 'Mayiladuthurai', lat: 11.1018, lng: 79.6522 },
    { id: 'BR-NGP', name: 'Nagapattinam', lat: 10.7672, lng: 79.8449 },
    { id: 'BR-NAM', name: 'Namakkal', lat: 11.2189, lng: 78.1674 },
    { id: 'BR-NIL', name: 'Nilgiris (Ooty)', lat: 11.4102, lng: 76.6950 },
    { id: 'BR-PER', name: 'Perambalur', lat: 11.2342, lng: 78.8820 },
    { id: 'BR-PUD', name: 'Pudukkottai', lat: 10.3833, lng: 78.8000 },
    { id: 'BR-RAM', name: 'Ramanathapuram', lat: 9.3639, lng: 78.8394 },
    { id: 'BR-RAN', name: 'Ranipet', lat: 12.9296, lng: 79.3331 },
    { id: 'BR-SAL', name: 'Salem', lat: 11.6643, lng: 78.1460 },
    { id: 'BR-SIV', name: 'Sivaganga', lat: 9.8433, lng: 78.4800 },
    { id: 'BR-TKS', name: 'Tenkasi', lat: 8.9597, lng: 77.3150 },
    { id: 'BR-THA', name: 'Thanjavur', lat: 10.7870, lng: 79.1378 },
    { id: 'BR-THE', name: 'Theni', lat: 10.0104, lng: 77.4768 },
    { id: 'BR-TUT', name: 'Thoothukudi', lat: 8.7642, lng: 78.1348 },
    { id: 'BR-TRY', name: 'Tiruchirappalli', lat: 10.7905, lng: 78.7047 },
    { id: 'BR-TEN', name: 'Tirunelveli', lat: 8.7139, lng: 77.7567 },
    { id: 'BR-TPR', name: 'Tirupathur', lat: 12.4950, lng: 78.5678 },
    { id: 'BR-TUP', name: 'Tiruppur', lat: 11.1085, lng: 77.3411 },
    { id: 'BR-TVL', name: 'Tiruvallur', lat: 13.1432, lng: 79.9079 },
    { id: 'BR-TVM', name: 'Tiruvannamalai', lat: 12.2253, lng: 79.0747 },
    { id: 'BR-TVR', name: 'Tiruvarur', lat: 10.7708, lng: 79.6366 },
    { id: 'BR-VEL', name: 'Vellore', lat: 12.9165, lng: 79.1325 },
    { id: 'BR-VLP', name: 'Viluppuram', lat: 11.9401, lng: 79.4861 },
    { id: 'BR-VIR', name: 'Virudhunagar', lat: 9.5872, lng: 77.9514 }
],
        commodities: [
            { id: 'COM-RIC', name: 'Rice', unit: 'Bags', weight: 50, value: 2000 },
            { id: 'COM-SUG', name: 'Sugar', unit: 'Bags', weight: 50, value: 2500 },
            { id: 'COM-WHE', name: 'Wheat', unit: 'Bags', weight: 50, value: 1800 },
            { id: 'COM-PUL', name: 'Pulses', unit: 'Bags', weight: 50, value: 3200 },
            { id: 'COM-CEM', name: 'Cement', unit: 'Bags', weight: 50, value: 450 },
            { id: 'COM-STE', name: 'Steel', unit: 'Tons', weight: 1000, value: 65000 },
            { id: 'COM-OIL', name: 'Cooking Oil', unit: 'Tins', weight: 15, value: 2200 },
            { id: 'COM-TEA', name: 'Nilgiri Tea', unit: 'Boxes', weight: 25, value: 4500 },
            { id: 'COM-COT', name: 'Raw Cotton', unit: 'Bales', weight: 170, value: 12500 },
            { id: 'COM-TEX', name: 'Textiles & Fabrics', unit: 'Rolls', weight: 40, value: 8500 },
            { id: 'COM-FER', name: 'Fertilizers', unit: 'Bags', weight: 50, value: 1200 },
            { id: 'COM-SPR', name: 'Auto Spare Parts', unit: 'Crates', weight: 100, value: 35000 }
        ],
        vehicles: [],
        drivers: [],
        helpers: [],
        trips: [],
        callLogs: [],
        stock: {},
        alerts: [],
        requests: [],
        systemSettings: {
            simulationTime: new Date().toISOString(),
            simulationSpeed: 60,
            isSimulating: true,
            alertTimeThreshold: 2,
            currentRole: 'tracking_team'
        }
    },

    async init() {
        const savedRole = localStorage.getItem('LCOS_ACTIVE_ROLE');
        if (savedRole) {
            this.data.systemSettings.currentRole = savedRole;
        }

        // Restore persisted state backup (requests, stock buffers, etc.)
        try {
            const backup = localStorage.getItem('LCOS_STATE_BACKUP');
            if (backup) {
                const parsed = JSON.parse(backup);
                if (parsed.requests && Array.isArray(parsed.requests) && parsed.requests.length > 0) {
                    this.data.requests = parsed.requests;
                }
                if (parsed.stock && typeof parsed.stock === 'object') {
                    this.data.stock = { ...(parsed.stock || {}), ...(this.data.stock || {}) };
                }
            }
        } catch (_) {}

        // Initialize baseline stock for all default branches & commodities
        if (!this.data.stock || typeof this.data.stock !== 'object' || Array.isArray(this.data.stock) || Object.keys(this.data.stock).length === 0) {
            this.data.stock = this.data.stock || {};
            for (const b of this.data.branches) {
                if (!this.data.stock[b.id]) this.data.stock[b.id] = {};
                for (const c of this.data.commodities) {
                    if (!this.data.stock[b.id][c.id]) {
                        this.data.stock[b.id][c.id] = { available: 1000, inTransit: 0, delivered: 0, pending: 0 };
                    }
                }
            }
        }
        await this.loadFromBackend();
    },

    async loadFromBackend() {
        try {
            if (!window.LCOS_API) return;

            const [branchesRes, commoditiesRes, vehiclesRes, driversRes, helpersRes, tripsRes, stockRes, alertsRes, callLogsRes, requestsRes] = await Promise.allSettled([
                LCOS_API.getBranches(),
                LCOS_API.getCommodities(),
                LCOS_API.getVehicles(),
                LCOS_API.getDrivers(),
                LCOS_API.getHelpers(),
                LCOS_API.getTrips(),
                LCOS_API.getStock(),
                LCOS_API.getAlerts('ALL'),
                LCOS_API.getCallLogs(),
                LCOS_API.getRequests()
            ]);

            if (branchesRes.status === 'fulfilled' && branchesRes.value && branchesRes.value.branches && branchesRes.value.branches.length > 0) {
                const districtGPS = {
                    'BR-ARI': { lat: 11.1401, lng: 79.0786 },
                    'BR-CGL': { lat: 12.6841, lng: 79.9836 },
                    'BR-CHE': { lat: 13.0827, lng: 80.2707 },
                    'BR-CBE': { lat: 11.0168, lng: 76.9558 },
                    'BR-CUD': { lat: 11.7480, lng: 79.7714 },
                    'BR-DHA': { lat: 12.1277, lng: 78.1579 },
                    'BR-DIN': { lat: 10.3673, lng: 77.9803 },
                    'BR-DGL': { lat: 10.3673, lng: 77.9803 },
                    'BR-ERD': { lat: 11.3410, lng: 77.7172 },
                    'BR-KAL': { lat: 11.7384, lng: 78.9639 },
                    'BR-KAN': { lat: 12.8342, lng: 79.7036 },
                    'BR-KNC': { lat: 12.8342, lng: 79.7036 },
                    'BR-KKI': { lat: 8.1833, lng: 77.4119 },
                    'BR-KAR': { lat: 10.9601, lng: 78.0766 },
                    'BR-KRI': { lat: 12.5266, lng: 78.2146 },
                    'BR-MDU': { lat: 9.9252, lng: 78.1198 },
                    'BR-MAY': { lat: 11.1018, lng: 79.6522 },
                    'BR-NAG': { lat: 10.7672, lng: 79.8449 },
                    'BR-NGP': { lat: 10.7672, lng: 79.8449 },
                    'BR-NAM': { lat: 11.2189, lng: 78.1674 },
                    'BR-NIL': { lat: 11.4102, lng: 76.6950 },
                    'BR-PER': { lat: 11.2342, lng: 78.8820 },
                    'BR-PUD': { lat: 10.3833, lng: 78.8000 },
                    'BR-RAM': { lat: 9.3639, lng: 78.8394 },
                    'BR-RAN': { lat: 12.9296, lng: 79.3331 },
                    'BR-SAL': { lat: 11.6643, lng: 78.1460 },
                    'BR-SIV': { lat: 9.8433, lng: 78.4800 },
                    'BR-TKS': { lat: 8.9597, lng: 77.3150 },
                    'BR-THA': { lat: 10.7870, lng: 79.1378 },
                    'BR-THE': { lat: 10.0104, lng: 77.4768 },
                    'BR-TUT': { lat: 8.7642, lng: 78.1348 },
                    'BR-TRY': { lat: 10.7905, lng: 78.7047 },
                    'BR-TEN': { lat: 8.7139, lng: 77.7567 },
                    'BR-TNL': { lat: 8.7139, lng: 77.7567 },
                    'BR-TPR': { lat: 12.4950, lng: 78.5678 },
                    'BR-TUP': { lat: 11.1085, lng: 77.3411 },
                    'BR-TVL': { lat: 13.1432, lng: 79.9079 },
                    'BR-TVM': { lat: 12.2253, lng: 79.0747 },
                    'BR-TVR': { lat: 10.7708, lng: 79.6366 },
                    'BR-VEL': { lat: 12.9165, lng: 79.1325 },
                    'BR-VLP': { lat: 11.9401, lng: 79.4861 },
                    'BR-VIR': { lat: 9.5872, lng: 77.9514 }
                };
                const backendBranches = branchesRes.value.branches.map(b => {
                    const gps = districtGPS[b.id] || { lat: Number(b.lat || 11.1271), lng: Number(b.lng || 78.6569) };
                    return {
                        id: b.id,
                        name: b.name,
                        manager: b.manager_name || b.manager || 'Branch Manager',
                        phone: b.phone || '+91 94412 00000',
                        lat: gps.lat,
                        lng: gps.lng,
                        x: b.x_coord || 50,
                        y: b.y_coord || 50
                    };
                });
                const existingIds = new Set(backendBranches.map(b => b.id));
                const missingDefaults = (this.data.branches || []).filter(b => !existingIds.has(b.id));
                this.data.branches = [...backendBranches, ...missingDefaults].sort((a, b) => a.name.localeCompare(b.name));
            }

            if (commoditiesRes.status === 'fulfilled' && commoditiesRes.value && commoditiesRes.value.commodities && commoditiesRes.value.commodities.length > 0) {
                this.data.commodities = commoditiesRes.value.commodities.map(c => ({
                    id: c.id, name: c.name, unit: c.unit, weight: Number(c.weight_kg), value: Number(c.unit_value)
                }));
            }

            if (vehiclesRes.status === 'fulfilled' && vehiclesRes.value && Array.isArray(vehiclesRes.value.vehicles)) {
                this.data.vehicles = vehiclesRes.value.vehicles.map(v => ({
                    id: v.id, type: v.type, capacity: Number(v.capacity_tons), owner: v.ownership, status: v.status,
                    currentLat: (v.current_lat !== null && v.current_lat !== undefined) ? Number(v.current_lat) : null, currentLng: (v.current_lng !== null && v.current_lng !== undefined) ? Number(v.current_lng) : null, speedKmh: v.speed_kmh !== undefined ? Number(v.speed_kmh) : 0, heading: v.heading !== undefined ? Number(v.heading) : 0, movementStatus: v.movement_status || 'STOPPED', lastGpsUpdate: v.last_gps_update || null, lastPingAt: v.last_ping_at || null
                }));
            }

            if (driversRes.status === 'fulfilled' && driversRes.value && Array.isArray(driversRes.value.drivers)) {
                this.data.drivers = driversRes.value.drivers.map(d => ({
                    id: d.id, name: d.name, license: d.license_number, phone: d.phone, experience: d.experience_years,
                    performance: d.performance_score, warnings: d.warnings_count, status: d.status
                }));
            }

            if (helpersRes.status === 'fulfilled' && helpersRes.value && Array.isArray(helpersRes.value.helpers)) {
                this.data.helpers = helpersRes.value.helpers.map(h => ({
                    id: h.id, name: h.name, phone: h.phone, role: h.role_type, status: h.status
                }));
            }

            if (tripsRes.status === 'fulfilled' && tripsRes.value && tripsRes.value.trips) {
                this.data.trips = tripsRes.value.trips.map(t => ({
                    id: t.id,
                    dispatchId: t.dispatch_id,
                    commodityId: t.commodity_id,
                    quantity: Number(t.quantity),
                    sourceBranchId: t.source_branch_id,
                    destinationBranchId: t.destination_branch_id,
                    vehicleId: t.vehicle_id,
                    driverId: t.driver_id,
                    helperId: t.helper_id,
                    created_by_emp_id: t.created_by_emp_id,
                    dispatchDate: t.dispatch_date,
                    expectedDeliveryDate: t.expected_delivery_date,
                    status: t.status,
                    checklists: safeUnwrapObject(t.checklists, { dispatch: { loaded: false, verified: false, vehicleReady: false, driverAvailable: false }, delivery: { quantityMatches: false, damagesChecked: false, missingChecked: false, conditionOk: false } }),
                    transitUpdates: safeUnwrapArray(t.transit_updates, []),
                    deliveryInfo: safeUnwrapObject(t.delivery_info, null),
                    lastUpdateTimestamp: t.last_update_timestamp,
                    callLogs: [],
                    isLiveSynced: Boolean(t.is_live_synced || (t.current_lat && t.current_lng)),
                    currentGPS: (t.current_lat && t.current_lng) ? { lat: Number(t.current_lat), lng: Number(t.current_lng) } : null,
                    speedKmh: t.speed_kmh !== undefined ? Number(t.speed_kmh) : 0,
                    heading: t.heading !== undefined ? Number(t.heading) : 0,
                    movementStatus: t.movement_status || 'STOPPED',
                    last_gps_update: t.last_gps_update || null,
                    realOriginGPS: t.real_origin_gps || null,
                    realDestinationGPS: t.real_destination_gps || null,
                    currentGPS: t.current_gps || null,
                    telemetrySource: t.telemetry_source || 'SIMULATED_DUMMY'
                }));
            }

            if (stockRes.status === 'fulfilled' && stockRes.value && stockRes.value.stock) {
                const backendStock = stockRes.value.stock;
                if (!this.data.stock || typeof this.data.stock !== 'object' || Array.isArray(this.data.stock)) {
                    this.data.stock = {};
                }
                for (const bId of Object.keys(backendStock)) {
                    if (!this.data.stock[bId]) this.data.stock[bId] = {};
                    for (const cId of Object.keys(backendStock[bId])) {
                        this.data.stock[bId][cId] = backendStock[bId][cId];
                    }
                }
            }

            if (alertsRes.status === 'fulfilled' && alertsRes.value && alertsRes.value.alerts) {
                this.data.alerts = alertsRes.value.alerts.map(a => ({
                    id: a.id,
                    tripId: a.trip_id,
                    vehicleId: a.vehicle_id,
                    driverId: a.driver_id,
                    type: a.type,
                    message: a.message,
                    severity: a.severity,
                    status: a.status,
                    escalated: a.escalated,
                    escalatedToRole: a.escalated_to_role,
                    escalatedAt: a.escalated_at,
                    stoppageDurationMinutes: a.stoppage_duration_minutes,
                    timestamp: a.created_at,
                    resolvedAt: a.resolved_at
                }));
            }

            if (callLogsRes.status === 'fulfilled' && callLogsRes.value && callLogsRes.value.callLogs) {
                this.data.callLogs = callLogsRes.value.callLogs.map(c => ({
                    id: c.id,
                    tripId: c.trip_id,
                    timestamp: c.created_at,
                    type: c.call_category,
                    caller: c.caller,
                    recipient: c.recipient,
                    locationCheckin: c.location_checkin,
                    notes: c.conversation_notes
                }));
            }

            if (requestsRes.status === 'fulfilled' && requestsRes.value && Array.isArray(requestsRes.value.requests)) {
                const backendReqs = requestsRes.value.requests.map(r => ({
                    id: r.id,
                    type: r.type,
                    data: typeof r.request_data === 'string' ? JSON.parse(r.request_data) : r.request_data,
                    status: r.status,
                    timestamp: r.created_at
                }));
                // Merge backend requests with any existing local requests so offline/local items are preserved
                const backendIds = new Set(backendReqs.map(r => String(r.id || '').toUpperCase()));
                const localOnly = (this.data.requests || []).filter(r => !backendIds.has(String(r.id || '').toUpperCase()));
                this.data.requests = [...backendReqs, ...localOnly];
            }

            console.log('[LCOS_State] PostgreSQL data loaded into state successfully.');
        } catch (err) {
            console.error('[LCOS_State] Error loading backend data:', err);
        }
    },

    getBranches() { return this.data.branches; },
    getBranchCoordinates(id) {
        if (!id) return null;
        const aliasMap = {
            'BR-DIN': 'BR-DGL',
            'BR-KAN': 'BR-KNC',
            'BR-NAG': 'BR-NGP',
            'BR-TNL': 'BR-TEN'
        };
        const targetId = aliasMap[id] || id;
        const b = (this.data.branches || []).find(br => br.id === targetId || br.id === id || br.name?.toLowerCase() === id.toLowerCase());
        if (b && b.lat && b.lng) return { lat: Number(b.lat), lng: Number(b.lng) };
        return null;
    },
    getCommodities() { return this.data.commodities; },
    getVehicles() { return this.data.vehicles; },
    getDrivers() { return this.data.drivers; },
    getHelpers() { return this.data.helpers; },
    getTrips() { return this.data.trips; },
    getCallLogs() { return this.data.callLogs; },
    getAlerts() { return this.data.alerts; },
    getSystemSettings() { return this.data.systemSettings; },
    getStock() {
        if (!this.data.stock || typeof this.data.stock !== 'object' || Array.isArray(this.data.stock)) {
            this.data.stock = {};
        }
        return this.data.stock;
    },
    getRequests() { return this.data.requests || []; },

    save() {
        try {
            localStorage.setItem('LCOS_STATE_BACKUP', JSON.stringify(this.data));
        } catch (_) {}
    },

    getTripById(id) {
        return this.data.trips.find(t => t.id === id);
    },

    updateTripLiveGPS(tripId, gpsData) {
        const trip = this.getTripById(tripId);
        if (!trip) return false;
        trip.isLiveSynced = true;
        trip.telemetrySource = gpsData.source || 'LIVE_GPS_IoT';
        if (gpsData.realOriginGPS) trip.realOriginGPS = gpsData.realOriginGPS;
        if (gpsData.realDestinationGPS) trip.realDestinationGPS = gpsData.realDestinationGPS;
        if (gpsData.currentGPS) trip.currentGPS = gpsData.currentGPS;
        return true;
    },

    getCurrentRole() {
        return this.data.systemSettings.currentRole || 'tracking_team';
    },

    setCurrentRole(role) {
        this.data.systemSettings.currentRole = role;
        localStorage.setItem('LCOS_ACTIVE_ROLE', role);
    },

    async addTrip(trip) {
        // Optimistically deduct source branch available stock & update in-transit
        if (trip.sourceBranchId && trip.commodityId && trip.quantity) {
            if (this.data.stock?.[trip.sourceBranchId]?.[trip.commodityId]) {
                const cur = Number(this.data.stock[trip.sourceBranchId][trip.commodityId].available || 0);
                this.data.stock[trip.sourceBranchId][trip.commodityId].available = Math.max(0, cur - Number(trip.quantity));
            }
            if (trip.destinationBranchId) {
                if (!this.data.stock[trip.destinationBranchId]) this.data.stock[trip.destinationBranchId] = {};
                if (!this.data.stock[trip.destinationBranchId][trip.commodityId]) {
                    this.data.stock[trip.destinationBranchId][trip.commodityId] = { available: 1000, inTransit: 0, delivered: 0, pending: 0 };
                }
                const curInTransit = Number(this.data.stock[trip.destinationBranchId][trip.commodityId].inTransit || 0);
                this.data.stock[trip.destinationBranchId][trip.commodityId].inTransit = curInTransit + Number(trip.quantity);
            }
            this.save();
        }
        try {
            const apiRes = await LCOS_API.addTrip({
                sourceBranchId: trip.sourceBranchId,
                destinationBranchId: trip.destinationBranchId,
                commodityId: trip.commodityId,
                quantity: trip.quantity,
                vehicleId: trip.vehicleId,
                driverId: trip.driverId,
                helperId: trip.helperId,
                empId: trip.empId || trip.createdBy || 'EMP-101',
                expectedHours: trip.expectedHours || 8
            });

            if (apiRes && apiRes.success) {
                await this.loadFromBackend();
                if (window.app && typeof window.app.renderAll === 'function') {
                    window.app.renderAll();
                }
                return apiRes.trip;
            }
            return apiRes?.trip || null;
        } catch (err) {
            console.error('API addTrip error:', err);
            throw err;
        }
    },

    async updateTripStatus(tripId, newStatus, checklists = null, transitUpdate = null) {
        const localTrip = this.getTripById(tripId);
        if (localTrip) {
            localTrip.status = newStatus;
            if (checklists) localTrip.checklists = checklists;
            if (transitUpdate) {
                if (!Array.isArray(localTrip.transitUpdates)) localTrip.transitUpdates = [];
                localTrip.transitUpdates.push(transitUpdate);
            }
            this.save();
        }
        try {
            const apiRes = await LCOS_API.updateTripStatus(tripId, newStatus, checklists, transitUpdate);
            if (apiRes && apiRes.success) {
                await this.loadFromBackend();
                if (window.app && typeof window.app.renderAll === 'function') {
                    window.app.renderAll();
                }
            }
            return apiRes;
        } catch (err) {
            console.error('API updateTripStatus error:', err);
        }
    },

    async closeTripDelivery(tripId, deliveryInfo) {
        const localTrip = this.getTripById(tripId);
        if (localTrip) {
            localTrip.status = 'CLOSED';
            localTrip.deliveryInfo = deliveryInfo;
            this.save();
        }
        try {
            const apiRes = await LCOS_API.closeTripDelivery(tripId, deliveryInfo);
            if (apiRes && apiRes.success) {
                await this.loadFromBackend();
                if (window.app && typeof window.app.renderAll === 'function') {
                    window.app.renderAll();
                }
            }
            return apiRes;
        } catch (err) {
            console.error('API closeTripDelivery error:', err);
        }
    },

    async assignBackload(tripId, vehicleId, driverId, helperId) {
        try {
            const apiRes = await LCOS_API.assignBackload(tripId, vehicleId, driverId, helperId);
            if (apiRes && apiRes.success) {
                await this.loadFromBackend();
            }
            return apiRes;
        } catch (err) {
            console.error('API assignBackload error:', err);
            return { success: false, message: err.message || 'Error pairing backload.' };
        }
    },

    async recordReturnArrival(tripId) {
        try {
            const apiRes = await LCOS_API.recordReturnArrival(tripId);
            if (apiRes && apiRes.success) {
                await this.loadFromBackend();
            }
            return apiRes;
        } catch (err) {
            console.error('API recordReturnArrival error:', err);
            return { success: false, message: err.message || 'Error recording return arrival.' };
        }
    },


    async addCallLog(log) {
        const localLog = {
            id: 'CL-' + Math.floor(100 + Math.random() * 900),
            tripId: log.tripId || null,
            timestamp: new Date().toISOString(),
            type: log.type || log.category || 'Transit Update',
            caller: log.caller || 'Admin Office',
            recipient: log.recipient || 'Driver',
            locationCheckin: log.location || log.locationCheckin || '',
            operatorEmpId: log.empId || log.operatorEmpId || 'EMP-101',
            notes: log.notes
        };
        try {
            if (window.LCOS_API && typeof LCOS_API.addCallLog === 'function') {
                const apiRes = await LCOS_API.addCallLog({
                    tripId: log.tripId || null,
                    category: log.type || log.category || 'Transit Update',
                    caller: log.caller || 'Admin Office',
                    recipient: log.recipient || 'Driver',
                    locationCheckin: log.location || log.locationCheckin || '',
                    empId: log.empId || log.operatorEmpId || 'EMP-101',
                    notes: log.notes
                });
                if (apiRes && apiRes.success) {
                    await this.loadFromBackend();
                    return apiRes.callLog ? apiRes.callLog.id : localLog.id;
                }
            }
        } catch (err) {
            console.error('API addCallLog error:', err);
        }
        if (!this.data.callLogs) this.data.callLogs = [];
        this.data.callLogs.unshift(localLog);
        return localLog.id;
    },


    async addAlert(alert) {
        try {
            const apiRes = await LCOS_API.addAlert(alert);
            if (apiRes.success) {
                await this.loadFromBackend();
                return apiRes.alert;
            }
        } catch (err) {
            console.error('API addAlert error:', err);
        }
    },

    async resolveAlert(alertId) {
        try {
            const apiRes = await LCOS_API.resolveAlert(alertId);
            if (apiRes.success) {
                await this.loadFromBackend();
            }
        } catch (err) {
            console.error('API resolveAlert error:', err);
        }
    },

    async dismissAlert(alertId, reason = '', notes = '', isUnverified = false) {
        try {
            const apiRes = await LCOS_API.dismissAlert(alertId, reason, notes, isUnverified);
            await this.loadFromBackend();
            return apiRes;
        } catch (err) {
            console.error('API dismissAlert error:', err);
        }
    },

    async reopenAlert(alertId, notes = '') {
        try {
            const apiRes = await LCOS_API.reopenAlert(alertId, notes);
            await this.loadFromBackend();
            return apiRes;
        } catch (err) {
            console.error('API reopenAlert error:', err);
        }
    },

    async supervisorApproveAlert(alertId, notes = '') {
        try {
            const apiRes = await LCOS_API.supervisorApproveAlert(alertId, notes);
            await this.loadFromBackend();
            return apiRes;
        } catch (err) {
            console.error('API supervisorApproveAlert error:', err);
        }
    },

    async addDriver(driver) {
        try {
            const apiRes = await LCOS_API.addDriver(driver);
            if (apiRes && apiRes.success) {
                await this.loadFromBackend();
                return { ...apiRes.driver, credentials: apiRes.credentials };
            }
        } catch (err) {
            console.warn('API addDriver notice:', err.message);
        }
        // Local fallback so driver is always registered and available in UI
        const localDriver = {
            id: 'DRV-' + (this.data.drivers.length + 101),
            name: driver.name,
            license: driver.license,
            phone: driver.phone,
            experience: driver.experience || 1,
            performance: 100,
            warnings: 0,
            status: 'Available'
        };
        this.data.drivers.push(localDriver);
        return localDriver;
    },

    async addVehicle(vehicle) {
        try {
            const apiRes = await LCOS_API.addVehicle(vehicle);
            if (apiRes.success) {
                await this.loadFromBackend();
            }
        } catch (err) {
            console.error('API addVehicle error:', err);
        }
    },

    async addBranch(branch) {
        try {
            const apiRes = await LCOS_API.addBranch(branch);
            if (apiRes.success) {
                await this.loadFromBackend();
            }
        } catch (err) {
            console.error('API addBranch error:', err);
        }
    },

    async addCommodity(commodity) {
        try {
            const apiRes = await LCOS_API.addCommodity(commodity);
            if (apiRes.success) {
                await this.loadFromBackend();
            }
        } catch (err) {
            console.error('API addCommodity error:', err);
        }
    },

    async escalateAlertToManager(alertId) {
        try {
            const apiRes = await LCOS_API.escalateAlertToManager(alertId);
            if (apiRes.success) {
                await this.loadFromBackend();
            }
        } catch (err) {
            console.error('API escalateAlert error:', err);
        }
    },

    async addManagerRequest(type, requestData) {
        try {
            const apiRes = await LCOS_API.addManagerRequest(type, requestData);
            if (apiRes && apiRes.success) {
                await this.loadFromBackend();
                return apiRes.request;
            }
        } catch (err) {
            console.error('API addManagerRequest error:', err);
        }
        // Local fallback so request is always recorded and visible immediately
        const maxNum = (this.data.requests || []).reduce((max, r) => {
            const n = parseInt(String(r.id || '').replace('REQ-', ''), 10);
            return (!isNaN(n) && n > max) ? n : max;
        }, 100);
        const localReq = {
            id: 'REQ-' + (maxNum + 1),
            type,
            data: requestData,
            status: 'Pending',
            timestamp: new Date().toISOString()
        };
        (this.data.requests = this.data.requests || []).unshift(localReq);
        return localReq;
    },

    async approveManagerRequest(reqId) {
        const normalizedId = String(reqId || '').trim();
        // 1. Locate request in local state
        const localReq = (this.data.requests || []).find(r => 
            String(r.id || '').trim().toUpperCase() === normalizedId.toUpperCase()
        );

        let apiSuccess = false;
        try {
            const fallbackData = localReq ? { type: localReq.type, requestData: localReq.data } : null;
            const apiRes = await LCOS_API.approveManagerRequest(normalizedId, fallbackData);
            if (apiRes && apiRes.success) {
                apiSuccess = true;
                await this.loadFromBackend();
            }
        } catch (err) {
            console.warn('API approveManagerRequest fallback to local update:', err.message);
        }

        // 2. Locate target request in state (re-query in case loadFromBackend ran)
        const targetReq = (this.data.requests || []).find(r => 
            String(r.id || '').trim().toUpperCase() === normalizedId.toUpperCase()
        ) || localReq;

        if (targetReq) {
            targetReq.status = 'Approved';
            targetReq.approvedAt = new Date().toISOString();

            let data = targetReq.data;
            while (typeof data === 'string') {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed === data) break;
                    data = parsed;
                } catch (_) { break; }
            }
            data = data || {};

            if (targetReq.type === 'Add Driver') {
                const driverName = data.name;
                const driverLicense = data.license || data.license_number || '';
                const driverPhone = data.phone || '';
                const driverExp = Number(data.experience || data.experience_years || 1);

                const alreadyExists = (this.data.drivers || []).some(d => 
                    (driverLicense && d.license === driverLicense) || 
                    (driverPhone && d.phone === driverPhone) ||
                    (driverName && d.name && d.name.toLowerCase() === driverName.toLowerCase())
                );

                if (!alreadyExists && driverName) {
                    const maxNum = (this.data.drivers || []).reduce((max, d) => {
                        const n = parseInt(String(d.id || '').replace('DRV-', ''), 10);
                        return (!isNaN(n) && n > max) ? n : max;
                    }, 100);
                    const newId = 'DRV-' + (maxNum + 1);

                    this.data.drivers.push({
                        id: newId,
                        name: driverName,
                        license: driverLicense,
                        phone: driverPhone,
                        experience: driverExp,
                        performance: 100,
                        warnings: 0,
                        status: 'Available'
                    });
                }
            } else if (targetReq.type === 'Add Vehicle') {
                const vehId = (data.id || data.vehicleId || '').toUpperCase().trim();
                const alreadyExists = (this.data.vehicles || []).some(v => v.id === vehId);
                if (!alreadyExists && vehId) {
                    this.data.vehicles.push({
                        id: vehId,
                        type: data.type || 'Lorry',
                        capacity: Number(data.capacity || 10),
                        owner: data.owner || 'Self Owned',
                        status: 'Available',
                        currentLat: null,
                        currentLng: null,
                        speedKmh: 0,
                        heading: 0,
                        movementStatus: 'STOPPED'
                    });
                }
            } else if (targetReq.type === 'Add Stock') {
                const branchId = data.branchId;
                const comId = data.commodityId;
                const qty = Number(data.quantity || data.qty || 0);
                if (branchId && comId) {
                    if (!this.data.stock || typeof this.data.stock !== 'object' || Array.isArray(this.data.stock)) {
                        this.data.stock = {};
                    }
                    if (!this.data.stock[branchId]) this.data.stock[branchId] = {};
                    if (!this.data.stock[branchId][comId]) {
                        this.data.stock[branchId][comId] = { available: 1000, inTransit: 0, delivered: 0, pending: 0 };
                    }
                    this.data.stock[branchId][comId].available = Number(this.data.stock[branchId][comId].available || 0) + qty;

                    // Sync stock directly to backend if not already synced via approve
                    if (!apiSuccess && window.LCOS_API && typeof LCOS_API.addStockDirectly === 'function') {
                        LCOS_API.addStockDirectly(branchId, comId, qty).catch(() => {});
                    }
                }
            }
            this.save();
            return true;
        }

        return apiSuccess;
    },

    async addStockDirectly(branchId, commodityId, qty) {
        if (branchId && commodityId) {
            if (!this.data.stock || typeof this.data.stock !== 'object' || Array.isArray(this.data.stock)) {
                this.data.stock = {};
            }
            if (!this.data.stock[branchId]) this.data.stock[branchId] = {};
            if (!this.data.stock[branchId][commodityId]) {
                this.data.stock[branchId][commodityId] = { available: 1000, inTransit: 0, delivered: 0, pending: 0 };
            }
            this.data.stock[branchId][commodityId].available = Number(this.data.stock[branchId][commodityId].available || 0) + Number(qty);
            this.save();
        }
        try {
            const apiRes = await LCOS_API.addStockDirectly(branchId, commodityId, qty);
            if (apiRes && apiRes.success) {
                await this.loadFromBackend();
                return true;
            }
        } catch (err) {
            console.error('API addStockDirectly error:', err);
        }
        return true;
    },

    async recordReturnArrival(tripId) {
        try {
            const apiRes = await LCOS_API.recordReturnArrival(tripId);
            if (apiRes.success) {
                await this.loadFromBackend();
                return true;
            }
        } catch (err) {
            console.error('API recordReturnArrival error:', err);
        }
        return false;
    }
};

// Initialize State
LCOS_State.init();
window.LCOS_State = LCOS_State;
