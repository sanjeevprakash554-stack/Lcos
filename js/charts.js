/**
 * Logistics Operations Control System (LCOS) - Charts & Visualizations
 * Provides custom SVG-based interactive charts matching the glassmorphic styling.
 */

const LCOS_Charts = {
    /**
     * Renders a Donut Chart for Delay Reasons
     * @param {string} containerId ID of container element
     * @param {Array} data Array of { label, value }
     */
    renderDelayReasonChart(containerId, data) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        const total = data.reduce((sum, item) => sum + item.value, 0);
        if (total === 0) {
            container.innerHTML = `<div style="height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 0.9rem;">No delay events logged yet.</div>`;
            return;
        }

        const colors = [
            'var(--color-danger)',    // Traffic
            'var(--color-primary)',   // Breakdown
            'var(--color-warning)',   // Weather
            'var(--color-transit)',   // Loading issue
            'var(--text-muted)'       // Other
        ];

        const width = 240;
        const height = 200;
        const radius = 70;
        const cx = 95;
        const cy = 100;
        const strokeWidth = 16;
        const circumference = 2 * Math.PI * radius;

        let svgHtml = `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
            <defs>
                <filter id="glow-chart" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
            </defs>`;

        let accumulatedAngle = 0;

        data.forEach((item, index) => {
            if (item.value === 0) return;
            const percentage = item.value / total;
            const strokeDash = percentage * circumference;
            const strokeOffset = circumference - strokeDash + (accumulatedAngle / 360) * circumference;
            const color = colors[index % colors.length];

            svgHtml += `
                <circle cx="${cx}" cy="${cy}" r="${radius}" 
                    fill="transparent" 
                    stroke="${color}" 
                    stroke-width="${strokeWidth}" 
                    stroke-dasharray="${circumference}" 
                    stroke-dashoffset="${strokeOffset}" 
                    transform="rotate(-90 ${cx} ${cy})"
                    style="transition: stroke-dashoffset 0.8s ease; cursor: pointer;"
                    onmouseover="this.setAttribute('stroke-width', '20'); this.setAttribute('filter', 'url(#glow-chart)')"
                    onmouseout="this.setAttribute('stroke-width', '${strokeWidth}'); this.removeAttribute('filter')"
                >
                    <title>${item.label}: ${item.value} (${Math.round(percentage * 100)}%)</title>
                </circle>`;
            
            accumulatedAngle -= percentage * 360;
        });

        // Add Center text
        svgHtml += `
            <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="var(--text-primary)" font-size="16px" font-weight="bold" font-family="var(--font-heading)">${total}</text>
            <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="var(--text-muted)" font-size="10px" font-weight="600" letter-spacing="0.5px">TOTAL DELAYS</text>
        `;

        // Add Legends on the right side
        let legendY = 35;
        data.forEach((item, index) => {
            const color = colors[index % colors.length];
            svgHtml += `
                <g transform="translate(180, ${legendY})">
                    <rect width="10" height="10" rx="2" fill="${color}" />
                    <text x="16" y="9" fill="var(--text-secondary)" font-size="10px" font-weight="600">${item.label}</text>
                    <text x="16" y="21" fill="var(--text-primary)" font-size="11px" font-weight="bold">${item.value} (${total > 0 ? Math.round(item.value / total * 100) : 0}%)</text>
                </g>`;
            legendY += 32;
        });

        svgHtml += `</svg>`;
        container.innerHTML = svgHtml;
    },

    /**
     * Renders a Bar Chart for Trip Volumes by Branch
     * @param {string} containerId ID of container element
     * @param {Array} data Array of { branchName, sent, received }
     */
    renderBranchVolumeChart(containerId, data) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        if (data.length === 0) {
            container.innerHTML = `<div style="height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 0.9rem;">No trip data available.</div>`;
            return;
        }

        const width = 450;
        const height = 200;
        const chartWidth = 400;
        const chartHeight = 150;
        const paddingLeft = 35;
        const paddingTop = 20;

        // Find max value for Y scaling
        let maxVal = 0;
        data.forEach(d => {
            if (d.sent > maxVal) maxVal = d.sent;
            if (d.received > maxVal) maxVal = d.received;
        });
        maxVal = Math.ceil((maxVal || 1) / 5) * 5; // Round to nearest 5

        let svgHtml = `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
            <defs>
                <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.8"/>
                    <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0.2"/>
                </linearGradient>
                <linearGradient id="cyanGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--color-transit)" stop-opacity="0.8"/>
                    <stop offset="100%" stop-color="var(--color-transit)" stop-opacity="0.2"/>
                </linearGradient>
            </defs>`;

        // Render Y-axis Grid Lines and values
        const steps = 4;
        for (let i = 0; i <= steps; i++) {
            const val = Math.round((maxVal / steps) * i);
            const y = paddingTop + chartHeight - (chartHeight / steps) * i;
            svgHtml += `
                <line x1="${paddingLeft}" y1="${y}" x2="${paddingLeft + chartWidth}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="1" />
                <text x="${paddingLeft - 8}" y="${y + 4}" fill="var(--text-muted)" font-size="9px" text-anchor="end" font-weight="600">${val}</text>
            `;
        }

        // Render Bars
        const numBranches = data.length;
        const groupWidth = chartWidth / numBranches;
        const barWidth = groupWidth * 0.3;

        data.forEach((d, idx) => {
            const groupX = paddingLeft + (idx * groupWidth);
            const sentHeight = (d.sent / maxVal) * chartHeight;
            const recHeight = (d.received / maxVal) * chartHeight;
            const sentY = paddingTop + chartHeight - sentHeight;
            const recY = paddingTop + chartHeight - recHeight;

            const sentBarX = groupX + (groupWidth * 0.15);
            const recBarX = groupX + (groupWidth * 0.15) + barWidth + 2;

            svgHtml += `
                <!-- Sent Bar (Indigo) -->
                <rect x="${sentBarX}" y="${sentY}" width="${barWidth}" height="${sentHeight}" fill="url(#blueGrad)" rx="2" style="transition: height 0.5s ease, y 0.5s ease;">
                    <title>${d.branchName} - Dispatched: ${d.sent} trips</title>
                </rect>
                
                <!-- Received Bar (Cyan) -->
                <rect x="${recBarX}" y="${recY}" width="${barWidth}" height="${recHeight}" fill="url(#cyanGrad)" rx="2" style="transition: height 0.5s ease, y 0.5s ease;">
                    <title>${d.branchName} - Received: ${d.received} trips</title>
                </rect>

                <!-- X Label -->
                <text x="${groupX + groupWidth / 2}" y="${paddingTop + chartHeight + 15}" fill="var(--text-secondary)" font-size="9px" text-anchor="middle" font-weight="600">
                    ${d.branchName.slice(0, 3).toUpperCase()}
                </text>
            `;
        });

        // Add small legend top-right
        svgHtml += `
            <g transform="translate(${width - 150}, 0)">
                <rect width="8" height="8" rx="2" fill="var(--color-primary)" />
                <text x="12" y="8" fill="var(--text-secondary)" font-size="9px" font-weight="600">Dispatched</text>
                
                <rect x="70" width="8" height="8" rx="2" fill="var(--color-transit)" />
                <text x="82" y="8" fill="var(--text-secondary)" font-size="9px" font-weight="600">Received</text>
            </g>
        `;

        svgHtml += `</svg>`;
        container.innerHTML = svgHtml;
    },

    /**
     * Renders a Leaderboard of top performing drivers
     * @param {string} containerId ID of container element
     * @param {Array} drivers Array of Driver objects
     */
    renderDriverLeaderboard(containerId, drivers) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        // Sort by score descending and take top 5
        const sorted = [...drivers].sort((a, b) => b.performance - a.performance).slice(0, 5);

        let html = '<div style="display:flex; flex-direction:column; gap: 0.75rem;">';
        sorted.forEach((drv, index) => {
            let scoreColor = 'var(--color-success)';
            if (drv.performance < 75) scoreColor = 'var(--color-danger)';
            else if (drv.performance < 90) scoreColor = 'var(--color-warning)';

            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;

            html += `
                <div class="flex align-center justify-between" style="padding: 0.4rem 0.5rem; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px solid var(--border-glass)">
                    <div class="flex align-center gap-2">
                        <span style="font-size: 1rem; width: 24px; text-align: center;">${medal}</span>
                        <div>
                            <div style="font-size: 0.85rem; font-weight: 700;">${drv.name}</div>
                            <div style="font-size: 0.7rem; color: var(--text-muted);">Warnings: ${drv.warnings} | Exp: ${drv.experience} yrs</div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div style="font-size: 0.95rem; font-weight: 800; color: ${scoreColor}">${drv.performance}%</div>
                        <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Rating</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    }
};

window.LCOS_Charts = LCOS_Charts;
