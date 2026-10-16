import { CLIENT_CONFIG } from '../../config/client-config';

export const Diagnostics: React.FC = () => {
  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>PC Client Diagnostics</h1>
      <div style={{ border: '1px solid #ccc', padding: '10px' }}>
        <p>
          <strong>Status:</strong> <span style={{ color: 'orange' }}>PENDING_APPROVAL</span>
        </p>
        <p>
          <strong>Device ID:</strong> PENDING
        </p>
        <p>
          <strong>PC ID:</strong> UNASSIGNED
        </p>
        <p>
          <strong>Branch ID:</strong> UNASSIGNED
        </p>
        <hr />
        <p>
          <strong>Server URL:</strong> {CLIENT_CONFIG.API_BASE_URL}
        </p>
        <p>
          <strong>Last Heartbeat:</strong> ---
        </p>
        <p>
          <strong>Version:</strong> {CLIENT_CONFIG.VERSION}
        </p>
      </div>
    </div>
  );
};
