-- PostgreSQL Seed Script for LCOS System (Clean Production Base)

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
('COMP-001', 'LCOS Central Logistics', 'admin@lcos.internal', NULL, NULL, 'ACTIVE')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 4. Subscription for Company
INSERT INTO subscriptions (id, company_id, plan_id, status, start_date, expiry_date, auto_renew) VALUES
('SUB-1001', 'COMP-001', 'PLAN-PRO', 'ACTIVE', NOW(), NOW() + INTERVAL '1 year', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Operational User Accounts (Password: "password123")
INSERT INTO users (id, company_id, username, email, password_hash, full_name, phone, role, emp_id, status) VALUES
('USR-ADMIN', NULL, 'superadmin', 'superadmin@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'System Super Admin', NULL, 'SUPER_ADMIN', 'SA-001', 'ACTIVE'),
('USR-OWNER', 'COMP-001', 'owner', 'owner@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Executive Owners HQ', NULL, 'OWNER', 'OWN-101', 'ACTIVE'),
('USR-MANAGER', 'COMP-001', 'manager', 'manager@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Branch Manager Supervisor', NULL, 'BRANCH_MANAGER', 'MGR-101', 'ACTIVE'),
('USR-TRACKING', 'COMP-001', 'tracking', 'tracking@lcos.com', '$2a$10$wM3J4sEwN7e8K0eL6f.g2.oT7r1Z1v3z4w5x6y7z8a9b0c1d2e3f4', 'Tracking Team Operator', NULL, 'TRACKING_TEAM', 'EMP-101', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- 6. Core Regional Branches (District names & Coordinates)
INSERT INTO branches (id, company_id, name, manager_name, phone, x_coord, y_coord, lat, lng) VALUES
('BR-CHE', 'COMP-001', 'Chennai', NULL, NULL, 82, 15, 13.0827, 80.2707),
('BR-CBE', 'COMP-001', 'Coimbatore', NULL, NULL, 20, 55, 11.0168, 76.9558),
('BR-MDU', 'COMP-001', 'Madurai', NULL, NULL, 42, 70, 9.9252, 78.1198),
('BR-TRY', 'COMP-001', 'Tiruchirappalli', NULL, NULL, 52, 55, 10.7905, 78.7047),
('BR-SAL', 'COMP-001', 'Salem', NULL, NULL, 45, 40, 11.6643, 78.1460),
('BR-VEL', 'COMP-001', 'Vellore', NULL, NULL, 68, 22, 12.9165, 79.1325),
('BR-ERD', 'COMP-001', 'Erode', NULL, NULL, 35, 48, 11.3410, 77.7172),
('BR-TEN', 'COMP-001', 'Tirunelveli', NULL, NULL, 35, 85, 8.7139, 77.7567),
('BR-TUT', 'COMP-001', 'Thoothukudi', NULL, NULL, 48, 88, 8.7642, 78.1348),
('BR-DGL', 'COMP-001', 'Dindigul', NULL, NULL, 38, 62, 10.3673, 77.9803),
('BR-CUD', 'COMP-001', 'Cuddalore', NULL, NULL, 72, 38, 11.7480, 79.7714),
('BR-KNC', 'COMP-001', 'Kanchipuram', NULL, NULL, 76, 24, 12.8342, 79.7036),
('BR-VLP', 'COMP-001', 'Villupuram', NULL, NULL, 70, 32, 11.9401, 79.4861),
('BR-NGP', 'COMP-001', 'Nagapattinam', NULL, NULL, 76, 52, 10.7672, 79.8449)
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
