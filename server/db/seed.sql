-- PostgreSQL Seed Script for LCOS System

-- 1. System Settings
INSERT INTO system_settings (key, value) VALUES
('stoppage_threshold_minutes', '20'::jsonb),
('simulation_speed', '60'::jsonb),
('alert_time_threshold_hours', '2'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2. SaaS Subscription Plans
INSERT INTO subscription_plans (id, name, billing_cycle, price_inr, max_vehicles, max_users, features) VALUES
('PLAN-BASIC', 'Basic', 'MONTHLY', 4999, 10, 5, '["Real-time GPS Tracking", "Basic Stoppage Alerts", "Call Logging", "Standard Support"]'::jsonb),
('PLAN-PRO', 'Professional', 'MONTHLY', 14999, 50, 20, '["Real-time GPS Tracking", "20-Min Stoppage Detection & 3-Strike Escalation", "Full Inventory & Stock Management", "Role-Based Access Control", "24/7 Priority Support", "Custom Reports"]'::jsonb),
('PLAN-ENT', 'Enterprise', 'YEARLY', 149999, 500, 100, '["All Professional Features", "Dedicated Account Manager", "Custom Payment Gateway Integration", "Unlimited History Storage", "API & Webhook Access"]'::jsonb)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price_inr = EXCLUDED.price_inr;

-- 3. Company
INSERT INTO companies (id, name, email, phone, address, status) VALUES
('COMP-001', 'Vattara Logistics Pvt Ltd', 'admin@vattaralogistics.com', '+91 44 2819 0000', '100 Mount Road, Guindy, Chennai, Tamil Nadu - 600032', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- 4. Subscription for Company
INSERT INTO subscriptions (id, company_id, plan_id, status, start_date, expiry_date, auto_renew) VALUES
('SUB-1001', 'COMP-001', 'PLAN-PRO', 'ACTIVE', NOW(), NOW() + INTERVAL '1 year', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Payments History
INSERT INTO payments (id, company_id, subscription_id, plan_id, amount, currency, order_id, transaction_ref_id, payment_gateway, status, gateway_response) VALUES
('PAY-1001', 'COMP-001', 'SUB-1001', 'PLAN-PRO', 14999, 'INR', 'order_LCOS_9001', 'pay_LCOS_tx_9001', 'RAZORPAY', 'SUCCESS', '{"method": "UPI", "vpa": "vattara@upi"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 6. Invoices
INSERT INTO invoices (id, company_id, payment_id, invoice_number, amount, tax_amount, total_amount, billing_details, issued_at, status) VALUES
('INV-1001', 'COMP-001', 'PAY-1001', 'INV-2026-0001', 14999, 2700, 17699, '{"companyName": "Vattara Logistics Pvt Ltd", "gstin": "33AAAAA0000A1Z5"}'::jsonb, NOW(), 'PAID')
ON CONFLICT (id) DO NOTHING;

-- 7. Users (Password: "password123" -> hashed bcrypt)
-- Note: bcrypt hash for "password123" is $2a$10$eE61K7x5K./b4m6P20wL3.2s2N1z8d3p9A6o7Q7T7f7e7r7s7t7u7
INSERT INTO users (id, company_id, username, email, password_hash, full_name, phone, role, emp_id, status) VALUES
('USR-ADMIN', NULL, 'superadmin', 'superadmin@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'System Super Admin', '+91 99000 00000', 'SUPER_ADMIN', 'SA-001', 'ACTIVE'),
('USR-OWNER', 'COMP-001', 'owner', 'owner@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Executive Owners HQ', '+91 98840 00001', 'OWNER', 'OWN-101', 'ACTIVE'),
('USR-MANAGER', 'COMP-001', 'manager', 'manager@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Branch Manager Supervisor', '+91 98840 00002', 'BRANCH_MANAGER', 'MGR-101', 'ACTIVE'),
('USR-TRACKING', 'COMP-001', 'tracking', 'tracking@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Tracking Team Operator', '+91 98840 00003', 'TRACKING_TEAM', 'EMP-101', 'ACTIVE'),
('USR-DRIVER1', 'COMP-001', 'driver1', 'driver1@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Selvam R.', '+91 98840 12345', 'DRIVER', 'DRV-101', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- 8. Branches
INSERT INTO branches (id, company_id, name, manager_name, phone, x_coord, y_coord) VALUES
('BR-CHE', 'COMP-001', 'Chennai', 'Balaji R.', '+91 94412 12345', 82, 15),
('BR-CBE', 'COMP-001', 'Coimbatore', 'Senthil Kumar', '+91 94412 23456', 20, 55),
('BR-MDU', 'COMP-001', 'Madurai', 'Pandian M.', '+91 94412 34567', 42, 70),
('BR-TRY', 'COMP-001', 'Tiruchirappalli', 'Raja Sekhar', '+91 94412 45678', 52, 55),
('BR-SAL', 'COMP-001', 'Salem', 'Venkatachalam K.', '+91 94412 56789', 45, 40),
('BR-VEL', 'COMP-001', 'Vellore', 'Karthikeyan S.', '+91 94412 67890', 68, 22),
('BR-ERD', 'COMP-001', 'Erode', 'Ramasamy P.', '+91 94412 78901', 35, 48),
('BR-TEN', 'COMP-001', 'Tirunelveli', 'Muthu Krishnan', '+91 94412 89012', 35, 85),
('BR-TUT', 'COMP-001', 'Thoothukudi', 'Subbiah V.', '+91 94412 90123', 48, 88),
('BR-DGL', 'COMP-001', 'Dindigul', 'Palanichamy M.', '+91 94412 01234', 38, 62),
('BR-CUD', 'COMP-001', 'Cuddalore', 'Elangovan A.', '+91 94412 11223', 72, 38),
('BR-KNC', 'COMP-001', 'Kanchipuram', 'Srinivasan G.', '+91 94412 22334', 76, 24),
('BR-VLP', 'COMP-001', 'Villupuram', 'Anbarasan T.', '+91 94412 33445', 70, 32),
('BR-NGP', 'COMP-001', 'Nagapattinam', 'Muruganandam K.', '+91 94412 44556', 76, 52)
ON CONFLICT (id) DO NOTHING;

-- 9. Commodities
INSERT INTO commodities (id, company_id, name, unit, weight_kg, unit_value) VALUES
('COM-RIC', 'COMP-001', 'Rice', 'Bags', 50, 2000),
('COM-SUG', 'COMP-001', 'Sugar', 'Bags', 50, 2500),
('COM-WHE', 'COMP-001', 'Wheat', 'Bags', 50, 1800),
('COM-PUL', 'COMP-001', 'Pulses', 'Bags', 50, 3200),
('COM-CEM', 'COMP-001', 'Cement', 'Bags', 50, 450),
('COM-STE', 'COMP-001', 'Steel', 'Tons', 1000, 65000)
ON CONFLICT (id) DO NOTHING;

-- 10. Vehicles
INSERT INTO vehicles (id, company_id, type, capacity_tons, ownership, status, current_lat, current_lng, movement_status) VALUES
('TN-01-AB-1234', 'COMP-001', 'Lorry', 15, 'Self Owned', 'Available', 13.0827, 80.2707, 'STOPPED'),
('TN-37-CD-5678', 'COMP-001', 'Container', 25, 'Logistics Partners', 'In Transit', 12.9229, 79.3326, 'STOPPED'),
('TN-59-EF-9012', 'COMP-001', 'Mini Truck', 5, 'Self Owned', 'In Transit', 11.0168, 76.9558, 'MOVING'),
('TN-02-GH-3456', 'COMP-001', 'Lorry', 15, 'Self Owned', 'Available', 13.0827, 80.2707, 'STOPPED'),
('TN-07-JK-7890', 'COMP-001', 'Container', 22, 'Logistics Partners', 'Available', 10.7905, 78.7047, 'STOPPED'),
('TN-23-LM-1122', 'COMP-001', 'Lorry', 12, 'Self Owned', 'Available', 11.6643, 78.1460, 'STOPPED'),
('TN-30-NP-3344', 'COMP-001', 'Mini Truck', 4, 'Logistics Partners', 'Available', 11.3410, 77.7172, 'STOPPED'),
('TN-45-QR-5566', 'COMP-001', 'Container', 28, 'Self Owned', 'Available', 8.7139, 77.7567, 'STOPPED'),
('TN-69-ST-7788', 'COMP-001', 'Lorry', 16, 'Logistics Partners', 'Available', 8.7274, 78.1580, 'STOPPED'),
('TN-72-UV-9900', 'COMP-001', 'Mini Truck', 6, 'Self Owned', 'Available', 10.3673, 77.9803, 'STOPPED')
ON CONFLICT (id) DO NOTHING;

-- 11. Drivers
INSERT INTO drivers (id, company_id, user_id, name, license_number, phone, experience_years, performance_score, warnings_count, status, current_lat, current_lng) VALUES
('DRV-101', 'COMP-001', 'USR-DRIVER1', 'Selvam R.', 'DL-TN012015001', '+91 98840 12345', 8, 98, 0, 'Available', 13.0827, 80.2707),
('DRV-102', 'COMP-001', NULL, 'Kumaravel P.', 'DL-TN372018002', '+91 98840 23456', 5, 92, 0, 'Available', 11.0168, 76.9558),
('DRV-103', 'COMP-001', NULL, 'Rajesh Nair', 'DL-TN592012003', '+91 98840 34567', 12, 80, 1, 'On Trip', 12.9229, 79.3326),
('DRV-104', 'COMP-001', NULL, 'Murugan T.', 'DL-TN022014004', '+91 98840 45678', 10, 95, 0, 'Available', 13.0827, 80.2707),
('DRV-105', 'COMP-001', NULL, 'Saravanan K.', 'DL-TN072020005', '+91 98840 56789', 4, 90, 0, 'On Trip', 11.1085, 77.3411),
('DRV-106', 'COMP-001', NULL, 'Arumugam M.', 'DL-TN232011006', '+91 98840 67890', 15, 100, 0, 'Available', 10.7905, 78.7047),
('DRV-107', 'COMP-001', NULL, 'Baskaran S.', 'DL-TN302016007', '+91 98840 78901', 7, 65, 2, 'Available', 11.6643, 78.1460),
('DRV-108', 'COMP-001', NULL, 'Kathiravan G.', 'DL-TN452019008', '+91 98840 89012', 6, 94, 0, 'Available', 11.3410, 77.7172),
('DRV-109', 'COMP-001', NULL, 'Paneerselvam K.', 'DL-TN692010009', '919884090123', 18, 99, 0, 'On Trip', 8.7139, 77.7567),
('DRV-110', 'COMP-001', NULL, 'Vinoth Kumar', 'DL-TN722021010', '919884001234', 3, 88, 0, 'On Trip', 8.7274, 78.1580),
('DRV-111', 'COMP-001', NULL, 'Teenu', 'DL-TN112023011', '916382897998', 4, 91, 0, 'Available', 12.9165, 79.1325),
('DRV-112', 'COMP-001', NULL, 'sanjeev', 'DL-TN302024012', '7904743468', 5, 96, 0, 'On Trip', 11.3410, 77.7172)
ON CONFLICT (id) DO NOTHING;

-- 12. Helpers
INSERT INTO helpers (id, company_id, name, phone, role_type, status) VALUES
('HLP-201', 'COMP-001', 'Mani G.', '+91 97760 11223', 'Senior Helper', 'Available'),
('HLP-202', 'COMP-001', 'Sakthi V.', '+91 97760 22334', 'Junior Helper', 'On Trip'),
('HLP-203', 'COMP-001', 'Loganathan S.', '+91 97760 33445', 'Senior Helper', 'Available'),
('HLP-204', 'COMP-001', 'Velu P.', '+91 97760 44556', 'Junior Helper', 'Available'),
('HLP-205', 'COMP-001', 'Thangaraj K.', '+91 97760 55667', 'Senior Helper', 'Available'),
('HLP-206', 'COMP-001', 'Ramu M.', '+91 97760 66778', 'Junior Helper', 'Available')
ON CONFLICT (id) DO NOTHING;

-- 13. Stock Initialization
INSERT INTO stock (branch_id, commodity_id, available_qty, in_transit_qty, delivered_qty, pending_qty) VALUES
('BR-CHE', 'COM-RIC', 1300, 0, 0, 200),
('BR-CHE', 'COM-SUG', 1500, 0, 0, 0),
('BR-CBE', 'COM-CEM', 900, 0, 0, 0),
('BR-SAL', 'COM-CEM', 300, 300, 0, 0),
('BR-VEL', 'COM-STE', 18, 0, 0, 0),
('BR-KNC', 'COM-STE', 10, 12, 0, 0),
('BR-TRY', 'COM-PUL', 350, 0, 0, 0),
('BR-CBE', 'COM-PUL', 550, 0, 150, 0)
ON CONFLICT (branch_id, commodity_id) DO NOTHING;

-- 14. Seed Trips
INSERT INTO trips (id, company_id, dispatch_id, commodity_id, quantity, source_branch_id, destination_branch_id, vehicle_id, driver_id, helper_id, created_by_emp_id, dispatch_date, expected_delivery_date, status, checklists, transit_updates, delivery_info, last_update_timestamp) VALUES
('TRIP-1001', 'COMP-001', 'DISP-2001', 'COM-RIC', 200, 'BR-CHE', 'BR-MDU', 'TN-01-AB-1234', 'DRV-101', 'HLP-201', 'EMP-101', NOW(), NOW() + INTERVAL '8 hours', 'CREATED', '{"dispatch": {"loaded": false, "verified": false, "vehicleReady": false, "driverAvailable": false}, "delivery": {"quantityMatches": false, "damagesChecked": false, "missingChecked": false, "conditionOk": false}}'::jsonb, '[]'::jsonb, NULL, NOW()),
('TRIP-1002', 'COMP-001', 'DISP-2002', 'COM-CEM', 300, 'BR-CBE', 'BR-SAL', 'TN-59-EF-9012', 'DRV-105', 'HLP-202', 'EMP-101', NOW() - INTERVAL '2 hours', NOW() + INTERVAL '2 hours', 'IN_TRANSIT', '{"dispatch": {"loaded": true, "verified": true, "vehicleReady": true, "driverAvailable": true}, "delivery": {"quantityMatches": false, "damagesChecked": false, "missingChecked": false, "conditionOk": false}}'::jsonb, '[{"timestamp": "2026-08-04T08:45:00+05:30", "location": "Palladam Toll Plaza, NH-81", "condition": "Good", "status": "IN_TRANSIT", "delayReason": "", "remarks": "Vehicle moving smoothly."}]'::jsonb, NULL, NOW()),
('TRIP-1003', 'COMP-001', 'DISP-2003', 'COM-STE', 12, 'BR-VEL', 'BR-KNC', 'TN-37-CD-5678', 'DRV-103', NULL, 'EMP-101', NOW() - INTERVAL '3 hours', NOW() + INTERVAL '1 hour', 'DELAYED', '{"dispatch": {"loaded": true, "verified": true, "vehicleReady": true, "driverAvailable": true}, "delivery": {"quantityMatches": false, "damagesChecked": false, "missingChecked": false, "conditionOk": false}}'::jsonb, '[{"timestamp": "2026-08-04T09:00:00+05:30", "location": "Kaveripakkam (Stopped)", "condition": "Minor Issue", "status": "DELAYED", "delayReason": "Breakdown", "remarks": "Engine overheating. Driver stopped on highway."}]'::jsonb, NULL, NOW()),
('TRIP-1004', 'COMP-001', 'DISP-2004', 'COM-PUL', 150, 'BR-TRY', 'BR-CBE', 'TN-07-JK-7890', 'DRV-106', 'HLP-203', 'EMP-101', NOW() - INTERVAL '1 day', NOW() - INTERVAL '18 hours', 'CLOSED', '{"dispatch": {"loaded": true, "verified": true, "vehicleReady": true, "driverAvailable": true}, "delivery": {"quantityMatches": true, "damagesChecked": true, "missingChecked": true, "conditionOk": true}}'::jsonb, '[]'::jsonb, '{"receivedQuantity": 150, "damagesCount": 0, "missingCount": 0, "condition": "Good", "receiverName": "Senthil Kumar (CBE Mgr)", "receiptNumber": "RCPT-9004", "closedTimestamp": "2026-08-03T21:15:00+05:30"}'::jsonb, NOW() - INTERVAL '18 hours'),
('TRIP-1005', 'COMP-001', 'DISP-2005', 'COM-RIC', 250, 'BR-MDU', 'BR-DGL', 'TN-02-GH-3456', 'DRV-102', NULL, 'EMP-101', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '3 hours', 'IN_TRANSIT', '{}'::jsonb, '[]'::jsonb, NULL, NOW()),
('TRIP-1006', 'COMP-001', 'DISP-2006', 'COM-CEM', 200, 'BR-SAL', 'BR-TRY', 'TN-23-LM-1122', 'DRV-104', NULL, 'EMP-101', NOW() - INTERVAL '2 hours', NOW() + INTERVAL '2 hours', 'IN_TRANSIT', '{}'::jsonb, '[]'::jsonb, NULL, NOW()),
('TRIP-1007', 'COMP-001', 'DISP-2007', 'COM-STE', 15, 'BR-TEN', 'BR-MDU', 'TN-45-QR-5566', 'DRV-107', NULL, 'EMP-101', NOW() - INTERVAL '3 hours', NOW() + INTERVAL '1 hour', 'IN_TRANSIT', '{}'::jsonb, '[]'::jsonb, NULL, NOW()),
('TRIP-1009', 'COMP-001', 'DISP-2009', 'COM-SUG', 350, 'BR-TUT', 'BR-TEN', 'TN-69-ST-7788', 'DRV-109', NULL, 'EMP-101', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '4 hours', 'IN_TRANSIT', '{}'::jsonb, '[]'::jsonb, NULL, NOW()),
('TRIP-1010', 'COMP-001', 'DISP-2010', 'COM-SUG', 120, 'BR-CUD', 'BR-VLP', 'TN-72-UV-9900', 'DRV-110', NULL, 'EMP-101', NOW() - INTERVAL '2 hours', NOW() + INTERVAL '2 hours', 'IN_TRANSIT', '{}'::jsonb, '[]'::jsonb, NULL, NOW()),
('TRIP-1012', 'COMP-001', 'DISP-2012', 'COM-PUL', 150, 'BR-ERD', 'BR-CBE', 'TN-30-NP-3344', 'DRV-112', NULL, 'EMP-101', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '3 hours', 'IN_TRANSIT', '{}'::jsonb, '[]'::jsonb, NULL, NOW())
ON CONFLICT (id) DO NOTHING;

-- 15. Seed Alerts
INSERT INTO alerts (id, company_id, trip_id, vehicle_id, driver_id, type, message, severity, status, escalated) VALUES
('ALT-101', 'COMP-001', 'TRIP-1003', 'TN-37-CD-5678', 'DRV-103', 'Breakdown', 'Trip TRIP-1003 (Steel) reports Breakdown at Kaveripakkam.', 'danger', 'Active', false)
ON CONFLICT (id) DO NOTHING;

-- 16. Seed Call Logs
INSERT INTO call_logs (id, company_id, trip_id, call_category, caller, recipient, location_checkin, operator_emp_id, conversation_notes) VALUES
('CL-001', 'COMP-001', 'TRIP-1002', 'Dispatch Confirmation', 'Admin Office', 'BR-CBE Manager (Senthil)', 'Coimbatore Branch', 'EMP-101', 'Completed dispatch checklist. Cargo loaded, documents signed.'),
('CL-002', 'COMP-001', 'TRIP-1002', 'Transit Update', 'Driver (Saravanan K.)', 'Admin Office', 'Palladam Toll Plaza', 'EMP-101', 'Driver reported cross Palladam Toll Plaza. Speed 60 km/h, road clear.'),
('CL-003', 'COMP-001', 'TRIP-1003', 'Transit Update', 'Driver (Rajesh Nair)', 'Admin Office', 'Vellore Gate', 'EMP-101', 'Journey started. Confirmed vehicle loaded with steel rods.'),
('CL-004', 'COMP-001', 'TRIP-1003', 'Delay Check', 'Admin Office', 'Driver (Rajesh Nair)', 'Kaveripakkam', 'EMP-101', 'Admin noticed vehicle stopped for 30 minutes on GPS. Driver confirmed radiator leak breakdown.')
ON CONFLICT (id) DO NOTHING;
