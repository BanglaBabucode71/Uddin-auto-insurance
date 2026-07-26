document.addEventListener('DOMContentLoaded', async function () {
  const userNameElement = document.querySelector('#portal-user-name');
  const logoutButton = document.querySelector('#portal-logout');

  async function loadSession() {
    const response = await fetch('/api/session');
    if (!response.ok) {
      window.location.href = 'client-portal.html';
      return null;
    }
    const data = await response.json();
    if (!data.authenticated) {
      window.location.href = 'client-portal.html';
      return null;
    }
    return data.user;
  }

  const user = await loadSession();
  if (!user) return;
  if (userNameElement) {
    userNameElement.textContent = user.username;
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', async function (event) {
      event.preventDefault();
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = 'client-portal.html';
    });
  }
});
