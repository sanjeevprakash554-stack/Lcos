-- Extended Dummy Data for LCOS (Logistics Operations Control System)

-- 1. Additional Companies (SaaS Multi-tenant)
INSERT INTO companies (id, name, email, phone, address, status) VALUES
('COMP-002', 'TN Express Freight Lines', 'contact@tnexpress.in', '+91 422 245 1122', '45 Trichy Road, Coimbatore, Tamil Nadu - 641018', 'ACTIVE'),
('COMP-003', 'Kongu Heavy Haulers', 'info@konguhaulers.com', '+91 424 222 3344', '12 Brough Road, Erode, Tamil Nadu - 638001', 'ACTIVE'),
('COMP-004', 'Pandian South Transport', 'support@pandiantransport.com', '+91 452 233 4455', '88 Bypass Road, Madurai, Tamil Nadu - 625016', 'ACTIVE'),
('COMP-005', 'Cauvery Delta Cargo', 'dispatch@cauverycargo.org', '+91 431 241 8899', '15 Thillai Nagar, Tiruchirappalli, Tamil Nadu - 620018', 'EXPIRED')
ON CONFLICT (id) DO NOTHING;

-- 2. Additional SaaS Subscriptions
INSERT INTO subscriptions (id, company_id, plan_id, status, start_date, expiry_date, auto_renew) VALUES
('SUB-1002', 'COMP-002', 'PLAN-PRO', 'ACTIVE', NOW() - INTERVAL '2 months', NOW() + INTERVAL '10 months', true),
('SUB-1003', 'COMP-003', 'PLAN-BASIC', 'ACTIVE', NOW() - INTERVAL '1 month', NOW() + INTERVAL '11 months', true),
('SUB-1004', 'COMP-004', 'PLAN-ENT', 'ACTIVE', NOW() - INTERVAL '5 months', NOW() + INTERVAL '7 months', true),
('SUB-1005', 'COMP-005', 'PLAN-BASIC', 'EXPIRED', NOW() - INTERVAL '13 months', NOW() - INTERVAL '1 month', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Additional SaaS Payments & Invoices
INSERT INTO payments (id, company_id, subscription_id, plan_id, amount, currency, order_id, transaction_ref_id, payment_gateway, status, gateway_response) VALUES
('PAY-1002', 'COMP-002', 'SUB-1002', 'PLAN-PRO', 14999, 'INR', 'order_LCOS_9002', 'pay_LCOS_tx_9002', 'RAZORPAY', 'SUCCESS', '{"method": "Netbanking", "bank": "HDFC"}'::jsonb),
('PAY-1003', 'COMP-003', 'SUB-1003', 'PLAN-BASIC', 4999, 'INR', 'order_LCOS_9003', 'pay_LCOS_tx_9003', 'CASHFREE', 'SUCCESS', '{"method": "UPI", "vpa": "kongu@upi"}'::jsonb),
('PAY-1004', 'COMP-004', 'SUB-1004', 'PLAN-ENT', 149999, 'INR', 'order_LCOS_9004', 'pay_LCOS_tx_9004', 'RAZORPAY', 'SUCCESS', '{"method": "Card", "card_type": "Corporate"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO invoices (id, company_id, payment_id, invoice_number, amount, tax_amount, total_amount, billing_details, issued_at, status) VALUES
('INV-1002', 'COMP-002', 'PAY-1002', 'INV-2026-0002', 14999, 2700, 17699, '{"companyName": "TN Express Freight Lines", "gstin": "33BBBBA1111B1Z2"}'::jsonb, NOW() - INTERVAL '2 months', 'PAID'),
('INV-1003', 'COMP-003', 'PAY-1003', 'INV-2026-0003', 4999, 900, 5899, '{"companyName": "Kongu Heavy Haulers", "gstin": "33CCCCA2222C1Z3"}'::jsonb, NOW() - INTERVAL '1 month', 'PAID'),
('INV-1004', 'COMP-004', 'PAY-1004', 'INV-2026-0004', 149999, 26999, 176998, '{"companyName": "Pandian South Transport", "gstin": "33DDDDA3333D1Z4"}'::jsonb, NOW() - INTERVAL '5 months', 'PAID')
ON CONFLICT (id) DO NOTHING;

-- 4. Additional Users
INSERT INTO users (id, company_id, username, email, password_hash, full_name, phone, role, emp_id, status) VALUES
('USR-OWNER2', 'COMP-002', 'owner_tn', 'owner_tn@tnexpress.in', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Karthik Subramanian', '+91 98422 11111', 'OWNER', 'OWN-102', 'ACTIVE'),
('USR-MGR2', 'COMP-002', 'manager_cbe', 'mgr_cbe@tnexpress.in', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Senthil Kumar', '+91 98422 22222', 'BRANCH_MANAGER', 'MGR-102', 'ACTIVE'),
('USR-OPER2', 'COMP-002', 'operator_tn', 'oper_tn@tnexpress.in', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Priya Dharshini', '+91 98422 33333', 'TRACKING_TEAM', 'EMP-102', 'ACTIVE'),
('USR-DRIVER2', 'COMP-001', 'driver2', 'driver2@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Kumaravel P.', '+91 98840 23456', 'DRIVER', 'DRV-102', 'ACTIVE'),
('USR-DRIVER3', 'COMP-001', 'driver3', 'driver3@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Rajesh Nair', '+91 98840 34567', 'DRIVER', 'DRV-103', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- 5. Additional Commodities
INSERT INTO commodities (id, company_id, name, unit, weight_kg, unit_value) VALUES
('COM-OIL', 'COMP-001', 'Cooking Oil', 'Tins', 15, 2200),
('COM-TEA', 'COMP-001', 'Nilgiri Tea', 'Boxes', 25, 4500),
('COM-COT', 'COMP-001', 'Raw Cotton', 'Bales', 170, 12500),
('COM-TEX', 'COMP-001', 'Textiles & Fabrics', 'Rolls', 40, 8500),
('COM-FER', 'COMP-001', 'Fertilizers', 'Bags', 50, 1200),
('COM-SPR', 'COMP-001', 'Auto Spare Parts', 'Crates', 100, 35000)
ON CONFLICT (id) DO NOTHING;

-- 6. Additional Vehicles
INSERT INTO vehicles (id, company_id, type, capacity_tons, ownership, status, current_lat, current_lng, speed_kmh, movement_status, stoppage_start_time) VALUES
('TN-10-XY-1234', 'COMP-001', 'Lorry', 16, 'Self Owned', 'In Transit', 11.6643, 78.1460, 52, 'MOVING', NULL),
('TN-38-AB-9988', 'COMP-001', 'Container', 24, 'Logistics Partners', 'In Transit', 10.7905, 78.7047, 0, 'STOPPED', NOW() - INTERVAL '35 minutes'),
('TN-58-CD-4455', 'COMP-001', 'Mini Truck', 6, 'Self Owned', 'Available', 9.9252, 78.1198, 0, 'STOPPED', NULL),
('TN-67-EF-1122', 'COMP-001', 'Lorry', 14, 'Logistics Partners', 'In Transit', 11.3410, 77.7172, 45, 'MOVING', NULL),
('TN-88-GH-7766', 'COMP-001', 'Container', 28, 'Self Owned', 'Available', 13.0827, 80.2707, 0, 'STOPPED', NULL)
ON CONFLICT (id) DO NOTHING;

-- 7. Additional Drivers
INSERT INTO drivers (id, company_id, user_id, name, license_number, phone, experience_years, performance_score, warnings_count, status, current_lat, current_lng) VALUES
('DRV-111', 'COMP-001', NULL, 'Ganesh Moorthy', 'DL-TN102013011', '+91 98840 11122', 11, 96, 0, 'On Trip', 11.6643, 78.1460),
('DRV-112', 'COMP-001', NULL, 'Palanivelu M.', 'DL-TN382017012', '+91 98840 22233', 9, 88, 1, 'On Trip', 10.7905, 78.7047),
('DRV-113', 'COMP-001', NULL, 'Dinesh Kumar', 'DL-TN582021013', '+91 98840 33344', 4, 91, 0, 'Available', 9.9252, 78.1198),
('DRV-114', 'COMP-001', NULL, 'Sundaram P.', 'DL-TN672015014', '+91 98840 44455', 14, 97, 0, 'On Trip', 11.3410, 77.7172),
('DRV-115', 'COMP-001', NULL, 'Vengatadasan K.', 'DL-TN882010015', '+91 98840 55566', 16, 75, 2, 'Suspended', 13.0827, 80.2707)
ON CONFLICT (id) DO NOTHING;

-- 8. Additional Helpers
INSERT INTO helpers (id, company_id, name, phone, role_type, status) VALUES
('HLP-207', 'COMP-001', 'Kannan S.', '+91 97760 77889', 'Senior Helper', 'On Trip'),
('HLP-208', 'COMP-001', 'Dass M.', '+91 97760 88990', 'Junior Helper', 'On Trip'),
('HLP-209', 'COMP-001', 'Prakash R.', '+91 97760 99001', 'Senior Helper', 'Available')
ON CONFLICT (id) DO NOTHING;

-- 9. Additional Stock Records across All Branches
INSERT INTO stock (branch_id, commodity_id, available_qty, in_transit_qty, delivered_qty, pending_qty) VALUES
('BR-CHE', 'COM-OIL', 800, 150, 400, 0),
('BR-CHE', 'COM-TEA', 500, 0, 250, 0),
('BR-CBE', 'COM-COT', 400, 200, 600, 0),
('BR-CBE', 'COM-TEX', 350, 100, 500, 0),
('BR-MDU', 'COM-FER', 1200, 300, 900, 100),
('BR-TRY', 'COM-SPR', 80, 20, 120, 0),
('BR-SAL', 'COM-OIL', 600, 0, 300, 0),
('BR-VEL', 'COM-TEA', 300, 50, 150, 0),
('BR-ERD', 'COM-TEX', 900, 150, 800, 0),
('BR-TEN', 'COM-FER', 750, 0, 500, 0)
ON CONFLICT (branch_id, commodity_id) DO UPDATE
SET available_qty = stock.available_qty + EXCLUDED.available_qty,
    in_transit_qty = stock.in_transit_qty + EXCLUDED.in_transit_qty,
    delivered_qty = stock.delivered_qty + EXCLUDED.delivered_qty,
    updated_at = NOW();

-- 10. Additional Trips
INSERT INTO trips (id, company_id, dispatch_id, commodity_id, quantity, source_branch_id, destination_branch_id, vehicle_id, driver_id, helper_id, created_by_emp_id, dispatch_date, expected_delivery_date, status, checklists, transit_updates, delivery_info, last_update_timestamp) VALUES
('TRIP-1005', 'COMP-001', 'DISP-2005', 'COM-COT', 200, 'BR-CBE', 'BR-CHE', 'TN-10-XY-1234', 'DRV-111', 'HLP-207', 'EMP-101', NOW() - INTERVAL '4 hours', NOW() + INTERVAL '4 hours', 'IN_TRANSIT', '{"dispatch": {"loaded": true, "verified": true, "vehicleReady": true, "driverAvailable": true}, "delivery": {"quantityMatches": false, "damagesChecked": false, "missingChecked": false, "conditionOk": false}}'::jsonb, '[{"timestamp": "2026-10-05T11:30:00+05:30", "location": "Salem Highway NH-44", "condition": "Good", "status": "IN_TRANSIT", "delayReason": "", "remarks": "Cruising smoothly at 55 km/h."}]'::jsonb, NULL, NOW() - INTERVAL '30 minutes'),

('TRIP-1006', 'COMP-001', 'DISP-2006', 'COM-OIL', 150, 'BR-CHE', 'BR-SAL', 'TN-38-AB-9988', 'DRV-112', 'HLP-208', 'EMP-101', NOW() - INTERVAL '5 hours', NOW() + INTERVAL '1 hour', 'DELAYED', '{"dispatch": {"loaded": true, "verified": true, "vehicleReady": true, "driverAvailable": true}, "delivery": {"quantityMatches": false, "damagesChecked": false, "missingChecked": false, "conditionOk": false}}'::jsonb, '[{"timestamp": "2026-10-05T13:15:00+05:30", "location": "Ulundurpet Toll Plaza (Stopped)", "condition": "Minor Issue", "status": "DELAYED", "delayReason": "Stoppage Detected", "remarks": "Vehicle stopped for over 35 minutes near toll booth. Operator calling driver."}]'::jsonb, NULL, NOW() - INTERVAL '15 minutes'),

('TRIP-1007', 'COMP-001', 'DISP-2007', 'COM-TEX', 100, 'BR-ERD', 'BR-MDU', 'TN-67-EF-1122', 'DRV-114', NULL, 'EMP-101', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '5 hours', 'IN_TRANSIT', '{"dispatch": {"loaded": true, "verified": true, "vehicleReady": true, "driverAvailable": true}, "delivery": {"quantityMatches": false, "damagesChecked": false, "missingChecked": false, "conditionOk": false}}'::jsonb, '[{"timestamp": "2026-10-05T13:30:00+05:30", "location": "Dindigul Bypass", "condition": "Good", "status": "IN_TRANSIT", "delayReason": "", "remarks": "Weather clear, moving at normal speed."}]'::jsonb, NULL, NOW() - INTERVAL '10 minutes'),

('TRIP-1008', 'COMP-001', 'DISP-2008', 'COM-TEA', 50, 'BR-VEL', 'BR-CHE', 'TN-88-GH-7766', 'DRV-102', 'HLP-209', 'EMP-101', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '1 hour', 'ARRIVED', '{"dispatch": {"loaded": true, "verified": true, "vehicleReady": true, "driverAvailable": true}, "delivery": {"quantityMatches": false, "damagesChecked": false, "missingChecked": false, "conditionOk": false}}'::jsonb, '[{"timestamp": "2026-10-05T13:00:00+05:30", "location": "Chennai Warehouse Gate 3", "condition": "Good", "status": "ARRIVED", "delayReason": "", "remarks": "Arrived at destination warehouse. Waiting for manager unloading verification."}]'::jsonb, NULL, NOW() - INTERVAL '40 minutes')
ON CONFLICT (id) DO NOTHING;

-- 11. Additional Alerts (20-Min Stoppage & Breakdown alerts)
INSERT INTO alerts (id, company_id, trip_id, vehicle_id, driver_id, type, message, severity, status, stoppage_duration_minutes, escalated) VALUES
('ALT-102', 'COMP-001', 'TRIP-1006', 'TN-38-AB-9988', 'DRV-112', 'Stoppage Detected', 'AUTOMATIC DETECTED: Vehicle TN-38-AB-9988 (Palanivelu M.) stopped at Ulundurpet Toll Plaza for over 35 minutes! (Threshold: 20 mins)', 'warning', 'Active', 35, false),
('ALT-103', 'COMP-001', 'TRIP-1005', 'TN-10-XY-1234', 'DRV-111', 'Traffic Jam', 'Heavy vehicular congestion reported near Salem bypass road.', 'info', 'Resolved', 0, false),
('ALT-104', 'COMP-001', NULL, 'TN-88-GH-7766', 'DRV-115', 'Unreachable', 'GPS heartbeat link lost for driver Vengatadasan K. 3-strike escalation initiated.', 'danger', 'Escalated', 0, true)
ON CONFLICT (id) DO NOTHING;

-- 12. Additional Call Logs
INSERT INTO call_logs (id, company_id, trip_id, call_category, caller, recipient, location_checkin, operator_emp_id, conversation_notes) VALUES
('CL-009', 'COMP-001', 'TRIP-1005', 'Transit Update', 'Driver (Ganesh Moorthy)', 'Admin Office', 'Salem Highway', 'EMP-101', 'Driver confirmed crossing Salem. Vehicle running fine, speed 55 km/h.'),
('CL-010', 'COMP-001', 'TRIP-1006', 'Delay Check', 'Admin Office', 'Driver (Palanivelu M.)', 'Ulundurpet Toll', 'EMP-101', 'Called driver regarding 35-min stoppage. Driver reported tire pressure check at highway bunk.'),
('CL-011', 'COMP-001', 'TRIP-1008', 'Arrival Update', 'Driver (Kumaravel P.)', 'Admin Office', 'Chennai Branch', 'EMP-101', 'Driver reported arrival at Chennai warehouse gate. Handed docs to Branch Manager Balaji R.'),
('CL-012', 'COMP-001', 'TRIP-1004', 'Delivery Confirmation', 'Admin Office', 'BR-CBE Manager (Senthil)', 'Coimbatore Branch', 'EMP-101', 'Manager confirmed complete receipt of 150 bags. Zero damage logged.')
ON CONFLICT (id) DO NOTHING;

-- 13. Additional Manager Requests (Pending & Approved)
INSERT INTO manager_requests (id, company_id, type, request_data, status, submitted_by, created_at) VALUES
('REQ-102', 'COMP-001', 'Add Driver', '{"name": "Muthuramalingam K.", "license": "DL-TN452022099", "phone": "+91 98422 99887", "experience": 6}'::jsonb, 'Pending', 'USR-TRACKING', NOW() - INTERVAL '2 hours'),
('REQ-103', 'COMP-001', 'Add Vehicle', '{"id": "TN-99-ZZ-5555", "type": "Container", "capacity": 25, "owner": "Logistics Partners"}'::jsonb, 'Pending', 'USR-TRACKING', NOW() - INTERVAL '1 hour'),
('REQ-104', 'COMP-001', 'Add Stock', '{"branchId": "BR-CHE", "commodityId": "COM-RIC", "quantity": 500}'::jsonb, 'Approved', 'USR-TRACKING', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- 14. Audit Logs
INSERT INTO audit_logs (company_id, user_id, user_role, action, resource, details, ip_address, created_at) VALUES
('COMP-001', 'USR-ADMIN', 'SUPER_ADMIN', 'UPDATE_SETTING', 'system_settings', '{"key": "stoppage_threshold_minutes", "value": 20}'::jsonb, '127.0.0.1', NOW() - INTERVAL '2 days'),
('COMP-001', 'USR-TRACKING', 'TRACKING_TEAM', 'CREATE_TRIP', 'trips', '{"tripId": "TRIP-1005", "commodity": "COM-COT"}'::jsonb, '127.0.0.1', NOW() - INTERVAL '4 hours'),
('COMP-001', 'USR-MANAGER', 'BRANCH_MANAGER', 'APPROVE_REQUEST', 'manager_requests', '{"reqId": "REQ-104"}'::jsonb, '127.0.0.1', NOW() - INTERVAL '1 day');
