import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props
});

export function IconReceive(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 8 L12 3 L20 8 L20 19 L4 19 Z" />
      <path d="M4 8 L12 13 L20 8" />
      <path d="M12 13 L12 19" />
    </svg>
  );
}

export function IconClean(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8" />
      <path d="M8 12 a4 4 0 0 1 8 0" />
      <path d="M12 8 L12 4" />
      <path d="M9 5 L7 3 M15 5 L17 3" />
    </svg>
  );
}

export function IconFiber(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 6 Q 8 10 3 14 Q 8 18 3 21" />
      <path d="M21 6 Q 16 10 21 14 Q 16 18 21 21" />
      <path d="M9 4 L15 4 M9 20 L15 20" />
    </svg>
  );
}

export function IconSpin(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3 L12 6 M21 12 L18 12 M12 21 L12 18 M3 12 L6 12" />
      <circle cx="12" cy="12" r="2.4" />
    </svg>
  );
}

export function IconQC(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 3 L9 8 L5 17 a2 2 0 0 0 2 3 L17 20 a2 2 0 0 0 2-3 L15 8 L15 3" />
      <path d="M7 3 L17 3" />
      <path d="M7.5 15 L16.5 15" />
    </svg>
  );
}

export function IconYarn(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4 a8 8 0 0 1 0 16" />
      <path d="M12 7 a5 5 0 0 1 0 10" />
      <path d="M12 10 a2 2 0 0 1 0 4" />
    </svg>
  );
}

export function IconLeaf(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 20 C 4 10 12 4 21 4 C 21 13 15 20 4 20 Z" />
      <path d="M4 20 L14 10" />
    </svg>
  );
}

export function IconDrop(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3 C 12 3 5 12 5 16 a7 7 0 0 0 14 0 C 19 12 12 3 12 3 Z" />
    </svg>
  );
}

export function IconBolt(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13 2 L4 14 L11 14 L11 22 L20 10 L13 10 Z" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3 L19 6 L19 12 C19 17 16 20 12 21 C 8 20 5 17 5 12 L5 6 Z" />
      <path d="M8.5 12 L11 14.5 L15.5 9.5" />
    </svg>
  );
}

export function IconFlask(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 3 L9 9 L4 18 a2 2 0 0 0 2 3 L18 21 a2 2 0 0 0 2-3 L15 9 L15 3" />
      <path d="M7 3 L17 3" />
      <circle cx="14" cy="15" r="1" fill="currentColor" />
      <circle cx="10.5" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconRuler(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="9" width="18" height="6" rx="1" />
      <path d="M7 9 L7 12 M11 9 L11 13 M15 9 L15 12" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5 L11 15.5 L16 9" />
    </svg>
  );
}

export function IconShip(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 15 L20 15 L18 20 L6 20 Z" />
      <path d="M7 15 L7 5 L14 5 L14 15" />
      <path d="M17 8 L20 15" />
      <path d="M4 15 L2 12" />
    </svg>
  );
}

export function IconPhone(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6.6 10.8c1.4 2.7 3.6 4.9 6.3 6.3l2.1-2.1c.3-.3.7-.4 1.1-.2 1.2.4 2.5.6 3.9.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C11.7 21 3 12.3 3 2.9 3 2.4 3.4 2 4 2h3.6c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.9.1.4 0 .8-.2 1.1l-2.4 2.8Z" />
    </svg>
  );
}

export function IconTelegram(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="10" fill="#29A9EA" />
      <path
        d="M17.4 7.3 6.9 11.4c-.5.2-.5.5 0 .6l2.7.9 1 3.4c.1.4.3.4.6.1l1.5-1.4 2.9 2.1c.5.3.9.1 1-.5l1.9-8.5c.2-.7-.2-1-.9-.8Z"
        fill="#fff"
      />
    </svg>
  );
}

export function IconWhatsApp(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="10" fill="#25D366" />
      <path
        d="M12 6.5a5.5 5.5 0 0 0-4.7 8.4l-.8 2.9 3-.8A5.5 5.5 0 1 0 12 6.5Zm3.2 7.4c-.1.4-.8.7-1.1.8-.3.1-.6.2-2-.5-1.7-.8-2.7-2.5-2.8-2.6-.1-.1-.7-.9-.7-1.8s.4-1.2.6-1.4c.1-.1.3-.2.5-.2h.4c.1 0 .3 0 .4.3.2.4.5 1.3.6 1.4 0 .1.1.2 0 .4-.1.2-.1.2-.2.4-.1.1-.2.3-.3.4-.1.1-.2.2-.1.4.1.2.5.9 1.1 1.4.7.6 1.3.8 1.5.9.2.1.3.1.4-.1.1-.1.5-.6.6-.8.1-.2.3-.2.4-.1.2.1 1.1.6 1.3.7.2.1.3.1.4.2 0 .2 0 .5-.1.9Z"
        fill="#fff"
      />
    </svg>
  );
}
