document.addEventListener('DOMContentLoaded', function () {
  const loginForm = document.querySelector('[data-portal-login]');
  const registerForm = document.querySelector('[data-portal-register]');

  async function showMessage(node, text, isError = false) {
    if (!node) return;
    node.textContent = text;
    node.style.color = isError ? '#C1443D' : '#1D4CFF';
    node.style.display = 'block';
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return { ok: response.ok, data };
  }

  if (loginForm) {
    const messageNode = loginForm.querySelector('.form-note');
    loginForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      const username = loginForm.username.value.trim();
      const password = loginForm.password.value;

      if (!username || !password) {
        return showMessage(messageNode, 'Please enter both username and password.', true);
      }

      const { ok, data } = await postJson('/api/login', { username, password });
      if (!ok || !data.ok) {
        return showMessage(messageNode, data.message || 'Login failed.', true);
      }

      showMessage(messageNode, 'Login successful! Redirecting...');
      setTimeout(() => {
        window.location.href = 'client-portal-dashboard.html';
      }, 900);
    });
  }

  if (registerForm) {
    const messageNode = registerForm.querySelector('.form-note');
    registerForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      const username = registerForm.username.value.trim();
      const password = registerForm.password.value;
      const confirmPassword = registerForm.confirmPassword.value;

      if (!username || !password || !confirmPassword) {
        return showMessage(messageNode, 'Please complete every field.', true);
      }
      if (password !== confirmPassword) {
        return showMessage(messageNode, 'Passwords do not match.', true);
      }

      const { ok, data } = await postJson('/api/register', { username, password });
      if (!ok || !data.ok) {
        return showMessage(messageNode, data.message || 'Registration failed.', true);
      }

      showMessage(messageNode, data.message || 'Account created.', false);
    });
  }
});
