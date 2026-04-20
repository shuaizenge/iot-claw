export type ControlPlanePage = 'home' | 'devices' | 'settings';

export function renderControlPlaneUi(page: ControlPlanePage): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${getPageTitle(page)}</title>
    <style>
      :root {
        --bg: #f2eadf;
        --bg-accent: #efe1cf;
        --panel: rgba(255, 249, 240, 0.92);
        --panel-strong: #fffdf8;
        --text: #1f2428;
        --muted: #5f6a6f;
        --line: rgba(118, 89, 61, 0.16);
        --brand: #a24d31;
        --brand-strong: #7c3218;
        --ok: #2a6e56;
        --warn: #af6a1f;
        --danger: #9b3b2c;
        --shadow: 0 24px 60px rgba(90, 63, 38, 0.12);
        --radius-xl: 28px;
        --radius-lg: 22px;
        --radius-md: 16px;
      }

      * { box-sizing: border-box; }

      html, body {
        margin: 0;
        min-height: 100%;
      }

      body {
        font-family: "Noto Serif SC", "Songti SC", "STSong", serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(162, 77, 49, 0.16), transparent 24%),
          radial-gradient(circle at 85% 15%, rgba(255, 255, 255, 0.6), transparent 22%),
          linear-gradient(180deg, #f8f1e7 0%, var(--bg) 46%, var(--bg-accent) 100%);
      }

      a { color: inherit; text-decoration: none; }
      button, input, textarea, select { font: inherit; }

      .shell {
        max-width: 1280px;
        margin: 0 auto;
        padding: 24px 20px 48px;
      }

      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 20px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .brand-mark {
        width: 44px;
        height: 44px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        background: linear-gradient(145deg, var(--brand), var(--brand-strong));
        color: #fff;
        font-size: 20px;
        box-shadow: 0 12px 24px rgba(124, 50, 24, 0.24);
      }

      .brand-copy h1,
      .hero-copy h2,
      .section-title,
      .panel h3,
      .panel h2 {
        margin: 0;
      }

      .brand-copy p,
      .hero-copy p,
      .section-subtitle,
      .meta,
      .subtle {
        margin: 0;
        color: var(--muted);
      }

      .nav {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .nav a {
        padding: 10px 16px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: rgba(255, 253, 248, 0.68);
      }

      .nav a.active {
        background: linear-gradient(145deg, var(--brand), var(--brand-strong));
        color: #fff;
        border-color: transparent;
      }

      .hero {
        padding: 32px;
        border-radius: var(--radius-xl);
        border: 1px solid var(--line);
        background:
          linear-gradient(135deg, rgba(255, 251, 245, 0.98), rgba(245, 228, 207, 0.95)),
          var(--panel);
        box-shadow: var(--shadow);
      }

      .hero-grid {
        display: grid;
        grid-template-columns: 1.4fr 1fr;
        gap: 20px;
        align-items: end;
      }

      .hero-kicker {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 7px 12px;
        border-radius: 999px;
        margin-bottom: 14px;
        background: rgba(162, 77, 49, 0.12);
        color: var(--brand-strong);
        font-size: 13px;
      }

      .hero-copy h2 {
        font-size: clamp(32px, 5vw, 58px);
        line-height: 1.05;
        margin-bottom: 12px;
      }

      .hero-copy p {
        max-width: 760px;
        font-size: 16px;
        line-height: 1.75;
      }

      .hero-panel {
        padding: 20px;
        border-radius: var(--radius-lg);
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid rgba(124, 50, 24, 0.1);
      }

      .hero-panel strong {
        display: block;
        font-size: 14px;
        margin-bottom: 8px;
        color: var(--brand-strong);
      }

      .hero-panel p {
        font-size: 14px;
        line-height: 1.7;
      }

      .section {
        margin-top: 22px;
      }

      .section-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 16px;
        margin-bottom: 14px;
      }

      .section-title {
        font-size: 24px;
      }

      .cards,
      .grid,
      .summary-grid {
        display: grid;
        gap: 16px;
      }

      .cards {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .summary-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .grid {
        grid-template-columns: repeat(12, minmax(0, 1fr));
      }

      .panel,
      .card-link,
      .summary-card {
        background: var(--panel);
        border: 1px solid var(--line);
        box-shadow: var(--shadow);
      }

      .panel {
        border-radius: var(--radius-lg);
        padding: 20px;
      }

      .summary-card {
        border-radius: 20px;
        padding: 18px;
      }

      .summary-card .label {
        font-size: 13px;
        color: var(--muted);
      }

      .summary-card .value {
        margin-top: 10px;
        font-size: 28px;
      }

      .summary-card .hint {
        margin-top: 8px;
        font-size: 13px;
        color: var(--muted);
      }

      .card-link {
        display: block;
        border-radius: 24px;
        padding: 24px;
        transition: transform 160ms ease, box-shadow 160ms ease;
      }

      .card-link:hover {
        transform: translateY(-2px);
        box-shadow: 0 28px 64px rgba(90, 63, 38, 0.16);
      }

      .card-link .eyebrow {
        display: inline-block;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(162, 77, 49, 0.12);
        color: var(--brand-strong);
        font-size: 12px;
        margin-bottom: 14px;
      }

      .card-link h3 {
        font-size: 28px;
        margin: 0 0 10px;
      }

      .card-link p {
        margin: 0;
        line-height: 1.75;
        color: var(--muted);
      }

      .card-link strong {
        display: inline-flex;
        margin-top: 16px;
        color: var(--brand-strong);
      }

      .span-12 { grid-column: span 12; }
      .span-8 { grid-column: span 8; }
      .span-7 { grid-column: span 7; }
      .span-6 { grid-column: span 6; }
      .span-5 { grid-column: span 5; }
      .span-4 { grid-column: span 4; }

      .stack {
        display: grid;
        gap: 16px;
      }

      .toolbar,
      .button-row,
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .toolbar {
        align-items: center;
        justify-content: space-between;
      }

      .field-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      label {
        display: grid;
        gap: 7px;
        color: var(--muted);
        font-size: 13px;
      }

      input, textarea, select {
        width: 100%;
        padding: 11px 13px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.82);
        color: var(--text);
      }

      textarea {
        min-height: 120px;
        resize: vertical;
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-size: 12px;
      }

      button,
      .button-link {
        border: 0;
        border-radius: 999px;
        padding: 11px 16px;
        cursor: pointer;
      }

      button,
      .button-link.primary {
        background: linear-gradient(145deg, var(--brand), var(--brand-strong));
        color: #fff;
      }

      button.secondary,
      .button-link.secondary {
        background: rgba(255, 255, 255, 0.72);
        color: var(--text);
        border: 1px solid var(--line);
      }

      .status {
        min-height: 22px;
        font-size: 13px;
        color: var(--muted);
      }

      .status.ok { color: var(--ok); }
      .status.warn { color: var(--warn); }
      .status.danger { color: var(--danger); }

      .device-list {
        display: grid;
        gap: 10px;
      }

      .device-item {
        text-align: left;
        padding: 14px 16px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.74);
        color: var(--text);
      }

      .device-item.active {
        border-color: rgba(162, 77, 49, 0.52);
        background: rgba(247, 229, 208, 0.8);
      }

      .device-row {
        display: flex;
        gap: 8px;
        align-items: stretch;
      }

      .device-row .device-item {
        flex: 1;
        min-width: 0;
      }

      button.device-delete {
        flex-shrink: 0;
        align-self: center;
        padding: 8px 12px;
        font-size: 13px;
        color: var(--danger);
        border-color: rgba(155, 59, 44, 0.35);
      }

      button.device-delete:hover {
        background: rgba(155, 59, 44, 0.08);
      }

      .device-name {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 6px;
        font-size: 16px;
      }

      .device-meta,
      .overview-grid small,
      .hint-list li,
      .inline-note {
        color: var(--muted);
      }

      .badge,
      .chip,
      .state-dot {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .badge,
      .chip {
        border-radius: 999px;
        padding: 6px 10px;
        background: rgba(162, 77, 49, 0.09);
        border: 1px solid rgba(162, 77, 49, 0.16);
        font-size: 12px;
      }

      .state-dot::before {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: var(--warn);
      }

      .state-dot.online::before,
      .state-good::before {
        background: var(--ok);
      }

      .state-bad::before { background: var(--danger); }

      .overview-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .overview-item {
        padding: 14px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.66);
        border: 1px solid var(--line);
      }

      .overview-item strong {
        display: block;
        margin-top: 8px;
        font-size: 18px;
      }

      pre {
        margin: 0;
        padding: 14px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.76);
        border: 1px solid var(--line);
        overflow: auto;
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-size: 12px;
        line-height: 1.6;
      }

      ul.hint-list {
        margin: 0;
        padding-left: 18px;
        display: grid;
        gap: 6px;
      }

      .empty {
        padding: 20px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.54);
        border: 1px dashed var(--line);
        color: var(--muted);
      }

      .modal-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(31, 36, 40, 0.38);
        z-index: 200;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }

      .modal-overlay.open {
        display: flex;
      }

      .modal {
        background: var(--panel-strong);
        border: 1px solid var(--line);
        border-radius: var(--radius-lg);
        padding: 28px;
        width: min(700px, 100%);
        max-height: 88vh;
        overflow-y: auto;
        box-shadow: 0 32px 80px rgba(90, 63, 38, 0.22);
      }

      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }

      .modal-header h3 { margin: 0; }

      .modal-close {
        background: none;
        border: 0;
        font-size: 20px;
        cursor: pointer;
        color: var(--muted);
        padding: 4px 10px;
        border-radius: 10px;
        line-height: 1;
      }

      .modal-close:hover {
        background: var(--bg-accent);
        color: var(--text);
      }

      .action-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 4px;
      }

      .capability-action-row {
        display: grid;
        gap: 10px;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.66);
      }

      .capability-action-row .row-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .capability-action-row code {
        font-size: 12px;
        padding: 2px 8px;
        border-radius: 8px;
        background: rgba(162, 77, 49, 0.08);
      }

      .capability-desc-pre {
        margin: 0;
        max-height: 220px;
        overflow: auto;
      }

      .telemetry-history-pre {
        margin: 0;
        max-height: min(420px, 50vh);
        min-height: 100px;
        overflow: auto;
      }

      @media (max-width: 980px) {
        .hero-grid,
        .cards,
        .summary-grid,
        .field-grid,
        .overview-grid {
          grid-template-columns: 1fr;
        }

        .span-8,
        .span-7,
        .span-6,
        .span-5,
        .span-4 {
          grid-column: span 12;
        }

        .topbar,
        .toolbar,
        .section-head {
          align-items: flex-start;
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body data-page="${page}">
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">I</div>
          <div class="brand-copy">
            <h1>iot-claw 控制台</h1>
            <p>宿主侧设备接入、配置与运维控制面</p>
          </div>
        </div>
        <nav class="nav">
          <a href="/" class="${page === 'home' ? 'active' : ''}">首页</a>
          <a href="/devices" class="${page === 'devices' ? 'active' : ''}">设备管理</a>
          <a href="/settings" class="${page === 'settings' ? 'active' : ''}">系统设置</a>
        </nav>
      </header>
      ${renderPageBody(page)}
    </div>
    <script>
      const page = document.body.dataset.page;

      function openModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('open');
      }

      function closeModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('open');
      }

      document.addEventListener('click', (event) => {
        const openTarget = event.target.closest('[data-open-modal]');
        if (openTarget) {
          openModal(openTarget.dataset.openModal);
          return;
        }
        const closeTarget = event.target.closest('[data-close-modal]');
        if (closeTarget) {
          closeModal(closeTarget.dataset.closeModal);
          return;
        }
        if (event.target.classList.contains('modal-overlay')) {
          event.target.classList.remove('open');
        }
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          document.querySelectorAll('.modal-overlay.open').forEach((el) => {
            el.classList.remove('open');
          });
        }
      });

      function setStatus(id, message, tone) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = message || '';
        el.className = 'status' + (tone ? ' ' + tone : '');
      }

      async function api(path, options) {
        const response = await fetch(path, {
          headers: { 'Content-Type': 'application/json' },
          ...options,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || '请求失败');
        }
        return payload;
      }

      function safeJsonParse(raw, fallback) {
        const input = String(raw || '').trim();
        if (!input) return fallback;
        return JSON.parse(input);
      }

      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function fillForm(form, values) {
        Object.entries(values).forEach(([key, value]) => {
          if (!form.elements[key]) return;
          form.elements[key].value = value == null ? '' : String(value);
        });
      }

      function formatTime(value) {
        if (!value) return '暂无';
        try {
          return new Date(value).toLocaleString('zh-CN', { hour12: false });
        } catch {
          return String(value);
        }
      }

      function renderPrettyJson(target, value) {
        if (!target) return;
        target.textContent = JSON.stringify(value, null, 2);
      }

      function buildActionArgsExample(action) {
        const schema = action && action.argsSchema && typeof action.argsSchema === 'object' ? action.argsSchema : {};
        const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
        const example = {};

        Object.entries(properties).forEach(([key, fieldSchema]) => {
          if (!fieldSchema || typeof fieldSchema !== 'object') return;
          if (fieldSchema.default !== undefined) {
            example[key] = fieldSchema.default;
            return;
          }
          if (fieldSchema.example !== undefined) {
            example[key] = fieldSchema.example;
            return;
          }
          if (fieldSchema.enum && Array.isArray(fieldSchema.enum) && fieldSchema.enum.length) {
            example[key] = fieldSchema.enum[0];
            return;
          }
          if (fieldSchema.type === 'number' || fieldSchema.type === 'integer') {
            if (typeof fieldSchema.minimum === 'number' && typeof fieldSchema.maximum === 'number') {
              example[key] = Math.round((fieldSchema.minimum + fieldSchema.maximum) / 2);
              return;
            }
            if (typeof fieldSchema.minimum === 'number') {
              example[key] = fieldSchema.minimum;
              return;
            }
            example[key] = 0;
            return;
          }
          if (fieldSchema.type === 'boolean') {
            example[key] = false;
            return;
          }
          if (fieldSchema.type === 'array') {
            example[key] = [];
            return;
          }
          if (fieldSchema.type === 'object') {
            example[key] = {};
            return;
          }
          example[key] = '';
        });

        return JSON.stringify(example, null, 2);
      }

      function mqttStateText(state) {
        const map = {
          stopped: '未连接',
          connecting: '连接中',
          connected: '已连接',
          reconnecting: '重连中',
          error: '异常',
        };
        return map[state] || state;
      }

      async function initHomePage() {
        const titleEl = document.getElementById('home-title');
        const subtitleEl = document.getElementById('home-subtitle');
        const summaryStatus = document.getElementById('home-status');

        try {
          const [server, summary] = await Promise.all([
            api('/api/settings/server'),
            api('/api/dashboard/summary'),
          ]);

          titleEl.textContent = server.uiTitle || 'iot-claw 物联网控制中心';
          subtitleEl.textContent = server.serviceName + ' 正在作为宿主侧控制面运行，可从这里进入设备运维与基础配置。';
          document.getElementById('summary-service').textContent = summary.httpApi === 'active' ? '在线' : '离线';
          document.getElementById('summary-service-hint').textContent = '运行模式：' + summary.agentRuntime;
          document.getElementById('summary-mqtt').textContent = mqttStateText(summary.mqtt.state);
          document.getElementById('summary-mqtt-hint').textContent = summary.mqtt.url || '未配置 Broker';
          document.getElementById('summary-devices').textContent = String(summary.devices.total);
          document.getElementById('summary-devices-hint').textContent = '在线设备 ' + summary.devices.online + ' 台';
          document.getElementById('summary-last-seen').textContent = formatTime(summary.devices.lastSeenAt);
          document.getElementById('summary-last-seen-hint').textContent = summary.mqtt.lastConnectedAt ? '最近连接：' + formatTime(summary.mqtt.lastConnectedAt) : '尚未建立 MQTT 会话';
          summaryStatus.textContent = '摘要已刷新';
        } catch (error) {
          setStatus('home-status', error.message, 'warn');
        }
      }

      async function initSettingsPage() {
        const serverForm = document.getElementById('server-form');
        const mqttForm = document.getElementById('mqtt-form');
        const summaryBox = document.getElementById('settings-summary');

        async function loadSettings() {
          const [server, mqtt, summary] = await Promise.all([
            api('/api/settings/server'),
            api('/api/settings/mqtt'),
            api('/api/dashboard/summary'),
          ]);

          fillForm(serverForm, server);
          fillForm(mqttForm, mqtt);
          mqttForm.elements.tlsEnabled.value = String(mqtt.tlsEnabled);
          mqttForm.elements.enabled.value = String(mqtt.enabled);
          summaryBox.innerHTML = [
            '<span class="chip">HTTP：在线</span>',
            '<span class="chip">MQTT：' + mqttStateText(summary.mqtt.state) + '</span>',
            '<span class="chip">设备数：' + summary.devices.total + '</span>',
            '<span class="chip">最近 MQTT 连接：' + formatTime(summary.mqtt.lastConnectedAt) + '</span>',
          ].join('');
          document.getElementById('mqtt-password-note').textContent = mqtt.passwordConfigured ? '当前已保存密码；留空表示保持原值。' : '当前未保存密码；留空表示不设置密码。';
        }

        serverForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          try {
            const payload = Object.fromEntries(new FormData(serverForm).entries());
            const result = await api('/api/settings/server', {
              method: 'PUT',
              body: JSON.stringify(payload),
            });
            fillForm(serverForm, result);
            setStatus('server-status', '服务设置已保存。', 'ok');
          } catch (error) {
            setStatus('server-status', error.message, 'warn');
          }
        });

        mqttForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          try {
            const payload = Object.fromEntries(new FormData(mqttForm).entries());
            payload.keepaliveSeconds = Number(payload.keepaliveSeconds);
            payload.tlsEnabled = payload.tlsEnabled === 'true';
            payload.enabled = payload.enabled === 'true';
            const result = await api('/api/settings/mqtt', {
              method: 'PUT',
              body: JSON.stringify(payload),
            });
            fillForm(mqttForm, result);
            mqttForm.elements.tlsEnabled.value = String(result.tlsEnabled);
            mqttForm.elements.enabled.value = String(result.enabled);
            document.getElementById('mqtt-password-note').textContent = result.passwordConfigured ? '当前已保存密码；留空表示保持原值。' : '当前未保存密码；留空表示不设置密码。';
            setStatus('mqtt-status', 'MQTT 设置已保存，并已尝试应用到当前运行时。', 'ok');
            await loadSettings();
          } catch (error) {
            setStatus('mqtt-status', error.message, 'warn');
          }
        });

        try {
          await loadSettings();
        } catch (error) {
          setStatus('mqtt-status', error.message, 'warn');
        }
      }

      async function initDevicesPage() {
        const state = {
          devices: [],
          selectedDeviceId: null,
          actions: [],
          capabilities: [],
          query: '',
        };

        const deviceList = document.getElementById('device-list');
        const overview = document.getElementById('device-overview');
        const deviceData = document.getElementById('device-data');
        const capabilityTags = document.getElementById('capability-tags');
        const searchForm = document.getElementById('device-search-form');
        const registerForm = document.getElementById('device-register-form');
        const searchInput = document.getElementById('device-query');

        async function loadRegistrationDefaults() {
          const server = await api('/api/settings/server');
          if (registerForm.elements.tenant && !registerForm.elements.tenant.value) {
            registerForm.elements.tenant.value = server.defaultTenant || 'default';
          }
          if (registerForm.elements.site && !registerForm.elements.site.value) {
            registerForm.elements.site.value = server.defaultSite || 'default';
          }
        }

        function normalizeDeviceStatus(device, statePayload) {
          if (statePayload?.online === true || device.status === 'online') {
            return { text: '在线', className: 'online' };
          }
          if (device.status === 'registered') {
            return { text: '待设备上报', className: '' };
          }
          if (device.status === 'offline') {
            return { text: '离线', className: 'state-bad' };
          }
          return { text: device.status || '未知', className: 'state-bad' };
        }

        async function deleteDeviceRow(device) {
          const label = device.name || device.deviceId;
          if (!confirm('确定从平台删除设备「' + label + '」（' + device.deviceId + '）吗？相关状态、命令记录等将一并删除，且不可恢复。')) {
            return;
          }
          try {
            await api('/api/devices/' + encodeURIComponent(device.deviceId), { method: 'DELETE' });
            if (state.selectedDeviceId === device.deviceId) {
              state.selectedDeviceId = null;
            }
            await loadDevices();
            setStatus('device-status', '设备已删除。', 'ok');
          } catch (error) {
            setStatus('device-status', error.message, 'warn');
          }
        }

        function renderDeviceList() {
          deviceList.innerHTML = '';
          if (!state.devices.length) {
            deviceList.innerHTML = '<div class="empty">当前还没有设备。你可以等待 MQTT 自动发现，或先在上方手动添加一个设备。</div>';
            return;
          }

          state.devices.forEach((device) => {
            const status = normalizeDeviceStatus(device, null);
            const row = document.createElement('div');
            row.className = 'device-row';

            const selectBtn = document.createElement('button');
            selectBtn.type = 'button';
            selectBtn.className = 'device-item' + (state.selectedDeviceId === device.deviceId ? ' active' : '');
            selectBtn.innerHTML = '' +
              '<div class="device-name">' +
                '<strong>' + escapeHtml(device.name) + '</strong>' +
                '<span class="state-dot ' + status.className + '">' + status.text + '</span>' +
              '</div>' +
              '<div class="device-meta">' + escapeHtml(device.deviceId) + ' · ' + escapeHtml(device.tenant) + '/' + escapeHtml(device.site) + '</div>';
            selectBtn.addEventListener('click', () => selectDevice(device.deviceId));

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'secondary device-delete';
            delBtn.textContent = '删除';
            delBtn.setAttribute('aria-label', '删除设备 ' + device.deviceId);
            delBtn.addEventListener('click', (event) => {
              event.stopPropagation();
              void deleteDeviceRow(device);
            });

            row.appendChild(selectBtn);
            row.appendChild(delBtn);
            deviceList.appendChild(row);
          });
        }

        function renderCapabilities() {
          capabilityTags.innerHTML = '';
          if (!state.capabilities.length) {
            capabilityTags.innerHTML = '<span class="chip">尚无设备上报的能力（等待 capabilities/report）</span>';
            return;
          }

          state.capabilities.forEach((capability) => {
            const chip = document.createElement('span');
            chip.className = 'chip';
            chip.textContent = (capability.displayName || capability.capability) + ' · ' + capability.capability;
            capabilityTags.appendChild(chip);
          });
        }

        function fillCapabilityDescModal() {
          const capPre = document.getElementById('capability-desc-capabilities');
          const actBox = document.getElementById('capability-desc-actions');
          setStatus('capability-desc-exec-status', '');
          if (!capPre || !actBox) return;

          if (!state.selectedDeviceId) {
            capPre.textContent = '请先选择设备。';
            actBox.innerHTML = '';
            return;
          }

          capPre.textContent = JSON.stringify(state.capabilities, null, 2);
          actBox.innerHTML = '';

          if (!state.actions.length) {
            actBox.innerHTML = '<p class="meta">暂无可用动作。请确认设备已通过 <code>capabilities/report</code> 上报 <code>actions</code>，或已在平台侧补全动作映射。</p>';
            return;
          }

          state.actions.forEach((action) => {
            const wrap = document.createElement('div');
            wrap.className = 'capability-action-row';

            const head = document.createElement('div');
            head.className = 'row-head';

            const title = document.createElement('div');
            title.innerHTML = '<strong>' + escapeHtml(action.actionName) + '</strong> → <code>' + escapeHtml(action.commandName) + '</code>';

            const execBtn = document.createElement('button');
            execBtn.type = 'button';
            execBtn.className = 'primary';
            execBtn.textContent = '执行';

            head.appendChild(title);
            head.appendChild(execBtn);

            const label = document.createElement('label');
            label.className = 'meta';
            label.style.display = 'grid';
            label.style.gap = '6px';

            const schemaHint = document.createElement('div');
            schemaHint.className = 'meta';
            schemaHint.style.whiteSpace = 'pre-wrap';
            const argsSchema = action.argsSchema && typeof action.argsSchema === 'object' ? action.argsSchema : {};
            const schemaKeys = argsSchema.properties && typeof argsSchema.properties === 'object'
              ? Object.keys(argsSchema.properties)
              : [];
            if (schemaKeys.length) {
              schemaHint.textContent = '参数定义: ' + JSON.stringify(argsSchema, null, 2);
            } else {
              schemaHint.textContent = '参数定义: 未上报，将直接透传参数 JSON。';
            }

            const ta = document.createElement('textarea');
            ta.className = 'action-args-input';
            ta.rows = 3;
            ta.value = buildActionArgsExample(action);
            label.appendChild(document.createTextNode('参数 JSON'));
            label.appendChild(ta);

            wrap.appendChild(head);
            wrap.appendChild(schemaHint);
            wrap.appendChild(label);
            actBox.appendChild(wrap);

            execBtn.addEventListener('click', async () => {
              let args = {};
              try {
                args = safeJsonParse(ta.value, {});
              } catch {
                setStatus('capability-desc-exec-status', '参数 JSON 无法解析', 'warn');
                return;
              }
              try {
                const result = await api(
                  '/api/devices/' +
                    encodeURIComponent(state.selectedDeviceId) +
                    '/actions/' +
                    encodeURIComponent(String(action.actionName)) +
                    '/execute',
                  {
                    method: 'POST',
                    body: JSON.stringify({
                      requestedBy: 'web-ui',
                      args,
                      confirmed: true,
                    }),
                  },
                );
                setStatus('capability-desc-exec-status', '已提交，命令号：' + result.command.commandId, 'ok');
                renderPrettyJson(deviceData, result);
              } catch (error) {
                setStatus('capability-desc-exec-status', error.message, 'warn');
              }
            });
          });
        }

        async function loadDevices() {
          const query = searchInput.value.trim();
          state.query = query;
          const params = new URLSearchParams({ limit: '100' });
          if (query) params.set('query', query);
          const payload = await api('/api/devices?' + params.toString());
          state.devices = payload.items || [];

          if (!state.devices.some((device) => device.deviceId === state.selectedDeviceId)) {
            state.selectedDeviceId = state.devices[0] ? state.devices[0].deviceId : null;
          }

          renderDeviceList();

          if (state.selectedDeviceId) {
            await selectDevice(state.selectedDeviceId);
          } else {
            overview.innerHTML = '<div class="empty">请选择设备后查看详情。</div>';
            renderPrettyJson(deviceData, { message: '暂无设备数据' });
            capabilityTags.innerHTML = '';
          }
        }

        async function selectDevice(deviceId) {
          state.selectedDeviceId = deviceId;
          renderDeviceList();
          const device = await api('/api/devices/' + encodeURIComponent(deviceId));
          const [capabilities, actions, statePayload] = await Promise.all([
            api('/api/devices/' + encodeURIComponent(deviceId) + '/capabilities'),
            api('/api/devices/' + encodeURIComponent(deviceId) + '/actions'),
            device.status === 'registered'
              ? Promise.resolve(null)
              : api('/api/device-states/' + encodeURIComponent(deviceId)).catch(() => null),
          ]);

          state.capabilities = capabilities.items || [];
          state.actions = actions.items || [];
          const deviceStatus = normalizeDeviceStatus(device, statePayload);
          const statusSummary = statePayload?.summary || (device.status === 'registered' ? '设备已手动注册，等待 MQTT 上报。' : device.status);

          overview.innerHTML = '' +
            '<div class="overview-grid">' +
              '<div class="overview-item"><small>设备名称</small><strong>' + device.name + '</strong></div>' +
              '<div class="overview-item"><small>在线状态</small><strong>' + deviceStatus.text + '</strong></div>' +
              '<div class="overview-item"><small>设备 ID</small><strong>' + device.deviceId + '</strong></div>' +
              '<div class="overview-item"><small>最近活动</small><strong>' + formatTime(device.lastSeenAt || statePayload?.updatedAt) + '</strong></div>' +
            '</div>' +
            '<div class="chips" style="margin-top: 14px;">' +
              '<span class="chip">租户：' + device.tenant + '</span>' +
              '<span class="chip">站点：' + device.site + '</span>' +
              '<span class="chip">产品类型：' + device.productType + '</span>' +
              '<span class="chip">状态：' + statusSummary + '</span>' +
            '</div>';

          renderCapabilities();
          renderPrettyJson(deviceData, {
            device,
            state: statePayload,
            capabilities: state.capabilities,
            actions: state.actions,
          });
        }

        searchForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          try {
            await loadDevices();
            setStatus('device-status', '设备列表已刷新。', 'ok');
          } catch (error) {
            setStatus('device-status', error.message, 'warn');
          }
        });

        document.getElementById('refresh-devices').addEventListener('click', async () => {
          try {
            await loadDevices();
            setStatus('device-status', '设备列表已刷新。', 'ok');
          } catch (error) {
            setStatus('device-status', error.message, 'warn');
          }
        });

        registerForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          try {
            const payload = Object.fromEntries(new FormData(registerForm).entries());
            payload.metadata = safeJsonParse(payload.metadata, {});
            const device = await api('/api/devices', {
              method: 'POST',
              body: JSON.stringify(payload),
            });
            if (!searchInput.value.trim()) {
              searchInput.value = '';
            }
            registerForm.elements.deviceId.value = '';
            registerForm.elements.name.value = '';
            registerForm.elements.productType.value = '';
            registerForm.elements.metadata.value = '{\\n  "source": "manual"\\n}';
            await loadRegistrationDefaults();
            await loadDevices();
            if (device?.deviceId) {
              await selectDevice(device.deviceId);
            }
            closeModal('modal-register');
            setStatus('register-status', '设备已手动注册。设备上线后可查看能力说明或下发命令。', 'ok');
            setStatus('device-status', '设备列表已刷新，并已选中新建设备。', 'ok');
          } catch (error) {
            setStatus('register-status', error.message, 'warn');
          }
        });

        document.getElementById('btn-capability-desc').addEventListener('click', () => {
          fillCapabilityDescModal();
          openModal('modal-capability-desc');
        });

        const telemetryPreset = document.getElementById('telemetry-range-preset');
        const telemetryCustomRow = document.getElementById('telemetry-custom-row');
        const telemetryHistoryPre = document.getElementById('telemetry-history-pre');

        function telemetryPresetToMs(preset) {
          if (preset === '1h') return 3600000;
          if (preset === '24h') return 86400000;
          if (preset === '7d') return 7 * 86400000;
          return 86400000;
        }

        function resolveTelemetryRange() {
          const preset = telemetryPreset.value;
          const end = new Date();
          if (preset === 'custom') {
            const s = document.getElementById('telemetry-start').value;
            const e = document.getElementById('telemetry-end').value;
            if (!s || !e) {
              throw new Error('请选择自定义开始与结束时间');
            }
            const start = new Date(s);
            const endDate = new Date(e);
            if (!Number.isFinite(start.getTime()) || !Number.isFinite(endDate.getTime())) {
              throw new Error('时间无效');
            }
            return { start, end: endDate };
          }
          const ms = telemetryPresetToMs(preset);
          return { start: new Date(end.getTime() - ms), end };
        }

        async function loadTelemetryHistory() {
          setStatus('telemetry-history-status', '');
          if (!state.selectedDeviceId) {
            telemetryHistoryPre.textContent = JSON.stringify({ message: '请先选择设备' }, null, 2);
            setStatus('telemetry-history-status', '请先在左侧选择设备。', 'warn');
            return;
          }
          try {
            const range = resolveTelemetryRange();
            const params = new URLSearchParams();
            params.set('start', range.start.toISOString());
            params.set('end', range.end.toISOString());
            params.set('limit', '500');
            const path =
              '/api/devices/' +
              encodeURIComponent(state.selectedDeviceId) +
              '/telemetry/history?' +
              params.toString();
            setStatus('telemetry-history-status', '查询中…', '');
            const data = await api(path);
            telemetryHistoryPre.textContent = JSON.stringify(data, null, 2);
            const n = (data.items && data.items.length) || 0;
            setStatus('telemetry-history-status', '已加载 ' + n + ' 条时序点（上限 500）。', 'ok');
          } catch (error) {
            telemetryHistoryPre.textContent = JSON.stringify({ error: error.message }, null, 2);
            setStatus('telemetry-history-status', error.message, 'warn');
          }
        }

        telemetryPreset.addEventListener('change', () => {
          const custom = telemetryPreset.value === 'custom';
          telemetryCustomRow.style.display = custom ? 'grid' : 'none';
        });

        document.getElementById('btn-telemetry-history').addEventListener('click', () => {
          openModal('modal-telemetry-history');
          void loadTelemetryHistory();
        });

        document.getElementById('telemetry-refresh').addEventListener('click', () => {
          void loadTelemetryHistory();
        });

        try {
          await loadRegistrationDefaults();
          await loadDevices();
        } catch (error) {
          setStatus('device-status', error.message, 'warn');
        }
      }

      if (page === 'home') {
        initHomePage();
      }
      if (page === 'settings') {
        initSettingsPage();
      }
      if (page === 'devices') {
        initDevicesPage();
      }
    </script>
  </body>
</html>`;
}

function getPageTitle(page: ControlPlanePage): string {
  switch (page) {
    case 'devices':
      return '设备管理 - iot-claw';
    case 'settings':
      return '系统设置 - iot-claw';
    default:
      return 'iot-claw 物联网控制中心';
  }
}

function renderPageBody(page: ControlPlanePage): string {
  switch (page) {
    case 'devices':
      return renderDevicesPage();
    case 'settings':
      return renderSettingsPage();
    default:
      return renderHomePage();
  }
}

function renderHomePage(): string {
  return `
    <section class="hero">
      <div class="hero-grid">
        <div class="hero-copy">
          <div class="hero-kicker">0.0.4 界面演进中</div>
          <h2 id="home-title">iot-claw 物联网控制中心</h2>
          <p id="home-subtitle">将设备接入、控制配置和运行态摘要汇聚到一个更清晰的中文控制台入口中。</p>
        </div>
        <aside class="hero-panel">
          <strong>本页定位</strong>
          <p>先看状态，再选择工作区。你可以从这里进入设备管理，或者进入系统设置维护当前控制面的基础参数。</p>
        </aside>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <h2 class="section-title">系统概览</h2>
          <p class="section-subtitle">适合首页快速扫读的运行态摘要。</p>
        </div>
        <div id="home-status" class="status"></div>
      </div>
      <div class="summary-grid">
        <article class="summary-card">
          <div class="label">HTTP 控制面</div>
          <div id="summary-service" class="value">--</div>
          <div id="summary-service-hint" class="hint">--</div>
        </article>
        <article class="summary-card">
          <div class="label">MQTT 连接状态</div>
          <div id="summary-mqtt" class="value">--</div>
          <div id="summary-mqtt-hint" class="hint">--</div>
        </article>
        <article class="summary-card">
          <div class="label">设备总数</div>
          <div id="summary-devices" class="value">--</div>
          <div id="summary-devices-hint" class="hint">--</div>
        </article>
        <article class="summary-card">
          <div class="label">最近设备活动</div>
          <div id="summary-last-seen" class="value">--</div>
          <div id="summary-last-seen-hint" class="hint">--</div>
        </article>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <h2 class="section-title">进入工作区</h2>
          <p class="section-subtitle">先选择任务入口，再进入对应的操作界面。</p>
        </div>
      </div>
      <div class="cards">
        <a class="card-link" href="/devices">
          <div class="eyebrow">设备工作台</div>
          <h3>设备管理</h3>
          <p>查看设备列表、浏览设备状态、查看设备上报的能力说明，并在同一工作区下发命令或查看原始数据。</p>
          <strong>进入设备管理 →</strong>
        </a>
        <a class="card-link" href="/settings">
          <div class="eyebrow">配置中心</div>
          <h3>系统设置</h3>
          <p>维护服务名称、界面标题、默认租户站点，以及 MQTT Broker、主题过滤器和连接参数。</p>
          <strong>进入系统设置 →</strong>
        </a>
      </div>
    </section>
  `;
}

function renderDevicesPage(): string {
  return `
    <section class="hero">
      <div class="hero-grid">
        <div class="hero-copy">
          <div class="hero-kicker">设备工作台</div>
          <h2>设备管理</h2>
          <p>左侧选择设备，右侧查看概览，并可打开能力说明（含上报能力与执行）或原始数据面板。</p>
        </div>
        <aside class="hero-panel">
          <strong>适用场景</strong>
          <p>用于日常设备巡检与配置，不必先接触 MQTT 原始细节即可完成大部分操作。</p>
        </aside>
      </div>
    </section>

    <section class="section">
      <div class="grid">
        <aside class="panel span-4 stack">
          <div>
            <h3>设备列表</h3>
            <p class="meta">支持自动发现，也支持手动注册后等待设备上报能力。</p>
            <form id="device-search-form" class="stack" style="margin-top: 12px;">
              <label>搜索设备
                <input id="device-query" name="query" placeholder="输入设备名称或设备 ID" />
              </label>
              <div class="button-row">
                <button type="submit">搜索</button>
                <button class="secondary" id="refresh-devices" type="button">刷新</button>
                <button class="secondary" type="button" data-open-modal="modal-register">＋ 添加设备</button>
              </div>
              <div id="device-status" class="status"></div>
            </form>
            <div id="device-list" class="device-list" style="margin-top: 12px;"></div>
          </div>
          <div>
            <h3 style="font-size: 15px; margin-bottom: 8px; color: var(--muted);">如何进入系统</h3>
            <ul class="hint-list">
              <li>方式一：设备通过 MQTT 自动上报，系统自动发现并建档。</li>
              <li>方式二：点击「＋ 添加设备」手动注册，待设备上报 capabilities/report 后即可在能力说明中查看。</li>
              <li>新建设备后，右侧会自动切换到该设备，便于继续配置。</li>
            </ul>
          </div>
        </aside>

        <section class="span-8 stack">
          <article class="panel stack">
            <div>
              <h3>设备概览</h3>
              <p class="meta">优先展示常用信息，按需打开操作面板。</p>
            </div>
            <div id="device-overview" class="empty">请选择左侧设备以查看详情。</div>
            <div id="capability-tags" class="chips"></div>
            <div class="action-buttons">
              <button class="secondary" type="button" id="btn-capability-desc">能力说明</button>
              <button class="secondary" type="button" id="btn-telemetry-history">上报数据</button>
              <button class="secondary" type="button" data-open-modal="modal-rawdata">原始数据</button>
            </div>
          </article>
        </section>
      </div>
    </section>

    <!-- Modal：手动添加设备 -->
    <div id="modal-register" class="modal-overlay" role="dialog" aria-modal="true">
      <div class="modal stack">
        <div class="modal-header">
          <h3>手动添加设备</h3>
          <button class="modal-close" type="button" data-close-modal="modal-register">✕</button>
        </div>
        <p class="meta">如果设备暂未接入 MQTT，可先注册设备档案。后续设备一旦上报，系统会自动补全运行状态。</p>
        <form id="device-register-form" class="stack">
          <div class="field-grid">
            <label>设备 ID
              <input name="deviceId" placeholder="例如 demo-device-001" required />
            </label>
            <label>设备名称
              <input name="name" placeholder="例如 演示设备 001" />
            </label>
            <label>租户
              <input name="tenant" required />
            </label>
            <label>站点
              <input name="site" required />
            </label>
            <label>设备类型
              <input name="productType" placeholder="例如 switch / sensor" />
            </label>
          </div>
          <label>附加信息 JSON
            <textarea name="metadata">{
  "source": "manual"
}</textarea>
          </label>
          <div class="button-row">
            <button type="submit">手动添加设备</button>
            <button class="secondary" type="button" data-close-modal="modal-register">取消</button>
          </div>
          <div id="register-status" class="status"></div>
        </form>
      </div>
    </div>

    <!-- Modal：能力说明（设备上报 + 下发命令） -->
    <div id="modal-capability-desc" class="modal-overlay" role="dialog" aria-modal="true">
      <div class="modal stack">
        <div class="modal-header">
          <h3>能力说明</h3>
          <button class="modal-close" type="button" data-close-modal="modal-capability-desc">✕</button>
        </div>
        <p class="meta">以下内容来自设备通过 <code>capabilities/report</code> 上报并由平台持久化后的记录（与 <code>GET /api/devices/.../capabilities</code>、<code>.../actions</code> 一致）。可在每条动作旁填写参数并执行，请求将经控制面进入命令与审批链路后下发到设备。</p>
        <div>
          <p class="meta" style="margin-bottom: 8px;"><strong>capabilities</strong>（设备声明的能力项）</p>
          <pre id="capability-desc-capabilities" class="capability-desc-pre">[]</pre>
        </div>
        <div>
          <p class="meta" style="margin-bottom: 8px;"><strong>actions</strong>（语义动作与底层命令；执行即向设备下发对应命令）</p>
          <div id="capability-desc-actions"></div>
        </div>
        <div id="capability-desc-exec-status" class="status"></div>
      </div>
    </div>

    <!-- Modal：Influx 历史上报 -->
    <div id="modal-telemetry-history" class="modal-overlay" role="dialog" aria-modal="true">
      <div class="modal stack">
        <div class="modal-header">
          <h3>历史上报数据</h3>
          <button class="modal-close" type="button" data-close-modal="modal-telemetry-history">✕</button>
        </div>
        <p class="meta">以下为 InfluxDB 中 <code>device_telemetry</code> 测量内的时序点（与 MQTT 遥测经平台写入的数据一致）。可按时间范围查询。</p>
        <div class="stack" style="margin-top: 4px;">
          <label>时间范围
            <select id="telemetry-range-preset">
              <option value="1h">最近 1 小时</option>
              <option value="24h" selected>最近 24 小时</option>
              <option value="7d">最近 7 天</option>
              <option value="custom">自定义起止时间</option>
            </select>
          </label>
          <div id="telemetry-custom-row" class="field-grid" style="display: none;">
            <label>开始时间
              <input type="datetime-local" id="telemetry-start" />
            </label>
            <label>结束时间
              <input type="datetime-local" id="telemetry-end" />
            </label>
          </div>
        </div>
        <div class="button-row">
          <button type="button" id="telemetry-refresh">查询</button>
          <button class="secondary" type="button" data-close-modal="modal-telemetry-history">关闭</button>
        </div>
        <div id="telemetry-history-status" class="status"></div>
        <pre id="telemetry-history-pre" class="telemetry-history-pre">{}</pre>
      </div>
    </div>

    <!-- Modal：设备原始数据 -->
    <div id="modal-rawdata" class="modal-overlay" role="dialog" aria-modal="true">
      <div class="modal stack">
        <div class="modal-header">
          <h3>设备原始数据</h3>
          <button class="modal-close" type="button" data-close-modal="modal-rawdata">✕</button>
        </div>
        <p class="meta">保留原始 JSON 视图，用于排障和核对字段。</p>
        <pre id="device-data">{
  "message": "请选择设备后查看原始数据"
}</pre>
      </div>
    </div>
  `;
}

function renderSettingsPage(): string {
  return `
    <section class="hero">
      <div class="hero-grid">
        <div class="hero-copy">
          <div class="hero-kicker">配置中心</div>
          <h2>系统设置</h2>
          <p>把服务元数据和 MQTT 连接参数集中到一个中文配置页中，保存后自动尝试把 MQTT 配置应用到当前运行时。</p>
        </div>
        <aside class="hero-panel">
          <strong>建议操作顺序</strong>
          <p>先维护服务名称和默认命名空间，再确认 MQTT Broker、Topic 过滤器与命令主题模板是否正确。</p>
        </aside>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <h2 class="section-title">运行状态</h2>
          <p class="section-subtitle">保存配置前后都可以在这里看到当前系统摘要。</p>
        </div>
      </div>
      <div id="settings-summary" class="chips"></div>
    </section>

    <section class="section">
      <div class="grid">
        <article class="panel span-6 stack">
          <div>
            <h3>基础服务设置</h3>
            <p class="meta">控制台标题、默认租户站点和管理员显示名。</p>
          </div>
          <form id="server-form" class="stack">
            <div class="field-grid">
              <label>服务名称
                <input name="serviceName" required />
              </label>
              <label>界面标题
                <input name="uiTitle" required />
              </label>
              <label>默认租户
                <input name="defaultTenant" required />
              </label>
              <label>默认站点
                <input name="defaultSite" required />
              </label>
              <label>管理员显示名
                <input name="adminDisplayName" required />
              </label>
              <label>API 令牌
                <input name="apiToken" placeholder="留空表示保持当前值" />
              </label>
            </div>
            <div class="button-row">
              <button type="submit">保存服务设置</button>
            </div>
            <div id="server-status" class="status"></div>
          </form>
        </article>

        <article class="panel span-6 stack">
          <div>
            <h3>MQTT 连接设置</h3>
            <p class="meta">保存后会自动尝试重新连接 MQTT 运行时。</p>
          </div>
          <form id="mqtt-form" class="stack">
            <div class="field-grid">
              <label>Broker 地址
                <input name="brokerUrl" required />
              </label>
              <label>客户端 ID
                <input name="clientId" required />
              </label>
              <label>用户名
                <input name="username" />
              </label>
              <label>密码
                <input name="password" type="password" placeholder="留空表示保持当前值" />
              </label>
              <label>主题过滤器
                <input name="topicFilter" required />
              </label>
              <label>命令主题模板
                <input name="commandTopicTemplate" required />
              </label>
              <label>心跳秒数
                <input name="keepaliveSeconds" type="number" min="1" required />
              </label>
              <label>连接方式
                <select name="tlsEnabled">
                  <option value="false">普通 MQTT</option>
                  <option value="true">TLS 加密</option>
                </select>
              </label>
              <label>连接开关
                <select name="enabled">
                  <option value="true">启用 MQTT</option>
                  <option value="false">暂停 MQTT</option>
                </select>
              </label>
            </div>
            <p id="mqtt-password-note" class="inline-note"></p>
            <div class="button-row">
              <button type="submit">保存 MQTT 设置</button>
            </div>
            <div id="mqtt-status" class="status"></div>
          </form>
        </article>
      </div>
    </section>
  `;
}
