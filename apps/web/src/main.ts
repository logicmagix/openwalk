// Entry point referenced by index.html. Keep DOM access here and logic in
// separate modules so the logic stays testable.
import {
  placeholderStatus,
  positionErrorMessage,
  positionMessage,
  secureContextMessage,
} from './app';

const status = document.getElementById('status');
const context = document.getElementById('context');
const locate = document.getElementById('locate');
const result = document.getElementById('result');

if (status) {
  status.textContent = placeholderStatus();
}
if (context) {
  context.textContent = secureContextMessage(window.isSecureContext);
}

// Location check for the placeholder page: asks once and reports accuracy only.
// The application itself reads position only through its position provider.
if (locate && result) {
  locate.addEventListener('click', () => {
    result.textContent = 'Asking for your position…';
    navigator.geolocation.getCurrentPosition(
      (position) => {
        result.textContent = positionMessage(position.coords.accuracy);
      },
      (error) => {
        result.textContent = positionErrorMessage(error.code);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
}
