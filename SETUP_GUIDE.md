# 🎥 Church Live Stream Studio - Setup & Installation Guide

## Quick Start

### For Development PC (Where you build the app)
```bash
npm run dev          # Start development server with hot reload
npm run build        # Create installer for distribution
```

### For Any Other PC (Installation)
1. Get the installer: `release/Church Live Stream Studio Setup 1.0.0.exe`
2. Run the installer
3. Launch the app from Start Menu or Desktop shortcut

---

## 📋 Step-by-Step Setup for Another PC

### Step 1: Build the Application
**On your development PC (D:\MyProjects\LiveStream\Live):**

```bash
# Open Command Prompt or PowerShell in the project directory
cd D:\MyProjects\LiveStream\Live

# Build the application
npm run build

# Wait 3-5 minutes for compilation to complete
# The installer will be created at: release/Church Live Stream Studio Setup 1.0.0.exe
```

### Step 2: Transfer the Installer
**Move the installer to the other PC:**

- **Option A:** Copy via USB drive
  ```
  USB Drive\Church Live Stream Studio Setup 1.0.0.exe
  ```
  
- **Option B:** Email the file
  
- **Option C:** Cloud storage (Google Drive, OneDrive, Dropbox)
  
- **Option D:** Network share (if on same network)

### Step 3: Install on the Other PC

1. Double-click `Church Live Stream Studio Setup 1.0.0.exe`
2. Follow the installation wizard
3. Choose installation folder (default: `C:\Program Files\Church Live Stream Studio`)
4. Wait for installation to complete
5. Check "Launch application" to start after installation

### Step 4: Initial Setup

**First Time Running:**
```
1. Open Church Live Stream Studio
2. You may see: "No cameras detected"
   - This is normal on first run
   - Click "Refresh" button (↺)
```

**Grant Camera Permissions (if prompted):**
- Windows may ask for camera access
- Click "Yes" to allow
- The app will detect cameras

**Configure Stream Settings:**
- Click Settings ⚙️ icon
- Enter your YouTube/streaming platform details:
  - RTMP URL: `rtmp://live.youtube.com/live2`
  - Stream Key: (from your streaming platform)
- Save settings

---

## 🎬 Camera Detection & Setup

### USB Cameras (Webcams)
```
1. Plug in USB camera to any USB port
2. Click "Refresh" button (↺) in Cameras panel
3. Camera should appear in the list
4. Click camera to select it
5. Click "Start Stream" to broadcast
```

### IP Cameras (Network Cameras - Optional)
```
1. Connect IP camera to same network as PC
2. Get camera IP address:
   - Check camera manual or app
   - Usually looks like: 192.168.1.100

3. In app, click "📡" button (IP Camera)
4. Enter:
   - Camera IP: 192.168.1.100
   - Port: 554 (default)
   - Username: admin (default)
   - Password: (camera password)
   - Channel: 1 (default)

5. Click "Connect"
6. Camera stream will appear
```

### Mobile Phone Cameras (Optional)
```
1. Click "📱" button in Cameras panel
2. Scan QR code with Church Cam app on phone
3. Phone and PC must be on same WiFi
4. Phone camera appears in the list
```

---

## ⚙️ Troubleshooting

### Problem: "No cameras detected"
**Solution:**
```
Step 1: Check connections
  - Is USB camera plugged in?
  - Try different USB port
  - Check Device Manager (Win+X → Device Manager)
    - Look for camera under "Cameras" or "Universal Serial Bus"

Step 2: Check permissions
  - Settings → Privacy & Security → Camera
  - Make sure "Camera access" is ON
  - Allow app to access camera

Step 3: Update drivers
  - Right-click camera in Device Manager
  - Click "Update driver"
  - Choose "Search automatically for drivers"

Step 4: Restart and retry
  - Close the app completely
  - Restart the app
  - Click "Refresh" button
```

### Problem: "Camera shows OFFLINE"
**Solution:**
```
1. Unplug the USB camera
2. Wait 5 seconds
3. Plug it back in
4. Click "Refresh" button
5. If still offline, restart the app
6. Try a different USB port
```

### Problem: "IP Camera not connecting"
**Solution:**
```
Step 1: Verify network connection
  - Ping the camera: Win+R → cmd → ping 192.168.1.100
  - If it works, camera is on network

Step 2: Check credentials
  - Verify IP address is correct
  - Username is correct (usually "admin")
  - Password is correct
  - Port is correct (usually 554)

Step 3: Check firewall
  - Windows Defender Firewall may be blocking
  - Add app to firewall whitelist if needed
```

### Problem: "Stream not working"
**Solution:**
```
Step 1: Verify stream settings
  - Settings ⚙️
  - Check RTMP URL is correct
  - Check stream key is correct
  - Click "Save"

Step 2: Check internet speed
  - Need at least 5 Mbps for 720p streaming
  - Use speedtest.net to check

Step 3: Reduce bitrate if needed
  - Settings ⚙️ → Bitrate
  - Lower from 3000 to 2500 or 2000 Kbps
  - Saves bandwidth, reduces lag

Step 4: Check firewall
  - Make sure RTMP (port 1935) isn't blocked
```

### Problem: "Stream is laggy or choppy"
**Solution:**
```
1. Lower resolution: Settings → 720p instead of 1080p
2. Lower bitrate: Settings → 2000-2500 Kbps
3. Close other apps using network (downloads, videos, etc.)
4. Move closer to WiFi router if using WiFi
5. Plug in ethernet cable if possible
6. Restart the app
```

---

## 🖥️ System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **OS** | Windows 10 (64-bit) | Windows 10/11 (64-bit) |
| **RAM** | 4 GB | 8 GB |
| **Disk Space** | 2 GB | 5 GB |
| **Internet** | 5 Mbps | 10+ Mbps |
| **Processor** | Dual-core | Quad-core or better |

---

## 📡 Streaming Platform Setup

### YouTube Live
```
1. Go to youtube.com
2. Click camera icon → "Go Live"
3. Click "Create a new stream"
4. Copy RTMP URL: rtmps://live-api-s.facebook.com:443/rtmp/
5. Copy Stream Key
6. Paste in app Settings ⚙️
7. Click "Start Stream"
```

### Facebook Live
```
1. Go to facebook.com
2. Click "Live Video"
3. Copy RTMP URL
4. Copy Stream Key
5. Paste in app Settings
6. Click "Start Stream"
```

### OBS Studio (Local Testing)
```
If you have OBS Studio:
1. OBS → Settings → Stream
2. Copy "Stream Key" from RTMP server
3. Paste in this app
4. Click "Start Stream"
```

---

## 🔧 Advanced Configuration

### Camera Settings (Per Camera)
- **Resolution:** 480p, 720p, 1080p, 4K
- **Frame Rate:** 30 fps or 60 fps
- **Zoom:** 1x to 4x (depends on camera)
- **Brightness/Contrast:** Adjust for lighting
- **Flip:** Horizontal or vertical flip

### Stream Settings
- **Bitrate:** 1500-5000 Kbps (higher = better quality, more bandwidth)
- **Resolution:** 480p, 720p, 1080p (higher = more bandwidth needed)
- **FPS:** 30 or 60 fps (60 = smoother but more bandwidth)

---

## 📞 Support & Logs

### Enable Debug Mode
```
1. Press F12 in the app
2. Click "Console" tab
3. Look for messages starting with [Camera Detection]
4. Screenshot errors and share for support
```

### Troubleshooting Checklist
```
☐ USB cameras properly connected
☐ Windows camera permissions granted
☐ Camera drivers up to date
☐ App restarted after connecting camera
☐ Clicked "Refresh" button
☐ Internet connection working
☐ RTMP credentials correct
☐ No firewall blocking camera/RTMP ports
☐ No other app using camera
```

---

## 🚀 Quick Tips

✅ **Do:**
- Keep cameras close to PC for best connection
- Use wired ethernet for streaming (WiFi can be unreliable)
- Test with camera before going live
- Have backup camera ready

❌ **Don't:**
- Unplug camera during streaming (it will disconnect)
- Move camera cables while streaming
- Stream with very low internet speed
- Run heavy programs while streaming
- Cover camera lens

---

## 📝 Uninstall

**To remove the app:**
1. Windows Settings → Apps → Apps & features
2. Search for "Church Live Stream Studio"
3. Click "Uninstall"
4. Follow prompts

**This will NOT delete:**
- Settings you configured
- Stream history
- Saved presets

---

**Version:** 1.0.0  
**Last Updated:** 2026-05-14  
**Questions?** Check electron/main.ts for detailed setup comments
