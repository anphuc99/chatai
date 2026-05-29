import { useState } from 'react';
import './index.css';

type Device = 'iphone-14-pro' | 'iphone-se' | 'ipad-pro-11' | 'responsive';

function App() {
  const [device, setDevice] = useState<Device>('iphone-14-pro');
  const [isLandscape, setIsLandscape] = useState(false);
  const [expoUrl, setExpoUrl] = useState('http://localhost:8081');

  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDevice(e.target.value as Device);
    if (e.target.value === 'responsive') {
      setIsLandscape(false);
    }
  };

  const toggleOrientation = () => {
    setIsLandscape(!isLandscape);
  };

  const reloadIframe = () => {
    // Tricky way to reload iframe in React
    setExpoUrl(`http://localhost:8081?reload=${Date.now()}`);
  };

  return (
    <div className="app-container">
      {/* Topbar Controls */}
      <header className="topbar">
        <div className="topbar-brand">
          ChatAI • Device Previewer
        </div>
        
        <div className="controls">
          <select value={device} onChange={handleDeviceChange}>
            <option value="iphone-14-pro">iPhone 14 Pro</option>
            <option value="iphone-se">iPhone SE</option>
            <option value="ipad-pro-11">iPad Pro 11"</option>
            <option value="responsive">Responsive Web</option>
          </select>

          <button 
            onClick={toggleOrientation} 
            disabled={device === 'responsive'}
            className={isLandscape ? 'active' : ''}
            title="Toggle Landscape/Portrait"
          >
            {isLandscape ? 'Landscape' : 'Portrait'}
          </button>

          <button onClick={reloadIframe} title="Reload App">
            ↻ Reload
          </button>
        </div>
      </header>

      {/* Main Preview Area */}
      <main className="preview-area">
        <div 
          className={`device-frame device-${device} ${isLandscape ? 'landscape' : 'portrait'}`}
          style={
            device !== 'responsive' && isLandscape
              ? { width: 'auto', height: 'auto', flex: 0 } // Switch logic happens in CSS + JS sizing
              : {}
          }
        >
          {/* Dynamic Notch for supported devices */}
          <div className="notch"></div>
          
          <div 
            className="device-screen"
            style={
              isLandscape && device !== 'responsive' 
              ? {
                  // Switch width and height logically based on device class dimensions
                  // For simplicity, we can let CSS handle width/height if we toggle classes,
                  // or force inline styles for flipping.
                  // Easiest is to add a dynamic inline flip if needed, but we can do it via CSS logic.
                } 
              : {}
            }
          >
            <iframe 
              src={expoUrl} 
              title="Expo Web Preview" 
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
