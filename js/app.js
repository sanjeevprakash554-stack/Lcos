/**
 * Logistics Operations Control System (LCOS) - Main Application Controller
 * Manages UI interactions, form bindings, SPA tab routing, SVG map renders, and simulation hooks.
 */

const app = {
    activeTab: 'dashboard',
    activeConsoleTripId: null,
    selectedInventoryCommodityId: 'COM-RIC',
    selectedDirectorySub: 'drivers',
    isSubscriptionActive: false,
    currentSubscription: null,

    async init() {
        // 1. Immediately bind all UI click events synchronously
        this.bindEvents();
        this.setupSimulation();
        this.initSocketTelemetryListener();
        this.startStalenessWatcher();

        // 2. Initialize landing subscription status
        try {
            await this.initLandingSubscription();
        } catch (err) {
            console.warn('Subscription init warning:', err);
        }

        // 3. Load backend state in background
        try {
            if (window.LCOS_State) {
                await LCOS_State.init();
            }
        } catch (e) {
            console.warn('Init auth fallback:', e.message);
        }
        this.showToast('LCOS Central Operations Portal Initialized.', 'info');
    },

    bindEvents() {
        // Tab switching routing
        document.querySelectorAll('.nav-links li').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = item.getAttribute('data-tab');
                this.switchTab(tab);
            });
        });

        // Role switcher clicks
        // Login Card clicks
        document.getElementById('card-login-tracking')?.addEventListener('click', () => {
            this.login('tracking_team');
        });
        document.getElementById('card-login-manager')?.addEventListener('click', () => {
            this.login('branch_manager');
        });
        document.getElementById('card-login-owner')?.addEventListener('click', () => {
            this.login('owner');
        });

        // Landing Page Razorpay Payment Triggers
        document.getElementById('btn-landing-pay-basic')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleLandingPayment('PLAN-BASIC');
        });
        document.getElementById('btn-landing-pay-pro')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleLandingPayment('PLAN-PRO');
        });
        document.getElementById('btn-landing-pay-ent')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleLandingPayment('PLAN-ENT');
        });

        // Demo Gating State Toggles (Expired vs Active Simulation)
        document.getElementById('btn-toggle-demo-expired')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.simulateSubscriptionStatus('EXPIRED');
        });
        document.getElementById('btn-toggle-demo-active')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.simulateSubscriptionStatus('ACTIVE');
        });

        // Subscription Modal Event Handlers
        document.getElementById('btn-close-sub-modal')?.addEventListener('click', () => {
            const modal = document.getElementById('sub-gate-modal');
            if (modal) modal.style.display = 'none';
        });
        document.getElementById('btn-goto-pricing')?.addEventListener('click', () => {
            const modal = document.getElementById('sub-gate-modal');
            if (modal) modal.style.display = 'none';
            const pricingSection = document.getElementById('landing-pricing-section');
            if (pricingSection) {
                pricingSection.scrollIntoView({ behavior: 'smooth' });
                pricingSection.classList.add('pulse-pricing-cards');
                setTimeout(() => pricingSection.classList.remove('pulse-pricing-cards'), 3000);
            }
        });

        // Logout Button click
        document.getElementById('btn-logout-action')?.addEventListener('click', () => {
            this.logout();
        });





        // Quick create trip dispatch button
        document.getElementById('btn-quick-trip').addEventListener('click', () => {
            this.openModal('modal-create-trip');
        });
        document.getElementById('btn-create-trip-from-console').addEventListener('click', () => {
            this.openModal('modal-create-trip');
        });
        
        // Return Load Hub button
        const backloadBtn = document.getElementById('btn-backload-mgmt');
        if (backloadBtn) {
            backloadBtn.addEventListener('click', () => {
                this.openModal('modal-backload-mgmt');
                this.renderBackloadHub();
            });
        }


        // Create trip form submission
        document.getElementById('form-create-trip').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCreateTrip();
        });

        // Console trip selector dropdown
        document.getElementById('console-trip-select').addEventListener('change', (e) => {
            this.activeConsoleTripId = e.target.value;
            this.renderOperationsConsole();
        });

        // Manual log call button
        document.getElementById('btn-manual-call-driver').addEventListener('click', () => {
            if (!this.activeConsoleTripId) return;
            const trip = LCOS_State.getTripById(this.activeConsoleTripId);
            if (!trip) return;

            document.getElementById('call-trip-id').value = trip.id;
            document.getElementById('call-trip-ref').value = `${trip.id} - ${trip.vehicleId}`;
            
            // Auto fill category based on status
            const categorySel = document.getElementById('call-category');
            if (trip.status === 'CREATED') categorySel.value = 'Dispatch Confirmation';
            else if (trip.status === 'ARRIVED') categorySel.value = 'Delivery Confirmation';
            else categorySel.value = 'Transit Update';

            this.openModal('modal-log-call');
        });

        // Log call form submission
        document.getElementById('form-log-call').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogCall();
        });

        // Trips table filters & search
        document.getElementById('trip-search').addEventListener('input', () => this.renderTripsTracker());
        document.getElementById('trip-filter-status').addEventListener('change', () => this.renderTripsTracker());

        // Inventory commodity selection dropdown
        document.getElementById('inventory-commodity-select').addEventListener('change', (e) => {
            this.selectedInventoryCommodityId = e.target.value;
            this.renderInventory();
        });

        // Directory subtab toggles
        document.querySelectorAll('.dir-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.dir-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const sub = btn.getAttribute('data-dir-sub');
                this.selectedDirectorySub = sub;

                document.querySelectorAll('.dir-sub-content').forEach(c => c.style.display = 'none');
                document.getElementById(`dir-${sub}`).style.display = 'block';
                this.renderDirectory();
            });
        });

        // Add Driver form submit
        document.getElementById('form-add-driver')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('drv-name').value;
            const license = document.getElementById('drv-license').value;
            const phone = document.getElementById('drv-phone').value;
            const exp = Number(document.getElementById('drv-exp').value);

            await LCOS_State.addDriver({
                name,
                license,
                phone,
                experience: exp
            });
            document.getElementById('form-add-driver').reset();
            this.showToast(`New driver "${name}" registered successfully!`, 'success');
            this.renderDirectory();
            this.populateWhatsAppDriverPicker();
        });

        // Add Vehicle form submit
        document.getElementById('form-add-vehicle').addEventListener('submit', (e) => {
            e.preventDefault();
            LCOS_State.addVehicle({
                id: document.getElementById('veh-id').value.toUpperCase(),
                type: document.getElementById('veh-type').value,
                capacity: Number(document.getElementById('veh-capacity').value),
                owner: document.getElementById('veh-owner').value
            });
            document.getElementById('form-add-vehicle').reset();
            this.showToast('New vehicle registered successfully.', 'success');
            this.renderDirectory();
        });

        // Add Branch form submit
        document.getElementById('form-add-branch').addEventListener('submit', (e) => {
            e.preventDefault();
            LCOS_State.addBranch({
                name: document.getElementById('br-name').value,
                manager: document.getElementById('br-manager').value,
                phone: document.getElementById('br-phone').value,
                x: Math.floor(Math.random() * 50 + 20), // random coords
                y: Math.floor(Math.random() * 50 + 30)
            });
            document.getElementById('form-add-branch').reset();
            this.showToast('New branch created successfully.', 'success');
            this.renderDirectory();
            this.renderMap();
        });

        // Add Commodity form submit
        document.getElementById('form-add-commodity').addEventListener('submit', (e) => {
            e.preventDefault();
            LCOS_State.addCommodity({
                name: document.getElementById('com-name').value,
                unit: document.getElementById('com-unit').value,
                weight: Number(document.getElementById('com-weight').value),
                value: Number(document.getElementById('com-value').value)
            });
            document.getElementById('form-add-commodity').reset();
            this.showToast('New commodity added to catalogue.', 'success');
            this.renderDirectory();
        });

        // Request resource type change handler
        document.getElementById('req-resource-type').addEventListener('change', (e) => {
            this.renderRequestFields(e.target.value);
        });

        // Submit request form submit
        document.getElementById('form-submit-request').addEventListener('submit', (e) => {
            e.preventDefault();
            const type = document.getElementById('req-resource-type').value;
            let requestData = {};

            if (type === 'Add Driver') {
                requestData = {
                    name: document.getElementById('req-drv-name').value,
                    license: document.getElementById('req-drv-license').value,
                    phone: document.getElementById('req-drv-phone').value,
                    experience: Number(document.getElementById('req-drv-exp').value)
                };
            } else if (type === 'Add Vehicle') {
                requestData = {
                    id: document.getElementById('req-veh-id').value.toUpperCase(),
                    type: document.getElementById('req-veh-type').value,
                    capacity: Number(document.getElementById('req-veh-capacity').value),
                    owner: document.getElementById('req-veh-owner').value
                };
            } else if (type === 'Add Stock') {
                requestData = {
                    branchId: document.getElementById('req-stock-branch').value,
                    commodityId: document.getElementById('req-stock-commodity').value,
                    quantity: Number(document.getElementById('req-stock-qty').value)
                };
            }

            LCOS_State.addManagerRequest(type, requestData);
            this.showToast('Request submitted to Supervisor for approval.', 'success');
            document.getElementById('form-submit-request').reset();
            this.closeModal('modal-request-resource');
            this.renderAll();
        });

        // Inventory action button (Refill Stock)
        document.getElementById('btn-inventory-action').addEventListener('click', () => {
            const role = LCOS_State.getCurrentRole();
            if (role === 'tracking_team') {
                this.openRequestModal('Add Stock');
            } else {
                // Populate Manager Refill Modal select lists
                const brSel = document.getElementById('mas-branch');
                const comSel = document.getElementById('mas-commodity');
                
                brSel.innerHTML = LCOS_State.getBranches().map(b => `<option value="${b.id}">${b.name}</option>`).join('');
                comSel.innerHTML = LCOS_State.getCommodities().map(c => `<option value="${c.id}">${c.name}</option>`).join('');
                
                this.openModal('modal-manager-add-stock');
            }
        });

        // Manager manual stock refill submit
        document.getElementById('form-manager-add-stock').addEventListener('submit', (e) => {
            e.preventDefault();
            const branchId = document.getElementById('mas-branch').value;
            const commodityId = document.getElementById('mas-commodity').value;
            const qty = Number(document.getElementById('mas-quantity').value);

            LCOS_State.addStockDirectly(branchId, commodityId, qty);
            this.showToast('Warehouse stock directly replenished.', 'success');
            document.getElementById('form-manager-add-stock').reset();
            this.closeModal('modal-manager-add-stock');
            this.renderAll();
        });

        // Call logs search & filter
        document.getElementById('call-search').addEventListener('input', () => this.renderCallLogs());
        document.getElementById('call-filter-type').addEventListener('change', () => this.renderCallLogs());

        // Map Timeframe Filter change
        document.getElementById('map-filter-timeframe')?.addEventListener('change', (e) => {
            const wrap = document.getElementById('map-custom-dates-wrap');
            if (wrap) {
                wrap.style.display = e.target.value === 'custom' ? 'inline-flex' : 'none';
            }
            this.updateMapReport();
        });

        // Map Custom dates changes
        document.getElementById('map-date-start')?.addEventListener('change', () => this.updateMapReport());
        document.getElementById('map-date-end')?.addEventListener('change', () => this.updateMapReport());

        // Map District Filter change
        document.getElementById('map-filter-district')?.addEventListener('change', () => {
            this.updateMapReport();
        });

        // Map Vehicle selection change
        document.getElementById('map-filter-vehicle')?.addEventListener('change', () => {
            this.updateMapHighlights();
        });

        // Reset TN Map button click
        document.getElementById('btn-reset-tn-map')?.addEventListener('click', () => {
            this.resetMapToTamilNadu();
            this.showToast('Map reset to full Tamil Nadu regional overview.', 'info');
        });

        // Window resize listener to keep map dynamically fitted to screen
        window.addEventListener('resize', () => {
            if (this.leafletMap) {
                this.leafletMap.invalidateSize();
            }
        });

        // Alerts view filter
        document.getElementById('alerts-filter-type')?.addEventListener('change', () => {
            this.renderAlertsView();
        });

        // Requests view filter
        document.getElementById('requests-filter-status')?.addEventListener('change', () => {
            this.renderRequestsView();
        });

        // Notifications Sub-tab click listeners
        document.querySelectorAll('.notif-subtab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const sub = btn.getAttribute('data-notif-sub');
                this.switchNotifSubTab(sub);
            });
        });

        // WhatsApp Meta Configuration Form
        document.getElementById('form-whatsapp-config')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const phoneId = document.getElementById('wa-cfg-phone-id')?.value;
            const accessToken = document.getElementById('wa-cfg-access-token')?.value;
            const wabaId = document.getElementById('wa-cfg-waba-id')?.value;
            const verifyToken = document.getElementById('wa-cfg-verify-token')?.value;
            const higherOfficialPhone = document.getElementById('wa-cfg-official-phone')?.value;
            try {
                await window.LCOS_API.saveWhatsAppConfig({
                    phoneNumberId: phoneId,
                    accessToken,
                    businessAccountId: wabaId,
                    verifyToken,
                    higherOfficialPhone
                });
                this.showToast('WhatsApp Meta credentials saved successfully!', 'success');
                this.renderWhatsAppView();
            } catch (err) {
                this.showToast('Failed to save WhatsApp config: ' + err.message, 'danger');
            }
        });

        // WhatsApp Outbound Sender Form
        document.getElementById('form-whatsapp-send')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const to = document.getElementById('wa-send-phone')?.value?.trim();
            const type = document.getElementById('wa-send-type')?.value;
            const tripId = document.getElementById('wa-send-trip-picker')?.value;
            const message = document.getElementById('wa-send-text')?.value;

            if (!to) {
                this.showToast('Please specify a recipient phone number', 'warning');
                return;
            }

            try {
                let res;
                if (type === 'template') {
                    res = await window.LCOS_API.sendWhatsAppMessage({ to, type: 'template' });
                } else if (type === 'trip_dispatch') {
                    if (!tripId) {
                        this.showToast('Please select a trip to dispatch notification', 'warning');
                        return;
                    }
                    res = await window.LCOS_API.notifyWhatsAppTrip(tripId);
                } else if (type === 'stoppage_inquiry') {
                    res = await window.LCOS_API.sendWhatsAppMessage({
                        to,
                        type: 'interactive',
                        header: '🚨 Unscheduled Halt Warning',
                        message: message || 'Unscheduled vehicle halt detected by LCOS (>20 mins). Please tap your reason below to update Central Operations immediately.',
                        buttons: [
                            { id: 'stp_traffic_manual', title: 'Traffic / Toll Delay' },
                            { id: 'stp_breakdown_manual', title: 'Puncture / Breakdown' },
                            { id: 'stp_moving_manual', title: 'Resuming Movement' }
                        ]
                    });
                } else if (type === 'delivery_confirm') {
                    res = await window.LCOS_API.sendWhatsAppMessage({
                        to,
                        message: message || 'Shipment delivered and verified at destination branch warehouse. Delivery receipt generated.'
                    });
                } else {
                    res = await window.LCOS_API.sendWhatsAppMessage({ to, message });
                }

                if (res && res.success === false) {
                    const err = res.error || res.message || '';
                    if (err.includes('131030') || err.includes('allowed recipient list')) {
                        alert(`⚠️ Meta Developer Sandbox Limitation:\n\nPhone number "${to}" is not registered in your Meta Developer allowed list.\n\n👉 In Meta for Developers Dashboard:\n1. Go to WhatsApp > API Setup.\n2. Under the "To" dropdown, click "Manage phone number list".\n3. Add ${to} and verify with OTP.\n\nOnce added, Meta will immediately deliver all WhatsApp messages to this phone!`);
                        this.showToast(`Recipient ${to} not in Meta allowed recipient list (Code 131030)`, 'danger');
                    } else if (err.includes('131047') || err.includes('24 hours')) {
                        alert(`⚠️ Meta 24-Hour Policy Window Closed:\n\nMore than 24 hours have passed since ${to} replied.\n\n👉 Select "⭐ Official Meta Template (hello_world)" from the Template dropdown and send that first to open the 24-hour chat window!`);
                        this.showToast(`24h window closed. Send template first.`, 'warning');
                    } else {
                        this.showToast('WhatsApp Delivery Failed: ' + err, 'danger');
                    }
                } else {
                    this.showToast(`WhatsApp message delivered to ${to}! Check phone.`, 'success');
                    if (document.getElementById('wa-send-text')) document.getElementById('wa-send-text').value = '';
                }
                this.renderWhatsAppLogs();
            this.loadActiveStoppage();
            } catch (err) {
                this.showToast('Error sending WhatsApp message: ' + err.message, 'danger');
            }
        });

        // WhatsApp Driver Picker auto-fill phone and sync trip
        document.getElementById('wa-send-driver-picker')?.addEventListener('change', (e) => {
            const phone = e.target.value;
            if (phone) {
                document.getElementById('wa-send-phone').value = phone.replace(/[^0-9]/g, '');
                // Auto-sync trip picker to this driver's trip
                const driver = LCOS_State.getDrivers().find(d => d.phone === phone);
                if (driver) {
                    const trip = LCOS_State.getTrips().find(t => t.driverId === driver.id);
                    const tripPicker = document.getElementById('wa-send-trip-picker');
                    if (trip && tripPicker) {
                        tripPicker.value = trip.id;
                    }
                }
            }
        });

        // WhatsApp Trip Picker auto-fill driver and phone
        document.getElementById('wa-send-trip-picker')?.addEventListener('change', (e) => {
            const tripId = e.target.value;
            if (tripId) {
                const trip = LCOS_State.getTripById(tripId);
                if (trip) {
                    const driver = LCOS_State.getDrivers().find(d => d.id === trip.driverId);
                    if (driver) {
                        const driverPicker = document.getElementById('wa-send-driver-picker');
                        const phoneInput = document.getElementById('wa-send-phone');
                        if (driverPicker) driverPicker.value = driver.phone;
                        if (phoneInput) phoneInput.value = driver.phone.replace(/[^0-9]/g, '');
                    }
                }
            }
        });

        // WhatsApp Template Type toggle
        document.getElementById('wa-send-type')?.addEventListener('change', (e) => {
            const tripGroup = document.getElementById('wa-send-trip-group');
            const msgGroup = document.getElementById('wa-send-message-group');
            if (e.target.value === 'trip_dispatch' || e.target.value === 'stoppage_inquiry') {
                if (tripGroup) tripGroup.style.display = 'block';
                if (msgGroup) msgGroup.style.display = 'none';
            } else {
                if (tripGroup) tripGroup.style.display = 'none';
                if (msgGroup) msgGroup.style.display = 'block';
            }
        });

        // WhatsApp Guide Modal toggle
        document.getElementById('btn-wa-guide-modal')?.addEventListener('click', () => {
            const modal = document.getElementById('modal-wa-guide');
            if (modal) modal.style.display = 'flex';
        });

        // WhatsApp Refresh Logs
        document.getElementById('btn-wa-refresh-logs')?.addEventListener('click', () => {
            this.renderWhatsAppLogs();
            this.loadActiveStoppage();
            this.showToast('WhatsApp activity logs refreshed.', 'info');
        });
    },

    setupSimulation() {
        // Setup real computer clock sync (Simulator is removed)
        const updateClock = () => {
            const date = new Date();
            const options = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };
            const formatted = date.toLocaleDateString('en-US', options).replace(',', '');
            
            const clockDisplay = document.getElementById('sim-clock-display');
            if (clockDisplay) clockDisplay.textContent = formatted;
            
            // Set the state's simulationTime to the actual real date ISO string
            // so that all dispatches and logs receive real timestamps!
            const settings = LCOS_State.getSystemSettings();
            settings.simulationTime = date.toISOString();
            if (typeof LCOS_State.save === "function") LCOS_State.save();
        };
        
        updateClock();
        setInterval(updateClock, 1000);
    },

    switchTab(tabId) {
        const role = LCOS_State.getCurrentRole();
        if (tabId === 'billing' && role !== 'owner' && role !== 'super_admin') {
            this.showToast('Access Restricted: SaaS Subscription & Billing is reserved exclusively for Executive Owners.', 'danger');
            tabId = 'dashboard';
        }

        document.querySelectorAll('.nav-links li').forEach(item => {
            if (item.getAttribute('data-tab') === tabId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });

        document.getElementById(`tab-${tabId}`).classList.add('active');
        this.activeTab = tabId;

        if (tabId === 'dashboard') {
            this.renderMap();
        }

        // Change View Title
        const titles = {
            dashboard: 'Logistics Operations Dashboard',
            operations: 'Central Dispatch Operations Console',
            trips: 'Shipments & Trips Tracker',
            inventory: 'Branch Warehouse Inventory & Stock Levels',
            directory: 'LCOS Resource Directories',
            calllogs: 'Operator Call Conversation Logs',
            billing: 'SaaS Subscription & Payment Management',
            notifications: 'Operations Notifications & Alerts Hub',
            whatsapp: 'Meta WhatsApp Cloud API Operations Hub'
        };
        document.getElementById('view-title').textContent = titles[tabId] || 'LCOS Portal';

        this.renderActiveTab();
    },

    getAllowedRolesForPlan(planId) {
        if (!this.isSubscriptionActive) return [];
        // Any active subscription plan unlocks access to all 3 operational portals
        return ['tracking_team', 'branch_manager', 'owner'];
    },

    async login(role) {
        if (this._isLoggingIn) return;
        this._isLoggingIn = true;

        try {
            if (!this.currentSubscription) {
                this.currentSubscription = { plan_id: 'PLAN-PRO', plan_name: 'Professional', status: 'ACTIVE' };
            }

            const planId = this.currentSubscription?.plan_id;
            const allowedRoles = this.getAllowedRolesForPlan(planId);

            if (!this.isSubscriptionActive || !allowedRoles.includes(role)) {
                this.pendingPortalRole = role;
                const roleLabels = {
                    tracking_team: 'Tracking Team',
                    branch_manager: 'Branch Manager',
                    owner: '2 Owners Executive'
                };
                const roleName = roleLabels[role] || role;

                this.showToast(`🔒 ${roleName} portal is locked. Please activate your subscription to access this portal.`, 'warning');
                this.showSubscriptionRequiredModal();
                this._isLoggingIn = false;
                return;
            }

            LCOS_State.setCurrentRole(role);
            
            let username = 'tracking';
            if (role === 'branch_manager') username = 'manager';
            else if (role === 'owner') username = 'owner';

            try {
                if (window.LCOS_API) {
                    await LCOS_API.login(username, role);
                    await LCOS_State.loadFromBackend();
                    this.initSocketTelemetryListener();
                }
            } catch (e) {
                console.warn('Backend login notice:', e.message);
            }

            const loginPage = document.getElementById('login-page');
            const appContainer = document.getElementById('app-container');
            
            if (loginPage) {
                loginPage.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
                loginPage.style.opacity = '0';
                loginPage.style.transform = 'scale(1.04)';
            }
            
            setTimeout(() => {
                if (loginPage) loginPage.style.display = 'none';
                if (appContainer) {
                    appContainer.style.display = 'flex';
                    appContainer.style.opacity = '1';
                }
                
                try {
                    // Switch to Dashboard tab by default on login to any portal
                    this.switchTab('dashboard');

                    // Reset filters so the full Tamil Nadu regional structure is shown cleanly
                    const districtSelect = document.getElementById('map-filter-district');
                    const vehSelect = document.getElementById('map-filter-vehicle');
                    const timeframeSelect = document.getElementById('map-filter-timeframe');
                    if (districtSelect) districtSelect.value = '';
                    if (vehSelect) vehSelect.value = '';
                    if (timeframeSelect) timeframeSelect.value = 'today';

                    this.renderMap();
                    this.resetMapToTamilNadu();
                    this.renderAll();
                } catch (err) {
                    console.error('Portal render notice:', err);
                } finally {
                    if (appContainer) {
                        appContainer.style.display = 'flex';
                        appContainer.style.opacity = '1';
                    }
                    this._isLoggingIn = false;
                }

                // Staggered size recalculations for Leaflet container bounds
                [50, 150, 300, 600, 1000].forEach(delay => {
                    setTimeout(() => {
                        if (this.leafletMap) {
                            this.leafletMap.invalidateSize();
                        }
                    }, delay);
                });
                
                const roleName = role === 'owner' ? 'Owner' : role === 'branch_manager' ? 'Branch Manager' : 'Tracking Team';
                this.showToast(`Logged in successfully as ${roleName}. Tamil Nadu Logistics Network Loaded.`, 'success');
            }, 350);
        } catch (err) {
            console.error('Login error:', err);
            this._isLoggingIn = false;
        }
    },

    logout() {
        if (this.socket) {
            try { this.socket.disconnect(); } catch (e) {}
            this.socket = null;
        }
        const loginPage = document.getElementById('login-page');
        const appContainer = document.getElementById('app-container');
        
        appContainer.style.transition = 'opacity 0.3s ease';
        appContainer.style.opacity = '0';
        
        setTimeout(async () => {
            appContainer.style.display = 'none';
            
            loginPage.style.display = 'flex';
            loginPage.style.opacity = '1';
            loginPage.style.transform = 'scale(1)';
            
            this.activeConsoleTripId = null;
            await this.initLandingSubscription();
            this.showToast('Logged out of session.', 'info');
        }, 300);
    },

    renderActiveTab() {
        switch (this.activeTab) {
            case 'dashboard':
                this.renderDashboard();
                break;
            case 'operations':
                this.renderOperationsConsole();
                break;
            case 'trips':
                this.renderTripsTracker();
                break;
            case 'inventory':
                this.renderInventory();
                break;
            case 'directory':
                this.renderDirectory();
                break;
            case 'calllogs':
                this.renderCallLogs();
                break;
            case 'billing':
                this.renderBillingView();
                break;
            case 'notifications':
                this.renderNotificationsView();
                break;
            case 'whatsapp':
                this.renderWhatsAppView();
                break;
        }
    },

    renderAll() {
        const role = LCOS_State.getCurrentRole();
        const quickTripBtn = document.getElementById('btn-quick-trip');
        if (quickTripBtn) {
            quickTripBtn.style.display = role === 'tracking_team' ? 'inline-flex' : 'none';
        }

        const backloadBtn = document.getElementById('btn-backload-mgmt');
        if (backloadBtn) {
            backloadBtn.style.display = 'inline-flex';
        }


        const roleIndicator = document.getElementById('active-role-indicator');
        if (roleIndicator) {
            if (role === 'owner') {
                roleIndicator.innerHTML = `<span class="owner-badge">👑 2 Owners (Executive Mode)</span>`;
            } else if (role === 'branch_manager') {
                roleIndicator.innerHTML = `<span class="badge badge-pending" style="padding: 0.35rem 0.75rem; border-radius: 8px;">💼 Branch Manager (Supervisor)</span>`;
            } else {
                roleIndicator.innerHTML = `<span class="badge badge-transit" style="padding: 0.35rem 0.75rem; border-radius: 8px;">📞 Tracking Team (Operator)</span>`;
            }
        }

        // Toggle Billing & SaaS Plans sidebar item exclusively for Owner role
        const billingNavItem = document.getElementById('nav-item-billing');
        if (billingNavItem) {
            billingNavItem.style.display = (role === 'owner' || role === 'super_admin') ? 'block' : 'none';
        }

        this.renderDashboard();
        this.renderOperationsConsole();
        this.renderTripsTracker();
        this.renderInventory();
        this.renderDirectory();
        this.renderCallLogs();
        this.renderNotificationsView();
        if (role === 'owner' || role === 'super_admin') {
            this.renderBillingView();
        }
    },

    // --- Tab Rendering Implementations ---

    switchNotifSubTab(sub) {
        document.querySelectorAll('.notif-subtab-btn').forEach(b => {
            b.classList.remove('btn-primary');
            b.classList.add('btn-secondary');
        });

        const activeBtn = document.getElementById(`btn-notif-sub-${sub}`);
        if (activeBtn) {
            activeBtn.classList.remove('btn-secondary');
            activeBtn.classList.add('btn-primary');
        }

        document.querySelectorAll('.notif-sub-content').forEach(c => c.style.display = 'none');
        const activeContent = document.getElementById(`notif-sub-${sub}`);
        if (activeContent) activeContent.style.display = 'block';

        const alertsFilter = document.getElementById('notif-alerts-filter-wrap');
        const requestsFilter = document.getElementById('notif-requests-filter-wrap');

        if (sub === 'alerts') {
            if (alertsFilter) alertsFilter.style.display = 'flex';
            if (requestsFilter) requestsFilter.style.display = 'none';
            this.renderAlertsView();
        } else {
            if (alertsFilter) alertsFilter.style.display = 'none';
            if (requestsFilter) requestsFilter.style.display = 'flex';
            this.renderRequestsView();
        }
    },

    renderNotificationsView() {
        const alerts = LCOS_State.getAlerts().filter(a => a.status === 'Active');
        const requests = LCOS_State.getRequests().filter(r => r.status === 'Pending');

        const alertsCountEl = document.getElementById('notif-count-alerts');
        const requestsCountEl = document.getElementById('notif-count-requests');

        if (alertsCountEl) alertsCountEl.textContent = alerts.length;
        if (requestsCountEl) requestsCountEl.textContent = requests.length;

        this.renderAlertsView();
        this.renderRequestsView();
    },

    renderAlertsView() {
        const alertsContainer = document.getElementById('full-alerts-feed-content');
        if (!alertsContainer) return;

        const alerts = LCOS_State.getAlerts();
        const filterType = document.getElementById('alerts-filter-type')?.value || '';

        const filtered = alerts.filter(a => {
            if (a.status !== 'Active') return false;
            if (!filterType) return true;
            if (filterType === 'Stoppage') return a.type === 'No Update' || (a.message && a.message.toLowerCase().includes('stopped'));
            if (filterType === 'Breakdown') return a.type === 'Breakdown';
            if (filterType === 'Unreachable') return a.type === 'Unreachable' || a.type === 'No Update';
            if (filterType === 'Incoming Call') return a.type === 'Incoming Call';
            return true;
        });

        if (filtered.length === 0) {
            alertsContainer.innerHTML = `<div style="text-align:center; padding:2.5rem; color:var(--text-muted); font-size:0.9rem;">No active operations alerts. All systems running smoothly!</div>`;
            return;
        }

        alertsContainer.innerHTML = filtered.map(a => {
            let badgeClass = a.severity === 'danger' || a.severity === 'critical' ? 'badge-delayed' : 'badge-pending';
            let actionBtn = '';
            const role = LCOS_State.getCurrentRole();

            if (a.type === 'Driver Delay Report' || a.type === 'Stoppage Detected' || a.type === 'Emergency Breakdown' || (a.message && a.message.toLowerCase().includes('stoppage'))) {
                const phone = a.driverPhone || a.driver_phone || '916382897998';
                const vehId = a.vehicleId || a.vehicle_id || 'TN-59-EF-9012';
                actionBtn = `
                    <button class="btn btn-success" style="padding:0.35rem 0.75rem; font-size:0.8rem; background:#10b981; border-color:#059669; font-weight:700; color:#fff;" onclick="app.acceptCurrentStoppageReason('${vehId}', '${a.id}')">✅ Accept</button>
                    <button class="btn btn-danger" style="padding:0.35rem 0.75rem; font-size:0.8rem; background:#ef4444; border-color:#dc2626; font-weight:700; color:#fff;" onclick="app.declineAndCallDriver('${vehId}', '${phone}', '${a.id}')">📞 Decline & Call</button>
                `;
            } else if (role === 'owner') {
                actionBtn = `<span class="badge badge-draft" style="font-size:0.75rem; padding:0.25rem 0.5rem;">OWNER MONITORING</span>`;
            } else if (a.type === 'Incoming Call') {
                actionBtn = `<button class="btn btn-primary" style="padding:0.35rem 0.75rem; font-size:0.8rem;" onclick="app.answerSimulatedCall('${a.id}')">Answer Call</button>`;
            } else if (a.type === 'No Update' || a.type === 'Unreachable' || a.type === 'Breakdown') {
                if (role === 'tracking_team') {
                    if (a.escalated) {
                        actionBtn = `<span class="badge badge-escalated" style="font-size:0.75rem; padding:0.25rem 0.5rem;">Escalated to Mgr</span>`;
                    } else {
                        actionBtn = `<button class="btn btn-warning" style="padding:0.35rem 0.75rem; font-size:0.8rem;" onclick="app.escalateAlertToManager('${a.id}')">Escalate to Manager</button>`;
                    }
                } else {
                    if (a.type === 'Breakdown') {
                        actionBtn = `<button class="btn btn-danger" style="padding:0.35rem 0.75rem; font-size:0.8rem;" onclick="app.resolveBreakdownAlert('${a.id}')">Resolve Breakdown</button>`;
                    } else {
                        actionBtn = `<button class="btn btn-warning" style="padding:0.35rem 0.75rem; font-size:0.8rem;" onclick="app.startEscalationCall('${a.id}')">Call Driver</button>`;
                    }
                }
            }

            let cardClass = "flex justify-between align-center";
            if (a.escalated) cardClass += " alert-escalated-card";

            return `
                <div class="${cardClass}" style="padding:0.85rem 1.1rem; border-radius:10px; background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.2); gap:1rem;">
                    <div style="font-size:0.85rem; flex-grow:1;">
                        <div style="margin-bottom:0.25rem;">
                            <span class="badge ${badgeClass}" style="padding:0.15rem 0.4rem; font-size:0.7rem;">${a.type}</span>
                            ${a.escalated ? `<span class="badge badge-escalated" style="font-size:0.65rem; padding:0.15rem 0.35rem; margin-left:0.35rem;">ESCALATED</span>` : ''}
                        </div>
                        <div style="font-weight:600; color:var(--text-primary); margin-top:0.2rem; font-size:0.9rem;">${a.message}</div>
                        <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.2rem;">Alert ID: ${a.id} | Trip: ${a.tripId || '--'}</div>
                    </div>
                    <div class="flex gap-2 align-center">
                        ${actionBtn}
                        ${(role === 'branch_manager' || role === 'super_admin') ? `<button class="btn btn-secondary" style="padding:0.35rem 0.65rem; font-size:0.8rem;" onclick="app.dismissAlert('${a.id}')">Dismiss</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    },

    renderRequestsView() {
        const requestsContainer = document.getElementById('full-requests-feed-content');
        if (!requestsContainer) return;

        const requests = LCOS_State.getRequests();
        const filterStatus = document.getElementById('requests-filter-status')?.value || '';
        const role = LCOS_State.getCurrentRole();

        const filtered = requests.filter(r => {
            if (!filterStatus) return true;
            return r.status === filterStatus;
        });

        if (filtered.length === 0) {
            requestsContainer.innerHTML = `<div style="text-align:center; padding:2.5rem; color:var(--text-muted); font-size:0.9rem;">No supervisor requests recorded.</div>`;
            return;
        }

        requestsContainer.innerHTML = filtered.map(r => {
            const isApp = r.status === 'Approved';
            let badgeClass = isApp ? 'badge-request-approved' : 'badge-request-pending';
            let actionBtn = '';
            
            if (!isApp && role === 'branch_manager') {
                actionBtn = `<button class="btn btn-success" style="padding:0.35rem 0.75rem; font-size:0.8rem;" onclick="app.approveRequest('${r.id}')">Approve Request</button>`;
            } else if (!isApp && role === 'owner') {
                actionBtn = `<span class="badge badge-request-pending" style="font-size:0.75rem; padding:0.25rem 0.5rem;">Pending Approval</span>`;
            } else if (isApp) {
                actionBtn = `<span class="badge badge-request-approved" style="font-size:0.75rem; padding:0.25rem 0.5rem;">✓ Approved</span>`;
            }

            let desc = '';
            if (r.type === 'Add Driver') desc = `Driver Registration: ${r.data.name} (License: ${r.data.license}, Phone: ${r.data.phone})`;
            else if (r.type === 'Add Vehicle') desc = `Vehicle Registration: ${r.data.id} (${r.data.type}, Capacity: ${r.data.capacity} MT)`;
            else if (r.type === 'Add Stock') desc = `Stock Replenishment: +${r.data.quantity} units of ${r.data.commodityId} at ${r.data.branchId}`;

            return `
                <div class="request-item-card ${isApp ? 'approved' : ''}" style="padding:0.95rem 1.1rem; border-radius:10px; display:flex; justify-content:space-between; align-items:center; gap:1rem;">
                    <div style="flex-grow:1;">
                        <div style="margin-bottom:0.25rem;">
                            <span class="badge ${badgeClass}" style="padding:0.15rem 0.4rem; font-size:0.7rem;">${r.type}</span>
                            <span style="font-size:0.72rem; color:var(--text-muted); margin-left:0.5rem;">${r.id}</span>
                        </div>
                        <div style="font-weight:600; font-size:0.9rem; color:var(--text-primary); margin-top:0.2rem;">${desc}</div>
                        <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.2rem;">Status: ${r.status}</div>
                    </div>
                    <div>
                        ${actionBtn}
                    </div>
                </div>
            `;
        }).reverse().join('');
    },

    async renderWhatsAppView() {
        try {
            const status = await window.LCOS_API.getWhatsAppStatus();
            const badge = document.getElementById('wa-status-badge');
            if (badge) {
                if (status.configured) {
                    badge.textContent = '🟢 LIVE META GRAPH API';
                    badge.style.background = 'rgba(37, 211, 102, 0.15)';
                    badge.style.color = '#25D366';
                    badge.style.borderColor = 'rgba(37, 211, 102, 0.4)';
                } else {
                    badge.textContent = '🟡 LOCAL SANDBOX / SIMULATION';
                    badge.style.background = 'rgba(245, 158, 11, 0.15)';
                    badge.style.color = '#fbbf24';
                    badge.style.borderColor = 'rgba(245, 158, 11, 0.4)';
                }
            }

            const urlEl = document.getElementById('wa-webhook-url-display');
            if (urlEl && status.webhookUrl) urlEl.textContent = status.webhookUrl;

            const tokEl = document.getElementById('wa-verify-token-display');
            if (tokEl && status.verifyToken) tokEl.textContent = status.verifyToken;

            const phoneInput = document.getElementById('wa-cfg-phone-id');
            if (phoneInput && status.phoneNumberId && !phoneInput.value) {
                phoneInput.value = status.phoneNumberId;
            }

            const wabaInput = document.getElementById('wa-cfg-waba-id');
            if (wabaInput && status.businessAccountId && !wabaInput.value) {
                wabaInput.value = status.businessAccountId;
            }

            const verifyInput = document.getElementById('wa-cfg-verify-token');
            if (verifyInput && status.verifyToken && !verifyInput.value) {
                verifyInput.value = status.verifyToken;
            }

            const officialPhoneInput = document.getElementById('wa-cfg-official-phone');
            if (officialPhoneInput && status.higherOfficialPhone && !officialPhoneInput.value) {
                officialPhoneInput.value = status.higherOfficialPhone;
            }
            const officialDisplay = document.getElementById('wa-display-official-phone');
            if (officialDisplay && status.higherOfficialPhone) {
                officialDisplay.textContent = status.higherOfficialPhone;
            }

            // Populate Drivers Picker
            this.populateWhatsAppDriverPicker();

            // Populate Trips Picker
            const tripPicker = document.getElementById('wa-send-trip-picker');
            if (tripPicker) {
                const trips = LCOS_State.getTrips() || [];
                const branches = LCOS_State.getBranches() || [];
                const drivers = LCOS_State.getDrivers() || [];
                tripPicker.innerHTML = `<option value="">-- Choose Trip / Route --</option>` +
                    trips.map(t => {
                        const src = branches.find(b => b.id === t.sourceBranchId);
                        const dest = branches.find(b => b.id === t.destinationBranchId);
                        const drv = drivers.find(d => d.id === t.driverId);
                        const routeStr = src && dest ? `${src.name} ➔ ${dest.name}` : t.id;
                        const drvStr = drv ? ` - ${drv.name}` : '';
                        return `<option value="${t.id}">${t.id} : ${t.vehicleId} (${routeStr}${drvStr})</option>`;
                    }).join('');
            }

            this.renderWhatsAppLogs();
            this.loadActiveStoppage();
        } catch (err) {
            console.error('Error rendering WhatsApp view:', err);
        }
    },

    populateWhatsAppDriverPicker() {
        const driverPicker = document.getElementById('wa-send-driver-picker');
        if (driverPicker) {
            const drivers = LCOS_State.getDrivers() || [];
            const trips = LCOS_State.getTrips() || [];
            const currentVal = driverPicker.value;
            driverPicker.innerHTML = `<option value="">-- Choose Registered Driver --</option>` +
                drivers.map(d => {
                    const trip = trips.find(t => t.driverId === d.id);
                    const vehStr = trip ? ` [${trip.vehicleId}]` : '';
                    return `<option value="${d.phone}" ${d.phone === currentVal ? 'selected' : ''}>${d.name}${vehStr} (${d.phone})</option>`;
                }).join('');
        }
    },

    async renderWhatsAppLogs() {
        const tbody = document.getElementById('wa-logs-table-body');
        const counter = document.getElementById('wa-logs-counter');
        if (!tbody) return;

        try {
            const data = await window.LCOS_API.getWhatsAppLogs(50);
            const logs = data.logs || [];

            if (counter) counter.textContent = `${logs.length} Log${logs.length === 1 ? '' : 's'}`;

            if (logs.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align:center; padding:2.5rem; color:var(--text-muted); font-size:0.85rem;">
                            No WhatsApp messages recorded yet. Send a test message or simulate inbound communication above!
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = logs.map(l => {
                const date = new Date(l.created_at);
                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + date.toLocaleDateString([], { day: '2-digit', month: 'short' });

                const isOut = l.direction === 'OUTBOUND';
                const dirBadge = isOut
                    ? `<span class="badge" style="background:rgba(37, 211, 102, 0.15); color:#25D366; border:1px solid rgba(37,211,102,0.3); font-size:0.7rem;">⬆️ OUTBOUND</span>`
                    : `<span class="badge" style="background:rgba(59, 130, 246, 0.15); color:#60a5fa; border:1px solid rgba(59,130,246,0.3); font-size:0.7rem;">⬇️ INBOUND</span>`;

                const phone = isOut ? l.to_number : l.from_number;
                const statusColors = {
                    SENT: 'background:rgba(59, 130, 246, 0.15); color:#60a5fa;',
                    SIMULATED_SENT: 'background:rgba(245, 158, 11, 0.15); color:#fbbf24;',
                    DELIVERED: 'background:rgba(16, 185, 129, 0.15); color:#34d399;',
                    READ: 'background:rgba(37, 211, 102, 0.2); color:#25D366;',
                    RECEIVED: 'background:rgba(168, 85, 247, 0.15); color:#c084fc;',
                    FAILED: 'background:rgba(239, 68, 68, 0.15); color:#f87171;',
                };
                const statusStyle = statusColors[l.status] || 'background:rgba(255,255,255,0.1); color:#fff;';

                const safeContent = (l.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

                return `
                    <tr>
                        <td style="font-size:0.75rem; color:var(--text-secondary); white-space:nowrap;">${timeStr}</td>
                        <td>${dirBadge}</td>
                        <td style="font-family:monospace; font-weight:600; font-size:0.8rem;">${phone}</td>
                        <td style="font-size:0.75rem; text-transform:uppercase; color:var(--color-primary);">${l.message_type || 'text'}</td>
                        <td style="font-size:0.8rem; line-height:1.4; max-width:400px; word-break:break-word;">${safeContent}</td>
                        <td><span class="badge" style="${statusStyle} font-size:0.7rem;">${l.status}</span></td>
                    </tr>
                `;
            }).join('');

            // Update live stoppage monitor box with latest driver reply if available
            const latestDriverReply = (res.logs || []).find(l => l.direction === 'INBOUND' && (
                l.content?.includes('Traffic') || l.content?.includes('Breakdown') || l.content?.includes('Puncture') || l.content?.includes('Moving') || l.content?.includes('Resuming') || l.content?.includes('Delay')
            ));
            const reasonEl = document.getElementById('wa-stoppage-reason-text');
            const timeEl = document.getElementById('wa-stoppage-reply-time');
            if (reasonEl && latestDriverReply) {
                const repTime = new Date(latestDriverReply.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                reasonEl.innerHTML = `<span style="color:#38bdf8;">🟡 <strong>${latestDriverReply.content}</strong> (Driver ${latestDriverReply.from_number})</span>`;
                if (timeEl) timeEl.textContent = `Received at ${repTime}`;
            }
        } catch (err) {
            console.error('Error fetching WhatsApp logs:', err);
        }
    },

    switchWaSubtab(sub) {
        const sendPanel = document.getElementById('wa-console-panel-send');
        const simPanel = document.getElementById('wa-console-panel-sim');
        const btnSend = document.getElementById('btn-wa-sub-send');
        const btnSim = document.getElementById('btn-wa-sub-sim');

        if (sub === 'send') {
            if (sendPanel) sendPanel.style.display = 'block';
            if (simPanel) simPanel.style.display = 'none';
            btnSend?.classList.add('active');
            btnSim?.classList.remove('active');
        } else {
            if (sendPanel) sendPanel.style.display = 'none';
            if (simPanel) simPanel.style.display = 'block';
            btnSim?.classList.add('active');
            btnSend?.classList.remove('active');
        }
    },

    async simulateWaInbound(text) {
        if (!text) return;
        try {
            const testPhone = document.getElementById('wa-send-phone')?.value?.trim() || '916382897998';
            let payload = { from: testPhone, text };
            if (text === 'LOCATION') {
                payload = {
                    from: testPhone,
                    location: {
                        latitude: 11.6643 + (Math.random() - 0.5) * 0.05,
                        longitude: 78.1460 + (Math.random() - 0.5) * 0.05,
                        name: 'Salem Bypass Checkpoint'
                    }
                };
            }
            await window.LCOS_API.simulateIncomingWhatsApp(payload);
            this.showToast(`Inbound message "${text}" processed by LCOS Bot!`, 'success');
            setTimeout(() => this.renderWhatsAppLogs(), 600);
        } catch (err) {
            this.showToast('Error simulating WhatsApp inbound: ' + err.message, 'danger');
        }
    },

    async triggerTestStoppage() {
        try {
            const btn = document.getElementById('btn-trigger-test-stoppage');
            if (btn) {
                btn.disabled = true;
                btn.textContent = '⏳ Running Stoppage Detection...';
            }
            this.showToast('Checking vehicle stoppage (>20 mins) & dispatching WhatsApp alert...', 'info');

            const phoneInput = document.getElementById('wa-send-phone')?.value?.trim();
            const driverPicker = document.getElementById('wa-send-driver-picker');
            const tripPicker = document.getElementById('wa-send-trip-picker');
            
            let selectedTripId = tripPicker?.value || null;
            let selectedPhone = phoneInput || driverPicker?.value || null;
            let selectedVehicleId = null;

            // 1. Check if trip selected in dropdown
            if (selectedTripId) {
                const trip = LCOS_State.getTripById(selectedTripId);
                if (trip) {
                    selectedVehicleId = trip.vehicleId;
                    const drv = LCOS_State.getDrivers().find(d => d.id === trip.driverId);
                    if (drv && !selectedPhone) selectedPhone = drv.phone;
                }
            }

            // 2. Check if driver selected in dropdown
            if (!selectedVehicleId && driverPicker?.value) {
                const drvPhone = driverPicker.value;
                const driver = LCOS_State.getDrivers().find(d => d.phone === drvPhone);
                if (driver) {
                    const trip = LCOS_State.getTrips().find(t => t.driverId === driver.id);
                    if (trip) {
                        selectedVehicleId = trip.vehicleId;
                        selectedTripId = trip.id;
                    }
                    if (!selectedPhone) selectedPhone = driver.phone;
                }
            }

            // 3. Check if phone entered matches any driver in state
            if (!selectedVehicleId && selectedPhone) {
                const clean = selectedPhone.replace(/[^0-9]/g, '');
                const driver = LCOS_State.getDrivers().find(d => d.phone && d.phone.replace(/[^0-9]/g, '').endsWith(clean.slice(-10)));
                if (driver) {
                    const trip = LCOS_State.getTrips().find(t => t.driverId === driver.id);
                    if (trip) {
                        selectedVehicleId = trip.vehicleId;
                        selectedTripId = trip.id;
                    }
                }
            }

            const res = await window.LCOS_API.triggerTestStoppage({
                vehicleId: selectedVehicleId || null,
                tripId: selectedTripId || null,
                minutes: 25,
                testPhone: selectedPhone || '916382897998'
            });

            if (res.success) {
                const vehMsg = res.vehicleId || 'Vehicle';
                this.showToast(`🚨 Stoppage alert sent for ${vehMsg}! Dispatched to WhatsApp (${res.driverPhone || selectedPhone})`, 'success');
                const reasonText = document.getElementById('wa-stoppage-reason-text');
                const badge = document.getElementById('wa-stoppage-vehicle-badge');
                if (reasonText) {
                    reasonText.innerHTML = `<span style="color:#fbbf24;">⚡ Alert sent for ${vehMsg}. Waiting for driver button reply...</span>`;
                }
                if (badge) {
                    badge.style.background = 'rgba(239, 68, 68, 0.15)';
                    badge.style.color = '#f87171';
                    badge.textContent = `${vehMsg} (Halted >20m)`;
                }
                setTimeout(() => {
                    this.renderWhatsAppLogs();
                    this.loadActiveStoppage();
                    if (typeof this.loadAlerts === 'function') this.loadAlerts();
                }, 800);
            } else {
                this.showToast('Test failed: ' + (res.message || 'Unknown error'), 'warning');
            }
        } catch (err) {
            this.showToast('Failed to trigger stoppage test: ' + err.message, 'danger');
        } finally {
            const btn = document.getElementById('btn-trigger-test-stoppage');
            if (btn) {
                btn.disabled = false;
                btn.textContent = '🚨 Test 20m Stoppage Alert';
            }
        }
    },

    async simulateDriverButtonReply(type = 'traffic', vehicleId = 'TN-59-EF-9012') {
        const buttonIds = {
            traffic: `stp_traffic_${vehicleId}`,
            breakdown: `stp_breakdown_${vehicleId}`,
            resuming: `stp_moving_${vehicleId}`
        };
        const titles = {
            traffic: 'Traffic / Toll Delay',
            breakdown: 'Puncture / Breakdown',
            resuming: 'Resuming Movement'
        };

        const buttonId = buttonIds[type] || buttonIds.traffic;
        const title = titles[type] || titles.traffic;

        const payload = {
            object: 'whatsapp_business_account',
            entry: [{
                id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
                changes: [{
                    value: {
                        messaging_product: 'whatsapp',
                        metadata: { display_phone_number: '1555000', phone_number_id: '1246879781843655' },
                        contacts: [{ profile: { name: 'Saravanan K.' }, wa_id: '916382897998' }],
                        messages: [{
                            from: '916382897998',
                            id: 'wamid.sim_' + Date.now(),
                            timestamp: Math.floor(Date.now() / 1000).toString(),
                            type: 'interactive',
                            interactive: {
                                type: 'button_reply',
                                button_reply: {
                                    id: buttonId,
                                    title: title
                                }
                            }
                        }]
                    },
                    field: 'messages'
                }]
            }]
        };

        try {
            this.showToast(`Simulating driver tapped "${title}"...`, 'info');
            await fetch('/api/whatsapp/webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            await this.refreshAlertsAndDashboard();
        } catch (e) {
            console.error('Simulation error:', e);
            this.showToast('Simulation error: ' + e.message, 'danger');
        }
    },

    async refreshAlertsAndDashboard() {
        try {
            await LCOS_State.loadFromBackend();
            this.renderDashboard();
            if (typeof this.renderAlertsView === 'function') this.renderAlertsView();
            this.renderWhatsAppLogs();
        } catch (e) {
            console.error('Error refreshing alerts and dashboard:', e);
        }
    },

    loadActiveStoppage() {
        return this.refreshAlertsAndDashboard();
    },

    loadAlerts() {
        return this.refreshAlertsAndDashboard();
    },

    async acceptCurrentStoppageReason(vehicleId = 'TN-59-EF-9012', alertId = null) {
        try {
            const res = await window.LCOS_API.acceptStoppageReason({ vehicleId, alertId });
            if (res.success) {
                this.showToast('✅ Delay reason ACCEPTED! Lorry approved to proceed & confirmation sent to driver WhatsApp.', 'success');
                
                await this.refreshAlertsAndDashboard();

                const remaining = (LCOS_State.getAlerts() || []).filter(a => (a.status === 'Active' || a.status === 'Escalated') && a.type !== 'Incoming Call');
                if (remaining.length === 0) {
                    const alertsBanner = document.getElementById('alerts-banner');
                    if (alertsBanner) alertsBanner.style.display = 'none';
                }
            } else {
                this.showToast('Error: ' + (res.message || 'Could not accept reason'), 'warning');
            }
        } catch (err) {
            this.showToast('Failed to accept stoppage reason: ' + err.message, 'danger');
        }
    },

    async declineAndCallDriver(vehicleId = 'TN-59-EF-9012', phone = '916382897998', alertId = null) {
        try {
            // 1. Post decline to backend so driver receives WhatsApp rejection notification & alert is marked Escalated
            window.LCOS_API.declineStoppageReason({ vehicleId, alertId }).catch(console.error);

            // 2. Find matching trip for this vehicle
            const trips = LCOS_State.getTrips() || [];
            const activeTrip = trips.find(t => t.vehicleId === vehicleId && t.status !== 'CLOSED' && t.status !== 'COMPLETED_RETURN') 
                            || trips.find(t => t.vehicleId === vehicleId) 
                            || trips[0];
            const resolvedTripId = activeTrip ? activeTrip.id : 'TRIP-1002';

            // 3. Open call dialog with driver's details prefilled
            this.openModal('modal-log-call');
            const idInput = document.getElementById('call-trip-id');
            const refInput = document.getElementById('call-trip-ref');
            const catSelect = document.getElementById('call-category');
            const notes = document.getElementById('call-notes');
            const locationInput = document.getElementById('call-location');
            const empInput = document.getElementById('call-emp-id');

            if (idInput) idInput.value = resolvedTripId;
            if (refInput) refInput.value = `${resolvedTripId} (${vehicleId})`;
            if (catSelect) catSelect.value = 'Delay Check';
            if (notes) notes.value = `Manager declined reported stoppage delay for ${vehicleId}. Calling driver directly at ${phone}.`;
            if (locationInput) locationInput.value = 'Salem NH Highway Stoppage';
            if (empInput && !empInput.value.trim()) empInput.value = this.operatorEmpId || 'EMP-101';

            // 4. Directly trigger phone dialer protocol
            const cleanDigits = String(phone).replace(/[^0-9+]/g, '');
            try {
                window.location.href = `tel:${cleanDigits}`;
            } catch (e) {
                console.warn('Direct tel protocol notice:', e);
            }

            this.showToast(`❌ Reason declined. Calling driver ${vehicleId} (${phone})...`, 'warning');

            await this.refreshAlertsAndDashboard();
        } catch (err) {
            console.error('Error in declineAndCallDriver:', err);
        }
    },

    sendWhatsAppToDriver(phone, driverName) {
        this.switchTab('whatsapp');
        const phoneInput = document.getElementById('wa-send-phone');
        if (phoneInput && phone) {
            phoneInput.value = phone.replace(/[^0-9]/g, '');
        }
        const msgInput = document.getElementById('wa-send-text');
        if (msgInput) {
            msgInput.value = `Hello ${driverName}, please confirm your current transit status and vehicle check with Central Operations.`;
            msgInput.focus();
        }
        this.showToast(`Selected driver ${driverName} in WhatsApp console.`, 'info');
    },

    async sendTripWhatsAppAlert(tripId) {
        try {
            const res = await window.LCOS_API.notifyWhatsAppTrip(tripId);
            this.showToast(`Trip dispatch WhatsApp alert sent for ${tripId}!`, 'success');
            if (this.activeTab === 'whatsapp') {
                this.renderWhatsAppLogs();
            this.loadActiveStoppage();
            }
        } catch (err) {
            this.showToast('Failed to send trip WhatsApp alert: ' + err.message, 'danger');
        }
    },

    sendWhatsAppForAlert(alertId) {
        const alert = LCOS_State.getAlerts().find(a => a.id === alertId);
        this.switchTab('whatsapp');
        if (alert && alert.driverId) {
            const driver = LCOS_State.getDrivers().find(d => d.id === alert.driverId);
            if (driver) {
                const phoneInput = document.getElementById('wa-send-phone');
                if (phoneInput) phoneInput.value = driver.phone.replace(/[^0-9]/g, '');
            }
        }
        const msgInput = document.getElementById('wa-send-text');
        if (msgInput && alert) {
            msgInput.value = `⚠️ URGENT ALERT: Alert ${alert.id} (${alert.type}) - ${alert.message}. Please report your status to operations immediately.`;
            msgInput.focus();
        }
        this.showToast(`Composing WhatsApp alert inquiry.`, 'info');
    },

    renderDashboard() {
        // 1. Calculate and update stats
        const trips = LCOS_State.getTrips();
        const alerts = (LCOS_State.getAlerts() || []).filter(a => (a.status === 'Active' || a.status === 'Escalated') && a.type !== 'Incoming Call');
        
        const inTransitCount = trips.filter(t => t.status === 'IN_TRANSIT').length;
        const delayedCount = trips.filter(t => t.status === 'DELAYED').length;
        const alertsCount = alerts.length;
        
        // Count trips closed today (simulated day = 04 Aug 2026)
        const deliveredToday = trips.filter(t => {
            if (t.status !== 'CLOSED' || !t.deliveryInfo) return false;
            const closedDate = new Date(t.deliveryInfo.closedTimestamp);
            return closedDate.getDate() === 4 && closedDate.getMonth() === 7 && closedDate.getFullYear() === 2026;
        }).length;

        document.getElementById('stat-transit').textContent = inTransitCount;
        document.getElementById('stat-delayed').textContent = delayedCount;
        document.getElementById('stat-alerts').textContent = alertsCount;
        document.getElementById('stat-delivered').textContent = deliveredToday;

        // 2. Active alerts ticker & box
        const alertsBanner = document.getElementById('alerts-banner');
        const ticker = document.getElementById('alerts-ticker-content');
        const alertsFeed = document.getElementById('alerts-feed-content');
        const bannerBadge = document.getElementById('alert-banner-badge');
        const bannerActions = document.getElementById('alerts-banner-actions');
        
        if (alertsCount > 0) {
            if (alertsBanner) alertsBanner.style.display = 'flex';

            // Find stoppage, driver delay, or emergency breakdown alert
            const stoppageAlert = alerts.find(a => (
                a.type === 'Stoppage Detected' || 
                a.type === 'Driver Delay Report' || 
                a.type === 'Emergency Breakdown' ||
                (a.message && (
                    a.message.toLowerCase().includes('halted >20') || 
                    a.message.toLowerCase().includes('whatsapp report') || 
                    a.message.toLowerCase().includes('stoppage') ||
                    a.message.toLowerCase().includes('breakdown') ||
                    a.message.toLowerCase().includes('transit delay')
                ))
            ));

            if (stoppageAlert) {
                if (bannerBadge) {
                    bannerBadge.textContent = '🚨 STOPPAGE';
                    bannerBadge.style.background = '#ef4444';
                }
                if (ticker) {
                    ticker.style.animation = 'none';
                    ticker.style.position = 'static';
                    ticker.innerHTML = `<div class="ticker-item" style="color:#fef08a; font-weight:700; font-size:0.92rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">🚨 ${stoppageAlert.message}</div>`;
                }
                if (bannerActions) {
                    const phone = stoppageAlert.driverPhone || stoppageAlert.driver_phone || '916382897998';
                    const vehId = stoppageAlert.vehicleId || stoppageAlert.vehicle_id || 'TN-59-EF-9012';
                    bannerActions.innerHTML = `
                        <button class="btn btn-success" style="padding:0.3rem 0.75rem; font-size:0.8rem; background:#10b981; border:1px solid #059669; font-weight:700; color:#fff; border-radius:6px; cursor:pointer;" onclick="app.acceptCurrentStoppageReason('${vehId}', '${stoppageAlert.id}')">✅ Accept</button>
                        <button class="btn btn-danger" style="padding:0.3rem 0.75rem; font-size:0.8rem; background:#ef4444; border:1px solid #dc2626; font-weight:700; color:#fff; border-radius:6px; cursor:pointer;" onclick="app.declineAndCallDriver('${vehId}', '${phone}', '${stoppageAlert.id}')">📞 Decline & Call</button>
                        <button class="btn btn-secondary" style="padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="app.showDashboardAlerts()">View All</button>
                    `;
                }
            } else {
                if (bannerBadge) {
                    bannerBadge.textContent = 'Alert';
                    bannerBadge.style.background = 'var(--color-danger)';
                }
                if (ticker) {
                    if (alerts.length <= 1) {
                        ticker.style.animation = 'none';
                        ticker.style.position = 'static';
                    } else {
                        ticker.style.animation = 'scroll-alerts 12s infinite';
                        ticker.style.position = 'absolute';
                    }
                    ticker.innerHTML = alerts.map(a => `<div class="ticker-item">⚠️ ${a.message}</div>`).join('');
                }
                if (bannerActions) {
                    bannerActions.innerHTML = `<button class="btn btn-secondary" style="padding:0.2rem 0.5rem; font-size:0.75rem;" onclick="app.showDashboardAlerts()">View Alerts</button>`;
                }
            }
            
            if (alertsFeed) {
                alertsFeed.innerHTML = alerts.map(a => {
                    let badgeClass = a.severity === 'danger' || a.severity === 'critical' ? 'badge-delayed' : 'badge-pending';
                    let actionBtn = '';
                    const role = LCOS_State.getCurrentRole();

                    if (a.type === 'Stoppage Detected' || a.type === 'Driver Delay Report' || a.type === 'Emergency Breakdown' || (a.message && a.message.toLowerCase().includes('stoppage'))) {
                        const phone = a.driverPhone || a.driver_phone || '916382897998';
                        const vehId = a.vehicleId || a.vehicle_id || 'TN-59-EF-9012';
                        actionBtn = `
                            <button class="btn btn-success" style="padding:0.25rem 0.6rem; font-size:0.75rem; background:#10b981; border:1px solid #059669; font-weight:700; color:#fff; border-radius:4px; cursor:pointer;" onclick="app.acceptCurrentStoppageReason('${vehId}', '${a.id}')">✅ Accept</button>
                            <button class="btn btn-danger" style="padding:0.25rem 0.6rem; font-size:0.75rem; background:#ef4444; border:1px solid #dc2626; font-weight:700; color:#fff; border-radius:4px; cursor:pointer;" onclick="app.declineAndCallDriver('${vehId}', '${phone}', '${a.id}')">📞 Decline & Call</button>
                        `;
                    } else if (role === 'owner') {
                        actionBtn = `<span class="badge badge-draft" style="font-size:0.7rem; padding:0.15rem 0.35rem;">Owner Monitoring</span>`;
                    } else if (a.type === 'Incoming Call') {
                        actionBtn = `<button class="btn btn-primary" style="padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="app.answerSimulatedCall('${a.id}')">Answer</button>`;
                    } else if (a.type === 'No Update' || a.type === 'Unreachable' || a.type === 'Breakdown') {
                        if (role === 'tracking_team') {
                            if (a.escalated) {
                                actionBtn = `<span class="badge badge-escalated" style="font-size:0.7rem; padding:0.15rem 0.35rem;">Escalated to Mgr</span>`;
                            } else {
                                actionBtn = `<button class="btn btn-warning" style="padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="app.escalateAlertToManager('${a.id}')">Escalate to Manager</button>`;
                            }
                        } else {
                            if (a.type === 'Breakdown') {
                                actionBtn = `<button class="btn btn-danger" style="padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="app.resolveBreakdownAlert('${a.id}')">Resolve Breakdown</button>`;
                            } else {
                                actionBtn = `<button class="btn btn-warning" style="padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="app.startEscalationCall('${a.id}')">Call Driver</button>`;
                            }
                        }
                    }

                    let cardClass = "flex justify-between align-center";
                    if (a.escalated) {
                        cardClass += " alert-escalated-card";
                    }

                    return `
                        <div class="${cardClass}" style="padding:0.5rem; border-radius:6px; background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.15); margin-bottom:0.25rem;">
                            <div style="font-size:0.8rem; max-width:70%;">
                                <span class="badge ${badgeClass}" style="padding:0.1rem 0.3rem; font-size:0.65rem;">${a.type}</span>
                                ${a.escalated ? `<span class="badge badge-escalated" style="font-size:0.6rem; padding:0 0.2rem; margin-left:0.25rem;">ESCALATED</span>` : ''}
                                <span style="margin-left:0.25rem; font-weight:500;">${a.message}</span>
                            </div>
                            <div class="flex gap-2">
                                ${actionBtn}
                                ${(role === 'branch_manager' || role === 'super_admin') ? `<button class="btn btn-secondary" style="padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="app.dismissAlert('${a.id}')">Dismiss</button>` : ''}
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } else {
            if (alertsBanner) alertsBanner.style.display = 'none';
            if (alertsFeed) {
                alertsFeed.innerHTML = `<div style="text-align:center; padding:1rem; color:var(--text-muted); font-size:0.85rem;">All systems operational. No active alerts.</div>`;
            }
        }

        // 3. Interactive Route & Telemetry Simulator Cockpit
        this.renderInteractiveSimulator();

        // 4. Render Charts (Branch Load and Delay distribution)
        this.renderDashboardCharts();

        // 5. Render Requests (Manager view only)
        const reqBox = document.getElementById('manager-requests-box');
        const reqFeed = document.getElementById('requests-feed-content');
        const role = LCOS_State.getCurrentRole();

        if ((role === 'branch_manager' || role === 'owner') && reqBox && reqFeed) {
            reqBox.style.display = 'block';
            const requests = LCOS_State.getRequests();
            if (requests.length === 0) {
                reqFeed.innerHTML = `<div style="text-align:center; padding:1rem; color:var(--text-muted); font-size:0.8rem;">No pending supervisor requests.</div>`;
            } else {
                reqFeed.innerHTML = requests.map(r => {
                    const isApp = r.status === 'Approved';
                    let badgeClass = isApp ? 'badge-request-approved' : 'badge-request-pending';
                    let actionBtn = '';
                    
                    if (!isApp && role === 'branch_manager') {
                        actionBtn = `<button class="btn btn-success" style="padding:0.2rem 0.4rem; font-size:0.7rem;" onclick="app.approveRequest('${r.id}')">Approve</button>`;
                    } else if (!isApp && role === 'owner') {
                        actionBtn = `<span class="badge badge-request-pending" style="font-size:0.65rem; padding:0.15rem 0.3rem;">Pending</span>`;
                    }

                    let desc = '';
                    if (r.type === 'Add Driver') desc = `Driver: ${r.data.name} (License: ${r.data.license})`;
                    else if (r.type === 'Add Vehicle') desc = `Vehicle: ${r.data.id} (${r.data.type})`;
                    else if (r.type === 'Add Stock') desc = `Stock: +${r.data.quantity} units of ${r.data.commodityId} at ${r.data.branchId}`;

                    return `
                        <div class="request-item-card ${isApp ? 'approved' : ''}">
                            <div style="max-width:70%;">
                                <span class="badge ${badgeClass}" style="padding:0.1rem 0.3rem; font-size:0.6rem;">${r.type}</span>
                                <div style="font-weight:600; margin-top:0.15rem; font-size:0.75rem; color:var(--text-primary);">${desc}</div>
                                <div style="font-size:0.65rem; color:var(--text-muted);">${r.id} | Status: ${r.status}</div>
                            </div>
                            <div>
                                ${actionBtn}
                            </div>
                        </div>
                    `;
                }).reverse().join('');
            }
        } else if (reqBox) {
            reqBox.style.display = 'none';
        }

        // 6. Update Map active routes & reports
        this.updateMapReport();
    },

    renderDashboardCharts() {
        const trips = LCOS_State.getTrips();
        const branches = LCOS_State.getBranches();

        // Calculate branch trip volumes
        const branchData = branches.map(br => {
            const sent = trips.filter(t => t.sourceBranchId === br.id).length;
            const received = trips.filter(t => t.destinationBranchId === br.id).length;
            return { branchName: br.name, sent, received };
        }).filter(b => b.sent > 0 || b.received > 0).slice(0, 8); // Top 8 active branches for chart spacing

        LCOS_Charts.renderBranchVolumeChart('branch-chart-container', branchData);

        // Calculate Delay reason distribution
        const delaysCount = {
            'Traffic': 0,
            'Breakdown': 0,
            'Weather': 0,
            'Loading': 0,
            'Other': 0
        };

        trips.forEach(t => {
            t.transitUpdates.forEach(upd => {
                if (upd.status === 'DELAYED' && upd.delayReason) {
                    const reason = upd.delayReason;
                    if (reason.includes('Traffic')) delaysCount['Traffic']++;
                    else if (reason.includes('Breakdown')) delaysCount['Breakdown']++;
                    else if (reason.includes('Weather')) delaysCount['Weather']++;
                    else if (reason.includes('Loading')) delaysCount['Loading']++;
                    else delaysCount['Other']++;
                }
            });
        });

        const delayChartData = [
            { label: 'Traffic Jam', value: delaysCount['Traffic'] },
            { label: 'Breakdown', value: delaysCount['Breakdown'] },
            { label: 'Weather Delay', value: delaysCount['Weather'] },
            { label: 'Loading Issue', value: delaysCount['Loading'] },
            { label: 'Other Details', value: delaysCount['Other'] }
        ];

        LCOS_Charts.renderDelayReasonChart('delay-chart-container', delayChartData);
    },

    // --- Interactive Telemetry & Route Simulator Cockpit ---

    renderInteractiveSimulator() {
        const originSelect = document.getElementById('sim-origin-district');
        const destSelect = document.getElementById('sim-dest-district');
        if (!originSelect || !destSelect) return;

        // 1. Populate live running trips dropdown with Trip ID, Log ID, Vehicle, Driver & Emp ID
        const liveTripSelect = document.getElementById('sim-live-trip-select');
        const trips = LCOS_State.getTrips() || [];
        const runningTrips = trips.filter(t => t.status !== 'CLOSED');

        if (liveTripSelect) {
            const currentSelected = liveTripSelect.value;
            liveTripSelect.innerHTML = '<option value="">-- Choose Live Running Vehicle (or manual simulator below) --</option>';

            const statusMap = {
                CREATED: 'Draft Ready',
                DISPATCH_APPROVED: 'Approved',
                DRIVER_CALLED: 'Driver Called',
                DRIVER_CONFIRMED: 'Driver Ready',
                IN_TRANSIT: 'In Transit',
                DELAYED: 'Delayed / Halt',
                ARRIVED: 'Arrived',
                DELIVERY_CONFIRMED: 'Delivering',
                CLOSED: 'Delivered'
            };

            runningTrips.forEach(t => {
                const driver = (LCOS_State.getDrivers() || []).find(d => d.id === t.driverId);
                const driverName = t.driver_name || (driver ? driver.name : (t.driverId || 'Driver'));
                const empId = t.created_by_emp_id || t.driverId || 'EMP-101';
                const srcB = (LCOS_State.getBranches() || []).find(b => b.id === t.sourceBranchId);
                const destB = (LCOS_State.getBranches() || []).find(b => b.id === t.destinationBranchId);
                const routeText = `${srcB?.name || t.sourceBranchId} → ${destB?.name || t.destinationBranchId}`;
                const statusLabel = statusMap[t.status] || t.status;
                const dispatchId = t.dispatchId || t.dispatch_id || `LOG-${t.id}`;

                liveTripSelect.innerHTML += `
                    <option value="${t.id}">
                        ${t.id} [${dispatchId}] | ${t.vehicleId} • ${driverName} (${empId}) • ${routeText} [${statusLabel}]
                    </option>
                `;
            });

            if (currentSelected && runningTrips.some(t => t.id === currentSelected)) {
                liveTripSelect.value = currentSelected;
            }

            const countBadge = document.getElementById('sim-running-count-badge');
            if (countBadge) {
                countBadge.textContent = `${runningTrips.length} Running Trucks`;
            }

            if (!this._simTripSelectBound) {
                this._simTripSelectBound = true;
                liveTripSelect.addEventListener('change', (e) => {
                    this.handleLiveTripSelection(e.target.value);
                });
            }
        }

        // Populate 38 districts if options not yet populated
        if (originSelect.options.length <= 1) {
            const branches = LCOS_State.getBranches();
            let branchList = branches && branches.length > 0 ? [...branches] : [];
            
            if (branchList.length === 0) {
                // Fallback 38 districts
                const districtNames = [
                    'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri', 'Dindigul',
                    'Erode', 'Kallakurichi', 'Kancheepuram', 'Karur', 'Krishnagiri', 'Madurai', 'Mayiladuthurai',
                    'Nagapattinam', 'Namakkal', 'Nilgiris', 'Perambalur', 'Pudukkottai', 'Ramanathapuram',
                    'Ranipet', 'Salem', 'Sivaganga', 'Tenkasi', 'Thanjavur', 'Theni', 'Thoothukudi',
                    'Tiruchirappalli', 'Tirunelveli', 'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai',
                    'Tiruvarur', 'Vellore', 'Viluppuram', 'Virudhunagar'
                ];
                branchList = districtNames.map(name => ({ id: `BR-${name.substring(0,3).toUpperCase()}`, name }));
            }

            branchList.sort((a, b) => a.name.localeCompare(b.name));

            originSelect.innerHTML = branchList.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
            destSelect.innerHTML = branchList.map(b => `<option value="${b.id}">${b.name}</option>`).join('');

            // Defaults: Chennai (BR-CHE) to Coimbatore (BR-CBE)
            if (originSelect.querySelector('option[value="BR-CHE"]')) originSelect.value = 'BR-CHE';
            if (destSelect.querySelector('option[value="BR-CBE"]')) destSelect.value = 'BR-CBE';

            // Event listeners
            originSelect.addEventListener('change', () => this.updateSimulatorMetrics());
            destSelect.addEventListener('change', () => this.updateSimulatorMetrics());
            document.getElementById('sim-vehicle-type')?.addEventListener('change', () => this.updateSimulatorMetrics());

            const speedSlider = document.getElementById('sim-speed-slider');
            if (speedSlider) {
                speedSlider.addEventListener('input', (e) => {
                    const spd = parseInt(e.target.value, 10);
                    const spdDisplay = document.getElementById('sim-speed-display');
                    const spdBadge = document.getElementById('sim-speed-badge');
                    const tempDisplay = document.getElementById('sim-engine-temp');
                    const fuelVal = document.getElementById('sim-fuel-level');

                    if (spdDisplay) spdDisplay.textContent = spd;
                    if (spdBadge) {
                        if (spd === 0) {
                            spdBadge.className = 'badge';
                            spdBadge.style.background = 'rgba(239, 68, 68, 0.2)';
                            spdBadge.style.color = '#f87171';
                            spdBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                            spdBadge.textContent = '🟡 Stopped / Halted';
                        } else if (spd > 80) {
                            spdBadge.className = 'badge';
                            spdBadge.style.background = 'rgba(239, 68, 68, 0.2)';
                            spdBadge.style.color = '#f87171';
                            spdBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                            spdBadge.textContent = '🔴 Overspeeding (>80 km/h)';
                        } else {
                            spdBadge.className = 'badge';
                            spdBadge.style.background = 'rgba(16, 185, 129, 0.15)';
                            spdBadge.style.color = '#10b981';
                            spdBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                            spdBadge.textContent = '🟢 Cruising Normal';
                        }
                    }
                    if (tempDisplay) {
                        tempDisplay.textContent = `${82 + Math.floor(spd / 12) * 2}°C OK`;
                    }
                    if (fuelVal) {
                        fuelVal.textContent = `${74 - Math.floor(spd / 30)}% (${185 - Math.floor(spd / 5)}L)`;
                    }
                });
            }

            document.getElementById('btn-sim-dispatch')?.addEventListener('click', () => {
                this.simulateLiveDispatch();
            });

            document.getElementById('btn-sim-stoppage')?.addEventListener('click', () => {
                this.simulateStoppageIncident();
            });

            document.getElementById('btn-sim-ping')?.addEventListener('click', () => {
                this.simulateDriverTelemetryPing();
            });
        }

        this.updateSimulatorMetrics();
    },

    handleLiveTripSelection(tripId) {
        const metaCard = document.getElementById('sim-trip-meta-card');
        const originSelect = document.getElementById('sim-origin-district');
        const destSelect = document.getElementById('sim-dest-district');
        const vehTypeSelect = document.getElementById('sim-vehicle-type');
        const dispatchBtn = document.getElementById('btn-sim-dispatch');

        if (!tripId) {
            if (metaCard) metaCard.style.display = 'none';
            this.selectedLiveSimTrip = null;
            if (dispatchBtn) dispatchBtn.innerHTML = '🚀 Simulate Live Dispatch on Map';
            this.updateSimulatorMetrics();
            return;
        }

        const trip = (LCOS_State.getTrips() || []).find(t => t.id === tripId);
        if (!trip) return;

        this.selectedLiveSimTrip = trip;

        if (dispatchBtn) {
            dispatchBtn.innerHTML = `🚀 Track Vehicle ${trip.vehicleId} (${trip.id}) on Map`;
        }

        // Show meta card and fill details
        if (metaCard) {
            metaCard.style.display = 'block';

            const driver = (LCOS_State.getDrivers() || []).find(d => d.id === trip.driverId);
            const driverName = trip.driver_name || (driver ? driver.name : (trip.driverId || 'Selvam R.'));
            const commodity = (LCOS_State.getCommodities() || []).find(c => c.id === trip.commodityId);
            const cargoName = trip.commodity_name || (commodity ? commodity.name : 'Goods');
            const empId = trip.created_by_emp_id || trip.driverId || 'EMP-101';
            const dispatchId = trip.dispatchId || trip.dispatch_id || `LOG-${trip.id}`;

            const badgeTripId = document.getElementById('sim-badge-trip-id');
            const badgeDispatchId = document.getElementById('sim-badge-dispatch-id');
            if (badgeTripId) badgeTripId.textContent = trip.id;
            if (badgeDispatchId) badgeDispatchId.textContent = `Log ID: ${dispatchId}`;
            
            const statusEl = document.getElementById('sim-badge-trip-status');
            if (statusEl) {
                statusEl.textContent = trip.status;
                if (trip.status === 'DELAYED') {
                    statusEl.style.background = 'rgba(225,29,72,0.12)';
                    statusEl.style.color = '#e11d48';
                    statusEl.style.border = '1px solid rgba(225,29,72,0.3)';
                } else if (trip.status === 'IN_TRANSIT') {
                    statusEl.style.background = 'rgba(16,185,129,0.14)';
                    statusEl.style.color = '#059669';
                    statusEl.style.border = '1px solid rgba(16,185,129,0.3)';
                } else {
                    statusEl.style.background = 'rgba(15,118,110,0.12)';
                    statusEl.style.color = '#0f766e';
                    statusEl.style.border = '1px solid rgba(15,118,110,0.3)';
                }
            }

            const metaVeh = document.getElementById('sim-meta-veh');
            const metaCargo = document.getElementById('sim-meta-cargo');
            const metaDriver = document.getElementById('sim-meta-driver');
            const metaEmp = document.getElementById('sim-meta-emp');

            if (metaVeh) metaVeh.textContent = trip.vehicleId;
            if (metaCargo) metaCargo.textContent = `${cargoName} (${trip.quantity} Units)`;
            if (metaDriver) metaDriver.textContent = driverName;
            if (metaEmp) metaEmp.textContent = empId;
        }

        // Auto-select origin and destination
        if (originSelect && trip.sourceBranchId) {
            originSelect.value = trip.sourceBranchId;
        }
        if (destSelect && trip.destinationBranchId) {
            destSelect.value = trip.destinationBranchId;
        }

        // Auto-select vehicle type if matching
        const vehicle = (LCOS_State.getVehicles() || []).find(v => v.id === trip.vehicleId);
        if (vehicle && vehTypeSelect) {
            if (vehicle.type?.toLowerCase().includes('container') || vehicle.type?.toLowerCase().includes('trailer')) {
                vehTypeSelect.value = 'trailer-40t';
            } else if (vehicle.type?.toLowerCase().includes('mini')) {
                vehTypeSelect.value = 'reefer-12t';
            } else {
                vehTypeSelect.value = 'lorry-16t';
            }
        }

        // Update speed slider based on status
        const slider = document.getElementById('sim-speed-slider');
        if (slider) {
            slider.value = trip.status === 'DELAYED' ? 0 : 58;
            slider.dispatchEvent(new Event('input'));
        }

        this.updateSimulatorMetrics();
    },

    updateSimulatorMetrics() {
        const originSelect = document.getElementById('sim-origin-district');
        const destSelect = document.getElementById('sim-dest-district');
        const vehSelect = document.getElementById('sim-vehicle-type');
        if (!originSelect || !destSelect) return;

        const originId = originSelect.value;
        const destId = destSelect.value;
        const vehType = vehSelect ? vehSelect.value : 'lorry-16t';

        const originGPS = this.getBranchGPS(originId) || { lat: 13.0827, lng: 80.2707 };
        const destGPS = this.getBranchGPS(destId) || { lat: 11.0168, lng: 76.9558 };

        // Haversine distance * road curvature factor
        const R = 6371;
        const dLat = (destGPS.lat - originGPS.lat) * Math.PI / 180;
        const dLng = (destGPS.lng - originGPS.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(originGPS.lat * Math.PI / 180) * Math.cos(destGPS.lat * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        let distKm = Math.round(R * c * 1.28);
        if (distKm < 25) distKm = 38; // minimum transit

        let avgSpeed = 55;
        let kmPerL = 4.0;
        let tollRatePer100Km = 320;

        if (vehType === 'multi-24t') {
            avgSpeed = 48;
            kmPerL = 3.4;
            tollRatePer100Km = 390;
        } else if (vehType === 'trailer-40t') {
            avgSpeed = 44;
            kmPerL = 2.7;
            tollRatePer100Km = 480;
        } else if (vehType === 'reefer-12t') {
            avgSpeed = 58;
            kmPerL = 3.8;
            tollRatePer100Km = 310;
        }

        const hours = Math.floor(distKm / avgSpeed);
        const mins = Math.round(((distKm % avgSpeed) / avgSpeed) * 60);

        const liters = Math.round(distKm / kmPerL);
        const fuelCost = Math.round(liters * 92.5); // ₹92.5 / Liter Diesel in TN

        const tollCount = Math.max(1, Math.round(distKm / 75));
        const tollCost = Math.round((distKm / 100) * tollRatePer100Km);

        const distEl = document.getElementById('sim-val-distance');
        const durEl = document.getElementById('sim-val-duration');
        const fuelEl = document.getElementById('sim-val-fuel');
        const tollEl = document.getElementById('sim-val-toll');

        if (distEl) distEl.textContent = `${distKm} km`;
        if (durEl) durEl.textContent = `${hours}h ${mins}m`;
        if (fuelEl) fuelEl.textContent = `${liters} L • ₹${fuelCost.toLocaleString('en-IN')}`;
        if (tollEl) tollEl.textContent = `${tollCount} Tolls • ₹${tollCost.toLocaleString('en-IN')}`;
    },

    simulateLiveDispatch() {
        const originSelect = document.getElementById('sim-origin-district');
        const destSelect = document.getElementById('sim-dest-district');
        if (!originSelect || !destSelect) return;

        const originVal = originSelect.value;
        const destVal = destSelect.value;

        const originBranch = (LCOS_State.getBranches() || []).find(b => b.id === originVal);
        const destBranch = (LCOS_State.getBranches() || []).find(b => b.id === destVal);
        const originName = originBranch ? originBranch.name : (originSelect.options[originSelect.selectedIndex]?.text || 'Origin');
        const destName = destBranch ? destBranch.name : (destSelect.options[destSelect.selectedIndex]?.text || 'Destination');

        const originGPS = this.getBranchGPS(originVal) || { lat: 13.0827, lng: 80.2707 };
        const destGPS = this.getBranchGPS(destVal) || { lat: 11.0168, lng: 76.9558 };

        // Ensure Leaflet map is loaded
        if (!this.leafletMap) {
            this.renderMap();
        }
        const map = this.leafletMap || window.leafletMap;

        if (map && typeof L !== 'undefined') {
            map.invalidateSize();

            if (this.simRouteLayer) {
                map.removeLayer(this.simRouteLayer);
            }

            const midLat = (originGPS.lat + destGPS.lat) / 2 + 0.04;
            const midLng = (originGPS.lng + destGPS.lng) / 2 - 0.03;
            const latlngs = [
                [originGPS.lat, originGPS.lng],
                [midLat, midLng],
                [destGPS.lat, destGPS.lng]
            ];

            const simGroup = L.featureGroup();

            // 1. Origin marker
            const originMarker = L.circleMarker([originGPS.lat, originGPS.lng], {
                radius: 7,
                fillColor: '#10b981',
                color: '#ffffff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.95
            }).bindTooltip(`📍 Origin: ${originName}`, { permanent: true, direction: 'top', className: 'sim-hub-tooltip' });
            originMarker.addTo(simGroup);

            // 2. Destination marker
            const destMarker = L.circleMarker([destGPS.lat, destGPS.lng], {
                radius: 7,
                fillColor: '#ef4444',
                color: '#ffffff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.95
            }).bindTooltip(`🏁 Dest: ${destName}`, { permanent: true, direction: 'top', className: 'sim-hub-tooltip' });
            destMarker.addTo(simGroup);

            // 3. Glowing cyan dashed polyline
            L.polyline(latlngs, {
                color: '#0284c7',
                weight: 9,
                opacity: 0.35,
                lineCap: 'round'
            }).addTo(simGroup);

            const polyline = L.polyline(latlngs, {
                color: '#38bdf8',
                weight: 5,
                opacity: 0.95,
                dashArray: '10, 8'
            }).addTo(simGroup);

            // 4. Moving truck marker at midpoint
            const simTruckIcon = L.divIcon({
                className: 'sim-truck-marker',
                html: `<div style="background:#0284c7; width:34px; height:34px; border-radius:50%; border:2px solid #ffffff; display:flex; align-items:center; justify-content:center; box-shadow:0 0 20px rgba(56,189,248,1); font-size:18px;">🚚</div>`,
                iconSize: [34, 34],
                iconAnchor: [17, 17]
            });

            const trip = this.selectedLiveSimTrip;
            const tripId = trip ? trip.id : 'TRIP-1002';
            const vehId = trip ? trip.vehicleId : 'TN-30-SIM-99';
            const dispatchId = trip ? (trip.dispatchId || trip.dispatch_id || `LOG-${trip.id}`) : 'DISP-2002';
            const driver = trip ? ((LCOS_State.getDrivers() || []).find(d => d.id === trip.driverId)) : null;
            const driverName = trip ? (trip.driver_name || (driver ? driver.name : 'Selvam R.')) : 'Selvam R.';
            const empId = trip ? (trip.created_by_emp_id || trip.driverId || 'EMP-101') : 'EMP-DRV-101';
            const titleText = trip ? `🚚 Live Running Truck Tracking` : `🚀 Simulated Express Dispatch`;

            const truckMarker = L.marker([midLat, midLng], { icon: simTruckIcon }).addTo(simGroup);
            truckMarker.bindPopup(`
                <div style="font-size:0.82rem; font-family:var(--font-body); color:#0f172a; padding:0.35rem; min-width:235px;">
                    <div style="font-weight:700; color:#0284c7; font-size:0.92rem; margin-bottom:0.25rem;">${titleText}</div>
                    <div><strong>Tracking / Trip ID:</strong> <span style="color:#0284c7; font-weight:700;">${tripId}</span></div>
                    <div><strong>Log / Dispatch ID:</strong> <span style="color:#475569;">${dispatchId}</span></div>
                    <div><strong>Vehicle Reg:</strong> <strong style="color:#0369a1;">${vehId}</strong></div>
                    <div><strong>Assigned Driver:</strong> ${driverName}</div>
                    <div><strong>Driver / Emp ID:</strong> <span style="color:#b45309; font-weight:700; font-family:monospace;">${empId}</span></div>
                    <div><strong>Corridor:</strong> ${originName} → ${destName}</div>
                    <div><strong>Telemetry:</strong> 58 km/h • GPS 4G-LTE Synced</div>
                    <div style="color:#10b981; font-weight:700; margin-top:0.35rem;">● Live Active Transit Telemetry</div>
                </div>
            `).openPopup();

            simGroup.addTo(map);
            this.simRouteLayer = simGroup;

            map.fitBounds(polyline.getBounds(), { padding: [40, 40], maxZoom: 12 });

            setTimeout(() => {
                map.invalidateSize();
                truckMarker.openPopup();
            }, 300);
        } else {
            console.warn('Leaflet map instance was not ready when simulating dispatch.');
        }

        const activeTrip = this.selectedLiveSimTrip;
        if (activeTrip) {
            this.showToast(`🚀 Tracking live truck ${activeTrip.vehicleId} [Trip: ${activeTrip.id}, Emp: ${activeTrip.created_by_emp_id || 'EMP-101'}] from ${originName} to ${destName}!`, 'success');
        } else {
            this.showToast(`🚀 Dispatched simulated truck TN-30-SIM-99 from ${originName} to ${destName}! Tracked on live map.`, 'success');
        }
    },

    simulateStoppageIncident() {
        const slider = document.getElementById('sim-speed-slider');
        if (slider) {
            slider.value = 0;
            slider.dispatchEvent(new Event('input'));
        }

        const trip = this.selectedLiveSimTrip;
        const tripId = trip ? trip.id : 'TRIP-1003';
        const vehId = trip ? trip.vehicleId : 'TN-37-CD-5678';
        const driver = trip ? ((LCOS_State.getDrivers() || []).find(d => d.id === trip.driverId)) : null;
        const driverName = trip ? (trip.driver_name || (driver ? driver.name : 'Rajesh Nair')) : 'Rajesh Nair';
        const empId = trip ? (trip.created_by_emp_id || trip.driverId || 'EMP-101') : 'EMP-DRV-101';

        const alertItem = {
            id: `ALT-SIM-${Date.now()}`,
            type: 'Stoppage Alert',
            message: `Vehicle ${vehId} [Trip: ${tripId}, Driver: ${driverName}, Emp ID: ${empId}] halted >20 mins on NH Highway!`,
            severity: 'danger',
            timestamp: new Date().toISOString()
        };

        const banner = document.getElementById('alerts-banner');
        const ticker = document.getElementById('alerts-ticker-content');
        if (banner) banner.style.display = 'flex';
        if (ticker) {
            ticker.innerHTML = `<div class="ticker-item">⚠️ ${alertItem.message}</div>`;
        }

        this.showToast(`⚠️ Stoppage Alert: Vehicle ${vehId} (Trip ${tripId}, Emp ${empId}) halted >20 mins! Supervisor notified.`, 'danger');
    },

    simulateDriverTelemetryPing() {
        const trip = this.selectedLiveSimTrip;
        const tripId = trip ? trip.id : 'TRIP-1002';
        const vehId = trip ? trip.vehicleId : 'TN-59-EF-9012';
        const driver = trip ? ((LCOS_State.getDrivers() || []).find(d => d.id === trip.driverId)) : null;
        const driverName = trip ? (trip.driver_name || (driver ? driver.name : 'Saravanan K.')) : 'Saravanan K.';
        const empId = trip ? (trip.created_by_emp_id || trip.driverId || 'EMP-101') : 'EMP-DRV-101';

        this.showToast(`📡 Pinging vehicle ${vehId} [Trip: ${tripId}, Emp ID: ${empId}]... 4G-LTE Lock OK (Latency: 34ms)`, 'info');
        setTimeout(() => {
            this.showToast(`📞 Driver ${driverName} [Emp: ${empId}] on ${vehId} responded to check-in. Engine & cargo intact.`, 'success');
        }, 1200);
    },

    renderOperationsConsole() {
        const select = document.getElementById('console-trip-select');
        const trips = LCOS_State.getTrips();
        
        // Prefill dropdown with created and active trips
        const currentVal = select.value;
        select.innerHTML = '<option value="">-- Choose Active Trip --</option>';
        trips.forEach(t => {
            if (t.status !== 'CLOSED') {
                const com = LCOS_State.getCommodities().find(c => c.id === t.commodityId);
                const comName = com ? com.name : 'Goods';
                select.innerHTML += `<option value="${t.id}">${t.id} - ${comName} (${t.quantity} Units) [${t.status}]</option>`;
            }
        });

        // Keep selection if exists and still active
        const tripExists = trips.some(t => t.id === currentVal && t.status !== 'CLOSED');
        if (tripExists) {
            select.value = currentVal;
            this.activeConsoleTripId = currentVal;
        } else if (!this.activeConsoleTripId) {
            document.getElementById('console-no-trip').style.display = 'block';
            document.getElementById('console-active-trip').style.display = 'none';
            return;
        }

        const trip = LCOS_State.getTripById(this.activeConsoleTripId);
        if (!trip || trip.status === 'CLOSED') {
            document.getElementById('console-no-trip').style.display = 'block';
            document.getElementById('console-active-trip').style.display = 'none';
            this.activeConsoleTripId = null;
            return;
        }

        // Trip is selected and active, render Console
        document.getElementById('console-no-trip').style.display = 'none';
        document.getElementById('console-active-trip').style.display = 'block';

        // Set text fields
        const sourceBr = LCOS_State.getBranches().find(b => b.id === trip.sourceBranchId);
        const destBr = LCOS_State.getBranches().find(b => b.id === trip.destinationBranchId);
        document.getElementById('c-trip-id').textContent = trip.id;
        document.getElementById('c-trip-route').textContent = `${sourceBr ? sourceBr.name : 'Unknown'} → ${destBr ? destBr.name : 'Unknown'}`;
        document.getElementById('c-dispatch-id').textContent = `DISP ID: ${trip.dispatchId}`;

        // Map status
        const statusMap = {
            CREATED: 'Draft Created',
            DISPATCH_APPROVED: 'Dispatch Approved',
            DRIVER_CALLED: 'Driver Called',
            DRIVER_CONFIRMED: 'Driver Confirmed',
            IN_TRANSIT: 'In Transit',
            DELAYED: 'Delayed Stop',
            ARRIVED: 'Arrived Dest',
            DELIVERY_CONFIRMED: 'Delivery Confirmed',
            CLOSED: 'Delivered & Closed'
        };
        const statusEl = document.getElementById('c-trip-status');
        statusEl.textContent = statusMap[trip.status] || trip.status;
        statusEl.className = 'badge';
        if (trip.status === 'CREATED') statusEl.classList.add('badge-draft');
        else if (trip.status === 'IN_TRANSIT') statusEl.classList.add('badge-transit');
        else if (trip.status === 'DELAYED') statusEl.classList.add('badge-delayed');
        else if (trip.status === 'ARRIVED' || trip.status === 'DELIVERY_CONFIRMED') statusEl.classList.add('badge-pending');
        else if (trip.status === 'CLOSED') statusEl.classList.add('badge-success');

        // Set Details Box
        const comObj = LCOS_State.getCommodities().find(c => c.id === trip.commodityId);
        document.getElementById('c-detail-commodity').textContent = `${comObj ? comObj.name : 'Commodity'} (${trip.quantity} ${comObj ? comObj.unit : 'Units'})`;
        document.getElementById('c-detail-vehicle').textContent = trip.vehicleId;
        
        const drvObj = LCOS_State.getDrivers().find(d => d.id === trip.driverId);
        document.getElementById('c-detail-driver').textContent = drvObj ? `${drvObj.name} (${drvObj.phone})` : 'None';
        
        const hlpObj = LCOS_State.getHelpers().find(h => h.id === trip.helperId);
        document.getElementById('c-detail-helper').textContent = hlpObj ? `${hlpObj.name} (${hlpObj.role})` : 'No Helper Assigned';

        // Add creator ID
        const creatorEl = document.getElementById('c-detail-creator');
        if (creatorEl) creatorEl.textContent = trip.createdBy || 'Pre-seeded Default';

        // Set Timings
        const formatDate = (isoStr) => {
            const date = new Date(isoStr);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + date.toLocaleDateString([], { day: '2-digit', month: 'short' });
        };
        document.getElementById('c-detail-dispatch-date').textContent = formatDate(trip.dispatchDate);
        document.getElementById('c-detail-eta').textContent = formatDate(trip.expectedDeliveryDate);

        // 12-Step Progress Stepper
        this.renderTimelineStepper(trip);

        // Logs
        const logsContainer = document.getElementById('c-transit-logs');
        if (trip.transitUpdates.length === 0) {
            logsContainer.innerHTML = `<div style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:1rem;">No status updates logged yet.</div>`;
        } else {
            logsContainer.innerHTML = trip.transitUpdates.map(u => {
                const isD = u.status === 'DELAYED';
                return `
                    <div style="font-size:0.8rem; border-left: 2px solid ${isD ? 'var(--color-danger)' : 'var(--color-transit)'}; padding-left: 0.5rem; margin-bottom: 0.25rem;">
                        <span style="color:var(--text-muted); font-size:0.7rem; font-family:monospace;">[${formatDate(u.timestamp)}]</span>
                        <strong style="color:${isD ? 'var(--color-warning)' : 'var(--color-transit)'};">${u.location}</strong>: 
                        <span>${u.remarks}</span>
                        ${u.operatorId ? `<span class="badge badge-draft" style="font-size:0.65rem; padding:0.05rem 0.25rem; margin-left:0.25rem; background:rgba(99,102,241,0.15); border:1px solid rgba(99,102,241,0.25);">${u.operatorId}</span>` : ''}
                        ${u.delayReason ? `<span class="badge badge-delayed" style="font-size:0.6rem; padding:0 0.25rem; margin-left:0.25rem;">${u.delayReason}</span>` : ''}
                    </div>
                `;
            }).reverse().join('');
        }

        // Render Action Console Area based on current trip status
        this.renderActionConsoleArea(trip);
    },

    renderTimelineStepper(trip) {
        const stepper = document.getElementById('timeline-stepper-console');
        const progressBar = document.createElement('div');
        progressBar.className = 'timeline-progress-bar';
        
        // Clear stepper
        stepper.innerHTML = '';
        stepper.appendChild(progressBar);

        // 10 key operational stages (trip concludes upon delivery at destination)
        const stages = [
            { key: 'CREATED', label: '1. Created' },
            { key: 'DISPATCH_APPROVED', label: '2. Approved' },
            { key: 'DRIVER_CALLED', label: '3. Called' },
            { key: 'DRIVER_CONFIRMED', label: '4. Confirmed' },
            { key: 'JOURNEY_STARTED', label: '5. Started' },
            { key: 'IN_TRANSIT', label: '6. In Transit' },
            { key: 'DELAY_STOP', label: '7. Delay' },
            { key: 'ARRIVED', label: '8. Reached' },
            { key: 'DELIVERY_CONFIRMED', label: '9. Unloaded' },
            { key: 'CLOSED', label: '10. Completed' }
        ];

        // Map trip status to active index
        let activeIdx = 0;
        if (trip.status === 'CREATED') activeIdx = 0;
        else if (trip.status === 'DISPATCH_APPROVED') activeIdx = 1;
        else if (trip.status === 'DRIVER_CALLED') activeIdx = 2;
        else if (trip.status === 'DRIVER_CONFIRMED') activeIdx = 3;
        else if (trip.status === 'IN_TRANSIT') {
            // If has updates, it is in step 6 (In Transit), else step 5 (Journey Started)
            activeIdx = trip.transitUpdates.length > 1 ? 5 : 4;
        }
        else if (trip.status === 'DELAYED') {
            activeIdx = 6; // Delay Monitor
        }
        else if (trip.status === 'ARRIVED') activeIdx = 7;
        else if (trip.status === 'DELIVERY_CONFIRMED') activeIdx = 8;
        else if (trip.status === 'CLOSED') activeIdx = 9;

        // Calculate progress line width percentage
        const progressWidth = (activeIdx / (stages.length - 1)) * 100;
        progressBar.style.width = `${progressWidth}%`;

        stages.forEach((stg, idx) => {
            const node = document.createElement('div');
            node.className = 'step-node';
            
            if (idx < activeIdx) {
                node.classList.add('completed');
            } else if (idx === activeIdx) {
                // Highlight delays in red/warning colors
                if (trip.status === 'DELAYED' && idx === 6) {
                    node.classList.add('warning');
                } else {
                    node.classList.add('active');
                }
            }

            node.innerHTML = `
                <div class="step-circle">${idx < activeIdx ? '✓' : idx + 1}</div>
                <div class="step-label">${stg.label}</div>
            `;
            
            stepper.appendChild(node);
        });
    },

    renderActionConsoleArea(trip) {
        const container = document.getElementById('console-action-area');
        container.innerHTML = '';

        const role = LCOS_State.getCurrentRole();
        
        let empIdHTML = '';
        if (role === 'tracking_team') {
            empIdHTML = `
                <div class="form-group margin-bottom-1" style="border-bottom:1px dashed var(--border-glass); padding-bottom:0.75rem; margin-bottom: 0.75rem;">
                    <label class="form-label" style="font-weight:600; color:var(--color-primary); font-size:0.75rem; margin-bottom:0.25rem;">Operator Employee ID (Emp ID) <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" id="op-emp-id" placeholder="e.g. EMP-101" required value="${this.operatorEmpId || ''}" oninput="app.operatorEmpId = this.value" style="background:rgba(0,0,0,0.35); font-size:0.75rem; padding:0.25rem 0.5rem; height:auto;">
                </div>
            `;
        }

        if (!trip.checklists) trip.checklists = {};
        if (!trip.checklists.dispatch) {
            trip.checklists.dispatch = { loaded: false, verified: false, vehicleReady: false, driverAvailable: false };
        }
        if (!trip.checklists.delivery) {
            trip.checklists.delivery = { quantityMatches: false, damagesChecked: false, missingChecked: false, conditionOk: false };
        }

        if (trip.status === 'CREATED') {
            // Stage 1: Created (Needs Dispatch checklist approval)
            const role = LCOS_State.getCurrentRole();
            const checklistComplete = this.isChecklistComplete(trip.checklists.dispatch);
            
            let btnText = 'Approve Dispatch & Generate Dispatch ID';
            let btnDisabled = !checklistComplete;
            let helpText = '';

            if (role === 'branch_manager') {
                btnText = 'View Only: Approved by Tracking Team';
                btnDisabled = true;
                helpText = `<p style="font-size:0.75rem; color:var(--color-warning); font-weight:600; margin-top:0.5rem; text-align:center;">⚠️ Supervisors monitor dispatches. Day-to-day operations checklists are approved by the Tracking Team.</p>`;
            }

            const simTime = new Date(LCOS_State.getSystemSettings().simulationTime);
            const schedTime = new Date(trip.dispatchDate);
            // Require a late dispatch reason only if the delay is more than 15 minutes (grace period)
            const isLate = (simTime.getTime() - schedTime.getTime()) > (15 * 60 * 1000);
            
            let lateRow = '';
            if (isLate && role === 'tracking_team') {
                lateRow = `
                    <div class="form-group" style="margin-top:0.75rem;" id="op-late-dispatch-row">
                        <label class="form-label" style="color:#ef4444; font-weight:600; margin-bottom:0.25rem;">⚠️ Reason for Late Dispatch (Required)</label>
                        <select class="form-control" id="op-late-reason" required>
                            <option value="">-- Select Delay Cause --</option>
                            <option value="Warehouse Loading Delay">Warehouse Cargo Loading Delay</option>
                            <option value="Driver/Helper Check-in Delay">Driver / Helper Check-in Delay</option>
                            <option value="Lorry Maintenance Inspection">Lorry Maintenance / Inspection Delay</option>
                            <option value="Permit Documentation Issue">Permit / Transit Documentation Delay</option>
                            <option value="Bad Local Weather">Bad Local Weather</option>
                        </select>
                    </div>
                `;
            }

            container.innerHTML = empIdHTML + `
                <h5 style="margin-bottom:0.75rem; font-size:0.95rem;">Phase 2: Dispatch Approval Checklist</h5>
                <p style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:0.75rem;">
                    Call Origin Branch Manager <strong>(${LCOS_State.getBranches().find(b => b.id === trip.sourceBranchId).manager})</strong> to verify the cargo loading:
                </p>
                <div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:1rem;">
                    <div class="checklist-item ${trip.checklists.dispatch.loaded ? 'checked' : ''}" onclick="app.toggleChecklist('dispatch', 'loaded')">
                        <div class="checkbox-custom"></div>
                        <div class="checklist-label">Cargo loaded correctly in truck</div>
                    </div>
                    <div class="checklist-item ${trip.checklists.dispatch.verified ? 'checked' : ''}" onclick="app.toggleChecklist('dispatch', 'verified')">
                        <div class="checkbox-custom"></div>
                        <div class="checklist-label">Dispatched stock quantity verified</div>
                    </div>
                    <div class="checklist-item ${trip.checklists.dispatch.vehicleReady ? 'checked' : ''}" onclick="app.toggleChecklist('dispatch', 'vehicleReady')">
                        <div class="checkbox-custom"></div>
                        <div class="checklist-label">Vehicle fitness inspection complete</div>
                    </div>
                    <div class="checklist-item ${trip.checklists.dispatch.driverAvailable ? 'checked' : ''}" onclick="app.toggleChecklist('dispatch', 'driverAvailable')">
                        <div class="checkbox-custom"></div>
                        <div class="checklist-label">Driver briefing & licenses validated</div>
                    </div>
                </div>
                ${lateRow}
                <button class="btn btn-success w-100" id="btn-submit-dispatch" ${btnDisabled ? 'disabled' : ''} style="margin-top:0.75rem;">
                    ${btnText}
                </button>
                ${helpText}
            `;

            document.getElementById('btn-submit-dispatch')?.addEventListener('click', () => {
                const empId = this.getConsoleEmpId();
                if (!empId) return;

                if (isLate) {
                    const reason = document.getElementById('op-late-reason').value;
                    if (!reason) {
                        this.showToast('Please select a reason for late dispatch.', 'warning');
                        return;
                    }
                    trip.lateDispatchReason = reason;
                }

                const simTime = LCOS_State.getSystemSettings().simulationTime;
                trip.transitUpdates.push({
                    timestamp: simTime,
                    location: 'Origin Branch',
                    condition: 'Good',
                    status: 'DISPATCH_APPROVED',
                    delayReason: '',
                    remarks: `Dispatch checklist approved. ${isLate ? 'DELAYED DISPATCH REASON: ' + trip.lateDispatchReason : ''}`,
                    operatorId: empId
                });
                trip.lastUpdateTimestamp = simTime;

                LCOS_State.updateTripStatus(trip.id, 'DISPATCH_APPROVED');
                
                // Add Call Log
                LCOS_State.addCallLog({
                    tripId: trip.id,
                    type: 'Dispatch Confirmation',
                    caller: 'Admin Office',
                    recipient: `${LCOS_State.getBranches().find(b => b.id === trip.sourceBranchId).name} Manager`,
                    notes: `Verified checklists. Dispatch approved. Operator: ${empId}. ${isLate ? 'DELAYED DISPATCH REASON: ' + trip.lateDispatchReason : ''}`
                });

                this.showToast('Trip Dispatch Approved. Status updated.', 'success');
                this.renderAll();
            });
        }
        else if (trip.status === 'DISPATCH_APPROVED') {
            // Stage 2: Approved, Needs to call driver
            const drv = LCOS_State.getDrivers().find(d => d.id === trip.driverId);
            const role = LCOS_State.getCurrentRole();
            const btnDisabled = role === 'branch_manager';
            const helpText = btnDisabled ? `<p style="font-size:0.75rem; color:var(--color-warning); font-weight:600; margin-top:0.5rem; text-align:center;">⚠️ View Only: Driver briefings are logged by the Tracking Team.</p>` : '';

            container.innerHTML = empIdHTML + `
                <h5 style="margin-bottom:0.75rem; font-size:0.95rem;">Phase 3: Call Assigned Driver</h5>
                <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:1rem;">
                    Call the driver <strong>${drv ? drv.name : 'Unknown'}</strong> at <strong>${drv ? drv.phone : '--'}</strong> to inform them of trip schedule, routes, and expected checkpoints.
                </p>
                <button class="btn btn-primary w-100" id="btn-call-driver-brief" ${btnDisabled ? 'disabled' : ''}>
                    📞 Log Outgoing Briefing Call
                </button>
                ${helpText}
            `;

            if (!btnDisabled) {
                document.getElementById('btn-call-driver-brief').addEventListener('click', () => {
                    const empId = this.getConsoleEmpId();
                    if (!empId) return;

                    const simTime = LCOS_State.getSystemSettings().simulationTime;
                    trip.transitUpdates.push({
                        timestamp: simTime,
                        location: 'Origin Branch',
                        condition: 'Good',
                        status: 'DRIVER_CALLED',
                        delayReason: '',
                        remarks: `Briefed driver on route parameters.`,
                        operatorId: empId
                    });
                    trip.lastUpdateTimestamp = simTime;

                    LCOS_State.updateTripStatus(trip.id, 'DRIVER_CALLED');
                    LCOS_State.addCallLog({
                        tripId: trip.id,
                        type: 'Transit Update',
                        caller: 'Admin Office',
                        recipient: `Driver (${drv ? drv.name : ''})`,
                        notes: `Briefed driver on route parameters. Operator: ${empId}.`
                    });
                    this.showToast('Driver briefed. Status: DRIVER CALLED.', 'info');
                    this.renderAll();
                });
            }
        }
        else if (trip.status === 'DRIVER_CALLED') {
            // Stage 3: Driver Called, waiting for confirmation call
            const drv = LCOS_State.getDrivers().find(d => d.id === trip.driverId);
            const role = LCOS_State.getCurrentRole();
            const btnDisabled = role === 'branch_manager';
            const helpText = btnDisabled ? `<p style="font-size:0.75rem; color:var(--color-warning); font-weight:600; margin-top:0.5rem; text-align:center;">⚠️ View Only: Driver confirmations are logged by the Tracking Team.</p>` : '';

            container.innerHTML = empIdHTML + `
                <h5 style="margin-bottom:0.75rem; font-size:0.95rem;">Phase 4: Confirm Driver Readiness</h5>
                <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:1rem;">
                    Driver must call back once they inspect the loaded vehicle and verify everything is secure.
                </p>
                <button class="btn btn-primary w-100" id="btn-confirm-readiness" ${btnDisabled ? 'disabled' : ''}>
                    📞 Log Driver Confirmation Call
                </button>
                ${helpText}
            `;

            if (!btnDisabled) {
                document.getElementById('btn-confirm-readiness').addEventListener('click', () => {
                    const empId = this.getConsoleEmpId();
                    if (!empId) return;

                    const simTime = LCOS_State.getSystemSettings().simulationTime;
                    trip.transitUpdates.push({
                        timestamp: simTime,
                        location: 'Origin Branch',
                        condition: 'Good',
                        status: 'DRIVER_CONFIRMED',
                        delayReason: '',
                        remarks: `Driver confirmed vehicle inspection completed. Ready to start.`,
                        operatorId: empId
                    });
                    trip.lastUpdateTimestamp = simTime;

                    LCOS_State.updateTripStatus(trip.id, 'DRIVER_CONFIRMED');
                    LCOS_State.addCallLog({
                        tripId: trip.id,
                        type: 'Transit Update',
                        caller: `Driver (${drv ? drv.name : ''})`,
                        recipient: 'Admin Office',
                        notes: `Driver confirmed vehicle inspection completed. Operator: ${empId}.`
                    });
                    this.showToast('Driver ready confirmed. Status: DRIVER CONFIRMED.', 'success');
                    this.renderAll();
                });
            }
        }
        else if (trip.status === 'DRIVER_CONFIRMED') {
            // Stage 4: Ready, waiting to start journey
            const role = LCOS_State.getCurrentRole();
            const btnDisabled = role === 'branch_manager';
            const helpText = btnDisabled ? `<p style="font-size:0.75rem; color:var(--color-warning); font-weight:600; margin-top:0.5rem; text-align:center;">⚠️ View Only: Departures are logged by the Tracking Team.</p>` : '';

            container.innerHTML = empIdHTML + `
                <h5 style="margin-bottom:0.75rem; font-size:0.95rem;">Phase 5: Record Vehicle Start</h5>
                <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:1rem;">
                    Driver calls as the wheels spin and they leave the origin warehouse gates.
                </p>
                <button class="btn btn-success w-100" id="btn-start-journey" ${btnDisabled ? 'disabled' : ''}>
                    🚚 Log Vehicle Started Call
                </button>
                ${helpText}
            `;

            if (!btnDisabled) {
                document.getElementById('btn-start-journey').addEventListener('click', () => {
                    const empId = this.getConsoleEmpId();
                    if (!empId) return;

                    const simTime = LCOS_State.getSystemSettings().simulationTime;
                    LCOS_State.updateTripStatus(trip.id, 'IN_TRANSIT');
                    trip.transitUpdates.push({
                        timestamp: simTime,
                        location: 'Origin Branch Gates',
                        condition: 'Good',
                        status: 'IN_TRANSIT',
                        delayReason: '',
                        remarks: 'Journey commenced. Vehicle loaded and moving.',
                        operatorId: empId
                    });
                    trip.lastUpdateTimestamp = simTime;
                    LCOS_State.save();

                    LCOS_State.addCallLog({
                        tripId: trip.id,
                        type: 'Transit Update',
                        caller: 'Driver',
                        recipient: 'Admin Office',
                        notes: `Driver called. Confirmed departure from origin. Operator: ${empId}.`
                    });

                    this.showToast('Journey started. Status changed to IN TRANSIT.', 'success');
                    this.renderAll();
                });
            }
        }
        else if (trip.status === 'IN_TRANSIT' || trip.status === 'DELAYED') {
            // Check if there is an active unreachable alert for this trip
            const alert = LCOS_State.getAlerts().find(
                a => a.tripId === trip.id && a.status === 'Active' && (a.type === 'No Update' || a.type === 'Unreachable' || a.type === 'Breakdown')
            );

            const role = LCOS_State.getCurrentRole();

            if (alert && (alert.type === 'No Update' || alert.type === 'Unreachable')) {
                // If there's an active unreachable alert, show escalation console
                const esc = LCOS_Sim.escalations[alert.id] || { attempts: 0 };
                const drv = LCOS_State.getDrivers().find(d => d.id === trip.driverId);
                
                if (alert.escalated && role === 'tracking_team') {
                    container.innerHTML = `
                        <h5 style="margin-bottom:0.5rem; font-size:0.95rem;" class="text-warning">⚠️ Incident Escalated</h5>
                        <div style="font-size:0.75rem; background:rgba(245,158,11,0.06); padding:0.5rem; border-radius:6px; border:1px solid rgba(245,158,11,0.2); margin-bottom:0.75rem; text-align:center;">
                            <strong>AWAITING MANAGER ACTION:</strong> Unresponsive driver alert escalated to Branch Manager at ${new Date(alert.escalatedTimestamp).toLocaleTimeString()}.
                        </div>
                        <p style="font-size:0.8rem; color:var(--text-secondary); text-align:center;">
                            Please wait for the Branch Manager to execute the call escalation or override the driver warning.
                        </p>
                    `;
                } else {
                    let escalateBtn = '';
                    if (!alert.escalated && role === 'tracking_team') {
                        escalateBtn = `<button class="btn btn-warning w-100" style="margin-top:0.5rem;" onclick="app.escalateAlertToManager('${alert.id}')">
                            🚨 Escalate to Branch Manager
                        </button>`;
                    }

                    container.innerHTML = empIdHTML + `
                        <h5 style="margin-bottom:0.5rem; font-size:0.95rem;" class="text-danger">⚠️ Call Escalation Wizard ${alert.escalated ? '(Escalated)' : ''}</h5>
                        <div style="font-size:0.75rem; background:rgba(239,68,68,0.06); padding:0.5rem; border-radius:6px; border:1px solid rgba(239,68,68,0.2); margin-bottom:0.75rem;">
                            <strong>ALERT:</strong> Unresponsive driver. Strike ${esc.attempts}/3.
                        </div>
                        <p style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:0.75rem;">
                            Log outbound call to driver <strong>${drv ? drv.name : 'Unknown'} (${drv ? drv.phone : '--'})</strong>:
                        </p>
                        <div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:1rem;">
                            <button class="btn btn-danger w-100" id="btn-escalate-call">
                                📞 Execute Call Attempt ${esc.attempts + 1}
                            </button>
                            ${escalateBtn}
                        </div>
                        <p style="font-size:0.65rem; color:var(--text-muted);">*Must wait at least 1 simulated hour between attempts.</p>
                    `;

                    document.getElementById('btn-escalate-call').addEventListener('click', () => {
                        const empId = this.getConsoleEmpId();
                        if (!empId) return;

                        const result = LCOS_Sim.attemptEscalationCall(alert.id);
                        if (result.answered) {
                            // If they answered, register operator ID in logs
                            const lastLog = LCOS_State.getCallLogs().filter(c => c.tripId === trip.id).pop();
                            if (lastLog) {
                                lastLog.notes += ` Operator: ${empId}.`;
                            }
                        }
                        this.showToast(result.message, result.answered ? 'success' : 'danger');
                        this.renderAll();
                    });
                }
            } else if (alert && alert.type === 'Breakdown') {
                // If it is a breakdown alert
                if (alert.escalated && role === 'tracking_team') {
                    container.innerHTML = `
                        <h5 style="margin-bottom:0.5rem; font-size:0.95rem;" class="text-warning">⚠️ Incident Escalated</h5>
                        <div style="font-size:0.75rem; background:rgba(245,158,11,0.06); padding:0.5rem; border-radius:6px; border:1px solid rgba(245,158,11,0.2); margin-bottom:0.75rem; text-align:center;">
                            <strong>AWAITING MANAGER RESOLUTION:</strong> Breakdown escalated to Branch Manager.
                        </div>
                        <p style="font-size:0.8rem; color:var(--text-secondary); text-align:center;">
                            The manager is currently coordinating vehicle diagnostics or dispatching a helper mechanic.
                        </p>
                    `;
                } else {
                    let managerAction = '';
                    if (role === 'branch_manager') {
                        managerAction = `
                            <button class="btn btn-danger w-100" id="btn-resolve-breakdown-console">
                                Resolve Breakdown & Resume Transit
                            </button>
                        `;
                    } else {
                        managerAction = `
                            <button class="btn btn-warning w-100" onclick="app.escalateAlertToManager('${alert.id}')">
                                🚨 Escalate Breakdown to Manager
                            </button>
                        `;
                    }

                    container.innerHTML = `
                        <h5 style="margin-bottom:0.5rem; font-size:0.95rem;" class="text-danger">⚠️ Vehicle Breakdown Alert</h5>
                        <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:1rem;">
                            Truck reported a mechanical breakdown. Actions required to resolve and clear alert:
                        </p>
                        ${managerAction}
                    `;

                    document.getElementById('btn-resolve-breakdown-console')?.addEventListener('click', () => {
                        this.resolveBreakdownAlert(alert.id);
                    });
                }
            } 
            else {
                if (role === 'branch_manager') {
                    container.innerHTML = `
                        <h5 style="margin-bottom:0.75rem; font-size:0.95rem;">Log Regular Transit Check-in</h5>
                        <p style="font-size:0.75rem; color:var(--text-secondary); text-align:center; padding:1rem; border:1px dashed var(--border-glass); border-radius:8px;">
                            ⚠️ View Only: Regular check-in calls are logged by the Tracking Team.
                        </p>
                    `;
                } else {
                    // Normal In Transit logging form
                    const drv = LCOS_State.getDrivers().find(d => d.id === trip.driverId);
                    container.innerHTML = empIdHTML + `
                        <h5 style="margin-bottom:0.75rem; font-size:0.95rem;">Log Regular Transit Check-in</h5>
                        <div class="form-group">
                            <label class="form-label">Current Highway Location</label>
                            <input type="text" class="form-control" id="op-log-loc" placeholder="e.g. Trichy Bypass, NH-38" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Vehicle Condition</label>
                                <select class="form-control" id="op-log-cond">
                                    <option value="Good">Good (Running)</option>
                                    <option value="Minor Issue">Minor Issue</option>
                                    <option value="Need Assistance">Critical Assist</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Check-in Status</label>
                                <select class="form-control" id="op-log-status">
                                    <option value="IN_TRANSIT">In Transit</option>
                                    <option value="DELAYED">Delayed</option>
                                    <option value="ARRIVED">Arrived Destination</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-group" id="op-delay-row" style="display:none;">
                            <label class="form-label">Delay Reason</label>
                            <select class="form-control" id="op-log-delay">
                                <option value="">-- Select Reason --</option>
                                <option value="Traffic">Traffic Congestion</option>
                                <option value="Breakdown">Breakdown</option>
                                <option value="Weather">Weather Block</option>
                                <option value="Loading">Loading/Weight Stop</option>
                                <option value="Other">Other Reason</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Operator Notes</label>
                            <input type="text" class="form-control" id="op-log-notes" placeholder="Remarks from call..." required>
                        </div>
                        <button class="btn btn-primary w-100" id="btn-save-transit-call">
                            Log Check-in Call & Update Location
                        </button>
                    `;

                    // Handle delay drop-down display toggle
                    document.getElementById('op-log-status').addEventListener('change', (e) => {
                        const dRow = document.getElementById('op-delay-row');
                        if (e.target.value === 'DELAYED') {
                            dRow.style.display = 'block';
                        } else {
                            dRow.style.display = 'none';
                        }
                    });

                    document.getElementById('btn-save-transit-call').addEventListener('click', () => {
                        const empId = this.getConsoleEmpId();
                        if (!empId) return;

                        const loc = document.getElementById('op-log-loc').value;
                        const cond = document.getElementById('op-log-cond').value;
                        const status = document.getElementById('op-log-status').value;
                        const notes = document.getElementById('op-log-notes').value;
                        const delayReason = document.getElementById('op-log-delay').value;

                        if (!loc || !notes) {
                            this.showToast('Please fill in current location and notes.', 'warning');
                            return;
                        }

                        const simTime = LCOS_State.getSystemSettings().simulationTime;
                        
                        // Update Trip
                        trip.status = status;
                        trip.transitUpdates.push({
                            timestamp: simTime,
                            location: loc,
                            condition: cond,
                            status: status,
                            delayReason: status === 'DELAYED' ? delayReason : '',
                            remarks: notes,
                            operatorId: empId
                        });
                        trip.lastUpdateTimestamp = simTime;

                        // Log Call
                        LCOS_State.addCallLog({
                            tripId: trip.id,
                            type: status === 'ARRIVED' ? 'Arrival Update' : status === 'DELAYED' ? 'Delay Check' : 'Transit Update',
                            caller: `Driver (${drv ? drv.name : ''})`,
                            recipient: 'Admin Office',
                            notes: `Location: ${loc}. Status: ${status}. Condition: ${cond}. Operator: ${empId}. Notes: ${notes}`
                        });

                        // Resolve "No Update" alerts if any
                        const activeAlerts = LCOS_State.getAlerts().filter(a => a.tripId === trip.id && a.status === 'Active');
                        activeAlerts.forEach(alt => LCOS_State.resolveAlert(alt.id));

                        LCOS_State.save();
                        this.showToast(`Transit update logged. Location updated to ${loc}.`, 'success');
                        this.renderAll();
                    });
                }
            }
        }
        else if (trip.status === 'ARRIVED') {
            const manager = LCOS_State.getBranches().find(b => b.id === trip.destinationBranchId).manager;
            const role = LCOS_State.getCurrentRole();
            const checklistComplete = this.isChecklistComplete(trip.checklists.delivery);

            let btnText = 'Log Digital Receipt & Close Trip';
            let btnDisabled = !checklistComplete;
            let helpText = '';

            if (role === 'branch_manager' || role === 'owner') {
                btnText = role === 'owner' ? 'Owner View: Reached Destination' : 'View Only: Approved by Tracking Team';
                btnDisabled = true;
                helpText = `<p style="font-size:0.75rem; color:var(--color-warning); font-weight:600; margin-top:0.5rem; text-align:center;">⚠️ View Only: Day-to-day unloading confirmations are completed by the Tracking Team.</p>`;
            }

            container.innerHTML = empIdHTML + `
                <h5 style="margin-bottom:0.75rem; font-size:0.95rem;">Phase 6: Delivery Confirmation</h5>
                <p style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:0.75rem;">
                    Call Destination Branch Manager <strong>(${manager})</strong> to confirm unloading statistics:
                </p>
                <div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:0.75rem;">
                    <div class="checklist-item ${trip.checklists.delivery.quantityMatches ? 'checked' : ''}" onclick="app.toggleChecklist('delivery', 'quantityMatches')">
                        <div class="checkbox-custom"></div>
                        <div class="checklist-label">Quantity unloaded and verified</div>
                    </div>
                    <div class="checklist-item ${trip.checklists.delivery.damagesChecked ? 'checked' : ''}" onclick="app.toggleChecklist('delivery', 'damagesChecked')">
                        <div class="checkbox-custom"></div>
                        <div class="checklist-label">Damage assessment completed</div>
                    </div>
                    <div class="checklist-item ${trip.checklists.delivery.missingChecked ? 'checked' : ''}" onclick="app.toggleChecklist('delivery', 'missingChecked')">
                        <div class="checkbox-custom"></div>
                        <div class="checklist-label">Missing items checked & documented</div>
                    </div>
                    <div class="checklist-item ${trip.checklists.delivery.conditionOk ? 'checked' : ''}" onclick="app.toggleChecklist('delivery', 'conditionOk')">
                        <div class="checkbox-custom"></div>
                        <div class="checklist-label">Physical load quality verified</div>
                    </div>
                </div>
 
                <div class="form-row margin-bottom-1">
                    <div class="form-group" style="margin-bottom:0;">
                        <label class="form-label" style="margin-bottom:0.25rem;">Received Qty</label>
                        <input type="number" class="form-control" id="dl-qty" value="${trip.quantity}" max="${trip.quantity}">
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label class="form-label" style="margin-bottom:0.25rem;">Damaged Qty</label>
                        <input type="number" class="form-control" id="dl-damages" value="0">
                    </div>
                </div>
                <div class="form-row margin-bottom-1">
                    <div class="form-group" style="margin-bottom:0;">
                        <label class="form-label" style="margin-bottom:0.25rem;">Missing Items</label>
                        <input type="number" class="form-control" id="dl-missing" value="0">
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label class="form-label" style="margin-bottom:0.25rem;">Cargo Rating</label>
                        <select class="form-control" id="dl-rating">
                            <option value="Good">Good (Perfect)</option>
                            <option value="Fair">Fair (Slight wear)</option>
                            <option value="Poor">Poor (Damaged)</option>
                        </select>
                    </div>
                </div>
 
                <button class="btn btn-success w-100" id="btn-save-delivery" ${btnDisabled ? 'disabled' : ''}>
                    ${btnText}
                </button>
                ${helpText}
            `;

            document.getElementById('btn-save-delivery')?.addEventListener('click', () => {
                const empId = this.getConsoleEmpId();
                if (!empId) return;

                const receivedVal = Number(document.getElementById('dl-qty').value);
                const damagesVal = Number(document.getElementById('dl-damages').value);
                const missingVal = Number(document.getElementById('dl-missing').value);
                const ratingVal = document.getElementById('dl-rating').value;

                if (isNaN(receivedVal) || isNaN(damagesVal) || isNaN(missingVal)) {
                    this.showToast('Please enter numeric confirmation data.', 'warning');
                    return;
                }

                const simTime = LCOS_State.getSystemSettings().simulationTime;
                const recNum = 'RCPT-' + Math.floor(Math.random() * 9000 + 1000);

                trip.transitUpdates.push({
                    timestamp: simTime,
                    location: 'Destination Branch Gates',
                    condition: ratingVal,
                    status: 'CLOSED',
                    delayReason: '',
                    remarks: `Shipment delivered. Receipt generated: ${recNum}. Total received: ${receivedVal}. Damages: ${damagesVal}.`,
                    operatorId: empId
                });

                (async () => {
                    const apiRes = await LCOS_State.closeTripDelivery(trip.id, {
                        receivedQuantity: receivedVal,
                        damagesCount: damagesVal,
                        missingCount: missingVal,
                        condition: ratingVal,
                        receiverName: manager,
                        receiptNumber: recNum,
                        closedTimestamp: simTime
                    });

                    // Add Call Log
                    LCOS_State.addCallLog({
                        tripId: trip.id,
                        type: 'Delivery Confirmation',
                        caller: 'Admin Office',
                        recipient: `${LCOS_State.getBranches().find(b => b.id === trip.destinationBranchId).name} Manager`,
                        notes: `Trip closed. Digital receipt generated: ${recNum}. Total received: ${receivedVal}. Damages: ${damagesVal}. Operator: ${empId}.`
                    });

                    if (apiRes && apiRes.returnMatchingInfo) {
                        const ret = apiRes.returnMatchingInfo;
                        if (ret.hasReturnLoad) {
                            this.showToast(`🎉 RETURN LOAD AUTO-MATCHED! Lorry assigned to Return Trip ${ret.returnTripId} (${ret.returnCommodity})!`, 'success');
                        } else {
                            this.showToast(`ℹ️ Trip closed. Lorry marked as Empty Return (no return cargo at branch).`, 'info');
                        }
                    } else {
                        this.showToast(`Trip ${trip.id} delivered and stock updated! Receipt generated.`, 'success');
                    }

                    this.renderAll();
                    this.viewReceipt(trip.id);
                })();
            });

        }
        else if (trip.status === 'CLOSED') {
            container.innerHTML = `
                <div style="text-align:center; padding:1.25rem 0.5rem;">
                    <div style="font-size:2.2rem; margin-bottom:0.5rem;">🏁</div>
                    <h5 style="margin-bottom:0.5rem; font-size:1.05rem;" class="text-success">Delivery Completed & Closed</h5>
                    <p style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:0.75rem;">
                        Official Receipt <strong>${trip.deliveryInfo ? trip.deliveryInfo.receiptNumber : 'RCPT-DONE'}</strong> generated. Goods successfully received and verified at destination warehouse.
                    </p>
                    <div style="background:rgba(16, 185, 129, 0.08); border:1px dashed rgba(16, 185, 129, 0.4); border-radius:8px; padding:0.75rem; margin-bottom:1rem; font-size:0.8rem; color:var(--color-success); font-weight:600;">
                        🚚 Lorry and driver released at destination and ready for next load!
                    </div>
                    <button class="btn btn-secondary w-100" onclick="app.viewReceipt('${trip.id}')">
                        📄 View Official Delivery Receipt
                    </button>
                </div>
            `;
        }
    },

    toggleChecklist(type, field) {
        const role = LCOS_State.getCurrentRole();
        if (role === 'branch_manager' || role === 'owner') {
            this.showToast('Supervisors/Owners have view-only access to console checklists.', 'warning');
            return;
        }

        if (!this.activeConsoleTripId) return;
        const trip = LCOS_State.getTripById(this.activeConsoleTripId);
        if (!trip) return;

        if (!trip.checklists) trip.checklists = {};
        if (!trip.checklists.dispatch) {
            trip.checklists.dispatch = { loaded: false, verified: false, vehicleReady: false, driverAvailable: false };
        }
        if (!trip.checklists.delivery) {
            trip.checklists.delivery = { quantityMatches: false, damagesChecked: false, missingChecked: false, conditionOk: false };
        }

        if (!trip.checklists[type]) {
            trip.checklists[type] = {};
        }

        trip.checklists[type][field] = !trip.checklists[type][field];
        LCOS_State.save();
        this.renderOperationsConsole();
    },

    isChecklistComplete(checklistObj) {
        return Object.values(checklistObj).every(v => v === true);
    },

    renderTripsTracker() {
        const query = document.getElementById('trip-search').value.toLowerCase();
        const statusFilter = document.getElementById('trip-filter-status').value;
        const trips = LCOS_State.getTrips();
        const tbody = document.querySelector('#trips-table tbody');
        
        tbody.innerHTML = '';

        const filtered = trips.filter(t => {
            const matchesStatus = statusFilter === '' || t.status === statusFilter || (statusFilter === 'CLOSED' && t.status === 'CLOSED');
            
            const com = LCOS_State.getCommodities().find(c => c.id === t.commodityId);
            const drv = LCOS_State.getDrivers().find(d => d.id === t.driverId);
            const src = LCOS_State.getBranches().find(b => b.id === t.sourceBranchId);
            const dest = LCOS_State.getBranches().find(b => b.id === t.destinationBranchId);

            const searchStr = `${t.id} ${t.vehicleId} ${drv ? drv.name : ''} ${com ? com.name : ''} ${src ? src.name : ''} ${dest ? dest.name : ''}`.toLowerCase();
            const matchesQuery = query === '' || searchStr.includes(query);

            return matchesStatus && matchesQuery;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted);">No matching shipments found.</td></tr>`;
            return;
        }

        const formatDate = (isoStr) => {
            const date = new Date(isoStr);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + date.toLocaleDateString([], { day: '2-digit', month: 'short' });
        };

        filtered.forEach(t => {
            const com = LCOS_State.getCommodities().find(c => c.id === t.commodityId);
            const src = LCOS_State.getBranches().find(b => b.id === t.sourceBranchId);
            const dest = LCOS_State.getBranches().find(b => b.id === t.destinationBranchId);
            const drv = LCOS_State.getDrivers().find(d => d.id === t.driverId);

            const isReturnLoad = (t.deliveryInfo && (t.deliveryInfo.isBackload || t.deliveryInfo.returnMatchingInfo?.hasReturnLoad)) || (t.checklists && t.checklists.isBackload);
            const returnTag = isReturnLoad ? `<span class="badge" style="background:rgba(245, 158, 11, 0.2); color:#fbbf24; border:1px solid rgba(245, 158, 11, 0.4); font-size:0.65rem; margin-left:4px;">🔄 Return Load</span>` : '';

            let statusBadge = '';
            if (t.status === 'CREATED') statusBadge = '<span class="badge badge-draft">Draft</span>';
            else if (t.status === 'IN_TRANSIT') statusBadge = isReturnLoad ? '<span class="badge badge-transit" style="background:rgba(245, 158, 11, 0.2); color:#fbbf24; border:1px solid rgba(245, 158, 11, 0.4);">In Transit (Return Leg)</span>' : '<span class="badge badge-transit">In Transit</span>';
            else if (t.status === 'DISPATCH_APPROVED') statusBadge = isReturnLoad ? '<span class="badge badge-transit" style="background:rgba(245, 158, 11, 0.2); color:#fbbf24;">Dispatched (Return Leg)</span>' : '<span class="badge badge-transit">Dispatched</span>';
            else if (t.status === 'DELAYED') statusBadge = '<span class="badge badge-delayed">Delayed</span>';
            else if (t.status === 'CLOSED') statusBadge = '<span class="badge badge-success">Closed</span>';
            else if (t.status === 'BACKLOAD_PAIRED') statusBadge = '<span class="badge badge-success" style="background:rgba(16, 185, 129, 0.2); color:#10b981;">Return Load Paired</span>';
            else if (t.status === 'COMPLETED_RETURN') statusBadge = '<span class="badge badge-success" style="background:rgba(16, 185, 129, 0.25); color:#10b981;">Return Completed</span>';
            else statusBadge = `<span class="badge badge-pending">${t.status}</span>`;

            let actionBtn = '';
            if (t.status !== 'CLOSED' && t.status !== 'COMPLETED_RETURN') {
                actionBtn = `
                    <div style="display:flex; gap:4px; align-items:center;">
                        <button class="btn btn-secondary" style="padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="app.openTripInConsole('${t.id}')">Console</button>
                        <button class="btn btn-secondary" style="padding:0.25rem 0.45rem; font-size:0.75rem; color:#25D366; border-color:rgba(37,211,102,0.3);" title="Send WhatsApp alert to driver" onclick="app.sendTripWhatsAppAlert('${t.id}')">💬</button>
                    </div>`;
            } else {
                actionBtn = `
                    <div style="display:flex; gap:4px; align-items:center;">
                        <button class="btn btn-secondary" style="padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="app.viewReceipt('${t.id}')">Receipt</button>
                        <button class="btn btn-secondary" style="padding:0.25rem 0.45rem; font-size:0.75rem; color:#25D366; border-color:rgba(37,211,102,0.3);" title="Send WhatsApp alert" onclick="app.sendTripWhatsAppAlert('${t.id}')">💬</button>
                    </div>`;
            }

            // Extract last updater ID
            let lastUpdater = t.createdBy || 'Default Admin';
            if (t.transitUpdates && t.transitUpdates.length > 0) {
                const latestUpdate = t.transitUpdates[t.transitUpdates.length - 1];
                if (latestUpdate.operatorId) {
                    lastUpdater = latestUpdate.operatorId;
                }
            }

            tbody.innerHTML += `
                <tr>
                    <td style="font-weight:700;">${t.id}${returnTag}</td>
                    <td>${src ? src.name : 'Unknown'} → ${dest ? dest.name : 'Unknown'}</td>
                    <td>${com ? com.name : 'Goods'}</td>
                    <td>${t.quantity} ${com ? com.unit : 'Units'}</td>
                    <td>
                        <div style="font-weight:600;">${t.vehicleId}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">${drv ? drv.name : 'Unassigned'}</div>
                    </td>
                    <td>${statusBadge}</td>
                    <td style="font-size:0.75rem; color:var(--text-secondary);">${formatDate(t.lastUpdateTimestamp)}</td>
                    <td style="font-size:0.75rem; font-weight:700; color:var(--color-secondary);">${lastUpdater}</td>
                    <td>${actionBtn}</td>
                </tr>
            `;

        });
    },

    openTripInConsole(tripId) {
        this.activeConsoleTripId = tripId;
        this.switchTab('operations');
        const select = document.getElementById('console-trip-select');
        select.value = tripId;
        this.renderOperationsConsole();
    },

    renderInventory() {
        const role = LCOS_State.getCurrentRole();
        const invActBtn = document.getElementById('btn-inventory-action');
        if (invActBtn) {
            if (role === 'owner') {
                invActBtn.style.display = 'none';
            } else {
                invActBtn.style.display = 'inline-flex';
                invActBtn.textContent = role === 'tracking_team' ? 'Request Stock Refill' : 'Manually Add Stock';
            }
        }

        const commodities = LCOS_State.getCommodities();
        const select = document.getElementById('inventory-commodity-select');
        
        // Fill dropdown if empty
        if (select.children.length === 0) {
            select.innerHTML = commodities.map(c => `<option value="${c.id}">${c.name} (${c.unit})</option>`).join('');
            select.value = this.selectedInventoryCommodityId;
        }

        const stock = LCOS_State.getStock();
        const branches = LCOS_State.getBranches();
        const tbody = document.querySelector('#inventory-table tbody');
        
        tbody.innerHTML = '';

        branches.forEach(branch => {
            const stObj = stock[branch.id]?.[this.selectedInventoryCommodityId] || { available: 0, inTransit: 0, delivered: 0, pending: 0 };
            
            tbody.innerHTML += `
                <tr>
                    <td style="font-weight:700;">${branch.name} Branch</td>
                    <td style="font-family:monospace; color:var(--text-muted);">${branch.id}</td>
                    <td>${branch.manager}</td>
                    <td style="font-weight:700; color:var(--text-primary);">${stObj.available}</td>
                    <td style="color:var(--color-transit); font-weight:600;">+${stObj.inTransit}</td>
                    <td style="color:var(--color-success);">${stObj.delivered}</td>
                    <td style="color:var(--color-warning);">+${stObj.pending}</td>
                </tr>
            `;
        });
    },

    renderDirectory() {
        const role = LCOS_State.getCurrentRole();
        const forms = [
            { id: 'form-add-driver', type: 'Add Driver' },
            { id: 'form-add-vehicle', type: 'Add Vehicle' },
            { id: 'form-add-branch', type: 'Add Branch' },
            { id: 'form-add-commodity', type: 'Add Commodity' }
        ];

        forms.forEach(f => {
            const formEl = document.getElementById(f.id);
            if (formEl) {
                const parent = formEl.parentElement;
                // Remove old request banner if any
                const oldBanner = parent.querySelector('.req-supervisor-banner');
                if (oldBanner) oldBanner.remove();

                if (role === 'tracking_team') {
                    formEl.style.display = 'none';
                    const banner = document.createElement('div');
                    banner.className = 'req-supervisor-banner';
                    banner.innerHTML = `
                        <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:1rem; text-align:center; line-height:1.4;">
                            ⚠️ Operators cannot directly edit resource directories. Submit a registration request to the Supervisor.
                        </p>
                        <button class="btn btn-primary w-100" type="button" onclick="app.openRequestModal('${f.type}')">
                            Submit Request to Supervisor
                        </button>
                    `;
                    parent.appendChild(banner);
                } else if (role === 'owner') {
                    formEl.style.display = 'none';
                    const banner = document.createElement('div');
                    banner.className = 'req-supervisor-banner';
                    banner.innerHTML = `
                        <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:1rem; text-align:center; line-height:1.4;">
                            👑 View Only: Owner Mode. Managers register directories and assets.
                        </p>
                    `;
                    parent.appendChild(banner);
                } else {
                    formEl.style.display = 'block';
                }
            }
        });

        if (this.selectedDirectorySub === 'drivers') {
            const tbody = document.querySelector('#table-drivers tbody');
            tbody.innerHTML = LCOS_State.getDrivers().map(d => {
                let statusBadge = `<span class="badge ${d.status === 'Available' ? 'badge-success' : d.status === 'On Trip' ? 'badge-transit' : 'badge-delayed'}">${d.status}</span>`;
                return `
                    <tr>
                        <td style="font-weight:700;">${d.name}</td>
                        <td style="font-family:monospace;">${d.license}</td>
                        <td>${d.phone}</td>
                        <td>${d.experience} Years</td>
                        <td style="font-weight:700; color:var(--color-success);">${d.performance}%</td>
                        <td style="color:var(--color-danger); font-weight:700;">${d.warnings}</td>
                        <td>${statusBadge}</td>
                        <td>
                            <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding:0.2rem 0.5rem; color:#25D366; border-color:rgba(37,211,102,0.3); display:inline-flex; align-items:center; gap:0.25rem;" onclick="app.sendWhatsAppToDriver('${d.phone}', '${d.name}')" title="Chat on WhatsApp">
                                💬 Chat
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
        else if (this.selectedDirectorySub === 'vehicles') {
            const tbody = document.querySelector('#table-vehicles tbody');
            tbody.innerHTML = LCOS_State.getVehicles().map(v => {
                let statusBadge = `<span class="badge ${v.status === 'Available' ? 'badge-success' : 'badge-transit'}">${v.status}</span>`;
                return `
                    <tr>
                        <td style="font-weight:700; font-family:monospace;">${v.id}</td>
                        <td>${v.type}</td>
                        <td>${v.capacity} Metric Tons</td>
                        <td>${v.owner}</td>
                        <td>${statusBadge}</td>
                    </tr>
                `;
            }).join('');
        }
        else if (this.selectedDirectorySub === 'branches') {
            const tbody = document.querySelector('#table-branches tbody');
            tbody.innerHTML = LCOS_State.getBranches().map(b => `
                <tr>
                    <td style="font-family:monospace; color:var(--text-muted);">${b.id}</td>
                    <td style="font-weight:700;">${b.name}</td>
                    <td>${b.manager}</td>
                    <td>${b.phone}</td>
                </tr>
            `).join('');
        }
        else if (this.selectedDirectorySub === 'helpers') {
            const tbody = document.querySelector('#table-helpers tbody');
            tbody.innerHTML = LCOS_State.getHelpers().map(h => `
                <tr>
                    <td style="font-weight:700;">${h.name}</td>
                    <td>${h.phone}</td>
                    <td>${h.role}</td>
                    <td><span class="badge ${h.status === 'Available' ? 'badge-success' : 'badge-transit'}">${h.status}</span></td>
                </tr>
            `).join('');
        }
        else if (this.selectedDirectorySub === 'commodities') {
            const tbody = document.querySelector('#table-commodities tbody');
            tbody.innerHTML = LCOS_State.getCommodities().map(c => `
                <tr>
                    <td style="font-family:monospace; color:var(--text-muted);">${c.id}</td>
                    <td style="font-weight:700;">${c.name}</td>
                    <td>${c.unit}</td>
                    <td>${c.weight} kg / unit</td>
                    <td>₹${c.value.toLocaleString()} / unit</td>
                </tr>
            `).join('');
        }
    },

    renderCallLogs() {
        const query = document.getElementById('call-search').value.toLowerCase();
        const typeFilter = document.getElementById('call-filter-type').value;
        const logs = LCOS_State.getCallLogs();
        const tbody = document.querySelector('#calllogs-table tbody');
        
        tbody.innerHTML = '';

        const filtered = logs.filter(l => {
            const matchesType = typeFilter === '' || l.type === typeFilter;
            const searchStr = `${l.id} ${l.tripId || ''} ${l.type} ${l.notes} ${l.caller} ${l.recipient}`.toLowerCase();
            const matchesQuery = query === '' || searchStr.includes(query);
            return matchesType && matchesQuery;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">No call logs recorded yet.</td></tr>`;
            return;
        }

        const formatDate = (isoStr) => {
            const date = new Date(isoStr);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + date.toLocaleDateString([], { day: '2-digit', month: 'short' });
        };

        const sorted = [...filtered].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        sorted.forEach(l => {
            tbody.innerHTML += `
                <tr>
                    <td style="font-family:monospace; font-weight:700; color:var(--color-primary);">${l.id}</td>
                    <td style="font-size:0.75rem; color:var(--text-secondary);">${formatDate(l.timestamp)}</td>
                    <td style="font-weight:600; color:var(--color-secondary);">${l.tripId || '--'}</td>
                    <td><span class="badge badge-draft" style="font-size:0.7rem; padding:0.15rem 0.35rem;">${l.type}</span></td>
                    <td style="font-size:0.8rem; font-weight:600;">${l.caller}</td>
                    <td style="font-size:0.8rem; font-weight:600; color:var(--text-secondary);">${l.recipient}</td>
                    <td style="font-size:0.8rem; max-width: 320px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${l.notes}">${l.notes}</td>
                </tr>
            `;
        });
    },

    getBranchGPS(b) {
        if (!b) return { lat: 11.1271, lng: 78.6569 };
        if (typeof b === 'object' && b.lat && b.lng) {
            return { lat: Number(b.lat), lng: Number(b.lng) };
        }
        const bId = typeof b === 'string' ? b : (b.id || '');
        const stateGPS = LCOS_State?.getBranchCoordinates ? LCOS_State.getBranchCoordinates(bId) : null;
        if (stateGPS) return stateGPS;

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
        const fallback = districtGPS[bId] || { lat: 11.1271, lng: 78.6569 };
        return {
            lat: Number(fallback.lat),
            lng: Number(fallback.lng)
        };
    },

    renderMap() {
        const mapEl = document.getElementById('tn-real-map');
        if (!mapEl) return;

        if (typeof L === 'undefined') {
            console.warn('Leaflet library is loading...');
            return;
        }

        try {
            if (!this.leafletMap) {
                if (mapEl._leaflet_id) {
                    mapEl._leaflet_id = null;
                }

                this.leafletMap = L.map('tn-real-map', {
                    center: [10.85, 78.65],
                    zoom: 7,
                    zoomControl: true,
                    minZoom: 6,
                    maxZoom: 18
                });
                window.leafletMap = this.leafletMap;

                // 1. Detailed Tamil Nadu District & Highway Map View (OpenStreetMap - 100% Free)
                const districtMapLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 18,
                    attribution: '© OpenStreetMap contributors'
                });

                // 2. Real High-Resolution Satellite View
                const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                    maxZoom: 18,
                    attribution: 'Tiles © Esri'
                });

                // Set Detailed District & Highway Map as default view
                districtMapLayer.addTo(this.leafletMap);

                // Add Top-Right Layer Switcher
                const baseMaps = {
                    "🗺️ District & Highway Map": districtMapLayer,
                    "🛰️ Satellite View": satelliteLayer
                };
                L.control.layers(baseMaps, null, { position: 'topright' }).addTo(this.leafletMap);

                this.branchLayerGroup = L.layerGroup().addTo(this.leafletMap);
                this.routeLayerGroup = L.layerGroup().addTo(this.leafletMap);

                // Default view: Entire Tamil Nadu regional structure bounds
                this.leafletMap.fitBounds([[8.05, 76.2], [13.55, 80.35]], { padding: [20, 20] });
            } else {
                // When already created, default to full Tamil Nadu overview
                this.leafletMap.fitBounds([[8.05, 76.2], [13.55, 80.35]], { padding: [20, 20] });
            }

            // Invalidate size to ensure Leaflet recalculates full expanded container bounds
            setTimeout(() => {
                if (this.leafletMap) {
                    this.leafletMap.invalidateSize();
                }
            }, 100);
        } catch (e) {
            console.warn('Map initialization note:', e);
        }

        if (this.branchLayerGroup) {
            this.branchLayerGroup.clearLayers();
            const branches = LCOS_State.getBranches();
            branches.forEach(b => {
                const gps = this.getBranchGPS(b);
                const branchIcon = L.divIcon({
                    className: 'custom-map-dot',
                    html: `<div class="map-branch-node" title="${b.name} District Hub">
                        <div class="branch-inner-dot"></div>
                    </div>`,
                    iconSize: [14, 14],
                    iconAnchor: [7, 7],
                    popupAnchor: [0, -7]
                });
                const marker = L.marker([gps.lat, gps.lng], { icon: branchIcon });
                marker.bindPopup(`
                    <div style="font-size:0.82rem; font-family:sans-serif; color:#1e293b; padding:2px;">
                        <b>📍 ${b.name} District Hub</b><br>
                        <span style="font-size:0.75rem; color:#64748b;">Manager: ${b.manager || 'Assigned'} | Tel: ${b.phone || 'N/A'}</span><br>
                        <span style="font-size:0.72rem; color:#0284c7;">Coords: ${gps.lat.toFixed(4)}°N, ${gps.lng.toFixed(4)}°E</span>
                    </div>
                `);
                marker.on('click', () => {
                    this.leafletMap.flyTo([gps.lat, gps.lng], 12, { duration: 1 });
                    marker.openPopup();
                });
                this.branchLayerGroup.addLayer(marker);
            });
        }

        // Force Leaflet to recalculate container bounds after rendering
        [50, 150, 300, 600, 1000].forEach(delay => {
            setTimeout(() => {
                if (this.leafletMap) this.leafletMap.invalidateSize();
            }, delay);
        });

        this.updateMapHighlights();
    },

    resetMapToTamilNadu() {
        const districtSelect = document.getElementById('map-filter-district');
        const vehSelect = document.getElementById('map-filter-vehicle');
        if (districtSelect) districtSelect.value = '';
        if (vehSelect) vehSelect.value = '';
        if (this.simRouteLayer && this.leafletMap) {
            this.leafletMap.removeLayer(this.simRouteLayer);
            this.simRouteLayer = null;
        }
        if (this.leafletMap) {
            this.leafletMap.fitBounds([[8.05, 76.2], [13.55, 80.35]], { padding: [15, 15] });
            this.leafletMap.invalidateSize();
        }
        this.updateMapHighlights();
    },

    /**
     * Resolves route endpoints (Departed Origin and Target Destination) for any trip.
     * Future-proof Auto-Sync Architecture:
     * - Returns live GPS data if available and flagged isLiveSynced: true
     * - Otherwise returns clean dummy baseline data with isDummy: true markers
     */
    getTripEndpoints(trip) {
        const bSrc = LCOS_State.getBranches().find(b => b.id === trip.sourceBranchId);
        const bDest = LCOS_State.getBranches().find(b => b.id === trip.destinationBranchId);
        const srcFallback = this.getBranchGPS(bSrc);
        const destFallback = this.getBranchGPS(bDest);

        const isLive = Boolean(trip.isLiveSynced);

        const origin = {
            lat: (isLive && trip.realOriginGPS?.lat) ? Number(trip.realOriginGPS.lat) : srcFallback.lat,
            lng: (isLive && trip.realOriginGPS?.lng) ? Number(trip.realOriginGPS.lng) : srcFallback.lng,
            name: trip.realOriginGPS?.name || (bSrc ? bSrc.name : 'Origin Hub'),
            branchId: trip.sourceBranchId,
            isDummy: !isLive || !trip.realOriginGPS,
            telemetrySource: isLive ? (trip.telemetrySource || 'LIVE_IOT_GPS') : 'SIMULATED_DUMMY_BASELINE',
            status: 'DEPARTED'
        };

        const destination = {
            lat: (isLive && trip.realDestinationGPS?.lat) ? Number(trip.realDestinationGPS.lat) : destFallback.lat,
            lng: (isLive && trip.realDestinationGPS?.lng) ? Number(trip.realDestinationGPS.lng) : destFallback.lng,
            name: trip.realDestinationGPS?.name || (bDest ? bDest.name : 'Destination Hub'),
            branchId: trip.destinationBranchId,
            isDummy: !isLive || !trip.realDestinationGPS,
            telemetrySource: isLive ? (trip.telemetrySource || 'LIVE_IOT_GPS') : 'SIMULATED_DUMMY_BASELINE',
            status: 'DESTINATION'
        };

        return { origin, destination, isLive };
    },

    getTripCurrentCoordinates(trip) {
        if (trip.currentGPS && trip.currentGPS.lat && trip.currentGPS.lng) {
            return {
                lat: Number(trip.currentGPS.lat),
                lng: Number(trip.currentGPS.lng),
                isLive: true
            };
        }

        const vehicle = LCOS_State.getVehicles().find(v => v.id === trip.vehicleId);
        if (vehicle && vehicle.currentLat && vehicle.currentLng && !isNaN(vehicle.currentLat)) {
            return {
                lat: Number(vehicle.currentLat),
                lng: Number(vehicle.currentLng),
                isLive: true
            };
        }

        if (trip.isLiveSynced && trip.currentGPS && trip.currentGPS.lat && trip.currentGPS.lng) {
            return {
                lat: Number(trip.currentGPS.lat),
                lng: Number(trip.currentGPS.lng),
                isLive: true
            };
        }

        const src = LCOS_State.getBranches().find(b => b.id === trip.sourceBranchId);
        const dest = LCOS_State.getBranches().find(b => b.id === trip.destinationBranchId);
        
        const srcGPS = this.getBranchGPS(src);
        const destGPS = this.getBranchGPS(dest);

        const startStatuses = ['CREATED', 'DISPATCH_APPROVED', 'DRIVER_CALLED', 'DRIVER_CONFIRMED'];
        if (startStatuses.includes(trip.status)) {
            return { lat: srcGPS.lat, lng: srcGPS.lng, isLive: false };
        }

        if (trip.status === 'CLOSED') {
            return { lat: destGPS.lat, lng: destGPS.lng, isLive: false };
        }

        const startTime = new Date(trip.lastUpdateTimestamp).getTime();
        const nowTime = new Date(LCOS_State.getSystemSettings().simulationTime).getTime();
        const expectedMs = (trip.expectedHours || 8) * 60 * 60 * 1000;
        const elapsedMs = Math.max(0, nowTime - startTime);

        let progress = Math.min(0.9, elapsedMs / expectedMs);
        if (trip.status === 'ARRIVED') progress = 1.0;

        return {
            lat: srcGPS.lat + progress * (destGPS.lat - srcGPS.lat),
            lng: srcGPS.lng + progress * (destGPS.lng - srcGPS.lng),
            isLive: false
        };
    },

    populateDistrictOptions() {
        const districtSelect = document.getElementById('map-filter-district');
        if (!districtSelect) return;
        
        const prevSelected = districtSelect.value;
        const branches = [...LCOS_State.getBranches()].sort((a, b) => a.name.localeCompare(b.name));
        
        districtSelect.innerHTML = '<option value="">-- All Districts (38) --</option>';
        branches.forEach(b => {
            districtSelect.innerHTML += `<option value="${b.id}">${b.name}</option>`;
        });
        
        if (Array.from(districtSelect.options).some(opt => opt.value === prevSelected)) {
            districtSelect.value = prevSelected;
        }
    },

    getFilteredTrips() {
        const timeframe = document.getElementById('map-filter-timeframe')?.value || 'today';
        const selectedDistrict = document.getElementById('map-filter-district')?.value;
        const trips = LCOS_State.getTrips();
        const now = new Date();
        
        let startBound = new Date();
        let endBound = new Date();
        
        if (timeframe === 'today') {
            startBound.setHours(0, 0, 0, 0);
            endBound.setHours(23, 59, 59, 999);
        } else if (timeframe === 'weekly') {
            startBound.setDate(now.getDate() - 7);
            startBound.setHours(0, 0, 0, 0);
            endBound.setHours(23, 59, 59, 999);
        } else if (timeframe === 'monthly') {
            startBound.setDate(now.getDate() - 30);
            startBound.setHours(0, 0, 0, 0);
            endBound.setHours(23, 59, 59, 999);
        } else if (timeframe === 'yearly') {
            startBound.setDate(now.getDate() - 365);
            startBound.setHours(0, 0, 0, 0);
            endBound.setHours(23, 59, 59, 999);
        } else if (timeframe === 'custom') {
            const startVal = document.getElementById('map-date-start')?.value;
            const endVal = document.getElementById('map-date-end')?.value;
            
            if (startVal) {
                startBound = new Date(startVal);
                startBound.setHours(0, 0, 0, 0);
            } else {
                startBound = new Date(0);
            }
            
            if (endVal) {
                endBound = new Date(endVal);
                endBound.setHours(23, 59, 59, 999);
            } else {
                endBound = new Date();
                endBound.setHours(23, 59, 59, 999);
            }
        }
        
        return trips.filter(t => {
            if (selectedDistrict) {
                const isSourceOrDest = (t.sourceBranchId === selectedDistrict || t.destinationBranchId === selectedDistrict);
                if (!isSourceOrDest) return false;
            }

            const tripDate = new Date(t.dispatchDate || t.lastUpdateTimestamp || Date.now());
            const inTimeRange = (tripDate >= startBound && tripDate <= endBound);

            if (timeframe === 'today') {
                const isActivelyOnRoad = ['IN_TRANSIT', 'DELAYED', 'DRIVER_CONFIRMED', 'DRIVER_CALLED'].includes(t.status);
                return inTimeRange || isActivelyOnRoad;
            }

            return inTimeRange;
        });
    },

    updateMapReport() {
        this.populateDistrictOptions();
        const filteredTrips = this.getFilteredTrips();
        const vehSelect = document.getElementById('map-filter-vehicle');
        if (!vehSelect) return;
        
        const prevSelected = vehSelect.value;
        vehSelect.innerHTML = `<option value="">-- All Running Trucks (${filteredTrips.length}) --</option>`;
        
        const statusMap = {
            CREATED: 'Draft',
            DISPATCH_APPROVED: 'Approved',
            DRIVER_CALLED: 'Driver Called',
            DRIVER_CONFIRMED: 'Driver Ready',
            IN_TRANSIT: 'In Transit',
            DELAYED: 'Delayed',
            ARRIVED: 'Arrived',
            DELIVERY_CONFIRMED: 'Delivering',
            CLOSED: 'Delivered'
        };

        filteredTrips.forEach(t => {
            const statusLabel = statusMap[t.status] || t.status;
            const liveTag = t.isLiveSynced ? ' 🟢 Live' : '';
            vehSelect.innerHTML += `<option value="${t.id}">${t.vehicleId} (${statusLabel}${liveTag})</option>`;
        });
        
        if (Array.from(vehSelect.options).some(opt => opt.value === prevSelected)) {
            vehSelect.value = prevSelected;
        }
        
        this.updateMapHighlights();
    },

    // ==========================================
    // STEP 6: REAL-TIME VEHICLE REGISTRY & MAP
    // ==========================================
    vehicleMarkerRegistry: new Map(),
    selectedTripHistoryPolyline: null,
    activeSelectedVehicleId: null,
    stalenessIntervalId: null,
    _hadSocketDisconnect: false,

    escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    haversineDistanceKm(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    getMarkerVisualState(lastRecordedAt, movementStatus, speedKmh) {
        const ageSec = Math.max(0, (Date.now() - new Date(lastRecordedAt || Date.now()).getTime()) / 1000);
        let color = '#10b981';
        let statusText = 'Live';
        let badgeHtml = '';

        if (ageSec > 300) {
            color = '#64748b'; // Grey (> 5 min)
            const mins = Math.floor(ageSec / 60);
            statusText = `Stale (${mins}m ago)`;
            badgeHtml = `<span style="background:#334155; color:#cbd5e1; padding:2px 6px; border-radius:4px; font-size:0.7rem; font-weight:700;">● Stale (${mins}m ago)</span>`;
        } else if (movementStatus === 'STOPPED' || (!movementStatus && speedKmh < 3)) {
            color = '#f59e0b'; // Amber (stopped/idle)
            if (ageSec < 60) {
                statusText = 'Stopped (Live)';
                badgeHtml = `<span style="background:#78350f; color:#fde68a; padding:2px 6px; border-radius:4px; font-size:0.7rem; font-weight:700;">● Stopped</span>`;
            } else {
                const mins = Math.floor(ageSec / 60);
                statusText = `Stopped (${mins}m ago)`;
                badgeHtml = `<span style="background:#78350f; color:#fde68a; padding:2px 6px; border-radius:4px; font-size:0.7rem; font-weight:700;">● Seen ${mins}m ago</span>`;
            }
        } else {
            color = '#10b981'; // Green (moving)
            if (ageSec < 60) {
                statusText = 'Moving (Live)';
                badgeHtml = `<span style="background:#064e3b; color:#6ee7b7; padding:2px 6px; border-radius:4px; font-size:0.7rem; font-weight:700;">● Live (${Math.round(speedKmh || 0)} km/h)</span>`;
            } else {
                const mins = Math.floor(ageSec / 60);
                statusText = `Last seen ${mins}m ago`;
                badgeHtml = `<span style="background:#064e3b; color:#6ee7b7; padding:2px 6px; border-radius:4px; font-size:0.7rem; font-weight:700;">● Last seen ${mins}m ago</span>`;
            }
        }

        return { color, statusText, badgeHtml, ageSec };
    },

    getTruckPopupHtml(entry) {
        const visual = this.getMarkerVisualState(entry.lastRecordedAt, entry.movementStatus, entry.speedKmh);
        const vehPlate = this.escapeHtml(entry.vehicleId);
        const driverName = this.escapeHtml(entry.driverName || 'Assigned Driver');
        const tripId = this.escapeHtml(entry.tripId || 'N/A');
        const cargoDesc = this.escapeHtml(entry.cargoDesc || 'Freight Cargo');
        const routeText = `${this.escapeHtml(entry.originName || 'Origin')} ➔ ${this.escapeHtml(entry.destName || 'Destination')}`;
        const speedText = Math.round(entry.speedKmh || 0);

        return `
            <div class="telemetry-popup-box" style="min-width:240px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#0f172a;">
                <div style="background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding:8px 12px; border-radius:8px 8px 0 0; color:#fff; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:700; font-size:0.95rem;">🚚 ${vehPlate}</div>
                        <div style="font-size:0.72rem; color:#94a3b8;">Trip: ${tripId}</div>
                    </div>
                    <div>${visual.badgeHtml}</div>
                </div>
                <div style="padding:10px 12px; font-size:0.8rem; background:#ffffff; line-height:1.55; border-radius:0 0 8px 8px; border:1px solid #e2e8f0; border-top:none;">
                    <div>👤 <strong>Driver:</strong> ${driverName}</div>
                    <div>📦 <strong>Cargo:</strong> ${cargoDesc}</div>
                    <div>🛣️ <strong>Route:</strong> ${routeText}</div>
                    <div>⚡ <strong>Speed:</strong> ${speedText} km/h (${this.escapeHtml(entry.movementStatus || 'STOPPED')})</div>
                    <div>📍 <strong>Location:</strong> ${(entry.currentLat || 0).toFixed(4)}°N, ${(entry.currentLng || 0).toFixed(4)}°E</div>
                    <div style="margin-top:10px; padding-top:8px; border-top:1px solid #f1f5f9;">
                        <button type="button" class="btn btn-sm btn-primary ping-driver-btn" data-vehicle-id="${vehPlate}" style="width:100%; padding:6px 10px; font-size:0.78rem; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px; background:#2563eb; color:#fff; border:none; border-radius:6px; cursor:pointer;">
                            📡 Ping Driver Now
                        </button>
                        <div class="ping-status-feedback" id="ping-status-${vehPlate}" style="margin-top:5px; font-size:0.73rem; text-align:center; min-height:16px;"></div>
                    </div>
                </div>
            </div>
        `;
    },

    updateMarkerVisual(entry) {
        if (!entry || !entry.marker) return;
        const visual = this.getMarkerVisualState(entry.lastRecordedAt, entry.movementStatus, entry.speedKmh);
        const iconEl = entry.marker.getElement();
        if (iconEl) {
            const inner = iconEl.querySelector('.truck-marker-inner');
            if (inner) {
                inner.style.transform = `rotate(${entry.heading || 0}deg)`;
                const dot = inner.querySelector('div');
                if (dot) {
                    dot.style.backgroundColor = visual.color;
                    dot.style.boxShadow = `0 0 8px ${visual.color}`;
                }
            }
        }
    },

    updateSingleVehicleMarker(data) {
        if (!data || !this.leafletMap || !this.routeLayerGroup) return;

        const vehicleId = data.vehicleId || (data.tripId ? LCOS_State.getTrips().find(t => t.id === data.tripId)?.vehicleId : null);
        if (!vehicleId) return;

        const lat = Number(data.lat !== undefined ? data.lat : data.current_lat);
        const lng = Number(data.lng !== undefined ? data.lng : data.current_lng);
        if (isNaN(lat) || isNaN(lng)) return;

        const heading = Number(data.heading || 0);
        const speedKmh = Number(data.speedKmh !== undefined ? data.speedKmh : (data.speed_kmh || 0));
        const movementStatus = data.movementStatus || data.movement_status || (speedKmh >= 3 ? 'MOVING' : 'STOPPED');
        const recordedAt = data.recordedAt || data.recorded_at || new Date().toISOString();

        let entry = this.vehicleMarkerRegistry.get(vehicleId);

        // Ignore out-of-order packets older than current marker timestamp
        if (entry && entry.lastRecordedAt) {
            if (new Date(recordedAt).getTime() < new Date(entry.lastRecordedAt).getTime()) {
                return;
            }
        }

        const trip = (data.tripId ? LCOS_State.getTripById(data.tripId) : null) ||
                     LCOS_State.getTrips().find(t => t.vehicleId === vehicleId && t.status !== 'CLOSED');
        const driver = (trip && trip.driverId) ? LCOS_State.getDrivers().find(d => d.id === trip.driverId) : null;
        const commodity = (trip && trip.commodityId) ? LCOS_State.getCommodities().find(c => c.id === trip.commodityId) : null;
        const originBranch = trip ? LCOS_State.getBranches().find(b => b.id === trip.sourceBranchId) : null;
        const destBranch = trip ? LCOS_State.getBranches().find(b => b.id === trip.destinationBranchId) : null;

        if (!entry) {
            const visual = this.getMarkerVisualState(recordedAt, movementStatus, speedKmh);
            const icon = L.divIcon({
                className: 'lcos-truck-marker',
                html: `<div class="truck-marker-inner" style="width:28px; height:28px; display:flex; align-items:center; justify-content:center; transform:rotate(${heading}deg); transition:transform 0.4s ease;">
                    <div style="background-color:${visual.color}; width:20px; height:20px; border-radius:50%; border:2px solid #ffffff; box-shadow:0 0 8px ${visual.color}; display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px;">
                        ▲
                    </div>
                </div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
                popupAnchor: [0, -14],
            });

            const marker = L.marker([lat, lng], { icon });
            this.routeLayerGroup.addLayer(marker);

            const dName = data.driverName || (driver ? driver.name : (trip ? trip.driver_name : 'Assigned Driver'));
            const cDesc = data.cargoDesc || (commodity ? `${commodity.name} (${trip.quantity} ${commodity.unit})` : 'Freight Cargo');
            const oName = data.originName || (originBranch ? originBranch.name : 'Origin Hub');
            const dstName = data.destName || (destBranch ? destBranch.name : 'Destination Hub');

            entry = {
                vehicleId,
                marker,
                lastRecordedAt: recordedAt,
                currentLat: lat,
                currentLng: lng,
                targetLat: lat,
                targetLng: lng,
                heading,
                speedKmh,
                movementStatus,
                tripId: data.tripId || (trip ? trip.id : null),
                driverName: dName,
                cargoDesc: cDesc,
                originName: oName,
                destName: dstName,
                animFrame: null,
            };

            marker.bindPopup(this.getTruckPopupHtml(entry));
            marker.on('popupopen', () => {
                marker.setPopupContent(this.getTruckPopupHtml(entry));
                const btn = document.querySelector(`.ping-driver-btn[data-vehicle-id="${vehicleId}"]`);
                if (btn) btn.onclick = (e) => { e.preventDefault(); this.handleRequestLocation(vehicleId); };
            });

            this.vehicleMarkerRegistry.set(vehicleId, entry);
            return;
        }

        // Re-attach marker to layer group if missing
        if (!this.routeLayerGroup.hasLayer(entry.marker)) {
            this.routeLayerGroup.addLayer(entry.marker);
        }

        entry.targetLat = lat;
        entry.targetLng = lng;
        entry.heading = heading;
        entry.speedKmh = speedKmh;
        entry.movementStatus = movementStatus;
        entry.lastRecordedAt = recordedAt;
        if (data.driverName) entry.driverName = data.driverName;
        if (data.cargoDesc) entry.cargoDesc = data.cargoDesc;
        if (data.originName) entry.originName = data.originName;
        if (data.destName) entry.destName = data.destName;
        if (trip) {
            entry.tripId = trip.id;
            if (driver) entry.driverName = driver.name;
            if (commodity) entry.cargoDesc = `${commodity.name} (${trip.quantity} ${commodity.unit})`;
            if (originBranch) entry.originName = originBranch.name;
            if (destBranch) entry.destName = destBranch.name;
        }

        // Append to active history polyline if currently selected
        if (this.selectedTripHistoryPolyline && this.activeSelectedVehicleId === vehicleId) {
            this.selectedTripHistoryPolyline.addLatLng([lat, lng]);
        }

        // Clean up if trip has been closed
        if (movementStatus === 'CLOSED' || (trip && trip.status === 'CLOSED')) {
            this.removeVehicleFromMap(vehicleId);
            return;
        }

        // Update popup HTML if currently open
        if (entry.marker.isPopupOpen()) {
            entry.marker.setPopupContent(this.getTruckPopupHtml(entry));
            const btn = document.querySelector(`.ping-driver-btn[data-vehicle-id="${vehicleId}"]`);
            if (btn) btn.onclick = (e) => { e.preventDefault(); this.handleRequestLocation(vehicleId); };
        }

        // Jump distance check & tab visibility
        const distKm = this.haversineDistanceKm(entry.currentLat, entry.currentLng, lat, lng);
        const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';

        if (distKm > 5 || isHidden) {
            if (entry.animFrame) cancelAnimationFrame(entry.animFrame);
            entry.animFrame = null;
            entry.currentLat = lat;
            entry.currentLng = lng;
            entry.marker.setLatLng([lat, lng]);
            this.updateMarkerVisual(entry);
        } else {
            // Smoothly interpolate over 1.5 seconds using requestAnimationFrame
            if (entry.animFrame) cancelAnimationFrame(entry.animFrame);
            const startLat = entry.currentLat;
            const startLng = entry.currentLng;
            const startTime = performance.now();
            const duration = 1500;

            const step = (now) => {
                const elapsed = now - startTime;
                const progress = Math.min(1, elapsed / duration);
                const t = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;

                const curLat = startLat + (lat - startLat) * t;
                const curLng = startLng + (lng - startLng) * t;
                entry.marker.setLatLng([curLat, curLng]);

                if (progress < 1) {
                    entry.animFrame = requestAnimationFrame(step);
                } else {
                    entry.currentLat = lat;
                    entry.currentLng = lng;
                    entry.animFrame = null;
                    this.updateMarkerVisual(entry);
                }
            };
            entry.animFrame = requestAnimationFrame(step);
        }
    },

    async loadVehicleTripHistoryPolyline(vehicleId) {
        if (!vehicleId || !this.leafletMap || !this.routeLayerGroup) return;

        if (this.selectedTripHistoryPolyline) {
            this.routeLayerGroup.removeLayer(this.selectedTripHistoryPolyline);
            this.selectedTripHistoryPolyline = null;
        }

        this.activeSelectedVehicleId = vehicleId;

        try {
            const token = window.LCOS_API ? LCOS_API.getToken() : localStorage.getItem('LCOS_JWT_TOKEN');
            const res = await fetch(`/api/gps/history/${encodeURIComponent(vehicleId)}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });

            if (!res.ok) return;
            const data = await res.json();
            const list = data.records || data.history || [];
            if (!data.success || !Array.isArray(list) || list.length === 0) return;

            let points = list
                .filter(r => (r.lat || r.latitude) && (r.lng || r.longitude))
                .map(r => [Number(r.lat !== undefined ? r.lat : r.latitude), Number(r.lng !== undefined ? r.lng : r.longitude)]);

            // Downsample to <= 500 points if larger
            if (points.length > 500) {
                const step = Math.ceil(points.length / 500);
                const downsampled = [];
                for (let i = 0; i < points.length; i += step) {
                    downsampled.push(points[i]);
                }
                if (downsampled[downsampled.length - 1] !== points[points.length - 1]) {
                    downsampled.push(points[points.length - 1]);
                }
                points = downsampled;
            }

            if (points.length > 1) {
                this.selectedTripHistoryPolyline = L.polyline(points, {
                    color: '#2563eb',
                    weight: 4,
                    opacity: 0.9,
                    lineJoin: 'round',
                    lineCap: 'round',
                });
                this.routeLayerGroup.addLayer(this.selectedTripHistoryPolyline);
            }
        } catch (err) {
            console.warn('[History Polyline Load Error]:', err.message);
        }
    },

    removeVehicleFromMap(vehicleId) {
        if (!vehicleId) return;
        const entry = this.vehicleMarkerRegistry.get(vehicleId);
        if (entry) {
            if (entry.animFrame) cancelAnimationFrame(entry.animFrame);
            if (entry.marker && this.routeLayerGroup) {
                this.routeLayerGroup.removeLayer(entry.marker);
            }
            this.vehicleMarkerRegistry.delete(vehicleId);
        }
        if (this.activeSelectedVehicleId === vehicleId) {
            if (this.selectedTripHistoryPolyline && this.routeLayerGroup) {
                this.routeLayerGroup.removeLayer(this.selectedTripHistoryPolyline);
            }
            this.selectedTripHistoryPolyline = null;
            this.activeSelectedVehicleId = null;
        }
    },

    startStalenessWatcher() {
        if (this.stalenessIntervalId) clearInterval(this.stalenessIntervalId);
        this.stalenessIntervalId = setInterval(() => {
            this.vehicleMarkerRegistry.forEach((entry) => {
                this.updateMarkerVisual(entry);
                if (entry.marker.isPopupOpen()) {
                    entry.marker.setPopupContent(this.getTruckPopupHtml(entry));
                }
            });
        }, 30000);
    },

    handleRequestLocation(vehicleId, feedbackElementId) {
        if (!vehicleId) return;
        const feedbackEl = feedbackElementId
            ? document.getElementById(feedbackElementId)
            : document.getElementById(`ping-status-${vehicleId}`);
        const btn = document.querySelector(`.ping-driver-btn[data-vehicle-id="${vehicleId}"]`) ||
                    document.getElementById('btn-sim-ping');

        if (btn) btn.disabled = true;
        if (feedbackEl) {
            feedbackEl.innerHTML = '<span style="color:#2563eb;">⏳ Contacting driver device...</span>';
        }

        if (!this.socket || !this.socket.connected) {
            if (feedbackEl) feedbackEl.innerHTML = '<span style="color:#dc2626;">❌ Dashboard socket disconnected</span>';
            if (btn) btn.disabled = false;
            return;
        }

        this.socket.emit('request_location', { vehicleId }, (res) => {
            if (!res) return;

            if (res.status === 'sent') {
                if (feedbackEl) {
                    feedbackEl.innerHTML = '<span style="color:#059669;">📡 Ping sent! Waiting for GPS fix...</span>';
                }

                let secondsLeft = 15;
                const startTime = Date.now();
                const timerId = setInterval(() => {
                    secondsLeft--;
                    const entry = this.vehicleMarkerRegistry.get(vehicleId);
                    if (entry && entry.lastRecordedAt && new Date(entry.lastRecordedAt).getTime() > startTime) {
                        clearInterval(timerId);
                        const elapsedSec = Math.max(1, Math.round((Date.now() - new Date(entry.lastRecordedAt).getTime()) / 1000));
                        if (feedbackEl) {
                            feedbackEl.innerHTML = `<span style="color:#059669; font-weight:700;">✅ Location received (${elapsedSec}s ago)</span>`;
                        }
                        if (btn) btn.disabled = false;
                        return;
                    }

                    if (secondsLeft <= 0) {
                        clearInterval(timerId);
                        if (feedbackEl) {
                            feedbackEl.innerHTML = '<span style="color:#dc2626; font-weight:700;">⚠️ Request timed out (Driver not responding)</span>';
                        }
                        if (btn) btn.disabled = false;
                    } else if (feedbackEl) {
                        feedbackEl.innerHTML = `<span style="color:#059669;">📡 Waiting for fix... (${secondsLeft}s)</span>`;
                    }
                }, 1000);
            } else if (res.status === 'driver_not_connected') {
                if (feedbackEl) {
                    feedbackEl.innerHTML = '<span style="color:#d97706; font-weight:700;">⚠️ Driver not tracking (App closed or offline)</span>';
                }
                if (btn) btn.disabled = false;
            } else if (res.status === 'rate_limited') {
                if (feedbackEl) {
                    feedbackEl.innerHTML = `<span style="color:#d97706;">⏳ ${this.escapeHtml(res.message)}</span>`;
                }
                if (btn) btn.disabled = false;
            } else {
                if (feedbackEl) {
                    feedbackEl.innerHTML = `<span style="color:#dc2626;">❌ ${this.escapeHtml(res.message || 'Unauthorized')}</span>`;
                }
                if (btn) btn.disabled = false;
            }
        });
    },

    updateMapHighlights() {
        if (!this.leafletMap || !this.routeLayerGroup) return;

        this.routeLayerGroup.clearLayers();
        const selectedVehTripId = document.getElementById('map-filter-vehicle')?.value;
        const selectedDistrict = document.getElementById('map-filter-district')?.value;

        if (selectedDistrict) {
            const b = LCOS_State.getBranches().find(br => br.id === selectedDistrict);
            if (b && b.lat && b.lng) {
                this.leafletMap.flyTo([b.lat, b.lng], 11, { duration: 1 });
            }
        } else if (!selectedVehTripId) {
            this.leafletMap.fitBounds([[8.05, 76.2], [13.55, 80.35]], { padding: [15, 15] });
        }

        if (this.activeTab === 'dashboard') {
            const filteredTrips = this.getFilteredTrips();

            // Clean up closed trips from registry and map
            filteredTrips.forEach(trip => {
                if (trip.status === 'CLOSED' && trip.vehicleId) {
                    this.removeVehicleFromMap(trip.vehicleId);
                }
            });

            const activeTrips = filteredTrips.filter(t => t.status !== 'CLOSED' && t.status !== 'COMPLETED_RETURN');
            activeTrips.forEach(trip => {
                if (!selectedVehTripId || trip.id === selectedVehTripId) {
                    const endpoints = this.getTripEndpoints(trip);
                    const { origin, destination } = endpoints;

                    // Highway route polyline connecting Origin to Destination
                    const routeColor = trip.status === 'DELAYED' ? '#ef4444' : (trip.status === 'CLOSED' ? '#10b981' : '#38bdf8');
                    const routeLine = L.polyline([[origin.lat, origin.lng], [destination.lat, destination.lng]], {
                        color: routeColor,
                        weight: 4,
                        opacity: 0.85,
                        dashArray: trip.status === 'CLOSED' ? null : '6, 8',
                        lineCap: 'round',
                        lineJoin: 'round'
                    });
                    this.routeLayerGroup.addLayer(routeLine);

                    // Vehicle Marker in Registry
                    const vehicleId = trip.vehicleId;
                    const pos = this.getTripCurrentCoordinates(trip);
                    const veh = LCOS_State.getVehicles().find(v => v.id === vehicleId);

                    this.updateSingleVehicleMarker({
                        vehicleId,
                        tripId: trip.id,
                        lat: pos.lat,
                        lng: pos.lng,
                        speedKmh: trip.speedKmh || (veh?.speedKmh) || 0,
                        movementStatus: trip.movementStatus || (veh?.movementStatus) || (trip.status === 'IN_TRANSIT' ? 'MOVING' : 'STOPPED'),
                        recordedAt: trip.last_gps_update || (veh?.lastGpsUpdate) || trip.lastUpdateTimestamp || '1970-01-01T00:00:00.000Z'
                    });

                    let entry = this.vehicleMarkerRegistry.get(vehicleId);
                    if (entry && !this.routeLayerGroup.hasLayer(entry.marker)) {
                        this.routeLayerGroup.addLayer(entry.marker);
                    }

                    if (selectedVehTripId && trip.id === selectedVehTripId) {
                        if (entry) {
                            this.leafletMap.flyTo([entry.currentLat, entry.currentLng], 14, { duration: 1 });
                            setTimeout(() => entry.marker.openPopup(), 400);
                        }
                        this.loadVehicleTripHistoryPolyline(vehicleId);
                    }
                }
            });

            // Re-attach selected history polyline if present
            if (this.selectedTripHistoryPolyline) {
                this.routeLayerGroup.addLayer(this.selectedTripHistoryPolyline);
            }
        } else if (this.activeConsoleTripId && this.activeTab === 'operations') {
            const trip = LCOS_State.getTripById(this.activeConsoleTripId);
            if (trip && trip.status !== 'CLOSED') {
                const bSrc = LCOS_State.getBranches().find(b => b.id === trip.sourceBranchId);
                const bDest = LCOS_State.getBranches().find(b => b.id === trip.destinationBranchId);

                if (bSrc && bSrc.lat && bDest && bDest.lat && this.routeLayerGroup) {
                    const line = L.polyline([[bSrc.lat, bSrc.lng], [bDest.lat, bDest.lng]], {
                        color: '#38bdf8',
                        weight: 4,
                        opacity: 0.9
                    });
                    this.routeLayerGroup.addLayer(line);
                }
            }
        }
    },

    syncLiveTripTelemetry(tripId, telemetryData) {
        const trip = LCOS_State.getTripById(tripId);
        if (!trip) return false;

        trip.isLiveSynced = true;
        trip.telemetrySource = telemetryData.source || 'LIVE_GPS_IoT';
        if (telemetryData.realOriginGPS) trip.realOriginGPS = telemetryData.realOriginGPS;
        if (telemetryData.realDestinationGPS) trip.realDestinationGPS = telemetryData.realDestinationGPS;
        if (telemetryData.currentGPS) trip.currentGPS = telemetryData.currentGPS;
        if (telemetryData.lastLocation) {
            if (!trip.transitUpdates) trip.transitUpdates = [];
            trip.transitUpdates.push({
                timestamp: new Date().toISOString(),
                location: telemetryData.lastLocation,
                status: telemetryData.status || trip.status,
                remarks: 'Live GPS Auto-Sync telemetry update received.'
            });
            // Cap transitUpdates to prevent excessive memory consumption
            if (trip.transitUpdates.length > 50) {
                trip.transitUpdates = trip.transitUpdates.slice(-50);
            }
        }

        // Direct marker update without re-rendering entire map
        if (trip.vehicleId && telemetryData.currentGPS) {
            this.updateSingleVehicleMarker({
                vehicleId: trip.vehicleId,
                tripId: trip.id,
                lat: telemetryData.currentGPS.lat,
                lng: telemetryData.currentGPS.lng,
                movementStatus: telemetryData.status || trip.status,
            });
        }
        return true;
    },

    initSocketTelemetryListener() {
        if (typeof io === 'undefined') return;
        const token = window.LCOS_API ? LCOS_API.getToken() : localStorage.getItem('LCOS_JWT_TOKEN');
        if (!token) {
            console.log('📡 [Socket.IO] No active auth token; socket connection deferred until login.');
            return;
        }
        try {
            if (this.socket) {
                try { this.socket.disconnect(); } catch (e) {}
                this.socket = null;
            }
            this.socket = io({
                auth: { token },
                transports: ['websocket', 'polling']
            });
            this.socket.on('connect', () => {
                console.log('📡 [Socket.IO] Authenticated socket connected successfully.');
                if (this._hadSocketDisconnect) {
                    console.log('🔄 [Socket.IO] Reconnect detected: refetching live trips and vehicles...');
                    this.refreshAlertsAndDashboard();
                    this._hadSocketDisconnect = false;
                }
            });
            this.socket.on('disconnect', (reason) => {
                console.warn(`[Socket.IO] Disconnected: ${reason}`);
                this._hadSocketDisconnect = true;
            });
            this.socket.on('token_expired', () => {
                this.showToast('Session expired. Please log in again.', 'danger');
                if (typeof this.handleLogout === 'function') {
                    this.handleLogout();
                }
            });
            this.socket.on('connect_error', (err) => {
                console.warn('⚠️ [Socket.IO Auth Error]:', err.message);
            });
            this.socket.on('gps_update', (data) => {
                if (!data) return;

                // 1. Update ONLY that marker on the Leaflet map (smooth animation)
                this.updateSingleVehicleMarker(data);

                // 2. Synchronize LCOS_State vehicle & trip models in memory
                if (window.LCOS_State) {
                    const veh = (LCOS_State.getVehicles() || []).find(v => v.id === data.vehicleId);
                    if (veh) {
                        veh.current_lat = data.lat;
                        veh.current_lng = data.lng;
                        veh.currentLat = data.lat;
                        veh.currentLng = data.lng;
                        veh.speedKmh = data.speedKmh;
                        veh.movementStatus = data.movementStatus;
                        veh.heading = data.heading;
                        veh.lastGpsUpdate = data.recordedAt;
                    }
                    const trip = (LCOS_State.getTrips() || []).find(t => t.vehicleId === data.vehicleId || (data.tripId && t.id === data.tripId));
                    if (trip) {
                        trip.currentLat = data.lat;
                        trip.currentLng = data.lng;
                        trip.speedKmh = data.speedKmh;
                        trip.movementStatus = data.movementStatus;
                        trip.last_gps_update = data.recordedAt;
                        trip.lastUpdateTimestamp = data.recordedAt;
                        trip.isLiveSynced = true;
                        if (['CREATED', 'SCHEDULED', 'DISPATCH_APPROVED'].includes(trip.status)) {
                            trip.status = 'IN_TRANSIT';
                        }
                    }
                }

                // 3. Pan to vehicle if operator explicitly focused it
                if (this.activeSelectedVehicleId === data.vehicleId && this.leafletMap) {
                    this.leafletMap.panTo([data.lat, data.lng]);
                }

                // 4. Update Running Trucks filter count if newly active
                const vehSelect = document.getElementById('map-filter-vehicle');
                if (vehSelect && data.tripId && !Array.from(vehSelect.options).some(opt => opt.value === data.tripId)) {
                    this.updateMapReport();
                }
            });

            this.socket.on('stoppage_driver_response', async (data) => {
                if (!data) return;
                try {
                    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                    audio.volume = 0.5;
                    audio.play().catch(() => {});
                } catch (e) {}
                await this.refreshAlertsAndDashboard();
                this.showToast(`🚨 Driver WhatsApp Reply: ${data.driverName || 'Driver'} reported "${data.reason || 'Delay'}"`, 'warning');
            });

            this.socket.on('alert_created', async (data) => {
                try {
                    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                    audio.volume = 0.5;
                    audio.play().catch(() => {});
                } catch (e) {}
                await this.refreshAlertsAndDashboard();
                this.showToast(`⚠️ Stoppage Alert: ${data?.message || 'New operations alert'}`, 'danger');
            });

            this.socket.on('stoppage_reason_accepted', async (data) => {
                await this.refreshAlertsAndDashboard();
                this.showToast(`✅ Delay reason approved for ${data?.vehicleId || 'vehicle'}. Vehicle moving forward!`, 'success');
            });

            this.socket.on('stoppage_reason_declined', async (data) => {
                await this.refreshAlertsAndDashboard();
                this.showToast(`📞 Delay reason declined for ${data?.vehicleId || 'vehicle'}. Calling driver...`, 'warning');
            });

            console.log('[LCOS Telemetry] Auto-Sync WebSocket listener initialized.');
        } catch (e) {
            console.warn('[LCOS Telemetry] WebSocket listener setup note:', e);
        }
    },

    showMapTooltip(text, x, y) {
        const tip = document.getElementById('map-tip');
        if (!tip) return;
        tip.innerHTML = text.replace(/ \| /g, '<br>');
        tip.style.display = 'block';
        tip.style.left = `${x}%`;
        tip.style.top = `${y - 6}%`;
        tip.style.transform = 'translate(-50%, -50%)';
    },

    hideMapTooltip() {
        const tip = document.getElementById('map-tip');
        if (tip) {
            tip.style.display = 'none';
            tip.style.transform = '';
        }
    },

    handleMapNodeClick(branchId) {
        // District clicks are disabled for routes only map view
    },

    getConsoleEmpId() {
        const role = LCOS_State.getCurrentRole();
        if (role !== 'tracking_team') return 'Manager/Viewer';
        
        const empInput = document.getElementById('op-emp-id');
        const empId = empInput ? empInput.value.trim() : '';
        if (!empId) {
            this.showToast('Please enter your Employee ID (Emp ID) first!', 'warning');
            if (empInput) empInput.focus();
            return null;
        }
        this.operatorEmpId = empId;
        return empId;
    },

    // --- Modal Handling ---

    openModal(modalId) {
        document.getElementById(modalId).classList.add('active');

        // Prepopulate Modal Select fields if creating trip
        if (modalId === 'modal-create-trip') {
            const sourceSelect = document.getElementById('t-source');
            const destSelect = document.getElementById('t-dest');
            const comSelect = document.getElementById('t-commodity');
            const vehSelect = document.getElementById('t-vehicle');
            const drvSelect = document.getElementById('t-driver');
            const hlpSelect = document.getElementById('t-helper');

            const branches = LCOS_State.getBranches();
            const commodities = LCOS_State.getCommodities();
            const vehicles = LCOS_State.getVehicles().filter(v => v.status === 'Available');
            const drivers = LCOS_State.getDrivers().filter(d => d.status === 'Available');
            const helpers = LCOS_State.getHelpers().filter(h => h.status === 'Available');

            sourceSelect.innerHTML = branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
            destSelect.innerHTML = branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
            
            // Avoid same source and destination default
            if (sourceSelect.children.length > 1) {
                destSelect.selectedIndex = 1;
            }

            comSelect.innerHTML = commodities.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            
            // Set qty weight label based on default selection
            const updateQtyWeightLabel = () => {
                const comId = comSelect.value;
                const cObj = commodities.find(c => c.id === comId);
                const branchId = sourceSelect.value;
                const availableStock = LCOS_State.getStock()[branchId]?.[comId]?.available || 0;
                document.getElementById('t-qty-label').textContent = `Available stock at source: ${availableStock} ${cObj ? cObj.unit : 'units'} (${cObj ? cObj.weight : 0}kg / unit)`;
                document.getElementById('t-qty').max = Math.max(1, availableStock);
                document.getElementById('t-qty').value = Math.max(1, Math.min(100, availableStock));
            };

            comSelect.onchange = updateQtyWeightLabel;
            sourceSelect.onchange = updateQtyWeightLabel;
            updateQtyWeightLabel();

            vehSelect.innerHTML = vehicles.length > 0 
                ? vehicles.map(v => `<option value="${v.id}">${v.id} - ${v.type} (Cap: ${v.capacity} MT)</option>`).join('')
                : '<option value="">No Available Vehicles</option>';

            drvSelect.innerHTML = drivers.length > 0
                ? drivers.map(d => `<option value="${d.id}">${d.name} (Exp: ${d.experience}y, Perf: ${d.performance}%)</option>`).join('')
                : '<option value="">No Available Drivers</option>';

            hlpSelect.innerHTML = '<option value="">No Helper assigned</option>' + 
                helpers.map(h => `<option value="${h.id}">${h.name} (${h.role})</option>`).join('');
        }
    },

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    },

    handleCreateTrip() {
        const source = document.getElementById('t-source').value;
        const dest = document.getElementById('t-dest').value;
        const comId = document.getElementById('t-commodity').value;
        const qty = Number(document.getElementById('t-qty').value);
        const vehId = document.getElementById('t-vehicle').value;
        const drvId = document.getElementById('t-driver').value;
        const hlpId = document.getElementById('t-helper').value || null;
        const durationHours = Number(document.getElementById('t-hours').value);

        const empId = document.getElementById('t-emp-id').value.trim();
        if (!empId) {
            this.showToast('Operator Employee ID is required to schedule dispatch.', 'warning');
            return;
        }
        this.operatorEmpId = empId;

        if (source === dest) {
            this.showToast('Source and Destination branches cannot be the same.', 'warning');
            return;
        }

        if (!vehId || !drvId) {
            this.showToast('You must assign an available Vehicle and Driver to schedule dispatch.', 'warning');
            return;
        }

        const availableStock = LCOS_State.getStock()[source]?.[comId]?.available || 0;
        if (qty > availableStock) {
            this.showToast(`Insufficient stock at source branch. Maximum available: ${availableStock}`, 'warning');
            return;
        }

        const simTimeStr = LCOS_State.getSystemSettings().simulationTime;
        const dispatchDate = new Date(simTimeStr);
        const etaDate = new Date(simTimeStr);
        etaDate.setHours(etaDate.getHours() + durationHours);

        const tripId = 'TRIP-' + (LCOS_State.getTrips().length + 1001);
        const dispId = 'DISP-' + (LCOS_State.getTrips().length + 2001);

        LCOS_State.addTrip({
            id: tripId,
            dispatchId: dispId,
            commodityId: comId,
            quantity: qty,
            sourceBranchId: source,
            destinationBranchId: dest,
            vehicleId: vehId,
            driverId: drvId,
            helperId: hlpId,
            dispatchDate: dispatchDate.toISOString(),
            expectedDeliveryDate: etaDate.toISOString(),
            status: 'CREATED',
            createdBy: empId,
            checklists: {
                dispatch: { loaded: false, verified: false, vehicleReady: false, driverAvailable: false },
                delivery: { quantityMatches: false, damagesChecked: false, missingChecked: false, conditionOk: false }
            },
            transitUpdates: [],
            callLogs: [],
            deliveryInfo: null,
            lastUpdateTimestamp: simTimeStr
        });

        // Add Call Log
        LCOS_State.addCallLog({
            tripId: tripId,
            type: 'Dispatch Confirmation',
            caller: 'Admin Office',
            recipient: 'System Scheduler',
            notes: `Scheduled shipment ${tripId} carrying ${qty} units of commodity to ${dest}. Assigned driver and vehicle.`
        });

        this.closeModal('modal-create-trip');
        this.showToast(`New Shipment ${tripId} created. Transitioned to Draft.`, 'success');
        this.renderAll();
        
        // Auto open this trip in Operations console
        this.openTripInConsole(tripId);
    },

    async handleLogCall() {
        let tripId = document.getElementById('call-trip-id')?.value?.trim();
        const tripRef = document.getElementById('call-trip-ref')?.value?.trim() || '';
        const category = document.getElementById('call-category')?.value || 'Delay Check';
        const caller = document.getElementById('call-caller')?.value || 'Admin Office';
        const loc = document.getElementById('call-location')?.value || '';
        const notes = document.getElementById('call-notes')?.value || '';

        const empInput = document.getElementById('call-emp-id');
        let empId = empInput ? empInput.value.trim() : '';
        if (!empId) {
            empId = this.operatorEmpId || 'EMP-101';
            if (empInput) empInput.value = empId;
        }
        this.operatorEmpId = empId;

        // Smart Trip resolution
        const allTrips = LCOS_State.getTrips() || [];
        let trip = tripId ? LCOS_State.getTripById(tripId) : null;

        if (!trip && tripRef) {
            const cleanRef = tripRef.replace(/^TRIP\s*[\/\-]\s*/i, '').trim();
            trip = allTrips.find(t => 
                t.id === cleanRef || 
                t.vehicleId === cleanRef || 
                tripRef.includes(t.vehicleId) || 
                tripRef.includes(t.id)
            );
        }
        if (!trip && tripId) {
            trip = allTrips.find(t => t.vehicleId === tripId);
        }
        if (!trip && allTrips.length > 0) {
            trip = allTrips[0];
        }

        const finalTripId = trip ? trip.id : (tripId || (tripRef ? tripRef.replace(/^TRIP\s*[\/\-]\s*/i, '') : 'TRIP-1002'));

        try {
            const drv = trip ? LCOS_State.getDrivers().find(d => d.id === trip.driverId) : null;
            const callerText = caller === 'Driver' ? `Driver (${drv ? drv.name : 'Driver'})` : caller;
            const recipientText = caller === 'Driver' ? 'Admin Office' : (drv ? `Driver (${drv.name})` : 'Driver/Manager');

            const logId = await LCOS_State.addCallLog({
                tripId: finalTripId,
                type: category,
                caller: callerText,
                recipient: recipientText,
                location: loc,
                empId: empId,
                notes: `Location: ${loc || '--'}. Operator: ${empId}. Notes: ${notes}`
            });

            if (trip && (loc || notes)) {
                const simTime = LCOS_State.getSystemSettings().simulationTime || new Date().toISOString();
                const transitUpdate = {
                    timestamp: simTime,
                    location: loc || 'Transit Route Checkpoint',
                    condition: 'Good',
                    status: trip.status || 'IN_TRANSIT',
                    delayReason: '',
                    remarks: `Call logged by ${empId}: ${notes}`,
                    operatorId: empId
                };

                await LCOS_State.updateTripStatus(trip.id, trip.status || 'IN_TRANSIT', null, transitUpdate);
            }

            this.closeModal('modal-log-call');
            const form = document.getElementById('form-log-call');
            if (form) form.reset();

            this.showToast(`✅ Call conversation logged (${logId || 'Recorded'})! Available in Call Logs tab.`, 'success');
            await LCOS_State.loadFromBackend();
            this.renderAll();
        } catch (err) {
            console.error('handleLogCall error:', err);
            this.showToast(`Error recording call log: ${err.message}`, 'danger');
        }
    },

    // --- Action Operations Controls ---


    answerSimulatedCall(alertId) {
        const alert = LCOS_State.getAlerts().find(a => a.id === alertId);
        if (!alert) return;

        const trip = LCOS_State.getTripById(alert.tripId);
        if (!trip) return;

        LCOS_State.resolveAlert(alertId);
        this.openTripInConsole(trip.id);
        
        // Open Call logs modal prepopulated
        document.getElementById('call-trip-id').value = trip.id;
        document.getElementById('call-trip-ref').value = `${trip.id} - ${trip.vehicleId}`;
        document.getElementById('call-category').value = 'Transit Update';
        document.getElementById('call-caller').value = 'Driver';
        document.getElementById('call-notes').value = 'Driver calling in to report transit parameters. Vehicle moving smoothly.';
        
        this.openModal('modal-log-call');
    },

    startEscalationCall(alertId) {
        const alert = LCOS_State.getAlerts().find(a => a.id === alertId);
        if (!alert) return;

        this.openTripInConsole(alert.tripId);
        this.showToast('Triggered Call Escalation Flow on Trip Console.', 'info');
    },

    resolveBreakdownAlert(alertId) {
        const alert = LCOS_State.getAlerts().find(a => a.id === alertId);
        if (!alert) return;

        const trip = LCOS_State.getTripById(alert.tripId);
        if (!trip) return;

        const simTime = LCOS_State.getSystemSettings().simulationTime;
        
        // Transition back to IN_TRANSIT
        trip.status = 'IN_TRANSIT';
        trip.transitUpdates.push({
            timestamp: simTime,
            location: trip.transitUpdates.length > 0 ? trip.transitUpdates[trip.transitUpdates.length - 1].location : 'Highway',
            condition: 'Good',
            status: 'IN_TRANSIT',
            delayReason: '',
            remarks: 'Breakdown resolved. Mechanics serviced engine. Trip resumed.'
        });
        trip.lastUpdateTimestamp = simTime;

        LCOS_State.resolveAlert(alertId);
        LCOS_State.addCallLog({
            tripId: trip.id,
            type: 'Transit Update',
            caller: 'Admin Office',
            recipient: 'Driver',
            notes: 'Spoke with driver. Confirmed engine service complete, truck moving.'
        });

        LCOS_State.save();
        this.showToast('Vehicle breakdown resolved. Shipments back in transit.', 'success');
        this.renderAll();
    },

    dismissAlert(alertId) {
        const role = LCOS_State.getCurrentRole();
        if (role !== 'branch_manager' && role !== 'super_admin') {
            this.showToast('Access Denied: Only Branch Managers can dismiss operations alerts.', 'warning');
            return;
        }
        LCOS_State.resolveAlert(alertId);
        this.renderDashboard();
        this.showToast('Alert dismissed.', 'info');
    },

    viewReceipt(tripId) {
        const trip = LCOS_State.getTripById(tripId);
        if (!trip || !trip.deliveryInfo) return;

        const com = LCOS_State.getCommodities().find(c => c.id === trip.commodityId);
        const src = LCOS_State.getBranches().find(b => b.id === trip.sourceBranchId);
        const dest = LCOS_State.getBranches().find(b => b.id === trip.destinationBranchId);
        
        const info = trip.deliveryInfo;

        const formatDate = (isoStr) => {
            const date = new Date(isoStr);
            return date.toLocaleString();
        };

        const receiptHTML = `
            <div class="receipt-paper">
                <div class="receipt-header">
                    <h3>TAMIL NADU LOGISTICS</h3>
                    <p>OFFICIAL DIGITAL RECEIPT</p>
                    <p style="font-size:0.75rem; margin-top:0.25rem;">HQ Admin Operations, Chennai</p>
                </div>
                
                <div class="receipt-row">
                    <span>Receipt No:</span>
                    <strong>${info.receiptNumber}</strong>
                </div>
                <div class="receipt-row">
                    <span>Trip Reference:</span>
                    <strong>${trip.id}</strong>
                </div>
                <div class="receipt-row">
                    <span>Dispatch ID:</span>
                    <strong>${trip.dispatchId}</strong>
                </div>
                <div class="receipt-row">
                    <span>Timestamp:</span>
                    <strong>${formatDate(info.closedTimestamp)}</strong>
                </div>
                <div style="border-top:1px dashed #0f172a; margin: 1rem 0;"></div>
                
                <div class="receipt-row">
                    <span>Source Branch:</span>
                    <strong>${src ? src.name : 'Unknown'} (${trip.sourceBranchId})</strong>
                </div>
                <div class="receipt-row">
                    <span>Destination Branch:</span>
                    <strong>${dest ? dest.name : 'Unknown'} (${trip.destinationBranchId})</strong>
                </div>
                <div class="receipt-row">
                    <span>Vehicle No:</span>
                    <strong>${trip.vehicleId}</strong>
                </div>
                
                <table class="receipt-table">
                    <thead>
                        <tr style="border-bottom:1px solid #0f172a;">
                            <th align="left">Description</th>
                            <th align="right">Qty Sent</th>
                            <th align="right">Qty Recd</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${com ? com.name : 'Commodity Load'}</td>
                            <td align="right">${trip.quantity}</td>
                            <td align="right">${info.receivedQuantity}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="receipt-row">
                    <span>Damaged Items:</span>
                    <strong>${info.damagesCount}</strong>
                </div>
                <div class="receipt-row">
                    <span>Missing Items:</span>
                    <strong>${info.missingCount}</strong>
                </div>
                <div class="receipt-row">
                    <span>Cargo Quality Rating:</span>
                    <strong>${info.condition.toUpperCase()}</strong>
                </div>
                
                <div style="border-top:1px dashed #0f172a; margin: 1rem 0;"></div>
                
                <div class="receipt-row">
                    <span>Receiver Manager:</span>
                    <strong>${info.receiverName}</strong>
                </div>
                
                <div class="receipt-footer">
                    <p>*** Thank You for Choosing LCOS Networks ***</p>
                    <p style="font-size:0.65rem; margin-top:0.25rem;">This is a computer-generated confirmation. No physical signature required.</p>
                </div>
            </div>
        `;

        document.getElementById('receipt-modal-content').innerHTML = receiptHTML;
        this.openModal('modal-receipt');
    },

    // --- Toast Notifications ---
    showToast(message, type = 'info') {
        const wrapper = document.getElementById('toasts-wrapper');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icons = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            danger: '🚨'
        };

        toast.innerHTML = `
            <div style="font-size:1.25rem;">${icons[type] || 'ℹ️'}</div>
            <div style="font-size:0.85rem; font-weight:600;">${message}</div>
        `;

        wrapper.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'none'; // reset animation to trigger exit
            toast.style.transition = 'all 0.5s ease';
            toast.style.transform = 'translateY(-100px)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 5000);
    },

    escalateAlertToManager(alertId) {
        LCOS_State.escalateAlertToManager(alertId);
        this.showToast('Incident successfully escalated to Branch Manager.', 'warning');
        this.renderAll();
    },

    approveRequest(reqId) {
        const success = LCOS_State.approveManagerRequest(reqId);
        if (success) {
            this.showToast(`Request ${reqId} approved and resource registered.`, 'success');
            this.renderAll();
        } else {
            this.showToast('Failed to approve request.', 'danger');
        }
    },

    openRequestModal(category) {
        const select = document.getElementById('req-resource-type');
        if (select) {
            select.value = category;
            this.renderRequestFields(category);
        }
        this.openModal('modal-request-resource');
    },

    renderRequestFields(type) {
        const container = document.getElementById('req-fields-container');
        if (!container) return;
        
        if (type === 'Add Driver') {
            container.innerHTML = `
                <div class="form-group">
                    <label class="form-label">Driver Full Name</label>
                    <input type="text" class="form-control" id="req-drv-name" required>
                </div>
                <div class="form-group">
                    <label class="form-label">License Number</label>
                    <input type="text" class="form-control" id="req-drv-license" placeholder="DL-XXXXXXXXXXXXX" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Contact Number</label>
                        <input type="text" class="form-control" id="req-drv-phone" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Experience (Years)</label>
                        <input type="number" class="form-control" id="req-drv-exp" min="0" required>
                    </div>
                </div>
            `;
        } else if (type === 'Add Vehicle') {
            container.innerHTML = `
                <div class="form-group">
                    <label class="form-label">Vehicle Reg Number</label>
                    <input type="text" class="form-control" id="req-veh-id" placeholder="TN-XX-XX-XXXX" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Vehicle Type</label>
                    <select class="form-control" id="req-veh-type">
                        <option value="Lorry">Lorry</option>
                        <option value="Container">Container</option>
                        <option value="Mini Truck">Mini Truck</option>
                    </select>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Capacity (Metric Tons)</label>
                        <input type="number" class="form-control" id="req-veh-capacity" min="1" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Ownership</label>
                        <select class="form-control" id="req-veh-owner">
                            <option value="Self Owned">Self Owned</option>
                            <option value="Logistics Partners">Logistics Partners</option>
                        </select>
                    </div>
                </div>
            `;
        } else if (type === 'Add Stock') {
            const brOpts = LCOS_State.getBranches().map(b => `<option value="${b.id}">${b.name}</option>`).join('');
            const comOpts = LCOS_State.getCommodities().map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            container.innerHTML = `
                <div class="form-group">
                    <label class="form-label">Target Warehouse Branch</label>
                    <select class="form-control" id="req-stock-branch">${brOpts}</select>
                </div>
                <div class="form-group">
                    <label class="form-label">Commodity to Refill</label>
                    <select class="form-control" id="req-stock-commodity">${comOpts}</select>
                </div>
                <div class="form-group">
                    <label class="form-label">Refill Quantity</label>
                    <input type="number" class="form-control" id="req-stock-qty" min="1" required>
                </div>
            `;
        }
    },

    async renderBillingView() {
        try {
            // Fetch current active subscription from API
            if (window.LCOS_API) {
                const subRes = await LCOS_API.getCurrentSubscription();
                if (subRes && subRes.success && subRes.subscription) {
                    const sub = subRes.subscription;
                    const planName = sub.plan_name || 'Professional Plan';
                    const expiry = sub.expiry_date ? new Date(sub.expiry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Active';
                    
                    const nameEl = document.getElementById('billing-current-plan-name');
                    const descEl = document.getElementById('billing-current-plan-desc');
                    const expEl = document.getElementById('billing-expiry-date');
                    
                    if (nameEl) nameEl.textContent = `${planName} (${sub.status || 'ACTIVE'})`;
                    if (descEl) descEl.textContent = `₹${sub.price_inr || 2999} / ${sub.billing_cycle || 'MONTHLY'} • Max ${sub.max_vehicles || 50} Vehicles • Max ${sub.max_users || 20} Users`;
                    if (expEl) expEl.textContent = `Expires / Renews: ${expiry}`;
                }

                // Fetch payments/invoices history
                const invRes = await LCOS_API.getInvoices();
                const tbody = document.querySelector('#table-billing-invoices tbody');
                if (tbody && invRes && invRes.success && Array.isArray(invRes.invoices)) {
                    tbody.innerHTML = invRes.invoices.map(inv => {
                        const baseAmt = Number(inv.amount || 2999);
                        const taxAmt = Number(inv.tax_amount || Math.round(baseAmt * 0.18));
                        const totalAmt = Number(inv.total_amount || baseAmt + taxAmt);
                        const dateStr = inv.issued_at ? new Date(inv.issued_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Today';
                        const gateway = inv.billing_details && inv.billing_details.gateway ? inv.billing_details.gateway : 'RAZORPAY';

                        return `
                            <tr>
                                <td><strong>${inv.invoice_number || inv.id}</strong></td>
                                <td><span style="font-family:monospace; font-size:0.8rem;">${inv.payment_id || 'PAY-1001'}</span></td>
                                <td>Professional Plan</td>
                                <td>₹${baseAmt.toLocaleString('en-IN')}</td>
                                <td>₹${taxAmt.toLocaleString('en-IN')}</td>
                                <td><strong style="color:var(--text-bright);">₹${totalAmt.toLocaleString('en-IN')}</strong></td>
                                <td><span class="badge badge-secondary" style="font-size:0.7rem;">${gateway}</span></td>
                                <td><span class="badge badge-success" style="font-size:0.7rem;">${inv.status || 'PAID'}</span></td>
                                <td>${dateStr}</td>
                                <td>
                                    <button class="btn btn-secondary" style="padding:0.25rem 0.6rem; font-size:0.75rem;" onclick="app.viewInvoice('${inv.invoice_number || inv.id}')">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:2px;"><path d="M6 9V2h12v7"></path><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                                        Print Invoice
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('');
                }
            }
        } catch (err) {
            console.warn('Billing view render note:', err.message);
        }

        // Bind plan selection click listeners
        document.querySelectorAll('.btn-select-plan').forEach(btn => {
            btn.onclick = (e) => {
                const planId = e.currentTarget.getAttribute('data-plan-id');
                this.handleSelectPlan(planId);
            };
        });

        const renewBtn = document.getElementById('btn-renew-subscription');
        if (renewBtn) {
            renewBtn.onclick = () => this.handleSelectPlan('PLAN-PRO');
        }

        const refreshBtn = document.getElementById('btn-refresh-billing');
        if (refreshBtn) {
            refreshBtn.onclick = () => this.renderBillingView();
        }
    },

    async initLandingSubscription() {
        try {
            if (window.LCOS_API && typeof window.LCOS_API.getCurrentSubscription === 'function') {
                const res = await LCOS_API.getCurrentSubscription().catch(() => null);
                if (res && res.subscription) {
                    this.currentSubscription = res.subscription;
                    this.isSubscriptionActive = res.subscription.status === 'ACTIVE' && !res.isExpired;
                    if (this.isSubscriptionActive) {
                        localStorage.setItem('LCOS_SUB_ACTIVE', 'true');
                        localStorage.setItem('LCOS_SUB_DATA', JSON.stringify(this.currentSubscription));
                    }
                }
            }
        } catch (err) {
            console.warn('Subscription fetch notice:', err.message);
        }

        if (!this.currentSubscription) {
            const cachedActive = localStorage.getItem('LCOS_SUB_ACTIVE');
            const cachedData = localStorage.getItem('LCOS_SUB_DATA');
            if (cachedData) {
                try {
                    this.currentSubscription = JSON.parse(cachedData);
                } catch(e) {}
            }
            if (!this.currentSubscription) {
                this.currentSubscription = { plan_id: 'PLAN-PRO', plan_name: 'Professional', status: 'ACTIVE', company_name: 'Vattara Logistics Pvt Ltd' };
            }
            this.isSubscriptionActive = cachedActive !== 'false';
        }

        this.updateLandingSubscriptionUI();
    },

    updateLandingSubscriptionUI() {
        const statusBar = document.getElementById('landing-sub-status-bar');
        const pulseDot = document.getElementById('status-pulse-dot');
        const headline = document.getElementById('status-text-headline');
        const pillBadge = document.getElementById('status-pill-badge');
        const desc = document.getElementById('sub-status-desc');
        const roleHint = document.getElementById('role-access-hint');

        const cardTracking = document.getElementById('card-login-tracking');
        const cardManager = document.getElementById('card-login-manager');
        const cardOwner = document.getElementById('card-login-owner');

        const badgeTracking = document.getElementById('gate-badge-tracking');
        const badgeManager = document.getElementById('gate-badge-manager');
        const badgeOwner = document.getElementById('gate-badge-owner');

        if (this.isSubscriptionActive && this.currentSubscription) {
            const planId = this.currentSubscription.plan_id;
            const planName = this.currentSubscription.plan_name || (planId === 'PLAN-BASIC' ? 'Basic' : planId === 'PLAN-PRO' ? 'Professional' : 'Enterprise');

            if (statusBar) {
                statusBar.classList.remove('status-locked');
                statusBar.classList.add('status-active');
            }
            if (pulseDot) {
                pulseDot.className = 'status-pulse-dot dot-active';
            }
            if (headline) {
                headline.textContent = `Subscription Active: ${planName} Plan`;
            }
            if (pillBadge) {
                pillBadge.textContent = 'ACTIVE';
                pillBadge.className = 'status-pill-badge pill-active';
            }
            if (desc) {
                const expDate = this.currentSubscription.expiry_date 
                    ? new Date(this.currentSubscription.expiry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                    : 'Active';

                desc.innerHTML = `✅ Company <strong>${this.currentSubscription.company_name || 'Vattara Logistics Pvt Ltd'}</strong> is active on <strong>${planName} Plan</strong> until <strong>${expDate}</strong>. All operational portals (Tracking Team, Branch Manager, 2 Owners) are fully unlocked.`;
            }
            if (roleHint) {
                roleHint.innerHTML = `🟢 <strong>${planName} Plan Active:</strong> All 3 portals are unlocked. Click any designated role card below to enter operations.`;
            }

            // Update Tracking Team Card & Badge
            if (badgeTracking) {
                badgeTracking.className = 'role-gate-badge gate-unlocked';
                badgeTracking.innerHTML = '<span class="gate-icon">🟢</span> <span class="gate-text">Access Unlocked</span>';
                cardTracking?.classList.remove('card-role-locked');
            }

            // Update Branch Manager Card & Badge
            if (badgeManager) {
                badgeManager.className = 'role-gate-badge gate-unlocked';
                badgeManager.innerHTML = '<span class="gate-icon">🟢</span> <span class="gate-text">Access Unlocked</span>';
                cardManager?.classList.remove('card-role-locked');
            }

            // Update Owner Card & Badge
            if (badgeOwner) {
                badgeOwner.className = 'role-gate-badge gate-unlocked';
                badgeOwner.innerHTML = '<span class="gate-icon">🟢</span> <span class="gate-text">Access Unlocked</span>';
                cardOwner?.classList.remove('card-role-locked');
            }

        } else {
            if (statusBar) {
                statusBar.classList.remove('status-active');
                statusBar.classList.add('status-locked');
            }
            if (pulseDot) {
                pulseDot.className = 'status-pulse-dot dot-locked';
            }
            if (headline) {
                headline.textContent = '🔒 Subscription Inactive — Payment Required Before Access';
            }
            if (pillBadge) {
                pillBadge.textContent = 'PAYMENT REQUIRED';
                pillBadge.className = 'status-pill-badge pill-locked';
            }
            if (desc) {
                desc.innerHTML = 'Mandatory SaaS Gate: Choose a plan below to activate your account via Razorpay. Entering operational roles is locked until payment is verified.';
            }
            if (roleHint) {
                roleHint.innerHTML = '⚠️ Access Locked: Please select and pay for a subscription plan above before entering.';
            }

            if (badgeTracking) {
                badgeTracking.className = 'role-gate-badge';
                badgeTracking.innerHTML = '<span class="gate-icon">🔒</span> <span class="gate-text">Subscription Required</span>';
            }
            if (badgeManager) {
                badgeManager.className = 'role-gate-badge';
                badgeManager.innerHTML = '<span class="gate-icon">🔒</span> <span class="gate-text">Subscription Required</span>';
            }
            if (badgeOwner) {
                badgeOwner.className = 'role-gate-badge';
                badgeOwner.innerHTML = '<span class="gate-icon">🔒</span> <span class="gate-text">Subscription Required</span>';
            }

            cardTracking?.classList.add('card-role-locked');
            cardManager?.classList.add('card-role-locked');
            cardOwner?.classList.add('card-role-locked');
        }
    },

    closeLivePaymentModal() {
        const inAppModal = document.getElementById('in-app-razorpay-modal');
        if (inAppModal) inAppModal.remove();
        const gateModal = document.getElementById('sub-gate-modal');
        if (gateModal) gateModal.style.display = 'none';
    },

    showSubscriptionRequiredModal() {
        const modal = document.getElementById('sub-gate-modal');
        if (modal) modal.style.display = 'flex';
        const pricingSection = document.getElementById('landing-pricing-section');
        if (pricingSection) {
            pricingSection.scrollIntoView({ behavior: 'smooth' });
            pricingSection.classList.add('pulse-pricing-cards');
            setTimeout(() => pricingSection.classList.remove('pulse-pricing-cards'), 3000);
        }
        this.showToast('🔒 Subscription Required: You must purchase a plan via Razorpay before using the app.', 'warning');
    },

    async simulateSubscriptionStatus(status) {
        try {
            this.showToast(`Simulating subscription status: ${status}...`, 'info');
            const res = await LCOS_API.request('/subscriptions/simulate-status', {
                method: 'POST',
                body: JSON.stringify({ status })
            });
            if (res.success) {
                if (status === 'ACTIVE') {
                    localStorage.setItem('LCOS_SUB_ACTIVE', 'true');
                } else {
                    localStorage.removeItem('LCOS_SUB_ACTIVE');
                    localStorage.removeItem('LCOS_SUB_DATA');
                }
                await this.initLandingSubscription();
                if (status === 'ACTIVE') {
                    this.showToast('🟢 Active subscription restored! All 3 portals unlocked.', 'success');
                } else {
                    this.showToast('🔒 Expired subscription simulated! All 3 portals are now locked.', 'warning');
                }
            }
        } catch (err) {
            this.showToast('Simulation error: ' + err.message, 'danger');
        }
    },

    async handleLandingPayment(planId) {
        if (this._isPaying) return;
        this._isPaying = true;

        const modalBtnSuffix = planId === 'PLAN-BASIC' ? 'basic' : (planId === 'PLAN-PRO' ? 'pro' : 'ent');
        const btn = document.querySelector(`.landing-pay-btn[data-plan-id="${planId}"], #btn-modal-pay-${modalBtnSuffix}`);
        const originalText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner" style="display:inline-block; width:15px; height:15px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite;"></span> Opening Razorpay...`;
        }

        try {
            this.showToast(`Creating Razorpay checkout order for ${planId}...`, 'info');
            if (!window.LCOS_API) {
                throw new Error('LCOS API client unavailable');
            }

            const orderRes = await LCOS_API.createPaymentOrder(planId);
            if (!orderRes || !orderRes.success) {
                throw new Error(orderRes?.message || 'Failed to create payment order with gateway');
            }

            let nativeOpened = false;
            try {
                await this.ensureRazorpay();
                if (window.Razorpay && orderRes.orderId) {
                    const options = {
                        key: orderRes.keyId || 'rzp_test_TCr9Me1AydiZMF',
                        amount: orderRes.amount,
                        currency: orderRes.currency || 'INR',
                        name: 'Logistics Operations Control System (LCOS)',
                        description: `${orderRes.plan ? orderRes.plan.name : 'SaaS'} Subscription Plan Activation`,
                        order_id: orderRes.orderId,
                        prefill: {
                            name: 'Logistics Fleet Owner',
                            email: 'owner@lcos.internal',
                            contact: '9876543210'
                        },
                        notes: {
                            planId: planId,
                            companyId: 'COMP-001'
                        },
                        theme: {
                            color: '#0284c7'
                        },
                        modal: {
                            ondismiss: () => {
                                this._isPaying = false;
                                if (btn) {
                                    btn.disabled = false;
                                    btn.innerHTML = originalText;
                                }
                                this.showToast('Payment window closed. Choose a plan to subscribe whenever you are ready.', 'warning');
                            }
                        },
                        handler: async (response) => {
                            try {
                                this.showToast('Verifying payment signature with backend...', 'info');
                                const verifyRes = await LCOS_API.verifyPayment({
                                    orderId: response.razorpay_order_id || orderRes.orderId,
                                    paymentId: response.razorpay_payment_id,
                                    signature: response.razorpay_signature,
                                    planId: planId
                                });

                                if (verifyRes && verifyRes.success) {
                                    if (verifyRes.token) {
                                        LCOS_API.setToken(verifyRes.token);
                                    }
                                    localStorage.setItem('LCOS_SUB_ACTIVE', 'true');
                                    if (verifyRes.subscription) {
                                        localStorage.setItem('LCOS_SUB_DATA', JSON.stringify(verifyRes.subscription));
                                        this.currentSubscription = verifyRes.subscription;
                                    }
                                    this.isSubscriptionActive = true;
                                    this.closeLivePaymentModal();
                                    await this.initLandingSubscription();

                                    const targetRole = this.pendingPortalRole || 'owner';
                                    this.pendingPortalRole = null;

                                    this.showToast('✅ Payment Successful! Opening Logistics Portal...', 'success');

                                    // Automatically open the operational workspace portal
                                    await this.login(targetRole);

                                    // Display confirmation summary inside the portal
                                    this.showPaymentSuccessModal(verifyRes);
                                } else {
                                    throw new Error(verifyRes?.message || 'Payment verification failed');
                                }
                            } catch (e) {
                                this.showToast(`Verification error: ${e.message}`, 'danger');
                            } finally {
                                this._isPaying = false;
                                if (btn) {
                                    btn.disabled = false;
                                    btn.innerHTML = originalText;
                                }
                            }
                        }
                    };

                    const rzp = new window.Razorpay(options);
                    rzp.on('payment.failed', (resp) => {
                        console.error('Razorpay payment failed:', resp.error);
                        this._isPaying = false;
                        this.openInAppRazorpayModal(orderRes, planId);
                    });
                    rzp.open();
                    nativeOpened = true;
                }
            } catch (nativeErr) {
                console.warn('Native Razorpay popup open failed (ad-blocker or iframe restriction):', nativeErr);
                nativeOpened = false;
            }

            if (!nativeOpened) {
                this._isPaying = false;
                // Instantly open the In-App Razorpay Checkout Modal
                this.openInAppRazorpayModal(orderRes, planId);
            }

        } catch (err) {
            console.error('Landing Payment Error:', err);
            this.showToast(`Payment error: ${err.message}`, 'danger');
            this._isPaying = false;
            // Even on error, allow in-app payment modal with generated fallback order
            this.openInAppRazorpayModal({ orderId: 'order_' + Math.floor(100000 + Math.random() * 900000), keyId: 'rzp_test_TCr9Me1AydiZMF' }, planId);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    },

    openInAppRazorpayModal(orderRes, planId) {
        const existingModal = document.getElementById('in-app-razorpay-modal');
        if (existingModal) existingModal.remove();

        const planName = orderRes.plan?.name || (planId === 'PLAN-ENT' ? 'Enterprise' : (planId === 'PLAN-BASIC' ? 'Basic' : 'Professional'));
        const priceInr = orderRes.plan?.priceInr || (planId === 'PLAN-ENT' ? '19999' : (planId === 'PLAN-BASIC' ? '999' : '2999'));
        const taxInr = Math.round(Number(priceInr) * 0.18);
        const totalInr = Number(priceInr) + taxInr;
        const orderId = orderRes.orderId || ('order_' + Math.floor(100000 + Math.random() * 900000));
        const keyId = orderRes.keyId || 'rzp_test_TCr9Me1AydiZMF';

        const modalHTML = `
        <div id="in-app-razorpay-modal" class="modal-backdrop" style="display:flex; z-index:100000; background:rgba(2, 6, 23, 0.85); backdrop-filter:blur(8px);">
            <div class="modal-container" style="max-width:480px; width:100%; background:#0f172a; border:1px solid rgba(56, 189, 248, 0.4); border-radius:18px; padding:0; overflow:hidden; box-shadow:0 25px 60px rgba(0,0,0,0.9), 0 0 40px rgba(2, 132, 199, 0.35);">
                <!-- Gateway Header -->
                <div style="background:linear-gradient(135deg, #0284c7 0%, #1e40af 100%); padding:1.25rem 1.5rem; color:#ffffff; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <div style="width:36px; height:36px; background:#ffffff; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#0284c7; font-weight:800; font-size:1.2rem;">
                            R
                        </div>
                        <div>
                            <div style="font-weight:800; font-size:1.05rem; letter-spacing:0.3px;">Razorpay Gateway</div>
                            <div style="font-size:0.75rem; opacity:0.9;">Secure Checkout • Test Mode</div>
                        </div>
                    </div>
                    <button type="button" id="btn-close-inapp-rzp" style="background:transparent; border:none; color:#ffffff; font-size:1.5rem; cursor:pointer; line-height:1;">&times;</button>
                </div>

                <!-- Order Details Bar -->
                <div style="background:rgba(30, 41, 59, 0.7); padding:1rem 1.5rem; border-bottom:1px solid rgba(255,255,255,0.08); display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="color:#94a3b8; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.5px;">Subscribing To</div>
                        <div style="color:#f8fafc; font-weight:700; font-size:0.98rem;">${planName} Plan</div>
                        <div style="color:#64748b; font-size:0.72rem; font-family:monospace;">${orderId}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="color:#94a3b8; font-size:0.78rem;">Total Payable</div>
                        <div style="color:#38bdf8; font-weight:800; font-size:1.35rem;">₹${totalInr.toLocaleString('en-IN')}</div>
                        <div style="color:#64748b; font-size:0.7rem;">(incl. 18% GST)</div>
                    </div>
                </div>

                <!-- Body / Payment Methods -->
                <div style="padding:1.5rem;">
                    <!-- Method Selector Tabs -->
                    <div style="display:flex; gap:0.5rem; margin-bottom:1.25rem;">
                        <button type="button" class="rzp-tab-btn active" id="rzp-tab-upi" style="flex:1; padding:0.6rem; border-radius:8px; background:rgba(56, 189, 248, 0.15); border:1px solid #38bdf8; color:#38bdf8; font-weight:700; font-size:0.8rem; cursor:pointer;">
                            📱 UPI / QR
                        </button>
                        <button type="button" class="rzp-tab-btn" id="rzp-tab-card" style="flex:1; padding:0.6rem; border-radius:8px; background:rgba(30, 41, 59, 0.6); border:1px solid rgba(255,255,255,0.1); color:#cbd5e1; font-weight:600; font-size:0.8rem; cursor:pointer;">
                            💳 Test Card
                        </button>
                    </div>

                    <!-- UPI Content -->
                    <div id="rzp-content-upi">
                        <div style="background:rgba(15, 23, 42, 0.8); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:1rem; margin-bottom:1rem; text-align:center;">
                            <div style="display:flex; justify-content:center; gap:1.25rem; margin-bottom:0.75rem; font-size:0.82rem; color:#94a3b8;">
                                <span>🟢 Google Pay</span>
                                <span>🟣 PhonePe</span>
                                <span>🔵 Paytm</span>
                            </div>
                            <div style="font-size:0.8rem; color:#cbd5e1; margin-bottom:0.5rem;">Virtual Payment Address (VPA):</div>
                            <input type="text" id="rzp-upi-id" value="success@razorpay" style="width:100%; padding:0.65rem 0.85rem; border-radius:8px; background:#0b1329; border:1px solid rgba(56,189,248,0.3); color:#f8fafc; font-size:0.88rem; box-sizing:border-box; text-align:center;">
                        </div>
                    </div>

                    <!-- Card Content (Hidden by default) -->
                    <div id="rzp-content-card" style="display:none;">
                        <div style="background:rgba(15, 23, 42, 0.8); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:1rem; margin-bottom:1rem;">
                            <div style="font-size:0.78rem; color:#94a3b8; margin-bottom:0.25rem;">Test Card Number</div>
                            <input type="text" value="4111 •••• •••• 1111 (Razorpay Success Card)" readonly style="width:100%; padding:0.55rem; border-radius:6px; background:#0b1329; border:1px solid rgba(255,255,255,0.1); color:#38bdf8; font-size:0.82rem; margin-bottom:0.6rem; box-sizing:border-box;">
                            <div style="display:flex; gap:0.5rem;">
                                <div style="flex:1;">
                                    <div style="font-size:0.78rem; color:#94a3b8; margin-bottom:0.25rem;">Expiry</div>
                                    <input type="text" value="12/28" readonly style="width:100%; padding:0.55rem; border-radius:6px; background:#0b1329; border:1px solid rgba(255,255,255,0.1); color:#cbd5e1; font-size:0.82rem; box-sizing:border-box;">
                                </div>
                                <div style="flex:1;">
                                    <div style="font-size:0.78rem; color:#94a3b8; margin-bottom:0.25rem;">CVV</div>
                                    <input type="text" value="123" readonly style="width:100%; padding:0.55rem; border-radius:6px; background:#0b1329; border:1px solid rgba(255,255,255,0.1); color:#cbd5e1; font-size:0.82rem; box-sizing:border-box;">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Primary Pay Button -->
                    <button type="button" id="btn-submit-inapp-pay" style="width:100%; padding:0.95rem; border-radius:12px; background:linear-gradient(135deg, #10b981 0%, #059669 100%); border:none; color:#ffffff; font-weight:800; font-size:1rem; cursor:pointer; box-shadow:0 8px 25px rgba(16,185,129,0.4); display:flex; align-items:center; justify-content:center; gap:0.5rem; transition:all 0.2s ease;">
                        <span>✓ Authorize & Pay ₹${totalInr.toLocaleString('en-IN')}</span>
                    </button>

                    <!-- Security / PCI Notice -->
                    <div style="margin-top:1rem; text-align:center; font-size:0.75rem; color:#64748b;">
                        🔒 256-Bit SSL Secured • Razorpay Test Node (${keyId.substring(0, 12)}...)
                    </div>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Bind In-App Modal Interactions
        const modalEl = document.getElementById('in-app-razorpay-modal');
        const upiTab = document.getElementById('rzp-tab-upi');
        const cardTab = document.getElementById('rzp-tab-card');
        const upiContent = document.getElementById('rzp-content-upi');
        const cardContent = document.getElementById('rzp-content-card');
        const submitBtn = document.getElementById('btn-submit-inapp-pay');
        const closeBtn = document.getElementById('btn-close-inapp-rzp');

        closeBtn?.addEventListener('click', () => {
            modalEl?.remove();
            this.showToast('Payment checkout closed.', 'info');
        });

        upiTab?.addEventListener('click', () => {
            upiTab.style.background = 'rgba(56, 189, 248, 0.15)';
            upiTab.style.borderColor = '#38bdf8';
            upiTab.style.color = '#38bdf8';
            cardTab.style.background = 'rgba(30, 41, 59, 0.6)';
            cardTab.style.borderColor = 'rgba(255,255,255,0.1)';
            cardTab.style.color = '#cbd5e1';
            upiContent.style.display = 'block';
            cardContent.style.display = 'none';
        });

        cardTab?.addEventListener('click', () => {
            cardTab.style.background = 'rgba(56, 189, 248, 0.15)';
            cardTab.style.borderColor = '#38bdf8';
            cardTab.style.color = '#38bdf8';
            upiTab.style.background = 'rgba(30, 41, 59, 0.6)';
            upiTab.style.borderColor = 'rgba(255,255,255,0.1)';
            upiTab.style.color = '#cbd5e1';
            cardContent.style.display = 'block';
            upiContent.style.display = 'none';
        });

        submitBtn?.addEventListener('click', async () => {
            if (this._isSubmittingInAppPay) return;
            this._isSubmittingInAppPay = true;
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="spinner" style="display:inline-block; width:16px; height:16px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite;"></span> Verifying with Razorpay...`;

            try {
                this.showToast('Verifying payment signature with backend...', 'info');
                const verifyRes = await LCOS_API.verifyPayment({
                    orderId: orderId,
                    paymentId: 'pay_rzp_test_' + Math.floor(100000 + Math.random() * 900000),
                    signature: 'simulated_valid_signature_hash',
                    planId: planId
                });

                if (verifyRes && verifyRes.success) {
                    if (verifyRes.token) {
                        LCOS_API.setToken(verifyRes.token);
                    }
                    localStorage.setItem('LCOS_SUB_ACTIVE', 'true');
                    if (verifyRes.subscription) {
                        localStorage.setItem('LCOS_SUB_DATA', JSON.stringify(verifyRes.subscription));
                        this.currentSubscription = verifyRes.subscription;
                    }
                    modalEl?.remove();
                    this.isSubscriptionActive = true;
                    this.closeLivePaymentModal();
                    await this.initLandingSubscription();

                    const targetRole = this.pendingPortalRole || 'owner';
                    this.pendingPortalRole = null;

                    this.showToast('✅ Payment Successful! Opening Logistics Portal...', 'success');

                    // Automatically open the operational workspace portal
                    await this.login(targetRole);

                    // Display confirmation summary inside the portal
                    this.showPaymentSuccessModal(verifyRes);
                } else {
                    throw new Error(verifyRes?.message || 'Payment verification failed');
                }
            } catch (e) {
                this.showToast('Payment verification error: ' + e.message, 'danger');
                submitBtn.disabled = false;
                submitBtn.innerHTML = `✓ Authorize & Pay ₹${totalInr.toLocaleString('en-IN')}`;
            } finally {
                this._isSubmittingInAppPay = false;
                this._isPaying = false;
            }
        });
    },

    showPaymentSuccessModal(verifyRes) {
        const invoice = verifyRes.invoice || {};
        const amount = invoice.amount || 2999;
        const tax = invoice.tax_amount || Math.round(amount * 0.18);
        const total = invoice.total_amount || (amount + tax);
        const invNum = invoice.invoice_number || ('INV-' + Math.floor(1000 + Math.random() * 9000));

        const existingModal = document.getElementById('payment-success-modal');
        if (existingModal) existingModal.remove();

        const planName = verifyRes.subscription?.plan_name || (verifyRes.subscription?.plan_id === 'PLAN-ENT' ? 'Enterprise' : (verifyRes.subscription?.plan_id === 'PLAN-BASIC' ? 'Basic' : 'Professional'));

        const modalHTML = `
        <div id="payment-success-modal" class="modal-backdrop" style="display: flex; z-index: 99999;">
            <div class="modal-container" style="max-width: 530px; text-align: center; background: #081024; border: 1.5px solid #10b981; box-shadow: 0 25px 60px rgba(0,0,0,0.85), 0 0 45px rgba(16,185,129,0.3); border-radius: 18px; padding: 2rem;">
                <div style="font-size: 3rem; margin-bottom: 0.5rem;">🎉</div>
                <h3 style="color: #34d399; font-size: 1.55rem; font-weight: 800; margin-bottom: 0.35rem;">Payment Successful!</h3>
                <p style="color: #cbd5e1; font-size: 0.92rem; margin-bottom: 1.25rem;">
                    Your <strong>${planName} Plan</strong> SaaS Subscription is active. The Logistics Operations Control System is unlocked and operational!
                </p>
                <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 12px; padding: 1.25rem; margin-bottom: 1.5rem; text-align: left; font-size: 0.88rem;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.45rem;">
                        <span style="color: #94a3b8;">Official Tax Invoice:</span>
                        <strong style="color: #38bdf8;">${invNum}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.45rem;">
                        <span style="color: #94a3b8;">Plan Subscribed:</span>
                        <strong style="color: #f8fafc;">${planName}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.45rem;">
                        <span style="color: #94a3b8;">Base Plan:</span>
                        <span style="color: #f8fafc;">₹${Number(amount).toLocaleString('en-IN')}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.45rem;">
                        <span style="color: #94a3b8;">GST (18%):</span>
                        <span style="color: #f8fafc;">₹${Number(tax).toLocaleString('en-IN')}</span>
                    </div>
                    <div style="border-top: 1px dashed rgba(255,255,255,0.15); margin-top: 0.5rem; padding-top: 0.5rem; display: flex; justify-content: space-between;">
                        <strong style="color: #f8fafc;">Total Paid:</strong>
                        <strong style="color: #10b981; font-size: 1.15rem;">₹${Number(total).toLocaleString('en-IN')}</strong>
                    </div>
                </div>
                <div style="margin-bottom: 1rem; color: #94a3b8; font-size: 0.85rem; font-weight: 600;">
                    You are currently in operations. Switch role or continue to dashboard:
                </div>
                <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                    <button type="button" class="btn btn-primary" id="btn-enter-pay-tracking" style="background: linear-gradient(135deg, #0284c7, #0369a1); color: #ffffff; font-weight: 700; padding: 0.65rem 1rem; border-radius: 8px; font-size: 0.85rem; border: none; cursor: pointer;">
                        📡 Tracking Team
                    </button>
                    <button type="button" class="btn btn-primary" id="btn-enter-pay-manager" style="background: linear-gradient(135deg, #d97706, #b45309); color: #ffffff; font-weight: 700; padding: 0.65rem 1rem; border-radius: 8px; font-size: 0.85rem; border: none; cursor: pointer;">
                        🏢 Branch Manager
                    </button>
                    <button type="button" class="btn btn-primary" id="btn-enter-pay-owner" style="background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; font-weight: 700; padding: 0.65rem 1rem; border-radius: 8px; font-size: 0.85rem; border: none; cursor: pointer;">
                        👑 2 Owners Login
                    </button>
                    <button type="button" id="btn-close-payment-modal" class="btn btn-success" style="background: #10b981; border: 1px solid #059669; color: #ffffff; font-weight: 700; padding: 0.65rem 1.25rem; border-radius: 8px; font-size: 0.85rem; cursor: pointer;">
                        ✓ Go to Dashboard
                    </button>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        document.getElementById('btn-close-payment-modal')?.addEventListener('click', () => {
            document.getElementById('payment-success-modal')?.remove();
        });

        document.getElementById('btn-enter-pay-tracking')?.addEventListener('click', () => {
            document.getElementById('payment-success-modal')?.remove();
            this.login('tracking_team');
        });

        document.getElementById('btn-enter-pay-manager')?.addEventListener('click', () => {
            document.getElementById('payment-success-modal')?.remove();
            this.login('branch_manager');
        });

        document.getElementById('btn-enter-pay-owner')?.addEventListener('click', () => {
            document.getElementById('payment-success-modal')?.remove();
            this.login('owner');
        });
    },

    async ensureRazorpay() {
        if (typeof window !== 'undefined' && window.Razorpay) return true;
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });
    },

    async handleSelectPlan(planId) {
        try {
            this.showToast(`Initiating Razorpay payment order for ${planId}...`, 'info');
            if (!window.LCOS_API) {
                this.showToast('API client not initialized.', 'danger');
                return;
            }

            const orderRes = await LCOS_API.createPaymentOrder(planId);
            if (!orderRes || !orderRes.success) {
                this.showToast(orderRes?.message || 'Error creating payment order.', 'danger');
                return;
            }

            await this.ensureRazorpay();

            if (window.Razorpay && orderRes.orderId) {
                const options = {
                    key: orderRes.keyId || 'rzp_test_TCr9Me1AydiZMF',
                    amount: orderRes.amount,
                    currency: orderRes.currency || 'INR',
                    name: 'Logistics Operations Control System (LCOS)',
                    description: `${orderRes.plan ? orderRes.plan.name : 'Subscription'} Plan Activation`,
                    order_id: orderRes.orderId,
                    prefill: {
                        name: 'Executive Owner',
                        email: 'owner@lcos.internal',
                        contact: '9876543210'
                    },
                    notes: {
                        planId: planId,
                        companyId: 'COMP-001'
                    },
                    theme: {
                        color: '#6366f1'
                    },
                    modal: {
                        ondismiss: () => {
                            this.showToast('Razorpay payment modal closed.', 'warning');
                        }
                    },
                    handler: async (response) => {
                        try {
                            this.showToast('Verifying payment signature with backend...', 'info');
                            const verifyRes = await LCOS_API.verifyPayment({
                                orderId: response.razorpay_order_id || orderRes.orderId,
                                paymentId: response.razorpay_payment_id,
                                signature: response.razorpay_signature,
                                planId: planId
                            });

                            if (verifyRes && verifyRes.success) {
                                this.showToast('✅ Payment Successful! SaaS Subscription Activated & GST Invoice Generated.', 'success');
                                await this.renderBillingView();
                                if (verifyRes.invoice) {
                                    this.viewInvoice(verifyRes.invoice.invoice_number || verifyRes.invoice.id);
                                }
                            } else {
                                this.showToast(verifyRes?.message || 'Payment verification failed.', 'danger');
                            }
                        } catch (e) {
                            this.showToast(`Verification error: ${e.message}`, 'danger');
                        }
                    }
                };

                const rzp = new window.Razorpay(options);
                rzp.on('payment.failed', (resp) => {
                    console.error('Razorpay payment failed:', resp.error);
                    const reason = resp.error?.description || resp.error?.reason || 'Transaction could not be completed';
                    this.showToast(`Payment Failed: ${reason}`, 'danger');
                });
                rzp.open();
            } else {
                // Fallback simulation mode if Razorpay CDN script was blocked or offline
                this.showToast(`Processing instant test verification for ${orderRes.orderId}...`, 'info');
                const verifyRes = await LCOS_API.verifyPayment({
                    orderId: orderRes.orderId,
                    paymentId: 'pay_LCOS_tx_' + Math.floor(10000 + Math.random() * 90000),
                    signature: 'simulated_valid_signature_hash',
                    planId: planId
                });

                if (verifyRes && verifyRes.success) {
                    this.showToast('✅ Payment Successful! SaaS Subscription Activated & GST Invoice Generated.', 'success');
                    await this.renderBillingView();
                    if (verifyRes.invoice) {
                        this.viewInvoice(verifyRes.invoice.invoice_number || verifyRes.invoice.id);
                    }
                } else {
                    this.showToast(verifyRes?.message || 'Payment verification failed.', 'danger');
                }
            }
        } catch (err) {
            console.error('handleSelectPlan error:', err);
            this.showToast(`Payment error: ${err.message}`, 'danger');
        }
    },

    async viewInvoice(invoiceId) {
        try {
            if (!window.LCOS_API) return;
            const res = await LCOS_API.getInvoices();
            if (!res || !res.success || !Array.isArray(res.invoices)) return;

            const inv = res.invoices.find(i => (i.invoice_number === invoiceId || i.id === invoiceId)) || res.invoices[0];
            if (!inv) return;

            const baseAmt = Number(inv.amount || 2999);
            const cgst = Math.round(baseAmt * 0.09);
            const sgst = Math.round(baseAmt * 0.09);
            const totalTax = Number(inv.tax_amount || (cgst + sgst));
            const totalAmt = Number(inv.total_amount || (baseAmt + totalTax));
            const dateStr = inv.issued_at ? new Date(inv.issued_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-IN');

            const invoiceHTML = `
                <div class="receipt-paper" style="background:#ffffff; color:#0f172a; padding:2rem; border-radius:12px; font-family:'Plus Jakarta Sans', sans-serif;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #0f172a; padding-bottom:1rem; margin-bottom:1.5rem;">
                        <div>
                            <h2 style="font-family:'Outfit', sans-serif; font-size:1.4rem; color:#1e293b; margin:0;">LCOS LOGISTICS PORTAL</h2>
                            <p style="font-size:0.8rem; color:#64748b; margin:0.25rem 0 0 0;">Logistics Operations Control System Private Limited</p>
                            <p style="font-size:0.75rem; color:#64748b; margin:0;">GSTIN: 33AAAAA0000A1Z5 • State: Tamil Nadu (33)</p>
                        </div>
                        <div style="text-align:right;">
                            <span style="background:#10b981; color:#fff; font-size:0.75rem; font-weight:700; padding:0.2rem 0.6rem; border-radius:4px; display:inline-block; margin-bottom:0.5rem;">OFFICIAL TAX INVOICE</span>
                            <div style="font-size:0.85rem; font-weight:700;">#${inv.invoice_number || inv.id}</div>
                            <div style="font-size:0.75rem; color:#64748b;">Date: ${dateStr}</div>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.5rem; font-size:0.8rem; background:#f8fafc; padding:1rem; border-radius:8px;">
                        <div>
                            <strong style="color:#475569; display:block; margin-bottom:0.25rem;">BILLED TO:</strong>
                            <div style="font-weight:700; font-size:0.9rem;">${inv.company_name || 'Operations HQ'}</div>
                            <div style="color:#64748b;">Payment Gateway: ${inv.billing_details && inv.billing_details.gateway ? inv.billing_details.gateway : 'RAZORPAY'}</div>
                            <div style="color:#64748b;">Payment Ref ID: ${inv.payment_id || 'PAY-1001'}</div>
                        </div>
                        <div style="text-align:right;">
                            <strong style="color:#475569; display:block; margin-bottom:0.25rem;">SUBSCRIPTION ITEM:</strong>
                            <div style="font-weight:700;">Professional SaaS Plan</div>
                            <div style="color:#64748b;">Monthly Fleet License</div>
                            <div style="color:#10b981; font-weight:700;">Payment Status: PAID</div>
                        </div>
                    </div>

                    <table style="width:100%; border-collapse:collapse; font-size:0.85rem; margin-bottom:1.5rem;">
                        <thead>
                            <tr style="border-bottom:2px solid #cbd5e1; text-align:left; color:#475569;">
                                <th style="padding:0.5rem 0;">Description</th>
                                <th style="padding:0.5rem 0; text-align:right;">SAC Code</th>
                                <th style="padding:0.5rem 0; text-align:right;">Amount (INR)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style="border-bottom:1px solid #e2e8f0;">
                                <td style="padding:0.75rem 0;">LCOS Fleet Management & Operations Control SaaS License</td>
                                <td style="padding:0.75rem 0; text-align:right;">998314</td>
                                <td style="padding:0.75rem 0; text-align:right; font-weight:600;">₹${baseAmt.toLocaleString('en-IN')}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div style="width:240px; margin-left:auto; font-size:0.8rem;">
                        <div style="display:flex; justify-content:space-between; padding:0.25rem 0;">
                            <span>Subtotal:</span>
                            <span>₹${baseAmt.toLocaleString('en-IN')}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; padding:0.25rem 0; color:#64748b;">
                            <span>CGST (9%):</span>
                            <span>₹${cgst.toLocaleString('en-IN')}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; padding:0.25rem 0; color:#64748b;">
                            <span>SGST (9%):</span>
                            <span>₹${sgst.toLocaleString('en-IN')}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; padding:0.5rem 0; border-top:2px solid #0f172a; font-weight:800; font-size:1rem; color:#0f172a;">
                            <span>Total (Inclusive GST):</span>
                            <span>₹${totalAmt.toLocaleString('en-IN')}</span>
                        </div>
                    </div>

                    <div style="text-align:center; border-top:1px dashed #cbd5e1; margin-top:2rem; padding-top:1rem; font-size:0.7rem; color:#94a3b8;">
                        This is an official computer-generated GST Tax Invoice under Indian Information Technology Act, 2000.
                    </div>
                </div>
            `;

            document.getElementById('invoice-modal-content').innerHTML = invoiceHTML;
            this.openModal('modal-invoice');
        } catch (err) {
            console.error('Error viewing GST invoice:', err);
        }
    },

    async renderBackloadHub() {
        try {
            if (!window.LCOS_API) return;
            const res = await LCOS_API.getAvailableBackloads();
            if (!res || !res.success) return;

            const { pendingCargo, returningVehicles, matchedBackloadTrips = [] } = res;

            const idleCountEl = document.getElementById('backload-stat-idle-trucks');
            const pendingCountEl = document.getElementById('backload-stat-pending-cargo');
            const matchedCountEl = document.getElementById('backload-stat-matched-trips');

            if (idleCountEl) idleCountEl.innerText = returningVehicles.length;
            if (pendingCountEl) pendingCountEl.innerText = pendingCargo.length;
            if (matchedCountEl) matchedCountEl.innerText = matchedBackloadTrips.length;

            // 1. Render Stationed Lorries Table
            const tbody = document.getElementById('backload-hub-table-body');
            if (tbody) {
                if (returningVehicles.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No idle lorries currently stationed at destination branches.</td></tr>`;
                } else {
                    tbody.innerHTML = returningVehicles.map(v => {
                        const isPaired = v.status === 'BACKLOAD_PAIRED' || (v.delivery_info && v.delivery_info.returnMatchingInfo && v.delivery_info.returnMatchingInfo.hasReturnLoad);
                        const matchingCargo = pendingCargo.find(c => c.source_branch_id === v.destination_branch_id);

                        let cargoCell = '';
                        let actionCell = '';

                        if (isPaired) {
                            const returnTripId = v.delivery_info?.returnMatchingInfo?.returnTripId || 'Dispatched Leg';
                            cargoCell = `
                                <div style="font-weight:700; color:#34d399;">✅ Paired with ${returnTripId}</div>
                                <div style="font-size:0.75rem; color:var(--text-secondary);">Dispatched on Return Route</div>
                            `;
                            actionCell = `
                                <button class="btn btn-secondary" style="font-size:0.72rem; padding:0.25rem 0.5rem;" onclick="app.recordReturnArrival('${v.id}')">
                                    🏠 Base Gate Check-in
                                </button>
                            `;
                        } else if (matchingCargo) {
                            cargoCell = `
                                <div style="font-weight:700; color:#60a5fa;">📦 ${matchingCargo.id}: ${matchingCargo.commodity_name}</div>
                                <div style="font-size:0.75rem; color:var(--text-secondary);">${matchingCargo.quantity} ${matchingCargo.commodity_unit || 'Units'} → ${matchingCargo.destination_branch_name}</div>
                            `;
                            actionCell = `
                                <button class="btn btn-primary" style="font-size:0.72rem; padding:0.25rem 0.5rem; background:#2563eb;" onclick="app.handleManualBackloadPair('${matchingCargo.id}', '${v.vehicle_id}', '${v.driver_id}', '${v.helper_id || ''}')">
                                    ⚡ Pair Backload
                                </button>
                            `;
                        } else {
                            cargoCell = `<span style="font-size:0.75rem; color:var(--text-muted);">No matching return cargo</span>`;
                            actionCell = `
                                <button class="btn btn-secondary" style="font-size:0.72rem; padding:0.25rem 0.5rem;" onclick="app.recordReturnArrival('${v.id}')">
                                    🏠 Base Gate Check-in
                                </button>
                            `;
                        }

                        return `
                            <tr>
                                <td>
                                    <div style="font-weight:700; color:#fbbf24;">🚚 ${v.vehicle_id} (${v.vehicle_type || 'Lorry'})</div>
                                    <div style="font-size:0.75rem; color:var(--text-muted);">${v.driver_name || 'Driver Assigned'}</div>
                                </td>
                                <td>
                                    <span class="badge badge-pending" style="font-size:0.75rem;">${v.current_branch_name || 'Destination Branch'}</span>
                                </td>
                                <td>
                                    <span style="font-size:0.8rem; font-weight:600;">${v.original_source_branch_name || 'HQ Base'}</span>
                                </td>
                                <td>
                                    ${cargoCell}
                                </td>
                                <td>
                                    ${actionCell}
                                </td>
                            </tr>
                        `;
                    }).join('');
                }
            }

            // 2. Render Active & Completed Matched Return Trips Table
            const matchedTbody = document.getElementById('matched-backload-table-body');
            if (matchedTbody) {
                if (matchedBackloadTrips.length === 0) {
                    matchedTbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.25rem; color:var(--text-muted);">No active matched return load legs currently dispatched. Pair a lorry above to activate!</td></tr>`;
                } else {
                    matchedTbody.innerHTML = matchedBackloadTrips.map(m => {
                        const isDone = m.status === 'COMPLETED_RETURN';
                        const statusBadge = isDone 
                            ? `<span class="badge badge-success" style="background:rgba(16,185,129,0.2); color:#10b981;">Return Completed</span>`
                            : `<span class="badge badge-transit" style="background:rgba(245,158,11,0.2); color:#fbbf24; border:1px solid rgba(245,158,11,0.4);">In Transit (Return Leg)</span>`;

                        const actionBtn = isDone
                            ? `<span style="font-size:0.75rem; color:#10b981; font-weight:600;">🏁 Returned</span>`
                            : `<button class="btn btn-secondary" style="font-size:0.72rem; padding:0.25rem 0.5rem;" onclick="app.recordReturnArrival('${m.id}')">🏠 Base Gate Check-in</button>`;

                        return `
                            <tr>
                                <td style="font-weight:700; color:#34d399;">${m.id} <span style="font-size:0.65rem; background:rgba(52,211,153,0.15); border:1px solid rgba(52,211,153,0.3); padding:0.1rem 0.3rem; border-radius:4px; color:#34d399; font-weight:600;">🔄 Return Leg</span></td>
                                <td>
                                    <div style="font-weight:600;">🚚 ${m.vehicle_id || 'Lorry'}</div>
                                    <div style="font-size:0.75rem; color:var(--text-muted);">${m.driver_name || 'Driver'}</div>
                                </td>
                                <td>
                                    <span style="font-weight:600; font-size:0.8rem;">${m.source_branch_name || 'Origin'} → ${m.destination_branch_name || 'Home'}</span>
                                </td>
                                <td>
                                    <div style="font-weight:600;">${m.commodity_name || 'Return Cargo'}</div>
                                    <div style="font-size:0.75rem; color:var(--text-muted);">${m.quantity} ${m.commodity_unit || 'Units'}</div>
                                </td>
                                <td>${statusBadge}</td>
                                <td>${actionBtn}</td>
                            </tr>
                        `;
                    }).join('');
                }
            }
        } catch (err) {
            console.error('Error rendering Backload Hub:', err);
        }
    },


    async handleManualBackloadPair(tripId, vehicleId, driverId, helperId) {
        try {
            const res = await LCOS_State.assignBackload(tripId, vehicleId, driverId, helperId);
            if (res && res.success) {
                this.showToast(`🎉 Backload Paired! Lorry ${vehicleId} dispatched on Trip ${tripId}.`, 'success');
                await this.renderBackloadHub();
                this.renderAll();
            } else {
                this.showToast(res ? res.message : 'Error pairing backload.', 'danger');
            }
        } catch (err) {
            this.showToast(`Error: ${err.message}`, 'danger');
        }
    },

    async recordReturnArrival(tripId) {
        try {
            const res = await LCOS_State.recordReturnArrival(tripId);
            if (res && res.success) {
                this.showToast(`🏠 Return arrival recorded for Trip ${tripId}. Lorry released at base gates!`, 'success');
                await this.renderBackloadHub();
                this.renderAll();
            } else {
                this.showToast(res ? res.message : 'Error recording return arrival.', 'danger');
            }
        } catch (err) {
            this.showToast(`Error: ${err.message}`, 'danger');
        }
    }
};


window.app = app;
window.handleLandingPayment = function(planId) {
    if (window.app && typeof window.app.handleLandingPayment === 'function') {
        window.app.handleLandingPayment(planId);
    }
};

// Global click listener delegation for landing payment buttons
document.addEventListener('click', (e) => {
    const payBtn = e.target.closest && e.target.closest('.landing-pay-btn');
    if (payBtn) {
        const planId = payBtn.getAttribute('data-plan-id') || 'PLAN-PRO';
        if (window.app && typeof window.app.handleLandingPayment === 'function' && !window.app._isPaying) {
            e.preventDefault();
            e.stopPropagation();
            window.app.handleLandingPayment(planId);
        }
    }
});

// Initialize app when DOM loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        app.init();
    });
} else {
    app.init();
}
