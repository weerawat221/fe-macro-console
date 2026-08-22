// i18n.js
// Centralized internationalization dictionary for FE Macro Console (Marcruro).
// Supports full Thai (TH) and English (EN) translations across all windows, tabs, and modals.

export const DICTIONARY = {
  th: {
    // Top Navigation & Header
    app_title: 'Marcruro',
    settings_title: 'การตั้งค่า',
    tab_apps: 'ชุดคำสั่ง (Apps)',
    tab_variables: 'ตัวแปร (Variables)',
    tab_view: 'มุมมอง (View)',
    btn_export: 'ส่งออกการตั้งค่าทั้งหมด',
    btn_import: 'นำเข้าไฟล์การตั้งค่า',
    btn_ocr_capture: 'บันทึกภาพหน้าจอ OCR (Alt+Shift+S)',
    btn_setting: 'เปิดหน้าการตั้งค่า',
    btn_filter_fields: 'ซ่อน/แสดงช่องว่าง',
    btn_clear_fields: 'ล้างข้อมูลช่องกรอกทั้งหมด',
    btn_auto_mover_title: 'เปิด/ปิด ระบบป้องกันการหลับ (Auto-Mover AFK)',
    
    // Status & Focus
    focus_target: 'หน้าต่างเป้าหมาย',
    focus_no_target: 'ยังไม่เลือกเป้าหมาย',
    status_idle: 'IDLE',
    status_active: 'ACTIVE',
    status_afk: 'AFK',
    status_jiggle: 'กำลังขยับเมาส์',

    // Main Window - Tabs & Fields
    tab_default: 'แท็บเริ่มต้น',
    tab_new: 'แท็บใหม่',
    tab_duplicate: 'คัดลอกแท็บ',
    tab_close: 'ปิดแท็บ',
    tab_clear_confirm: 'ต้องการล้างข้อมูลในแท็บนี้ใช่หรือไม่?',
    field_empty_hint: 'ไม่มีช่องตัวแปรสำหรับหน้านี้ ไปที่การตั้งค่าเพื่อสร้างตัวแปร',
    field_locked_tooltip: 'ตัวแปรล็อค (ค่าจะไม่ถูกล้างเมื่อกดปุ่ม Clear)',
    field_hidden_tooltip: 'ตัวแปรที่ซ่อนไว้ (ต้องใส่รหัส Admin เพื่อดูค่า)',
    field_eye_show: 'แสดงค่าที่ซ่อนอยู่',
    field_eye_hide: 'ซ่อนค่าตัวแปร',

    // Main Window - Command Panel
    cmd_no_commands: 'ยังไม่มีคำสั่งในหมวดหมู่นี้',
    cmd_click_to_run: 'คลิกเพื่อส่งคำสั่งไปยังหน้าต่างเป้าหมาย',
    cmd_autofocus_tag: 'โฟกัสอัตโนมัติ',
    cmd_run_error: 'เกิดข้อผิดพลาดในการส่งคำสั่ง',

    // Confirm Modal (Review before send)
    review_title: 'ตรวจสอบคำสั่งก่อนส่ง',
    review_cancel: 'ยกเลิก',
    review_confirm_send: 'ยืนยันและส่งคำสั่ง',

    // Admin Auth Modal
    admin_auth_title: 'ยืนยันรหัสผ่านผู้ดูแลระบบ (Admin Password)',
    admin_auth_set_title: 'ตั้งรหัสผ่านผู้ดูแลระบบครั้งแรก',
    admin_auth_input_label: 'รหัสผ่าน Admin (สำหรับดูตัวแปรที่ซ่อนอยู่)',
    admin_auth_input_ph: 'กรอกรหัสผ่าน Admin 6 หลักขึ้นไป...',
    admin_auth_confirm_label: 'ยืนยันรหัสผ่านอีกครั้ง',
    admin_auth_confirm_ph: 'กรอกรหัสผ่านเหมือนด้านบน...',
    admin_auth_unlock_btn: 'ปลดล็อค',
    admin_auth_save_btn: 'บันทึกรหัสผ่าน',
    admin_auth_err_empty: 'กรุณากรอกรหัสผ่าน Admin',
    admin_auth_err_mismatch: 'รหัสผ่านยืนยันไม่ตรงกัน',
    admin_auth_err_short: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร',
    admin_auth_err_wrong: 'รหัสผ่าน Admin ไม่ถูกต้อง!',

    // Settings - Apps & Command Sets
    set_header: 'ชุดคำสั่ง (Apps)',
    set_new_btn: 'เพิ่มชุดคำสั่งใหม่',
    set_programs_label: 'โปรแกรมเป้าหมาย:',
    set_add_program: 'เพิ่มโปรแกรม',
    set_submodes_label: 'หมวดหมู่ย่อย (Sub-modes):',
    set_add_submode: 'เพิ่มหมวดหมู่ย่อย',
    set_group_ph: 'ชื่อกลุ่มคำสั่ง (เช่น ตรวจสอบสถานะ AP)',
    set_add_group: 'เพิ่มกลุ่มคำสั่ง',
    set_empty_title: 'ยังไม่มีชุดคำสั่งในระบบ',
    set_empty_desc: 'เริ่มต้นสร้างชุดคำสั่งสำหรับโปรแกรมของคุณ (เช่น Remote Desktop, PuTTY, LINE, CMD) หรือนำเข้าไฟล์การตั้งค่า',
    set_empty_create_btn: 'สร้างชุดคำสั่งแรก',
    set_empty_import_btn: 'นำเข้าไฟล์ตั้งค่า',
    set_del_confirm: 'ต้องการลบชุดคำสั่งนี้และคำสั่งทั้งหมดใช่หรือไม่?',
    set_group_del_confirm: 'ต้องการลบกลุ่มคำสั่งนี้ใช่หรือไม่?',
    set_cmd_del_confirm: 'ต้องการลบคำสั่งนี้ใช่หรือไม่?',

    // Settings - Variables Manager
    var_manager_title: 'การจัดการตัวแปรและโทเค็น (Variables & Tokens)',
    var_manager_desc: 'จัดการโทเค็นตัวแปรทั้งหมดที่ใช้สำหรับช่องกรอกข้อมูลและเทมเพลตคำสั่งมาโคร',
    var_search_ph: 'ค้นหาตัวแปร (ชื่อ, คำอธิบาย, คีย์)...',
    var_add_btn: 'เพิ่มตัวแปรใหม่',
    var_empty_title: 'ยังไม่มีตัวแปรในระบบ',
    var_empty_desc: 'คลิก "+ เพิ่มตัวแปรใหม่" ด้านบนเพื่อสร้างตัวแปรแรก',
    var_no_results: 'ไม่พบตัวแปรที่ตรงกับคำค้นหา',
    var_used_in: 'ใช้ในคำสั่ง:',
    var_not_used: 'ยังไม่ถูกใช้ในคำสั่งใดๆ',
    var_formula_badge: 'สูตรคำนวณ',
    var_locked_badge: 'ล็อคค่า',
    var_hidden_badge: 'ซ่อนค่า (รหัสผ่าน)',

    // Variable Form Modal
    var_modal_add_title: 'เพิ่มตัวแปรใหม่',
    var_modal_edit_title: 'แก้ไขตัวแปร',
    var_key_label: 'คีย์ของตัวแปร (Variable Token Key เช่น router_ip หรือ device_sn)',
    var_key_help: 'ใช้ในเทมเพลตด้วยรูปแบบ {key} (ใช้อักษรภาษาอังกฤษ, ตัวเลข และขีดล่าง _ เท่านั้น)',
    var_label_label: 'ชื่อป้ายกำกับ (Field Label)',
    var_desc_label: 'คำอธิบาย / ข้อความตัวอย่าง (Placeholder)',
    var_default_label: 'ค่าเริ่มต้น (Default Value - ไม่บังคับ)',
    var_datatype_label: 'ประเภทข้อมูล (Data Type)',
    var_datatype_string: 'ข้อความทั่วไป (String)',
    var_datatype_ip: 'ไอพีแอดเดรส (IP Address - 4 ชุด 0-255)',
    var_datatype_port: 'พอร์ต (Port - slot/card/port)',
    var_datatype_number: 'ตัวเลข (Numeric)',
    var_formula_label: 'สูตรคำนวณและแยกข้อความ (Formula)',
    var_open_studio_btn: 'เปิด Formula Studio...',
    var_formula_ph: 'คลิก "เปิด Formula Studio..." เพื่อสร้างและทดสอบสูตรแบบกราฟิก',
    var_lock_check: 'ล็อค (ไม่ล้างค่าเมื่อกดปุ่ม Clear ในหน้าหลัก)',
    var_hidden_check: 'ซ่อนค่า (ต้องใช้รหัสผ่าน Admin เพื่อเปิดดู)',
    var_btn_save: 'บันทึกตัวแปร',
    var_btn_delete: 'ลบตัวแปร',
    var_btn_cancel: 'ยกเลิก',

    // Formula Studio Modal
    formula_studio_title: 'Formula Studio — สตูดิโอออกแบบสูตรคำนวณและแยกข้อความ',
    formula_target_var: 'ตัวแปรเป้าหมาย:',
    formula_editor_title: 'พื้นที่เขียนสูตรคำนวณ (Formula Editor)',
    formula_lib_title: 'คลังฟังก์ชันที่รองรับ',
    formula_test_title: 'กล่องทดสอบผลลัพธ์สด (Live Sandbox)',
    formula_eval_btn: 'ทดสอบรันสูตร',
    formula_apply_btn: 'นำสูตรไปใช้',
    formula_status_valid: 'ไวยากรณ์ถูกต้อง',
    formula_status_error: 'พบข้อผิดพลาดในสูตร',

    // View Settings & Theme
    view_language_title: 'ภาษาของระบบ (Language)',
    view_language_desc: 'เลือกภาษาสำหรับหน้าต่างและเมนูทั้งหมด (ไทย / English)',
    view_theme_title: 'ธีมสีของโปรแกรม (Color Theme Preset)',
    view_theme_desc: 'เลือกธีมสีสำหรับหน้าจอควบคุมมาโครและหน้าต่างตั้งค่า',
    view_add_theme_btn: 'สร้างธีมใหม่',
    view_typography_title: 'ขนาดตัวอักษรและฟอนต์ (Typography & Font Size)',
    view_typography_desc: 'ปรับขนาดตัวอักษรของปุ่มคำสั่ง ช่องกรอกข้อมูล และรูปแบบฟอนต์',
    view_btn_font_size: 'ขนาดตัวอักษรปุ่มมาโคร',
    view_input_font_size: 'ขนาดตัวอักษรช่องกรอกข้อมูล',
    view_font_family: 'รูปแบบฟอนต์แบบ Monospace',
    view_density: 'ความกระชับของเลย์เอาต์ (Layout Density)',
    view_density_compact: 'กะทัดรัด (Compact)',
    view_density_normal: 'ปกติ (Normal)',
    view_density_comfortable: 'สบายตา (Comfortable)',

    // Custom Theme Modal
    theme_modal_title: 'สร้างธีมสีแบบกำหนดเอง (Custom Theme)',
    theme_name_label: 'ชื่อธีม',
    theme_color_targets: 'ส่วนที่ต้องการเปลี่ยนสี',
    theme_target_signal: 'สีไฮไลต์ / ปุ่มเน้น (Signal / Accent)',
    theme_target_bg_base: 'สีพื้นหลังหลัก (Background)',
    theme_target_bg_panel: 'สีพื้นหลังแผงและกล่อง (Panel / Card)',
    theme_target_text: 'สีตัวอักษรหลัก (Text Primary)',
    theme_palette_wheel: 'วงล้อเลือกสี / Color Wheel',
    theme_hex_code: 'รหัสสี HEX',
    theme_preset_palette: 'จานสีสำเร็จรูป',
    theme_rgb_sliders: 'แถบปรับค่าสี RGB (0 - 255)',
    theme_preview: 'ตัวอย่างการแสดงผลธีมจริง',
    theme_save_btn: 'บันทึกธีม',

    // Export / Import Modals & Conflict Resolution
    export_pin_title: 'ตั้งรหัส PIN 6 หลักสำหรับการส่งออก (Export)',
    export_pin_desc: 'การตั้งค่าจะถูกเข้ารหัสด้วย AES-GCM เพื่อความปลอดภัย',
    export_pin_ph: 'กรอกรหัส PIN 6 หลัก...',
    export_pin_confirm_ph: 'ยืนยันรหัส PIN 6 หลัก...',
    export_pin_btn: 'ส่งออกไฟล์เข้ารหัส (.femac)',
    import_pin_title: 'กรอกรหัส PIN เพื่อถอดรหัสไฟล์ตั้งค่า (.femac)',
    import_pin_ph: 'กรอกรหัส PIN 6 หลัก...',
    import_pin_btn: 'ถอดรหัสและนำเข้า',
    conflict_title: 'ตรวจพบชุดคำสั่งหรือตัวแปรซ้ำกัน',
    conflict_desc: 'ไฟล์ที่นำเข้ามีรายการที่ตรงกับข้อมูลปัจจุบันในระบบ กรุณาเลือกวิธีจัดการ:',
    conflict_overwrite_all: 'เขียนทับทั้งหมด (Overwrite All)',
    conflict_keep_all: 'เก็บของเดิมไว้ทั้งหมด (Keep All Existing)',
    conflict_merge_confirm: 'นำเข้าข้อมูลตามที่เลือก',

    // OCR Screen Capture Overlay
    ocr_title: 'บันทึกภาพหน้าจอและแยกข้อความ (OCR Capture)',
    ocr_hint: 'ลากเมาส์เพื่อครอบพื้นที่ที่ต้องการอ่านค่า หรือกดปุ่ม "วิเคราะห์อัตโนมัติ"',
    ocr_auto_detect: 'วิเคราะห์อัตโนมัติทั้งภาพ',
    ocr_recapture: 'จับภาพใหม่',
    ocr_apply_btn: 'นำค่าที่ตรวจพบไปใส่ในช่องกรอก',
    ocr_close: 'ปิดหน้าต่าง OCR (Esc)',
    ocr_confidence: 'ความมั่นใจ:',
    ocr_detected_ips: 'IP ที่ตรวจพบ:',
    ocr_detected_ports: 'พอร์ตที่ตรวจพบ:',
    ocr_detected_pairs: 'คู่ข้อมูลที่ตรงกับตัวแปร:',

    // Common
    common_save: 'บันทึก',
    common_cancel: 'ยกเลิก',
    common_delete: 'ลบ',
    common_close: 'ปิด',
    common_success: 'ดำเนินการสำเร็จ',
    common_error: 'เกิดข้อผิดพลาด',
  },
  en: {
    // Top Navigation & Header
    app_title: 'Marcruro',
    settings_title: 'Setting',
    tab_apps: 'Command Sets (Apps)',
    tab_variables: 'Variables',
    tab_view: 'View',
    btn_export: 'Export All Settings',
    btn_import: 'Import Settings',
    btn_ocr_capture: 'Screen OCR Capture (Alt+Shift+S)',
    btn_setting: 'Open Settings Window',
    btn_filter_fields: 'Toggle Empty Fields Filter',
    btn_clear_fields: 'Clear All Input Fields',
    btn_auto_mover_title: 'Toggle AFK Prevention (Auto-Mover)',

    // Status & Focus
    focus_target: 'Target Program',
    focus_no_target: 'NO TARGET WINDOW',
    status_idle: 'IDLE',
    status_active: 'ACTIVE',
    status_afk: 'AFK',
    status_jiggle: 'Jiggling Mouse',

    // Main Window - Tabs & Fields
    tab_default: 'Default',
    tab_new: 'New Tab',
    tab_duplicate: 'Duplicate Tab',
    tab_close: 'Close Tab',
    tab_clear_confirm: 'Are you sure you want to clear all input fields in this tab?',
    field_empty_hint: 'No variable fields for this tab. Go to Settings to create variables.',
    field_locked_tooltip: 'Locked Variable (Preserved when Clear is clicked)',
    field_hidden_tooltip: 'Hidden Variable (Requires Admin password to reveal)',
    field_eye_show: 'Show hidden value',
    field_eye_hide: 'Hide value',

    // Main Window - Command Panel
    cmd_no_commands: 'No commands in this group',
    cmd_click_to_run: 'Click to send macro to target window',
    cmd_autofocus_tag: 'autofocus',
    cmd_run_error: 'Failed to send command',

    // Confirm Modal (Review before send)
    review_title: 'Review Command Before Sending',
    review_cancel: 'Cancel',
    review_confirm_send: 'Confirm & send',

    // Admin Auth Modal
    admin_auth_title: 'Admin Password Verification',
    admin_auth_set_title: 'Setup Admin Password',
    admin_auth_input_label: 'Admin Password (to view hidden variables)',
    admin_auth_input_ph: 'Enter admin password (6+ characters)...',
    admin_auth_confirm_label: 'Confirm Password',
    admin_auth_confirm_ph: 'Re-enter password...',
    admin_auth_unlock_btn: 'Unlock',
    admin_auth_save_btn: 'Save Password',
    admin_auth_err_empty: 'Please enter admin password',
    admin_auth_err_mismatch: 'Passwords do not match',
    admin_auth_err_short: 'Password must be at least 6 characters',
    admin_auth_err_wrong: 'Incorrect Admin Password!',

    // Settings - Apps & Command Sets
    set_header: 'Command Sets (Apps)',
    set_new_btn: 'New set',
    set_programs_label: 'Programs:',
    set_add_program: 'Add Program',
    set_submodes_label: 'Sub-modes:',
    set_add_submode: 'Sub-mode',
    set_group_ph: 'Group name (e.g. AP Monitoring)',
    set_add_group: 'Group',
    set_empty_title: 'No Command Sets Configured',
    set_empty_desc: 'Get started by creating your first command set for your programs (e.g. Remote Desktop, PuTTY, LINE, CMD), or import an existing settings file.',
    set_empty_create_btn: 'Create First Command Set',
    set_empty_import_btn: 'Import Settings',
    set_del_confirm: 'Delete this command set and all its submodes?',
    set_group_del_confirm: 'Delete this group and all its commands?',
    set_cmd_del_confirm: 'Delete this command?',

    // Settings - Variables Manager
    var_manager_title: 'Variables & Tokens',
    var_manager_desc: 'Manage all variable tokens used for text input fields and macro command templates.',
    var_search_ph: 'Search variables…',
    var_add_btn: 'Add Variable',
    var_empty_title: 'No variables defined',
    var_empty_desc: 'Click "+ Add Variable" above to create one.',
    var_no_results: 'No matching variables found.',
    var_used_in: 'Used in:',
    var_not_used: 'Not used in any commands',
    var_formula_badge: 'Formula',
    var_locked_badge: 'Locked',
    var_hidden_badge: 'Hidden',

    // Variable Form Modal
    var_modal_add_title: 'Add Variable',
    var_modal_edit_title: 'Edit Variable',
    var_key_label: 'Variable Token Key (e.g. router_ip or device_sn)',
    var_key_help: 'Used in templates as {key}. Letters, numbers, and underscores only.',
    var_label_label: 'Field Label',
    var_desc_label: 'Description / Placeholder',
    var_default_label: 'Default Value (optional)',
    var_datatype_label: 'Data Type',
    var_datatype_string: 'String (General Text)',
    var_datatype_ip: 'IP Address (4 octets, 0-255)',
    var_datatype_port: 'Port (slot/card/port[:onu_idx])',
    var_datatype_number: 'Number (Numeric)',
    var_formula_label: 'Formula (Split & Calculation)',
    var_open_studio_btn: 'Open Formula Studio...',
    var_formula_ph: "Click 'Open Formula Studio...' to build and test formula visually",
    var_lock_check: 'Lock (preserve value on Clear)',
    var_hidden_check: 'Hidden (password-protected access)',
    var_btn_save: 'Save Variable',
    var_btn_delete: 'Delete',
    var_btn_cancel: 'Cancel',

    // Formula Studio Modal
    formula_studio_title: 'Formula Studio — Visual Formula Builder & Sandbox',
    formula_target_var: 'Target Variable:',
    formula_editor_title: 'Formula Editor',
    formula_lib_title: 'Function Library',
    formula_test_title: 'Live Evaluation & Sandbox',
    formula_eval_btn: 'Run Test',
    formula_apply_btn: 'Apply Formula',
    formula_status_valid: 'Syntax Valid',
    formula_status_error: 'Formula Error',

    // View Settings & Theme
    view_language_title: 'System Language',
    view_language_desc: 'Select language for user interface (Thai / English).',
    view_theme_title: 'Color Theme Preset',
    view_theme_desc: 'Select a visual theme for the macro console and setting window.',
    view_add_theme_btn: 'Add Theme',
    view_typography_title: 'Font Size & Typography',
    view_typography_desc: 'Customize text size and monospace fonts for buttons and inputs.',
    view_btn_font_size: 'Macro Button Font Size',
    view_input_font_size: 'Input Fields Font Size',
    view_font_family: 'Monospace Font Family',
    view_density: 'Layout Spacing Density',
    view_density_compact: 'Compact (Dense)',
    view_density_normal: 'Normal (Balanced)',
    view_density_comfortable: 'Comfortable (Spacious)',

    // Custom Theme Modal
    theme_modal_title: 'Create Custom Theme',
    theme_name_label: 'Theme Name',
    theme_color_targets: 'Color Targets',
    theme_target_signal: 'Accent / Signal',
    theme_target_bg_base: 'Background',
    theme_target_bg_panel: 'Panel / Card',
    theme_target_text: 'Text Primary',
    theme_palette_wheel: 'Color Wheel / Palette',
    theme_hex_code: 'HEX Code',
    theme_preset_palette: 'Preset Color Palette',
    theme_rgb_sliders: 'RGB Sliders (0 - 255)',
    theme_preview: 'Active Theme Preview',
    theme_save_btn: 'Save Custom Theme',

    // Export / Import Modals & Conflict Resolution
    export_pin_title: 'Set 6-Digit Export PIN',
    export_pin_desc: 'Settings will be AES-GCM encrypted for security.',
    export_pin_ph: 'Enter 6-digit PIN...',
    export_pin_confirm_ph: 'Confirm 6-digit PIN...',
    export_pin_btn: 'Export Encrypted Config (.femac)',
    import_pin_title: 'Enter 6-Digit PIN to Decrypt Config (.femac)',
    import_pin_ph: 'Enter 6-digit PIN...',
    import_pin_btn: 'Decrypt & Import',
    conflict_title: 'Import Duplicate Items Detected',
    conflict_desc: 'The imported file contains items that already exist in your system. Choose resolution strategy:',
    conflict_overwrite_all: 'Overwrite All',
    conflict_keep_all: 'Keep All Existing',
    conflict_merge_confirm: 'Apply Strategy to Selected',

    // OCR Screen Capture Overlay
    ocr_title: 'Screen OCR Capture',
    ocr_hint: 'Drag to select an area or click Auto-Detect',
    ocr_auto_detect: 'Auto-Detect Full Screen',
    ocr_recapture: 'Re-capture',
    ocr_apply_btn: 'Apply Values to Fields',
    ocr_close: 'Close OCR (Esc)',
    ocr_confidence: 'Confidence:',
    ocr_detected_ips: 'Detected IPs:',
    ocr_detected_ports: 'Detected Ports:',
    ocr_detected_pairs: 'Matched Variable Pairs:',

    // Common
    common_save: 'Save',
    common_cancel: 'Cancel',
    common_delete: 'Delete',
    common_close: 'Close',
    common_success: 'Operation Successful',
    common_error: 'An Error Occurred',
  },
};

let currentLang = 'th';

export function setLanguage(lang) {
  if (lang === 'th' || lang === 'en') {
    currentLang = lang;
  }
}

export function getLanguage() {
  return currentLang;
}

export function t(key, fallback = '') {
  const dict = DICTIONARY[currentLang] || DICTIONARY.th;
  return dict[key] !== undefined ? dict[key] : (fallback || key);
}

export function applyI18nToDOM(root = document, lang = currentLang) {
  setLanguage(lang);
  const elements = root.querySelectorAll('[data-i18n]');
  elements.forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const translation = t(key);
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = translation;
    } else {
      el.textContent = translation;
    }
  });

  const titleElements = root.querySelectorAll('[data-i18n-title]');
  titleElements.forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) {
      el.title = t(key);
    }
  });

  const phElements = root.querySelectorAll('[data-i18n-ph]');
  phElements.forEach((el) => {
    const key = el.getAttribute('data-i18n-ph');
    if (key) {
      el.placeholder = t(key);
    }
  });
}
