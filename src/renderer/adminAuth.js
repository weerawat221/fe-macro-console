// adminAuth.js
// Shared admin authentication modal controller and session manager.
// Used by both Main Console and Settings window to protect Hidden Variables.

import { hashPassword, verifyPassword } from './crypto.js';

let adminAuthCallback = null;
let adminIsSetup = false;
let adminSessionUntil = 0; // Timestamp when active admin authentication expires (2 mins)

export function initAdminAuthModal() {
  document.getElementById('adminPwCancel')?.addEventListener('click', closeAdminPasswordModal);
  document.getElementById('adminPwConfirmBtn')?.addEventListener('click', confirmAdminPassword);
  document.getElementById('adminPwInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmAdminPassword();
  });
  document.getElementById('adminPwConfirm')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmAdminPassword();
  });
}

export function closeAdminPasswordModal() {
  document.getElementById('adminPasswordModal')?.classList.add('modal-overlay--hidden');
  adminAuthCallback = null;
}

export async function requireAdminPassword(actionLabel, callback) {
  const adminHash = window.feMacro?.storeGet ? await window.feMacro.storeGet('adminPwHash', null) : null;
  adminIsSetup = Boolean(adminHash);

  // If already authenticated within active session and setup is done, proceed directly
  if (adminIsSetup && Date.now() < adminSessionUntil) {
    if (callback) callback();
    return;
  }

  adminAuthCallback = callback;
  const msgEl = document.getElementById('adminPwMessage');
  const setupNote = document.getElementById('adminPwSetupNote');
  const titleEl = document.getElementById('adminPwTitle');
  if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-shield-halved" style="color:var(--signal);margin-right:6px;"></i> ${actionLabel}`;
  if (msgEl) {
    msgEl.textContent = adminIsSetup
      ? 'Enter admin password to continue.'
      : 'No admin password set yet. Create one now.';
  }
  if (setupNote) setupNote.style.display = adminIsSetup ? 'none' : 'block';
  const pwInput = document.getElementById('adminPwInput');
  if (pwInput) pwInput.value = '';
  const errEl = document.getElementById('adminPwError');
  if (errEl) errEl.style.display = 'none';
  const confirmInput = document.getElementById('adminPwConfirm');
  if (confirmInput) confirmInput.value = '';

  document.getElementById('adminPasswordModal')?.classList.remove('modal-overlay--hidden');
  setTimeout(() => pwInput?.focus(), 50);
}

async function confirmAdminPassword() {
  const password = document.getElementById('adminPwInput')?.value || '';
  const errEl = document.getElementById('adminPwError');
  if (errEl) errEl.style.display = 'none';

  // Validate: alphanumeric only, 6+ chars
  if (!/^[a-zA-Z0-9]{6,}$/.test(password)) {
    if (errEl) {
      errEl.textContent = 'Password must be at least 6 alphanumeric characters.';
      errEl.style.display = 'block';
    }
    return;
  }

  const cb = adminAuthCallback;

  if (!adminIsSetup) {
    // First-time: verify confirmation matches
    const confirm = document.getElementById('adminPwConfirm')?.value;
    if (password !== confirm) {
      if (errEl) {
        errEl.textContent = 'Passwords do not match.';
        errEl.style.display = 'block';
      }
      return;
    }
    // Hash and store the new admin password
    const { hash, salt } = await hashPassword(password);
    if (window.feMacro?.storeSet) {
      await window.feMacro.storeSet('adminPwHash', hash);
      await window.feMacro.storeSet('adminPwSalt', salt);
    }
    adminIsSetup = true;
    adminSessionUntil = Date.now() + 2 * 60 * 1000; // 2 min session
    closeAdminPasswordModal();
    if (cb) cb();
  } else {
    // Verify existing password
    const storedHash = window.feMacro?.storeGet ? await window.feMacro.storeGet('adminPwHash', null) : null;
    const storedSalt = window.feMacro?.storeGet ? await window.feMacro.storeGet('adminPwSalt', null) : null;
    const ok = storedHash && storedSalt ? await verifyPassword(password, storedHash, storedSalt) : false;
    if (!ok) {
      if (errEl) {
        errEl.textContent = 'Incorrect password. Try again.';
        errEl.style.display = 'block';
      }
      const pwInput = document.getElementById('adminPwInput');
      if (pwInput) {
        pwInput.value = '';
        pwInput.focus();
      }
      return;
    }
    adminSessionUntil = Date.now() + 2 * 60 * 1000; // 2 min session
    closeAdminPasswordModal();
    if (cb) cb();
  }
}
