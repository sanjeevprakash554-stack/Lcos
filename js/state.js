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
    { id: 'BR-DIN', name: 'Dindigul', lat: 10.3673, lng: 77.9803 },
    { id: 'BR-ERD', name: 'Erode', lat: 11.3410, lng: 77.7172 },
    { id: 'BR-KAL', name: 'Kallakurichi', lat: 11.7384, lng: 78.9639 },
    { id: 'BR-KAN', name: 'Kanchipuram', lat: 12.8342, lng: 79.7036 },
    { id: 'BR-KKI', name: 'Kanyakumari', lat: 8.1833, lng: 77.4119 },
    { id: 'BR-KAR', name: 'Karur', lat: 10.9601, lng: 78.0766 },
    { id: 'BR-KRI', name: 'Krishnagiri', lat: 12.5266, lng: 78.2146 },
    { id: 'BR-MDU', name: 'Madurai', lat: 9.9252, lng: 78.1198 },
    { id: 'BR-MAY', name: 'Mayiladuthurai', lat: 11.1018, lng: 79.6522 },
    { id: 'BR-NAG', name: 'Nagapattinam', lat: 10.7672, lng: 79.8449 },
    { id: 'BR-NAM', name: 'Namakkal', lat: 11.2189, lng: 78.1674 },
    { id: 'BR-NIL', name: 'Nilgiris (Ooty)', lat: 11.4102, lng: 76.6950 },
    { id: 'BR-PER', name: 'Perambalur', lat: 11.2342, lng: 78.8820 },
    { id: 'BR-PUD', name: 'Pudukkottai', lat: 10.3833, lng: 78.8000 },
    { id: 'BR-RAM', name: 'Ramanathapuram', lat: 9.3639, lng: 78.8394 },
    { id: 'BR-RAN', name: 'Ranipet', lat: 12.9296, lng: 79.3331 },
    { id: 'BR-SAL', name: 'Salem', lat: 11.6643, lng: 78.1460 },
    { id: 'BR-SIV', name: 'Sivaganga', lat: 9.8433, lng: 78.4800 },
    { id: 'BR-TEN', name: 'Tenkasi', lat: 8.9597, lng: 77.3150 },
    { id: 'BR-THA', name: 'Thanjavur', lat: 10.7870, lng: 79.1378 },
    { id: 'BR-THE', name: 'Theni', lat: 10.0104, lng: 77.4768 },
    { id: 'BR-TUT', name: 'Thoothukudi', lat: 8.7642, lng: 78.1348 },
    { id: 'BR-TRY', name: 'Tiruchirappalli', lat: 10.7905, lng: 78.7047 },
    { id: 'BR-TNL', name: 'Tirunelveli', lat: 8.7139, lng: 77.7567 },
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
            { id: 'COM-STE', name: 'Steel', unit: 'Tons', weight: 1000, value: 65000 }
        ],
        vehicles: [
            { id: 'TN-01-AB-1234', type: 'Lorry', capacity: 15, owner: 'Self Owned', status: 'Available' },
            { id: 'TN-37-CD-5678', type: 'Container', capacity: 25, owner: 'Logistics Partners', status: 'Available' },
            { id: 'TN-59-EF-9012', type: 'Mini Truck', capacity: 5, owner: 'Self Owned', status: 'Available' },
            { id: 'TN-02-GH-3456', type: 'Lorry', capacity: 15, owner: 'Self Owned', status: 'Available' },
            { id: 'TN-07-JK-7890', type: 'Container', capacity: 22, owner: 'Logistics Partners', status: 'Available' }
        ],
        drivers: [
            { id: 'DRV-101', name: 'Selvam R.', license: 'DL-TN012015001', phone: '+91 98840 12345', experience: 8, performance: 98, warnings: 0, status: 'Available' },
            { id: 'DRV-102', name: 'Kumaravel P.', license: 'DL-TN372018002', phone: '+91 98840 23456', experience: 5, performance: 92, warnings: 0, status: 'Available' },
            { id: 'DRV-104', name: 'Murugan T.', license: 'DL-TN022014004', phone: '+91 98840 45678', experience: 10, performance: 95, warnings: 0, status: 'Available' }
        ],
        helpers: [
            { id: 'HLP-201', name: 'Mani G.', phone: '+91 97760 11223', role: 'Senior Helper', status: 'Available' },
            { id: 'HLP-203', name: 'Loganathan S.', phone: '+91 97760 33445', role: 'Senior Helper', status: 'Available' }
        ],
        trips: [
            {
                id: 'TRIP-1001',
                dispatchId: 'DISP-2001',
                commodityId: 'COM-RIC',
                quantity: 200,
                sourceBranchId: 'BR-CHE',
                destinationBranchId: 'BR-MDU',
                vehicleId: 'TN-01-AB-1234',
                driverId: 'DRV-101',
                helperId: 'HLP-201',
                created_by_emp_id: 'EMP-101',
                dispatchDate: new Date().toISOString(),
                expectedDeliveryDate: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
                status: 'CREATED',
                checklists: { dispatch: { loaded: false, verified: false, vehicleReady: false, driverAvailable: false }, delivery: { quantityMatches: false, damagesChecked: false, missingChecked: false, conditionOk: false } },
                transitUpdates: [],
                deliveryInfo: null,
                lastUpdateTimestamp: new Date().toISOString(),
                callLogs: [],
                isLiveSynced: false,
                currentGPS: null
            },
            {
                id: 'TRIP-1002',
                dispatchId: 'DISP-2002',
                commodityId: 'COM-CEM',
                quantity: 300,
                sourceBranchId: 'BR-CBE',
                destinationBranchId: 'BR-SAL',
                vehicleId: 'TN-59-EF-9012',
                driverId: 'DRV-105',
                helperId: 'HLP-202',
                created_by_emp_id: 'EMP-101',
                dispatchDate: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
                expectedDeliveryDate: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
                status: 'IN_TRANSIT',
                checklists: { dispatch: { loaded: true, verified: true, vehicleReady: true, driverAvailable: true }, delivery: { quantityMatches: false, damagesChecked: false, missingChecked: false, conditionOk: false } },
                transitUpdates: [{ timestamp: new Date(Date.now() - 3600 * 1000).toISOString(), location: "Palladam Toll Plaza, NH-81", condition: "Good", status: "IN_TRANSIT", delayReason: "", remarks: "Vehicle moving smoothly." }],
                deliveryInfo: null,
                lastUpdateTimestamp: new Date().toISOString(),
                callLogs: [],
                isLiveSynced: true,
                currentGPS: { lat: 11.0168, lng: 76.9558 }
            },
            {
                id: 'TRIP-1003',
                dispatchId: 'DISP-2003',
                commodityId: 'COM-STE',
                quantity: 12,
                sourceBranchId: 'BR-VEL',
                destinationBranchId: 'BR-KAN',
                vehicleId: 'TN-37-CD-5678',
                driverId: 'DRV-103',
                helperId: null,
                created_by_emp_id: 'EMP-101',
                dispatchDate: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
                expectedDeliveryDate: new Date(Date.now() + 3600 * 1000).toISOString(),
                status: 'DELAYED',
                checklists: { dispatch: { loaded: true, verified: true, vehicleReady: true, driverAvailable: true }, delivery: { quantityMatches: false, damagesChecked: false, missingChecked: false, conditionOk: false } },
                transitUpdates: [{ timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), location: "Kaveripakkam (Stopped)", condition: "Minor Issue", status: "DELAYED", delayReason: "Breakdown", remarks: "Engine overheating. Driver stopped on highway." }],
                deliveryInfo: null,
                lastUpdateTimestamp: new Date().toISOString(),
                callLogs: [],
                isLiveSynced: true,
                currentGPS: { lat: 12.9229, lng: 79.3326 }
            },
            {
                id: 'TRIP-1004',
                dispatchId: 'DISP-2004',
                commodityId: 'COM-PUL',
                quantity: 150,
                sourceBranchId: 'BR-TRY',
                destinationBranchId: 'BR-CBE',
                vehicleId: 'TN-07-JK-7890',
                driverId: 'DRV-106',
                helperId: 'HLP-203',
                created_by_emp_id: 'EMP-101',
                dispatchDate: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
                expectedDeliveryDate: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
                status: 'CLOSED',
                checklists: { dispatch: { loaded: true, verified: true, vehicleReady: true, driverAvailable: true }, delivery: { quantityMatches: true, damagesChecked: true, missingChecked: true, conditionOk: true } },
                transitUpdates: [],
                deliveryInfo: { receivedQuantity: 150, damagesCount: 0, missingCount: 0, condition: "Good", receiverName: "Senthil Kumar (CBE Mgr)", receiptNumber: "RCPT-9004", closedTimestamp: new Date(Date.now() - 18 * 3600 * 1000).toISOString() },
                lastUpdateTimestamp: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
                callLogs: [],
                isLiveSynced: false,
                currentGPS: null
            }
        ],
        callLogs: [
            { id: 'CL-001', tripId: 'TRIP-1002', timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), type: 'Dispatch Confirmation', caller: 'Admin Office', recipient: 'BR-CBE Manager (Senthil)', locationCheckin: 'Coimbatore Branch', notes: 'Completed dispatch checklist. Cargo loaded, documents signed.' },
            { id: 'CL-002', tripId: 'TRIP-1002', timestamp: new Date(Date.now() - 3600 * 1000).toISOString(), type: 'Transit Update', caller: 'Driver (Saravanan K.)', recipient: 'Admin Office', locationCheckin: 'Palladam Toll Plaza', notes: 'Driver reported cross Palladam Toll Plaza. Speed 60 km/h, road clear.' },
            { id: 'CL-003', tripId: 'TRIP-1003', timestamp: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), type: 'Transit Update', caller: 'Driver (Rajesh Nair)', recipient: 'Admin Office', locationCheckin: 'Vellore Gate', notes: 'Journey started. Confirmed vehicle loaded with steel rods.' },
            { id: 'CL-004', tripId: 'TRIP-1003', timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), type: 'Delay Check', caller: 'Admin Office', recipient: 'Driver (Rajesh Nair)', locationCheckin: 'Kaveripakkam', notes: 'Admin noticed vehicle stopped for 30 minutes on GPS. Driver confirmed radiator leak breakdown.' }
        ],
        stock: {
            'BR-CHE': { 'COM-RIC': { available: 1300, inTransit: 0, delivered: 0, pending: 200 }, 'COM-SUG': { available: 1500, inTransit: 0, delivered: 0, pending: 0 } },
            'BR-CBE': { 'COM-CEM': { available: 900, inTransit: 0, delivered: 0, pending: 0 }, 'COM-PUL': { available: 550, inTransit: 0, delivered: 150, pending: 0 } },
            'BR-SAL': { 'COM-CEM': { available: 300, inTransit: 300, delivered: 0, pending: 0 } },
            'BR-VEL': { 'COM-STE': { available: 18, inTransit: 0, delivered: 0, pending: 0 } },
            'BR-KAN': { 'COM-STE': { available: 10, inTransit: 12, delivered: 0, pending: 0 } },
            'BR-TRY': { 'COM-PUL': { available: 350, inTransit: 0, delivered: 0, pending: 0 } }
        },
        alerts: [
            { id: 'ALT-101', tripId: 'TRIP-1003', vehicleId: 'TN-37-CD-5678', driverId: 'DRV-103', type: 'Breakdown', message: 'Trip TRIP-1003 (Steel) reports Breakdown at Kaveripakkam.', severity: 'danger', status: 'Active', escalated: false, timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString() }
        ],
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
                    'BR-ERD': { lat: 11.3410, lng: 77.7172 },
                    'BR-KAL': { lat: 11.7384, lng: 78.9639 },
                    'BR-KAN': { lat: 12.8342, lng: 79.7036 },
                    'BR-KKI': { lat: 8.1833, lng: 77.4119 },
                    'BR-KAR': { lat: 10.9601, lng: 78.0766 },
                    'BR-KRI': { lat: 12.5266, lng: 78.2146 },
                    'BR-MDU': { lat: 9.9252, lng: 78.1198 },
                    'BR-MAY': { lat: 11.1018, lng: 79.6522 },
                    'BR-NAG': { lat: 10.7672, lng: 79.8449 },
                    'BR-NAM': { lat: 11.2189, lng: 78.1674 },
                    'BR-NIL': { lat: 11.4102, lng: 76.6950 },
                    'BR-PER': { lat: 11.2342, lng: 78.8820 },
                    'BR-PUD': { lat: 10.3833, lng: 78.8000 },
                    'BR-RAM': { lat: 9.3639, lng: 78.8394 },
                    'BR-RAN': { lat: 12.9296, lng: 79.3331 },
                    'BR-SAL': { lat: 11.6643, lng: 78.1460 },
                    'BR-SIV': { lat: 9.8433, lng: 78.4800 },
                    'BR-TEN': { lat: 8.9597, lng: 77.3150 },
                    'BR-THA': { lat: 10.7870, lng: 79.1378 },
                    'BR-THE': { lat: 10.0104, lng: 77.4768 },
                    'BR-TUT': { lat: 8.7642, lng: 78.1348 },
                    'BR-TRY': { lat: 10.7905, lng: 78.7047 },
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
                this.data.branches = branchesRes.value.branches.map(b => {
                    const gps = districtGPS[b.id] || { lat: Number(b.lat || 11.1271), lng: Number(b.lng || 78.6569) };
                    return {
                        id: b.id,
                        name: b.name,
                        manager: b.manager_name || b.manager,
                        phone: b.phone,
                        lat: gps.lat,
                        lng: gps.lng,
                        x: b.x_coord || 50,
                        y: b.y_coord || 50
                    };
                });
            }

            if (commoditiesRes.status === 'fulfilled' && commoditiesRes.value && commoditiesRes.value.commodities && commoditiesRes.value.commodities.length > 0) {
                this.data.commodities = commoditiesRes.value.commodities.map(c => ({
                    id: c.id, name: c.name, unit: c.unit, weight: Number(c.weight_kg), value: Number(c.unit_value)
                }));
            }

            if (vehiclesRes.status === 'fulfilled' && vehiclesRes.value && vehiclesRes.value.vehicles && vehiclesRes.value.vehicles.length > 0) {
                this.data.vehicles = vehiclesRes.value.vehicles.map(v => ({
                    id: v.id, type: v.type, capacity: Number(v.capacity_tons), owner: v.ownership, status: v.status,
                    currentLat: (v.current_lat !== null && v.current_lat !== undefined) ? Number(v.current_lat) : null, currentLng: (v.current_lng !== null && v.current_lng !== undefined) ? Number(v.current_lng) : null, speedKmh: v.speed_kmh !== undefined ? Number(v.speed_kmh) : 0, heading: v.heading !== undefined ? Number(v.heading) : 0, movementStatus: v.movement_status || 'STOPPED', lastGpsUpdate: v.last_gps_update || null, lastPingAt: v.last_ping_at || null
                }));
            }

            if (driversRes.status === 'fulfilled' && driversRes.value && driversRes.value.drivers && driversRes.value.drivers.length > 0) {
                this.data.drivers = driversRes.value.drivers.map(d => ({
                    id: d.id, name: d.name, license: d.license_number, phone: d.phone, experience: d.experience_years,
                    performance: d.performance_score, warnings: d.warnings_count, status: d.status
                }));
            }

            if (helpersRes.status === 'fulfilled' && helpersRes.value && helpersRes.value.helpers && helpersRes.value.helpers.length > 0) {
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
                this.data.stock = stockRes.value.stock;
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
                    timestamp: a.created_at
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

            if (requestsRes.status === 'fulfilled' && requestsRes.value && requestsRes.value.requests) {
                this.data.requests = requestsRes.value.requests.map(r => ({
                    id: r.id,
                    type: r.type,
                    data: typeof r.request_data === 'string' ? JSON.parse(r.request_data) : r.request_data,
                    status: r.status,
                    timestamp: r.created_at
                }));
            }

            console.log('[LCOS_State] PostgreSQL data loaded into state successfully.');
        } catch (err) {
            console.error('[LCOS_State] Error loading backend data:', err);
        }
    },

    getBranches() { return this.data.branches; },
    getBranchCoordinates(id) {
        if (!id) return null;
        const b = (this.data.branches || []).find(br => br.id === id || br.name?.toLowerCase() === id.toLowerCase());
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
    getStock() { return this.data.stock; },
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
        try {
            const apiRes = await LCOS_API.addTrip({
                sourceBranchId: trip.sourceBranchId,
                destinationBranchId: trip.destinationBranchId,
                commodityId: trip.commodityId,
                quantity: trip.quantity,
                vehicleId: trip.vehicleId,
                driverId: trip.driverId,
                helperId: trip.helperId,
                empId: trip.empId || 'EMP-101',
                expectedHours: 8
            });

            if (apiRes.success) {
                await this.loadFromBackend();
                return apiRes.trip;
            }
        } catch (err) {
            console.error('API addTrip error:', err);
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
            if (apiRes.success) {
                await this.loadFromBackend();
            }
            return apiRes;
        } catch (err) {
            console.error('API assignBackload error:', err);
        }
    },

    async recordReturnArrival(tripId) {
        try {
            const apiRes = await LCOS_API.recordReturnArrival(tripId);
            if (apiRes.success) {
                await this.loadFromBackend();
            }
            return apiRes;
        } catch (err) {
            console.error('API recordReturnArrival error:', err);
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

    async addDriver(driver) {
        try {
            const apiRes = await LCOS_API.addDriver(driver);
            if (apiRes && apiRes.success) {
                await this.loadFromBackend();
                return apiRes.driver;
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
            if (apiRes.success) {
                await this.loadFromBackend();
                return apiRes.request;
            }
        } catch (err) {
            console.error('API addManagerRequest error:', err);
        }
    },

    async approveManagerRequest(reqId) {
        try {
            const apiRes = await LCOS_API.approveManagerRequest(reqId);
            if (apiRes.success) {
                await this.loadFromBackend();
                return true;
            }
        } catch (err) {
            console.error('API approveManagerRequest error:', err);
        }
        return false;
    },

    async addStockDirectly(branchId, commodityId, qty) {
        try {
            const apiRes = await LCOS_API.addStockDirectly(branchId, commodityId, qty);
            if (apiRes.success) {
                await this.loadFromBackend();
                return true;
            }
        } catch (err) {
            console.error('API addStockDirectly error:', err);
        }
        return false;
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
