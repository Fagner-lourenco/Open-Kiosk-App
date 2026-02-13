import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './services/esp32CommunicationService'

createRoot(document.getElementById("root")!).render(<App />);
