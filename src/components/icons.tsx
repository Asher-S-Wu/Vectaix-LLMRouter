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

export function PulseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 12h4l2-6 4 12 2-6h6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </IconBase>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </IconBase>
  );
}
