-- Complete Dummy Dataset for ALL Processes & Workflows in LCOS

-- 1. System Settings (Process: Config & Stoppage Threshold)
INSERT INTO system_settings (key, value) VALUES
('stoppage_threshold_minutes', '20'::jsonb),
('simulation_speed', '60'::jsonb),
('alert_time_threshold_hours', '2'::jsonb),
('currency', '"INR"'::jsonb),
('gst_percentage', '18'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2. SaaS Subscription Plans (Process: SaaS Product Offering)
INSERT INTO subscription_plans (id, name, billing_cycle, price_inr, max_vehicles, max_users, features, is_active) VALUES
('PLAN-BASIC', 'Basic Plan', 'MONTHLY', 4999, 10, 5, '["Real-time GPS Tracking", "Basic Stoppage Alerts", "Call Logging", "Standard Support"]'::jsonb, true),
('PLAN-PRO', 'Professional Plan', 'MONTHLY', 14999, 50, 20, '["Real-time GPS Tracking", "20-Min Stoppage Detection & 3-Strike Escalation", "Full Inventory & Stock Management", "Role-Based Access Control", "24/7 Priority Support", "Custom Reports"]'::jsonb, true),
('PLAN-ENT', 'Enterprise Plan', 'YEARLY', 149999, 500, 100, '["All Professional Features", "Dedicated Account Manager", "Custom Payment Gateway Integration", "Unlimited History Storage", "API & Webhook Access"]'::jsonb, true)
ON CONFLICT (id) DO UPDATE SET price_inr = EXCLUDED.price_inr;

-- 3. Multi-Tenant Companies (Process: Company Registration & SaaS Onboarding)
INSERT INTO companies (id, name, email, phone, address, status) VALUES
('COMP-001', 'Vattara Logistics Pvt Ltd', 'admin@vattaralogistics.com', '+91 44 2819 0000', '100 Mount Road, Guindy, Chennai, Tamil Nadu - 600032', 'ACTIVE'),
('COMP-002', 'TN Express Freight Lines', 'contact@tnexpress.in', '+91 422 245 1122', '45 Trichy Road, Coimbatore, Tamil Nadu - 641018', 'ACTIVE'),
('COMP-003', 'Kongu Heavy Haulers', 'info@konguhaulers.com', '+91 424 222 3344', '12 Brough Road, Erode, Tamil Nadu - 638001', 'ACTIVE'),
('COMP-004', 'Pandian South Transport', 'support@pandiantransport.com', '+91 452 233 4455', '88 Bypass Road, Madurai, Tamil Nadu - 625016', 'ACTIVE'),
('COMP-005', 'Cauvery Delta Cargo', 'dispatch@cauverycargo.org', '+91 431 241 8899', '15 Thillai Nagar, Tiruchirappalli, Tamil Nadu - 620018', 'EXPIRED')
ON CONFLICT (id) DO NOTHING;

-- 4. SaaS Subscriptions Process
INSERT INTO subscriptions (id, company_id, plan_id, status, start_date, expiry_date, auto_renew) VALUES
('SUB-1001', 'COMP-001', 'PLAN-PRO', 'ACTIVE', NOW() - INTERVAL '1 month', NOW() + INTERVAL '11 months', true),
('SUB-1002', 'COMP-002', 'PLAN-PRO', 'ACTIVE', NOW() - INTERVAL '3 months', NOW() + INTERVAL '9 months', true),
('SUB-1003', 'COMP-003', 'PLAN-BASIC', 'ACTIVE', NOW() - INTERVAL '15 days', NOW() + INTERVAL '11 months 15 days', true),
('SUB-1004', 'COMP-004', 'PLAN-ENT', 'ACTIVE', NOW() - INTERVAL '6 months', NOW() + INTERVAL '6 months', true),
('SUB-1005', 'COMP-005', 'PLAN-BASIC', 'EXPIRED', NOW() - INTERVAL '14 months', NOW() - INTERVAL '2 months', false)
ON CONFLICT (id) DO NOTHING;

-- 5. SaaS Payments & Invoices Process
INSERT INTO payments (id, company_id, subscription_id, plan_id, amount, currency, order_id, transaction_ref_id, payment_gateway, status, gateway_response) VALUES
('PAY-1001', 'COMP-001', 'SUB-1001', 'PLAN-PRO', 14999, 'INR', 'order_LCOS_9001', 'pay_LCOS_tx_9001', 'RAZORPAY', 'SUCCESS', '{"method": "UPI", "vpa": "vattara@upi"}'::jsonb),
('PAY-1002', 'COMP-002', 'SUB-1002', 'PLAN-PRO', 14999, 'INR', 'order_LCOS_9002', 'pay_LCOS_tx_9002', 'RAZORPAY', 'SUCCESS', '{"method": "Netbanking", "bank": "HDFC"}'::jsonb),
('PAY-1003', 'COMP-003', 'SUB-1003', 'PLAN-BASIC', 4999, 'INR', 'order_LCOS_9003', 'pay_LCOS_tx_9003', 'CASHFREE', 'SUCCESS', '{"method": "UPI", "vpa": "kongu@upi"}'::jsonb),
('PAY-1004', 'COMP-004', 'SUB-1004', 'PLAN-ENT', 149999, 'INR', 'order_LCOS_9004', 'pay_LCOS_tx_9004', 'RAZORPAY', 'SUCCESS', '{"method": "Corporate Card"}'::jsonb),
('PAY-1005', 'COMP-001', 'SUB-1001', 'PLAN-PRO', 14999, 'INR', 'order_LCOS_9005', 'pay_LCOS_tx_9005_fail', 'RAZORPAY', 'FAILED', '{"error_code": "BAD_REQUEST_PAYMENT_TIMED_OUT"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO invoices (id, company_id, payment_id, invoice_number, amount, tax_amount, total_amount, billing_details, issued_at, status) VALUES
('INV-1001', 'COMP-001', 'PAY-1001', 'INV-2026-0001', 14999, 2700, 17699, '{"companyName": "Vattara Logistics Pvt Ltd", "gstin": "33AAAAA0000A1Z5"}'::jsonb, NOW() - INTERVAL '1 month', 'PAID'),
('INV-1002', 'COMP-002', 'PAY-1002', 'INV-2026-0002', 14999, 2700, 17699, '{"companyName": "TN Express Freight Lines", "gstin": "33BBBBA1111B1Z2"}'::jsonb, NOW() - INTERVAL '3 months', 'PAID'),
('INV-1003', 'COMP-003', 'PAY-1003', 'INV-2026-0003', 4999, 900, 5899, '{"companyName": "Kongu Heavy Haulers", "gstin": "33CCCCA2222C1Z3"}'::jsonb, NOW() - INTERVAL '15 days', 'PAID'),
('INV-1004', 'COMP-004', 'PAY-1004', 'INV-2026-0004', 149999, 26999, 176998, '{"companyName": "Pandian South Transport", "gstin": "33DDDDA3333D1Z4"}'::jsonb, NOW() - INTERVAL '6 months', 'PAID')
ON CONFLICT (id) DO NOTHING;

-- 6. Users Process (All 5 Roles)
INSERT INTO users (id, company_id, username, email, password_hash, full_name, phone, role, emp_id, status) VALUES
('USR-ADMIN', NULL, 'superadmin', 'superadmin@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'System Super Admin', '+91 99000 00000', 'SUPER_ADMIN', 'SA-001', 'ACTIVE'),
('USR-OWNER', 'COMP-001', 'owner', 'owner@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Executive Owners HQ', '+91 98840 00001', 'OWNER', 'OWN-101', 'ACTIVE'),
('USR-MANAGER', 'COMP-001', 'manager', 'manager@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Branch Manager Supervisor', '+91 98840 00002', 'BRANCH_MANAGER', 'MGR-101', 'ACTIVE'),
('USR-TRACKING', 'COMP-001', 'tracking', 'tracking@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Tracking Team Operator', '+91 98840 00003', 'TRACKING_TEAM', 'EMP-101', 'ACTIVE'),
('USR-DRIVER1', 'COMP-001', 'driver1', 'driver1@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Selvam R.', '+91 98840 12345', 'DRIVER', 'DRV-101', 'ACTIVE'),
('USR-DRIVER2', 'COMP-001', 'driver2', 'driver2@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Kumaravel P.', '+91 98840 23456', 'DRIVER', 'DRV-102', 'ACTIVE'),
('USR-DRIVER3', 'COMP-001', 'driver3', 'driver3@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Rajesh Nair', '+91 98840 34567', 'DRIVER', 'DRV-103', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- 7. Branches (Process: Branch Network Management)
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

-- 8. Commodities Process
INSERT INTO commodities (id, company_id, name, unit, weight_kg, unit_value) VALUES
('COM-RIC', 'COMP-001', 'Rice', 'Bags', 50, 2000),
('COM-SUG', 'COMP-001', 'Sugar', 'Bags', 50, 2500),
('COM-WHE', 'COMP-001', 'Wheat', 'Bags', 50, 1800),
('COM-PUL', 'COMP-001', 'Pulses', 'Bags', 50, 3200),
('COM-CEM', 'COMP-001', 'Cement', 'Bags', 50, 450),
('COM-STE', 'COMP-001', 'Steel', 'Tons', 1000, 65000),
('COM-OIL', 'COMP-001', 'Cooking Oil', 'Tins', 15, 2200),
('COM-TEA', 'COMP-001', 'Nilgiri Tea', 'Boxes', 25, 4500),
('COM-COT', 'COMP-001', 'Raw Cotton', 'Bales', 170, 12500),
('COM-TEX', 'COMP-001', 'Textiles & Fabrics', 'Rolls', 40, 8500),
('COM-FER', 'COMP-001', 'Fertilizers', 'Bags', 50, 1200),
('COM-SPR', 'COMP-001', 'Auto Spare Parts', 'Crates', 100, 35000)
ON CONFLICT (id) DO NOTHING;

-- 9. Vehicles Process
INSERT INTO vehicles (id, company_id, type, capacity_tons, ownership, status, current_lat, current_lng, speed_kmh, movement_status, stoppage_start_time) VALUES
('TN-01-AB-1234', 'COMP-001', 'Lorry', 15, 'Self Owned', 'Available', 13.0827, 80.2707, 0, 'STOPPED', NULL),
('TN-37-CD-5678', 'COMP-001', 'Container', 25, 'Logistics Partners', 'In Transit', 12.9229, 79.3326, 0, 'STOPPED', NOW() - INTERVAL '45 minutes'),
('TN-59-EF-9012', 'COMP-001', 'Mini Truck', 5, 'Self Owned', 'In Transit', 11.0168, 76.9558, 55, 'MOVING', NULL),
('TN-02-GH-3456', 'COMP-001', 'Lorry', 15, 'Self Owned', 'Available', 13.0827, 80.2707, 0, 'STOPPED', NULL),
('TN-07-JK-7890', 'COMP-001', 'Container', 22, 'Logistics Partners', 'Available', 10.7905, 78.7047, 0, 'STOPPED', NULL),
('TN-23-LM-1122', 'COMP-001', 'Lorry', 12, 'Self Owned', 'Available', 11.6643, 78.1460, 0, 'STOPPED', NULL),
('TN-30-NP-3344', 'COMP-001', 'Mini Truck', 4, 'Logistics Partners', 'Available', 11.3410, 77.7172, 0, 'STOPPED', NULL),
('TN-45-QR-5566', 'COMP-001', 'Container', 28, 'Self Owned', 'Available', 8.7139, 77.7567, 0, 'STOPPED', NULL),
('TN-69-ST-7788', 'COMP-001', 'Lorry', 16, 'Logistics Partners', 'Available', 8.7274, 78.1580, 0, 'STOPPED', NULL),
('TN-72-UV-9900', 'COMP-001', 'Mini Truck', 6, 'Self Owned', 'Available', 10.3673, 77.9803, 0, 'STOPPED', NULL),
('TN-10-XY-1234', 'COMP-001', 'Lorry', 16, 'Self Owned', 'In Transit', 11.6643, 78.1460, 52, 'MOVING', NULL),
('TN-38-AB-9988', 'COMP-001', 'Container', 24, 'Logistics Partners', 'In Transit', 10.7905, 78.7047, 0, 'STOPPED', NOW() - INTERVAL '35 minutes'),
('TN-58-CD-4455', 'COMP-001', 'Mini Truck', 6, 'Self Owned', 'Available', 9.9252, 78.1198, 0, 'STOPPED', NULL),
('TN-67-EF-1122', 'COMP-001', 'Lorry', 14, 'Logistics Partners', 'In Transit', 11.3410, 77.7172, 45, 'MOVING', NULL),
('TN-88-GH-7766', 'COMP-001', 'Container', 28, 'Self Owned', 'Available', 13.0827, 80.2707, 0, 'STOPPED', NULL)
ON CONFLICT (id) DO NOTHING;

-- 10. Drivers Process
INSERT INTO drivers (id, company_id, user_id, name, license_number, phone, experience_years, performance_score, warnings_count, status, current_lat, current_lng) VALUES
('DRV-101', 'COMP-001', 'USR-DRIVER1', 'Selvam R.', 'DL-TN012015001', '+91 98840 12345', 8, 98, 0, 'Available', 13.0827, 80.2707),
('DRV-102', 'COMP-001', 'USR-DRIVER2', 'Kumaravel P.', 'DL-TN372018002', '+91 98840 23456', 5, 92, 0, 'Available', 11.0168, 76.9558),
('DRV-103', 'COMP-001', 'USR-DRIVER3', 'Rajesh Nair', 'DL-TN592012003', '+91 98840 34567', 12, 80, 1, 'On Trip', 12.9229, 79.3326),
('DRV-104', 'COMP-001', NULL, 'Murugan T.', 'DL-TN022014004', '+91 98840 45678', 10, 95, 0, 'Available', 13.0827, 80.2707),
('DRV-105', 'COMP-001', NULL, 'Saravanan K.', 'DL-TN072020005', '+91 98840 56789', 4, 90, 0, 'On Trip', 11.1085, 77.3411),
('DRV-106', 'COMP-001', NULL, 'Arumugam M.', 'DL-TN232011006', '+91 98840 67890', 15, 100, 0, 'Available', 10.7905, 78.7047),
('DRV-107', 'COMP-001', NULL, 'Baskaran S.', 'DL-TN302016007', '+91 98840 78901', 7, 65, 2, 'Available', 11.6643, 78.1460),
('DRV-108', 'COMP-001', NULL, 'Kathiravan G.', 'DL-TN452019008', '+91 98840 89012', 6, 94, 0, 'Available', 11.3410, 77.7172),
('DRV-109', 'COMP-001', NULL, 'Paneerselvam K.', 'DL-TN692010009', '+91 98840 90123', 18, 99, 0, 'Available', 8.7139, 77.7567),
('DRV-110', 'COMP-001', NULL, 'Vinoth Kumar', 'DL-TN722021010', '+91 98840 01234', 3, 88, 0, 'Available', 8.7274, 78.1580),
('DRV-111', 'COMP-001', NULL, 'Ganesh Moorthy', 'DL-TN102013011', '+91 98840 11122', 11, 96, 0, 'On Trip', 11.6643, 78.1460),
('DRV-112', 'COMP-001', NULL, 'Palanivelu M.', 'DL-TN382017012', '+91 98840 22233', 9, 88, 1, 'On Trip', 10.7905, 78.7047),
('DRV-113', 'COMP-001', NULL, 'Dinesh Kumar', 'DL-TN582021013', '+91 98840 33344', 4, 91, 0, 'Available', 9.9252, 78.1198),
('DRV-114', 'COMP-001', NULL, 'Sundaram P.', 'DL-TN672015014', '+91 98840 44455', 14, 97, 0, 'On Trip', 11.3410, 77.7172),
('DRV-115', 'COMP-001', NULL, 'Vengatadasan K.', 'DL-TN882010015', '+91 98840 55566', 16, 75, 2, 'Suspended', 13.0827, 80.2707)
ON CONFLICT (id) DO NOTHING;

-- 11. Helpers Process
INSERT INTO helpers (id, company_id, name, phone, role_type, status) VALUES
('HLP-201', 'COMP-001', 'Mani G.', '+91 97760 11223', 'Senior Helper', 'Available'),
('HLP-202', 'COMP-001', 'Sakthi V.', '+91 97760 22334', 'Junior Helper', 'On Trip'),
('HLP-203', 'COMP-001', 'Loganathan S.', '+91 97760 33445', 'Senior Helper', 'Available'),
('HLP-204', 'COMP-001', 'Velu P.', '+91 97760 44556', 'Junior Helper', 'Available'),
('HLP-205', 'COMP-001', 'Thangaraj K.', '+91 97760 55667', 'Senior Helper', 'Available'),
('HLP-206', 'COMP-001', 'Ramu M.', '+91 97760 66778', 'Junior Helper', 'Available'),
('HLP-207', 'COMP-001', 'Kannan S.', '+91 97760 77889', 'Senior Helper', 'On Trip'),
('HLP-208', 'COMP-001', 'Dass M.', '+91 97760 88990', 'Junior Helper', 'On Trip'),
('HLP-209', 'COMP-001', 'Prakash R.', '+91 97760 99001', 'Senior Helper', 'Available')
ON CONFLICT (id) DO NOTHING;

-- 12. Stock Inventory Process (Seeded across all branches for all commodities)
INSERT INTO stock (branch_id, commodity_id, available_qty, in_transit_qty, delivered_qty, pending_qty) VALUES
('BR-CHE', 'COM-RIC', 1300, 0, 0, 200),
('BR-CHE', 'COM-SUG', 1500, 0, 0, 0),
('BR-CHE', 'COM-OIL', 800, 150, 400, 0),
('BR-CHE', 'COM-TEA', 500, 0, 250, 0),
('BR-CBE', 'COM-CEM', 900, 0, 0, 0),
('BR-CBE', 'COM-COT', 400, 200, 600, 0),
('BR-CBE', 'COM-TEX', 350, 100, 500, 0),
('BR-SAL', 'COM-CEM', 300, 300, 0, 0),
('BR-SAL', 'COM-OIL', 600, 0, 300, 0),
('BR-VEL', 'COM-STE', 18, 0, 0, 0),
('BR-VEL', 'COM-TEA', 300, 50, 150, 0),
('BR-KNC', 'COM-STE', 10, 12, 0, 0),
('BR-TRY', 'COM-PUL', 350, 0, 0, 0),
('BR-TRY', 'COM-SPR', 80, 20, 120, 0),
('BR-CBE', 'COM-PUL', 550, 0, 150, 0),
('BR-MDU', 'COM-FER', 1200, 300, 900, 100),
('BR-ERD', 'COM-TEX', 900, 150, 800, 0),
('BR-TEN', 'COM-FER', 750, 0, 500, 0)
ON CONFLICT (branch_id, commodity_id) DO UPDATE
SET available_qty = EXCLUDED.available_qty,
    in_transit_qty = EXCLUDED.in_transit_qty,
    delivered_qty = EXCLUDED.delivered_qty,
    pending_qty = EXCLUDED.pending_qty;

-- 13. Shipment / Trip Lifecycle Process (Covering ALL 12 Steps in the Progress Stepper!)
INSERT INTO trips (id, company_id, dispatch_id, commodity_id, quantity, source_branch_id, destination_branch_id, vehicle_id, driver_id, helper_id, created_by_emp_id, dispatch_date, expected_delivery_date, status, checklists, transit_updates, delivery_info, last_update_timestamp) VALUES

-- Trip Step 1: CREATED (Draft)
('TRIP-1001', 'COMP-001', 'DISP-2001', 'COM-RIC', 200, 'BR-CHE', 'BR-MDU', 'TN-01-AB-1234', 'DRV-101', 'HLP-201', 'EMP-101', NOW(), NOW() + INTERVAL '8 hours', 'CREATED', '{"dispatch": {"loaded": false, "verified": false, "vehicleReady": false, "driverAvailable": false}, "delivery": {"quantityMatches": false, "damagesChecked": false, "missingChecked": false, "conditionOk": false}}'::jsonb, '[]'::jsonb, NULL, NOW()),

-- Trip Step 2: DISPATCH_APPROVED
('TRIP-1010', 'COMP-001', 'DISP-2010', 'COM-SUG', 250, 'BR-CHE', 'BR-CBE', 'TN-02-GH-3456', 'DRV-104', 'HLP-204', 'EMP-101', NOW() - INTERVAL '30 minutes', NOW() + INTERVAL '7 hours 30 mins', 'DISPATCH_APPROVED', '{"dispatch": {"loaded": true, "verified": true, "vehicleReady": false, "driverAvailable": false}, "delivery": {"quantityMatches": false, "damagesChecked": false, "missingChecked": false, "conditionOk": false}}'::jsonb, '[]'::jsonb, NULL, NOW() - INTERVAL '15 minutes'),

-- Trip Step 3: DRIVER_CALLED
('TRIP-1011', 'COMP-001', 'DISP-2011', 'COM-WHE', 180, 'BR-CBE', 'BR-TRY', 'TN-23-LM-1122', 'DRV-106', 'HLP-205', 'EMP-101', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '5 hours', 'DRIVER_CALLED', '{"dispatch": {"loaded": true, "verified": true, "vehicleReady": true, "driverAvailable": false}, "delivery": {"quantityMatches": false, "damagesChecked": false, "missingChecked": false, "conditionOk": false}}'::jsonb, '[]'::jsonb, NULL, NOW() - INTERVAL '20 minutes'),

-- Trip Step 4: DRIVER_CONFIRMED
('TRIP-1012', 'COMP-001', 'DISP-2012', 'COM-FER', 300, 'BR-TRY', 'BR-MDU', 'TN-30-NP-3344', 'DRV-108', 'HLP-206', 'EMP-101', NOW() - INTERVAL '45 minutes', NOW() + INTERVAL '3 hours 15 mins', 'DRIVER_CONFIRMED', '{"dispatch": {"loaded": true, "verified": true, "vehicleReady": true, "driverAvailable": true}, "delivery": {"quantityMatches": false, "damagesChecked": false, "missingChecked": false, "conditionOk": false}}'::jsonb, '[]'::jsonb, NULL, NOW() - INTERVAL '10 minutes'),

-- Trip Step 5 & 6: IN_TRANSIT
('TRIP-1002', 'COMP-001', 'DISP-2002', 'COM-CEM', 300, 'BR-CBE', 'BR-SAL', 'TN-59-EF-9012', 'DRV-105', 'HLP-202', 'EMP-101', NOW() - INTERVAL '2 hours', NOW() + INTERVAL '2 hours', 'IN_TRANSIT', '{"dispatch": {"loaded": true, "verified": true, "vehicleReady": true, "driverAvailable": true}, "delivery": {"quantityMatches": false, "damagesChecked": false, "missingChecked": false, "conditionOk": false}}'::jsonb, '[{"timestamp": "2026-10-05T13:45:00+05:30", "location": "Palladam Toll Plaza, NH-81", "condition": "Good", "status": "IN_TRANSIT", "delayReason": "", "remarks": "Vehicle moving smoothly."}]'::jsonb, NULL, NOW() - INTERVAL '20 minutes'),
('TRIP-1005', 'COMP-001', 'DISP-2005', 'COM-COT', 200, 'BR-CBE', 'BR-CHE', 'TN-10-XY-1234', 'DRV-111', 'HLP-207', 'EMP-101', NOW() - INTERVAL '4 hours', NOW() + INTERVAL '4 hours', 'IN_TRANSIT', '{"dispatch": {"loaded": true, "verified": true, "vehicleReady": true, "driverAvailable": true}, "delivery": {"quantityMatches": false, "damagesChecked": false, "missingChecked": false, "conditionOk": false}}'::jsonb, '[{"timestamp": "2026-10-05T11:30:00+05:30", "location": "Salem Highway NH-44", "condition": "Good", "status": "IN_TRANSIT", "delayReason": "", "remarks": "Cruising smoothly at 55 km/h."}]'::jsonb, NULL, NOW() - INTERVAL '30 minutes'),
('TRIP-1007', 'COMP-001', 'DISP-2007', 'COM-TEX', 100, 'BR-ERD', 'BR-MDU', 'TN-67-EF-1122', 'DRV-114', NULL, 'EMP-101', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '5 hours', 'IN_TRANSIT', '{"dispatch": {"loaded": true, "verified": true, "vehicleReady": true, "driverAvailable": true}, "delivery": {"quantityMatches": false, "damagesChecked": false, "missingChecked": false, "conditionOk": false}}'::jsonb, '[{"timestamp": "2026-10-05T13:30:00+05:30", "location": "Dindigul Bypass", "condition": "Good", "status": "IN_TRANSIT", "delayReason": "", "remarks": "Weather clear, moving at normal speed."}]'::jsonb, NULL, NOW() - INTERVAL '10 minutes'),

-- Trip Step 7: DELAYED (Breakdown & Stoppage Incidents)
('TRIP-1003', 'COMP-001', 'DISP-2003', 'COM-STE', 12, 'BR-VEL', 'BR-KNC', 'TN-37-CD-5678', 'DRV-103', NULL, 'EMP-101', NOW() - INTERVAL '3 hours', NOW() + INTERVAL '1 hour', 'DELAYED', '{"dispatch": {"loaded": true, "verified": true, "vehicleReady": true, "driverAvailable": true}, "delivery": {"quantityMatches": false, "damagesChecked": false, "missingChecked": false, "conditionOk": false}}'::jsonb, '[{"timestamp": "2026-10-05T13:00:00+05:30", "location": "Kaveripakkam (Stopped)", "condition": "Minor Issue", "status": "DELAYED", "delayReason": "Breakdown", "remarks": "Engine overheating. Driver stopped on highway."}]'::jsonb, NULL, NOW() - INTERVAL '45 minutes'),
('TRIP-1006', 'COMP-001', 'DISP-2006', 'COM-OIL', 150, 'BR-CHE', 'BR-SAL', 'TN-38-AB-9988', 'DRV-112', 'HLP-208', 'EMP-101', NOW() - INTERVAL '5 hours', NOW() + INTERVAL '1 hour', 'DELAYED', '{"dispatch": {"loaded": true, "verified": true, "vehicleReady": true, "driverAvailable": true}, "delivery": {"quantityMatches": false, "damagesChecked": false, "missingChecked": false, "conditionOk": false}}'::jsonb, '[{"timestamp": "2026-10-05T13:15:00+05:30", "location": "Ulundurpet Toll Plaza (Stopped)", "condition": "Minor Issue", "status": "DELAYED", "delayReason": "Stoppage Detected", "remarks": "Vehicle stopped for over 35 minutes near toll booth. Operator calling driver."}]'::jsonb, NULL, NOW() - INTERVAL '15 minutes'),

-- Trip Step 8: ARRIVED
('TRIP-1008', 'COMP-001', 'DISP-2008', 'COM-TEA', 50, 'BR-VEL', 'BR-CHE', 'TN-88-GH-7766', 'DRV-102', 'HLP-209', 'EMP-101', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '1 hour', 'ARRIVED', '{"dispatch": {"loaded": true, "verified": true, "vehicleReady": true, "driverAvailable": true}, "delivery": {"quantityMatches": false, "damagesChecked": false, "missingChecked": false, "conditionOk": false}}'::jsonb, '[{"timestamp": "2026-10-05T13:00:00+05:30", "location": "Chennai Warehouse Gate 3", "condition": "Good", "status": "ARRIVED", "delayReason": "", "remarks": "Arrived at destination warehouse. Waiting for manager unloading verification."}]'::jsonb, NULL, NOW() - INTERVAL '40 minutes'),

-- Trip Step 9 & 10 & 11: CLOSED (Delivered with Digital Receipt)
('TRIP-1004', 'COMP-001', 'DISP-2004', 'COM-PUL', 150, 'BR-TRY', 'BR-CBE', 'TN-07-JK-7890', 'DRV-106', 'HLP-203', 'EMP-101', NOW() - INTERVAL '1 day', NOW() - INTERVAL '18 hours', 'CLOSED', '{"dispatch": {"loaded": true, "verified": true, "vehicleReady": true, "driverAvailable": true}, "delivery": {"quantityMatches": true, "damagesChecked": true, "missingChecked": true, "conditionOk": true}}'::jsonb, '[]'::jsonb, '{"receivedQuantity": 150, "damagesCount": 0, "missingCount": 0, "condition": "Good", "receiverName": "Senthil Kumar (CBE Mgr)", "receiptNumber": "RCPT-9004", "closedTimestamp": "2026-10-04T21:15:00+05:30"}'::jsonb, NOW() - INTERVAL '18 hours'),

-- Trip Step 12: COMPLETED_RETURN
('TRIP-1009', 'COMP-001', 'DISP-2009', 'COM-SPR', 20, 'BR-TRY', 'BR-CBE', 'TN-45-QR-5566', 'DRV-109', NULL, 'EMP-101', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', 'COMPLETED_RETURN', '{"dispatch": {"loaded": true, "verified": true, "vehicleReady": true, "driverAvailable": true}, "delivery": {"quantityMatches": true, "damagesChecked": true, "missingChecked": true, "conditionOk": true}}'::jsonb, '[]'::jsonb, '{"receivedQuantity": 20, "damagesCount": 0, "missingCount": 0, "condition": "Good", "receiverName": "Senthil Kumar", "receiptNumber": "RCPT-9009", "closedTimestamp": "2026-10-03T18:00:00+05:30"}'::jsonb, NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- 14. GPS Live Tracking & History Process (Populate GPS Coordinate Trail)
INSERT INTO gps_tracking_records (vehicle_id, driver_id, trip_id, latitude, longitude, speed_kmh, heading, movement_status, recorded_at) VALUES
('TN-59-EF-9012', 'DRV-105', 'TRIP-1002', 11.0168, 76.9558, 55, 90, 'MOVING', NOW() - INTERVAL '5 minutes'),
('TN-59-EF-9012', 'DRV-105', 'TRIP-1002', 11.0150, 76.9500, 58, 92, 'MOVING', NOW() - INTERVAL '10 minutes'),
('TN-10-XY-1234', 'DRV-111', 'TRIP-1005', 11.6643, 78.1460, 52, 45, 'MOVING', NOW() - INTERVAL '15 minutes'),
('TN-38-AB-9988', 'DRV-112', 'TRIP-1006', 10.7905, 78.7047, 0, 0, 'STOPPED', NOW() - INTERVAL '35 minutes'),
('TN-37-CD-5678', 'DRV-103', 'TRIP-1003', 12.9229, 79.3326, 0, 0, 'STOPPED', NOW() - INTERVAL '45 minutes')
ON CONFLICT (id) DO NOTHING;

-- 15. Alerts & 3-Strike Escalation Process
INSERT INTO alerts (id, company_id, trip_id, vehicle_id, driver_id, type, message, severity, status, stoppage_duration_minutes, escalated, escalated_to_role, escalated_at, created_at) VALUES
('ALT-101', 'COMP-001', 'TRIP-1003', 'TN-37-CD-5678', 'DRV-103', 'Breakdown', 'Trip TRIP-1003 (Steel) reports Breakdown at Kaveripakkam.', 'danger', 'Active', 0, false, NULL, NULL, NOW() - INTERVAL '45 minutes'),
('ALT-102', 'COMP-001', 'TRIP-1006', 'TN-38-AB-9988', 'DRV-112', 'Stoppage Detected', 'AUTOMATIC DETECTED: Vehicle TN-38-AB-9988 (Palanivelu M.) stopped at Ulundurpet Toll Plaza for over 35 minutes! (Threshold: 20 mins)', 'warning', 'Active', 35, false, NULL, NULL, NOW() - INTERVAL '35 minutes'),
('ALT-103', 'COMP-001', 'TRIP-1005', 'TN-10-XY-1234', 'DRV-111', 'Traffic Jam', 'Heavy vehicular congestion reported near Salem bypass road.', 'info', 'Resolved', 0, false, NULL, NULL, NOW() - INTERVAL '2 hours'),
('ALT-104', 'COMP-001', NULL, 'TN-88-GH-7766', 'DRV-115', 'Unreachable', 'GPS heartbeat link lost for driver Vengatadasan K. 3-strike escalation initiated.', 'danger', 'Escalated', 0, true, 'OWNER', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '3 hours')
ON CONFLICT (id) DO NOTHING;

-- Alert Escalation Responses History (3 Strikes Recorded)
INSERT INTO alert_responses (alert_id, responder_user_id, action_taken, notes, driver_response, escalation_level, created_at) VALUES
('ALT-104', 'USR-TRACKING', 'Attempt 1 Outgoing Call', 'Called driver Vengatadasan K. Phone ringing, no answer.', 'No Answer', 1, NOW() - INTERVAL '3 hours'),
('ALT-104', 'USR-TRACKING', 'Attempt 2 Outgoing Call', 'Re-attempted call after 1 hour. Line busy / unanswered.', 'No Answer', 2, NOW() - INTERVAL '2 hours'),
('ALT-104', 'USR-TRACKING', 'Attempt 3 Outgoing Call (3 Strikes)', '3-Strike limit reached! Warning added to driver profile, performance reduced by 15. Escalated to Owner.', 'No Answer', 3, NOW() - INTERVAL '1 hour')
ON CONFLICT (id) DO NOTHING;

-- 16. Operator Call Logs Process
INSERT INTO call_logs (id, company_id, trip_id, call_category, caller, recipient, location_checkin, operator_emp_id, conversation_notes, created_at) VALUES
('CL-001', 'COMP-001', 'TRIP-1002', 'Dispatch Confirmation', 'Admin Office', 'BR-CBE Manager (Senthil)', 'Coimbatore Branch', 'EMP-101', 'Completed dispatch checklist. Cargo loaded, documents signed.', NOW() - INTERVAL '2 hours'),
('CL-002', 'COMP-001', 'TRIP-1002', 'Transit Update', 'Driver (Saravanan K.)', 'Admin Office', 'Palladam Toll Plaza', 'EMP-101', 'Driver reported cross Palladam Toll Plaza. Speed 60 km/h, road clear.', NOW() - INTERVAL '1 hour 30 mins'),
('CL-003', 'COMP-001', 'TRIP-1003', 'Transit Update', 'Driver (Rajesh Nair)', 'Admin Office', 'Vellore Gate', 'EMP-101', 'Journey started. Confirmed vehicle loaded with steel rods.', NOW() - INTERVAL '3 hours'),
('CL-004', 'COMP-001', 'TRIP-1003', 'Delay Check', 'Admin Office', 'Driver (Rajesh Nair)', 'Kaveripakkam', 'EMP-101', 'Admin noticed vehicle stopped for 30 minutes on GPS. Driver confirmed radiator leak breakdown.', NOW() - INTERVAL '45 mins'),
('CL-009', 'COMP-001', 'TRIP-1005', 'Transit Update', 'Driver (Ganesh Moorthy)', 'Admin Office', 'Salem Highway', 'EMP-101', 'Driver confirmed crossing Salem. Vehicle running fine, speed 55 km/h.', NOW() - INTERVAL '30 mins'),
('CL-010', 'COMP-001', 'TRIP-1006', 'Delay Check', 'Admin Office', 'Driver (Palanivelu M.)', 'Ulundurpet Toll', 'EMP-101', 'Called driver regarding 35-min stoppage. Driver reported tire pressure check at highway bunk.', NOW() - INTERVAL '15 mins'),
('CL-011', 'COMP-001', 'TRIP-1008', 'Arrival Update', 'Driver (Kumaravel P.)', 'Admin Office', 'Chennai Branch', 'EMP-101', 'Driver reported arrival at Chennai warehouse gate. Handed docs to Branch Manager Balaji R.', NOW() - INTERVAL '40 mins'),
('CL-012', 'COMP-001', 'TRIP-1004', 'Delivery Confirmation', 'Admin Office', 'BR-CBE Manager (Senthil)', 'Coimbatore Branch', 'EMP-101', 'Manager confirmed complete receipt of 150 bags. Zero damage logged.', NOW() - INTERVAL '18 hours')
ON CONFLICT (id) DO NOTHING;

-- 17. Manager Requests Process (Pending & Approved Supervisor Actions)
INSERT INTO manager_requests (id, company_id, type, request_data, status, submitted_by, created_at) VALUES
('REQ-101', 'COMP-001', 'Add Driver', '{"name": "Muthuramalingam K.", "license": "DL-TN452022099", "phone": "+91 98422 99887", "experience": 6}'::jsonb, 'Pending', 'USR-TRACKING', NOW() - INTERVAL '2 hours'),
('REQ-102', 'COMP-001', 'Add Vehicle', '{"id": "TN-99-ZZ-5555", "type": "Container", "capacity": 25, "owner": "Logistics Partners"}'::jsonb, 'Pending', 'USR-TRACKING', NOW() - INTERVAL '1 hour'),
('REQ-103', 'COMP-001', 'Add Stock', '{"branchId": "BR-CHE", "commodityId": "COM-RIC", "quantity": 500}'::jsonb, 'Approved', 'USR-TRACKING', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- 18. Notifications Process
INSERT INTO notifications (company_id, user_id, title, message, type, is_read, created_at) VALUES
('COMP-001', 'USR-TRACKING', 'Stoppage Alert: TN-38-AB-9988', 'AUTOMATIC DETECTED: Vehicle TN-38-AB-9988 stopped at Ulundurpet Toll Plaza for over 35 minutes!', 'STOPPAGE', false, NOW() - INTERVAL '35 minutes'),
('COMP-001', 'USR-TRACKING', 'Breakdown Incident Reported', 'Vehicle TN-37-CD-5678 reported radiator breakdown near Kaveripakkam.', 'ALERT', false, NOW() - INTERVAL '45 minutes'),
('COMP-001', 'USR-OWNER', 'SaaS Payment Receipt Issued', 'Payment of INR 14,999 for Professional Plan succeeded. Invoice INV-2026-0001 available.', 'PAYMENT', true, NOW() - INTERVAL '1 month')
ON CONFLICT (id) DO NOTHING;

-- 19. Audit Logs Process
INSERT INTO audit_logs (company_id, user_id, user_role, action, resource, details, ip_address, created_at) VALUES
('COMP-001', 'USR-ADMIN', 'SUPER_ADMIN', 'UPDATE_SETTING', 'system_settings', '{"key": "stoppage_threshold_minutes", "value": 20}'::jsonb, '127.0.0.1', NOW() - INTERVAL '2 days'),
('COMP-001', 'USR-TRACKING', 'TRACKING_TEAM', 'CREATE_TRIP', 'trips', '{"tripId": "TRIP-1005", "commodity": "COM-COT"}'::jsonb, '127.0.0.1', NOW() - INTERVAL '4 hours'),
('COMP-001', 'USR-MANAGER', 'BRANCH_MANAGER', 'APPROVE_REQUEST', 'manager_requests', '{"reqId": "REQ-103"}'::jsonb, '127.0.0.1', NOW() - INTERVAL '1 day'),
('COMP-001', 'USR-TRACKING', 'TRACKING_TEAM', 'LOG_CALL', 'call_logs', '{"callId": "CL-010", "category": "Delay Check"}'::jsonb, '127.0.0.1', NOW() - INTERVAL '15 minutes');

-- 20. Return Load / Backload Management Hub Dummy Data
-- Closed Trips (Lorries stationed at Destination Branches awaiting return loads)
INSERT INTO trips (id, company_id, dispatch_id, commodity_id, quantity, source_branch_id, destination_branch_id, vehicle_id, driver_id, helper_id, created_by_emp_id, dispatch_date, expected_delivery_date, status, delivery_info, created_at, updated_at) VALUES
('TRIP-3001', 'COMP-001', 'DISP-3001', 'COM-RIC', 100, 'BR-CHE', 'BR-MDU', 'TN-01-AB-1234', 'DRV-101', 'HLP-201', 'EMP-101', NOW() - INTERVAL '1 day', NOW() - INTERVAL '4 hours', 'CLOSED', '{"receivedQuantity": 100, "damagesCount": 0, "missingCount": 0, "condition": "Good", "receiverName": "Pandian M.", "receiptNumber": "RCPT-3001", "returnMatchingInfo": {"hasReturnLoad": false, "statusText": "Awaiting Backload"}}'::jsonb, NOW() - INTERVAL '1 day', NOW() - INTERVAL '4 hours'),
('TRIP-3002', 'COMP-001', 'DISP-3002', 'COM-STE', 50, 'BR-CBE', 'BR-SAL', 'TN-59-EF-9012', 'DRV-103', 'HLP-202', 'EMP-101', NOW() - INTERVAL '18 hours', NOW() - INTERVAL '2 hours', 'CLOSED', '{"receivedQuantity": 50, "damagesCount": 0, "missingCount": 0, "condition": "Good", "receiverName": "Venkatachalam K.", "receiptNumber": "RCPT-3002", "returnMatchingInfo": {"hasReturnLoad": false, "statusText": "Awaiting Backload"}}'::jsonb, NOW() - INTERVAL '18 hours', NOW() - INTERVAL '2 hours'),
('TRIP-3003', 'COMP-001', 'DISP-3003', 'COM-SUG', 200, 'BR-TRY', 'BR-TUT', 'TN-38-AB-9988', 'DRV-104', 'HLP-203', 'EMP-101', NOW() - INTERVAL '12 hours', NOW() - INTERVAL '1 hour', 'CLOSED', '{"receivedQuantity": 200, "damagesCount": 0, "missingCount": 0, "condition": "Good", "receiverName": "Subbiah V.", "receiptNumber": "RCPT-3003", "returnMatchingInfo": {"hasReturnLoad": false, "statusText": "Awaiting Backload"}}'::jsonb, NOW() - INTERVAL '12 hours', NOW() - INTERVAL '1 hour')
ON CONFLICT (id) DO NOTHING;

-- Pending Outbound Return Cargo Requests Seeking Return Lorries
INSERT INTO trips (id, company_id, dispatch_id, commodity_id, quantity, source_branch_id, destination_branch_id, vehicle_id, driver_id, helper_id, created_by_emp_id, dispatch_date, expected_delivery_date, status, created_at, updated_at) VALUES
('TRIP-3010', 'COMP-001', 'DISP-3010', 'COM-WHE', 150, 'BR-MDU', 'BR-CHE', 'TN-01-AB-1234', 'DRV-101', 'HLP-201', 'EMP-101', NOW(), NOW() + INTERVAL '8 hours', 'CREATED', NOW() - INTERVAL '30 mins', NOW() - INTERVAL '30 mins'),
('TRIP-3011', 'COMP-001', 'DISP-3011', 'COM-STE', 80, 'BR-SAL', 'BR-CBE', 'TN-59-EF-9012', 'DRV-103', 'HLP-202', 'EMP-101', NOW(), NOW() + INTERVAL '6 hours', 'CREATED', NOW() - INTERVAL '20 mins', NOW() - INTERVAL '20 mins'),
('TRIP-3012', 'COMP-001', 'DISP-3012', 'COM-PUL', 120, 'BR-TUT', 'BR-TRY', 'TN-38-AB-9988', 'DRV-104', 'HLP-203', 'EMP-101', NOW(), NOW() + INTERVAL '7 hours', 'CREATED', NOW() - INTERVAL '10 mins', NOW() - INTERVAL '10 mins')
ON CONFLICT (id) DO NOTHING;


