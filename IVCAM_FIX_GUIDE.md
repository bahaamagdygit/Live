# iVCam & Virtual Camera Detection Fix

## Problem
The Church Live Stream Studio was not detecting virtual cameras like **iVCam**, **OBS Virtual Camera**, or **NDI Virtual Input** during the automatic camera enumeration process.

## Root Cause
The original camera detection code used overly specific WMI filters that only matched physical USB cameras with a specific ClassGuid. Virtual cameras register differently in Windows and were being skipped.

## Solution
Enhanced the camera detection algorithm to:
1. **Keep** WMI query for physical cameras (most reliable)
2. **Add** Registry-based detection for virtual camera software installations
3. **Add** Broader WMI queries that search by name patterns including 'ivcam', 'video', 'virtual'
4. **Add** Get-PnpDevice enumeration with expanded filters
5. **Maintain** Browser-side detection as fallback (uses MediaDevices API)

---

## Steps to Apply Fix on Your PC

### Option A: Using Pre-Built Installer (Easiest)

If an installer has already been built with the fix:

1. **Close** Church Live Stream Studio (if running)
2. **Download/Copy** the installer file: `Church Live Stream Studio Setup 1.0.0.exe`
3. **Run** the installer
4. **Follow** the installation wizard
5. **Launch** the app — cameras will now be detected properly

### Option B: Build & Deploy from Source (For Developers)

#### Step 1: Update Source Code
The fix has already been applied to `electron/main.ts`. Verify the file contains the new camera detection methods.

#### Step 2: Build on Development PC
```powershell
# Navigate to project directory
cd D:\MyProjects\LiveStream\Live

# Install dependencies (if not already done)
npm install

# Build the app and create installer
npm run build

# Wait for completion (2-3 minutes)
# Installer will be created at: release/Church Live Stream Studio Setup 1.0.0.exe
```

#### Step 3: Copy to Target PC
1. Copy the `.exe` file from `release/` folder
2. Transfer via USB drive, email, cloud storage, or network share
3. On the target PC, double-click the `.exe` and follow installation wizard

#### Step 4: Test on Target PC
1. **Install** iVCam (or your virtual camera app) if not already installed
2. **Launch** Church Live Stream Studio
3. **Go to** Cameras panel (left side)
4. **Click** Refresh button (↺)
5. **Check** if iVCam appears in the camera list

---

## Manual Camera Addition (If Auto-Detection Fails)

If iVCam is running but still doesn't appear in auto-detection:

1. **Open** Church Live Stream Studio
2. **In Cameras panel**, look for **"Add Camera"** option
3. **Enter** camera details manually:
   - **Name**: `iVCam` (or your camera name)
   - **Device ID**: Copy from Windows Device Manager (see below)
4. **Click** Add → Camera appears in list

### Finding Device ID in Windows Device Manager:
```powershell
# Run in PowerShell as Administrator
devmgmt.msc
```
- Expand "Imaging devices" or "Sound, video and game controllers"
- Find iVCam
- Right-click → Properties → Details tab → Device instance path
- Copy the ID

---

## Troubleshooting

### Issue: iVCam Still Not Detected
**Solution**:
```powershell
# Check if iVCam is properly installed
Get-WmiObject Win32_Product | Where-Object {$_.Name -like '*ivcam*' -or $_.Name -like '*camera*'}

# Or check in Device Manager
devmgmt.msc
# Look under "Imaging devices"
```

### Issue: Camera Detected But Can't Access Stream
**Solution**:
- Grant camera permission in Windows:
  - Settings → Privacy & Security → Camera
  - Allow Church Live Stream Studio to access camera
- Restart the app

### Issue: Multiple Identical Cameras Showing
**Solution**:
- This is normal if a camera is detected via multiple methods
- Use the first one, ignore duplicates
- You can manually remove duplicates via the UI's remove button

### Check Detection Logs
For detailed debug info:
```powershell
# Open DevTools in the app (F12) → Console tab
# Look for messages starting with [Camera Detection]
# These show which detection methods succeeded/failed
```

---

## For IT Administrators: Batch Deployment

To deploy on multiple PCs:

### Via Group Policy / Config Management:
```powershell
# Create deployment package
New-Item -ItemType Directory -Path "\\networkshare\ChurchLiveStream"
Copy-Item "release\Church Live Stream Studio Setup 1.0.0.exe" "\\networkshare\ChurchLiveStream\"

# Deploy via GPO or SCCM using the .exe
# Users can also download from network share
```

### Via PowerShell Script (Silent Install):
```powershell
$installerPath = "\\networkshare\ChurchLiveStream\Church Live Stream Studio Setup 1.0.0.exe"
& $installerPath /S /D="C:\Program Files\Church Live Stream Studio"
```

---

## Verification Checklist

- [ ] New code contains expanded camera detection methods
- [ ] App builds successfully (`npm run build`)
- [ ] Installer created in `release/` folder
- [ ] Installer transferred to target PC
- [ ] Installer runs without errors
- [ ] App launches on target PC
- [ ] iVCam appears in camera list after refresh
- [ ] Camera stream works when selected

---

## Technical Details: What Changed

### Before (Limited Detection):
```powershell
# Only detected cameras with specific ClassGuid
Get-WmiObject Win32_PnPDevice -Filter "ClassGuid='{6994ad05-93d5-11d0-a43d-00a0c9223196}' AND Status='OK'"
```

### After (Enhanced Detection):
✅ Physical camera WMI query (unchanged)  
✅ Registry check for virtual camera software  
✅ Broad WMI query for 'camera', 'webcam', 'video', 'ivcam'  
✅ Get-PnpDevice with pattern matching  
✅ Browser MediaDevices API as fallback  
✅ Duplicate prevention via deviceId matching  

---

## Questions or Issues?

If camera detection still fails:

1. Run PowerShell diagnostic:
```powershell
powershell -NoProfile -Command "Get-WmiObject Win32_PnPDevice | Where-Object {$_.Name -match 'ivcam'} | Select-Object Name, Status"
```

2. Check Device Manager for device status
3. Verify virtual camera app is installed and running
4. Check app logs (F12 → Console)
5. Try restarting the app and clicking Refresh button
