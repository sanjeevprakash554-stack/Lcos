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
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '1246879781843655';
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || 'EAAQeAI63VoYBSw60w5C4LZBBg4AXIipaVBK8MZA8c9uFZBoPqXf426GgnMwbp9JcvXQaCBFvmhItuWcO2NFAJ7azzZAIe9jzrNXHXhuA2UNPZCoxykaSjruteZCxYyLvkZCiwnAgAwxuMWLF5u9xEAulduVqTMfQOL857HnURSJgYXI9KiDuun0y7vKhkgjGqFbWwZDZD';
    const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '2546380309167877';
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'lcos_meta_verify_token_2026';
    const higherOfficialPhone = process.env.HIGHER_OFFICIAL_PHONE || '916382897998';

    return {
      apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
      phoneNumberId,
      accessToken,
      businessAccountId,
      verifyToken,
      higherOfficialPhone,
      enabled: process.env.WHATSAPP_ENABLED !== 'false',
      isConfigured: !!(phoneNumberId && accessToken),
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
        const errorCode = data.error?.code;
        console.error(`❌ [WhatsApp API Error] (${response.status} - Code ${errorCode}):`, errorMsg);

        // Auto-forward for Meta Sandbox Allowed List restriction (Error 131030)
        const officialPhone = this.formatPhoneNumber(config.higherOfficialPhone || '916382897998');
        if (errorCode === 131030 && formattedTo !== officialPhone && !payload._rerouted) {
          console.warn(`⚠️ [WhatsApp Sandbox Notice]: Recipient +${formattedTo} is not in Meta's allowed test list. Auto-forwarding to verified official phone: +${officialPhone}`);
          const reroutedPayload = { ...payload, to: officialPhone, _rerouted: true };
          const noticeHeader = `⚠️ *[Sandbox Forward: Driver +${formattedTo} not in Meta Allowed List]*\n\n`;
          if (reroutedPayload.text?.body) {
            reroutedPayload.text.body = noticeHeader + reroutedPayload.text.body;
          } else if (reroutedPayload.interactive?.body?.text) {
            reroutedPayload.interactive.body.text = noticeHeader + reroutedPayload.interactive.body.text;
          }
          const reroutedSummary = `[Auto-Forwarded to +${officialPhone}]: ${rawContentSummary}`;
          return this.sendPayload(reroutedPayload, reroutedSummary, officialPhone);
        }

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
   * Automated Trigger: Send Trip Dispatch Notification to Driver & Higher Officials
   * Sends clean message-only updates directly without interactive button options.
   */
  async sendTripDispatchNotification(trip, recipientPhone) {
    if (!recipientPhone) return null;

    const formattedRecipient = this.formatPhoneNumber(recipientPhone);
    const officialPhone = this.formatPhoneNumber(process.env.HIGHER_OFFICIAL_PHONE || '916382897998');
    const isHigherOfficial = formattedRecipient === officialPhone;

    const expectedTimeStr = trip.expected_delivery_date
      ? new Date(trip.expected_delivery_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
      : 'As Scheduled';

    const cargoText = `${trip.commodity_name || trip.commodity_id || 'Commodity'} (${trip.quantity} Bags/Tons)`;
    const originText = trip.source_branch_name || trip.source_branch_id || 'Origin Depot';
    const destText = trip.destination_branch_name || trip.destination_branch_id || 'Destination Depot';

    let bodyText;
    if (isHigherOfficial) {
      bodyText = 
`🚚 *TRIP DISPATCHED - LCOS LOGISTICS*
────────────────────────────
📋 *Trip ID:* ${trip.id}
📦 *Cargo:* ${cargoText}
🚚 *Vehicle:* ${trip.vehicle_id}
${trip.driver_name ? `👤 *Driver:* ${trip.driver_name}${trip.driver_phone ? ` (📞 ${trip.driver_phone})` : ''}\n` : ''}📍 *Origin:* ${originText}
🏁 *Destination:* ${destText}
⏱️ *Expected Delivery:* ${expectedTimeStr}
────────────────────────────
💡 *Quick Actions:*
Reply *TRACK ${trip.id}* to view live progress.
Reply *DELAY <reason>* to record transit delay.
Reply *SOS* for emergency assistance.
Send a 📍 Location pin anytime to sync vehicle GPS.

_Logistics Operations Control_`;
    } else {
      bodyText = 
`🚚 *Trip Dispatched*
🚛 *NEW TRIP ASSIGNED - LCOS LOGISTICS*
────────────────────────────
📋 *Trip ID:* ${trip.id}
📦 *Cargo:* ${cargoText}
🚚 *Vehicle:* ${trip.vehicle_id}
📍 *Origin:* ${originText}
🏁 *Destination:* ${destText}
⏱️ *Expected Delivery:* ${expectedTimeStr}
────────────────────────────
💡 *Quick Actions:*
Reply *TRACK ${trip.id}* to view progress.
Reply *DELAY <reason>* if delayed.
Reply *SOS* for emergency assistance.
Send a 📍 Location pin anytime to sync your vehicle GPS.

_Logistics Operations Control_`;
    }

    // Message only — interactive buttons removed as required
    return this.sendTextMessage(recipientPhone, bodyText);
  }

  /**
   * Automated Trigger: Send Stoppage Alert to Driver or Fleet Manager
   */
  async sendStoppageAlertNotification(vehicle, alertData, recipientPhone) {
    if (!recipientPhone) return null;
    const vehId = vehicle.vehicle_id || vehicle.id || 'TN-59-EF-9012';
    const duration = `${alertData.stoppage_duration_minutes || 20}+ minutes`;
    const coords = `${vehicle.current_lat || '11.6455'}, ${vehicle.current_lng || '78.1576'}`;

    // 1. Primary: Send the officially approved Meta template (_unscheduled_halt_warning_v1)
    try {
      const templateRes = await this.sendTemplate(
        recipientPhone,
        '_unscheduled_halt_warning_v1',
        'en',
        [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: vehId },
              { type: 'text', text: duration },
              { type: 'text', text: coords }
            ]
          }
        ]
      );
      if (templateRes && templateRes.success) {
        return templateRes;
      }
    } catch (err) {
      console.warn('⚠️ [WhatsApp] Meta template delivery notice:', err.message);
    }

    // 2. Secondary fallback: Interactive buttons within active 24h window
    const bodyText =
`🚨🔊 *URGENT STOPPAGE ALERT (>20 MINS)*
────────────────────────────
🚛 *Vehicle:* ${vehId}
⏱️ *Stationary Time:* ${duration}
📍 *Current Coordinates:* ${coords}
────────────────────────────
Central Operations flagged an unscheduled halt (>20 minutes without movement).
⚠️ *Tap your current reason below to update Central Operations immediately:*`;

    const buttons = [
      { id: `stp_traffic_${vehicle.id || vehicle.vehicle_id}`, title: 'Traffic / Toll Delay' },
      { id: `stp_breakdown_${vehicle.id || vehicle.vehicle_id}`, title: 'Puncture / Breakdown' },
      { id: `stp_lunch_${vehicle.id || vehicle.vehicle_id}`, title: 'Lunch / Food Break' },
    ];

    try {
      const btnRes = await this.sendInteractiveButtons(recipientPhone, '🚨 Unscheduled Halt Warning', bodyText, buttons, 'LCOS Monitoring Unit');
      if (!btnRes.success) {
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
    const targetPhone = officialPhone || process.env.HIGHER_OFFICIAL_PHONE || '916382897998';
    if (!targetPhone) return null;

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
   * Automated Trigger: Send Transit Resumed Notification to Higher Official / Tracking Team
   */
  async sendHigherOfficialTransitResumed(details, officialPhone) {
    const targetPhone = officialPhone || process.env.HIGHER_OFFICIAL_PHONE || '916382897998';
    if (!targetPhone) return null;

    const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
    const bodyText =
`🟢 *TRANSIT RESUMED: VEHICLE ON THE MOVE*
────────────────────────────
📋 *Trip ID:* ${details.tripId || 'Active Shipment'}
🚛 *Vehicle:* ${details.vehicleId || 'Assigned Lorry'}
👤 *Driver:* ${details.driverName || 'Driver'} (📞 ${details.driverPhone || 'N/A'})
📍 *Route:* ${details.route || 'In Transit'}
🕒 *Resumed At:* ${currentTime}
────────────────────────────
✅ *Status:* Driver confirmed "Resuming Movement". Stoppage alert cleared and vehicle is back in transit. Operations Control has updated live tracking.`;

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

  /**
   * Automated Trigger: Send Return Load Opportunity Notification to Driver & Branch Manager
   */
  async sendReturnLoadOpportunityNotification({ driverPhone, managerPhone, returnTrip, vehicle, driver, sourceBranch, destBranch }) {
    const results = { driver: null, manager: null };

    const cargoDesc = `${returnTrip.commodity_name || 'Commodity'} (${returnTrip.quantity} ${returnTrip.commodity_unit || 'Units'})`;
    const sourceName = sourceBranch?.name || returnTrip.source_branch_id || 'Current Branch';
    const sourceManager = sourceBranch?.manager_name || 'Branch In-charge';
    const sourcePhone = sourceBranch?.phone || 'Office Line';
    const destName = destBranch?.name || returnTrip.destination_branch_id || 'Home Base';
    const vehicleId = vehicle?.id || vehicle?.vehicle_id || 'Lorry';
    const driverName = driver?.name || 'Assigned Driver';
    const driverPhoneNum = driver?.phone || 'Driver Line';

    // 1. Message to Driver
    if (driverPhone) {
      const driverBody =
`🔔 *RETURN LOAD OPPORTUNITY DETECTED - LCOS*
────────────────────────────
📦 *Cargo:* ${cargoDesc}
📍 *Pickup Location:* ${sourceName}
🏢 *Branch Manager:* ${sourceManager} (📞 ${sourcePhone})
🏁 *Destination:* ${destName} (Home Depot)
🚛 *Your Lorry:* ${vehicleId}
────────────────────────────
📞 *Action Required:* Call Branch Manager ${sourceManager} (${sourcePhone}) to verify gate number and loading readiness.
💻 Once verified, the manager will click *"Pair Backload"* on LCOS to approve your return journey!`;

      results.driver = await this.sendTextMessage(driverPhone, driverBody);
    }

    // 2. Message to Branch Manager
    if (managerPhone) {
      const managerBody =
`🔔 *NEW RETURN LOAD OPPORTUNITY (CALL & VERIFY)*
────────────────────────────
📦 *Pending Cargo:* ${cargoDesc}
📍 *Pickup Branch:* ${sourceName}
🏁 *Destination:* ${destName}
🚛 *Available Lorry:* ${vehicleId}
👤 *Driver:* ${driverName} (📞 ${driverPhoneNum})
────────────────────────────
📞 *Action Required:* Call Driver ${driverName} (${driverPhoneNum}) to verify truck availability & gate arrival.
💻 *Next Step:* Once confirmed, open LCOS Return Hub and click *"Pair Backload"* to dispatch!`;

      results.manager = await this.sendTextMessage(managerPhone, managerBody);
    }

    return results;
  }

  /**
   * Automated Trigger: Send Return Load Confirmed & Dispatched Notification to Branch Manager
   */
  async sendReturnLoadConfirmedNotification({ managerPhone, tripId, vehicleId, driverName, driverPhone, sourceName, destName, cargoDesc }) {
    if (!managerPhone) return null;

    const bodyText =
`✅ *RETURN LOAD CONFIRMED & PAIRED*
────────────────────────────
📋 *Trip ID:* ${tripId}
🚛 *Vehicle:* ${vehicleId}
👤 *Driver:* ${driverName} (📞 ${driverPhone})
📦 *Cargo:* ${cargoDesc}
📍 *Route:* ${sourceName} ➔ ${destName}
────────────────────────────
🚀 Lorry has been officially paired and approved for return transit. Tracking is now active on LCOS!`;

    return this.sendTextMessage(managerPhone, bodyText);
  }
}

module.exports = new WhatsAppService();
