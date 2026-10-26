-- PostgreSQL Seed Script for LCOS System (Clean Production Master)

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

-- 5. Users (Password: "password123" -> hashed bcrypt)
INSERT INTO users (id, company_id, username, email, password_hash, full_name, phone, role, emp_id, status) VALUES
('USR-ADMIN', NULL, 'superadmin', 'superadmin@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'System Super Admin', '+91 99000 00000', 'SUPER_ADMIN', 'SA-001', 'ACTIVE'),
('USR-OWNER', 'COMP-001', 'owner', 'owner@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Executive Owners HQ', '+91 98840 00001', 'OWNER', 'OWN-101', 'ACTIVE'),
('USR-MANAGER', 'COMP-001', 'manager', 'manager@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Branch Manager Supervisor', '+91 98840 00002', 'BRANCH_MANAGER', 'MGR-101', 'ACTIVE'),
('USR-TRACKING', 'COMP-001', 'tracking', 'tracking@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Tracking Team Operator', '+91 98840 00003', 'TRACKING_TEAM', 'EMP-101', 'ACTIVE'),
('USR-DRIVER1', 'COMP-001', 'driver1', 'driver1@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Selvam R.', '+91 98840 12345', 'DRIVER', 'DRV-101', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- 6. Core Regional Branches (38 Districts populated by seedAllDistricts)
INSERT INTO branches (id, company_id, name, manager_name, phone, x_coord, y_coord, lat, lng) VALUES
('BR-CHE', 'COMP-001', 'Chennai', 'Balaji R.', '+91 94412 12345', 82, 15, 13.0827, 80.2707),
('BR-CBE', 'COMP-001', 'Coimbatore', 'Senthil Kumar', '+91 94412 23456', 20, 55, 11.0168, 76.9558),
('BR-MDU', 'COMP-001', 'Madurai', 'Pandian M.', '+91 94412 34567', 42, 70, 9.9252, 78.1198),
('BR-TRY', 'COMP-001', 'Tiruchirappalli', 'Raja Sekhar', '+91 94412 45678', 52, 55, 10.7905, 78.7047),
('BR-SAL', 'COMP-001', 'Salem', 'Venkatachalam K.', '+91 94412 56789', 45, 40, 11.6643, 78.1460),
('BR-VEL', 'COMP-001', 'Vellore', 'Karthikeyan S.', '+91 94412 67890', 68, 22, 12.9165, 79.1325),
('BR-ERD', 'COMP-001', 'Erode', 'Ramasamy P.', '+91 94412 78901', 35, 48, 11.3410, 77.7172),
('BR-TEN', 'COMP-001', 'Tirunelveli', 'Muthu Krishnan', '+91 94412 89012', 35, 85, 8.7139, 77.7567),
('BR-TUT', 'COMP-001', 'Thoothukudi', 'Subbiah V.', '+91 94412 90123', 48, 88, 8.7642, 78.1348),
('BR-DGL', 'COMP-001', 'Dindigul', 'Palanichamy M.', '+91 94412 01234', 38, 62, 10.3673, 77.9803),
('BR-CUD', 'COMP-001', 'Cuddalore', 'Elangovan A.', '+91 94412 11223', 72, 38, 11.7480, 79.7714),
('BR-KNC', 'COMP-001', 'Kanchipuram', 'Srinivasan G.', '+91 94412 22334', 76, 24, 12.8342, 79.7036),
('BR-VLP', 'COMP-001', 'Villupuram', 'Anbarasan T.', '+91 94412 33445', 70, 32, 11.9401, 79.4861),
('BR-NGP', 'COMP-001', 'Nagapattinam', 'Muruganandam K.', '+91 94412 44556', 76, 52, 10.7672, 79.8449)
ON CONFLICT (id) DO NOTHING;

-- 7. Commodities Master
INSERT INTO commodities (id, company_id, name, unit, weight_kg, unit_value) VALUES
('COM-RIC', 'COMP-001', 'Rice', 'Bags', 50, 2000),
('COM-SUG', 'COMP-001', 'Sugar', 'Bags', 50, 2500),
('COM-WHE', 'COMP-001', 'Wheat', 'Bags', 50, 1800),
('COM-PUL', 'COMP-001', 'Pulses', 'Bags', 50, 3200),
('COM-CEM', 'COMP-001', 'Cement', 'Bags', 50, 450),
('COM-STE', 'COMP-001', 'Steel', 'Tons', 1000, 65000)
ON CONFLICT (id) DO NOTHING;

-- 8. Registered Fleet Vehicles (Clean Available Status)
INSERT INTO vehicles (id, company_id, type, capacity_tons, ownership, status, current_lat, current_lng, movement_status) VALUES
('TN-01-AB-1234', 'COMP-001', 'Lorry', 15, 'Self Owned', 'Available', 13.0827, 80.2707, 'STOPPED'),
('TN-37-CD-5678', 'COMP-001', 'Container', 25, 'Logistics Partners', 'Available', 12.9229, 79.3326, 'STOPPED'),
('TN-59-EF-9012', 'COMP-001', 'Mini Truck', 5, 'Self Owned', 'Available', 11.0168, 76.9558, 'STOPPED'),
('TN-02-GH-3456', 'COMP-001', 'Lorry', 15, 'Self Owned', 'Available', 13.0827, 80.2707, 'STOPPED'),
('TN-07-JK-7890', 'COMP-001', 'Container', 22, 'Logistics Partners', 'Available', 10.7905, 78.7047, 'STOPPED'),
('TN-23-LM-1122', 'COMP-001', 'Lorry', 12, 'Self Owned', 'Available', 11.6643, 78.1460, 'STOPPED'),
('TN-30-NP-3344', 'COMP-001', 'Mini Truck', 4, 'Logistics Partners', 'Available', 11.3410, 77.7172, 'STOPPED'),
('TN-45-QR-5566', 'COMP-001', 'Container', 28, 'Self Owned', 'Available', 8.7139, 77.7567, 'STOPPED'),
('TN-69-ST-7788', 'COMP-001', 'Lorry', 16, 'Logistics Partners', 'Available', 8.7274, 78.1580, 'STOPPED'),
('TN-72-UV-9900', 'COMP-001', 'Mini Truck', 6, 'Self Owned', 'Available', 10.3673, 77.9803, 'STOPPED')
ON CONFLICT (id) DO NOTHING;

-- 9. Registered Fleet Drivers (Clean Available Status)
INSERT INTO drivers (id, company_id, user_id, name, license_number, phone, experience_years, performance_score, warnings_count, status, current_lat, current_lng) VALUES
('DRV-101', 'COMP-001', 'USR-DRIVER1', 'Selvam R.', 'DL-TN012015001', '+91 98840 12345', 8, 98, 0, 'Available', 13.0827, 80.2707),
('DRV-102', 'COMP-001', NULL, 'Kumaravel P.', 'DL-TN372018002', '+91 98840 23456', 5, 92, 0, 'Available', 11.0168, 76.9558),
('DRV-103', 'COMP-001', NULL, 'Rajesh Nair', 'DL-TN592012003', '+91 98840 34567', 12, 80, 0, 'Available', 12.9229, 79.3326),
('DRV-104', 'COMP-001', NULL, 'Murugan T.', 'DL-TN022014004', '+91 98840 45678', 10, 95, 0, 'Available', 13.0827, 80.2707),
('DRV-105', 'COMP-001', NULL, 'Saravanan K.', 'DL-TN072020005', '+91 98840 56789', 4, 90, 0, 'Available', 11.1085, 77.3411),
('DRV-106', 'COMP-001', NULL, 'Arumugam M.', 'DL-TN232011006', '+91 98840 67890', 15, 100, 0, 'Available', 10.7905, 78.7047),
('DRV-107', 'COMP-001', NULL, 'Baskaran S.', 'DL-TN302016007', '+91 98840 78901', 7, 85, 0, 'Available', 11.6643, 78.1460),
('DRV-108', 'COMP-001', NULL, 'Kathiravan G.', 'DL-TN452019008', '+91 98840 89012', 6, 94, 0, 'Available', 11.3410, 77.7172),
('DRV-109', 'COMP-001', NULL, 'Paneerselvam K.', 'DL-TN692010009', '919884090123', 18, 99, 0, 'Available', 8.7139, 77.7567),
('DRV-110', 'COMP-001', NULL, 'Vinoth Kumar', 'DL-TN722021010', '919884001234', 3, 88, 0, 'Available', 8.7274, 78.1580),
('DRV-111', 'COMP-001', NULL, 'Teenu', 'DL-TN112023011', '916382897998', 4, 91, 0, 'Available', 12.9165, 79.1325),
('DRV-112', 'COMP-001', NULL, 'sanjeev', 'DL-TN302024012', '7904743468', 5, 96, 0, 'Available', 11.3410, 77.7172)
ON CONFLICT (id) DO NOTHING;

-- 10. Registered Helpers (Clean Available Status)
INSERT INTO helpers (id, company_id, name, phone, role_type, status) VALUES
('HLP-201', 'COMP-001', 'Mani G.', '+91 97760 11223', 'Senior Helper', 'Available'),
('HLP-202', 'COMP-001', 'Sakthi V.', '+91 97760 22334', 'Junior Helper', 'Available'),
('HLP-203', 'COMP-001', 'Loganathan S.', '+91 97760 33445', 'Senior Helper', 'Available'),
('HLP-204', 'COMP-001', 'Velu P.', '+91 97760 44556', 'Junior Helper', 'Available'),
('HLP-205', 'COMP-001', 'Thangaraj K.', '+91 97760 55667', 'Senior Helper', 'Available'),
('HLP-206', 'COMP-001', 'Ramu M.', '+91 97760 66778', 'Junior Helper', 'Available')
ON CONFLICT (id) DO NOTHING;
