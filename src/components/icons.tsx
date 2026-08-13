import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20" {...props}>
      {children}
    </svg>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
    </IconBase>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="8.5" cy="11.5" r="4.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m12 14.5 2.1 2.1L16 14.7l1.7 1.7L21 13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </IconBase>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M19 13.7v-3.4l-2-.6a7 7 0 0 0-.7-1.6l1-1.8-2.4-2.4-1.8 1a7 7 0 0 0-1.7-.7L10.8 2H7.4l-.6 2.2a7 7 0 0 0-1.6.7l-1.9-1-2.4 2.4 1.1 1.8a7 7 0 0 0-.7 1.6l-2.2.6v3.4l2.2.6c.1.6.4 1.1.7 1.7l-1.1 1.8 2.4 2.4 1.9-1c.5.3 1 .5 1.6.7l.6 2.1h3.4l.6-2.1c.6-.2 1.2-.4 1.7-.7l1.8 1 2.4-2.4-1-1.8c.3-.6.6-1.1.7-1.7l2-.6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25" transform="translate(3 0) scale(.75)" />
    </IconBase>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </IconBase>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="11" rx="1" stroke="currentColor" strokeWidth="1.5" width="11" x="8" y="8" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.5" />
    </IconBase>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3 5 5.8v5.4c0 4.3 2.9 7.5 7 9 4.1-1.5 7-4.7 7-9V5.8L12 3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="m9.2 11.6 2 2 3.6-3.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </IconBase>
  );
}

export function ZapIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
    </IconBase>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 4l16 16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      <path d="M10.6 5.2A9.9 9.9 0 0 1 12 5c5 0 8.5 3.5 10 7-.4 1-1.1 2-2 2.9M6.6 6.9C4.6 8.1 3.2 9.9 2 12c1.5 3.5 5 7 10 7 1.4 0 2.7-.3 3.9-.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </IconBase>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.5 19.5c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      <path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18.6 14.9c1.7.8 2.8 2.3 3.2 4.3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </IconBase>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M5 19.5A1.5 1.5 0 0 1 6.5 18H19v3H6.5A1.5 1.5 0 0 1 5 19.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
    </IconBase>
  );
}

export function TerminalIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="16" rx="2" stroke="currentColor" strokeWidth="1.6" width="19" x="2.5" y="4" />
      <path d="m7 9 3 3-3 3M12.5 15H17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </IconBase>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 2.8v2M12 19.2v2M4.7 4.7l1.4 1.4M17.9 17.9l1.4 1.4M2.8 12h2M19.2 12h2M4.7 19.3l1.4-1.4M17.9 6.1l1.4-1.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </IconBase>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M20 14.4A8.2 8.2 0 0 1 9.6 4 8.2 8.2 0 1 0 20 14.4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
    </IconBase>
  );
}

export function MonitorIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="12" rx="1.5" stroke="currentColor" strokeWidth="1.6" width="18" x="3" y="4" />
      <path d="M9 20h6M12 16v4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </IconBase>
  );
}
