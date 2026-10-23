/**
 * Logistics Operations Control System (LCOS) - API Client Module
 * Connects the existing frontend components to the Node.js / Express / PostgreSQL Backend API.
 */
const API_BASE_URL = (typeof window !== 'undefined' && window.location)
  ? (window.location.protocol === 'file:' ? 'http://localhost:5000/api' : '/api')
  : 'http://localhost:5000/api';

class LCOS_API {
  static getToken() {
    return localStorage.getItem('LCOS_JWT_TOKEN') || '';
  }

  static setToken(token) {
    if (token) localStorage.setItem('LCOS_JWT_TOKEN', token);
    else localStorage.removeItem('LCOS_JWT_TOKEN');
  }

  static async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'API Request failed');
      }
      return data;
    } catch (err) {
      console.error(`[API Error ${endpoint}]:`, err.message);
      throw err;
    }
  }

  // --- Auth APIs ---
  static async login(username, role) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, role }),
    });
    if (data.token) this.setToken(data.token);
    return data;
  }

  static async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch (e) {}
    this.setToken('');
  }

  static async getMe() {
    return this.request('/auth/me');
  }

  // --- Directory & Master Data ---
  static async getBranches() {
    return this.request('/branches');
  }

  static async addBranch(branchData) {
    return this.request('/branches', {
      method: 'POST',
      body: JSON.stringify(branchData),
    });
  }

  static async getCommodities() {
    return this.request('/commodities');
  }

  static async addCommodity(commodityData) {
    return this.request('/commodities', {
      method: 'POST',
      body: JSON.stringify(commodityData),
    });
  }

  static async getVehicles() {
    return this.request('/vehicles');
  }

  static async addVehicle(vehicleData) {
    return this.request('/vehicles', {
      method: 'POST',
      body: JSON.stringify(vehicleData),
    });
  }

  static async getDrivers() {
    return this.request('/drivers');
  }

  static async addDriver(driverData) {
    return this.request('/drivers', {
      method: 'POST',
      body: JSON.stringify(driverData),
    });
  }

  static async getHelpers() {
    return this.request('/helpers');
  }

  static async getStock() {
    return this.request('/stock');
  }

  static async addStockDirectly(branchId, commodityId, quantity) {
    return this.request('/stock/add', {
      method: 'POST',
      body: JSON.stringify({ branchId, commodityId, quantity }),
    });
  }

  // --- Trips & Operations ---
  static async getTrips(status = '', search = '') {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (search) params.append('search', search);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/trips${queryStr}`);
  }

  static async getTripById(id) {
    return this.request(`/trips/${id}`);
  }

  static async addTrip(tripData) {
    return this.request('/trips', {
      method: 'POST',
      body: JSON.stringify(tripData),
    });
  }

  static async updateTripStatus(tripId, status, checklists, transitUpdate) {
    return this.request(`/trips/${tripId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, checklists, transitUpdate }),
    });
  }

  static async closeTripDelivery(tripId, deliveryInfo) {
    return this.request(`/trips/${tripId}/close-delivery`, {
      method: 'POST',
      body: JSON.stringify(deliveryInfo),
    });
  }

  static async recordReturnArrival(tripId) {
    return this.request(`/trips/${tripId}/return-arrival`, {
      method: 'POST',
    });
  }

  static async getAvailableBackloads() {
    return this.request('/trips/backloads/available');
  }

  static async assignBackload(tripId, vehicleId, driverId, helperId) {
    return this.request('/trips/assign-backload', {
      method: 'POST',
      body: JSON.stringify({ tripId, vehicleId, driverId, helperId }),
    });
  }


  // --- Live GPS Tracking ---
  static async sendGpsUpdate(updateData) {
    return this.request('/gps/update', {
      method: 'POST',
      body: JSON.stringify(updateData),
    });
  }

  static async getGpsHistory(vehicleId) {
    return this.request(`/gps/history/${vehicleId}`);
  }

  // --- Alerts & Escalation ---
  static async getAlerts(status = 'Active') {
    return this.request(`/alerts?status=${status}`);
  }

  static async addAlert(alertData) {
    return this.request('/alerts', {
      method: 'POST',
      body: JSON.stringify(alertData),
    });
  }

  static async escalateAlertCallAttempt(alertId) {
    return this.request(`/alerts/${alertId}/call-attempt`, {
      method: 'POST',
    });
  }

  static async escalateAlertToManager(alertId) {
    return this.request(`/alerts/${alertId}/escalate`, {
      method: 'POST',
    });
  }

  static async resolveAlert(alertId, actionNotes = '') {
    return this.request(`/alerts/${alertId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ actionNotes }),
    });
  }

  static async dismissAlert(alertId) {
    return this.request(`/alerts/${alertId}/dismiss`, {
      method: 'POST',
    });
  }

  // --- Call Logs & Supervisor Requests ---
  static async getCallLogs(category = '', search = '') {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (search) params.append('search', search);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/calllogs${queryStr}`);
  }

  static async addCallLog(logData) {
    return this.request('/calllogs', {
      method: 'POST',
      body: JSON.stringify(logData),
    });
  }

  static async getRequests() {
    return this.request('/requests');
  }

  static async addManagerRequest(type, requestData) {
    return this.request('/requests', {
      method: 'POST',
      body: JSON.stringify({ type, requestData }),
    });
  }

  static async approveManagerRequest(reqId) {
    return this.request(`/requests/${reqId}/approve`, {
      method: 'POST',
    });
  }

  // --- Dashboard Summary & Reports ---
  static async getDashboardSummary() {
    return this.request('/reports/dashboard-summary');
  }

  // --- SaaS Subscription & Payment System ---
  static async getSubscriptionPlans() {
    return this.request('/subscriptions/plans');
  }

  static async getCurrentSubscription() {
    return this.request('/subscriptions/current');
  }

  static async createPaymentOrder(planId) {
    return this.request('/payments/create-order', {
      method: 'POST',
      body: JSON.stringify({ planId }),
    });
  }

  static async verifyPayment(paymentData) {
    return this.request('/payments/verify', {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });
  }

  static async getInvoices() {
    return this.request('/invoices');
  }

  static async getAdminSettings() {
    return this.request('/admin/settings');
  }

  static async updateAdminSetting(key, value) {
    return this.request('/admin/settings', {
      method: 'POST',
      body: JSON.stringify({ key, value }),
    });
  }

  // --- Meta WhatsApp Cloud API ---
  static async getWhatsAppStatus() {
    return this.request('/whatsapp/status');
  }

  static async saveWhatsAppConfig(configData) {
    return this.request('/whatsapp/config', {
      method: 'POST',
      body: JSON.stringify(configData),
    });
  }

  static async sendWhatsAppMessage(payload) {
    return this.request('/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async notifyWhatsAppTrip(tripId) {
    return this.request('/whatsapp/notify-trip', {
      method: 'POST',
      body: JSON.stringify({ tripId }),
    });
  }

  static async simulateIncomingWhatsApp(payload) {
    return this.request('/whatsapp/simulate-incoming', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async triggerTestStoppage(payload = {}) {
    return this.request('/whatsapp/test-stoppage-alert', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async acceptStoppageReason(payload = {}) {
    return this.request('/whatsapp/accept-reason', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async declineStoppageReason(payload = {}) {
    return this.request('/whatsapp/decline-reason', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async getActiveStoppage() {
    return this.request('/whatsapp/active-stoppage');
  }

  static async getWhatsAppLogs(limit = 50) {
    return this.request(`/whatsapp/logs?limit=${limit}`);
  }
}

window.LCOS_API = LCOS_API;
