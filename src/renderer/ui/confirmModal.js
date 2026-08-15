// confirmModal.js
// Review popup before sending multi-line or destructive commands.

import { sendToTarget } from '../commandRunner.js';

let pendingText = '';
let pendingAppKey = null;

export function initConfirmModal() {
  document.getElementById('confirmCancel').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmSend').addEventListener('click', async () => {
    const text = pendingText;
    const appKey = pendingAppKey;
    closeConfirmModal();
    await sendToTarget(text, appKey);
  });
}

export function openConfirmModal(title, content, appKey = null) {
  pendingText = content;
  pendingAppKey = appKey;
  document.getElementById('confirmModalTitle').textContent = `Review: ${title}`;
  document.getElementById('confirmModalBody').textContent = content;
  document.getElementById('confirmModal').classList.remove('modal-overlay--hidden');
}

function closeConfirmModal() {
  document.getElementById('confirmModal').classList.add('modal-overlay--hidden');
  pendingText = '';
  pendingAppKey = null;
}
