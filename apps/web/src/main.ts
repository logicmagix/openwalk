// Entry point referenced by index.html. Keep DOM access here and logic in
// separate modules so the logic stays testable.
import { placeholderStatus } from './app';

const status = document.getElementById('status');
if (status) {
  status.textContent = placeholderStatus();
}
