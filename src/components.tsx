import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { Illustration, type IllustrationKind } from './Illustration';

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    const previous = document.activeElement as HTMLElement;
    return () => {
      element.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-inner">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="关闭" title="关闭" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function Empty({
  title,
  detail,
  action,
  onAction,
  illustration = 'search',
}: {
  title: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
  illustration?: IllustrationKind;
}) {
  return (
    <div className="empty">
      <Illustration kind={illustration} size="empty" />
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
      {action && (
        <button className="btn btn-secondary" onClick={onAction}>
          {action}
          <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}

export function PageHeading({
  title,
  subtitle,
  children,
  illustration,
}: {
  title: string;
  subtitle: string;
  children?: ReactNode;
  illustration?: IllustrationKind;
}) {
  return (
    <div className="page-heading">
      <div className="page-heading-main">
        {illustration && <Illustration kind={illustration} priority />}
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}

export function Skeleton() {
  return (
    <div className="loading-skeleton" aria-label="正在加载学习空间" aria-busy="true">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-stat" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="skeleton skeleton-row" />
      ))}
    </div>
  );
}
