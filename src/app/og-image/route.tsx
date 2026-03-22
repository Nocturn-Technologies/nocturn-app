import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#09090B', color: 'white', fontFamily: 'sans-serif'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <span style={{ fontSize: 80 }}>🌙</span>
          <span style={{ fontSize: 72, fontWeight: 800, color: 'white' }}>
            noctur<span style={{ color: '#A855F7' }}>n</span>
          </span>
        </div>
        <div style={{ fontSize: 28, color: '#a1a1aa' }}>
          The Agentic Work OS for Nightlife
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
