// defaultCommands.js
// Standard command sets and default variables for FE Macro Console.

const DEFAULT_COMMAND_SETS = {
  RDM: {
    name: 'Remote Desktop Manager',
    process: 'RemoteDesktopManager.exe',
    keywords: ['RDM', 'REMOTE', 'DESKTOP', 'TABBY', 'MSTS'],
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
            { label: 'Admin User', template: 'admin\n', popup: null, autoFocus: true },
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
                'interface gpon-onu_{port}\nname {sr_onu}\ntcont 1 name MDES profile MDES-10M-IN\ngemport 1 name MDES tcont 1\ntraffic-profile MDES-30M-OUT vport 1 direction egress\nservice-port 1 vport 1 user-vlan 10 vlan {vlan}\nexit\n',
              popup: 'full',
              autoFocus: true,
            },
            {
              label: '[Full] UNLIMITED',
              template:
                'interface gpon-onu_{port}\nname {sr_onu}\ntcont 1 name MDES profile UNLIMITED_UP\ngemport 1 name MDES tcont 1\ngemport 1 traffic-limit downstream UNLIMITED_DOWN\nservice-port 1 vport 1 user-vlan 10 vlan {vlan}\nexit\n',
              popup: 'full',
              autoFocus: true,
            },
            {
              label: '[Full] Mng Logic',
              template:
                'pon-onu-mng gpon-onu_{port}\nservice MDES gemport 1 vlan 10\nsecurity-mgmt 1 state enable mode forward\nsecurity-mgmt 2 state enable mode discard ingress-type wan protocol telnet\nsecurity-mgmt 3 state enable mode discard ingress-type lan protocol telnet\nfirewall enable level low anti-hack disable\nmgmt-ip {ce_ip} 255.255.255.252 vlan 10 priority 0 route 0.0.0.0 0.0.0.0 {pe_ip} host 1\nexit\n',
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
    keywords: ['CMD', 'TERMINAL', 'POWERSHELL'],
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
    keywords: ['FORTI'],
    submodes: {
      DEFAULT: {
        name: 'Account',
        groups: {
          Account: [{ label: 'Login Profile', template: 'admin\nadmin\n', popup: null, autoFocus: true }],
        },
      },
    },
  },
  BROWSER: {
    name: 'Web Browser / Config',
    process: 'chrome.exe',
    keywords: ['CHROME', 'EDGE', 'FIREFOX', 'ANYDESK'],
    submodes: {
      DEFAULT: {
        name: 'Web Access',
        groups: {
          'LAN Configuration': [
            {
              label: 'Blue Config (ProComm)',
              template: '{lan_ip:blue_full}',
              popup: null,
              autoFocus: true,
            },
            {
              label: 'Green Config (One-shot)',
              template: '{lan_ip}\t{lan_mask}\t\t{lan_ip+1}\t{lan_ip+2}\t\t{lan_ip}\t\t\t{lan_ip}',
              popup: null,
              autoFocus: true,
            },
          ],
          'Login [No Captcha]': [
            { label: 'TOT', template: 'tot\ttot\n', popup: null, autoFocus: true },
            { label: 'Admin', template: 'admin\tadmin\n', popup: null, autoFocus: true },
          ],
          'Login [Have Captcha]': [
            { label: '[Captcha] TOT', template: 'tot\ttot\t{captcha}\n', popup: null, autoFocus: true },
            { label: '[Captcha] Admin', template: 'admin\tadmin\t{captcha}\n', popup: null, autoFocus: true },
          ],
        },
      },
    },
  },
};

const DEFAULT_VARIABLES = [
  { key: 'sr_ap', label: 'SR Name (AP)', description: 'Service Request Name for AP' },
  { key: 'group_id', label: 'ID (AP)', description: 'Group ID for AP' },
  { key: 'group_name', label: 'Group Name (AP)', description: 'AP Group Name' },
  { key: 'stelnet_ip', label: 'Stelnet IP (AP)', description: 'Stelnet IP Address' },
  { key: 'lan_ip', label: 'LAN IP (Config)', description: 'LAN IP Address for router/device setup' },
  { key: 'sr_onu', label: 'SR Full Name (ONU)', description: 'Service Request Name for ONU' },
  { key: 'port', label: 'Port (1/1/1:x) (ONU)', description: 'OLT Port and ONU ID' },
  { key: 'vlan', label: 'VLAN (ONU)', description: 'VLAN ID' },
  { key: 'ce_ip', label: 'CE IP (ONU)', description: 'Customer Edge IP' },
  { key: 'pe_ip', label: 'PE IP (ONU)', description: 'Provider Edge IP' },
  { key: 'captcha', label: 'CAPTCHA (ID)', description: 'Browser Captcha / Login code' },
];

function normalizeVariables(stored) {
  if (!Array.isArray(stored) || stored.length === 0) return DEFAULT_VARIABLES;

  const keyMap = new Map();
  stored.forEach((v) => {
    if (v && v.key) {
      keyMap.set(v.key, {
        key: v.key,
        label: v.label || v.key,
        description: v.description || '',
      });
    }
  });

  // Ensure default variables are present
  DEFAULT_VARIABLES.forEach((def) => {
    if (!keyMap.has(def.key)) {
      keyMap.set(def.key, def);
    }
  });

  return Array.from(keyMap.values());
}

function normalizeCommandSets(stored) {
  if (!stored || typeof stored !== 'object') return DEFAULT_COMMAND_SETS;
  const firstVal = Object.values(stored)[0];
  if (firstVal && firstVal.submodes) {
    if (stored.BROWSER && stored.BROWSER.submodes && stored.BROWSER.submodes.DEFAULT) {
      const groups = stored.BROWSER.submodes.DEFAULT.groups;
      if (groups && !groups['LAN Configuration']) {
        groups['LAN Configuration'] = [
          { label: 'Blue Config (ProComm)', template: '{lan_ip:blue_full}', popup: null, autoFocus: true },
          { label: 'Green Config (One-shot)', template: '{lan_ip}\t{lan_mask}\t\t{lan_ip+1}\t{lan_ip+2}\t\t{lan_ip}\t\t\t{lan_ip}', popup: null, autoFocus: true },
        ];
      }
    }
    return stored;
  }

  // Legacy format conversion
  const result = JSON.parse(JSON.stringify(DEFAULT_COMMAND_SETS));
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
    } else {
      result[key] = {
        name: key,
        process: `${key}.exe`,
        keywords: [key],
        submodes: {
          DEFAULT: {
            name: 'Default',
            groups: groups,
          },
        },
      };
    }
  }
  return result;
}

module.exports = {
  DEFAULT_COMMAND_SETS,
  DEFAULT_VARIABLES,
  normalizeVariables,
  normalizeCommandSets,
};
