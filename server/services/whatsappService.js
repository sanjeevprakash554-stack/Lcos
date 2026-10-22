/**
 * WhatsApp Cloud API Service (Meta for Developers)
 * Logistics Operations Control System (LCOS)
 *
 * Supports sending:
 * - Direct Text messages
 * - Interactive CTA Buttons (max 3 buttons)
 * - Location pins
 * - Template messages
 * - Automated Logistics Event Alerts (Trip Dispatched, Stoppage Warning, Delivery Confirmation)
 */

const db = require('../config/db');

class WhatsAppService {
  constructor() {
    this.apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';
    this.baseUrl = 'https://graph.facebook.com';
  }

  getConfig() {
    return {
      apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
      businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'lcos_meta_verify_token_2026',
      enabled: process.env.WHATSAPP_ENABLED !== 'false',
      isConfigured: !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN),
    };
  }

  /**
   * Normalizes a phone number to WhatsApp international standard (e.g. 919884012345)
   * Strips spaces, +, dashes, brackets. If 10 digits, prepends Indian country code (91).
   */
  formatPhoneNumber(phone) {
    if (!phone) return '';
    let cleaned = String(phone).replace(/[^0-9]/g, '');
    if (cleaned.length === 10) {
      cleaned = '91' + cleaned;
    }
    return cleaned;
  }

  /**
   * Sanitizes strings for database storage on Windows/WIN1252 PostgreSQL instances
   */
  sanitizeForDb(str) {
    if (!str) return '';
    return String(str)
      .replace(/─+/g, '------------------------')
      .replace(/[➔→]/g, '->')
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, (match) => {
        const emojiMap = {
          '📦': '[Cargo]',
          '🚚': '[Truck]',
          '🚛': '[Lorry]',
          '📍': '[Location]',
          '⚠️': '[Warning]',
          '🚨': '[Emergency]',
          '✅': '[Done]',
          '⏱️': '[Time]',
          '🕒': '[Time]',
          '👤': '[User]',
          '📊': '[Status]',
          '📋': '[List]',
          '💬': '[Chat]',
          '💡': '[Info]',
          '🟢': '[Active]',
          '🟡': '[Pending]',
          '1️⃣': '1.',
          '2️⃣': '2.',
          '3️⃣': '3.',
          '4️⃣': '4.',
          '5️⃣': '5.',
        };
        return emojiMap[match] || '';
      })
      .replace(/[^\x00-\xFF]/g, '');
  }

  /**
   * Logs a WhatsApp communication event in the database
   */
  async logMessage({ direction, fromNumber, toNumber, messageType, content, status, metaMessageId, companyId = 'COMP-001' }) {
    try {
      const logId = 'WAL-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      const safeContent = this.sanitizeForDb(content);
      await db.query(
        `INSERT INTO whatsapp_logs (id, company_id, direction, from_number, to_number, message_type, content, status, meta_message_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [logId, companyId, direction, fromNumber || '', toNumber || '', messageType || 'text', safeContent, status || 'SENT', metaMessageId || null]
      );
      return logId;
    } catch (err) {
      console.warn('⚠️ [WhatsApp Log Error]:', err.message);
      return null;
    }
  }

  /**
   * Generic low-level Meta Graph API Dispatcher
   */
  async sendPayload(payload, rawContentSummary, recipientPhone) {
    const config = this.getConfig();
    const formattedTo = this.formatPhoneNumber(recipientPhone || payload.to);
    payload.to = formattedTo;

    // Development / Sandbox mode if Meta credentials are not configured yet
    if (!config.isConfigured) {
      console.log(`📱 [WhatsApp Sandbox Mode] To: ${formattedTo} | Content: ${rawContentSummary}`);
      const logId = await this.logMessage({
        direction: 'OUTBOUND',
        fromNumber: 'LCOS-SANDBOX',
        toNumber: formattedTo,
        messageType: payload.type || 'text',
        content: rawContentSummary,
        status: 'SIMULATED_SENT',
        metaMessageId: 'sim_' + Date.now(),
      });
      return {
        success: true,
        simulated: true,
        logId,
        message: 'Message delivered to LCOS Sandbox. To deliver to actual WhatsApp numbers, add your Meta Phone Number ID & Access Token.',
      };
    }

    const endpoint = `${this.baseUrl}/${config.apiVersion}/${config.phoneNumberId}/messages`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error?.message || response.statusText || 'Unknown Meta API Error';
        console.error(`❌ [WhatsApp API Error] (${response.status}):`, errorMsg);
        await this.logMessage({
          direction: 'OUTBOUND',
          fromNumber: config.phoneNumberId,
          toNumber: formattedTo,
          messageType: payload.type || 'text',
          content: rawContentSummary,
          status: 'FAILED',
          metaMessageId: null,
        });
        return {
          success: false,
          error: errorMsg,
          metaDetails: data.error,
        };
      }

      const metaMessageId = data.messages?.[0]?.id || null;
      const logId = await this.logMessage({
        direction: 'OUTBOUND',
        fromNumber: config.phoneNumberId,
        toNumber: formattedTo,
        messageType: payload.type || 'text',
        content: rawContentSummary,
        status: 'SENT',
        metaMessageId,
      });

      return {
        success: true,
        metaMessageId,
        logId,
        data,
      };
    } catch (err) {
      console.error('❌ [WhatsApp Network Error]:', err.message);
      await this.logMessage({
        direction: 'OUTBOUND',
        fromNumber: config.phoneNumberId,
        toNumber: formattedTo,
        messageType: payload.type || 'text',
        content: rawContentSummary,
        status: 'NETWORK_ERROR',
        metaMessageId: null,
      });
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Send regular text message
   */
  async sendTextMessage(to, bodyText, previewUrl = false) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'text',
      text: {
        preview_url: previewUrl,
        body: bodyText,
      },
    };
    return this.sendPayload(payload, bodyText, to);
  }

  /**
   * Send interactive button message (up to 3 action buttons)
   * buttons: Array of { id: string, title: string } (title max 20 chars)
   */
  async sendInteractiveButtons(to, headerText, bodyText, buttons = [], footerText = 'LCOS Logistics System') {
    const formattedButtons = buttons.slice(0, 3).map((btn, index) => ({
      type: 'reply',
      reply: {
        id: btn.id || `btn_${index}_${Date.now()}`,
        title: (btn.title || 'Select').substring(0, 20),
      },
    }));

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'interactive',
      interactive: {
        type: 'button',
        ...(headerText ? { header: { type: 'text', text: headerText } } : {}),
        body: { text: bodyText },
        ...(footerText ? { footer: { text: footerText } } : {}),
        action: {
          buttons: formattedButtons,
        },
      },
    };

    const summary = `[Interactive Buttons]: ${headerText ? headerText + ' - ' : ''}${bodyText}`;
    const res = await this.sendPayload(payload, summary, to);
    if (!res.success) {
      console.warn('⚠️ [WhatsApp] Interactive buttons rejected by Meta, falling back to text message:', res.error);
      const fallbackText = `${headerText ? '*' + headerText + '*\n\n' : ''}${bodyText}`;
      return this.sendTextMessage(to, fallbackText);
    }
    return res;
  }

  /**
   * Send a location pin
   */
  async sendLocation(to, latitude, longitude, name = 'LCOS Location', address = '') {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'location',
      location: {
        latitude: String(latitude),
        longitude: String(longitude),
        name,
        address,
      },
    };
    const summary = `[Location Pin]: ${name} (${latitude}, ${longitude})`;
    return this.sendPayload(payload, summary, to);
  }

  /**
   * Send pre-approved template message
   */
  async sendTemplate(to, templateName = 'hello_world', languageCode = 'en_US', components = []) {
    const payload = {
      messaging_product: 'whatsapp',
      to: this.formatPhoneNumber(to),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length > 0 ? { components } : {}),
      },
    };
    const summary = `[Template ${templateName}] Language: ${languageCode}`;
    return this.sendPayload(payload, summary, to);
  }

  /**
   * Automated Trigger: Send Trip Dispatch Notification to Driver
   */
  async sendTripDispatchNotification(trip, driverPhone) {
    if (!driverPhone) return null;

    const bodyText = 
`🚛 *NEW TRIP ASSIGNED - LCOS LOGISTICS*
────────────────────────────
📋 *Trip ID:* ${trip.id}
📦 *Cargo:* ${trip.commodity_name || trip.commodity_id || 'Commodity'} (${trip.quantity} Bags/Tons)
🚚 *Vehicle:* ${trip.vehicle_id}
📍 *Origin:* ${trip.source_branch_name || trip.source_branch_id}
🏁 *Destination:* ${trip.destination_branch_name || trip.destination_branch_id}
⏱️ *Expected Delivery:* ${trip.expected_delivery_date ? new Date(trip.expected_delivery_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : 'As Scheduled'}
────────────────────────────
💡 *Quick Actions:*
Reply *TRACK ${trip.id}* to view progress.
Reply *DELAY <reason>* if delayed.
Reply *SOS* for emergency assistance.
Send a 📍 Location pin anytime to sync your vehicle GPS.`;

    const buttons = [
      { id: `trk_${trip.id}`, title: 'Track Trip Status' },
      { id: `loc_${trip.id}`, title: 'Share Location Pin' },
      { id: `sos_${trip.id}`, title: 'Emergency SOS' },
    ];

    return this.sendInteractiveButtons(driverPhone, '🚚 Trip Dispatched', bodyText, buttons, 'Logistics Operations Control');
  }

  /**
   * Automated Trigger: Send Stoppage Alert to Driver or Fleet Manager
   */
  async sendStoppageAlertNotification(vehicle, alertData, recipientPhone) {
    if (!recipientPhone) return null;

    const bodyText =
`⚠️ *UNSCHEDULED STOPPAGE DETECTED*
────────────────────────────
🚛 *Vehicle:* ${vehicle.vehicle_id || vehicle.id}
⏱️ *Stopped Duration:* ${alertData.stoppage_duration_minutes || 20}+ minutes
📍 *Current Coordinates:* ${vehicle.current_lat || 'Unknown'}, ${vehicle.current_lng || 'Unknown'}
────────────────────────────
Operations Control has flagged this halt (>20 minutes without movement).
Please reply with your status:
• Reply *MOVING* if resuming transit
• Reply *STOP <reason>* (e.g. STOP Puncture / Heavy Traffic)
• Reply *SOS* for emergency breakdown assistance`;

    const buttons = [
      { id: `stp_moving_${vehicle.id}`, title: 'Resuming Transit' },
      { id: `stp_delay_${vehicle.id}`, title: 'Report Delay' },
      { id: `stp_sos_${vehicle.id}`, title: 'Need Assistance' },
    ];

    try {
      const btnRes = await this.sendInteractiveButtons(recipientPhone, '⚠️ Vehicle Stoppage Warning', bodyText, buttons, 'LCOS Monitoring Unit');
      if (!btnRes.success) {
        // Fallback to text message if interactive is rejected
        return await this.sendTextMessage(recipientPhone, bodyText);
      }
      return btnRes;
    } catch (e) {
      return this.sendTextMessage(recipientPhone, bodyText);
    }
  }

  /**
   * Automated Trigger: Send Stoppage Alert to Higher Official / Operations Manager
   */
  async sendHigherOfficialStoppageAlert(vehicle, alertData, officialPhone) {
    if (!officialPhone) return null;

    const bodyText =
`🚨 *CRITICAL OPERATIONS ALERT - VEHICLE STOPPAGE > 20 MINS*
────────────────────────────
🚛 *Vehicle:* ${vehicle.vehicle_id || vehicle.id} (${vehicle.vehicle_type || 'Commercial Lorry'})
👤 *Driver:* ${vehicle.driver_name || 'Driver'} (📞 ${vehicle.driver_phone || 'No phone'})
📋 *Trip ID:* ${vehicle.trip_id || 'Active Shipment'}
📍 *Route:* ${vehicle.source_name || 'Origin'} ➔ ${vehicle.dest_name || 'Destination'}
⏱️ *Halt Duration:* ${alertData.stoppage_duration_minutes || 20}+ minutes
📍 *Current Coordinates:* ${vehicle.current_lat || 'Unknown'}, ${vehicle.current_lng || 'Unknown'}
────────────────────────────
⚠️ *Status:* Lorry has been stationary exceeding the 20-minute threshold.
Automated inquiry sent to driver. Immediate review or driver follow-up required.`;

    return this.sendTextMessage(officialPhone, bodyText);
  }

  /**
   * Automated Trigger: Send Delivery Confirmation Notification
   */
  async sendDeliveryConfirmationNotification(trip, recipientPhone) {
    if (!recipientPhone) return null;

    const bodyText =
`✅ *SHIPMENT DELIVERED SUCCESSFULLY*
────────────────────────────
📋 *Trip ID:* ${trip.id}
📦 *Cargo:* ${trip.commodity_name || trip.commodity_id || 'Goods'} (${trip.quantity} Units)
🏁 *Destination:* ${trip.destination_branch_name || trip.destination_branch_id}
🕒 *Delivered At:* ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short', year: 'numeric' })}
────────────────────────────
All goods verified and stock received at destination warehouse. Thank you for your partnership!`;

    return this.sendTextMessage(recipientPhone, bodyText);
  }
}

module.exports = new WhatsAppService();
