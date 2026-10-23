-- PostgreSQL Schema for Logistics Operations Control System (LCOS)

-- 1. System Settings
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Companies (SaaS Multi-tenant support)
CREATE TABLE IF NOT EXISTS companies (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    address TEXT,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Users & Roles
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL, -- 'SUPER_ADMIN', 'OWNER', 'TRACKING_TEAM', 'DRIVER', 'BRANCH_MANAGER'
    emp_id VARCHAR(50),
    status VARCHAR(50) DEFAULT 'ACTIVE',
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Branches
CREATE TABLE IF NOT EXISTS branches (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'BR-CHE'
    company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    manager_name VARCHAR(255),
    phone VARCHAR(50),
    x_coord INT DEFAULT 50,
    y_coord INT DEFAULT 50,
    lat NUMERIC,
    lng NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Commodities
CREATE TABLE IF NOT EXISTS commodities (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'COM-RIC'
    company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(50) NOT NULL, -- Bags, Tons, Boxes
    weight_kg NUMERIC NOT NULL,
    unit_value NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Vehicles
CREATE TABLE IF NOT EXISTS vehicles (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'TN-01-AB-1234'
    company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'Lorry', 'Container', 'Mini Truck'
    capacity_tons NUMERIC NOT NULL,
    ownership VARCHAR(50) NOT NULL, -- 'Self Owned', 'Logistics Partners'
    status VARCHAR(50) DEFAULT 'Available', -- 'Available', 'In Transit', 'Maintenance'
    device_key VARCHAR(255),
    current_lat NUMERIC DEFAULT 13.0827,
    current_lng NUMERIC DEFAULT 80.2707,
    speed_kmh NUMERIC DEFAULT 0,
    heading NUMERIC DEFAULT 0,
    movement_status VARCHAR(50) DEFAULT 'STOPPED', -- 'MOVING', 'STOPPED', 'IDLE'
    stoppage_start_time TIMESTAMPTZ,
    last_gps_update TIMESTAMPTZ DEFAULT NOW(),
    last_ping_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Drivers
CREATE TABLE IF NOT EXISTS drivers (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'DRV-101'
    company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
    user_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    license_number VARCHAR(100) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    experience_years INT DEFAULT 1,
    performance_score INT DEFAULT 100,
    warnings_count INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'Available', -- 'Available', 'On Trip', 'Suspended', 'Blacklisted'
    current_lat NUMERIC,
    current_lng NUMERIC,
    last_location_update TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Helpers
CREATE TABLE IF NOT EXISTS helpers (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'HLP-201'
    company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    role_type VARCHAR(50) DEFAULT 'Senior Helper',
    status VARCHAR(50) DEFAULT 'Available',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Stock Distribution
CREATE TABLE IF NOT EXISTS stock (
    branch_id VARCHAR(50) REFERENCES branches(id) ON DELETE CASCADE,
    commodity_id VARCHAR(50) REFERENCES commodities(id) ON DELETE CASCADE,
    available_qty NUMERIC DEFAULT 0,
    in_transit_qty NUMERIC DEFAULT 0,
    delivered_qty NUMERIC DEFAULT 0,
    pending_qty NUMERIC DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (branch_id, commodity_id)
);

-- 10. Trips & Shipments
CREATE TABLE IF NOT EXISTS trips (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'TRIP-1001'
    company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
    dispatch_id VARCHAR(50),
    commodity_id VARCHAR(50) REFERENCES commodities(id),
    quantity NUMERIC NOT NULL,
    source_branch_id VARCHAR(50) REFERENCES branches(id),
    destination_branch_id VARCHAR(50) REFERENCES branches(id),
    vehicle_id VARCHAR(50) REFERENCES vehicles(id),
    driver_id VARCHAR(50) REFERENCES drivers(id),
    helper_id VARCHAR(50) REFERENCES helpers(id),
    created_by_emp_id VARCHAR(50),
    dispatch_date TIMESTAMPTZ DEFAULT NOW(),
    expected_delivery_date TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'CREATED', -- 'CREATED', 'DISPATCH_APPROVED', 'IN_TRANSIT', 'DELAYED', 'ARRIVED', 'DELIVERY_CONFIRMED', 'CLOSED', 'COMPLETED_RETURN'
    checklists JSONB DEFAULT '{}'::jsonb,
    transit_updates JSONB DEFAULT '[]'::jsonb,
    delivery_info JSONB,
    arriving_notified BOOLEAN DEFAULT FALSE,
    last_update_timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. GPS Location Records & History
CREATE TABLE IF NOT EXISTS gps_tracking_records (
    id BIGSERIAL PRIMARY KEY,
    vehicle_id VARCHAR(50) REFERENCES vehicles(id) ON DELETE CASCADE,
    driver_id VARCHAR(50) REFERENCES drivers(id) ON DELETE SET NULL,
    trip_id VARCHAR(50) REFERENCES trips(id) ON DELETE SET NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    speed_kmh NUMERIC DEFAULT 0,
    heading NUMERIC DEFAULT 0,
    accuracy NUMERIC DEFAULT 0,
    movement_status VARCHAR(50) DEFAULT 'MOVING',
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Alerts & Incidents
CREATE TABLE IF NOT EXISTS alerts (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'ALT-101'
    company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
    trip_id VARCHAR(50) REFERENCES trips(id) ON DELETE SET NULL,
    vehicle_id VARCHAR(50) REFERENCES vehicles(id) ON DELETE SET NULL,
    driver_id VARCHAR(50) REFERENCES drivers(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL, -- 'Breakdown', 'No Update', 'Unreachable', 'Stoppage Detected', 'Traffic Jam', 'Incoming Call'
    message TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'warning', -- 'info', 'warning', 'danger'
    status VARCHAR(50) DEFAULT 'Active', -- 'Active', 'Resolved', 'Escalated', 'Dismissed'
    stoppage_duration_minutes INT DEFAULT 0,
    escalated BOOLEAN DEFAULT FALSE,
    escalated_to_role VARCHAR(50),
    escalated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- 13. Alert Responses & Escalations
CREATE TABLE IF NOT EXISTS alert_responses (
    id SERIAL PRIMARY KEY,
    alert_id VARCHAR(50) REFERENCES alerts(id) ON DELETE CASCADE,
    responder_user_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
    action_taken VARCHAR(100) NOT NULL,
    notes TEXT,
    driver_response TEXT,
    escalation_level INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Call Logs
CREATE TABLE IF NOT EXISTS call_logs (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'CL-101'
    company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
    trip_id VARCHAR(50) REFERENCES trips(id) ON DELETE SET NULL,
    call_category VARCHAR(100) NOT NULL,
    caller VARCHAR(255) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    location_checkin VARCHAR(255),
    operator_emp_id VARCHAR(50),
    conversation_notes TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. Manager Requests
CREATE TABLE IF NOT EXISTS manager_requests (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'REQ-101'
    company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL, -- 'Add Driver', 'Add Vehicle', 'Add Branch', 'Add Commodity', 'Add Stock'
    request_data JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending', -- 'Pending', 'Approved', 'Rejected'
    submitted_by VARCHAR(50),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. SaaS Subscription Plans
CREATE TABLE IF NOT EXISTS subscription_plans (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'PLAN-BASIC', 'PLAN-PRO', 'PLAN-ENT'
    name VARCHAR(100) NOT NULL, -- 'Basic', 'Professional', 'Enterprise'
    billing_cycle VARCHAR(20) DEFAULT 'MONTHLY', -- 'MONTHLY', 'YEARLY'
    price_inr NUMERIC NOT NULL,
    max_vehicles INT DEFAULT 10,
    max_users INT DEFAULT 5,
    features JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. SaaS Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'SUB-1001'
    company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
    plan_id VARCHAR(50) REFERENCES subscription_plans(id),
    status VARCHAR(50) DEFAULT 'ACTIVE', -- 'ACTIVE', 'EXPIRED', 'PENDING', 'CANCELLED'
    start_date TIMESTAMPTZ DEFAULT NOW(),
    expiry_date TIMESTAMPTZ NOT NULL,
    auto_renew BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. SaaS Payments
CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'PAY-1001'
    company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
    subscription_id VARCHAR(50) REFERENCES subscriptions(id) ON DELETE SET NULL,
    plan_id VARCHAR(50) REFERENCES subscription_plans(id),
    amount NUMERIC NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    order_id VARCHAR(100),
    transaction_ref_id VARCHAR(100),
    payment_gateway VARCHAR(50) DEFAULT 'RAZORPAY',
    status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'
    gateway_response JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. SaaS Invoices
CREATE TABLE IF NOT EXISTS invoices (
    id VARCHAR(50) PRIMARY KEY, -- e.g. 'INV-1001'
    company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
    payment_id VARCHAR(50) REFERENCES payments(id) ON DELETE SET NULL,
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    amount NUMERIC NOT NULL,
    tax_amount NUMERIC DEFAULT 0,
    total_amount NUMERIC NOT NULL,
    billing_details JSONB DEFAULT '{}'::jsonb,
    issued_at TIMESTAMPTZ DEFAULT NOW(),
    due_date TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'PAID'
);

-- 20. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
    user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'SYSTEM', -- 'ALERT', 'STOPPAGE', 'PAYMENT', 'SUBSCRIPTION', 'SYSTEM'
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 21. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    company_id VARCHAR(50) REFERENCES companies(id) ON DELETE SET NULL,
    user_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
    user_role VARCHAR(50),
    action VARCHAR(255) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 22. WhatsApp Communication Logs
CREATE TABLE IF NOT EXISTS whatsapp_logs (
    id VARCHAR(50) PRIMARY KEY,
    company_id VARCHAR(50) REFERENCES companies(id) ON DELETE SET NULL,
    direction VARCHAR(20) NOT NULL, -- 'INBOUND', 'OUTBOUND'
    from_number VARCHAR(50),
    to_number VARCHAR(50),
    message_type VARCHAR(50) DEFAULT 'text',
    content TEXT,
    status VARCHAR(50) DEFAULT 'SENT', -- 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RECEIVED', 'SIMULATED_SENT'
    meta_message_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for optimal performance
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_trips_company_status ON trips(company_id, status);
CREATE INDEX IF NOT EXISTS idx_gps_records_vehicle_time ON gps_tracking_records(vehicle_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_company_status ON alerts(company_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_company ON subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_company ON payments(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_time ON audit_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_time ON whatsapp_logs(created_at DESC);

-- Idempotent column migrations for existing databases
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS device_key VARCHAR(255);
ALTER TABLE gps_tracking_records ADD COLUMN IF NOT EXISTS accuracy NUMERIC DEFAULT 0;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS lat NUMERIC;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS lng NUMERIC;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS arriving_notified BOOLEAN DEFAULT FALSE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_ping_at TIMESTAMPTZ;


