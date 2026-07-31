import './style.css';
import type { BackgroundMessage, CaptureResponse, PopupStatus } from '../../lib/messages';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function sendBackground<T>(message: BackgroundMessage): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}

function renderStatus(root: HTMLElement, status: PopupStatus) {
  const statusEl = root.querySelector<HTMLElement>('[data-status]');
  if (!statusEl) return;

  statusEl.classList.remove('connected', 'offline');
  if (status.desktopConnected) {
    statusEl.classList.add('connected');
    statusEl.textContent =
      status.queueLength > 0
        ? `Connected to Omakase. ${status.queueLength} capture(s) waiting to sync.`
        : 'Connected to Omakase.';
  } else {
    statusEl.classList.add('offline');
    statusEl.textContent =
      status.queueLength > 0
        ? `Desktop app unavailable. ${status.queueLength} capture(s) queued locally.`
        : 'Desktop app unavailable. Saves will queue locally.';
  }
}

function renderStudios(select: HTMLSelectElement, status: PopupStatus) {
  select.replaceChildren();
  const placeholder = el('option', undefined, 'Select a Studio');
  placeholder.value = '';
  select.append(placeholder);

  for (const studio of status.studios) {
    const option = el('option');
    option.value = studio.id;
    option.textContent = studio.name;
    select.append(option);
  }

  if (status.studios.length === 0) {
    const hint = el('option', undefined, 'No Studios loaded — open Omakase first');
    hint.value = '';
    hint.disabled = true;
    select.append(hint);
  }
}

async function main() {
  const app = document.querySelector<HTMLElement>('#app');
  if (!app) return;

  const container = el('div', 'app');
  const header = el('div', 'header');
  header.append(
    el('h1', undefined, 'Omakase'),
    el('p', undefined, 'Save this page to your local library.'),
  );

  const statusEl = el('div', 'status offline');
  statusEl.dataset.status = 'true';

  const noteField = el('div', 'field');
  noteField.append(el('label', undefined, 'Note'));
  const noteInput = el('textarea');
  noteInput.placeholder = 'Optional note about why you saved this page';
  noteField.append(noteInput);

  const selectionField = el('div', 'field');
  const includeSelection = el('input');
  includeSelection.type = 'checkbox';
  includeSelection.id = 'include-selection';
  includeSelection.checked = true;
  const selectionLabel = el('label');
  selectionLabel.htmlFor = 'include-selection';
  selectionLabel.textContent = 'Include selected text';
  selectionField.append(includeSelection, selectionLabel);

  const destinationField = el('fieldset', 'field');
  destinationField.append(el('legend', undefined, 'Destination'));
  const radioRow = el('div', 'radio-row');

  const inboxRadio = el('input');
  inboxRadio.type = 'radio';
  inboxRadio.name = 'destination';
  inboxRadio.value = 'inbox';
  inboxRadio.id = 'dest-inbox';
  inboxRadio.checked = true;

  const studioRadio = el('input');
  studioRadio.type = 'radio';
  studioRadio.name = 'destination';
  studioRadio.value = 'studio';
  studioRadio.id = 'dest-studio';

  radioRow.append(
    (() => {
      const label = el('label');
      label.append(inboxRadio, document.createTextNode('Inbox'));
      return label;
    })(),
    (() => {
      const label = el('label');
      label.append(studioRadio, document.createTextNode('Studio'));
      return label;
    })(),
  );
  destinationField.append(radioRow);

  const studioField = el('div', 'field');
  studioField.append(el('label', undefined, 'Studio'));
  const studioSelect = el('select', 'studio-select');
  studioSelect.disabled = true;
  studioField.append(studioSelect);

  const feedback = el('div', 'feedback');

  const saveButton = el('button', 'primary', 'Save page');
  const retryButton = el('button', 'secondary', 'Retry sync');
  const actions = el('div', 'actions');
  actions.append(saveButton, retryButton);

  container.append(
    header,
    statusEl,
    noteField,
    selectionField,
    destinationField,
    studioField,
    feedback,
    actions,
  );
  app.append(container);

  const updateDestinationUi = () => {
    const useStudio = studioRadio.checked;
    studioSelect.disabled = !useStudio;
  };
  inboxRadio.addEventListener('change', updateDestinationUi);
  studioRadio.addEventListener('change', updateDestinationUi);

  let status: PopupStatus = { desktopConnected: false, queueLength: 0, studios: [] };

  const refreshStatus = async () => {
    status = await sendBackground<PopupStatus>({ type: 'get_status' });
    renderStatus(container, status);
    renderStudios(studioSelect, status);
    updateDestinationUi();
  };

  saveButton.addEventListener('click', async () => {
    feedback.className = 'feedback';
    feedback.textContent = 'Capturing page…';
    saveButton.disabled = true;
    retryButton.disabled = true;

    try {
      const response = await sendBackground<CaptureResponse>({
        type: 'capture',
        request: {
          includeSelection: includeSelection.checked,
          userNote: noteInput.value,
          destination: studioRadio.checked ? 'studio' : 'inbox',
          studioId: studioRadio.checked ? studioSelect.value : undefined,
        },
      });

      if (!response.ok) {
        feedback.className = 'feedback error';
        feedback.textContent = response.error ?? 'Capture failed.';
        return;
      }

      feedback.className = 'feedback success';
      feedback.textContent = response.queued
        ? `Saved locally${response.title ? `: ${response.title}` : ''}. Will sync when Omakase is available.`
        : `Saved${response.title ? `: ${response.title}` : ''}.`;
      noteInput.value = '';
      await refreshStatus();
    } catch (error) {
      feedback.className = 'feedback error';
      feedback.textContent = error instanceof Error ? error.message : 'Capture failed.';
    } finally {
      saveButton.disabled = false;
      retryButton.disabled = false;
    }
  });

  retryButton.addEventListener('click', async () => {
    feedback.className = 'feedback';
    feedback.textContent = 'Retrying sync…';
    retryButton.disabled = true;
    try {
      const result = await sendBackground<{ ok: boolean; sent?: number; remaining?: number }>({
        type: 'flush_queue',
      });
      feedback.className = 'feedback success';
      feedback.textContent =
        result.sent && result.sent > 0
          ? `Synced ${result.sent} capture(s).`
          : 'Nothing new to sync yet.';
      await refreshStatus();
    } catch (error) {
      feedback.className = 'feedback error';
      feedback.textContent = error instanceof Error ? error.message : 'Sync failed.';
    } finally {
      retryButton.disabled = false;
    }
  });

  await refreshStatus();
}

void main();
