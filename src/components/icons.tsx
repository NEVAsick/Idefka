import type { ReactNode } from 'react';

function Glyph({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const glyph = (children: ReactNode, size?: number) => () => <Glyph size={size}>{children}</Glyph>;

export const Icon = {
  select: glyph(<path d="M5 3.5l13 7.2-5.6 1.6-2.5 5.4z" />),
  arrow: glyph(
    <>
      <path d="M3 17h7V7h9" />
      <path d="M16 4l3 3-3 3" />
    </>,
  ),
  hand: glyph(
    <path d="M8 12V5.5a1.5 1.5 0 013 0V11m0-6.5a1.5 1.5 0 013 0V11m0-5a1.5 1.5 0 013 0v7c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4l-2-3.5a1.4 1.4 0 012.3-1.6L8 13" />,
  ),
  undo: glyph(
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 010 12h-3" />
    </>,
  ),
  redo: glyph(
    <>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H10a6 6 0 000 12h3" />
    </>,
  ),
  plus: glyph(<path d="M12 5v14M5 12h14" />),
  minus: glyph(<path d="M5 12h14" />),
  down: glyph(
    <>
      <rect x="4" y="3.5" width="9" height="6" rx="1" />
      <path d="M8.5 9.5v4.5h4" />
      <rect x="13" y="11" width="7" height="6" rx="1" />
      <path d="M16.5 17v3.5" />
    </>,
  ),
  up: glyph(<path d="M12 19V5M6 11l6-6 6 6" />),
  trash: glyph(<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5" />),
  branch: glyph(<path d="M4 12h7m0 0l5-5h4m-9 5l5 5h4" />),
  sun: glyph(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>,
  ),
  moon: glyph(<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />),
  auto: glyph(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17A8.5 8.5 0 0012 3.5z" fill="currentColor" />
    </>,
  ),
  grid: glyph(<path d="M5 5h.01M12 5h.01M19 5h.01M5 12h.01M12 12h.01M19 12h.01M5 19h.01M12 19h.01M19 19h.01" strokeWidth={2.6} />),
  frame: glyph(
    <>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M3 8h18M3 16.5h18M8 16.5V20" />
    </>,
  ),
  warn: glyph(
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4.5M12 17.5h.01" />
    </>,
    16,
  ),
  check: glyph(<path d="M5 12.5l4.5 4.5L19 7.5" />, 16),
  chevron: glyph(<path d="M9 6l6 6-6 6" />, 14),
  close: glyph(<path d="M6 6l12 12M18 6L6 18" />, 16),
  money: glyph(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.5 8.5h-3.5a2 2 0 000 4h2a2 2 0 010 4H9.5M12 6.5v2M12 16.5v2" />
    </>,
  ),
  table: glyph(
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" />
    </>,
  ),
  install: glyph(<path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14" />),
};

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x="8" y="9" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M1.5 16H8" stroke="var(--icom-i)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M16 1.5V9" stroke="var(--icom-c)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M24 16h6.5" stroke="var(--icom-o)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M16 30.5V23" stroke="var(--icom-m)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

const ROUNDED_BOX = <rect x="3.5" y="6" width="17" height="12" rx="3.5" />;

const PLAIN_BOX = (
  <>
    <rect x="3.5" y="6" width="17" height="12" rx="1" />
    <path d="M3.5 9.5L7 6" />
  </>
);

const ACTOR = (
  <>
    <circle cx="12" cy="5.5" r="2.3" />
    <path d="M12 7.8v7M7 10.5h10M12 14.8l-4 5.2M12 14.8l4 5.2" />
  </>
);

const COMPARTMENTS = (
  <>
    <rect x="4" y="4" width="16" height="16" rx="1" />
    <path d="M4 9h16M4 14.5h16" />
  </>
);

const NODE_3D = <path d="M3.5 8.5h13v11h-13zM3.5 8.5l3.5-4h13.5l-4 4M20.5 4.5v11l-4 4" />;

const KIND_ICONS: Record<string, ReactNode> = {
  process: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="3.5" />
      <path d="M3.5 9h17" />
    </>
  ),
  external: (
    <>
      <rect x="3.5" y="5.5" width="14" height="11" />
      <path d="M17.5 8.5h3v11h-14v-3" />
    </>
  ),
  store: <path d="M21 7H3v10h18M8 7v10" />,
  uow: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1" />
      <path d="M3.5 14.5h17M10 14.5v4" />
    </>
  ),
  junction: (
    <>
      <rect x="8" y="3.5" width="8" height="17" />
      <path d="M10.5 10l3 4M13.5 10l-3 4" />
    </>
  ),
  referent: (
    <>
      <rect x="3.5" y="7.5" width="17" height="9" />
      <path d="M7 12h10" strokeDasharray="2 2" />
    </>
  ),
  task: ROUNDED_BOX,
  startEvent: <circle cx="12" cy="12" r="7.5" />,
  intermediateEvent: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="5" />
    </>
  ),
  endEvent: <circle cx="12" cy="12" r="7" strokeWidth={3.2} />,
  gateway: (
    <>
      <path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z" />
      <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
    </>
  ),
  dataObject: (
    <>
      <path d="M6.5 3.5h7.5l3.5 3.5v13.5h-11z" />
      <path d="M14 3.5V7h3.5" />
    </>
  ),
  dataStore: (
    <>
      <ellipse cx="12" cy="6.5" rx="7" ry="2.5" />
      <path d="M5 6.5v11c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-11" />
    </>
  ),
  annotation: <path d="M8 5H5v14h3M9 9.5h9M9 14.5h6" />,
  pool: (
    <>
      <rect x="3" y="6" width="18" height="12" />
      <path d="M7 6v12" />
    </>
  ),
  lane: (
    <>
      <rect x="3" y="5" width="18" height="14" />
      <path d="M6.5 5v14M6.5 12H21" />
    </>
  ),
  text: <path d="M5 6.5V5h14v1.5M12 5v14M9.5 19h5" />,

  epcEvent: <path d="M6.5 6.5h11L21 12l-3.5 5.5h-11L3 12z" />,
  epcFunction: ROUNDED_BOX,
  epcConnector: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 14.5L12 8.5l3.5 6" />
    </>
  ),
  orgUnit: (
    <>
      <ellipse cx="12" cy="12" rx="9" ry="6" />
      <path d="M6 7.6v8.8" />
    </>
  ),
  infoObject: (
    <>
      <rect x="3.5" y="6.5" width="17" height="11" />
      <path d="M6.5 6.5v11M17.5 6.5v11" />
    </>
  ),
  epcDocument: <path d="M4 5h16v11c-2.7-2-5.3 1.6-8 0s-5.3-2-8 0z" />,
  appSystem: (
    <>
      <rect x="3.5" y="6.5" width="17" height="11" />
      <path d="M6.5 6.5v11M8.5 6.5v11" />
    </>
  ),

  umlNote: (
    <>
      <path d="M4 4.5h11.5L20 9v10.5H4z" />
      <path d="M15.5 4.5V9H20" />
    </>
  ),
  actor: ACTOR,
  actorLine: ACTOR,
  useCase: <ellipse cx="12" cy="12" rx="9" ry="5.5" />,
  systemBoundary: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1" />
      <path d="M8 7h8" />
    </>
  ),
  class: COMPARTMENTS,
  entity: COMPARTMENTS,
  interface: (
    <>
      <circle cx="12" cy="7" r="3.2" />
      <path d="M12 10.2V20M8 20h8" />
    </>
  ),
  enumeration: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M4 9h16M7.5 13h6M7.5 16.5h6" />
    </>
  ),
  lifeline: (
    <>
      <rect x="5" y="3" width="14" height="6" rx="1" />
      <path d="M12 9v12" strokeDasharray="2.2 2.2" />
    </>
  ),
  activation: (
    <>
      <path d="M12 2.5v3M12 18.5v3" strokeDasharray="2 2" />
      <rect x="9.5" y="5.5" width="5" height="13" />
    </>
  ),
  fragment: (
    <>
      <rect x="3" y="4.5" width="18" height="15" />
      <path d="M3 9.5h6.5l1.5-1.6V4.5" />
    </>
  ),
  action: <rect x="3.5" y="6.5" width="17" height="11" rx="5" />,
  initialNode: <circle cx="12" cy="12" r="6" fill="currentColor" />,
  finalNode: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="4" fill="currentColor" />
    </>
  ),
  flowFinal: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M7 7l10 10M17 7L7 17" />
    </>
  ),
  decision: <path d="M12 3.5L20.5 12 12 20.5 3.5 12z" />,
  forkBar: <rect x="3.5" y="10.5" width="17" height="3" rx="0.8" fill="currentColor" />,
  objectNode: <rect x="3.5" y="7" width="17" height="10" />,
  partition: (
    <>
      <rect x="4" y="3.5" width="16" height="17" />
      <path d="M4 7.5h16M12 3.5v17" />
    </>
  ),
  deployNode: NODE_3D,
  device: NODE_3D,
  component: (
    <>
      <rect x="6.5" y="4.5" width="13" height="15" />
      <path d="M4 8h5v3H4zM4 13h5v3H4z" />
    </>
  ),
  artifact: (
    <>
      <path d="M6 3.5h8.5L19 8v12.5H6z" />
      <path d="M14.5 3.5V8H19" />
    </>
  ),
};

export function KindIcon({ kind }: { kind: string }) {
  return <Glyph>{KIND_ICONS[kind] ?? PLAIN_BOX}</Glyph>;
}
