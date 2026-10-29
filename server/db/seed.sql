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

-- 6. All 38 District Regional Branches in Tamil Nadu
INSERT INTO branches (id, company_id, name, manager_name, phone, x_coord, y_coord, lat, lng) VALUES
('BR-ARI', 'COMP-001', 'Ariyalur', 'Gopal R.', '+91 94412 11111', 65, 46, 11.1401, 79.0786),
('BR-CGL', 'COMP-001', 'Chengalpattu', 'Devan M.', '+91 94412 11112', 78, 20, 12.6841, 79.9836),
('BR-CHE', 'COMP-001', 'Chennai', 'Balaji R.', '+91 94412 12345', 82, 15, 13.0827, 80.2707),
('BR-CBE', 'COMP-001', 'Coimbatore', 'Senthil Kumar', '+91 94412 23456', 20, 55, 11.0168, 76.9558),
('BR-CUD', 'COMP-001', 'Cuddalore', 'Elangovan A.', '+91 94412 11223', 72, 38, 11.7480, 79.7714),
('BR-DHA', 'COMP-001', 'Dharmapuri', 'Anand K.', '+91 94412 11113', 42, 28, 12.1277, 78.1579),
('BR-DGL', 'COMP-001', 'Dindigul', 'Palanichamy M.', '+91 94412 01234', 38, 62, 10.3673, 77.9803),
('BR-ERD', 'COMP-001', 'Erode', 'Ramasamy P.', '+91 94412 78901', 35, 48, 11.3410, 77.7172),
('BR-KAL', 'COMP-001', 'Kallakurichi', 'Prakash S.', '+91 94412 11114', 58, 35, 11.7384, 78.9639),
('BR-KNC', 'COMP-001', 'Kanchipuram', 'Srinivasan G.', '+91 94412 22334', 76, 24, 12.8342, 79.7036),
('BR-KKI', 'COMP-001', 'Kanyakumari', 'Rajendran T.', '+91 94412 11115', 30, 96, 8.1833, 77.4119),
('BR-KAR', 'COMP-001', 'Karur', 'Murugesan V.', '+91 94412 11116', 42, 52, 10.9601, 78.0766),
('BR-KRI', 'COMP-001', 'Krishnagiri', 'Saravanan N.', '+91 94412 11117', 48, 22, 12.5266, 78.2146),
('BR-MDU', 'COMP-001', 'Madurai', 'Pandian M.', '+91 94412 34567', 42, 70, 9.9252, 78.1198),
('BR-MAY', 'COMP-001', 'Mayiladuthurai', 'Velmurugan K.', '+91 94412 11118', 75, 47, 11.1018, 79.6522),
('BR-NGP', 'COMP-001', 'Nagapattinam', 'Muruganandam K.', '+91 94412 44556', 76, 52, 10.7672, 79.8449),
('BR-NAM', 'COMP-001', 'Namakkal', 'Thangavel R.', '+91 94412 11119', 42, 45, 11.2189, 78.1674),
('BR-NIL', 'COMP-001', 'Nilgiris (Ooty)', 'John Samuel', '+91 94412 11120', 15, 45, 11.4102, 76.6950),
('BR-PER', 'COMP-001', 'Perambalur', 'Govindasamy C.', '+91 94412 11121', 60, 48, 11.2342, 78.8820),
('BR-PUD', 'COMP-001', 'Pudukkottai', 'Chelladurai P.', '+91 94412 11122', 55, 65, 10.3833, 78.8000),
('BR-RAM', 'COMP-001', 'Ramanathapuram', 'Sethupathi S.', '+91 94412 11123', 58, 78, 9.3639, 78.8394),
('BR-RAN', 'COMP-001', 'Ranipet', 'Vijayakumar A.', '+91 94412 11124', 68, 20, 12.9296, 79.3331),
('BR-SAL', 'COMP-001', 'Salem', 'Venkatachalam K.', '+91 94412 56789', 45, 40, 11.6643, 78.1460),
('BR-SIV', 'COMP-001', 'Sivaganga', 'Alagappan M.', '+91 94412 11125', 52, 72, 9.8433, 78.4800),
('BR-TKS', 'COMP-001', 'Tenkasi', 'Sankaralingam K.', '+91 94412 11126', 28, 86, 8.9597, 77.3150),
('BR-THA', 'COMP-001', 'Thanjavur', 'Swaminathan N.', '+91 94412 11127', 68, 55, 10.7870, 79.1378),
('BR-THE', 'COMP-001', 'Theni', 'Veerappan G.', '+91 94412 11128', 30, 68, 10.0104, 77.4768),
('BR-TUT', 'COMP-001', 'Thoothukudi', 'Subbiah V.', '+91 94412 90123', 48, 88, 8.7642, 78.1348),
('BR-TRY', 'COMP-001', 'Tiruchirappalli', 'Raja Sekhar', '+91 94412 45678', 52, 55, 10.7905, 78.7047),
('BR-TEN', 'COMP-001', 'Tirunelveli', 'Muthu Krishnan', '+91 94412 89012', 35, 85, 8.7139, 77.7567),
('BR-TPR', 'COMP-001', 'Tirupathur', 'Mani R.', '+91 94412 11129', 55, 25, 12.4950, 78.5678),
('BR-TUP', 'COMP-001', 'Tiruppur', 'Chinnasamy S.', '+91 94412 11130', 28, 52, 11.1085, 77.3411),
('BR-TVL', 'COMP-001', 'Tiruvallur', 'Harikrishnan D.', '+91 94412 11131', 80, 12, 13.1432, 79.9079),
('BR-TVM', 'COMP-001', 'Tiruvannamalai', 'Dhandapani K.', '+91 94412 11132', 62, 28, 12.2253, 79.0747),
('BR-TVR', 'COMP-001', 'Tiruvarur', 'Selvaraj V.', '+91 94412 11133', 72, 55, 10.7708, 79.6366),
('BR-VEL', 'COMP-001', 'Vellore', 'Karthikeyan S.', '+91 94412 67890', 68, 22, 12.9165, 79.1325),
('BR-VLP', 'COMP-001', 'Villupuram', 'Anbarasan T.', '+91 94412 33445', 70, 32, 11.9401, 79.4861),
('BR-VIR', 'COMP-001', 'Virudhunagar', 'Marimuthu A.', '+91 94412 11134', 38, 76, 9.5872, 77.9514)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng;

-- 7. Commodities Master
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

-- 8. Baseline Warehouse Stock (1000 units for every branch & commodity)
INSERT INTO stock (branch_id, commodity_id, available_qty, in_transit_qty, delivered_qty, pending_qty)
SELECT b.id, c.id, 1000, 0, 0, 0
FROM branches b
CROSS JOIN commodities c
WHERE NOT EXISTS (
  SELECT 1 FROM stock s WHERE s.branch_id = b.id AND s.commodity_id = c.id
);

-- 9. Baseline Manager Requests
INSERT INTO manager_requests (id, company_id, type, request_data, status, submitted_by, created_at) VALUES
('REQ-101', 'COMP-001', 'Add Stock', '{"branchId": "BR-CHE", "commodityId": "COM-CEM", "quantity": 500}'::jsonb, 'Pending', 'USR-TRACKING', NOW() - INTERVAL '2 hours'),
('REQ-102', 'COMP-001', 'Add Driver', '{"name": "Muthuramalingam K.", "license": "DL-TN452022099", "phone": "+91 98422 99887", "experience": 6}'::jsonb, 'Pending', 'USR-TRACKING', NOW() - INTERVAL '1 hour'),
('REQ-103', 'COMP-001', 'Add Vehicle', '{"id": "TN-99-ZZ-5555", "type": "Container", "capacity": 25, "owner": "Logistics Partners"}'::jsonb, 'Pending', 'USR-TRACKING', NOW() - INTERVAL '30 mins')
ON CONFLICT (id) DO NOTHING;

