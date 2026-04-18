const { app, BrowserWindow } = require('electron');

function createWindow () {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true, // لإخفاء الشريط العلوي التقليدي وجعله عصرياً
    webPreferences: {
      nodeIntegration: true,
    }
  });

  // ربط النافذة بخادم Vite المحلي
  win.loadURL('http://localhost:5173');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});