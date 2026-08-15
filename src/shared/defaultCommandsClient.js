// defaultCommandsClient.js
// ES-module mirror of defaultCommands.js for the renderer.

export const DEFAULT_COMMAND_SETS = {
  RDM: {
    name: 'Remote Desktop Manager',
    process: 'RemoteDesktopManager.exe',
    processes: ['RemoteDesktopManager.exe', 'mstsc.exe', 'putty.exe', 'kitty.exe', 'SecureCRT.exe', 'Tabby.exe'],
    keywords: ['RDM', 'REMOTE', 'DESKTOP', 'TABBY', 'MSTS', 'PUTTY', 'KITTY', 'SECURT', 'SSH'],
    submodes: {
      AP: {
        name: 'AP',
        groups: {
          'AP Monitoring': [
            { label: 'Check AP Status', template: 'display ap all | include {sr_ap}\n', popup: null, autoFocus: true },
            { label: 'Check Station Use', template: 'display station all | include {sr_ap}\n', popup: null, autoFocus: true },
            { label: 'AP Address Info', template: 'display ap-address-info\n', popup: null, autoFocus: true },
          ],
          'AP Configuration': [
            { label: 'System View -> Wlan', template: 'system-view\nwlan\n', popup: null, autoFocus: true },
            { label: 'AP Regroup', template: 'ap-regroup ap-id {group_id} new-group {group_name}\n', popup: null, autoFocus: true },
            { label: 'Reset AP', template: 'ap-reset ap-id {group_id}\n', popup: null, autoFocus: true },
            { label: 'Delete AP', template: 'undo ap ap-id {group_id}\n', popup: null, autoFocus: true },
            { label: 'Yes', template: 'y\n', popup: null, autoFocus: true },
            { label: 'No', template: 'n\n', popup: null, autoFocus: true },
          ],
          'Access Control': [
            { label: 'Stelnet Access', template: 'stelnet {stelnet_ip}\n', popup: null, autoFocus: true },
            { label: 'Admin User', template: '{admin_user}\n', popup: null, autoFocus: true },
            { label: 'Quit', template: 'quit\n', popup: null, autoFocus: true },
          ],
        },
      },
      ONU: {
        name: 'ONU',
        groups: {
          'ONU Monitoring': [
            { label: 'Vlan', template: 'show vlan {vlan}\n', popup: null, autoFocus: true },
            { label: 'IP Remote Host', template: 'show gpon remote-onu ip-host gpon-onu_{port}\n', popup: null, autoFocus: true },
            { label: 'ONU Detail Info', template: 'show gpon onu detail-info gpon-onu_{port}\n', popup: null, autoFocus: true },
            { label: 'PON Power (Light Value)', template: 'show pon power attenuation gpon-onu_{port}\n', popup: null, autoFocus: true },
            { label: 'State OLT', template: 'show gpon onu state gpon-olt_{olt}\n', popup: null, autoFocus: true },
            { label: 'Unconfig ONU', template: 'show gpon onu uncfg\n', popup: null, autoFocus: true },
            { label: 'Running Config OLT', template: 'sh running-config interface gpon-olt_{olt}\n', popup: null, autoFocus: true },
            { label: 'Running Config ONU', template: 'sh running-config interface gpon-onu_{port}\n', popup: null, autoFocus: true },
            { label: 'Global Running Config', template: 'sh onu running config gpon-onu_{port}\n', popup: null, autoFocus: true },
            { label: 'Exit', template: 'exit\n', popup: null, autoFocus: true },
          ],
          'ONU Provisioning': [
            { label: 'Config Terminal', template: 'config terminal\n', popup: null, autoFocus: true },
            { label: 'Interface OLT', template: 'interface gpon-olt_{olt}\n', popup: null, autoFocus: true },
            { label: '[M] Interface ONU', template: 'interface gpon-onu_{port}\n', popup: null, autoFocus: true },
            { label: '[M] ONU Management', template: 'pon-onu-mng gpon-onu_{port}\n', popup: null, autoFocus: true },
            {
              label: '[Full] MDES 10M',
              template:
                'interface gpon-onu_{port}\nname {sr_onu}\ntcont {tcont} name MDES profile {profile_in}\ngemport {gemport} name MDES tcont {tcont}\ntraffic-profile {profile_out} vport 1 direction egress\nservice-port 1 vport 1 user-vlan {user_vlan} vlan {vlan}\nexit\n',
              popup: 'full',
              autoFocus: true,
            },
            {
              label: '[Full] UNLIMITED',
              template:
                'interface gpon-onu_{port}\nname {sr_onu}\ntcont {tcont} name MDES profile {unlimited_up_profile}\ngemport {gemport} name MDES tcont {tcont}\ngemport {gemport} traffic-limit downstream {unlimited_down_profile}\nservice-port 1 vport 1 user-vlan {user_vlan} vlan {vlan}\nexit\n',
              popup: 'full',
              autoFocus: true,
            },
            {
              label: '[Full] Mng Logic',
              template:
                'pon-onu-mng gpon-onu_{port}\nservice MDES gemport {gemport} vlan {user_vlan}\nsecurity-mgmt 1 state enable mode forward\nsecurity-mgmt 2 state enable mode discard ingress-type wan protocol telnet\nsecurity-mgmt 3 state enable mode discard ingress-type lan protocol telnet\nfirewall enable level low anti-hack disable\nmgmt-ip {ce_ip} {mgmt_subnet} vlan {user_vlan} priority {mgmt_priority} route {mgmt_route} {pe_ip} host {mgmt_host}\nexit\n',
              popup: 'full',
              autoFocus: true,
            },
            { label: 'Delete ONU (Port Extract)', template: 'no onu {onu_idx}\n', popup: null, autoFocus: true },
            { label: 'Exit', template: 'exit\n', popup: null, autoFocus: true },
          ],
        },
      },
      SWITCH: {
        name: 'Switch',
        groups: {
          'Switch Monitoring': [
            { label: 'Show Temperature', template: 'show temperature\n', popup: null, autoFocus: true },
            { label: 'Board Info', template: 'show board-info\n', popup: null, autoFocus: true },
          ],
        },
      },
    },
  },
  LINE: {
    name: 'LINE',
    process: 'LINE.exe',
    processes: ['LINE.exe', 'Line.exe'],
    keywords: ['LINE'],
    submodes: {
      DEFAULT: {
        name: 'Messages',
        groups: {
          'Line Messaging': [
            { label: 'All Online', template: '{sr_ap} All Online ครับ\n', popup: null, autoFocus: true },
            { label: 'ขอ SR ใหม่', template: 'รบกวนขอ SR ใหม่หน่อยครับไม่เจอ SR ที่ให้มาครับ\n', popup: null, autoFocus: true },
            { label: 'Online', template: ' ✅ Online', popup: null, autoFocus: true },
            { label: 'Offline', template: ' ❌ Offline', popup: null, autoFocus: true },
            { label: 'AP Offline', template: ' ❌ AP Offline', popup: null, autoFocus: true },
            { label: 'ได้อยู่หน้าไซต์ไหมครับ', template: 'ได้อยู่หน้าไซต์ไหมครับ\n', popup: null, autoFocus: true },
            { label: 'หน้างานใช้ได้ไหมครับ', template: 'หน้างานใช้ได้ไหมครับ\n', popup: null, autoFocus: true },
            { label: 'ตอนนี้ใช้ได้ไหมครับ', template: 'ตอนนี้ใช้ได้ไหมครับ\n', popup: null, autoFocus: true },
            { label: 'รอสถาณะสักครู่ครับ', template: 'รอสถาณะสักครู่ครับ\n', popup: null, autoFocus: true },
            { label: 'LAN 1000 ครับ', template: 'LAN 1000 ครับ\n', popup: null, autoFocus: true },
            { label: 'LAN 100 ครับ', template: 'LAN 100 ครับ\n', popup: null, autoFocus: true },
            { label: 'LAN 10 ครับ', template: 'LAN 10 ครับ\n', popup: null, autoFocus: true },
            { label: 'รอรีเฟรช AP สักครู่ครับ', template: 'รอรีเฟรช AP สักครู่ครับ\n', popup: null, autoFocus: true },
            { label: 'รอย้าย group AP สักครู่ครับ', template: 'รอย้าย group AP สักครู่ครับ\n', popup: null, autoFocus: true },
            { label: 'รอ config AP สักครู่ครับ', template: 'รอ config AP สักครู่ครับ\n', popup: null, autoFocus: true },
            { label: 'รอย้าย AP ขึ้น main สักครู่ครับ', template: 'รอย้าย AP ขึ้น main สักครู่ครับ\n', popup: null, autoFocus: true },
            {
              label: 'Config ONU เรียบร้อยครับ รีบูท ONU ต่อ LAN AP ครับ',
              template: 'Config ONU เรียบร้อยครับ รีบูท ONU ต่อ LAN AP ครับ\n',
              popup: null,
              autoFocus: true,
            },
            { label: 'รบกวนขอ SN ONU หน่อยครับ', template: 'รบกวนขอ SN ONU หน่อยครับ\n', popup: null, autoFocus: true },
            { label: 'รบกวนรีเฟ็ก AP', template: 'รบกวนรีเฟ็ก AP และรีไซต์ให้หน่อยครับ\n', popup: null, autoFocus: true },
            { label: 'รบกวนรีเฟ็ก ONU', template: 'รบกวนรีเฟ็ก ONU และรีไซต์ให้หน่อยครับ\n', popup: null, autoFocus: true },
            { label: 'AnyDesk', template: 'รบกวนขอ AnyDesk หน่อยครับ\n', popup: null, autoFocus: true },
            {
              label: 'รบกวนแจ้ง Help ครับ เนื่องจาก AP on Back UP ครับ',
              template: 'รบกวนแจ้ง Help ครับ เนื่องจาก AP on BackUP ครับ\n',
              popup: null,
              autoFocus: true,
            },
            {
              label: 'รบกวนแจ้ง help เนื่องจาก ONU WAN ไม่มา',
              template: 'รบกวนแจ้ง help config onu, lan เนื่องจาก ONU WAN ไม่มาครับ\n',
              popup: null,
              autoFocus: true,
            },
            {
              label: 'รบกวนแจ้ง help wan มา เข้า gui ไม่ได้',
              template: '{sr_onu} รบกวนแจ้ง help config onu, lan ครับ wan มาแล้ว แต่เข้า gui onu ไม่ได้ครับ\n',
              popup: null,
              autoFocus: true,
            },
          ],
        },
      },
    },
  },
  WINDOWS_CMD: {
    name: 'Windows CMD / Terminal',
    process: 'cmd.exe',
    processes: ['cmd.exe', 'powershell.exe', 'pwsh.exe', 'WindowsTerminal.exe', 'conhost.exe'],
    keywords: ['CMD', 'TERMINAL', 'POWERSHELL', 'COMMAND PROMPT', 'WINDOWS TERMINAL'],
    submodes: {
      DEFAULT: {
        name: 'Terminal',
        groups: {
          'Windows Terminal Tools': [
            { label: 'Ping Host', template: 'ping ', popup: null, autoFocus: true },
            { label: 'Continuous (-t)', template: ' -t\n', popup: null, autoFocus: true },
            { label: 'Clear', template: 'cls\n', popup: null, autoFocus: true },
          ],
          'Ping Access': [
            { label: 'Ping AP', template: 'ping {stelnet_ip} -t\n', popup: null, autoFocus: true },
            { label: '[ONU] Ping CE', template: 'ping {ce_ip} -t\n', popup: null, autoFocus: true },
            { label: '[ONU] Ping LAN', template: 'ping {lan_ip} -t\n', popup: null, autoFocus: true },
          ],
        },
      },
    },
  },
  FORTI_CLIENT: {
    name: 'FortiClient',
    process: 'FortiClient.exe',
    processes: ['FortiClient.exe', 'FortiSSLVPN.exe', 'FortiClientConsole.exe'],
    keywords: ['FORTI', 'FORTICLIENT', 'VPN'],
    submodes: {
      DEFAULT: {
        name: 'Account',
        groups: {
          Account: [{ label: 'Login Profile', template: '{fcvpn_user}\n{fcvpn_pass}\n', popup: null, autoFocus: true }],
        },
      },
    },
  },
  BROWSER: {
    name: 'Web Browser / Config',
    process: 'chrome.exe',
    processes: ['chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe', 'AnyDesk.exe'],
    keywords: ['CHROME', 'EDGE', 'MSEDGE', 'FIREFOX', 'ANYDESK', 'BROWSER', 'GOOGLE CHROME', 'MICROSOFT EDGE'],
    submodes: {
      DEFAULT: {
        name: 'Web Access',
        groups: {
          'LAN Configuration': [
            {
              label: 'Blue Config (ProComm)',
              template: '{lan_ip}\t{subnetmask29}\t{lan_ip_1}\t{lan_ip_2}\t{lan_ip}',
              popup: null,
              autoFocus: true,
            },
            {
              label: 'Green Config (One-shot)',
              template: '{lan_ip}\t{subnetmask29}\t\t{lan_ip_1}\t{lan_ip_2}\t\t{lan_ip}\t\t\t{lan_ip}',
              popup: null,
              autoFocus: true,
            },
          ],
          'Login [No Captcha]': [
            { label: 'TOT', template: '{tot_user}\t{tot_pass}\n', popup: null, autoFocus: true },
            { label: 'Admin', template: '{admin_user}\t{admin_pass}\n', popup: null, autoFocus: true },
          ],
          'Login [Have Captcha]': [
            { label: '[Captcha] TOT', template: '{tot_user}\t{tot_pass}\t{captcha}\n', popup: null, autoFocus: true },
            { label: '[Captcha] Admin', template: '{admin_user}\t{admin_pass}\t{captcha}\n', popup: null, autoFocus: true },
          ],
        },
      },
    },
  },
};

export const DEFAULT_VARIABLES = [
  { key: 'sr_ap', label: 'SR (AP)', description: 'Service Request for AP', dataType: 'String' },
  { key: 'group_id', label: 'Group ID (AP)', description: 'AP Group Identifier', dataType: 'String' },
  { key: 'group_name', label: 'Group Name', description: 'AP Group Name', dataType: 'String' },
  { key: 'stelnet_ip', label: 'Stelnet IP', description: 'Stelnet Management IP', dataType: 'IP' },
  { key: 'port', label: 'Port (OLT)', description: 'slot/card/port:onu_idx format (e.g. 1/1/1:5)', dataType: 'Port' },
  { key: 'olt', label: 'OLT Port', description: 'OLT base port (e.g. 1/1/1)', formula: '{\n  olt = port.split(":", 0)\n}', dataType: 'Port' },
  { key: 'onu_idx', label: 'ONU Index', description: 'ONU Index (e.g. 5)', formula: '{\n  onu_idx = port.split(":", 1)\n}', dataType: 'Number' },
  { key: 'sr_onu', label: 'SR (ONU)', description: 'Service Request for ONU', dataType: 'String' },
  { key: 'vlan', label: 'VLAN', description: 'VLAN Identifier (e.g. 120)', dataType: 'Number' },
  { key: 'user_vlan', label: 'User VLAN', description: 'User VLAN for Service Port', default_value: '10', dataType: 'Number' },
  { key: 'ce_ip', label: 'CE IP', description: 'Customer Edge IP', dataType: 'IP' },
  { key: 'pe_ip', label: 'PE IP', description: 'Provider Edge IP', dataType: 'IP' },
  { key: 'lan_ip', label: 'LAN IP', description: 'LAN Network Base IP (e.g. 192.168.1.0)', dataType: 'IP' },
  { key: 'lan_ip_1', label: 'LAN IP 1', description: 'First Usable IP (Host 1)', formula: '{\n  array[] = lan_ip.split(".")\n  array[3] = toint(array[3]) + 1\n  lan_ip_1 = array[0] + "." + array[1] + "." + array[2] + "." + tostring(array[3])\n}', dataType: 'IP' },
  { key: 'lan_ip_2', label: 'LAN IP 2', description: 'Second Usable IP (Host 2)', formula: '{\n  array[] = lan_ip.split(".")\n  array[3] = toint(array[3]) + 2\n  lan_ip_2 = array[0] + "." + array[1] + "." + array[2] + "." + tostring(array[3])\n}', dataType: 'IP' },
  { key: 'subnetmask29', label: 'Subnet Mask (/29)', description: 'LAN Subnet Mask /29', default_value: '255.255.255.248', dataType: 'IP' },
  { key: 'mgmt_subnet', label: 'Mgmt Subnet (/30)', description: 'Management Subnet Mask /30', default_value: '255.255.255.252', dataType: 'IP' },
  { key: 'mgmt_route', label: 'Mgmt Route', description: 'Default Route Prefix & Mask', default_value: '0.0.0.0 0.0.0.0', dataType: 'String' },
  { key: 'mgmt_priority', label: 'Mgmt Priority', description: 'Management VLAN Priority', default_value: '0', dataType: 'Number' },
  { key: 'mgmt_host', label: 'Mgmt Host', description: 'Management Host Index', default_value: '1', dataType: 'Number' },
  { key: 'tcont', label: 'TCONT ID', description: 'TCONT Identifier', default_value: '1', dataType: 'Number' },
  { key: 'gemport', label: 'Gemport ID', description: 'Gemport Identifier', default_value: '1', dataType: 'Number' },
  { key: 'profile_in', label: 'Profile IN (MDES)', description: 'Traffic Profile Inbound', default_value: 'MDES-10M-IN', dataType: 'String' },
  { key: 'profile_out', label: 'Profile OUT (MDES)', description: 'Traffic Profile Outbound', default_value: 'MDES-30M-OUT', dataType: 'String' },
  { key: 'unlimited_up_profile', label: 'Profile UP (Unlimited)', description: 'Unlimited Up Profile Name', default_value: 'UNLIMITED_UP', dataType: 'String' },
  { key: 'unlimited_down_profile', label: 'Limit DOWN (Unlimited)', description: 'Unlimited Down Traffic Limit', default_value: 'UNLIMITED_DOWN', dataType: 'String' },
  { key: 'admin_user', label: 'Admin User', description: 'Admin Username', default_value: 'admin', dataType: 'String' },
  { key: 'admin_pass', label: 'Admin Password', description: 'Admin Password', default_value: 'admin', dataType: 'String', hidden: true, locked: true },
  { key: 'tot_user', label: 'TOT User', description: 'TOT Username', default_value: 'tot', dataType: 'String' },
  { key: 'tot_pass', label: 'TOT Password', description: 'TOT Password', default_value: 'tot', dataType: 'String', hidden: true, locked: true },
  { key: 'fcvpn_user', label: 'FortiClient User', description: 'FortiClient VPN Username', default_value: 'admin', dataType: 'String' },
  { key: 'fcvpn_pass', label: 'FortiClient Password', description: 'FortiClient VPN Password', default_value: 'admin', dataType: 'String', hidden: true, locked: true },
  { key: 'captcha', label: 'Captcha', description: 'Login Captcha Code', dataType: 'String' },
];

const OBSOLETE_KEYS = new Set([
  'lan_mask',
  'mask',
  'cred_ap_pass_old',
  'cred_ap_pass_new',
  'lan_ip+1',
  'lan_ip+2',
  'lan_ip:tab',
  'lan_ip:blue',
  'lan_ip:blue_full',
  'lan_mask:tab',
  'lan_ip+1:tab',
]);

function upgradeTemplateTokens(tmpl) {
  if (typeof tmpl !== 'string') return tmpl;
  return tmpl
    .replace(/\{lan_ip:blue_full\}/g, '{lan_ip}\t{subnetmask29}\t{lan_ip_1}\t{lan_ip_2}\t{lan_ip}')
    .replace(/\{lan_ip:blue\}/g, '{lan_ip}')
    .replace(/\{lan_ip:tab\}/g, '{lan_ip}')
    .replace(/\{lan_mask:tab\}/g, '{subnetmask29}')
    .replace(/\{lan_ip\+1:tab\}/g, '{lan_ip_1}')
    .replace(/\{lan_ip\+1\}/g, '{lan_ip_1}')
    .replace(/\{lan_ip\+2\}/g, '{lan_ip_2}')
    .replace(/\{lan_mask\}/g, '{subnetmask29}')
    .replace(/\{mask\}/g, '{subnetmask29}')
    .replace(/\{cred_ap_pass_old\}/g, '')
    .replace(/\{cred_ap_pass_new\}/g, '');
}

export function normalizeVariables(stored) {
  if (!Array.isArray(stored) || stored.length === 0) return DEFAULT_VARIABLES;

  const keyMap = new Map();
  stored.forEach((v) => {
    if (v && v.key && !OBSOLETE_KEYS.has(v.key)) {
      keyMap.set(v.key, {
        key: v.key,
        label: v.label || v.key,
        description: v.description || '',
        locked: !!v.locked,
        hidden: !!v.hidden,
        formula: v.formula || null,
        dataType: v.dataType || 'String',
        default_value: v.default_value !== undefined ? v.default_value : null,
      });
    }
  });

  // Ensure any missing default variables are appended
  DEFAULT_VARIABLES.forEach((def) => {
    if (!keyMap.has(def.key)) {
      keyMap.set(def.key, { ...def });
    }
  });

  return Array.from(keyMap.values());
}

export function normalizeCommandSets(stored) {
  if (!stored || typeof stored !== 'object') return DEFAULT_COMMAND_SETS;

  const firstVal = Object.values(stored)[0];
  let result = stored;
  if (!firstVal || !firstVal.submodes) {
    // Legacy format conversion
    result = JSON.parse(JSON.stringify(DEFAULT_COMMAND_SETS));
    for (const [key, groups] of Object.entries(stored)) {
      if (key.startsWith('RDM_')) {
        const sub = key.replace('RDM_', '');
        if (result.RDM && result.RDM.submodes[sub]) {
          result.RDM.submodes[sub].groups = groups;
        }
      } else if (result[key]) {
        const firstSub = Object.keys(result[key].submodes)[0];
        if (firstSub) {
          result[key].submodes[firstSub].groups = groups;
        }
      }
    }
  }

  // Ensure default apps have their process/processes/keywords populated if missing
  Object.entries(DEFAULT_COMMAND_SETS).forEach(([key, defApp]) => {
    if (!result[key]) {
      result[key] = JSON.parse(JSON.stringify(defApp));
    } else {
      if (!result[key].process && defApp.process) result[key].process = defApp.process;
      if (!result[key].processes && defApp.processes) result[key].processes = [...defApp.processes];
      if (!result[key].keywords && defApp.keywords) result[key].keywords = [...defApp.keywords];
    }
  });

  // Upgrade legacy template tokens across all command sets
  Object.values(result).forEach((app) => {
    if (app && app.submodes) {
      Object.values(app.submodes).forEach((sub) => {
        if (sub && sub.groups) {
          Object.values(sub.groups).forEach((cmdList) => {
            (cmdList || []).forEach((cmd) => {
              if (cmd && cmd.template) {
                cmd.template = upgradeTemplateTokens(cmd.template);
              }
            });
          });
        }
      });
    }
  });

  return result;
}
